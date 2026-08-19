import {Platform} from 'react-native';

const ELEL_VRM_CID = 'QmSpb8jZRtwDhpp7zjpfvU47GZyapmh8GvQApmzTxFcaLz';

export const ELEL_VRM_FILE_URL =
  `https://ipfs.io/ipfs/${ELEL_VRM_CID}/Avatar01_Neutral.vrm`;

export const ANDROID_VRM_VIEWER_URI = 'file:///android_asset/vrm/index.html';

/**
 * iOS 无法读 Android assets。脚本走 unpkg，模型走 IPFS 同源 baseUrl。
 * 运行时逻辑必须与 `android/app/src/main/assets/vrm/vrm-viewer.js` 保持同行为：
 * VRM 0.x 转 180°、自动取景、骨骼待机、自动旋转。
 */
const ELEL_VRM_VIEWER_RUNTIME = `
(function () {
  function post(payload) {
    try {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch (err) {}
  }
  function fail(message) {
    document.title = 'vrm-error';
    post({ type: 'error', message: String(message || 'vrm error') });
  }
  if (!window.THREE || !THREE.WebGLRenderer) {
    fail('THREE missing');
    return;
  }
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  } catch (err) {
    fail(err && err.message ? err.message : err);
    return;
  }
  if (!renderer.getContext()) {
    fail('webgl context');
    return;
  }
  renderer.setClearColor(0xf3f4f6, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.style.touchAction = 'none';
  document.body.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f4f6);
  var camera = new THREE.PerspectiveCamera(32, window.innerWidth / Math.max(window.innerHeight, 1), 0.05, 40);
  camera.position.set(0, 1.05, 1.7);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  var key = new THREE.DirectionalLight(0xfff3e8, 0.95); key.position.set(0.45, 1.5, 1.2); scene.add(key);
  var fill = new THREE.DirectionalLight(0xc5d4ff, 0.42); fill.position.set(-0.7, 0.5, 0.5); scene.add(fill);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.7;
  controls.target.set(0, 0.86, 0);
  controls.minPolarAngle = Math.PI * 0.42; controls.maxPolarAngle = Math.PI * 0.58;
  controls.minAzimuthAngle = -0.95; controls.maxAzimuthAngle = 0.95; controls.update();
  var autoTimer = 0;
  function pauseAutoRotate() {
    controls.autoRotate = false;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(function () { controls.autoRotate = !window.__elelCompact; }, 2400);
  }
  controls.addEventListener('start', pauseAutoRotate);
  var clock = new THREE.Clock();
  var currentVrm = null;
  var mood = 'idle';
  var bones = {};
  function setBlend(name, value) {
    if (!currentVrm || !currentVrm.blendShapeProxy) return;
    try { currentVrm.blendShapeProxy.setValue(name, value); } catch (err) {}
  }
  function getBone(name) {
    if (!currentVrm || !currentVrm.humanoid || !currentVrm.humanoid.getBoneNode) return null;
    try { return currentVrm.humanoid.getBoneNode(name); } catch (err) { return null; }
  }
  function captureBones() {
    ['hips', 'spine', 'chest', 'neck', 'leftUpperArm', 'rightUpperArm'].forEach(function (name) {
      var node = getBone(name);
      if (!node) return;
      bones[name] = { node: node, x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
    });
  }
  window.__setMood = function (next) {
    mood = next || 'idle';
    ['fun', 'joy', 'angry', 'sorrow', 'a', 'i', 'u', 'e', 'o'].forEach(function (name) { setBlend(name, 0); });
    if (mood === 'done') { setBlend('fun', 0.6); setBlend('joy', 0.45); }
    else if (mood === 'error') { setBlend('sorrow', 0.8); }
    else if (mood === 'work') { setBlend('a', 0.18); }
  };
  window.__setCompact = function (compact) {
    window.__elelCompact = !!compact;
    controls.enabled = !compact;
    controls.autoRotate = !compact;
  };
  function frameBust(root) {
    var box = new THREE.Box3().setFromObject(root);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var bustY = box.min.y + size.y * 0.56;
    controls.target.set(center.x, bustY, center.z);
    var dist = Math.max(size.y * 1.22, 1.35);
    camera.position.set(center.x, bustY + 0.02, center.z + dist);
    camera.near = Math.max(0.04, dist / 80);
    camera.far = dist * 30;
    camera.updateProjectionMatrix();
    controls.update();
  }
  var loader = new THREE.GLTFLoader();
  loader.crossOrigin = 'anonymous';
  loader.load(window.__ELEL_MODEL || 'Avatar01_Neutral.vrm', function (gltf) {
    if (!window.THREE_VRM || !THREE_VRM.VRM || !THREE_VRM.VRM.from) { fail('THREE_VRM.VRM.from missing'); return; }
    THREE_VRM.VRM.from(gltf).then(function (vrm) {
      currentVrm = vrm;
      vrm.scene.rotation.y = Math.PI;
      scene.add(vrm.scene);
      if (vrm.lookAt) vrm.lookAt.target = camera;
      captureBones();
      frameBust(vrm.scene);
      window.__setMood(mood);
      document.title = 'vrm-ready';
      post({ type: 'ready' });
    }).catch(function (err) { fail(err && err.message ? err.message : err); });
  }, undefined, function (err) { fail(err && err.message ? err.message : err); });
  function applyPose(t) {
    var breathe = Math.sin(t * 1.4) * 0.018;
    var sway = Math.sin(t * 0.85) * 0.04;
    var spineX = breathe * 0.7;
    var spineY = sway;
    var neckX = Math.sin(t * 1.05) * 0.012;
    if (mood === 'work') { spineX += 0.1; neckX += 0.08; }
    else if (mood === 'done') { spineX -= 0.03; }
    else if (mood === 'error') { spineY -= 0.04; neckX += 0.05; }
    function apply(name, dx, dy, dz) {
      var bone = bones[name];
      if (!bone) return;
      bone.node.rotation.x = bone.x + dx;
      bone.node.rotation.y = bone.y + dy;
      bone.node.rotation.z = bone.z + dz;
    }
    apply('hips', 0, sway * 0.35, 0);
    apply('spine', spineX, spineY, 0);
    apply('chest', breathe, spineY * 0.45, 0);
    apply('neck', neckX, sway * 0.28, 0);
    apply('leftUpperArm', 0.04 + breathe, 0, 0.1 + breathe * 0.5);
    apply('rightUpperArm', 0.04 + breathe, 0, -0.1 - breathe * 0.5);
    if (currentVrm) currentVrm.scene.position.y = Math.sin(t * 1.35) * (mood === 'done' ? 0.02 : 0.01);
  }
  function animate() {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    var t = clock.elapsedTime;
    if (currentVrm) {
      var cycle = t % 4.6;
      setBlend('blink', cycle > 4.28 && cycle < 4.42 ? 1 : 0);
      if (typeof currentVrm.update === 'function') currentVrm.update(dt);
      applyPose(t);
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });
  window.addEventListener('error', function (event) { fail(event.message || 'js error'); });
})();
`;

const IOS_VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#F3F4F6}canvas{display:block;width:100%;height:100%}</style>
</head>
<body>
<script src="https://unpkg.com/three@0.140.2/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.140.2/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://unpkg.com/three@0.140.2/examples/js/controls/OrbitControls.js"></script>
<script src="https://unpkg.com/@pixiv/three-vrm@0.6.11/lib/three-vrm.min.js"></script>
<script>window.__ELEL_MODEL='Avatar01_Neutral.vrm';</script>
<script>${ELEL_VRM_VIEWER_RUNTIME}</script>
</body>
</html>`;

export function getElelVrmWebViewSource() {
  if (Platform.OS === 'android') {
    return {uri: ANDROID_VRM_VIEWER_URI};
  }
  return {
    html: IOS_VIEWER_HTML,
    baseUrl: `https://ipfs.io/ipfs/${ELEL_VRM_CID}/`,
  };
}
