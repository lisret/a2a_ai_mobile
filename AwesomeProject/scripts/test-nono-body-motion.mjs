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
test('spin really completes a continuous full turn of shell, face and wings together', async () => {
  const g = await load(),
    clip = g.animations.find(c => c.name === 'spin');
  assert.ok(clip, 'spin clip is bundled');
  const head = g.scene.getObjectByName('Head');
  for (const name of [
    'RearHousing100',
    'TransparentDome100',
    'EyeLeft',
    'SmileMouth',
    'UpperWingLeft',
  ]) {
    let ancestor = g.scene.getObjectByName(name);
    while (ancestor && ancestor !== head) ancestor = ancestor.parent;
    assert.equal(ancestor, head, `${name} moves with the body`);
  }
  const mixer = new T.AnimationMixer(g.scene);
  mixer.clipAction(clip).setLoop(T.LoopOnce, 1).play();
  let previous = 0,
    total = 0;
  for (let i = 0; i <= 128; i++) {
    mixer.setTime((clip.duration * i) / 128);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(head.quaternion);
    const yaw = Math.atan2(forward.x, forward.z);
    const delta = Math.atan2(
      Math.sin(yaw - previous),
      Math.cos(yaw - previous),
    );
    assert.ok(delta >= -1e-5 && delta < 0.15, 'turn stays forward and smooth');
    total += delta;
    previous = yaw;
  }
  assert.ok(Math.abs(total - 2 * Math.PI) < 1e-4, `full turn, got ${total}`);
  assert.ok(
    head.quaternion.angleTo(new T.Quaternion()) < 0.001,
    'ends facing original direction',
  );
});
test('happy, shy, surprised and dance combine body movement with distinct face poses', async () => {
  const g = await load(),
    mixer = new T.AnimationMixer(g.scene),
    head = g.scene.getObjectByName('Head');
  const rotations = new Set();
  for (const mood of ['happy', 'shy', 'surprised', 'dance']) {
    const clip = g.animations.find(c => c.name === mood);
    assert.ok(clip);
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    mixer.setTime(clip.duration * 0.35);
    assert.ok(
      head.quaternion.angleTo(new T.Quaternion()) > 0.08,
      `${mood}: visible whole-body rotation`,
    );
    rotations.add(
      head.quaternion
        .toArray()
        .map(n => n.toFixed(2))
        .join(','),
    );
    if (mood === 'shy') assert.ok(head.scale.y < 0.96, 'shy gently tucks in');
    if (mood === 'surprised')
      assert.ok(head.position.z < -0.1, 'surprise recoils');
  }
  assert.equal(rotations.size, 4);
});
test('gestures return to breathing idle without changing the user viewing angle; reduced motion stays still', async () => {
  const g = await load(),
    orbit = new T.Group();
  orbit.rotation.set(0.2, 0.8, 0);
  orbit.add(g.scene);
  const view = orbit.quaternion.clone(),
    player = createAvatarAnimation(T, g.scene, g.animations);
  for (const mood of ['spin', 'dance']) {
    player.setMood(mood);
    assert.equal(player.currentMood, mood);
    for (let i = 0; i < 100; i++) player.update(0.05);
    assert.equal(player.currentMood, 'idle');
    assert.ok(orbit.quaternion.angleTo(view) < 1e-6);
    assert.ok(
      g.scene.getObjectByName('Head').quaternion.angleTo(new T.Quaternion()) <
        0.001,
    );
  }
  player.dispose();
  const quiet = createAvatarAnimation(T, g.scene, g.animations, {
    reducedMotion: true,
  });
  quiet.setMood('spin');
  quiet.update(1);
  assert.equal(quiet.currentMood, 'idle');
  assert.equal(quiet.currentTime, 0);
  quiet.dispose();
});
