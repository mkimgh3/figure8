// Bjorn, a polar bear on skates (v3-look48, Mark: "add fourth character a polar bear standing skating. it has a scarf
// that is flowy"). Nothing is loaded: his body is built here the first time he is chosen.
//   body   one smooth skin, from rounded shapes (belly, chest, shoulders, neck, head, snout, ears, tail, limbs) melted
//          together as a signed distance field and turned into a mesh (surface nets), skinned straight onto the simple
//          figure's joints (model.js), so every pose, dance and jump works for him as for the others
//   fur    shells over the skin, each drawing the cross-sections of short strands at its own height
//   face   black eyes and nose; black skates with steel blades
//   scarf  a knitted scarf round his neck whose two tails are simulated (a chain of points with gravity, air drag and a
//          flutter) and fly out behind him as he skates and spins
// He has the same face to the game as a loaded body (avatar.js): visible, night(), reflection(), update(), hands().
import * as THREE from './three.js';
import { HIP } from './model.js';
import { iceY, iceMirror } from '../core/terrain.js';

// ---- signed distance shapes (negative inside), in the figure's own space: feet at y 0, facing +z
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// an ellipsoid (a close approximation that is exact enough near the surface)
function ellipsoid(c, r) {
  const f = (x, y, z) => {
    const px = (x - c[0]) / r[0],
      py = (y - c[1]) / r[1],
      pz = (z - c[2]) / r[2],
      k0 = Math.sqrt(px * px + py * py + pz * pz),
      k1 = Math.sqrt((px * px) / (r[0] * r[0]) + (py * py) / (r[1] * r[1]) + (pz * pz) / (r[2] * r[2]));
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  };
  const m = Math.max(r[0], r[1], r[2]);
  f.box = [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m];
  return f;
}
// a limb: a segment from a to b, its radius going from ra to rb
function limb(a, b, ra, rb) {
  const bx = b[0] - a[0],
    by = b[1] - a[1],
    bz = b[2] - a[2],
    bb = bx * bx + by * by + bz * bz;
  const f = (x, y, z) => {
    const px = x - a[0],
      py = y - a[1],
      pz = z - a[2],
      h = clamp01((px * bx + py * by + pz * bz) / bb),
      dx = px - bx * h,
      dy = py - by * h,
      dz = pz - bz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  };
  const m = Math.max(ra, rb);
  f.box = [
    Math.min(a[0], b[0]) - m,
    Math.min(a[1], b[1]) - m,
    Math.min(a[2], b[2]) - m,
    Math.max(a[0], b[0]) + m,
    Math.max(a[1], b[1]) + m,
    Math.max(a[2], b[2]) + m,
  ];
  return f;
}
// a smooth union: the two shapes melt into each other over about k metres
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

