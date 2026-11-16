// Islands: snow-covered land rising out of the frozen lake, with snowy fir trees on them. Big islands with small
// islets scattered round them, spread out so there is room to skate fast between them and along their shores. Each
// island is a few overlapping mounds. They are laid out by a fixed rule, so the map is the same every visit and goes
// on for ever; only the islands near the skater are drawn.
import * as THREE from './three.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
const CELL = 120, R = 2, MAXLOBES = (2 * R + 1) * (2 * R + 1) * 9, MAXTREES = 2400;
const hash = (i, j, k) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

// a fir: a short trunk and five overlapping tiers of branches with ragged tips, dark green, snow lying on the
// upper side of each tier
function firGeometry() {
  const parts = [], paint = (g, f) => { const p = g.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const col = f(p.getX(i), p.getY(i), p.getZ(i), i); c.push(col.r, col.g, col.b); } g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; };
  const bark = new THREE.Color(0x4a3426), green = new THREE.Color(0x1e4a33), deep = new THREE.Color(0x143424), snow = new THREE.Color(0xf6f9ff), c = new THREE.Color();
  const h = (k) => { const x = Math.sin(k * 91.7) * 43758.5; return x - Math.floor(x); };
  parts.push(paint(new THREE.CylinderGeometry(0.05, 0.08, 0.25, 6).translate(0, 0.125, 0), () => bark));
  [[0.12, 0.44, 0.3], [0.27, 0.37, 0.28], [0.42, 0.3, 0.26], [0.57, 0.22, 0.24], [0.72, 0.13, 0.28]].forEach(([y, r, ht], ti) => {
    const g = new THREE.ConeGeometry(r, ht, 14, 2).translate(0, y + ht / 2, 0), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), z = q.getZ(i), a = Math.atan2(z, x), k = 1 + 0.12 * Math.sin(a * 7 + ti * 1.7) * (0.6 + h(Math.round(a * 10) + ti * 31));
      q.setX(i, x * k); q.setZ(i, z * k); if (q.getY(i) < y + 0.01) q.setY(i, q.getY(i) - 0.03 * h(i + ti * 7)); }      // ragged, drooping tips
    parts.push(paint(g, (x, py, z, i) => { const up = (py - y) / ht, sn = THREE.MathUtils.smoothstep(up + 0.25 * (h(i * 3 + ti) - 0.5), 0.45, 0.8); return c.copy(up < 0.15 ? deep : green).lerp(snow, sn * 0.92); })); });
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed())); g.computeVertexNormals(); return g;      // unit height, base at 0
}

