// Dreadlocks: a dozen thick locks, each a chain of joints. The root rides on the head; the joints below swing
// under gravity, trail in the air (so they stream back with speed, fly out in spins and lift in the wind) and
// rest on the head, neck and shoulders instead of passing through them.
//
// Smooth by design: the physics runs in small fixed steps, and the head's motion between two frames is spread
// across those steps (a frame on a phone can move the head half a metre; doing that in one jump is what makes hair
// twitch). Joints are held at their spacing and gently kept from folding sharply, and the motion is damped.
//
// Where hair grows comes from the model: its head carries an attribute _hair (x: beard, y: scalp).
import * as THREE from './three.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3();

// a dreadlock's surface: twisted bands of matted hair, wrapping round the lock
function dreadTexture(seed) {
  const W = 64, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = 'rgb(246,246,246)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) { const y = (i / 9) * H, v = 205 + rnd() * 30; g.strokeStyle = `rgba(${v},${v},${v},0.85)`; g.lineWidth = 4 + rnd() * 5;
    for (const dy of [-H, 0, H]) { g.beginPath(); g.moveTo(-4, y + dy); g.bezierCurveTo(W * 0.3, y + dy + 6, W * 0.7, y + dy + 10, W + 4, y + dy + 16); g.stroke(); } }
  for (let i = 0; i < 500; i++) { const v = rnd() < 0.5 ? 170 + rnd() * 40 : 240 + rnd() * 15; g.fillStyle = `rgba(${v},${v},${v},0.55)`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 2 + rnd() * 4); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

