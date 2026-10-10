/** Self-authored Mika prototype. Rebuild: node scripts/generate-mika-avatar.mjs */
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import fs from 'node:fs/promises';
// GLTFExporter uses browser FileReader only to serialize its final Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const model = new T.Group();
model.name = 'MikaPrototype';
model.userData = {
  title: '米咔 · 自制原型',
  provenance: 'Procedurally authored for NoNo; not an official asset',
  reference: 'https://wiki.biligame.com/seer/米咔',
};
const bones = [];
function bone(name, parent, position) {
  const b = new T.Bone();
  b.name = name;
  b.position.fromArray(position);
  parent.add(b);
  bones.push(b);
  return b;
}
const root = bone('Root', model, [0, 0, 0]);
const pelvis = bone('Pelvis', root, [0, -0.5, 0]);
const chest = bone('Chest', pelvis, [0, 0.3, 0]);
const head = bone('Head', chest, [0, 0.6, 0]);
const earL = bone('Ear_L', head, [-0.43, 0.42, -0.035]);
const earLT = bone('EarTip_L', earL, [-0.32, 0.35, 0]);
const earR = bone('Ear_R', head, [0.43, 0.42, -0.035]);
const earRT = bone('EarTip_R', earR, [0.32, 0.35, 0]);
const armL = bone('Arm_L', chest, [-0.32, -0.07, 0]);
const armR = bone('Arm_R', chest, [0.32, -0.07, 0]);
const footL = bone('Foot_L', pelvis, [-0.23, -0.29, 0.03]);
const footR = bone('Foot_R', pelvis, [0.23, -0.29, 0.03]);
const eyeL = bone('Eye_L', head, [-0.22, 0.015, 0.466]);
const eyeR = bone('Eye_R', head, [0.22, 0.015, 0.466]);
model.updateMatrixWorld(true);
const skeleton = new T.Skeleton(bones);
const material = color =>
  new T.MeshStandardMaterial({color, roughness: 0.78, metalness: 0});
const red = material('#ef5524'),
  cream = material('#fff1b3'),
  gold = material('#ffd346');
const dark = material('#592f29'),
  blush = material('#ffab68'),
  white = material('#fffaf0');
