// The line on the ice: instanced marks, each with a position, direction, colour, width and the speed she was going.
// On paper (ink()) the same marks are drawn as a pencil line, a broad calligraphy pen whose stroke swells and thins
// with the direction of travel and her speed, or white light.
import * as THREE from './three.js';
import { CFG } from '../config.js';
import { TAU } from '../core/math.js';

export const PALETTES = [
  { name: 'Speed', bySpeed: true, stops: [0x74d99a, 0x78aefc, 0xff8cc2] }, // pastel green when slow, blue at cruising speed, pink flat out
  { name: 'Aurora', stops: [0x12bfae, 0x2b7fff, 0x7a4bff, 0xe440b0, 0xff7a45, 0xffc233] },
  { name: 'Sunset', stops: [0xff4e50, 0xfc913a, 0xf5c518, 0xe4508f, 0x7b3fa0] },
  { name: 'Ocean', stops: [0x0b3c5d, 0x1d7fb8, 0x2ec4c6, 0x62d9a8] },
  { name: 'Rainbow', stops: [0xff3b30, 0xff9500, 0xf5c400, 0x34c759, 0x00a8e8, 0x5856d6, 0xd63aa8] },
  { name: 'Ink', stops: [0x16233d, 0x3a5a8c, 0x16233d, 0x6b7fa6] },
];
PALETTES.forEach((p) => {
  p.rgb = p.stops.map((h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);
  p.css = 'linear-gradient(90deg,' + p.stops.map((s) => '#' + ('00000' + s.toString(16)).slice(-6)).join(',') + ')';
});

export function createTrace(scene) {
  // each mark: x, z, direction, colour, width, speed (0..1 of top speed)
  const F = 6,
    BLOCK = 8192,
    PERIOD = 14,
    T = CFG.trace;
  const dc = document.createElement('canvas');
  dc.width = 64;
  dc.height = 128;
  {
    const g = dc.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 9; // soft edge = smooth line
    g.beginPath();
    g.arc(32, 34, 19, Math.PI, 0);
    g.lineTo(51, 94);
    g.arc(32, 94, 19, 0, Math.PI);
    g.closePath();
    g.fill();
    g.fill();
  }
  const uScale = { value: 1 },
    uPunch = { value: 1 },
    uWide = { value: 1 },
    // paper: 0 the ice's coloured line, 1 pen, 2 pencil, 3 glow
    uInk = { value: 0 },
    uInkCol = { value: new THREE.Color(0x111318) },
    uNib = { value: 0.75 },
    uThin = { value: 0.14 },
    uFast = { value: 0.55 };
  const INKS = { pen: 1, pencil: 2, glow: 3 };
  // lies on the ice: the skater passes in front of it
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    alphaMap: new THREE.CanvasTexture(dc),
    transparent: true,
    alphaTest: 0.02,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uScale, uWide, uPunch, uInk, uInkCol, uNib, uThin, uFast });
    // pen: a broad nib draws thick across its edge and a hairline along it, and thinner the faster it moves
    sh.vertexShader =
      `uniform float uScale, uWide, uNib, uThin, uFast;
uniform int uInk;
attribute float aSpd;
varying vec2 vInkP;
` +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  float inkW = 1.0;
  if (uInk == 1) {
    float rot = atan(instanceMatrix[2].x, instanceMatrix[2].z);
    inkW = mix(uThin, 1.0, abs(sin(rot - uNib))) * (1.0 - uFast * clamp(aSpd, 0.0, 1.0));
  }
  transformed.x *= uWide * inkW;
  // on paper the marks overlap more, so a thin stroke reads as one line, not a string of beads
  if (uInk > 0) transformed.z *= 1.7;
  transformed.xz *= uScale;
  vInkP = (instanceMatrix * vec4(transformed, 1.0)).xz;`,
      );
    sh.fragmentShader =
      `uniform float uPunch;
