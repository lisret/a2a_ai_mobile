/** Build the appearance-only separated sphere. No hardware or dock is exported. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const source = await fs.readFile(
  new URL('./assets/nono-detached-source.glb', import.meta.url),
);
const gltf = await new GLTFLoader().parseAsync(
  source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  '',
);
const node = i => gltf.parser.getDependency('node', i);
const body = await node(1);
if (
  !body.getObjectByName('RearHousing100') ||
  !body.getObjectByName('TransparentDome100')
)
  throw new Error('Expected approved separated sphere source');
// Extract only the visible display/eyes from the engineering assembly, then
// discard its complete interior and ports groups, including camera and screen PCB.
const display = await node(38),
  eyes = [await node(39), await node(40)];
for (const object of [display, ...eyes]) {
  body.add(object);
  object.userData = {};
}
(await node(12)).removeFromParent();
(await node(41)).removeFromParent();
display.name = 'FaceDisplay';
// Close the old camera aperture with the same dark face material.
const cap = new T.Mesh(
  new T.CylinderGeometry(3.6, 3.6, 0.2, 32),
  display.material,
);
cap.name = 'FaceApertureCover';
cap.position.set(0, 0.3, 40.8);
body.add(cap);
body.removeFromParent();
body.position.set(0, 0, 0);
body.quaternion.identity();
body.name = 'SphereBody';
const model = new T.Group();
model.name = 'NoNoDetached';
model.userData = {
  source:
    'chaonuo/hardware/nono/variants/custom-core-100/preview/nono-100-study.glb',
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  form: 'Appearance only; no hardware or dock',
  sphereDiameter_mm: 100,
  wingLimitsDegrees: {upper: 95, lower: 80},
  adaptation:
    'Original exterior and rigid hinges; animated face and subtle breathing',
};
const head = new T.Group();
head.name = 'Head';
model.add(head);
const coordinates = new T.Group();
coordinates.name = 'SourceCoordinates';
coordinates.rotation.x = -Math.PI / 2;
coordinates.scale.setScalar(0.02);
coordinates.add(body);
head.add(coordinates);
const wings = [];
for (const name of [
  'UpperWingRight',
  'UpperWingLeft',
  'LowerWingLeft',
  'LowerWingRight',
]) {
  for (const meshName of [name, name.replace('Wing', 'WingInlay')]) {
    const mesh = body.getObjectByName(meshName);
    if (!mesh) throw new Error(`Missing ${meshName}`);
    const pivot = mesh.parent;
    pivot.name = `${meshName}Pivot`;
    // Retain the source hinge's directed rotation axis; explicitly set its range.
    const q = pivot.quaternion.clone().normalize();
    const axis = new T.Vector3(q.x, q.y, q.z).normalize();
    const upper = name.startsWith('Upper'),
      max = T.MathUtils.degToRad(upper ? 95 : 80);
    const open = new T.Quaternion().setFromAxisAngle(axis, max);
    pivot.userData = {maxDegrees: upper ? 95 : 80};
    wings.push({pivot, open, upper, left: name.endsWith('Left')});
    pivot.quaternion.copy(open);
  }
}
eyes.forEach((eye, i) => {
  eye.name = i ? 'EyeRight' : 'EyeLeft';
  eye.material.color.set('#9ffff0');
});
const glow = new T.MeshBasicMaterial({color: '#9ffff0'});
function line(name, points, closed = false) {
  const curve = new T.CatmullRomCurve3(
    points.map(p => new T.Vector3(...p)),
    closed,
  );
  const mesh = new T.Mesh(new T.TubeGeometry(curve, 40, 0.6, 6, closed), glow);
  mesh.name = name;
  mesh.position.set(0, -0.05, -12);
  body.add(mesh);
  return mesh;
}
const smile = line('SmileMouth', [
  [-7, 0, 2],
  [-3.5, 0, 0],
  [0, 0, -0.8],
  [3.5, 0, 0],
  [7, 0, 2],
]);
const oh = line(
  'OhMouth',
  Array.from({length: 12}, (_, i) => [
    Math.cos((i * Math.PI) / 6) * 3,
    0,
    Math.sin((i * Math.PI) / 6) * 4,
  ]),
  true,
);
const flat = line('FlatMouth', [
  [-5, 0, 0],
  [0, 0, 0.3],
  [5, 0, 0],
]);
oh.scale.setScalar(0);
flat.scale.setScalar(0);
const mouths = [smile, oh, flat];
const moods = [
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
];
const loops = new Set([
  'idle',
  'listen',
  'thinking',
  'sleepy',
  'unfold',
  'fold',
]);
const clips = moods.map(mood => {
  const loop = loops.has(mood),
    duration = loop ? 4.8 : ['spin', 'dance'].includes(mood) ? 3.2 : 2.4;
  const times = Array.from({length: 65}, (_, i) => (i * duration) / 64);
  const positions = [],
    rotations = [],
    scales = [],
    eyeValues = [[], []],
    eyeRotations = [[], []],
    eyePositions = [[], []];
  const wingValues = wings.map(() => []),
    mouthValues = mouths.map(() => []);
  for (const time of times) {
    const phase = time / duration,
      cycle = Math.sin(phase * Math.PI * 2),
      pulse = Math.sin(phase * Math.PI) ** 2;
    const breath = loop ? cycle : Math.sin((time / 4.8) * Math.PI * 2);
    const energy = ['laugh', 'dance'].includes(mood)
      ? Math.abs(Math.sin(phase * Math.PI * 6)) * pulse
      : pulse;
    const bob = ['happy', 'success', 'laugh', 'spin', 'dance'].includes(mood)
      ? energy * (mood === 'spin' ? 0.16 : 0.14)
      : 0;
    const sway = Math.sin(phase * Math.PI * 4) * pulse;
    positions.push(
      mood === 'peek'
        ? pulse * 0.12
        : mood === 'dance'
        ? sway * 0.14
        : mood === 'shy'
        ? -pulse * 0.07
        : 0,
      breath * 0.028 + bob - (mood === 'shy' ? pulse * 0.04 : 0),
      mood === 'peek' ? pulse * 0.16 : mood === 'surprised' ? -pulse * 0.2 : 0,
    );
    const tuck = mood === 'shy' ? 1 - pulse * 0.09 : 1;
    scales.push(
      (1 + breath * 0.006) * tuck,
      (1 + breath * 0.012) * tuck,
      (1 + breath * 0.006) * tuck,
    );
    const pitch =
      mood === 'sleepy'
        ? -0.1
        : mood === 'confirm'
        ? -0.16 * Math.sin(phase * Math.PI * 4) * pulse
        : mood === 'shy'
        ? -0.2 * pulse
        : mood === 'surprised'
        ? -0.18 * pulse
        : mood === 'laugh'
        ? 0.12 * Math.sin(phase * Math.PI * 8) * pulse
        : 0;
    // Dense quaternion keys preserve a full revolution: a two-key 0/360 clip
    // would collapse to no motion because both orientations are identical.
    const yaw =
      mood === 'spin'
        ? 2 * Math.PI * phase * phase * (3 - 2 * phase)
        : mood === 'error'
        ? Math.sin(phase * Math.PI * 6) * pulse * 0.13
        : mood === 'shy'
        ? -0.5 * pulse
        : mood === 'happy'
        ? sway * 0.18
        : mood === 'dance'
        ? sway * 0.32
        : 0;
    const roll = ['thinking', 'curious', 'wink', 'peek'].includes(mood)
      ? pulse * 0.14
      : mood === 'shy'
      ? -0.12 * pulse
      : mood === 'happy' || mood === 'dance'
      ? Math.sin(phase * Math.PI * 6) * pulse * 0.2
      : 0;
    rotations.push(
      ...new T.Quaternion()
        .setFromEuler(new T.Euler(pitch, yaw, roll))
        .toArray(),
    );
    wings.forEach(({open, upper, left}, i) => {
      // Every expression starts from the user's fully open 95° / 80° pose.
      // Only deliberate gestures briefly flex inward; only fold closes completely.
      let fraction = mood === 'fold' ? 0 : 1;
      if (mood === 'wave' && left && !upper)
        fraction -= 0.3 * pulse * (0.5 + 0.5 * Math.sin(phase * Math.PI * 8));
      if (mood === 'dance')
        fraction -=
          0.15 *
          pulse *
          (0.5 + 0.5 * Math.sin(phase * Math.PI * 4 + (left ? 0 : Math.PI)));
      if (mood === 'stretch')
        fraction -= 0.12 * Math.sin(phase * Math.PI * 2) ** 2;
      wingValues[i].push(
        ...new T.Quaternion()
          .slerp(open, T.MathUtils.clamp(fraction, 0, 1))
          .toArray(),
      );
    });
    const blink =
      phase > 0.72 && phase < 0.8
        ? 1 - 0.91 * Math.sin(((phase - 0.72) * Math.PI) / 0.08)
        : 1;
    eyes.forEach((eye, i) => {
      let width = 5.5,
        height = 9 * blink,
        tilt = 0,
        dx = 0,
        dz = 0;
      if (['happy', 'laugh', 'success', 'spin', 'dance'].includes(mood)) {
        height = 9 - 7 * pulse;
        tilt = (i ? 1 : -1) * pulse * 0.18;
      }
      if (mood === 'spin' && i === 0 && phase > 0.75 && phase < 0.95) {
        height = 9 - 8.2 * Math.sin(((phase - 0.75) * Math.PI) / 0.2) ** 2;
      }
      if (mood === 'sleepy') height = 0.8;
      if (mood === 'wink' && i === 0) height = 9 - 8.2 * pulse;
      if (mood === 'surprised') {
        width += pulse * 1.5;
        height += pulse * 3;
      }
      if (mood === 'shy') {
        height = 9 - 6 * pulse;
        dx = (i ? -1 : 1) * pulse * 1.5;
        dz = -pulse * 2;
      }
      if (mood === 'thinking') {
        height = i === 0 ? 6 : 9;
        dx = cycle * 1.3;
      }
      if (mood === 'peek' || mood === 'curious') {
        dx = pulse * 3;
        height = i === 0 ? 9 + 2 * pulse : 9 - 2 * pulse;
      }
      eyeValues[i].push(width, 1, height);
      eyeRotations[i].push(
        ...new T.Quaternion()
          .setFromAxisAngle(new T.Vector3(0, 1, 0), tilt)
          .toArray(),
      );
      eyePositions[i].push((i ? 10.5 : -10.5) + dx, 0.54, 2.5 + dz);
    });
    const shape = ['surprised', 'laugh', 'dance'].includes(mood)
      ? 1
      : ['thinking', 'sleepy', 'error'].includes(mood)
      ? 2
      : 0;
    mouths.forEach((_, i) => {
      const size = i === shape ? 1 : 0;
      mouthValues[i].push(
        size * (mood === 'laugh' ? 1 + pulse * 0.4 : 1),
        size,
        size * (mood === 'shy' ? 0.5 : 1),
      );
    });
  }
  return new T.AnimationClip(mood, duration, [
    new T.VectorKeyframeTrack('Head.position', times, positions),
    new T.VectorKeyframeTrack('Head.scale', times, scales),
    new T.QuaternionKeyframeTrack('Head.quaternion', times, rotations),
    ...wings.map(
      ({pivot}, i) =>
        new T.QuaternionKeyframeTrack(
          `${pivot.name}.quaternion`,
          times,
          wingValues[i],
        ),
    ),
    ...eyes.flatMap((eye, i) => [
      new T.VectorKeyframeTrack(`${eye.name}.scale`, times, eyeValues[i]),
      new T.VectorKeyframeTrack(
        `${eye.name}.quaternion`,
        times,
        eyeRotations[i],
      ),
      new T.VectorKeyframeTrack(`${eye.name}.position`, times, eyePositions[i]),
    ]),
    ...mouths.map(
      (mouth, i) =>
        new T.VectorKeyframeTrack(`${mouth.name}.scale`, times, mouthValues[i]),
    ),
  ]);
});
// Frame against the whole motion envelope so fully open wings fit narrow screens.
const bounds = new T.Box3(),
  probe = new T.AnimationMixer(model);
for (const clip of clips) {
  probe.stopAllAction();
  probe.clipAction(clip).reset().play();
  for (let i = 0; i <= 64; i++) {
    probe.setTime((clip.duration * i) / 64);
    model.updateMatrixWorld(true);
    bounds.union(new T.Box3().setFromObject(model));
  }
}
probe.stopAllAction();
probe.uncacheRoot(model);
model.userData.framingBounds = {
  min: bounds.min.toArray(),
  max: bounds.max.toArray(),
};
model.updateMatrixWorld(true);
const binary = await new GLTFExporter().parseAsync(model, {
  binary: true,
  animations: clips,
  onlyVisible: true,
});
const output = new URL(
  '../src/features/task/avatar/nono-detached.glb',
  import.meta.url,
);
await fs.writeFile(output, Buffer.from(binary));
console.log(
  `Generated ${output.pathname}: ${binary.byteLength} bytes, ${clips.length} clips`,
);
