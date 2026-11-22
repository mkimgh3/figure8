// Ivor's viking beard (v3-look72, Mark: "give him viking beard ... beard is decorative non functional does not move"):
// one solid, sculpted piece that rides on his head and never moves by itself.
//
// Built in the head mesh's own space (x across, -y forward, z up, metres) as a distance field and meshed with surface
// nets (bear.js): a layer of hair over the part of his face where the beard grows (the head's _hair x, see
// tools/assets/ivor_head.py), thicker toward the chin, melted into a full beard that hangs below the chin and spreads
// from the jaw, and two braids from the beard's point bound in silver rings; cut away round the mouth (no moustache,
// since v3-look82). Combed strands are drawn on it from a small picture wrapped round the head.
import * as THREE from './three.js';
import { netsOf, smin } from './bear.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// a tapering round segment from a to b, flattened front to back by `flat` (1: round)
function segment(a, b, ra, rb, flat = 1) {
  const bx = b[0] - a[0],
    by = b[1] - a[1],
    bz = b[2] - a[2],
    bb = bx * bx + by * by + bz * bz;
  return (x, y, z) => {
    const px = x - a[0],
      py = y - a[1],
      pz = z - a[2],
      h = clamp01((px * bx + py * by + pz * bz) / bb),
      dx = px - bx * h,
      dy = (py - by * h) * flat,
      dz = pz - bz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
  };
}