// candidate root points over the scalp, by area
function sampleRoots(geo, channel, count, rng, min, keep) {
  const P = geo.attributes.position, N = geo.attributes.normal, Hh = geo.attributes._hair, I = geo.index;
  const tris = [], area = []; let total = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < I.count; t += 3) { const i0 = I.getX(t), i1 = I.getX(t + 1), i2 = I.getX(t + 2);
    if ((Hh.getComponent(i0, channel) + Hh.getComponent(i1, channel) + Hh.getComponent(i2, channel)) / 3 < min) continue;
    A.fromBufferAttribute(P, i0); B.fromBufferAttribute(P, i1); C.fromBufferAttribute(P, i2);
    if (keep && !keep((A.y + B.y + C.y) / 3)) continue;
    total += B.clone().sub(A).cross(C.clone().sub(A)).length() / 2; tris.push([i0, i1, i2]); area.push(total); }
  const out = [];
  for (let k = 0; k < count && tris.length; k++) { const r = rng() * total; let lo = 0, hi = area.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (area[m] < r) lo = m + 1; else hi = m; }
    let u = rng(), v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const [i0, i1, i2] = tris[lo], w = [1 - u - v, u, v];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    [i0, i1, i2].forEach((i, k2) => { p.addScaledVector(A.fromBufferAttribute(P, i), w[k2]); n.addScaledVector(B.fromBufferAttribute(N, i), w[k2]); });
    out.push({ p, n: n.normalize() }); }
  return out;
}
// even spacing: group the candidates into `count` patches (k-means) and root a lock at the middle of each
function evenly(cands, count, rng) {
  let cs = cands.slice(0, count).map((c) => c.p.clone());
  for (let it = 0; it < 12; it++) {
    const sum = cs.map(() => new THREE.Vector3()), n = cs.map(() => 0);
    for (const c of cands) { let k = 0, best = Infinity; cs.forEach((m, i) => { const d = m.distanceToSquared(c.p); if (d < best) { best = d; k = i; } }); sum[k].add(c.p); n[k]++; }
    cs = cs.map((m, i) => (n[i] ? sum[i].multiplyScalar(1 / n[i]) : cands[Math.floor(rng() * cands.length)].p.clone()));
  }
  return cs.map((m) => { let best = cands[0], d0 = Infinity; for (const c of cands) { const d = c.p.distanceToSquared(m); if (d < d0) { d0 = d; best = c; } } return { p: best.p.clone(), n: best.n.clone() }; });
}
// keep point j outside a ball
function push(a, j, c, r) { const dx = a[j] - c.x, dy = a[j + 1] - c.y, dz = a[j + 2] - c.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < r * r && d2 > 1e-12) { const k = r / Math.sqrt(d2); a[j] = c.x + dx * k; a[j + 1] = c.y + dy * k; a[j + 2] = c.z + dz * k; } }
// pull two points toward a distance L (wa, wb: how freely each moves)
function hold(a, i, j, L, wa, wb, k) { const dx = a[j] - a[i], dy = a[j + 1] - a[i + 1], dz = a[j + 2] - a[i + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (d - L) / d / (wa + wb) * k;
  a[i] += dx * e * wa; a[i + 1] += dy * e * wa; a[i + 2] += dz * e * wa; a[j] -= dx * e * wb; a[j + 1] -= dy * e * wb; a[j + 2] -= dz * e * wb; }

// headMesh: the skinned head (with _hair); bone(name); o: { count, joints, length, radius, colours }
export function createHair(headMesh, bone, o) {
  const skel = headMesh.skeleton, head = bone('Bip01 Head');
  const toBone = (b) => new THREE.Matrix4().multiplyMatrices(skel.boneInverses[skel.bones.indexOf(b)], headMesh.bindMatrix);      // model mesh space -> a bone's own space
  const HM = toBone(head), HN = new THREE.Matrix3().setFromMatrix4(HM);
  let seed = 1234567; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dirInHead = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix3(HN).normalize();
  const down = dirInHead(0, 0, -1), back = dirInHead(0, 1, 0), side = dirInHead(1, 0, 0);                      // the mesh is z-up with the face toward -y
  const collider = (bn, x, y, z, r, pad = 1) => { const b = bone(bn); return { bone: b, pad, at: new THREE.Vector3(x, y, z).applyMatrix4(toBone(b)), r, rest: new THREE.Vector3(x, y, z).applyMatrix4(HM), w: new THREE.Vector3(), w0: new THREE.Vector3() }; };
  const cols = [collider('Bip01 Head', 0, 0.005, 1.705, 0.097, 0.35), collider('Bip01 Head', 0, -0.05, 1.63, 0.085), collider('Bip01 Neck', 0, 0.015, 1.52, 0.1),
    collider('Bip01 Spine2', 0, 0.04, 1.41, 0.17), collider('Bip01 Spine2', 0, -0.05, 1.37, 0.16),
    collider('Bip01 L Clavicle', 0.17, 0.025, 1.45, 0.13), collider('Bip01 R Clavicle', -0.17, 0.025, 1.45, 0.13)];

  // roots: spread evenly over the crown, sides and back of the scalp (none at the front, so the face stays clear), set just under it
  const roots = evenly(sampleRoots(headMesh.geometry, 1, 1500, rng, 0.92, (y) => y > -0.045), o.count, rng).map((r) => ({ p: r.p.applyMatrix4(HM).addScaledVector(r.n.applyMatrix3(HN).normalize(), -0.006), n: r.n }));
  const K = o.joints, S = roots.length, NP = S * (K + 1), R0 = o.radius;
  const lens = roots.map((r) => { const f = THREE.MathUtils.clamp(r.p.clone().sub(cols[0].rest).normalize().dot(back) * 0.5 + 0.5, 0, 1); return o.length * (0.8 + 0.2 * f) * (0.92 + rng() * 0.16); });
  const segL = lens.map((L) => L / K);

  // the combed shape, in the head's own space: each lock leaves the scalp, runs back over the head and falls down the back
  const rest = new Float32Array(NP * 3);
  roots.forEach((r, s) => { const d = r.n.clone().multiplyScalar(0.1).addScaledVector(down, 0.6).addScaledVector(back, 1.3).normalize();
    for (let i = 0; i <= K; i++) { const j = (s * (K + 1) + i) * 3; rest[j] = r.p.x + d.x * segL[s] * i; rest[j + 1] = r.p.y + d.y * segL[s] * i; rest[j + 2] = r.p.z + d.z * segL[s] * i; } });
  for (let it = 0; it < 160; it++) for (let s = 0; s < S; s++) { const b = s * (K + 1) * 3;
    for (let i = 1; i <= K; i++) { const j = b + i * 3; rest[j] += down.x * 0.004 + back.x * 0.003; rest[j + 1] += down.y * 0.004 + back.y * 0.003; rest[j + 2] += down.z * 0.004 + back.z * 0.003;
      for (const c of cols) push(rest, j, c.rest, c.r + R0 * c.pad);
      hold(rest, j - 3, j, segL[s], i === 1 ? 0 : 1, 1, 1); } }

  // geometry: a round tube along each lock, a little fuller at the root and rounded off at the end
  const SIDES = 8, NV = NP * SIDES + S;                              // plus one tip point per lock
  const pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), col = new Float32Array(NV * 3), idx = [];
  const c0 = new THREE.Color(o.colours[0]), c1 = new THREE.Color(o.colours[1]), c2 = new THREE.Color(o.colours[2]), cc = new THREE.Color();
  const cosA = [], sinA = []; for (let r = 0; r < SIDES; r++) { cosA.push(Math.cos(r / SIDES * Math.PI * 2)); sinA.push(Math.sin(r / SIDES * Math.PI * 2)); }
  const radius = (t) => R0 * (t < 0.08 ? 1.15 - t * 1.9 : 1 - 0.18 * t) * (t > 0.96 ? 0.7 : 1);
  for (let s = 0; s < S; s++) { const tint = 0.88 + ((s * 7919) % 100) / 100 * 0.22, tip = NP * SIDES + s;
    for (let i = 0; i <= K; i++) { const t = i / K, v = (s * (K + 1) + i) * SIDES;
      cc.copy(c0).lerp(c1, Math.min(1, t * 2.5)); if (t > 0.4) cc.lerp(c2, (t - 0.4) / 0.6); cc.multiplyScalar(tint);
      for (let r = 0; r < SIDES; r++) { uv[(v + r) * 2] = r / SIDES; uv[(v + r) * 2 + 1] = t * lens[s] / 0.09 + s * 0.37; col.set([cc.r, cc.g, cc.b], (v + r) * 3);
        const a = v + r, b = v + (r + 1) % SIDES; if (i < K) idx.push(a, b, a + SIDES, b, b + SIDES, a + SIDES); else idx.push(a, b, tip); } }      // wound to face outward
    col.set([cc.r, cc.g, cc.b], tip * 3); uv[tip * 2 + 1] = lens[s] / 0.09; }
  const geo = new THREE.BufferGeometry(); geo.setIndex(idx);
  const aP = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), aN = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aP); geo.setAttribute('normal', aN); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // the tubes are built round the outside of each lock, so leave the far side unculled only for the mirror
  // a pale albedo and a touch of light of its own, the same day and night, so the colour reads when the light is low
  const tex = dreadTexture(41), mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.7, envMapIntensity: 0.6, emissive: new THREE.Color(o.colours[1]), emissiveMap: tex, emissiveIntensity: 0.04 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
  const mirrorMat = mat.clone(); mirrorMat.map = mat.map; mirrorMat.transparent = true; mirrorMat.opacity = 0.26; mirrorMat.side = THREE.BackSide;
  const mirror = new THREE.Mesh(geo, mirrorMat); mirror.frustumCulled = false; mirror.matrixAutoUpdate = false; mirror.matrixWorldAutoUpdate = false; mirror.renderOrder = -1;
  mirror.matrixWorld.makeScale(1, -1, 1);

  // simulation state, in the world
  const p = new Float32Array(NP * 3), pp = new Float32Array(NP * 3), W0 = new Float32Array(NP * 3), W1 = new Float32Array(NP * 3);   // W0/W1: the combed shape at the last frame and this one
  const H = head.matrixWorld;
  let fresh = true, t = 0;
  const combed = (out) => { for (let n = 0; n < NP; n++) { _a.set(rest[n * 3], rest[n * 3 + 1], rest[n * 3 + 2]).applyMatrix4(H); out[n * 3] = _a.x; out[n * 3 + 1] = _a.y; out[n * 3 + 2] = _a.z; } };
  const place = () => { combed(W1); W0.set(W1); p.set(W1); pp.set(W1); cols.forEach((c) => { c.w.copy(c.at).applyMatrix4(c.bone.matrixWorld); c.w0.copy(c.w); }); };
  const air = new THREE.Vector3();

  const ctr = new THREE.Vector3(), ctr0 = new THREE.Vector3();
  let spin = 0;
  const step = (h, f, sc, kd) => {
    const g = 9.8 * sc * h * h, fan = spin * 9.8 * 2.2 * sc * h * h, cx = ctr0.x + (ctr.x - ctr0.x) * f, cz = ctr0.z + (ctr.z - ctr0.z) * f;
    for (let s = 0; s < S; s++) { const b = s * (K + 1) * 3;
      // in a spin each lock fans out the way its root faces round the head, so the locks spread evenly like a skirt
      let fx = W1[b] - cx, fz = W1[b + 2] - cz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      // the root follows the head smoothly through the frame
      p[b] = pp[b] = W0[b] + (W1[b] - W0[b]) * f; p[b + 1] = pp[b + 1] = W0[b + 1] + (W1[b + 1] - W0[b + 1]) * f; p[b + 2] = pp[b + 2] = W0[b + 2] + (W1[b + 2] - W0[b + 2]) * f;
      for (let i = 1; i <= K; i++) { const j = b + i * 3;
        let vx = p[j] - pp[j], vy = p[j + 1] - pp[j + 1], vz = p[j + 2] - pp[j + 2];
        vx += (air.x * h - vx) * kd; vy += (air.y * h - vy) * kd; vz += (air.z * h - vz) * kd;
        pp[j] = p[j]; pp[j + 1] = p[j + 1]; pp[j + 2] = p[j + 2];
        p[j] += vx * o.keep; p[j + 1] += vy * o.keep - g; p[j + 2] += vz * o.keep;
        if (fan > 0) { const t = i / K; p[j] += fx * fan * t; p[j + 2] += fz * fan * t; }
        // the first joints keep the lock's direction off the scalp
        if (i <= 2) { const k = i === 1 ? 0.5 : 0.18; p[j] += (W0[j] + (W1[j] - W0[j]) * f - p[j]) * k; p[j + 1] += (W0[j + 1] + (W1[j + 1] - W0[j + 1]) * f - p[j + 1]) * k; p[j + 2] += (W0[j + 2] + (W1[j + 2] - W0[j + 2]) * f - p[j + 2]) * k; }
      }
      const L = segL[s] * sc;
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i <= K; i++) hold(p, b + (i - 1) * 3, b + i * 3, L, i === 1 ? 0 : 1, 1, 1);                       // joints stay their length apart
        for (let i = 2; i <= K; i++) hold(p, b + (i - 2) * 3, b + i * 3, 2 * L * 0.985, i === 2 ? 0 : 1, 1, o.bend);       // and resist folding
      }
      for (let i = 1; i <= K; i++) { const j = b + i * 3; for (const c of cols) { _c.lerpVectors(c.w0, c.w, f); push(p, j, _c, (c.r + R0 * c.pad) * sc); } if (p[j + 1] < R0) p[j + 1] = R0; }
    }
  };

  const build = (sc) => {
    for (let s = 0; s < S; s++) { const b = s * (K + 1);
      // a frame carried down the lock without spinning, starting from the head's side-to-side direction
      _q.copy(side).transformDirection(H);
      for (let i = 0; i <= K; i++) { const j = (b + i) * 3, jn = (b + Math.min(K, i + 1)) * 3, jp = (b + Math.max(0, i - 1)) * 3, rr = radius(i / K) * sc;
        _t.set(p[jn] - p[jp], p[jn + 1] - p[jp + 1], p[jn + 2] - p[jp + 2]).normalize();
        _q.addScaledVector(_t, -_q.dot(_t)).normalize(); _c.crossVectors(_t, _q);
        for (let r = 0; r < SIDES; r++) { const v = ((b + i) * SIDES + r) * 3, nx = _q.x * cosA[r] + _c.x * sinA[r], ny = _q.y * cosA[r] + _c.y * sinA[r], nz = _q.z * cosA[r] + _c.z * sinA[r];
          pos[v] = p[j] + nx * rr; pos[v + 1] = p[j + 1] + ny * rr; pos[v + 2] = p[j + 2] + nz * rr; nor[v] = nx; nor[v + 1] = ny; nor[v + 2] = nz; }
        if (i === K) { const v = (NP * SIDES + s) * 3; pos[v] = p[j] + _t.x * rr; pos[v + 1] = p[j + 1] + _t.y * rr; pos[v + 2] = p[j + 2] + _t.z * rr; nor[v] = _t.x; nor[v + 1] = _t.y; nor[v + 2] = _t.z; } } }
    aP.needsUpdate = true; aN.needsUpdate = true;
  };

  return {
    parts: [{ mesh, mirror }], head,
    reset() { fresh = true; },
    glow() {},
    tip() { const m = new THREE.Vector3(); for (let s = 0; s < S; s++) { const j = (s * (K + 1) + K) * 3; m.x += p[j]; m.y += p[j + 1]; m.z += p[j + 2]; } return m.multiplyScalar(1 / S); },
    // wind: the breeze over the lake (world units per second, x and z), gusting
    // spin: 0..1, how hard she is spinning (already smoothed)
    update(dt, cam, wind, spinK = 0) {
      dt = Math.min(dt, 0.07); t += dt;
      const sc = _b.setFromMatrixColumn(H, 0).length();
      if (fresh) { place(); fresh = false; }
      W0.set(W1); combed(W1); cols.forEach((c) => { c.w0.copy(c.w); c.w.copy(c.at).applyMatrix4(c.bone.matrixWorld); });
      spin = spinK; ctr0.copy(cols[0].w0); ctr.copy(cols[0].w);
      if ((W1[0] - W0[0]) ** 2 + (W1[1] - W0[1]) ** 2 + (W1[2] - W0[2]) ** 2 > 4 * sc * sc) place();                // jumped somewhere new: start combed
      const gust = 0.65 + 0.35 * Math.sin(t * 0.83) + 0.25 * Math.sin(t * 2.3 + 1.7);
      air.set(wind.x * gust * o.windy, 0, wind.y * gust * o.windy);
      const n = Math.min(8, Math.max(1, Math.ceil(dt * 120))), h = dt / n, kd = 1 - Math.exp(-o.drag * h);
      for (let k = 1; k <= n; k++) step(h, k / n, sc, kd);
      build(sc);
    },
  };
}