uniform int uInk;
uniform vec3 uInkCol;
varying vec2 vInkP;
float ih(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float inz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ih(i), ih(i + vec2(1, 0)), f.x), mix(ih(i + vec2(0, 1)), ih(i + vec2(1, 1)), f.x), f.y); }
` +
      sh.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  diffuseColor.rgb = pow(diffuseColor.rgb, vec3(uPunch));
  if (uInk > 0) diffuseColor.rgb = uInkCol * diffuse;`,
        )
        // pen: a crisp inked edge. pencil: graphite caught on the paper's tooth, broken up where it skips
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
  if (uInk == 1) diffuseColor.a = smoothstep(0.3, 0.55, diffuseColor.a);
  else if (uInk == 2) {
    float g = inz(vInkP * 150.0) * 0.55 + inz(vInkP * 41.0) * 0.45;
    diffuseColor.a *= smoothstep(0.1, 0.55, g) * 0.95;
  }`,
        );
  };
  const geo = new THREE.PlaneGeometry(T.width, T.length);
  geo.rotateX(-Math.PI / 2);
  const tmpM = new THREE.Matrix4(),
    tmpC = new THREE.Color();
  let ink = null;
  let blocks = [],
    prints = [],
    palette = 0,
    speedFrac = 0;
  const bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, any: false };
  function place(x, z, rot, colorInt, w, spd) {
    spd = spd || 0;
    const n = prints.length / F,
      k = n % BLOCK;
    let blk = blocks[Math.floor(n / BLOCK)];
    if (!blk) {
      // each block has its own copy of the little quad, to carry its own speeds
      const g = geo.clone();
      g.setAttribute('aSpd', new THREE.InstancedBufferAttribute(new Float32Array(BLOCK), 1));
      blk = new THREE.InstancedMesh(g, mat, BLOCK);
      blk.setColorAt(0, tmpC.setHex(0xffffff));
      blk.count = 0;
      blk.frustumCulled = false;
      blk.renderOrder = 1;
      scene.add(blk);
      blocks.push(blk);
    }
    const c = Math.cos(rot),
      s = Math.sin(rot);
    tmpM.set(c * w, 0, s, x, 0, 1, 0, 0.02, -s * w, 0, c, z, 0, 0, 0, 1);
    blk.setMatrixAt(k, tmpM);
    blk.setColorAt(k, tmpC.setHex(colorInt));
    const sa = blk.geometry.attributes.aSpd;
    sa.array[k] = spd;
    sa.needsUpdate = true;
    blk.count = k + 1;
    blk.instanceMatrix.needsUpdate = true;
    blk.instanceColor.needsUpdate = true;
    prints.push(x, z, rot, colorInt, w, Math.round(spd * 100) / 100);
    if (!bounds.any) {
      bounds.minX = bounds.maxX = x;
      bounds.minZ = bounds.maxZ = z;
      bounds.any = true;
    } else {
      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (z < bounds.minZ) bounds.minZ = z;
      if (z > bounds.maxZ) bounds.maxZ = z;
    }
  }
  function colorAt(d) {
    const st = PALETTES[palette].rgb;
    if (PALETTES[palette].bySpeed) {
      const u = Math.min(0.999, Math.max(0, speedFrac)) * (st.length - 1),
        i = Math.floor(u),
        a = st[i],
        b = st[i + 1],
        f = u - i;
      return tmpC.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f).getHex();
    }
    const n = st.length,
      t = (d / PERIOD) % n,
      i = Math.floor(t),
      a = st[i],
      b = st[(i + 1) % n];
    let f = t - i;
    f = f * f * (3 - 2 * f);
    return tmpC.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f).getHex();
  }
  // follows the blade point and lays marks along it
  const pen = { down: false, x: 0, z: 0, since: 0, n: 0 };
  // dashed: she is off the ice (a jump or a leap), so the path is drawn as a fine dashed line
  function follow(S, bx, bz, width, penOK, dashed) {
    if ((S.grounded || dashed) && penOK) {
      if (!pen.down) {
        pen.down = true;
        pen.since = 0;
      } else {
        const sx = bx - pen.x,
          sz = bz - pen.z,
          sl = Math.hypot(sx, sz);
        if (sl > 1e-5 && sl < 3) {
          S.skated += sl;
          pen.since += sl;
          const rot = Math.atan2(sx, sz);
          while (pen.since >= T.spacing) {
            pen.since -= T.spacing;
            pen.n++;
            if (dashed && pen.n % 4 > 1) continue;
            place(
              bx - (sx / sl) * pen.since,
              bz - (sz / sl) * pen.since,
              rot,
              colorAt(S.skated - pen.since),
              dashed ? 0.6 : width,
              speedFrac,
            );
          }
        }
      }
    } else pen.down = false;
    pen.x = bx;
    pen.z = bz;
  }
  function rosette(S, turns) {
    const petals = 6 + 4 * Math.min(turns, 5);
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      place(S.x + Math.sin(a) * 0.38, S.z + Math.cos(a) * 0.38, a, colorAt(S.skated + i * 1.4), 1);
    }
  }
  function clear() {
    blocks.forEach((b) => {
      scene.remove(b);
      if (b.dispose) b.dispose();
    });
    blocks = [];
    prints = [];
    bounds.any = false;
  }
  // from high up the line is drawn fine and crisp: the soft edge is cut away as the view rises
  // two settings only: changing it rebuilds the shader
  const sharpen = (e) => {
    const a = e > 0.6 && uInk.value !== 2 ? 0.5 : 0.02;
    if (mat.alphaTest !== a) {
      mat.alphaTest = a;
      mat.needsUpdate = true;
    }
  };
  // brighter than white at night, so the glow picks the line up
  const glow = (k) => {
    mat.color.setScalar(ink && ink.glow ? ink.glow : k);
  };
  // deeper, more saturated colours on bright ice, where the pastel line would fade into it (1 leaves them as they are)
  const punch = (k, wide) => {
    uPunch.value = ink ? 1 : k;
    uWide.value = ink ? ink.wide : wide || 1;
  };
  // paper (a CFG.paper entry), or null for the ice; call glow() and punch() again afterwards
  const setInk = (c) => {
    ink = c;
    uInk.value = c ? INKS[c.ink] : 0;
    if (!c) return;
    uInkCol.value.setHex(c.inkColor);
    if (c.nib !== undefined) uNib.value = c.nib;
    if (c.thin !== undefined) uThin.value = c.thin;
    if (c.fast !== undefined) uFast.value = c.fast;
  };
  return {
    place,
    follow,
    sharpen,
    glow,
    punch,
    ink: setInk,
    rosette,
    clear,
    colorAt,
    bounds,
    uScale,
    get count() {
      return prints.length / F;
    },
    set speed(f) {
      speedFrac = f;
    },
    get palette() {
      return palette;
    },
    set palette(i) {
      palette = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length;
    },
    serialise() {
      const src = prints.length > T.saveMax * F ? prints.slice(prints.length - T.saveMax * F) : prints;
      return src.map((v, i) => (i % F === 3 ? v : Math.round(v * 100) / 100));
    },
    // f: how many numbers each mark was saved with (5 before v3-look37, which added the speed)
    restore(arr, f) {
      f = f || F;
      for (let i = 0; i + f - 1 < arr.length; i += f)
        place(arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4], f > 5 ? arr[i + 5] : 0.5);
    },
  };
}