function skin(name, geometry, mat, primary, blend) {
  const indices = [],
    weights = [];
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const pair = blend?.(new T.Vector3().fromBufferAttribute(p, i));
    indices.push(
      bones.indexOf(primary),
      pair ? bones.indexOf(pair[0]) : 0,
      0,
      0,
    );
    const w = pair ? T.MathUtils.clamp(pair[1], 0, 1) : 0;
    weights.push(1 - w, w, 0, 0);
  }
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  const mesh = new T.SkinnedMesh(geometry, mat);
  mesh.name = name;
  model.add(mesh);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  return mesh;
}
function ellipsoid(name, center, scale, mat, joint, blend, rotation = 0) {
  const g = new T.SphereGeometry(1, 32, 20);
  g.scale(...scale);
  g.rotateZ(rotation);
  g.translate(...center);
  return skin(name, g, mat, joint, blend);
}
ellipsoid('Body', [0, -0.48, 0], [0.36, 0.47, 0.29], red, pelvis, p => [
  chest,
  (p.y + 0.72) / 0.5,
]);
ellipsoid(
  'Belly',
  [0, -0.42, 0.252],
  [0.255, 0.295, 0.068],
  cream,
  pelvis,
  p => [chest, (p.y + 0.72) / 0.5],
);
ellipsoid('HeadShell', [0, 0.4, 0], [0.635, 0.59, 0.455], red, head);
ellipsoid('Face', [0, 0.325, 0.374], [0.55, 0.475, 0.146], cream, head);
// Forehead cap gives the face a shallow central notch, with the signature gold mark.
ellipsoid('Forehead', [0, 0.827, 0.347], [0.23, 0.16, 0.085], red, head);
const diamond = new T.Shape();
diamond.moveTo(0, 0.98);
diamond.lineTo(0.115, 0.865);
diamond.lineTo(0, 0.72);
diamond.lineTo(-0.115, 0.865);
diamond.closePath();
const mark = new T.ExtrudeGeometry(diamond, {
  depth: 0.012,
  bevelEnabled: true,
  bevelSegments: 2,
  steps: 1,
  bevelSize: 0.012,
  bevelThickness: 0.008,
});
mark.translate(0, 0, 0.423);
skin('ForeheadMark', mark, gold, head);
for (const sign of [-1, 1]) {
  const eye = sign < 0 ? eyeL : eyeR;
  ellipsoid(
    sign < 0 ? 'EyeLeft' : 'EyeRight',
    [sign * 0.22, 0.415, 0.491],
    [0.102, 0.135, 0.045],
    dark,
    eye,
  );
  ellipsoid(
    `EyeShine${sign}`,
    [sign * 0.22 - 0.025, 0.466, 0.531],
    [0.034, 0.04, 0.012],
    white,
    eye,
  );
  ellipsoid(
    `EyeShineSmall${sign}`,
    [sign * 0.22 + 0.028, 0.372, 0.531],
    [0.013, 0.014, 0.008],
    white,
    eye,
  );
  ellipsoid(
    `Cheek${sign}`,
    [sign * 0.398, 0.197, 0.457],
    [0.115, 0.088, 0.032],
    blush,
    head,
  );
  ellipsoid(
    `Arm${sign}`,
    [sign * 0.425, -0.365, 0.04],
    [0.14, 0.265, 0.14],
    red,
    sign < 0 ? armL : armR,
    null,
    sign * 0.6,
  );
  ellipsoid(
    `Foot${sign}`,
    [sign * 0.235, -0.878, 0.133],
    [0.205, 0.13, 0.26],
    red,
    sign < 0 ? footL : footR,
  );
}
ellipsoid('Muzzle', [0, 0.16, 0.505], [0.143, 0.068, 0.028], cream, head);
const smile = new T.CatmullRomCurve3([
  new T.Vector3(-0.095, 0.1, 0.502),
  new T.Vector3(-0.047, 0.064, 0.526),
  new T.Vector3(0, 0.083, 0.53),
  new T.Vector3(0.047, 0.064, 0.526),
  new T.Vector3(0.095, 0.1, 0.502),
]);
skin('Smile', new T.TubeGeometry(smile, 28, 0.009, 8, false), dark, head);
// Leaf-shaped ears with two-joint blended skinning. Geometry is in bind-pose world space.
function ear(sign, base, tip) {
  const positions = [],
    normals = [],
    colors = [],
    index = [];
  const rings = 22,
    sides = 18;
  const direction = new T.Vector3(sign * 0.79, 0.61, 0).normalize();
  const side = new T.Vector3(direction.y, -direction.x, 0);
  const origin = new T.Vector3(sign * 0.43, 0.82, -0.035);
  for (let i = 0; i <= rings; i++) {
    const u = i / rings,
      bulge = Math.pow(Math.sin(Math.PI * u), 0.8);
    const center = origin.clone().addScaledVector(direction, u * 0.93);
    center.z += Math.sin(Math.PI * u) * 0.025;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const point = center
        .clone()
        .addScaledVector(side, Math.cos(a) * (0.022 + 0.205 * bulge));
      point.z += Math.sin(a) * (0.015 + 0.087 * bulge);
      positions.push(...point);
      const color = new T.Color(u > 0.73 ? '#ffd346' : '#ef5524');
      colors.push(color.r, color.g, color.b);
      if (i < rings && j < sides) {
        const k = i * (sides + 1) + j;
        index.push(
          k,
          k + sides + 1,
          k + 1,
          k + 1,
          k + sides + 1,
          k + sides + 2,
        );
      }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const mat = material('#ffffff');
  mat.vertexColors = true;
  mat.side = T.DoubleSide;
  skin(sign < 0 ? 'EarLeft' : 'EarRight', g, mat, base, p => [
    tip,
    (p.clone().sub(origin).dot(direction) / 0.93 - 0.18) / 0.64,
  ]);
}
ear(-1, earL, earLT);
ear(1, earR, earRT);

function rotation(joint, times, angles, axis = 'z') {
  const vector = new T.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0,
  );
  return new T.QuaternionKeyframeTrack(
    joint.name + '.quaternion',
    times,
    angles.flatMap(a =>
      new T.Quaternion().setFromAxisAngle(vector, a).toArray(),
    ),
  );
}
function scale(joint, times, values) {
  return new T.VectorKeyframeTrack(joint.name + '.scale', times, values.flat());
}
function bob(times, values) {
  return new T.VectorKeyframeTrack(
    'Root.position',
    times,
    values.flatMap(v => [0, v, 0]),
  );
}
const blink = duration =>
  [eyeL, eyeR].map(b =>
    scale(
      b,
      [0, 2.2, 2.28, 2.38, 2.47, duration],
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 0.09, 1],
        [1, 0.09, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
    ),
  );
