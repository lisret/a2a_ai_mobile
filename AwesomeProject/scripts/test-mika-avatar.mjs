import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const modelPath = new URL(
  '../src/features/task/avatar/mika-prototype.glb',
  import.meta.url,
);
async function loadModel() {
  const buffer = await fs.readFile(modelPath);
  return new GLTFLoader().parseAsync(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    '',
  );
}
test('bundled model has weighted skeleton, companion clips and actual skinned deformation', async () => {
  const model = await loadModel();
  const meshes = [];
  model.scene.traverse(o => {
    if (o.isSkinnedMesh) meshes.push(o);
  });
  assert.ok(meshes.length > 0, 'real skinned mesh required');
  assert.ok(meshes[0].skeleton.bones.length >= 12);
  assert.deepEqual(
    model.animations.map(c => c.name).sort(),
    ['idle', 'listen', 'thinking', 'confirm', 'success', 'error'].sort(),
  );
  for (const mesh of meshes) {
    const weights = mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < weights.count; i++)
      assert.ok(
        Math.abs(
          weights.getX(i) +
            weights.getY(i) +
            weights.getZ(i) +
            weights.getW(i) -
            1,
        ) < 1e-5,
      );
  }
  const ear = meshes.find(m => m.name === 'EarLeft');
  assert.ok(ear);
  model.scene.updateMatrixWorld(true);
  ear.skeleton.update();
  const index = Math.floor(ear.geometry.attributes.position.count / 2);
  const before = ear.getVertexPosition(index, new THREE.Vector3()).clone();
  const mixer = new THREE.AnimationMixer(model.scene);
  mixer.clipAction(model.animations.find(c => c.name === 'listen')).play();
  mixer.update(0.7);
  model.scene.updateMatrixWorld(true);
  ear.skeleton.update();
  const after = ear.getVertexPosition(index, new THREE.Vector3());
  assert.ok(
    before.distanceTo(after) > 0.015,
    'joint animation must deform ear vertices',
  );
  assert.ok((await fs.stat(modelPath)).size < 2 * 1024 * 1024);
});
async function controller(options) {
  const {createAvatarAnimation} = await import(
    '../src/features/task/avatar/AvatarAnimation.mjs'
  );
  const model = await loadModel();
  return {
    model,
    player: createAvatarAnimation(
      THREE,
      model.scene,
      model.animations,
      options,
    ),
  };
}
test('same mood does not restart; success finishes in idle and can be replayed after a mood change', async () => {
  const {player} = await controller();
  player.setMood('success');
  player.update(0.4);
  const before = player.currentTime;
  player.setMood('success');
  assert.equal(player.currentTime, before);
  for (let i = 0; i < 20; i++) player.update(0.1);
  assert.equal(player.currentMood, 'idle');
  player.setMood('success');
  assert.equal(player.currentMood, 'idle');
  player.setMood('listen');
  player.setMood('success');
  assert.equal(player.currentMood, 'success');
  player.dispose();
});
test('missing clips use idle, reduced motion stays still, cleanup stops actions', async () => {
  const {model, player} = await controller({reducedMotion: true});
  player.setMood('listen');
  player.update(1);
  assert.equal(player.currentTime, 0);
  player.dispose();
  const {createAvatarAnimation} = await import(
    '../src/features/task/avatar/AvatarAnimation.mjs'
  );
  const partial = createAvatarAnimation(THREE, model.scene, [
    model.animations[0],
  ]);
  partial.setMood('thinking');
  assert.equal(partial.currentMood, 'idle');
  partial.dispose();
  partial.update(1);
  assert.equal(partial.currentTime, 0);
  const empty = createAvatarAnimation(THREE, model.scene, []);
  empty.setMood('listen');
  empty.update(0.1);
  empty.dispose();
});

