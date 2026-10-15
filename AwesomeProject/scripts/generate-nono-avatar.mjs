/** Rig the user's imported NoNo geometry. Input: JSON from import-nono-3mf.py. */
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import fs from 'node:fs/promises';

const input = process.argv[2];
if (!input)
  throw new Error('Pass the geometry JSON produced by import-nono-3mf.py');
const source = JSON.parse(await fs.readFile(input, 'utf8'));
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    });
  }
};
const model = new T.Group();
model.name = 'NoNoCompanion';
model.userData = {
  source: source.provenance,
  adaptation:
    'Local preview: materials, rigid skeletal rig and ten companion clips',
};
const bones = [];
function joint(name, parent, position) {
  const b = new T.Bone();
  b.name = name;
  b.position.fromArray(position);
  parent.add(b);
  bones.push(b);
  return b;
}
const root = joint('Root', model, [0, 0, 0]);
const head = joint('Head', root, [0, 0, 0]);
const earL = joint('Ear_L', head, [-0.76, 0.87, 0]);
const earR = joint('Ear_R', head, [0.76, 0.87, 0]);
const finL = joint('Fin_L', head, [-0.97, -0.58, 0]);
const finR = joint('Fin_R', head, [0.97, -0.58, 0]);
const eyeL = joint('Eye_L', head, [-0.32, 0.17, 1.012]);
const eyeR = joint('Eye_R', head, [0.32, 0.17, 1.012]);
model.updateMatrixWorld(true);
const skeleton = new T.Skeleton(bones);
const ceramic = new T.MeshStandardMaterial({
  color: '#e9eff0',
  roughness: 0.34,
  metalness: 0.08,
});
const screen = new T.MeshStandardMaterial({
  color: '#09121b',
  roughness: 0.38,
  metalness: 0.12,
});
const light = new T.MeshStandardMaterial({
  color: '#16d9d6',
  emissive: '#0bc9cc',
  emissiveIntensity: 0.65,
  roughness: 0.35,
  metalness: 0.05,
});
const finMat = new T.MeshStandardMaterial({
  color: '#40d7d7',
  roughness: 0.38,
  metalness: 0.14,
});
const earMat = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.38,
  metalness: 0.1,
});

