// Islands: snow-covered land rising out of the frozen lake, with snowy fir trees on them. Big islands with small
// islets scattered round them, spread out so there is room to skate fast between them and along their shores. Each
// island is a few overlapping mounds. They are laid out by a fixed rule, so the map is the same every visit and goes
// on for ever; only the islands near the skater are drawn.
// Drawing (v3-look45): each map cell has its own mounds and trees, so the cells out of view are skipped, and only the
// trees near her cast shadows: a copy of them that writes nothing on screen (three.js tests an object's layers against
// the main camera even for the shadow maps, so a shadow-only layer would not do). Until v3-look44 all 2400 trees were
// drawn twice every frame, once for the view and once for the sun's shadow, on screen or not.
// Christmas lights (v3-look74, Mark: "for island add more snow on trees and christmas lights come up with many variants
// but try to group similar types together, so it's not so mish mash but also giving variety"): every island, with the
// islets round it, has one theme (LIGHTS: the colours, how they are hung on the trees, how they light up), so the trees
// on it match and the next island is different. The bulbs are points, one set per map cell, lit and animated in their
// shader; by day small coloured dots, at night glowing (added light, so the night's glow catches the brightest).
import * as THREE from './three.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
const CELL = 120,
  R = 2,
  CELLS = (2 * R + 1) * (2 * R + 1),
  CELL_LOBES = 10,
  CELL_TREES = 640,
  MAXTREES = 2400,
  // trees within CAST_R metres of her cast shadows (the sun's shadow covers 18 m round her, but a low sun's are long)
  CASTERS = 700,
  CAST_R = 40;
