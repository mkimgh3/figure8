// The Canyon's run drawn (v3-look56; its shape is core/track.js): an ice trough, white outside, on pillars down to the
// hillside, built in pieces CHUNK metres long as she nears them and dropped once she is well past. Across, one closed
// loop: the left lip, the ice from lip to lip, the right lip, then down the outside, under and back up. Each part has
// its own vertices so the trough's corners stay sharp. Where a spiral passes over its own lower turns there are no
// pillars under it (they would stand in the turn below); a tower stands in the spiral's middle instead.
import * as THREE from './three.js';
import { CFG } from '../config.js';
import { track, ensureTrack, trackPoint, profile, LIP_HEIGHT, HALF, hillY } from '../core/track.js';

const CHUNK = 96,
  BEHIND = 260,
  AHEAD = 1100;

export function createSlide(scene, iceMat) {
  const K = CFG.canyon,
    group = new THREE.Group(),
    inner = profile(9, 6),
    L = K.lip,
    D = K.shell,
    // the parts across: [points (across, up), material (0 ice, 1 shell)]
    parts = [
      [
        [
          [-HALF - L, LIP_HEIGHT],
          [-HALF, LIP_HEIGHT],
        ],
        1,
      ],
      [inner, 0],
      [
        [
          [HALF, LIP_HEIGHT],
          [HALF + L, LIP_HEIGHT],
        ],
        1,
      ],
      [
        [
          [HALF + L, LIP_HEIGHT],
          [HALF + L, -D],
        ],
        1,
      ],
      [
        [
          [HALF + L, -D],
          [-HALF - L, -D],
        ],
        1,
      ],
      [
        [
          [-HALF - L, -D],
          [-HALF - L, LIP_HEIGHT],
        ],
        1,
      ],
    ];
  // the ice's parts first, then the shell's, so each material is one draw
  parts.sort((a, b) => a[1] - b[1]);
  const shell = new THREE.MeshStandardMaterial({ color: 0xeef3f9, roughness: 0.82, metalness: 0 }),
    post = new THREE.MeshStandardMaterial({ color: 0xc9d3df, roughness: 0.9, metalness: 0 }),
    postGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0);
  scene.add(group);
  group.visible = false;
  // the hillside: snow, dropping toward -z through (0, 0, 0) as CFG.canyon.hill says
  const snow = new THREE.Mesh(
    new THREE.PlaneGeometry(40000, 40000),
    new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.95, metalness: 0 }),
  );
  snow.rotation.x = -Math.PI / 2 - Math.atan(K.hill);
  snow.receiveShadow = true;
  group.add(snow);
  const chunks = new Map(),
    towers = new Map(),
    P = { x: 0, y: 0, z: 0, th: 0, bank: 0 },
    M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    V = new THREE.Vector3(),
    Sc = new THREE.Vector3();

  // is there a lower part of the run under (x, z), other than the run near sample i
  function under(x, z, i, y) {
    const X = track.X,
      Z = track.Z,
      Y = track.Y,
      r = HALF + L + 1.5;
    for (let j = 0; j < X.length; j += 2) {
      if (Math.abs(j - i) < 30 || Y[j] > y) continue;
      const dx = X[j] - x,
        dz = Z[j] - z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  function build(c) {
    const s0 = track.S0 + c * CHUNK,
      s1 = s0 + CHUNK;
    ensureTrack(s1 + 2);
    const pos = [],
      nrm = [],
      uv = [],
      idx = [],
      groups = [];
    let start = 0,
      mat = -1;
    for (const [pts, m] of parts) {
      if (m !== mat) {
        if (mat >= 0) groups.push([start, idx.length - start, mat]);
        start = idx.length;
        mat = m;
      }
      const base = pos.length / 3,
        n = pts.length;
      // arc length across, for the ice's scratches
      const acc = [0];
      for (let k = 1; k < n; k++)
        acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      for (let s = s0; s <= s1; s++) {
        trackPoint(s, P);
        const c1 = Math.cos(P.bank),
          sn = Math.sin(P.bank),
          nx = -Math.cos(P.th),
          nz = Math.sin(P.th);
        for (let k = 0; k < n; k++) {
          const a = pts[k][0] * c1 - pts[k][1] * sn,
            b = pts[k][0] * sn + pts[k][1] * c1;
          pos.push(P.x + nx * a, P.y + b, P.z + nz * a);
          uv.push(acc[k], s);
        }
      }
      const rows = s1 - s0;
      for (let j = 0; j < rows; j++)
        for (let k = 0; k < n - 1; k++) {
          const a = base + j * n + k,
            b = a + 1,
            d = a + n,
            e = d + 1;
          idx.push(a, b, d, b, e, d);
        }
    }
    groups.push([start, idx.length - start, mat]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    groups.forEach(([a, n, m]) => geo.addGroup(a, n, m));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, [iceMat, shell]);
    mesh.castShadow = mesh.receiveShadow = true;
    // pillars: one every K.pillar[0] metres under the middle of the trough, down to the hillside, where nothing of the
    // run lies under it
    const spots = [];
    for (let s = Math.ceil(s0 / K.pillar[0]) * K.pillar[0]; s < s1; s += K.pillar[0]) {
      trackPoint(s, P);
      const top = P.y - D,
        foot = hillY(P.z) - 1;
      if (top - foot < 1.5 || under(P.x, P.z, Math.round(s - track.S0), P.y - 2)) continue;
      spots.push([P.x, foot, P.z, top - foot]);
    }
    let posts = null;
    if (spots.length) {
      posts = new THREE.InstancedMesh(postGeo, post, spots.length);
      spots.forEach(([x, y, z, h], k) =>
        posts.setMatrixAt(k, M.compose(V.set(x, y, z), Q, Sc.set(K.pillar[1], h, K.pillar[1]))),
      );
      posts.castShadow = true;
      posts.receiveShadow = true;
      posts.computeBoundingSphere();
    }
    const ch = { mesh, posts };
    group.add(mesh);
    if (posts) group.add(posts);
    chunks.set(c, ch);
  }
  function drop(c) {
    const ch = chunks.get(c);
    group.remove(ch.mesh);
    ch.mesh.geometry.dispose();
    if (ch.posts) {
      group.remove(ch.posts);
      ch.posts.dispose();
    }
    chunks.delete(c);
  }
  // each spiral's tower: from the hillside up through its middle to just over its top turn
  function tower(sp, k) {
    if (towers.has(k)) return;
    const foot = hillY(sp[1]) - 1,
      r = 2.2,
      m = new THREE.Mesh(postGeo, post);
    m.position.set(sp[0], foot, sp[1]);
    m.scale.set(r, sp[2] + 3 - foot, r);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    towers.set(k, m);
  }
  // every frame: show the run round s metres along it (on: it is the Canyon)
  function update(s, on) {
    group.visible = on;
    if (!on) return;
    ensureTrack(s + AHEAD + CHUNK);
    const lo = Math.max(0, Math.floor((s - BEHIND - track.S0) / CHUNK)),
      hi = Math.floor((s + AHEAD - track.S0) / CHUNK);
    for (const c of [...chunks.keys()]) if (c < lo || c > hi) drop(c);
    // at most one new piece a frame, nearest first, so a long way ahead does not all come at once
    let want = -1;
    for (let c = lo; c <= hi; c++)
      if (!chunks.has(c) && (want < 0 || Math.abs(c * CHUNK + track.S0 - s) < Math.abs(want * CHUNK + track.S0 - s)))
        want = c;
    if (want >= 0) build(want);
    track.spirals.forEach((sp, k) => tower(sp, k));
  }
  // the run was laid again from the top: draw it afresh
  function reset() {
    for (const c of [...chunks.keys()]) drop(c);
    for (const m of towers.values()) group.remove(m);
    towers.clear();
  }
  return { group, update, reset };
}
