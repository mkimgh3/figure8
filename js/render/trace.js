// The line on the ice: instanced marks, each with a position, direction, colour and width.
import * as THREE from './three.js';
import { CFG } from '../config.js';
import { TAU } from '../core/math.js';

export const PALETTES = [
  { name: 'Speed', bySpeed: true, stops: [0x74d99a, 0x78aefc, 0xff8cc2] },      // pastel green when slow, blue at cruising speed, pink flat out
  { name: 'Aurora', stops: [0x12bfae, 0x2b7fff, 0x7a4bff, 0xe440b0, 0xff7a45, 0xffc233] },
  { name: 'Sunset', stops: [0xff4e50, 0xfc913a, 0xf5c518, 0xe4508f, 0x7b3fa0] },
  { name: 'Ocean', stops: [0x0b3c5d, 0x1d7fb8, 0x2ec4c6, 0x62d9a8] },
  { name: 'Rainbow', stops: [0xff3b30, 0xff9500, 0xf5c400, 0x34c759, 0x00a8e8, 0x5856d6, 0xd63aa8] },
  { name: 'Ink', stops: [0x16233d, 0x3a5a8c, 0x16233d, 0x6b7fa6] },
];
PALETTES.forEach((p) => { p.rgb = p.stops.map((h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]); p.css = 'linear-gradient(90deg,' + p.stops.map((s) => '#' + ('00000' + s.toString(16)).slice(-6)).join(',') + ')'; });

export function createTrace(scene) {
  const F = 5, BLOCK = 8192, PERIOD = 14, T = CFG.trace;
  const dc = document.createElement('canvas'); dc.width = 64; dc.height = 128;
  { const g = dc.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 9;      // soft edge = smooth line
    g.beginPath(); g.arc(32, 34, 19, Math.PI, 0); g.lineTo(51, 94); g.arc(32, 94, 19, 0, Math.PI); g.closePath(); g.fill(); g.fill(); }
  const uScale = { value: 1 };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: new THREE.CanvasTexture(dc), transparent: true, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });      // lies on the ice: the skater passes in front of it
  mat.onBeforeCompile = (sh) => { sh.uniforms.uScale = uScale; sh.vertexShader = 'uniform float uScale;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.xz *= uScale;'); };
  const geo = new THREE.PlaneGeometry(T.width, T.length); geo.rotateX(-Math.PI / 2);
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
  let blocks = [], prints = [], palette = 0, speedFrac = 0;
  const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, any: false };
  function place(x, z, rot, colorInt, w) {
    const n = prints.length / F, k = n % BLOCK; let blk = blocks[Math.floor(n / BLOCK)];
    if (!blk) { blk = new THREE.InstancedMesh(geo, mat, BLOCK); blk.setColorAt(0, tmpC.setHex(0xffffff)); blk.count = 0; blk.frustumCulled = false; blk.renderOrder = 1; scene.add(blk); blocks.push(blk); }
    const c = Math.cos(rot), s = Math.sin(rot);
    tmpM.set(c * w, 0, s, x, 0, 1, 0, 0.02, -s * w, 0, c, z, 0, 0, 0, 1);
    blk.setMatrixAt(k, tmpM); blk.setColorAt(k, tmpC.setHex(colorInt)); blk.count = k + 1; blk.instanceMatrix.needsUpdate = true; blk.instanceColor.needsUpdate = true;
    prints.push(x, z, rot, colorInt, w);
    if (!bounds.any) { bounds.minX = bounds.maxX = x; bounds.minZ = bounds.maxZ = z; bounds.any = true; }
    else { if (x < bounds.minX) bounds.minX = x; if (x > bounds.maxX) bounds.maxX = x; if (z < bounds.minZ) bounds.minZ = z; if (z > bounds.maxZ) bounds.maxZ = z; }
  }
  function colorAt(d) {
    const st = PALETTES[palette].rgb;
    if (PALETTES[palette].bySpeed) { const u = Math.min(0.999, Math.max(0, speedFrac)) * (st.length - 1), i = Math.floor(u), a = st[i], b = st[i + 1], f = u - i; return tmpC.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f).getHex(); }
    const n = st.length, t = (d / PERIOD) % n, i = Math.floor(t), a = st[i], b = st[(i + 1) % n]; let f = t - i; f = f * f * (3 - 2 * f);
    return tmpC.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f).getHex();
  }
  // follows the blade point and lays marks along it
  const pen = { down: false, x: 0, z: 0, since: 0, n: 0 };
  // dashed: she is off the ice (a jump or a leap), so the path is drawn as a fine dashed line
  function follow(S, bx, bz, width, penOK, dashed) {
    if ((S.grounded || dashed) && penOK) {
      if (!pen.down) { pen.down = true; pen.since = 0; }
      else { const sx = bx - pen.x, sz = bz - pen.z, sl = Math.hypot(sx, sz);
        if (sl > 1e-5 && sl < 3) { S.skated += sl; pen.since += sl; const rot = Math.atan2(sx, sz);
          while (pen.since >= T.spacing) { pen.since -= T.spacing; pen.n++; if (dashed && pen.n % 4 > 1) continue; place(bx - sx / sl * pen.since, bz - sz / sl * pen.since, rot, colorAt(S.skated - pen.since), dashed ? 0.6 : width); } } }
    } else pen.down = false;
    pen.x = bx; pen.z = bz;
  }
  function rosette(S, turns) { const petals = 6 + 4 * Math.min(turns, 5); for (let i = 0; i < petals; i++) { const a = i / petals * TAU; place(S.x + Math.sin(a) * 0.38, S.z + Math.cos(a) * 0.38, a, colorAt(S.skated + i * 1.4), 1); } }
  function clear() { blocks.forEach((b) => { scene.remove(b); if (b.dispose) b.dispose(); }); blocks = []; prints = []; bounds.any = false; }
  // from high up the line is drawn fine and crisp: the soft edge is cut away as the view rises
  const sharpen = (e) => { const a = e > 0.6 ? 0.5 : 0.02; if (mat.alphaTest !== a) { mat.alphaTest = a; mat.needsUpdate = true; } };      // two settings only: changing it rebuilds the shader
  // brighter than white at night, so the glow picks the line up
  const glow = (k) => { mat.color.setScalar(k); };
  return { place, follow, sharpen, glow, rosette, clear, colorAt, bounds, uScale, get count() { return prints.length / F; },
    set speed(f) { speedFrac = f; },
    get palette() { return palette; }, set palette(i) { palette = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length; },
    serialise() { const src = prints.length > T.saveMax * F ? prints.slice(prints.length - T.saveMax * F) : prints; return src.map((v, i) => (i % F === 3 ? v : Math.round(v * 100) / 100)); },
    restore(arr) { for (let i = 0; i + F - 1 < arr.length; i += F) place(arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4]); } };
}