// combed hair: wavy strands running down the picture, darker between them
function strandTexture() {
  const W = 128,
    H = 256,
    cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  let s = 97;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  g.fillStyle = 'rgb(150,150,150)';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const x0 = rnd() * W,
      v = 170 + rnd() * 85,
      ph = rnd() * 6.28,
      amp = 2 + rnd() * 3;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1 + rnd() * 1.6;
    for (const dx of [-W, 0, W]) {
      g.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const x = x0 + dx + Math.sin((y / H) * 6.28 * 2 + ph) * amp;
        if (y === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// headMesh: his skinned head, with _hair, as it is at rest (after any reshaping). Returns a group in the head mesh's
// space, to be set on the head bone (see avatar.js).
// o: { thick: [at the top of the beard, at the chin] (metres of hair over the face), top, bottom (heights where those
//      apply), soft (how smoothly the layer is melted, metres), cell (the mesh's grain), melt (how the beard's shapes
//      melt into the layer), shapes: [{ a, b, r: [ra, rb], flat }] (the hanging part), braids: [{ a, b, r, rings:
//      [shares along it] }], shave: { at, r: [rx, ry, rz] } (an oval left bare, round the mouth), colour, ring (the
//      rings' colour) }
export function buildBeard(headMesh, o) {
  const P = headMesh.geometry.attributes.position,
    Hh = headMesh.geometry.attributes._hair,
    cell = o.cell,
    k = o.soft;
  // where the beard grows, and how thick it is there
  const pts = [];
  for (let i = 0; i < P.count; i++) {
    const w = Hh.getX(i);
    if (w < 0.45) continue;
    const z = P.getZ(i),
      u = clamp01((o.top - z) / (o.top - o.bottom));
    pts.push(P.getX(i), P.getY(i), z, w * (o.thick[0] + (o.thick[1] - o.thick[0]) * u));
  }
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 4)
    for (let c = 0; c < 3; c++) {
      lo[c] = Math.min(lo[c], pts[i + c] - 0.04);
      hi[c] = Math.max(hi[c], pts[i + c] + 0.04);
    }
  const parts = o.shapes.concat(o.braids.map((b) => ({ a: b.a, b: b.b, r: [b.r, b.r * 0.85], flat: 1, braid: b })));
  for (const s of parts)
    for (const q of [s.a, s.b])
      for (let c = 0; c < 3; c++) {
        lo[c] = Math.min(lo[c], q[c] - s.r[0] - 0.02);
        hi[c] = Math.max(hi[c], q[c] + s.r[0] + 0.02);
      }
  const n = lo.map((l, c) => Math.ceil((hi[c] - l) / cell) + 1),
    [nx, ny, nz] = n,
    sum = new Float32Array(nx * ny * nz);
  // the layer: every point's ball of hair, melted together (a soft minimum: -k log of the sum of exp(-d/k))
  for (let i = 0; i < pts.length; i += 4) {
    const x = pts[i],
      y = pts[i + 1],
      z = pts[i + 2],
      t = pts[i + 3],
      R = t + 5 * k,
      i0 = Math.max(0, Math.floor((x - R - lo[0]) / cell)),
      i1 = Math.min(nx - 1, Math.ceil((x + R - lo[0]) / cell)),
      j0 = Math.max(0, Math.floor((y - R - lo[1]) / cell)),
      j1 = Math.min(ny - 1, Math.ceil((y + R - lo[1]) / cell)),
      k0 = Math.max(0, Math.floor((z - R - lo[2]) / cell)),
      k1 = Math.min(nz - 1, Math.ceil((z + R - lo[2]) / cell));
    for (let kk = k0; kk <= k1; kk++)
      for (let jj = j0; jj <= j1; jj++)
        for (let ii = i0; ii <= i1; ii++) {
          const dx = lo[0] + ii * cell - x,
            dy = lo[1] + jj * cell - y,
            dz = lo[2] + kk * cell - z,
            d = Math.sqrt(dx * dx + dy * dy + dz * dz) - t;
          sum[ii + nx * (jj + ny * kk)] += Math.exp(-d / k);
        }
  }
  // the beard's own shapes melted in; a braid is a row of beads, a little to one side and the other in turn
  const fs = parts.map((s) => {
    if (!s.braid) return segment(s.a, s.b, s.r[0], s.r[1], s.flat ?? 1);
    const beads = [],
      L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]),
      m = Math.max(2, Math.round(L / (s.r[0] * 1.3)));
    for (let q = 0; q <= m; q++) {
      const t = q / m,
        side = (q % 2 ? 1 : -1) * s.r[0] * 0.35,
        r = s.r[0] * (1 - 0.25 * t);
      const c = [s.a[0] + (s.b[0] - s.a[0]) * t + side, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t];
      beads.push((x, y, z) => Math.hypot(x - c[0], (y - c[1]) * 1.2, (z - c[2]) * 0.8) - r);
    }
    return (x, y, z) => {
      let d = Infinity;
      for (const f of beads) d = Math.min(d, f(x, y, z));
      return d;
    };
  });
  const vals = new Float32Array(nx * ny * nz),
    sh = o.shave;
  for (let kk = 0; kk < nz; kk++)
    for (let jj = 0; jj < ny; jj++)
      for (let ii = 0; ii < nx; ii++) {
        const id = ii + nx * (jj + ny * kk),
          x = lo[0] + ii * cell,
          y = lo[1] + jj * cell,
          z = lo[2] + kk * cell;
        let d = sum[id] > 1e-12 ? -k * Math.log(sum[id]) : 0.05;
        for (let q = 0; q < fs.length; q++) {
          const f = fs[q](x, y, z);
          d = parts[q].braid ? Math.min(d, f) : smin(d, f, o.melt);
        }
        // the shaved oval: outside it (roughly, in metres), with a soft edge
        if (sh) {
          const ex = (x - sh.at[0]) / sh.r[0],
            ey = (y - sh.at[1]) / sh.r[1],
            ez = (z - sh.at[2]) / sh.r[2],
            out = (Math.sqrt(ex * ex + ey * ey + ez * ez) - 1) * Math.min(sh.r[0], sh.r[2]);
          d = -smin(-d, out, 0.01);
        }
        // the edges of the box are outside
        if (ii === 0 || jj === 0 || kk === 0 || ii === nx - 1 || jj === ny - 1 || kk === nz - 1) d = Math.max(d, 0.001);
        vals[id] = d;
      }
  const net = netsOf(vals, lo, n, cell),
    N = net.pos.length / 3;
  // the field's slope at a point (from the grid), for normals and for winding each triangle outward
  const field = (x, y, z) => {
    const fx = (x - lo[0]) / cell,
      fy = (y - lo[1]) / cell,
      fz = (z - lo[2]) / cell,
      i = Math.max(0, Math.min(nx - 2, Math.floor(fx))),
      j = Math.max(0, Math.min(ny - 2, Math.floor(fy))),
      kq = Math.max(0, Math.min(nz - 2, Math.floor(fz))),
      tx = fx - i,
      ty = fy - j,
      tz = fz - kq,
      v = (a, b, c) => vals[i + a + nx * (j + b + ny * (kq + c))];
    const x0 = v(0, 0, 0) * (1 - tx) + v(1, 0, 0) * tx,
      x1 = v(0, 1, 0) * (1 - tx) + v(1, 1, 0) * tx,
      x2 = v(0, 0, 1) * (1 - tx) + v(1, 0, 1) * tx,
      x3 = v(0, 1, 1) * (1 - tx) + v(1, 1, 1) * tx;
    return (x0 * (1 - ty) + x1 * ty) * (1 - tz) + (x2 * (1 - ty) + x3 * ty) * tz;
  };
  const pos = new Float32Array(net.pos),
    nrm = new Float32Array(N * 3),
    uv = new Float32Array(N * 2),
    e = cell * 0.75;
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3],
      y = pos[i * 3 + 1],
      z = pos[i * 3 + 2];
    const gx = field(x + e, y, z) - field(x - e, y, z),
      gy = field(x, y + e, z) - field(x, y - e, z),
      gz = field(x, y, z + e) - field(x, y, z - e),
      l = Math.hypot(gx, gy, gz) || 1;
    nrm.set([gx / l, gy / l, gz / l], i * 3);
    // the strands run down, wrapped round the head
    uv[i * 2] = (Math.atan2(x, -y) / Math.PI) * 2.2;
    uv[i * 2 + 1] = -z * 4;
  }
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
    if (
      (uy * vz - uz * vy) * (nrm[a] + nrm[b] + nrm[c]) +
        (uz * vx - ux * vz) * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) +
        (ux * vy - uy * vx) * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) <
      0
    ) {
      idx[t + 1] = c / 3;
      idx[t + 2] = b / 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const map = strandTexture(),
    mat = new THREE.MeshStandardMaterial({
      map,
      color: new THREE.Color(o.colour),
      roughness: 0.75,
      envMapIntensity: 0.6,
      // a little light of its own, so it does not go black in shade (as his locks)
      emissive: new THREE.Color(o.colour),
      emissiveMap: map,
      emissiveIntensity: 0.05,
    });
  const grp = new THREE.Group(),
    mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  grp.add(mesh);
  // the braids' rings
  const metal = new THREE.MeshStandardMaterial({ color: o.ring, metalness: 1, roughness: 0.28 });
  for (const b of o.braids)
    for (const at of b.rings) {
      const c = new THREE.Vector3(...b.a).lerp(new THREE.Vector3(...b.b), at),
        dir = new THREE.Vector3(...b.b).sub(new THREE.Vector3(...b.a)).normalize(),
        r = b.r * (1 - 0.25 * at),
        ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, r * 0.9, 16), metal);
      ring.position.copy(c);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      ring.castShadow = true;
      grp.add(ring);
    }
  grp.userData.triangles = idx.length / 3;
  return grp;
}
