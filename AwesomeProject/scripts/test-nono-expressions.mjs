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
test('appearance asset contains no electronics, camera assemblies, screen board, ports or dock', async () => {
  const g = await load();
  g.scene.traverse(o =>
    assert.equal(o.userData.part, undefined, `hardware part ${o.name}`),
  );
  assert.ok(g.scene.getObjectByName('FaceDisplay'));
  assert.ok(g.scene.getObjectByName('SmileMouth'));
});
test('full opening is exactly upper 95 / lower 80 degrees and all clips stay inside these limits', async () => {
  const g = await load();
  assert.ok(g.animations.find(c => c.name === 'unfold'));
  const mixer = new T.AnimationMixer(g.scene);
  const wingNames = [
    'UpperWingLeft',
    'UpperWingRight',
    'LowerWingLeft',
    'LowerWingRight',
  ];
  for (const clip of g.animations) {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    for (let i = 0; i < 40; i++) {
      mixer.setTime((clip.duration * i) / 40);
      for (const name of wingNames) {
        const max = name.startsWith('Upper') ? 95 : 80;
        const q = g.scene
          .getObjectByName(name)
          .parent.quaternion.clone()
          .normalize();
        const degrees = (q.angleTo(new T.Quaternion()) * 180) / Math.PI;
        assert.ok(
          degrees <= max + 0.001,
          `${clip.name} ${name} exceeds ${max}: ${degrees}`,
        );
        if (clip.name === 'unfold') assert.ok(Math.abs(degrees - max) < 0.001);
        if (clip.name === 'fold') assert.ok(degrees < 0.001);
      }
    }
  }
});
test('idle has a seamless breathing cycle and reduced motion does not advance it', async () => {
  const g = await load(),
    idle = g.animations.find(c => c.name === 'idle');
  const scale = idle.tracks.find(t => t.name === 'Head.scale');
  assert.ok(scale, 'breathing scale track');
  assert.ok(Math.max(...scale.values) - Math.min(...scale.values) >= 0.015);
  assert.ok(
    Math.max(...scale.values) < 1.04 && Math.min(...scale.values) > 0.96,
  );
  for (const t of idle.tracks) {
    const stride = t.getValueSize();
    for (let i = 0; i < stride; i++)
      assert.ok(
        Math.abs(t.values[i] - t.values[t.values.length - stride + i]) < 1e-5,
        `${t.name} loop seam`,
      );
  }
  const player = createAvatarAnimation(T, g.scene, g.animations, {
    reducedMotion: true,
  });
  player.update(2);
  assert.equal(player.currentTime, 0);
  player.dispose();
});
test('new expressions are distinct and gestures return to idle while fold poses hold', async () => {
  const g = await load();
  const player = createAvatarAnimation(T, g.scene, g.animations);
  for (const mood of ['wink', 'surprised', 'shy', 'laugh', 'stretch', 'peek']) {
    assert.ok(g.animations.find(c => c.name === mood));
    player.setMood(mood);
    assert.equal(player.currentMood, mood);
    for (let i = 0; i < 150; i++) player.update(0.05);
    assert.equal(player.currentMood, 'idle');
  }
  for (const mood of ['unfold', 'fold']) {
    player.setMood(mood);
    for (let i = 0; i < 150; i++) player.update(0.05);
    assert.equal(player.currentMood, mood);
  }
  player.dispose();
  const mixer = new T.AnimationMixer(g.scene);
  mixer.clipAction(g.animations.find(c => c.name === 'wink')).play();
  mixer.setTime(1.2);
  assert.ok(
    g.scene.getObjectByName('EyeLeft').scale.z <
      g.scene.getObjectByName('EyeRight').scale.z * 0.4,
  );
});
