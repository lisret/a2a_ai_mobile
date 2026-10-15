import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAvatarAnimation} from '../src/features/task/avatar/AvatarAnimation.mjs';
import {createPetDirector} from '../src/features/task/avatar/AvatarPet.mjs';
const seed = n => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296;
async function avatar(options = {}) {
  const b = await fs.readFile(
    new URL('../src/features/task/avatar/nono-detached.glb', import.meta.url),
  );
  const g = await new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    '',
  );
  return {
    ...g,
    player: createAvatarAnimation(T, g.scene, g.animations, {
      autonomous: true,
      random: seed(9),
      ...options,
    }),
  };
}
test('idle wings breathe out of phase within rigid hinge limits and keep inlays synchronized', async () => {
  const {scene, player} = await avatar();
  const upper = [],
    lower = [];
  for (let i = 0; i < 100; i++) {
    player.update(0.05);
    for (const side of ['Left', 'Right'])
      for (const kind of ['Upper', 'Lower']) {
        const wing = scene.getObjectByName(`${kind}Wing${side}`),
          pivot = wing.parent;
        const angle = T.MathUtils.radToDeg(
          pivot.quaternion.angleTo(new T.Quaternion()),
        );
        assert.ok(angle <= (kind === 'Upper' ? 95 : 80) + 0.001);
        assert.ok(angle >= (kind === 'Upper' ? 85 : 70));
        assert.ok(
          pivot.quaternion.angleTo(
            scene.getObjectByName(`${kind}WingInlay${side}`).parent.quaternion,
          ) < 0.001,
        );
        assert.equal(wing.scale.x, 1);
        if (side === 'Left') (kind === 'Upper' ? upper : lower).push(angle);
      }
  }
  assert.ok(
    Math.max(...upper) - Math.min(...upper) > 2,
    'upper wings must breathe',
  );
  assert.ok(
    Math.max(...lower) - Math.min(...lower) > 2,
    'lower wings must breathe',
  );
  assert.ok(upper.some((v, i) => Math.abs(95 - v - (80 - lower[i])) > 0.5));
  player.dispose();
});
test('autonomous actions vary, avoid consecutive repeats and give rare actions a cooldown', async () => {
  const {player} = await avatar();
  const seen = [];
  let previous = 'idle',
    lastRare = -1000;
  for (let i = 0; i < 12000; i++) {
    if (i % 1000 === 0) player.interact();
    player.update(0.05);
    const mood = player.currentMood;
    if (mood !== 'idle' && mood !== previous) {
      assert.notEqual(mood, seen.at(-1));
      seen.push(mood);
      if (['dance', 'spin'].includes(mood)) {
        assert.ok(i * 0.05 - lastRare >= 90);
        lastRare = i * 0.05;
      }
    }
    previous = mood;
  }
  assert.ok(seen.length > 12);
  assert.ok(new Set(seen).size >= 4);
  player.dispose();
});
test('conversation and manual holds outrank autonomy; reduced motion and disposal stop motion', async () => {
  const {player, scene} = await avatar();
  for (const mood of ['listen', 'thinking', 'fold', 'unfold']) {
    player.setMood(mood);
    for (let i = 0; i < 1200; i++) player.update(0.05);
    assert.equal(player.currentMood, mood);
  }
  player.setMood('idle');
  player.interact();
  player.setMood('listen');
  assert.equal(player.currentMood, 'listen');
  player.setReducedMotion(true);
  const before = scene
    .getObjectByName('UpperWingLeft')
    .parent.quaternion.clone();
  for (let i = 0; i < 3000; i++) player.update(0.05);
  assert.equal(player.currentMood, 'idle');
  assert.equal(player.currentTime, 0);
  assert.ok(
    before.angleTo(scene.getObjectByName('UpperWingLeft').parent.quaternion) <
      0.001,
  );
  player.dispose();
  player.update(10);
  assert.equal(player.currentTime, 0);
});
test('AI requests are infrequent and idle-only; unknown temperament and reduced motion are safe', async () => {
  const requests = [];
  const {player} = await avatar({onIntentRequest: c => requests.push(c)});
  for (let i = 0; i < 10000; i++) player.update(0.05);
  assert.ok(requests.length >= 2 && requests.length <= 5);
  assert.ok(
    requests.every(c =>
      ['calm', 'curious', 'playful', 'sleepy'].includes(c.temperament),
    ),
  );
  const count = requests.length;
  player.setMood('listen');
  for (let i = 0; i < 3000; i++) player.update(0.05);
  assert.equal(requests.length, count);
  assert.equal(player.setTemperament('executeCode'), false);
  assert.equal(player.setTemperament('curious'), true);
  player.setReducedMotion(true);
  player.setMood('idle');
  for (let i = 0; i < 3000; i++) player.update(0.05);
  assert.equal(requests.length, count);
  player.dispose();
});

test('local attention decays after interaction and seeds reproduce behavior', () => {
  const a = createPetDirector({random: seed(3)}),
    b = createPetDirector({random: seed(3)});
  assert.equal(a.context.idleSeconds, 0);
  assert.equal(a.context.temperament, 'calm');
  a.interact();
  b.interact();
  assert.equal(a.context.temperament, 'playful');
  for (let i = 0; i < 260; i++) assert.equal(a.update(0.1), b.update(0.1));
  assert.equal(a.context.temperament, 'curious');
  for (let i = 0; i < 350; i++) a.update(0.1);
  assert.equal(a.context.temperament, 'calm');
  for (let i = 0; i < 920; i++) a.update(0.1);
  assert.equal(a.context.temperament, 'sleepy');
  a.setTemperament('curious');
  assert.equal(a.context.temperament, 'curious');
  for (let i = 0; i < 1210; i++) a.update(0.1);
  assert.equal(a.context.temperament, 'sleepy');
});
test('held drag prevents autonomy and nonfinite time never corrupts animation', async () => {
  const {player} = await avatar();
  player.setInteractionHeld(true);
  for (let i = 0; i < 1800; i++) player.update(0.05);
  assert.equal(player.currentMood, 'idle');
  const before = player.currentTime;
  for (const dt of [NaN, Infinity, -1]) player.update(dt);
  assert.equal(player.currentTime, before);
  player.setInteractionHeld(false);
  const moods = new Set();
  for (let i = 0; i < 1800; i++) {
    player.update(0.05);
    moods.add(player.currentMood);
  }
  assert.ok(moods.size > 1);
  player.dispose();
});

test('conversation time is not idle time and AI waits for visible idle time', async () => {
  const requests = [];
  const {player} = await avatar({
    onIntentRequest: context => requests.push(context),
  });
  player.setMood('listen');
  for (let i = 0; i < 4000; i++) player.update(0.05);
  player.setMood('idle');
  player.update(0.05);
  assert.equal(
    requests.length,
    0,
    'conversation must not consume the first idle delay',
  );
  for (let i = 0; i < 1500; i++) player.update(0.05);
  assert.ok(requests.length > 0);
  assert.ok(
    requests[0].idleSeconds < 75,
    'reported idle age must exclude conversation',
  );
  assert.notEqual(
    requests[0].temperament,
    'sleepy',
    'recent conversation keeps the pet attentive',
  );
  player.dispose();
});