export function createIslands(scene) {
  // a mound: the top half of a ball, icy rock at the shore shading up to snow
  const geo = new THREE.SphereGeometry(1, 48, 10, 0, Math.PI * 2, 0, Math.PI / 2), col = [], p = geo.attributes.position, shore = new THREE.Color(0x8fbfd0), snow = new THREE.Color(0xfbfdff), tc = new THREE.Color();
  for (let i = 0; i < p.count; i++) { tc.copy(shore).lerp(snow, Math.min(1, p.getY(i) * 3.2)); col.push(tc.r, tc.g, tc.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.5 }), MAXLOBES);
  mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.receiveShadow = true; scene.add(mesh);
  const trees = new THREE.InstancedMesh(firGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.4 }), MAXTREES);
  trees.frustumCulled = false; trees.count = 0; trees.visible = false; trees.castShadow = true; trees.receiveShadow = true; scene.add(trees);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let on = false, ci = 1e9, cj = 1e9, lobes = [];
  // one mound; returns its outline for the shore test
  const mound = (x, z, rx, rz, rot, n) => { const h = Math.min(4, rx * 0.11); Q.setFromAxisAngle(UP, rot); M.compose(V.set(x, -0.02, z), Q, SC.set(rx, h, rz)); mesh.setMatrixAt(n, M);
    const l = { x, z, rx, rz, h, c: Math.cos(rot), s: Math.sin(rot) }; lobes.push(l); return l; };
  function rebuild(i0, j0) { lobes = []; let n = 0, t = 0;
    for (let i = i0 - R; i <= i0 + R; i++) for (let j = j0 - R; j <= j0 + R; j++) {
      if (hash(i, j, 1) > 0.78) continue;
      const cx = (i + 0.5 + (hash(i, j, 2) - 0.5) * 0.5) * CELL, cz = (j + 0.5 + (hash(i, j, 3) - 0.5) * 0.5) * CELL, size = 10 + hash(i, j, 4) * 18; if (Math.hypot(cx, cz) < size * 1.6 + 30) continue;       // open water at the start
      const count = 2 + Math.floor(hash(i, j, 5) * 2.99);
      for (let k = 0; k < count; k++) { const a = hash(i, j, 10 + k) * 6.28, d = k ? size * (0.35 + hash(i, j, 20 + k) * 0.5) : 0, rx = size * (0.55 + hash(i, j, 30 + k) * 0.6), rz = rx * (0.5 + hash(i, j, 40 + k) * 0.4);
        mound(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rx, rz, hash(i, j, 50 + k) * 3.14, n++); }
      // islets: small rocks of snow scattered round the island
      const islets = 2 + Math.floor(hash(i, j, 6) * 4.99);
      for (let k = 0; k < islets; k++) { const a = hash(i, j, 60 + k) * 6.28, d = size * (1.6 + hash(i, j, 70 + k) * 1.6), r = 2.5 + hash(i, j, 80 + k) * 5;
        mound(cx + Math.cos(a) * d, cz + Math.sin(a) * d, r, r * (0.6 + hash(i, j, 90 + k) * 0.4), hash(i, j, 95 + k) * 3.14, n++); }
    }
    // firs on the land, kept back from the shore, standing on the slope where they grow
    lobes.forEach((l, li) => { const want = Math.min(90, Math.floor(Math.PI * l.rx * l.rz * 0.06));
      for (let k = 0; k < want && t < MAXTREES; k++) { const u = hash(li, k, 7) * 2 - 1, w = hash(li, k, 8) * 2 - 1, f = u * u + w * w; if (f > 0.62) continue;
        const lx = u * l.rx, lz = w * l.rz, x = l.x + lx * l.c + lz * l.s, z = l.z - lx * l.s + lz * l.c;
        if (lobes.some((o) => o !== l && insideOf(o, x, z) && heightOf(o, x, z) > l.h * Math.sqrt(1 - f) + 0.3)) continue;      // under a taller mound
        const y = l.h * Math.sqrt(1 - f) - 0.15, s = 2.6 + hash(li, k, 9) * 4.2;
        Q.setFromAxisAngle(UP, hash(li, k, 11) * 6.28); M.compose(V.set(x, y, z), Q, SC.set(s * (0.85 + hash(li, k, 12) * 0.3), s, s)); trees.setMatrixAt(t++, M); } });
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; trees.count = t; trees.instanceMatrix.needsUpdate = true; }
  const local = (l, x, z) => { const dx = x - l.x, dz = z - l.z; return [(dx * l.c - dz * l.s) / l.rx, (dx * l.s + dz * l.c) / l.rz]; };
  const insideOf = (l, x, z) => { const [u, w] = local(l, x, z); return u * u + w * w < 1; };
  const heightOf = (l, x, z) => { const [u, w] = local(l, x, z); return l.h * Math.sqrt(Math.max(0, 1 - u * u - w * w)); };
  return {
    set(v) { on = v; mesh.visible = v; trees.visible = v; ci = 1e9; },
    update(x, z) { if (!on) return; const i = Math.floor(x / CELL), j = Math.floor(z / CELL); if (i !== ci || j !== cj) { ci = i; cj = j; rebuild(i, j); } },
    // If (x, z) is on land: the nearest point back on the ice and the direction away from the shore. Otherwise null.
    hit(x, z) { if (!on) return null;
      for (const l of lobes) { const dx = x - l.x, dz = z - l.z, u = (dx * l.c - dz * l.s) / l.rx, w = (dx * l.s + dz * l.c) / l.rz, f = u * u + w * w; if (f >= 1) continue;
        const k = 1.004 / Math.sqrt(Math.max(f, 1e-4)), gu = u / l.rx, gw = w / l.rz; let nx = gu * l.c + gw * l.s, nz = -gu * l.s + gw * l.c; const nl = Math.hypot(nx, nz) || 1;
        return { x: l.x + dx * k, z: l.z + dz * k, nx: nx / nl, nz: nz / nl }; }
      return null; } };
}
