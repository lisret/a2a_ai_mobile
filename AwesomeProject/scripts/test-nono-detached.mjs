import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAvatarAnimation} from '../src/features/task/avatar/AvatarAnimation.mjs';

async function load() {
  const data = await fs.readFile(
    new URL('../src/features/task/avatar/nono-detached.glb', import.meta.url),
  );
  assert.ok(data.length < 3 * 1024 * 1024, 'mobile asset stays below 3 MiB');
  return new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    '',
  );
}
test('bundled avatar uses the approved black/clear sphere without its separate dock', async () => {
  const {scene, animations} = await load();
  assert.ok(scene.getObjectByName('NoNoDetached'));
  assert.ok(scene.getObjectByName('RearHalfSeamBezel'));
  const rear = scene.getObjectByName('RearHousing100');
  const front = scene.getObjectByName('TransparentDome100');
  assert.ok(rear.material.color.r < 0.03);
  assert.equal(front.material.transmission, 1);
  const rp = rear.geometry.attributes.position,
    fp = front.geometry.attributes.position;
  for (let i = 0; i < rp.count; i++)
    assert.ok(
      rp.getY(i) >= -1e-4,
      'black hemisphere stays behind the center plane',
    );
  for (let i = 0; i < fp.count; i++)
    assert.ok(fp.getY(i) <= 1e-4, 'clear hemisphere stays in front');
  scene.traverse(o => assert.notEqual(o.userData.part, 'dock'));
  assert.deepEqual(
    animations.map(c => c.name).sort(),
    [
      'idle',
      'listen',
      'thinking',
      'confirm',
      'success',
      'error',
      'wave',
      'happy',
      'sleepy',
      'curious',
      'wink',
      'surprised',
      'shy',
      'laugh',
      'stretch',
      'peek',
      'unfold',
      'fold',
      'spin',
      'dance',
    ].sort(),
  );
  scene.updateMatrixWorld(true);
  const size = new T.Box3().setFromObject(front).getSize(new T.Vector3());
  assert.ok(size.x > 1.98 && size.x < 2.01);
  assert.ok(size.y > 1.97 && size.y < 2.01, 'upright front hemisphere');
});
test('waving moves real rigid wings around the original fixed hinges with synchronized inlays', async () => {
  const {scene, animations} = await load();
  const wing = scene.getObjectByName('LowerWingLeft');
  const pivot = wing.parent;
  const hinge = pivot.position.clone();
  scene.updateMatrixWorld(true);
  const p = new T.Vector3().fromBufferAttribute(
    wing.geometry.attributes.position,
    0,
  );
  const before = wing.localToWorld(p.clone());
  const player = createAvatarAnimation(T, scene, animations);
  player.setMood('wave');
  player.update(0.7);
  scene.updateMatrixWorld(true);
  assert.ok(before.distanceTo(wing.localToWorld(p.clone())) > 0.05);
  assert.ok(pivot.position.distanceTo(hinge) < 1e-8);
  assert.ok(
    pivot.quaternion
      .clone()
      .normalize()
      .angleTo(
        scene
          .getObjectByName('LowerWingInlayLeft')
          .parent.quaternion.clone()
          .normalize(),
      ) < 1e-7,
  );
  assert.equal(wing.scale.x, 1, 'rigid wing must not shrink');
  player.dispose();
});
test('sleeping eyes remain visible horizontal strokes on the original display plane', async () => {
  const {scene, animations} = await load();
  const mixer = new T.AnimationMixer(scene);
  mixer.clipAction(animations.find(c => c.name === 'sleepy')).play();
  for (const t of [0.5, 2.5, 3.5]) {
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    for (const name of ['EyeLeft', 'EyeRight']) {
      const eye = scene.getObjectByName(name);
      assert.ok(eye.scale.x > eye.scale.z * 3);
      assert.ok(eye.scale.z >= 0.79);
      assert.ok(eye.position.y < 0.63, 'eye stays in front of screen');
    }
  }
});
test('all moods play, transient gestures return to idle and reduced motion remains still', async () => {
  const {scene, animations} = await load();
  const player = createAvatarAnimation(T, scene, animations);
  for (const clip of animations) {
    player.setMood(clip.name);
    assert.equal(player.currentMood, clip.name);
    player.update(0.25);
    const time = player.currentTime;
    player.setMood(clip.name);
    assert.equal(player.currentTime, time);
    for (let i = 0; i < 100; i++) player.update(0.05);
    assert.equal(
      player.currentMood,
      ['idle', 'listen', 'thinking', 'sleepy', 'unfold', 'fold'].includes(
        clip.name,
      )
        ? clip.name
        : 'idle',
    );
  }
  player.dispose();
  const quiet = createAvatarAnimation(T, scene, animations, {
    reducedMotion: true,
  });
  quiet.setMood('listen');
  quiet.update(1);
  assert.equal(quiet.currentTime, 0);
  quiet.dispose();
});