const idle = new T.AnimationClip('idle', 4, [
  scale(
    chest,
    [0, 2, 4],
    [
      [1, 1, 1],
      [1.018, 1.025, 1.018],
      [1, 1, 1],
    ],
  ),
  rotation(head, [0, 2, 4], [0.025, -0.025, 0.025]),
  rotation(earLT, [0, 1.8, 2.1, 2.4, 4], [0, 0, 0.09, 0, 0]),
  ...blink(4),
]);
const listen = new T.AnimationClip('listen', 3, [
  rotation(head, [0, 0.65, 2.5, 3], [0, -0.11, -0.11, 0]),
  rotation(earL, [0, 0.65, 2.5, 3], [0, -0.25, -0.25, 0]),
  rotation(earR, [0, 0.65, 2.5, 3], [0, 0.25, 0.25, 0]),
  rotation(earLT, [0, 0.65, 2.5, 3], [0, -0.12, -0.12, 0]),
  rotation(earRT, [0, 0.65, 2.5, 3], [0, 0.12, 0.12, 0]),
  ...blink(3),
]);
const thinking = new T.AnimationClip('thinking', 4, [
  rotation(head, [0, 1, 3, 4], [0, 0.17, 0.17, 0]),
  rotation(earLT, [0, 1, 3, 4], [0, 0.22, 0.22, 0]),
  rotation(armR, [0, 1, 3, 4], [0, 1.1, 1.1, 0]),
  ...blink(4),
]);
const confirm = new T.AnimationClip('confirm', 1.15, [
  rotation(head, [0, 0.25, 0.5, 0.75, 1.15], [0, 0.18, -0.05, 0.1, 0], 'x'),
]);
const success = new T.AnimationClip('success', 1.3, [
  bob([0, 0.2, 0.48, 0.75, 0.95, 1.3], [0, -0.055, 0.23, 0.04, 0, 0]),
  rotation(armL, [0, 0.3, 0.6, 1.3], [0, -0.6, -0.6, 0]),
  rotation(armR, [0, 0.3, 0.6, 1.3], [0, 0.6, 0.6, 0]),
  rotation(earLT, [0, 0.2, 0.5, 0.8, 1.3], [0, 0.12, -0.18, 0.08, 0]),
  rotation(earRT, [0, 0.2, 0.5, 0.8, 1.3], [0, -0.12, 0.18, -0.08, 0]),
]);
const error = new T.AnimationClip('error', 1.5, [
  rotation(
    head,
    [0, 0.3, 0.55, 0.8, 1.1, 1.5],
    [0, -0.16, 0.16, -0.1, 0.06, 0],
    'y',
  ),
  rotation(earL, [0, 0.5, 1.1, 1.5], [0, 0.16, 0.16, 0]),
  rotation(earR, [0, 0.5, 1.1, 1.5], [0, -0.16, -0.16, 0]),
]);
const animations = [idle, listen, thinking, confirm, success, error];
const buffer = await new GLTFExporter().parseAsync(model, {
  binary: true,
  animations,
  onlyVisible: true,
});
const target = new URL(
  '../src/features/task/avatar/mika-prototype.glb',
  import.meta.url,
);
await fs.writeFile(target, new Uint8Array(buffer));
console.log(
  `Generated ${target.pathname}: ${buffer.byteLength} bytes, ${bones.length} bones, ${animations.length} clips`,
);