// ---- surface nets: a mesh of the surface f = 0 inside the box from `lo`, `n` points each way, `cell` metres apart
function surfaceNets(f, lo, n, cell) {
  const [nx, ny, nz] = n,
    vals = new Float32Array(nx * ny * nz),
    at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) vals[at(i, j, k)] = f(lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell);
  const cx = nx - 1,
    cy = ny - 1,
    cz = nz - 1,
    cid = (i, j, k) => i + cx * (j + cy * k),
    vix = new Int32Array(cx * cy * cz).fill(-1),
    pos = [],
    idx = [];
  const C = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ],
    E = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ],
    v = new Float32Array(8);
  // a point in each cell the surface passes through: the average of where it crosses the cell's edges
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let q = 0; q < 8; q++) {
          v[q] = vals[at(i + C[q][0], j + C[q][1], k + C[q][2])];
          if (v[q] < 0) mask |= 1 << q;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0,
          sy = 0,
          sz = 0,
          cnt = 0;
        for (const [a, b] of E) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += C[a][0] + (C[b][0] - C[a][0]) * t;
          sy += C[a][1] + (C[b][1] - C[a][1]) * t;
          sz += C[a][2] + (C[b][2] - C[a][2]) * t;
          cnt++;
        }
        vix[cid(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / cnt) * cell, lo[1] + (j + sy / cnt) * cell, lo[2] + (k + sz / cnt) * cell);
      }
  // a quad across every grid edge the surface crosses, joining the points of the four cells round it
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) {
        const s0 = vals[at(i, j, k)] < 0;
        if (j > 0 && k > 0 && s0 !== vals[at(i + 1, j, k)] < 0)
          quad(vix[cid(i, j, k)], vix[cid(i, j - 1, k)], vix[cid(i, j - 1, k - 1)], vix[cid(i, j, k - 1)]);
        if (i > 0 && k > 0 && s0 !== vals[at(i, j + 1, k)] < 0)
          quad(vix[cid(i, j, k)], vix[cid(i - 1, j, k)], vix[cid(i - 1, j, k - 1)], vix[cid(i, j, k - 1)]);
        if (i > 0 && j > 0 && s0 !== vals[at(i, j, k + 1)] < 0)
          quad(vix[cid(i, j, k)], vix[cid(i - 1, j, k)], vix[cid(i - 1, j - 1, k)], vix[cid(i, j - 1, k)]);
      }
  return { pos, idx };
}

const fh = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// Bones: the joints of the simple figure his skin follows
const BONES = [
  'inner',
  'armL.g',
  'armL.lower',
  'armR.g',
  'armR.lower',
  'legL.g',
  'legL.lower',
  'legL.foot',
  'legR.g',
  'legR.lower',
  'legR.foot',
];
// his arms out and down and his legs a little apart while the skin is built, so nothing grows together that has to move apart
const BIND_ARM = 1.2,
  BIND_LEG = 0.09;

