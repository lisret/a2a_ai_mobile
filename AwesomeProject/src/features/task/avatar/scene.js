(function () {
  var host = document.getElementById('host');
  var canvas = document.getElementById('avatar-canvas');
  if (!host || !canvas || typeof THREE === 'undefined') {
    return;
  }

  try {
    var reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
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

    scene.add(new THREE.HemisphereLight(0xf3f0ff, 0x8b82d4, 1.15));
    var key = new THREE.DirectionalLight(0xffffff, 1.35);
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
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 36), bodyMat);
    body.scale.set(1, 0.92, 0.86);
    root.add(body);

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

    var earGeo = new THREE.CapsuleGeometry(0.09, 0.28, 6, 12);
    var leftEar = new THREE.Mesh(earGeo, bodyMat);
    leftEar.position.set(-0.72, 0.08, 0);
    leftEar.rotation.z = 0.35;
    var rightEar = leftEar.clone();
    rightEar.position.x = 0.72;
    rightEar.rotation.z = -0.35;
    root.add(leftEar, rightEar);

    var visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.38, 0.18),
      new THREE.MeshPhysicalMaterial({
        color: 0x1b1d30,
        roughness: 0.18,
        metalness: 0.35,
        clearcoat: 0.8,
      }),
    );
    visor.position.set(0, 0.06, 0.62);
    visor.scale.set(1, 1, 0.7);
    root.add(visor);

    var eyeMat = new THREE.MeshStandardMaterial({
      color: 0x8df4e2,
      emissive: 0x8df4e2,
      emissiveIntensity: 1.4,
    });
    var eyes = new THREE.Group();
    var leftEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 12),
      eyeMat,
    );
    leftEye.position.set(-0.16, 0.08, 0.08);
    var rightEye = leftEye.clone();
    rightEye.position.x = 0.16;
    eyes.position.set(0, 0.06, 0.72);
    eyes.add(leftEye, rightEye);
    root.add(eyes);

    var light = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x8df4e2,
        emissive: 0x8df4e2,
        emissiveIntensity: 1.6,
      }),
    );
    light.position.set(0.34, 0.18, 0.7);
    root.add(light);

    var layout = 'stage';
    var skinId = 'builtin';
    var mood = 'idle';
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
        body.scale.set(0.94, 0.86, 0.86);
      } else {
        body.scale.set(1, 0.92, 0.86);
      }
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
      root.scale.setScalar(layout === 'preview' ? 0.58 : 0.52);
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
    };

    function applyMood(next) {
      mood = next;
      var skin = skins[skinId] || skins.builtin;
      var color =
        next === 'idle' ? skin.eye : moodColors[next] || moodColors.idle;
      eyeMat.color.setHex(color);
      eyeMat.emissive.setHex(color);
      light.material.color.setHex(color);
      light.material.emissive.setHex(color);
      eyeMat.emissiveIntensity = next === 'listen' ? 2.1 : 1.4;
    }

    function tick(now) {
      var t = now * 0.001;
      look.x += (targetLook.x - look.x) * 0.08;
      look.y += (targetLook.y - look.y) * 0.08;
      var breathe = reducedMotion ? 0 : Math.sin(t * 2.1) * 0.028;
      var think =
        mood === 'thinking' && !reducedMotion ? Math.sin(t * 8) * 0.03 : 0;
      root.position.y = breathe;
      root.rotation.y =
        look.x * 0.28 + (reducedMotion ? 0 : Math.sin(t * 0.7) * 0.06);
      root.rotation.x = -look.y * 0.16 + think;
      eyes.rotation.y = look.x * 0.18;
      eyes.rotation.x = -look.y * 0.12;
      visor.scale.y = mood === 'thinking' ? 0.82 : 1;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }

    window.NonoAvatar = {
      setLayout: function (next) {
        layout = next;
        resize();
      },
      setSkin: function (next) {
        applySkin(next);
      },
      setMood: applyMood,
      setLook: function (x, y) {
        targetLook.x = Math.max(-1, Math.min(1, x));
        targetLook.y = Math.max(-1, Math.min(1, y));
      },
    };

    resize();
    requestAnimationFrame(tick);
  } catch (error) {
    console.warn('NoNo 3D avatar failed', error);
  }
})();
