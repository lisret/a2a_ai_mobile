import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
import {createAvatarAnimation} from './AvatarAnimation.mjs';
import {createAvatarOrbit} from './AvatarOrbit.mjs';
import {loadAvatarAsset} from './AvatarAsset.mjs';

(function () {
  var host = document.getElementById('host');
  var canvas = document.getElementById('avatar-canvas');
  if (!host || !canvas) {
    return;
  }

  try {
    var reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    var orbit = createAvatarOrbit(canvas, {
      reducedMotion: reducedMotion,
      onTap: function () {
        if (window.ReactNativeWebView)
          window.ReactNativeWebView.postMessage(
            JSON.stringify({type: 'avatar-press'}),
          );
      },
    });
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8f7f3');
    var camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    camera.position.set(0, 0.12, 4.2);

    scene.add(new THREE.HemisphereLight(0xfff7ed, 0xd4c7bc, 2.4));
    var key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(2.2, 3.2, 4);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x8df4e2, 0.55);
    rim.position.set(-3, 1.2, -2);
    scene.add(rim);

    var root = new THREE.Group();
    root.scale.setScalar(0.52);
    scene.add(root);

    var bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x8a80ed,
      roughness: 0.28,
      metalness: 0.18,
      clearcoat: 0.72,
      clearcoatRoughness: 0.22,
      sheen: 0.45,
      sheenColor: new THREE.Color(0xffffff),
    });
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 56, 40), bodyMat);
    var bodyBase = {x: 1, y: 0.9, z: 0.84};
    body.scale.set(bodyBase.x, bodyBase.y, bodyBase.z);
    root.add(body);

    var cheekMat = bodyMat.clone();
    cheekMat.color = new THREE.Color(0xb8a8f4);
    var leftCheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      cheekMat,
    );
    leftCheek.position.set(-0.52, -0.08, 0.42);
    leftCheek.scale.set(1, 0.72, 0.7);
    var rightCheek = leftCheek.clone();
    rightCheek.position.x = 0.52;
    root.add(leftCheek, rightCheek);

    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 32),
      new THREE.MeshBasicMaterial({
        color: 0x2c2a4c,
        transparent: true,
        opacity: 0.2,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.9;
    root.add(shadow);

    var earGeo = new THREE.CapsuleGeometry(0.1, 0.3, 8, 14);
    function makeEar(sign) {
      var pivot = new THREE.Group();
      pivot.position.set(sign * 0.68, 0.14, -0.02);
      var ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(0, 0.24, 0);
      ear.rotation.z = sign * 0.22;
      pivot.add(ear);
      root.add(pivot);
      return pivot;
    }
    var leftEar = makeEar(-1);
    var rightEar = makeEar(1);

    var visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x1b1d30,
      roughness: 0.16,
      metalness: 0.42,
      clearcoat: 0.86,
    });
    var visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 28, 18),
      visorMat,
    );
    visor.position.set(0, 0.07, 0.58);
    visor.scale.set(1.12, 0.42, 0.38);
    root.add(visor);

    var eyeMat = new THREE.MeshStandardMaterial({
      color: 0x8df4e2,
      emissive: 0x8df4e2,
      emissiveIntensity: 1.4,
    });
    var eyes = new THREE.Group();
    var leftEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      eyeMat,
    );
    leftEye.position.set(-0.16, 0.04, 0.1);
    var rightEye = leftEye.clone();
    rightEye.position.x = 0.16;
    eyes.position.set(0, 0.08, 0.74);
    eyes.add(leftEye, rightEye);
    root.add(eyes);

    var light = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x8df4e2,
        emissive: 0x8df4e2,
        emissiveIntensity: 1.6,
      }),
    );
    light.position.set(0.36, 0.16, 0.68);
    root.add(light);

    var layout = 'stage';
    var skinId = 'builtin';
    var mood = 'idle';
    var moodStarted = 0;
    var blinkAt = 1.8;
    var look = {x: 0, y: 0};
    var targetLook = {x: 0, y: 0};

    var skins = {
      builtin: {body: 0x8a80ed, visor: 0x1b1d30, eye: 0x8df4e2, box: false},
      'look-mint': {body: 0x6f8ef0, visor: 0x17332f, eye: 0x8df4e2, box: false},
      'look-dusk': {body: 0xb07ad8, visor: 0x2a1838, eye: 0xffd4b8, box: false},
      'look-box': {body: 0x9b96d4, visor: 0x1b1d30, eye: 0x8df4e2, box: true},
    };

    function applySkin(id) {
      skinId = id;
      var skin = skins[id] || skins.builtin;
      bodyMat.color.setHex(skin.body);
      visor.material.color.setHex(skin.visor);
      if (skin.box) {
        bodyBase = {x: 0.94, y: 0.86, z: 0.86};
      } else {
        bodyBase = {x: 1, y: 0.9, z: 0.84};
      }
      body.scale.set(bodyBase.x, bodyBase.y, bodyBase.z);
    }

    function resize() {
      var width = Math.max(1, host.clientWidth);
      var height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = layout === 'preview' ? 26 : 28;
      camera.position.set(
        0,
        layout === 'preview' ? 0.08 : 0.12,
        layout === 'preview' ? 3.35 : 3.9,
      );
      var visibleWidth =
        2 *
        camera.position.z *
        Math.tan((camera.fov * Math.PI) / 360) *
        camera.aspect;
      root.scale.setScalar(
        Math.min(
          layout === 'preview' ? 0.48 : 0.52,
          (visibleWidth * 0.82) / 2.65,
        ),
      );
      camera.updateProjectionMatrix();
    }

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(host);
    }
    window.addEventListener('resize', resize);

    var moodColors = {
      idle: 0x8df4e2,
      listen: 0xb7fff4,
      thinking: 0x9aa6ff,
      confirm: 0xff9b79,
      success: 0x8df4e2,
      error: 0xff9b79,
      wave: 0x8df4e2,
      happy: 0x8df4e2,
      sleepy: 0x9aa6ff,
      curious: 0xb7fff4,
    };

    function burst(elapsed, duration, cycles) {
      if (elapsed <= 0 || elapsed >= duration) return 0;
      var u = elapsed / duration;
      return Math.sin(u * Math.PI * cycles) * (1 - u);
    }

    function applyMood(next) {
      if (!Object.prototype.hasOwnProperty.call(moodColors, next))
        next = 'idle';
      if (mood === next) return;
      mood = next;
      if (animation) animation.setMood(next);
      moodStarted = typeof performance !== 'undefined' ? performance.now() : 0;
      var skin = skins[skinId] || skins.builtin;
      var color =
        next === 'idle' ? skin.eye : moodColors[next] || moodColors.idle;
      eyeMat.color.setHex(color);
      eyeMat.emissive.setHex(color);
      light.material.color.setHex(color);
      light.material.emissive.setHex(color);
      eyeMat.emissiveIntensity = next === 'listen' ? 2.1 : 1.4;
    }

    var lastFrame = null;
    var frameId = null;
    function tick(now) {
      var delta =
        lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      orbit.update(delta);
      var t = now * 0.001;
      var phase = (now - moodStarted) * 0.001;
      look.x += (targetLook.x - look.x) * 0.08;
      look.y += (targetLook.y - look.y) * 0.08;
      var motion = !reducedMotion;
      var breathe = motion ? Math.sin(t * 2.1) * 0.028 : 0;
      var hop =
        mood === 'success' && motion
          ? Math.max(0, Math.sin((Math.min(phase, 0.62) / 0.62) * Math.PI)) *
            0.16 *
            (phase < 0.62 ? 1 : 0)
          : 0;
      var thinkNod =
        mood === 'thinking' && motion ? Math.sin(t * 7.2) * 0.035 : 0;
      var confirmNod =
        mood === 'confirm' && motion ? burst(phase, 0.9, 4) * 0.16 : 0;
      var listenLean = mood === 'listen' && motion ? 0.12 : 0;
      var thinkTilt = mood === 'thinking' && motion ? 0.1 : 0;
      var shake = mood === 'error' && motion ? burst(phase, 0.48, 8) * 0.12 : 0;
      var sway = motion ? Math.sin(t * 0.7) * 0.06 : 0;
      var blinkWindow = (t - blinkAt) % 3.4;
      var blink =
        motion && blinkWindow > 0 && blinkWindow < 0.12
          ? 1 - Math.abs(blinkWindow / 0.06 - 1)
          : 0;
      var listenPerk = mood === 'listen' ? 0.28 : 0;
      var twitch =
        motion && mood === 'idle' && t % 5.2 < 0.35
          ? Math.sin((t % 5.2) * 18) * 0.12
          : 0;

      root.position.y = breathe + hop;
      root.rotation.y = orbit.yaw + look.x * 0.28 + sway + shake;
      root.rotation.x =
        orbit.pitch - look.y * 0.16 + thinkNod + confirmNod + listenLean;
      root.rotation.z = thinkTilt;
      body.scale.set(
        bodyBase.x + (mood === 'listen' ? 0.02 : 0),
        bodyBase.y - breathe * 0.35 + hop * 0.2,
        bodyBase.z,
      );
      eyes.rotation.y = look.x * 0.18;
      eyes.rotation.x = -look.y * 0.12;
      eyes.scale.y = 1 - blink * 0.88;
      visor.scale.set(1.12, 0.42 * (mood === 'thinking' ? 0.78 : 1), 0.38);
      leftEar.rotation.z = -0.08 - listenPerk + twitch;
      rightEar.rotation.z = 0.08 + listenPerk + twitch * 0.35;
      leftEar.rotation.x = mood === 'listen' ? -0.12 : 0;
      rightEar.rotation.x = mood === 'listen' ? -0.12 : 0;
      light.material.emissiveIntensity =
        mood === 'listen' && motion ? 1.7 + Math.sin(t * 9) * 0.7 : 1.6;
      shadow.scale.setScalar(1 - hop * 1.4);
      shadow.material.opacity = 0.2 - hop * 0.08;
      if (packedRoot) {
        root.position.y = 0;
        root.rotation.set(-look.y * 0.08, look.x * 0.25, 0);
        packedRoot.rotation.set(orbit.pitch, orbit.yaw, 0);
        shadow.scale.setScalar(1);
        shadow.material.opacity = 0.12;
        if (animation) animation.update(delta);
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    }

    var packedRoot = null;
    var animation = null;
    var requestedUrl = null;
    var loadVersion = 0;
    var defaultUrl = new URL('./nono-companion.glb', import.meta.url).href;
    var legacyParts = [
      body,
      leftCheek,
      rightCheek,
      leftEar,
      rightEar,
      visor,
      eyes,
      light,
    ];
    function disposeModel(model) {
      var geometries = new Set(),
        materials = new Set(),
        textures = new Set(),
        skeletons = new Set();
      model.traverse(function (object) {
        if (object.geometry) geometries.add(object.geometry);
        if (object.skeleton) skeletons.add(object.skeleton);
        if (object.material) {
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach(function (material) {
            materials.add(material);
            Object.values(material).forEach(function (value) {
              if (value && value.isTexture) textures.add(value);
            });
          });
        }
      });
      geometries.forEach(function (value) {
        value.dispose();
      });
      materials.forEach(function (value) {
        value.dispose();
      });
      textures.forEach(function (value) {
        value.dispose();
      });
      skeletons.forEach(function (value) {
        value.dispose();
      });
    }
    function clearModel() {
      if (animation) {
        animation.dispose();
        animation = null;
      }
      if (packedRoot) {
        root.remove(packedRoot);
        disposeModel(packedRoot);
        packedRoot = null;
      }
    }
    function showLegacy() {
      clearModel();
      legacyParts.forEach(function (part) {
        part.visible = true;
      });
      shadow.position.y = -0.9;
      host.dataset.model = 'fallback';
    }
    function useBuiltin() {
      loadGltf(defaultUrl);
    }
    function loadGltf(fileUrl) {
      if (!fileUrl || requestedUrl === fileUrl) return;
      requestedUrl = fileUrl;
      var version = ++loadVersion;
      var loader = new GLTFLoader();
      loadAvatarAsset(
        loader,
        fileUrl,
        function (gltf) {
          if (version !== loadVersion) {
            disposeModel(gltf.scene);
            return;
          }
          clearModel();
          packedRoot = gltf.scene;
          packedRoot.traverse(function (object) {
            if (object.isSkinnedMesh) object.frustumCulled = false;
          });
          // Center all packs and use a consistent height. Keep placement outside the animated root.
          var box = new THREE.Box3().setFromObject(packedRoot);
          var size = box.getSize(new THREE.Vector3());
          var center = box.getCenter(new THREE.Vector3());
          var height = Math.max(size.y, 0.001);
          var scale = Math.min(2.3 / height, 2.65 / Math.max(size.x, 0.001));
          var placement = new THREE.Group();
          placement.scale.setScalar(scale);
          placement.position.copy(center).multiplyScalar(-scale);
          placement.add(packedRoot);
          animation = createAvatarAnimation(
            THREE,
            packedRoot,
            gltf.animations,
            {reducedMotion: reducedMotion},
          );
          animation.setMood(mood);
          packedRoot = new THREE.Group();
          packedRoot.add(placement);
          root.add(packedRoot);
          legacyParts.forEach(function (part) {
            part.visible = false;
          });
          shadow.position.y = (-size.y * scale) / 2 - 0.025;
          host.dataset.model =
            fileUrl === defaultUrl ? 'nono-companion' : 'custom';
          host.dataset.clips = gltf.animations
            .map(function (clip) {
              return clip.name;
            })
            .join(',');
        },
        function () {
          if (version !== loadVersion) return;
          requestedUrl = null;
          if (fileUrl === defaultUrl) showLegacy();
          else useBuiltin();
          if (window.ReactNativeWebView)
            window.ReactNativeWebView.postMessage(
              JSON.stringify({type: 'avatar-load-failed'}),
            );
        },
      );
    }
    function visibilityChanged() {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = null;
        lastFrame = null;
      } else if (frameId === null) {
        lastFrame = null;
        frameId = requestAnimationFrame(tick);
      }
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', function () {
      orbit.cancel();
      cancelAnimationFrame(frameId);
      frameId = null;
      lastFrame = null;
      ++loadVersion;
      requestedUrl = null;
      clearModel();
    });
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        useBuiltin();
        visibilityChanged();
      }
    });

    window.NonoAvatar = {
      setLayout: function (next) {
        layout = next;
        resize();
      },
      setSkin: function (next) {
        applySkin(next);
      },
      setMood: applyMood,
      setRotation: orbit.setRotation,
      resetRotation: orbit.reset,
      setAutoRotate: orbit.setAutoRotate,
      getView: function () {
        return {yaw: orbit.yaw, pitch: orbit.pitch, automatic: orbit.automatic};
      },
      getMood: function () {
        return animation ? animation.currentMood : mood;
      },
      setLook: function (x, y) {
        targetLook.x = Math.max(-1, Math.min(1, x));
        targetLook.y = Math.max(-1, Math.min(1, y));
      },
      useBuiltin: useBuiltin,
      loadGltf: loadGltf,
    };

    resize();
    useBuiltin();
    frameId = requestAnimationFrame(tick);
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(
        JSON.stringify({type: 'avatar-ready'}),
      );
  } catch (error) {
    console.warn('NoNo 3D avatar failed', error);
    window.NonoAvatarFailed = true;
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(
        JSON.stringify({type: 'avatar-render-failed'}),
      );
  }
})();