function skin(name, geometry, material, bone) {
  const count = geometry.attributes.position.count;
  const indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    indices[i * 4] = bones.indexOf(bone);
    weights[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
  const mesh = new T.SkinnedMesh(geometry, material);
  mesh.name = name;
  model.add(mesh);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  return mesh;
}
const joints = {
  Shell: head,
  Visor: head,
  EarLeft: earL,
  EarRight: earR,
  FinLeft: finL,
  FinRight: finR,
};
// Thin assembly seams follow cross-sections of the downloaded antenna meshes.
const jointLine = new T.MeshStandardMaterial({
  color: '#25565c',
  roughness: 0.6,
  metalness: 0.12,
});
function antennaSeam(part, height, index) {
  const points = [];
  for (const tri of part.triangles)
    for (let e = 0; e < 3; e++) {
      const a = part.positions[tri[e]],
        b = part.positions[tri[(e + 1) % 3]];
      if (a[1] < height === b[1] < height) continue;
      const t = (height - a[1]) / (b[1] - a[1]);
      points.push(
        new T.Vector3(
          a[0] + t * (b[0] - a[0]),
          height,
          a[2] + t * (b[2] - a[2]),
        ),
      );
    }
  const unique = [
    ...new Map(
      points.map(p => [`${p.x.toFixed(5)},${p.z.toFixed(5)}`, p]),
    ).values(),
  ];
  if (unique.length < 3) return;
  const center = unique
    .reduce((v, p) => v.add(p), new T.Vector3())
    .divideScalar(unique.length);
  unique.sort(
    (a, b) =>
      Math.atan2(a.z - center.z, a.x - center.x) -
      Math.atan2(b.z - center.z, b.x - center.x),
  );
  const curve = new T.CatmullRomCurve3(unique, true, 'centripetal');
  const g = new T.TubeGeometry(curve, 128, 0.0028, 6, true);
  g.translate(part.name === 'EarLeft' ? -0.12 : 0.12, 0.18, 0);
  skin(`${part.name}Seam${index}`, g, jointLine, joints[part.name]);
}
for (const part of source.meshes) {
  // The print visor has deep eye recesses. Replace that display surface with a
  // smooth curved panel so it supports animated eyes without permanent dents.
  if (part.name === 'Visor' || part.name === 'Shell') continue;
  const g = new T.BufferGeometry();
  g.setAttribute(
    'position',
    new T.Float32BufferAttribute(part.positions.flat(), 3),
  );
  g.setAttribute(
    'normal',
    new T.Float32BufferAttribute(part.normals.flat(), 3),
  );
  g.setIndex(part.triangles.flat());

  let mat =
    part.name === 'Shell' ? ceramic : part.name === 'Visor' ? screen : finMat;
  if (part.name.startsWith('Ear')) {
    const colors = [];
    for (const p of part.positions) {
      const mix = T.MathUtils.smoothstep(p[1], 1.02, 1.16);
      const c = new T.Color('#17232e').lerp(new T.Color('#25dadd'), mix);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    mat = earMat;
  }
  if (part.name.startsWith('Ear')) {
    const sign = part.name === 'EarLeft' ? -1 : 1;
    g.translate(sign * 0.12, 0.18, 0);
    antennaSeam(part, 0.92, 0);
    antennaSeam(part, 1.3, 1);
  }
  const mesh = skin(part.name, g, mat, joints[part.name]);
  mesh.userData.sourceObject = part.sourceObject;
}
// Retopologize the spherical housing for the screen: no print seams or sockets.
const housing = new T.SphereGeometry(1, 96, 64);
const shellMesh = skin('Shell', housing, ceramic, head);
shellMesh.userData.sourceObject = '4 (spherical housing retopology)';
function surfaceZ(x, y, offset = 0) {
  return Math.sqrt(Math.max(0.02, 1 - x * x - y * y)) + offset;
}
// Oval display follows the shell's curvature; its contour comes from the supplied
// front reference. The four fins retain the imported source geometry.
const panelPositions = [0, 0.15, surfaceZ(0, 0.15, 0.023)],
  panelIndices = [];
const rings = 24,
  segments = 96;
for (let r = 1; r <= rings; r++)
  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2,
      radius = r / rings;
    const x = 0.85 * radius * Math.cos(angle),
      y = 0.15 + 0.58 * radius * Math.sin(angle);
    panelPositions.push(x, y, surfaceZ(x, y, 0.023));
    const i = 1 + (r - 1) * segments + s,
      next = 1 + (r - 1) * segments + ((s + 1) % segments);
    if (r === 1) panelIndices.push(0, i, next);
    if (r < rings)
      panelIndices.push(
        i,
        i + segments,
        next,
        next,
        i + segments,
        next + segments,
      );
  }
const panel = new T.BufferGeometry();
panel.setAttribute('position', new T.Float32BufferAttribute(panelPositions, 3));
panel.setIndex(panelIndices);
panel.computeVertexNormals();
skin('Display', panel, screen, head);
// Screen lights sit above the source's printed eye recesses. They have their own
// bones so blinks and expression changes are exported in the GLB, not CSS motion.
for (const [sign, eye] of [
  [-1, eyeL],
  [1, eyeR],
]) {
  const g = new T.CapsuleGeometry(0.065, 0.35, 6, 12);
  g.scale(1, 1, 0.25);
  g.translate(sign * 0.32, 0.17, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++)
    pos.setZ(i, surfaceZ(pos.getX(i), pos.getY(i), 0.047) + pos.getZ(i));
  g.computeVertexNormals();
  skin(sign < 0 ? 'EyeLeft' : 'EyeRight', g, light, eye);
}
// Layered controls and curved cheek plates restore the reference's small contours.
const silver = new T.MeshStandardMaterial({
  color: '#bcc8cc',
  metalness: 0.55,
  roughness: 0.3,
});
const seam = new T.MeshStandardMaterial({
  color: '#48575e',
  metalness: 0.3,
  roughness: 0.48,
});
function bendToBody(g, offset) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setZ(i, surfaceZ(p.getX(i), p.getY(i), offset) + p.getZ(i));
  g.computeVertexNormals();
  return g;
}
function coreRing(name, radius, thickness, offset, mat) {
  const g = new T.TorusGeometry(radius, thickness, 12, 64);
  g.translate(0, -0.6, 0);
  skin(name, bendToBody(g, offset), mat, head);
}
coreRing('CoreSocket', 0.146, 0.015, 0.015, seam);
coreRing('CoreRing', 0.138, 0.011, 0.032, light);
coreRing('CoreBezel', 0.116, 0.014, 0.055, silver);
const core = new T.CylinderGeometry(0.104, 0.104, 0.045, 64);
core.rotateX(Math.PI / 2);
core.translate(0, -0.6, 0);
skin('Core', bendToBody(core, 0.07), silver, head);
for (const sign of [-1, 1]) {
  const shape = new T.Shape();
  shape.moveTo(0.235, -0.6);
  shape.quadraticCurveTo(0.35, -0.615, 0.465, -0.55);
  shape.quadraticCurveTo(0.51, -0.53, 0.495, -0.59);
  shape.quadraticCurveTo(0.43, -0.68, 0.25, -0.69);
  shape.quadraticCurveTo(0.235, -0.655, 0.235, -0.6);
  const plate = new T.ExtrudeGeometry(shape, {
    depth: 0.009,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.006,
    bevelSegments: 3,
    curveSegments: 20,
  });
  // Rotate before projecting so both plates keep outward-facing normals.
  if (sign < 0) plate.rotateY(Math.PI);
  skin(
    sign < 0 ? 'CheekPlateLeft' : 'CheekPlateRight',
    bendToBody(plate, 0.018),
    silver,
    head,
  );
}
const capSocket = new T.CylinderGeometry(0.161, 0.17, 0.018, 64);
capSocket.translate(0, 0.994, 0);
skin('TopCapSocket', capSocket, seam, head);
const cap = new T.CylinderGeometry(0.15, 0.15, 0.035, 64);
cap.translate(0, 1.017, 0);
skin('TopCap', cap, silver, head);