const hash = (i, j, k) => {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

// a fir: a short trunk and five overlapping tiers of branches with ragged tips, dark green, snow lying on the
// upper side of each tier (v3-look74: thicker, most of each tier white and the top one capped, the green showing
// underneath and at the tips)
function firGeometry() {
  const parts = [],
    paint = (g, f) => {
      const p = g.attributes.position,
        c = [];
      for (let i = 0; i < p.count; i++) {
        const col = f(p.getX(i), p.getY(i), p.getZ(i), i);
        c.push(col.r, col.g, col.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      return g;
    };
  const bark = new THREE.Color(0x4a3426),
    green = new THREE.Color(0x1e4a33),
    deep = new THREE.Color(0x143424),
    snow = new THREE.Color(0xf6f9ff),
    c = new THREE.Color();
  const h = (k) => {
    const x = Math.sin(k * 91.7) * 43758.5;
    return x - Math.floor(x);
  };
  parts.push(paint(new THREE.CylinderGeometry(0.05, 0.08, 0.25, 6).translate(0, 0.125, 0), () => bark));
  [
    [0.12, 0.44, 0.3],
    [0.27, 0.37, 0.28],
    [0.42, 0.3, 0.26],
    [0.57, 0.22, 0.24],
    [0.72, 0.13, 0.28],
  ].forEach(([y, r, ht], ti) => {
    const g = new THREE.ConeGeometry(r, ht, 14, 2).translate(0, y + ht / 2, 0),
      q = g.attributes.position;
    // ragged, drooping tips
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i),
        z = q.getZ(i),
        a = Math.atan2(z, x),
        k = 1 + 0.12 * Math.sin(a * 7 + ti * 1.7) * (0.6 + h(Math.round(a * 10) + ti * 31));
      q.setX(i, x * k);
      q.setZ(i, z * k);
      if (q.getY(i) < y + 0.01) q.setY(i, q.getY(i) - 0.03 * h(i + ti * 7));
    }
    parts.push(
      paint(g, (x, py, z, i) => {
        const up = (py - y) / ht,
          sn = Math.max(
            THREE.MathUtils.smoothstep(up + 0.3 * (h(i * 3 + ti) - 0.5), 0.12, 0.42),
            ti === 4 ? THREE.MathUtils.smoothstep(up, 0.05, 0.3) : 0,
          );
        return c.copy(up < 0.15 ? deep : green).lerp(snow, sn * 0.96);
      }),
    );
  });
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeVertexNormals();
  return g; // unit height, base at 0
}

// The outside of the fir (unit height) at height y: the widest of the tiers there
const TIERS = [
  [0.12, 0.44, 0.3],
  [0.27, 0.37, 0.28],
  [0.42, 0.3, 0.26],
  [0.57, 0.22, 0.24],
  [0.72, 0.13, 0.28],
];
const outer = (y) => {
  let r = 0;
  for (const [y0, r0, ht] of TIERS) if (y >= y0 && y <= y0 + ht) r = Math.max(r, r0 * (1 - (y - y0) / ht));
  return r * 1.06 + 0.012;
};
// Christmas light themes. colours: the bulbs' colours; pick: which bulb takes which colour ('mix': at random, 'run':
// in turn along the string, 'string': one colour for each string); hang: how they are hung ('spiral': round and up,
// `turns` times, `strings` of them; 'swags': drooping round each tier; 'strands': straight down from the top, `strands`
// of them; 'scatter': anywhere over the tree); n: bulbs on a tree of average size; mode: how they light up (0 steady, 1
// twinkling, 2 chasing along the string, 3 slowly breathing, all together, 4 two colours taking turns, 5 a rainbow running
// along the string, 6 falling, like drops of light running down); lit: the share of the trees lit; top: the colour of
// a star on top (none if left out); size: the bulbs, times the usual.
export const LIGHTS = [
  {
    name: 'Classic',
    colours: [0xff3a30, 0x2fd25a, 0x2f7bff, 0xffb020, 0xff4fd8],
    pick: 'mix',
    hang: 'spiral',
    turns: 4.5,
    n: 44,
    mode: 0,
    lit: 0.85,
    top: 0xffd76a,
  },
  {
    name: 'Warm white',
    colours: [0xffb05a, 0xffc684],
    pick: 'mix',
    hang: 'swags',
    n: 52,
    mode: 1,
    lit: 0.9,
    top: 0xfff0d0,
  },
  {
    name: 'Ice',
    colours: [0x8fd0ff, 0xeaf6ff, 0x4f9dff],
    pick: 'mix',
    hang: 'strands',
    strands: 9,
    n: 54,
    mode: 1,
    lit: 0.8,
  },
  {
    name: 'Red and gold',
    colours: [0xff1414, 0xffb21c],
    pick: 'run',
    hang: 'spiral',
    turns: 3.5,
    n: 40,
    mode: 4,
    lit: 0.85,
    top: 0xffc23d,
  },
  {
    name: 'Candy cane',
    colours: [0xff1c1c, 0xffffff],
    pick: 'string',
    hang: 'spiral',
    turns: 2.5,
    strings: 2,
    n: 48,
    mode: 2,
    lit: 0.8,
  },
  { name: 'Violet', colours: [0xb45cff, 0xff6fd0, 0x7a62ff], pick: 'mix', hang: 'scatter', n: 46, mode: 3, lit: 0.85 },
  {
    name: 'Gold',
    colours: [0xffa41c, 0xffc84e],
    pick: 'mix',
    hang: 'swags',
    n: 48,
    mode: 0,
    lit: 0.9,
    top: 0xfff2b0,
    size: 1.1,
  },
  { name: 'Rainbow', colours: [0xffffff], pick: 'mix', hang: 'spiral', turns: 5, n: 50, mode: 5, lit: 0.75 },
  {
    name: 'Emerald and silver',
    colours: [0x34ff8c, 0xe6f0ff],
    pick: 'run',
    hang: 'strands',
    strands: 8,
    n: 48,
    mode: 6,
    lit: 0.8,
  },
  {
    name: 'Snowfall',
    colours: [0xffffff, 0xcfe6ff],
    pick: 'mix',
    hang: 'strands',
    strands: 11,
    n: 60,
    mode: 6,
    lit: 0.85,
    top: 0xffffff,
  },
];
// the bulbs of one tree, in its own space (unit height): [x, y, z, along the string 0..1, colour index]
function hangLights(T, rnd) {
  const out = [],
    n = T.n,
    put = (a, y, along, ci, r = outer(y)) => out.push(Math.cos(a) * r, y, Math.sin(a) * r, along, ci);
  if (T.hang === 'spiral') {
    const S = T.strings || 1,
      per = Math.round(n / S),
      ph = rnd() * 6.28;
    for (let s = 0; s < S; s++)
      for (let k = 0; k < per; k++) {
        const t = (k + 0.5) / per,
          y = 0.13 + t * 0.82;
        put(ph + (s / S) * 6.28 + t * T.turns * 6.28, y, t, T.pick === 'string' ? s : T.pick === 'run' ? k : -1);
      }
  } else if (T.hang === 'swags') {
    // each tier's lower edge, in five drooping loops round it
    const total = TIERS.reduce((a, t) => a + t[1], 0);
    let done = 0;
    TIERS.forEach(([y0, r0], ti) => {
      const m = Math.max(5, Math.round((n * r0) / total)),
        ph = rnd() * 6.28;
      for (let k = 0; k < m; k++) {
        const u = k / m,
          loop = (u * 5) % 1,
          y = y0 + 0.07 - 0.05 * Math.sin(loop * Math.PI);
        put(ph + u * 6.28, y, (ti + u) / TIERS.length, T.pick === 'run' ? done + k : -1);
      }
      done += m;
    });
  } else if (T.hang === 'strands') {
    const S = T.strands,
      per = Math.max(3, Math.round(n / S)),
      ph = rnd() * 6.28;
    for (let s = 0; s < S; s++)
      for (let k = 0; k < per; k++) {
        const t = k / (per - 1),
          y = 0.97 - t * 0.82;
        put(ph + (s / S) * 6.28 + t * 0.35, y, t, T.pick === 'run' ? k : -1);
      }
  } else {
    for (let k = 0; k < n; k++) {
      const y = 0.13 + (1 - Math.sqrt(rnd())) * 0.84;
      put(rnd() * 6.28, y, rnd(), -1);
    }
  }
  return out;
}
// A bulb is drawn twice: its glass, solid in its own colour (so a red bulb stays red over pale snow), and at night a
// halo of light added round it. Their pictures, grey on black (used as alphaMaps, as the iPhone needs).
function bulbDot(size, halo) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'),
    r = size / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  if (halo) {
    grd.addColorStop(0, 'rgb(200,200,200)');
    grd.addColorStop(0.25, 'rgb(90,90,90)');
    grd.addColorStop(0.6, 'rgb(18,18,18)');
  } else {
    grd.addColorStop(0, 'rgb(255,255,255)');
    grd.addColorStop(0.62, 'rgb(255,255,255)');
    grd.addColorStop(0.85, 'rgb(90,90,90)');
  }
  grd.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
// the bulbs' materials: a pair per map cell (its island's theme: mode); how bright each bulb is now worked out in the
// shader, the same for its glass and its halo
const BULB_TIME = { value: 0 },
  BULB_NIGHT = { value: 0 };
function bulbMaterial(dot, mode, halo) {
  const m = new THREE.PointsMaterial({
    size: halo ? 1.5 : 0.3,
    sizeAttenuation: true,
    vertexColors: true,
    alphaMap: dot,
    transparent: true,
    depthWrite: false,
    blending: halo ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = BULB_TIME;
    sh.uniforms.uNight = BULB_NIGHT;
    sh.uniforms.uMode = mode;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aInfo;
uniform float uTime, uNight, uMode;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
{ float along = aInfo.x, seed = aInfo.y, b = 1.0;
  if (uMode < 0.5) b = 0.92 + 0.08 * sin(uTime * 0.7 + seed * 40.0);
  else if (uMode < 1.5) b = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (1.3 + seed * 2.6) + seed * 70.0), 3.0);
  else if (uMode < 2.5) b = 0.35 + 0.65 * smoothstep(0.3, 1.0, sin((along * 14.0 - uTime * 1.6) * 3.14159));
  else if (uMode < 3.5) b = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 0.9 + fract(seed * 7.0) * 0.4));
  else if (uMode < 4.5) b = 0.15 + 0.85 * (0.5 + 0.5 * sin(uTime * 1.4 + (vColor.g < 0.5 ? 0.0 : 3.14159)));
  else if (uMode < 5.5) vColor.rgb = hue(fract(along * 1.5 - uTime * 0.12)) * 0.9 + 0.1;
  else b = 0.15 + 0.85 * pow(fract(along - uTime * 0.45 + seed * 0.08), 6.0);
  // the star on top
  if (aInfo.z > 1.5) b = 0.85 + 0.15 * sin(uTime * 2.0);
  ${
    halo
      ? '// the halo: only at night, as bright as the bulb is lit\n  vColor.rgb *= b * 0.75 * uNight; }'
      : '// the glass: lit, its colour; dimmed, darker (by day a dimmed bulb would only turn grey, so far less)\n  vColor.rgb *= mix(mix(1.0, b, 0.25), 0.3 + 0.85 * b, uNight); }'
  }`,
      )
      // never smaller than a pixel and a half, so far bulbs do not wink out
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aInfo.z;')
      .replace(
        '#include <logdepthbuf_vertex>',
        'gl_PointSize = max(gl_PointSize, 1.5);\n#include <logdepthbuf_vertex>',
      );
  };
  return m;
}

export function createIslands(scene) {
  // a mound: the top half of a ball, icy rock at the shore shading up to snow
  const geo = new THREE.SphereGeometry(1, 48, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    col = [],
    p = geo.attributes.position,
    shore = new THREE.Color(0x8fbfd0),
    snow = new THREE.Color(0xfbfdff),
    tc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    tc.copy(shore).lerp(snow, Math.min(1, p.getY(i) * 3.2));
    col.push(tc.r, tc.g, tc.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const landMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0,
      envMapIntensity: 0.5,
    }),
    fir = firGeometry(),
    treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.4 });
  // at night the snow on the trees keeps a little light of its own (moonlight and the lights on it), or the steep tiers
  // went as dark as the needles
  treeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = BULB_NIGHT;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vColor.rgb * 0.16 * uNight;',
      );
  };
  // per map cell: its mounds and its trees, each culled as a whole by its bounding sphere, and its trees' lights
  const cells = [],
    glass = bulbDot(32, false),
    shine = bulbDot(64, true);
  for (let c = 0; c < CELLS; c++) {
    const land = new THREE.InstancedMesh(geo, landMat, CELL_LOBES),
      trees = new THREE.InstancedMesh(fir, treeMat, CELL_TREES),
      mode = { value: 0 },
      bulbs = new THREE.Points(new THREE.BufferGeometry(), bulbMaterial(glass, mode, false)),
      halos = new THREE.Points(bulbs.geometry, bulbMaterial(shine, mode, true));
    land.count = trees.count = 0;
    land.visible = trees.visible = bulbs.visible = halos.visible = false;
    land.receiveShadow = trees.receiveShadow = true;
    bulbs.renderOrder = 3;
    halos.renderOrder = 4;
    scene.add(land, trees, bulbs, halos);
    cells.push({ land, trees, bulbs, halos, mode, theme: null, lights: [] });
  }
  // the trees near her, again, for the shadow maps: on screen they write neither colour nor depth
  const casters = new THREE.InstancedMesh(
    fir,
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    CASTERS,
  );
  casters.count = 0;
  casters.visible = false;
  casters.castShadow = true;
  casters.frustumCulled = false;
  scene.add(casters);
  // every tree's matrix and place, for picking the casters
  const allM = new Float32Array(MAXTREES * 16),
    allX = new Float32Array(MAXTREES),
    allZ = new Float32Array(MAXTREES);
  let total = 0,
    castX = 1e9,
    castZ = 1e9;
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    V = new THREE.Vector3(),
    SC = new THREE.Vector3(),
    UP = new THREE.Vector3(0, 1, 0);
  let on = false,
    ci = 1e9,
    cj = 1e9,
    lobes = [];
  // one mound in cell c (n: its number there); returns its outline for the shore test
  const mound = (x, z, rx, rz, rot, c, n) => {
    const h = Math.min(4, rx * 0.11);
    Q.setFromAxisAngle(UP, rot);
    M.compose(V.set(x, -0.02, z), Q, SC.set(rx, h, rz));
    cells[c].land.setMatrixAt(n, M);
    const l = { x, z, rx, rz, h, c: Math.cos(rot), s: Math.sin(rot), cell: c };
    lobes.push(l);
    return l;
  };
  function rebuild(i0, j0) {
    lobes = [];
    const nl = new Array(CELLS).fill(0),
      nt = new Array(CELLS).fill(0);
    let t = 0,
      c = -1;
    for (let i = i0 - R; i <= i0 + R; i++)
      for (let j = j0 - R; j <= j0 + R; j++) {
        c++;
        // this island's lights: the same theme every visit
        cells[c].theme = LIGHTS[Math.floor(hash(i, j, 200) * LIGHTS.length) % LIGHTS.length];
        cells[c].seed = Math.floor(hash(i, j, 201) * 1e6);
        cells[c].lights = [];
        if (hash(i, j, 1) > 0.78) continue;
        const cx = (i + 0.5 + (hash(i, j, 2) - 0.5) * 0.5) * CELL,
          cz = (j + 0.5 + (hash(i, j, 3) - 0.5) * 0.5) * CELL,
          size = 10 + hash(i, j, 4) * 18;
        if (Math.hypot(cx, cz) < size * 1.6 + 30) continue; // open water at the start
        const count = 2 + Math.floor(hash(i, j, 5) * 2.99);
        for (let k = 0; k < count; k++) {
          const a = hash(i, j, 10 + k) * 6.28,
            d = k ? size * (0.35 + hash(i, j, 20 + k) * 0.5) : 0,
            rx = size * (0.55 + hash(i, j, 30 + k) * 0.6),
            rz = rx * (0.5 + hash(i, j, 40 + k) * 0.4);
          mound(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rx, rz, hash(i, j, 50 + k) * 3.14, c, nl[c]++);
        }
        // islets: small rocks of snow scattered round the island
        const islets = 2 + Math.floor(hash(i, j, 6) * 4.99);
        for (let k = 0; k < islets; k++) {
          const a = hash(i, j, 60 + k) * 6.28,
            d = size * (1.6 + hash(i, j, 70 + k) * 1.6),
            r = 2.5 + hash(i, j, 80 + k) * 5;
          mound(
            cx + Math.cos(a) * d,
            cz + Math.sin(a) * d,
            r,
            r * (0.6 + hash(i, j, 90 + k) * 0.4),
            hash(i, j, 95 + k) * 3.14,
            c,
            nl[c]++,
          );
        }
      }
    // firs on the land, kept back from the shore, standing on the slope where they grow
    lobes.forEach((l, li) => {
      const want = Math.min(90, Math.floor(Math.PI * l.rx * l.rz * 0.06));
      for (let k = 0; k < want && t < MAXTREES; k++) {
        const u = hash(li, k, 7) * 2 - 1,
          w = hash(li, k, 8) * 2 - 1,
          f = u * u + w * w;
        if (f > 0.62) continue;
        const lx = u * l.rx,
          lz = w * l.rz,
          x = l.x + lx * l.c + lz * l.s,
          z = l.z - lx * l.s + lz * l.c;
        if (lobes.some((o) => o !== l && insideOf(o, x, z) && heightOf(o, x, z) > l.h * Math.sqrt(1 - f) + 0.3))
          continue; // under a taller mound
        const y = l.h * Math.sqrt(1 - f) - 0.15,
          s = 2.6 + hash(li, k, 9) * 4.2;
        Q.setFromAxisAngle(UP, hash(li, k, 11) * 6.28);
        M.compose(V.set(x, y, z), Q, SC.set(s * (0.85 + hash(li, k, 12) * 0.3), s, s));
        if (nt[l.cell] < CELL_TREES) {
          cells[l.cell].trees.setMatrixAt(nt[l.cell]++, M);
          // lit or not, and how big it is (for how many bulbs)
          if (hash(li, k, 13) < cells[l.cell].theme.lit) cells[l.cell].lights.push(M.clone(), s);
        }
        M.toArray(allM, t * 16);
        allX[t] = x;
        allZ[t] = z;
        t++;
      }
    });
    total = t;
    cells.forEach(buildBulbs);
    cells.forEach((cl, k) => {
      for (const [m, n] of [
        [cl.land, nl[k]],
        [cl.trees, nt[k]],
      ]) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (n) m.computeBoundingSphere();
        m.visible = on && n > 0;
      }
    });
    castX = 1e9;
  }
  // the bulbs drawn when the islands are, and their halos only at night
  const showBulbs = (cl) => {
    cl.bulbs.visible = on && (cl.nBulbs || 0) > 0;
    cl.halos.visible = cl.bulbs.visible && BULB_NIGHT.value > 0.5;
  };
  // a cell's lights: every lit tree's bulbs hung by its island's theme, placed in the world
  const P3 = new THREE.Vector3(),
    COL = new THREE.Color();
  function buildBulbs(cl) {
    const T = cl.theme,
      L = cl.lights;
    let sd = cl.seed || 1;
    const rnd = () => {
      sd = (sd * 16807) % 2147483647;
      return sd / 2147483647;
    };
    const pos = [],
      col = [],
      info = [];
    for (let q = 0; q < L.length; q += 2) {
      const m = L[q],
        sz = L[q + 1],
        T2 = Object.assign({}, T, { n: Math.round(T.n * (0.65 + (sz - 2.6) / 6)) }),
        b = hangLights(T2, rnd);
      for (let k = 0; k < b.length; k += 5) {
        P3.set(b[k], b[k + 1], b[k + 2]).applyMatrix4(m);
        pos.push(P3.x, P3.y, P3.z);
        const ci = b[k + 4] < 0 ? Math.floor(rnd() * T.colours.length) : b[k + 4] % T.colours.length;
        COL.set(T.colours[ci]);
        col.push(COL.r, COL.g, COL.b);
        info.push(b[k + 3], rnd(), (T.size || 1) * (0.85 + rnd() * 0.3));
      }
      if (T.top) {
        P3.set(0, 1.03, 0).applyMatrix4(m);
        pos.push(P3.x, P3.y, P3.z);
        COL.set(T.top);
        col.push(COL.r, COL.g, COL.b);
        info.push(0, rnd(), 2.6);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    if (pos.length) g.computeBoundingSphere();
    cl.bulbs.geometry.dispose();
    cl.bulbs.geometry = cl.halos.geometry = g;
    cl.mode.value = T.mode;
    cl.nBulbs = pos.length / 3;
    showBulbs(cl);
  }
  // the trees within CAST_R of (x, z) become the shadow casters
  function pickCasters(x, z) {
    castX = x;
    castZ = z;
    let n = 0;
    for (let t = 0; t < total && n < CASTERS; t++) {
      const dx = allX[t] - x,
        dz = allZ[t] - z;
      if (dx * dx + dz * dz > CAST_R * CAST_R) continue;
      casters.instanceMatrix.array.set(allM.subarray(t * 16, t * 16 + 16), n * 16);
      n++;
    }
    casters.count = n;
    casters.instanceMatrix.needsUpdate = true;
  }
  const local = (l, x, z) => {
    const dx = x - l.x,
      dz = z - l.z;
    return [(dx * l.c - dz * l.s) / l.rx, (dx * l.s + dz * l.c) / l.rz];
  };
  const insideOf = (l, x, z) => {
    const [u, w] = local(l, x, z);
    return u * u + w * w < 1;
  };
  const heightOf = (l, x, z) => {
    const [u, w] = local(l, x, z);
    return l.h * Math.sqrt(Math.max(0, 1 - u * u - w * w));
  };
  return {
    set(v) {
      on = v;
      cells.forEach((cl) => {
        cl.land.visible = v && cl.land.count > 0;
        cl.trees.visible = v && cl.trees.count > 0;
        showBulbs(cl);
      });
      casters.visible = v;
      ci = 1e9;
    },
    update(x, z) {
      if (!on) return;
      BULB_TIME.value = performance.now() / 1000;
      const i = Math.floor(x / CELL),
        j = Math.floor(z / CELL);
      if (i !== ci || j !== cj) {
        ci = i;
        cj = j;
        rebuild(i, j);
      }
      // the casters are picked again each time she has gone 5 m
      if ((x - castX) ** 2 + (z - castZ) ** 2 > 25) pickCasters(x, z);
    },
    // k: 0 by day, 1 at night: the lights glow at night, and by day are small coloured dots
    night(k) {
      BULB_NIGHT.value = k;
      cells.forEach(showBulbs);
    },
    // for tests and screenshots: the bulbs being drawn and the themes round her, and the nearest tree
    get bulbs() {
      return cells.reduce((a, cl) => a + (cl.bulbs.visible ? cl.nBulbs || 0 : 0), 0);
    },
    get themes() {
      return cells.filter((cl) => cl.nBulbs).map((cl) => cl.theme.name);
    },
    // the theme of the island at (x, z)
    themeAt(x, z) {
      const i = Math.floor(x / CELL) - ci + R,
        j = Math.floor(z / CELL) - cj + R;
      const cl = cells[i * (2 * R + 1) + j];
      return cl && cl.theme ? cl.theme.name : null;
    },
    nearestTree(x, z) {
      let best = null,
        d0 = Infinity;
      for (let t = 0; t < total; t++) {
        const d = (allX[t] - x) ** 2 + (allZ[t] - z) ** 2;
        if (d < d0) {
          d0 = d;
          best = { x: allX[t], z: allZ[t] };
        }
      }
      return best;
    },
    // If (x, z) is on land: the nearest point back on the ice and the direction away from the shore. Otherwise null.
    hit(x, z) {
      if (!on) return null;
      for (const l of lobes) {
        const dx = x - l.x,
          dz = z - l.z,
          u = (dx * l.c - dz * l.s) / l.rx,
          w = (dx * l.s + dz * l.c) / l.rz,
          f = u * u + w * w;
        if (f >= 1) continue;
        const k = 1.004 / Math.sqrt(Math.max(f, 1e-4)),
          gu = u / l.rx,
          gw = w / l.rz;
        let nx = gu * l.c + gw * l.s,
          nz = -gu * l.s + gw * l.c;
        const nl = Math.hypot(nx, nz) || 1;
        return { x: l.x + dx * k, z: l.z + dz * k, nx: nx / nl, nz: nz / nl };
      }
      return null;
    },
  };
}