export function createBear(models, index, scene, opts = {}) {
  const rig = models.chars[index],
    D = rig.dims,
    hero = models.hero,
    bones = BONES.map((p) => p.split('.').reduce((o, k) => o[k], rig));

  // ---- the figure at rest, at the origin, unscaled, facing +z, while the skin is built
  const keep = {
    p: hero.position.clone(),
    r: hero.rotation.clone(),
    s: hero.scale.clone(),
    by: models.body.position.y,
    br: models.body.rotation.clone(),
    rots: bones.map((b) => b.rotation.clone()),
    vis: rig.inner.visible,
  };
  hero.position.set(0, 0, 0);
  hero.rotation.set(0, 0, 0);
  hero.scale.set(1, 1, 1);
  models.body.position.y = HIP;
  models.body.rotation.set(0, 0, 0);
  bones.forEach((b) => b.rotation.set(0, 0, 0));
  rig.armL.g.rotation.z = -BIND_ARM;
  rig.armR.g.rotation.z = BIND_ARM;
  rig.legL.g.rotation.z = -BIND_LEG;
  rig.legR.g.rotation.z = BIND_LEG;
  hero.updateMatrixWorld(true);
  const W = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z)).toArray();
  const J = {};
  for (const s of ['L', 'R']) {
    const a = rig['arm' + s],
      l = rig['leg' + s];
    J['sh' + s] = W(a.g);
    J['el' + s] = W(a.lower);
    J['wr' + s] = W(a.lower, 0, -D.fore[2]);
    J['pw' + s] = W(a.lower, 0, -D.fore[2] - 0.06);
    J['hp' + s] = W(l.g);
    J['kn' + s] = W(l.lower);
    J['an' + s] = W(l.foot);
  }
  const inverses = bones.map((b) => b.matrixWorld.clone().invert()),
    bindWorld = bones.map((b) => b.matrixWorld.clone());

  // ---- his shape: [shape, bone, how softly it melts into what came before (m)]
  const P = [
    [ellipsoid([0, 0.92, -0.03], [0.245, 0.2, 0.225]), 0, 0],
    [ellipsoid([0, 1.06, 0.03], [0.29, 0.29, 0.26]), 0, 0.09],
    [ellipsoid([0, 1.28, 0.0], [0.24, 0.2, 0.2]), 0, 0.1],
    [limb([-0.2, 1.345, -0.01], [0.2, 1.345, -0.01], 0.1, 0.1), 0, 0.08],
    [limb([0, 1.36, 0.0], [0, 1.52, 0.07], 0.125, 0.1), 0, 0.07],
    [ellipsoid([0, 1.6, 0.085], [0.112, 0.108, 0.125]), 0, 0.06],
    [limb([0, 1.585, 0.15], [0, 1.56, 0.29], 0.064, 0.046), 0, 0.045],
    [ellipsoid([0, 1.54, 0.17], [0.054, 0.035, 0.075]), 0, 0.035],
    [ellipsoid([-0.078, 1.695, 0.04], [0.037, 0.037, 0.024]), 0, 0.022],
    [ellipsoid([0.078, 1.695, 0.04], [0.037, 0.037, 0.024]), 0, 0.022],
    [ellipsoid([0, 0.94, -0.23], [0.05, 0.05, 0.04]), 0, 0.03],
  ];
  for (const [s, b] of [
    ['L', 1],
    ['R', 3],
  ]) {
    P.push([limb(J['sh' + s], J['el' + s], D.upper[0] + 0.005, D.upper[1]), b, 0.06]);
    P.push([limb(J['el' + s], J['wr' + s], D.fore[0], D.fore[1]), b + 1, 0.04]);
    P.push([limb(J['wr' + s], J['pw' + s], 0.08, 0.078), b + 1, 0.03]);
  }
  for (const [s, b] of [
    ['L', 5],
    ['R', 8],
  ]) {
    P.push([limb(J['hp' + s], J['kn' + s], D.thigh[0] + 0.005, D.thigh[1]), b, 0.07]);
    P.push([limb(J['kn' + s], J['an' + s], D.shin[0], D.shin[1]), b + 1, 0.04]);
  }
  // the union of everything, skipping shapes too far away to matter
  const sdf = (x, y, z) => {
    let d = 1e9;
    for (const [f, , k] of P) {
      const bx = f.box,
        m = k + 0.05;
      if (x < bx[0] - m || y < bx[1] - m || z < bx[2] - m || x > bx[3] + m || y > bx[4] + m || z > bx[5] + m) {
        d = Math.min(d, 0.5);
        continue;
      }
      const v = f(x, y, z);
      d = k > 0 ? smin(d, v, k) : Math.min(d, v);
    }
    return d;
  };
  // where a line from p going along d first meets his skin
  const hit = (p, d) => {
    const q = p.slice();
    for (let i = 0; i < 400 && sdf(q[0], q[1], q[2]) > 0; i++) for (let k = 0; k < 3; k++) q[k] += d[k] * 0.002;
    return q;
  };
  const cell = opts.cell || 0.021,
    lo = [-0.95, 0.0, -0.34],
    hi = [0.95, 1.8, 0.36],
    n = lo.map((l, i) => Math.ceil((hi[i] - l) / cell) + 1);
  const net = surfaceNets(sdf, lo, n, cell),
    N = net.pos.length / 3,
    pos = new Float32Array(net.pos);
  // onto the surface, and the normal from the field's slope
  const nrm = new Float32Array(N * 3),
    e = 0.004;
  for (let i = 0; i < N; i++) {
    let x = pos[i * 3],
      y = pos[i * 3 + 1],
      z = pos[i * 3 + 2];
    let gx = 0,
      gy = 0,
      gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = sdf(x, y, z);
      gx = sdf(x + e, y, z) - sdf(x - e, y, z);
      gy = sdf(x, y + e, z) - sdf(x, y - e, z);
      gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (it < 2 && g2 > 1e-12) {
        const s = (d * 2 * e) / g2;
        x -= gx * s;
        y -= gy * s;
        z -= gz * s;
      }
    }
    const l = Math.hypot(gx, gy, gz) || 1;
    pos.set([x, y, z], i * 3);
    nrm.set([gx / l, gy / l, gz / l], i * 3);
  }
  // every triangle wound to face outward
  const idx = net.idx;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3,
      b = idx[t + 1] * 3,
      c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a],
      uy = pos[b + 1] - pos[a + 1],
      uz = pos[b + 2] - pos[a + 2],
      vx = pos[c] - pos[a],
      vy = pos[c + 1] - pos[a + 1],
      vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy,
      fy = uz * vx - ux * vz,
      fz = ux * vy - uy * vx;
    if (
      fx * (nrm[a] + nrm[b] + nrm[c]) +
        fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) +
        fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) <
      0
    ) {
      idx[t + 1] = c / 3;
      idx[t + 2] = b / 3;
    }
  }
  // skin weights: each bone by how near its shapes are (inside or on one: full), the four strongest kept
  const sIdx = new Uint16Array(N * 4),
    sW = new Float32Array(N * 4),
    col = new Float32Array(N * 3),
    w = new Float32Array(bones.length),
    cream = new THREE.Color(0xe6decb),
    warm = new THREE.Color(0xd2c3a4),
    tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3],
      y = pos[i * 3 + 1],
      z = pos[i * 3 + 2];
    w.fill(0);
    for (const [f, b] of P) w[b] = Math.max(w[b], Math.exp(-Math.max(0, f(x, y, z)) / 0.028));
    const order = [...w.keys()].sort((p, q) => w[q] - w[p]).slice(0, 4);
    let sum = 0;
    for (const b of order) sum += w[b];
    order.forEach((b, k) => {
      sIdx[i * 4 + k] = b;
      sW[i * 4 + k] = sum > 0 ? w[b] / sum : k ? 0 : 1;
    });
    // cream fur, warmer and a little darker low on the legs and on the paws, never quite even
    const low = clamp01((0.55 - y) / 0.45),
      paw = Math.max(
        0,
        ...['L', 'R'].map((s) => 1 - Math.hypot(x - J['pw' + s][0], y - J['pw' + s][1], z - J['pw' + s][2]) / 0.12),
      );
    tmp.copy(cream).lerp(warm, Math.min(1, low * 0.7 + paw * 0.6));
    tmp.multiplyScalar(0.95 + 0.05 * fh(x * 9, y * 9, z * 9));
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  // how long his fur is at each point (1 full): short on the muzzle, none round the eyes and nose, which must show
  const EYES = [-1, 1].map((sx) => hit([0.05 * sx, 1.628, 0.35], [0, 0, -1])),
    NOSE = hit([0, 1.567, 0.5], [0, 0, -1]),
    furA = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3],
      y = pos[i * 3 + 1],
      z = pos[i * 3 + 2],
      dist = (q) => Math.hypot(x - q[0], y - q[1], z - q[2]),
      face = Math.min(dist(EYES[0]), dist(EYES[1]), dist(NOSE) - 0.015);
    furA[i] = Math.min(clamp01((face - 0.02) / 0.05), z > 0.19 && y > 1.5 ? 0.3 + 0.7 * clamp01((0.24 - z) / 0.05) : 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('furA', new THREE.BufferAttribute(furA, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sIdx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  geo.setIndex(idx);

  const skeleton = new THREE.Skeleton(bones, inverses),
    ID = new THREE.Matrix4(),
    all = [],
    mirrors = [];
  const skin = (material) => {
    const m = new THREE.SkinnedMesh(geo, material);
    m.bindMode = THREE.DetachedBindMode;
    m.bind(skeleton, ID);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    scene.add(m);
    all.push(m);
    return m;
  };
  const furMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.95,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xfff4e2),
    sheenRoughness: 0.6,
    envMapIntensity: 0.5,
  });
  const body = skin(furMat);
  body.castShadow = true;
  body.renderOrder = 2;
  // fur: shells over the skin, strands placed in the space of his body at rest so they move with him
  const F = Object.assign({ shells: 4, length: 0.026, density: 85, deep: 0xc9bea6, tip: 0xf5efe0 }, opts.fur);
  for (let k = 1; k <= F.shells; k++) {
    const h = k / F.shells,
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(F.deep).lerp(new THREE.Color(F.tip), h),
        roughness: 1,
        side: THREE.DoubleSide,
        envMapIntensity: 0.5,
      });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float furA;\nvarying vec3 vFP, vFN;\nvarying float vFA;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vFP = position; vFN = normal; vFA = furA;