function rotation(b, times, angles, axis = 'z') {
  // Expressive companion motion: body leads, floating appendages follow.
  const gain = b === head ? 2.2 : b === earL || b === earR ? 1.5 : 1.6;
  const v = new T.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0,
  );
  return new T.QuaternionKeyframeTrack(
    b.name + '.quaternion',
    times,
    angles.flatMap(a =>
      new T.Quaternion().setFromAxisAngle(v, a * gain).toArray(),
    ),
  );
}
function blink(duration, at = 2.2) {
  return [eyeL, eyeR].map(
    b =>
      new T.VectorKeyframeTrack(
        b.name + '.scale',
        [0, at, at + 0.07, at + 0.16, at + 0.26, duration],
        [
          [1, 1, 1],
          [1, 1, 1],
          [1, 0.1, 1],
          [1, 0.1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ].flat(),
      ),
  );
}
const bob = (times, heights) =>
  new T.VectorKeyframeTrack(
    'Root.position',
    times,
    heights.flatMap(y => [0, y * 2.2, 0]),
  );
const idle = new T.AnimationClip('idle', 4, [
  bob([0, 1, 2, 3, 4], [0, 0.04, 0, -0.04, 0]),
  rotation(head, [0, 2, 4], [-0.015, 0.015, -0.015]),
  rotation(finL, [0, 2, 4], [0.015, -0.015, 0.015]),
  rotation(finR, [0, 2, 4], [-0.015, 0.015, -0.015]),
  ...blink(4),
]);
const listen = new T.AnimationClip('listen', 3, [
  rotation(head, [0, 0.6, 2.4, 3], [0, -0.09, -0.09, 0]),
  rotation(earL, [0, 0.6, 2.4, 3], [0, -0.16, -0.16, 0]),
  rotation(earR, [0, 0.6, 2.4, 3], [0, 0.16, 0.16, 0]),
  bob([0, 1.5, 3], [0, 0.035, 0]),
  ...blink(3),
]);
const thinking = new T.AnimationClip('thinking', 4, [
  rotation(head, [0, 0.8, 3.2, 4], [0, 0.14, 0.14, 0]),
  rotation(earL, [0, 0.8, 3.2, 4], [0, 0.12, 0.12, 0]),
  rotation(finR, [0, 0.8, 3.2, 4], [0, 0.3, 0.3, 0]),
  ...blink(4),
]);
const confirm = new T.AnimationClip('confirm', 1.2, [
  rotation(head, [0, 0.25, 0.5, 0.8, 1.2], [0, 0.14, -0.04, 0.08, 0], 'x'),
]);
const success = new T.AnimationClip('success', 1.5, [
  bob([0, 0.2, 0.55, 0.85, 1.2, 1.5], [0, -0.04, 0.2, 0.1, 0, 0]),
  rotation(finL, [0, 0.35, 0.8, 1.5], [0, -0.35, -0.35, 0]),
  rotation(finR, [0, 0.35, 0.8, 1.5], [0, 0.35, 0.35, 0]),
  rotation(earL, [0, 0.4, 0.8, 1.5], [0, -0.08, 0.05, 0]),
  rotation(earR, [0, 0.4, 0.8, 1.5], [0, 0.08, -0.05, 0]),
]);
const error = new T.AnimationClip('error', 1.5, [
  rotation(
    head,
    [0, 0.3, 0.6, 0.9, 1.2, 1.5],
    [0, -0.14, 0.14, -0.08, 0.04, 0],
    'y',
  ),
  rotation(earL, [0, 0.4, 1.1, 1.5], [0, 0.12, 0.12, 0]),
  rotation(earR, [0, 0.4, 1.1, 1.5], [0, -0.12, -0.12, 0]),
]);
const wave = new T.AnimationClip('wave', 2.4, [
  rotation(
    finR,
    [0, 0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 2, 2.4],
    [0, 0.6, 0.25, 0.65, 0.25, 0.65, 0.3, 0.1, 0],
  ),
  rotation(head, [0, 0.4, 1.8, 2.4], [0, -0.1, -0.1, 0]),
  bob([0, 1.2, 2.4], [0, 0.06, 0]),
  ...blink(2.4, 1.7),
]);
const happy = new T.AnimationClip('happy', 3, [
  rotation(
    head,
    [0, 0.5, 1, 1.5, 2, 2.5, 3],
    [0, -0.12, 0.12, -0.12, 0.12, -0.06, 0],
  ),
  rotation(finL, [0, 0.5, 1.5, 2.5, 3], [0, -0.38, -0.25, -0.38, 0]),
  rotation(finR, [0, 0.5, 1.5, 2.5, 3], [0, 0.38, 0.25, 0.38, 0]),
  bob([0, 0.5, 1, 1.5, 2, 2.5, 3], [0, 0.1, 0, 0.1, 0, 0.05, 0]),
  ...blink(3),
]);
// Flatten depth as well as height: curved eye vertices must not sink into the visor.
const sleepy = new T.AnimationClip('sleepy', 6, [
  rotation(head, [0, 1.2, 3, 4.5, 6], [0, 0.12, 0.15, 0.12, 0], 'x'),
  bob([0, 1.5, 3, 4.5, 6], [0, -0.025, 0, -0.025, 0]),
  ...[eyeL, eyeR].map(
    b =>
      new T.VectorKeyframeTrack(
        b.name + '.scale',
        [0, 1, 2.5, 4.8, 6],
        [
          [1.45, 0.14, 0.15],
          [1.5, 0.12, 0.15],
          [1.55, 0.1, 0.12],
          [1.55, 0.1, 0.12],
          [1.45, 0.14, 0.15],
        ].flat(),
      ),
  ),
]);
const curious = new T.AnimationClip('curious', 3.6, [
  rotation(
    head,
    [0, 0.7, 1.3, 2.2, 2.8, 3.6],
    [0, -0.28, -0.28, 0.28, 0.28, 0],
    'y',
  ),
  rotation(earL, [0, 0.7, 2.8, 3.6], [0, -0.1, -0.1, 0]),
  rotation(earR, [0, 0.7, 2.8, 3.6], [0, 0.1, 0.1, 0]),
  ...blink(3.6, 2.9),
]);
const animations = [
  idle,
  listen,
  thinking,
  confirm,
  success,
  error,
  wave,
  happy,
  sleepy,
  curious,
];
const buffer = await new GLTFExporter().parseAsync(model, {
  binary: true,
  animations,
});
const output = new URL(
  '../src/features/task/avatar/nono-companion.glb',
  import.meta.url,
);
await fs.writeFile(output, new Uint8Array(buffer));
console.log(
  `${output.pathname}: ${buffer.byteLength} bytes, ${bones.length} bones, ${animations.length} clips`,
);
