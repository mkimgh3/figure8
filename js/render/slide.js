// The Canyon's run drawn (its shape is core/track.js): since v3-look57 a tube of ice, white outside, over a snowy
// hillside (v3-look56: an open trough), built in pieces CHUNK metres long as she nears them and dropped once she is well
// past. Across: the ice inside, round from the bottom, and the shell outside, each a ring of points turned with the
// run's bank (TWIST times it, so the lines inside twist over between bends). v3-look58 (Mark: "remove the vertical posts
// as you cant even see them"): no pillars or spiral towers any more; from inside the tube they were never seen.
import * as THREE from './three.js';
import { CFG } from '../config.js';
import { track, ensureTrack, trackPoint, profile, TUBE } from '../core/track.js';

const CHUNK = 96,
  BEHIND = 260,
  AHEAD = 1100,
  // metres between rings of points along the run
  STEP = 2;

export function createSlide(scene, iceMat) {
  const K = CFG.canyon,
    group = new THREE.Group(),
    D = K.shell,
    TWIST = K.twistLook,
    // the parts across: [points (across, up), material (0 ice, 1 shell)]; the shell's points go round the other way so
    // its faces look outward
    parts = [
      [profile(40), 0],
      [profile(24, TUBE + D).reverse(), 1],
    ];
  // the ice's parts first, then the shell's, so each material is one draw
  parts.sort((a, b) => a[1] - b[1]);
  const shell = new THREE.MeshStandardMaterial({ color: 0xeef3f9, roughness: 0.82, metalness: 0 });
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
    P = { x: 0, y: 0, z: 0, th: 0, bank: 0 };

  function build(c) {
    const s0 = track.S0 + c * CHUNK,
      s1 = s0 + CHUNK;
    ensureTrack(s1 + 2);
    const pos = [],
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
      for (let s = s0; s <= s1; s += STEP) {
        trackPoint(s, P);
        const tw = P.bank * TWIST,
          c1 = Math.cos(tw),
          sn = Math.sin(tw),
          nx = -Math.cos(P.th),
          nz = Math.sin(P.th);
        for (let k = 0; k < n; k++) {
          // turned about the tube's middle (TUBE up from the centre line)
          const pa = pts[k][0],
            pb = pts[k][1] - TUBE,
            a = pa * c1 - pb * sn,
            b = pa * sn + pb * c1 + TUBE;
          pos.push(P.x + nx * a, P.y + b, P.z + nz * a);
          uv.push(acc[k], s);
        }
      }
      const rows = (s1 - s0) / STEP;
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
    // light comes through the ice: the tube casts no shadow into itself (she still casts hers on it)
    mesh.receiveShadow = true;
    group.add(mesh);
    chunks.set(c, mesh);
  }
  function drop(c) {
    const mesh = chunks.get(c);
    group.remove(mesh);
    mesh.geometry.dispose();
    chunks.delete(c);
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
  }
  // the run was laid again from the top: draw it afresh
  function reset() {
    for (const c of [...chunks.keys()]) drop(c);
  }
  return { group, update, reset };
}