transformed += normal * ${(F.length * h).toFixed(4)} * furA;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vFP, vFN;\nvarying float vFA;\nfloat bh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
if (vFA < 0.05) discard;
{ vec3 q = vFP * ${F.density.toFixed(1)}, c = floor(q), n = normalize(vFN);
  vec3 f = fract(q) - 0.5 + (vec3(bh(c + 1.3), bh(c + 2.7), bh(c + 4.1)) - 0.5) * 0.5;
  f -= n * dot(f, n);
  float len = 0.35 + 0.65 * bh(c);
  if (${h.toFixed(3)} > len || length(f) > 0.62 * (1.0 - ${h.toFixed(3)} / len) + 0.08) discard; }`,
        );
    };
    skin(m).renderOrder = 2;
  }

  // ---- things that move with one joint, rigid: eyes, nose, skates. local: where on that joint, from the rest pose
  const attached = [];
  const attach = (mesh, bone, worldAtRest) => {
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    mesh.userData.local = new THREE.Matrix4().multiplyMatrices(inverses[bone], worldAtRest);
    mesh.userData.bone = bone;
    scene.add(mesh);
    attached.push(mesh);
    all.push(mesh);
    return mesh;
  };
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.2, metalness: 0.1 });
  const at = (x, y, z, s) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), s || new THREE.Vector3(1, 1, 1));
  {
    const eye = new THREE.SphereGeometry(0.017, 14, 10);
    for (const q of EYES) attach(new THREE.Mesh(eye, black), 0, at(q[0], q[1], q[2] + 0.002));
    const q = NOSE;
    attach(
      new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), black),
      0,
      at(q[0], q[1] + 0.004, q[2] - 0.006, new THREE.Vector3(1.05, 0.72, 0.75)),
    );
  }
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x17181f, roughness: 0.35, metalness: 0.05 }),
    steel = new THREE.MeshStandardMaterial({ color: 0xc9d2de, roughness: 0.18, metalness: 1 }),
    bootGeo = new THREE.LatheGeometry(
      [
        [0.001, -0.075],
        [0.075, -0.075],
        [0.096, -0.04],
        [0.1, 0.02],
        [0.106, 0.075],
        [0.001, 0.075],
      ].map((q) => new THREE.Vector2(q[0], q[1])),
      24,
    ),
    toeGeo = new THREE.SphereGeometry(1, 20, 12),
    bladeGeo = new THREE.BoxGeometry(0.014, 0.034, 0.34);
  const skates = [];
  for (const [s, b] of [
    ['L', 7],
    ['R', 10],
  ]) {
    const A = bindWorld[b];
    const part = (geo, mat, x, y, z, sc) => {
      const m = attach(new THREE.Mesh(geo, mat), b, A.clone().multiply(at(x, y, z, sc)));
      m.castShadow = true;
      skates.push(m);
      return m;
    };
    part(bootGeo, bootMat, 0, 0.0, -0.005);
    part(toeGeo, bootMat, 0, -0.035, 0.07, new THREE.Vector3(0.082, 0.045, 0.12));
    part(bladeGeo, steel, 0, -0.095, 0.035);
  }

  // ---- the scarf: a band round his neck, and two tails from a knot at the front, simulated in the world
  const knit = document.createElement('canvas');
  knit.width = 64;
  knit.height = 256;
  {
    const g = knit.getContext('2d');
    // saffron knit with cream and deep red stripes, a fringe at the end of each tail
    g.fillStyle = '#e8a22a';
    g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 200; y += 40) {
      g.fillStyle = '#f6ecd6';
      g.fillRect(0, y + 22, 64, 7);
      g.fillStyle = '#a3262b';
      g.fillRect(0, y + 31, 64, 3);
    }
    for (let y = 0; y < 220; y += 3) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(0, y, 64, 1);
    }
    g.clearRect(0, 220, 64, 36);
    for (let x = 2; x < 64; x += 6) {
      g.fillStyle = '#e8a22a';
      g.fillRect(x, 220, 3, 36);
    }
    g.fillStyle = '#e8a22a';
    g.fillRect(0, 216, 64, 6);
  }
  const knitTex = new THREE.CanvasTexture(knit);
  knitTex.colorSpace = THREE.SRGBColorSpace;
  knitTex.wrapS = THREE.RepeatWrapping;
  const scarfMat = new THREE.MeshStandardMaterial({
    map: knitTex,
    roughness: 0.95,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    transparent: false,
  });
  {
    const band = new THREE.TorusGeometry(0.145, 0.052, 12, 36);
    band.rotateX(Math.PI / 2);
    band.scale(1.12, 1.0, 1.0);
    const bandMat = scarfMat.clone();
    bandMat.map = knitTex.clone();
    bandMat.map.repeat.set(1, 0.25);
    bandMat.map.offset.set(0, 0.3);
    bandMat.map.needsUpdate = true;
    const m = attach(new THREE.Mesh(band, bandMat), 0, at(0, 1.435, 0.012));
    m.castShadow = true;
    // the knot
    attach(
      new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), bandMat),
      0,
      at(0.07, 1.41, 0.155, new THREE.Vector3(1, 0.85, 0.7)),
    );
  }
  const TAILS = (
    opts.tails || [
      [16, 0.06, 0.15, [0.055, 1.395, 0.17]],
      [13, 0.06, 0.14, [0.095, 1.39, 0.16]],
    ]
  ).map(([n, seg, width, root]) => {
    const p = new Float32Array(n * 3),
      q = new Float32Array(n * 3),
      local = new THREE.Vector3(...root).applyMatrix4(inverses[0]);
    const g = new THREE.BufferGeometry(),
      vp = new Float32Array(n * 3 * 3),
      uv = new Float32Array(n * 3 * 2),
      ix = [];
    for (let i = 0; i < n; i++) {
      // down the tail from the knot (the top of the knit picture) to the fringe (its bottom)
      // three across each point (an edge, the middle, the other edge), so the knit can curl
      const v = 1 - i / (n - 1);
      uv.set([0, v, 0.5, v, 1, v], i * 6);
      if (i < n - 1)
        for (let c = 0; c < 2; c++) {
          const a = i * 3 + c;
          ix.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
        }
    }
    g.setAttribute('position', new THREE.BufferAttribute(vp, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(ix);
    const mesh = new THREE.Mesh(g, scarfMat);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.renderOrder = 2;
    scene.add(mesh);
    all.push(mesh);
    return { n, seg, width, p, q, local, g, vp, mesh, ready: false };
  });
  // round shapes of him the tails cannot pass through: [centre at rest, radius]
  const BALLS = [
    [[0, 1.26, 0.0], 0.22],
    [[0, 1.03, 0.04], 0.26],
    [[0, 1.6, 0.06], 0.15],
  ].map(([c, r]) => ({ local: new THREE.Vector3(...c).applyMatrix4(inverses[0]), r, w: new THREE.Vector3() }));
  const _v = new THREE.Vector3(),
    _r = new THREE.Vector3(),
    _s = new THREE.Vector3(),
    _d = new THREE.Vector3(),
    _n = new THREE.Vector3();
  let time = 0;
  function scarf(dt) {
    const inner = bones[0].matrixWorld,
      sc = rig.scale;
    for (const b of BALLS) b.w.copy(b.local).applyMatrix4(inner);
    // which way his right is, for laying each tail flat
    _r.setFromMatrixColumn(inner, 0).normalize();
    const steps = Math.max(1, Math.ceil(dt / 0.012)),
      h = dt / steps;
    for (const T of TAILS) {
      const { n, p, q } = T,
        seg = T.seg * sc;
      _v.copy(T.local).applyMatrix4(inner);
      if (!T.ready) {
        for (let i = 0; i < n; i++) {
          p.set([_v.x, _v.y - i * seg, _v.z + 0.02 * i], i * 3);
          q.set([_v.x, _v.y - i * seg, _v.z + 0.02 * i], i * 3);
        }
        T.ready = true;
      }
      for (let st = 0; st < steps; st++) {
        time += h;
        p[0] = _v.x;
        p[1] = _v.y;
        p[2] = _v.z;
        for (let i = 1; i < n; i++) {
          const k = i * 3,
            vx = (p[k] - q[k]) * 0.986,
            vy = (p[k + 1] - q[k + 1]) * 0.986,
            vz = (p[k + 2] - q[k + 2]) * 0.986,
            // a flutter, stronger the faster the cloth moves through the air and further out along the tail
            sp = Math.hypot(vx, vy, vz) / h,
            fl = Math.min(7, sp) * 1.3 * (i / n);
          q[k] = p[k];
          q[k + 1] = p[k + 1];
          q[k + 2] = p[k + 2];
          p[k] += vx + fl * Math.sin(time * 13 + i * 0.9) * h * h * 9;
          p[k + 1] += vy - 9.8 * h * h + fl * Math.sin(time * 11 + i * 1.3 + 2) * h * h * 6;
          p[k + 2] += vz + fl * Math.cos(time * 12 + i * 0.7) * h * h * 9;
        }
        for (let it = 0; it < 4; it++) {
          for (let i = 1; i < n; i++) {
            const a = (i - 1) * 3,
              b = i * 3,
              dx = p[b] - p[a],
              dy = p[b + 1] - p[a + 1],
              dz = p[b + 2] - p[a + 2],
              l = Math.hypot(dx, dy, dz) || 1e-6,
              c = (l - seg) / l;
            if (i === 1) {
              p[b] -= dx * c;
              p[b + 1] -= dy * c;
              p[b + 2] -= dz * c;
            } else {
              p[a] += dx * c * 0.5;
              p[a + 1] += dy * c * 0.5;
              p[a + 2] += dz * c * 0.5;
              p[b] -= dx * c * 0.5;
              p[b + 1] -= dy * c * 0.5;
              p[b + 2] -= dz * c * 0.5;
            }
          }
          // out of his body, and never through the ice
          for (let i = 1; i < n; i++) {
            const k = i * 3;
            for (const B of BALLS) {
              const dx = p[k] - B.w.x,
                dy = p[k + 1] - B.w.y,
                dz = p[k + 2] - B.w.z,
                r = (B.r + 0.02) * sc,
                l = Math.hypot(dx, dy, dz);
              if (l < r && l > 1e-6) {
                p[k] = B.w.x + (dx / l) * r;
                p[k + 1] = B.w.y + (dy / l) * r;
                p[k + 2] = B.w.z + (dz / l) * r;
              }
            }
            const floor = iceY(p[k], p[k + 2]) + 0.015;
            if (p[k + 1] < floor) p[k + 1] = floor;
          }
        }
      }
      // the ribbon: flat across, its edges carried down the tail from his right, narrowing a little at the end
      const { vp } = T;
      _s.copy(_r);
      for (let i = 0; i < n; i++) {
        const k = i * 3,
          j = Math.min(n - 1, i + 1),
          o = j === i ? i - 1 : i;
        _d.set(p[j * 3] - p[o * 3], p[j * 3 + 1] - p[o * 3 + 1], p[j * 3 + 2] - p[o * 3 + 2]).normalize();
        _s.addScaledVector(_d, -_s.dot(_d));
        if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0);
        _s.normalize();
        const hw = T.width * sc * (0.5 - 0.08 * (i / n));
        // the knit curls a little across its width (the middle stands off the edges), so it never shows as a line
        _n.crossVectors(_s, _d).multiplyScalar(hw * 0.35);
        vp.set(
          [
            p[k] - _s.x * hw,
            p[k + 1] - _s.y * hw,
            p[k + 2] - _s.z * hw,
            p[k] + _n.x,
            p[k + 1] + _n.y,
            p[k + 2] + _n.z,
            p[k] + _s.x * hw,
            p[k + 1] + _s.y * hw,
            p[k + 2] + _s.z * hw,
          ],
          i * 9,
        );
      }
      T.g.attributes.position.needsUpdate = true;
      T.g.computeVertexNormals();
    }
  }

  // ---- his reflection in the ice: the skin, the skates and the scarf's tails drawn mirrored
  const R = new THREE.Matrix4();
  const ghost = (m) => {
    const c = m.clone();
    c.transparent = true;
    c.opacity = 0.26;
    c.depthWrite = true;
    return c;
  };
  {
    const mb = new THREE.SkinnedMesh(geo, ghost(furMat));
    mb.bindMode = THREE.DetachedBindMode;
    mb.bind(skeleton, ID);
    mb.frustumCulled = false;
    mb.matrixAutoUpdate = false;
    mb.renderOrder = -1;
    scene.add(mb);
    mirrors.push({ m: mb, of: null });
    for (const s of skates) {
      const g = new THREE.Mesh(s.geometry, ghost(s.material));
      g.matrixAutoUpdate = false;
      g.matrixWorldAutoUpdate = false;
      g.renderOrder = -1;
      scene.add(g);
      mirrors.push({ m: g, of: s });
    }
    for (const T of TAILS) {
      const g = new THREE.Mesh(T.g, ghost(scarfMat));
      g.matrixAutoUpdate = false;
      g.matrixWorldAutoUpdate = false;
      g.frustumCulled = false;
      g.renderOrder = -1;
      scene.add(g);
      mirrors.push({ m: g, of: 'world' });
    }
  }

  // put the figure back as it was
  hero.position.copy(keep.p);
  hero.rotation.copy(keep.r);
  hero.scale.copy(keep.s);
  models.body.position.y = keep.by;
  models.body.rotation.copy(keep.br);
  bones.forEach((b, i) => b.rotation.copy(keep.rots[i]));
  hero.updateMatrixWorld(true);

  let visible = true,
    reflect = true,
    reflOpacity = -1;
  const show = () => {
    all.forEach((m) => (m.visible = visible));
    mirrors.forEach((r) => (r.m.visible = visible && reflect));
  };
  show();
  return {
    bear: true,
    triangles: idx.length / 3,
    get visible() {
      return visible;
    },
    set visible(v) {
      if (v === visible) return;
      visible = v;
      show();
      if (v) TAILS.forEach((T) => (T.ready = false));
    },
    night() {},
    reflection(on, opacity) {
      if (on === reflect && opacity === reflOpacity) return;
      reflect = on;
      reflOpacity = opacity;
      mirrors.forEach((r) => (r.m.material.opacity = opacity));
      show();
    },
    // after the figure has been posed this frame
    update(dt, S) {
      if (!visible) return;
      hero.updateMatrixWorld(true);
      for (const m of attached) {
        m.matrixWorld.multiplyMatrices(bones[m.userData.bone].matrixWorld, m.userData.local);
        m.matrix.copy(m.matrixWorld);
      }
      scarf(Math.min(dt, 0.05));
      if (reflect) {
        iceMirror(S, R);
        for (const r of mirrors) {
          if (r.of === null) r.m.matrix.copy(R);
          else if (r.of === 'world') r.m.matrixWorld.copy(R);
          else r.m.matrixWorld.multiplyMatrices(R, r.of.matrixWorld);
          if (r.of === null) r.m.matrixWorld.copy(R);
        }
      }
    },
    // Rook's stick only
    hands: () => false,
  };
}
