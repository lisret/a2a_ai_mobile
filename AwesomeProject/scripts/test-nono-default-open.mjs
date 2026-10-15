import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAvatarAnimation} from '../src/features/task/avatar/AvatarAnimation.mjs';
async function load() {
  const b = await fs.readFile(
    new URL('../src/features/task/avatar/nono-detached.glb', import.meta.url),
  );
  return new GLTFLoader().parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    '',
  );
}
function expectOpen(scene) {
  for (const name of [
    'UpperWingLeft',
    'UpperWingRight',
    'LowerWingLeft',
    'LowerWingRight',
  ]) {
    const q = scene.getObjectByName(name).parent.quaternion.clone().normalize();
    const degrees = T.MathUtils.radToDeg(q.angleTo(new T.Quaternion()));
    assert.ok(
      Math.abs(degrees - (name.startsWith('Upper') ? 95 : 80)) < 0.001,
      `${name}: ${degrees}`,
    );
  }
}
test('initial model and reduced-motion default are fully open at 95 / 80', async () => {
  const g = await load();
  expectOpen(g.scene);
  const player = createAvatarAnimation(T, g.scene, g.animations, {
    reducedMotion: true,
  });
  player.setMood('shy');
  player.update(2);
  expectOpen(g.scene);
  player.dispose();
});
test('all expressions start and finish fully open; idle, listening, sleep and spin keep the default', async () => {
  const g = await load(),
    mixer = new T.AnimationMixer(g.scene);
  for (const clip of g.animations.filter(c => c.name !== 'fold')) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset().setLoop(T.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    mixer.setTime(0);
    expectOpen(g.scene);
    if (
      ['idle', 'listen', 'thinking', 'sleepy', 'spin', 'unfold'].includes(
        clip.name,
      )
    ) {
      for (const fraction of [0.2, 0.5, 0.8]) {
        mixer.setTime(clip.duration * fraction);
        expectOpen(g.scene);
      }
    }
    mixer.setTime(clip.duration);
    expectOpen(g.scene);
  }
});