// Run the real scene orchestration without a GPU to exercise load races and lifecycle.
async function sceneHarness() {
  const vm = await import('node:vm');
  const {loadAvatarAsset} = await import(
    '../src/features/task/avatar/AvatarAsset.mjs'
  );
  const {createAvatarAnimation} = await import(
    '../src/features/task/avatar/AvatarAnimation.mjs'
  );
  const {createAvatarOrbit} = await import(
    '../src/features/task/avatar/AvatarOrbit.mjs'
  );
  const pending = [],
    events = {},
    frames = new Map();
  let frameId = 0;
  const host = {clientWidth: 360, clientHeight: 620, dataset: {}};
  const document = {
    hidden: false,
    getElementById: id =>
      id === 'host' ? host : {addEventListener() {}, removeEventListener() {}},
    addEventListener: (name, fn) => {
      events[name] = fn;
    },
  };
  const window = {
    devicePixelRatio: 1,
    matchMedia: () => ({matches: false}),
    addEventListener: (name, fn) => {
      events[name] = fn;
    },
  };
  class Renderer {
    setPixelRatio() {}
    setSize() {}
    render() {}
  }
  class Loader {
    load(url, success, progress, failure) {
      pending.push({url, success, failure});
    }
  }
  const source = (
    await fs.readFile(
      new URL('../src/features/task/avatar/scene.js', import.meta.url),
      'utf8',
    )
  )
    .replace(/^import .*;\n/gm, '')
    .replaceAll(
      'import.meta.url',
      JSON.stringify('http://localhost/nono-avatar/scene.js'),
    );
  vm.runInNewContext(source, {
    THREE: {...THREE, WebGLRenderer: Renderer},
    GLTFLoader: Loader,
    loadAvatarAsset,
    createAvatarAnimation,
    createAvatarOrbit,
    document,
    window,
    URL,
    console,
    performance,
    requestAnimationFrame: fn => {
      frames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame: id => frames.delete(id),
  });
  function asset() {
    const scene = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    scene.add(new THREE.Mesh(geometry, material));
    let disposed = false;
    geometry.addEventListener('dispose', () => {
      disposed = true;
    });
    return {
      scene,
      animations: [],
      get disposed() {
        return disposed;
      },
    };
  }
  return {
    api: window.NonoAvatar,
    pending,
    events,
    frames,
    document,
    host,
    asset,
  };
}
test('model URL is idempotent; stale model loads are disposed and cannot replace current model', async () => {
  const h = await sceneHarness();
  assert.equal(h.pending.length, 1);
  h.api.useBuiltin();
  h.api.setMood('listen');
  assert.equal(h.pending.length, 1);
  h.api.loadGltf('new.glb');
  const stale = h.asset();
  h.pending[0].success(stale);
  assert.equal(stale.disposed, true);
  const selected = h.asset();
  h.pending[1].success(selected);
  assert.equal(h.host.dataset.model, 'custom');
  h.api.useBuiltin();
  h.pending[2].success(h.asset());
  assert.equal(selected.disposed, true);
  assert.equal(h.host.dataset.model, 'nono-companion');
});
test('hidden document stops frame scheduling; late pagehide load cannot revive disposed model', async () => {
  const h = await sceneHarness();
  assert.equal(h.frames.size, 1);
  h.document.hidden = true;
  h.events.visibilitychange();
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.events.visibilitychange();
  assert.equal(h.frames.size, 1);
  h.events.pagehide();
  assert.equal(h.frames.size, 0);
  const late = h.asset();
  h.pending[0].success(late);
  assert.equal(late.disposed, true);
});
test('Android file GLB uses XHR arraybuffer then parses locally; HTTPS keeps loader transport', async () => {
  const {loadAvatarAsset} = await import(
    '../src/features/task/avatar/AvatarAsset.mjs'
  );
  let request;
  class XHR {
    constructor() {
      request = this;
    }
    open(method, url) {
      this.url = url;
    }
    send() {}
  }
  let parsed, loaded;
  const loader = {
    parse: (buffer, base, success) => {
      parsed = {buffer, base};
      success('parsed');
    },
    load: (url, success) => {
      loaded = url;
      success('network');
    },
  };
  let result, error;
  loadAvatarAsset(
    loader,
    'file:///android_asset/nono-avatar/mika-prototype.glb',
    value => {
      result = value;
    },
    e => {
      error = e;
    },
    XHR,
  );
  assert.equal(request.responseType, 'arraybuffer');
  request.status = 0;
  request.response = new ArrayBuffer(12);
  request.onload();
  assert.equal(result, 'parsed');
  assert.equal(parsed.base, 'file:///android_asset/nono-avatar/');
  assert.equal(error, undefined);
  loadAvatarAsset(
    loader,
    'https://example.test/model.glb',
    value => {
      result = value;
    },
    () => {},
    XHR,
  );
  assert.equal(loaded, 'https://example.test/model.glb');
  assert.equal(result, 'network');
  loadAvatarAsset(
    loader,
    'file:///missing.glb',
    () => assert.fail('must not succeed'),
    e => {
      error = e;
    },
    XHR,
  );
  request.status = 404;
  request.onload();
  assert.ok(error);
});
