// The solar system on paper at dusk (v3-look77, Mark: "for the dusk paper mode start the player with a 3d sun sphere and
// place planets around in distance analogous to planets position relative to sun. exaggerate the size of the planet ...
// show the elliptical planet's orbit as faint dash line and for the asteroid belt show it as field of twinkling lights
// on the surface. the planets are halfway into the plane. for this option lets try invisible plane. for saturn have the
// rings slightly tilted and make sure to add rings for all planets with rings. do include pluto. for zoomed out view,
// only show the planets when they are discovered. the planets do revolve around the sun").
// v3-look78, Mark: "the planets should be much futher apart ... using earth as the standard what if we use log such that
// the inner planets are reletively within scale but larger planets are scaled logarithmically so the sun is still big
// like double the diameter of earth ... at her natural top speed it takes 8min 19s [as light does] but is able to speed
// double her speed ... when the player crosses the orbital path gray dashed line the line glows with text x orbit
// discovered!. make star background fainter but also more gaussian noise distribution."
//
// Scale: 1 AU is how far she goes in 8 min 19 s (light's time from the sun to the Earth) at her top speed, so at full
// speed she skates at the speed of light: Earth 6.7 km from the sun, Jupiter 35 km, Neptune 203 km. Here her top speed
// is doubled (main.js, S.speedK). Sizes: Earth is her height across; a body smaller than Earth is to scale, a larger one
// 1 + ln(its width / Earth's) / ln(the sun's / Earth's) times Earth, so the sun is twice Earth and Jupiter 1.5 times.
// Each body is on its real ellipse round the sun (J2000 elements; inclinations left out), where it is today, and a year
// takes YEAR seconds (slow enough that she can catch every one of them).
//
// The sheet is not drawn (CFG.paper.Dusk.space): she skates over a dark sky, faint stars far below. Bodies are cut off
// where the plane is, so they sit half in it. Crossing a body's orbit discovers the orbit (it glows, and is named);
// coming within FIND metres of a body discovers it. From then on a mark at the edge of the screen points to it.
import * as THREE from './three.js';
import { CFG } from '../config.js';

const AU = 499 * CFG.steer.maxSpeed,
  YEAR = 6 * 3600,
  EARTH_R = 0.86,
  DEG = Math.PI / 180,
  FIND = 10;
// a body's radius from its width as a share of Earth's (see above; the sun's share is 109.2)
const size = (w) => EARTH_R * (w <= 1 ? w : 1 + Math.log(w) / Math.log(109.2));
const SUN_R = size(109.2);
// name, a (AU), e, mean longitude at J2000 (deg), longitude of perihelion (deg), period (days), width (Earth = 1), axial
// tilt (deg), turning on its axis (rad/s), its picture, its rings ([inner, outer (its radii), tilt (deg), colour,
// opacity, bands]), what it goes round (none: the sun)
// prettier-ignore
const BODIES = [
  ['Mercury', 0.387, 0.2056, 252.25, 77.46, 87.97, 0.383, 0, 0.05, 'mercury'],
  ['Venus', 0.723, 0.0068, 181.98, 131.6, 224.7, 0.949, 177, -0.03, 'venus'],
  ['Earth', 1.0, 0.0167, 100.46, 102.94, 365.26, 1, 23.4, 0.5, 'earth'],
  ['Moon', 384400 / 149.6e6, 0.0549, 218.32, 83.35, 27.32, 0.273, 6.7, 0.02, 'moon', null, 'Earth'],
  ['Mars', 1.524, 0.0934, 355.45, 336.04, 686.98, 0.532, 25.2, 0.48, 'mars'],
  ['Jupiter', 5.203, 0.0484, 34.4, 14.75, 4332.6, 10.97, 3.1, 0.9, 'jupiter', [1.45, 1.8, 3, 0xd8c8b0, 0.35, 'faint']],
  ['Saturn', 9.537, 0.0539, 49.94, 92.43, 10759, 9.14, 26.7, 0.85, 'saturn', [1.25, 2.35, 16, 0xe8d6a8, 1, 'saturn']],
  ['Uranus', 19.19, 0.0473, 313.23, 170.96, 30685, 3.98, 97.8, -0.6, 'uranus', [1.6, 2.0, 82, 0xb8d8e0, 0.6, 'narrow']],
  ['Neptune', 30.07, 0.0086, 304.88, 44.97, 60190, 3.86, 28.3, 0.6, 'neptune', [1.7, 2.3, 10, 0x9fb8e0, 0.35, 'faint']],
  ['Pluto', 39.48, 0.2488, 238.93, 224.07, 90560, 0.187, 122.5, -0.1, 'pluto'],
];

// ---- pictures, painted in code (equirectangular, 256 by 128)
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rng(seed) {
  let s = Math.max(1, Math.floor(seed) % 2147483646);
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
// a normally distributed number (mean 0, spread 1)
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
// smooth value noise on the picture, wrapping round left to right
function noiseField(W, H, cells, seed) {
  const r = rng(seed),
    cw = cells,
    ch = Math.max(2, Math.round((cells * H) / W)),
    g = [];
  for (let i = 0; i < cw * (ch + 1); i++) g.push(r());
  const at = (i, j) => g[(((i % cw) + cw) % cw) + cw * Math.min(ch, Math.max(0, j))];
  return (x, y) => {
    const fx = (x / W) * cw,
      fy = (y / H) * ch,
      i = Math.floor(fx),
      j = Math.floor(fy),
      u = fx - i,
      v = fy - j,
      su = u * u * (3 - 2 * u),
      sv = v * v * (3 - 2 * v);
    return (
      (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv
    );
  };
}
const mix = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
function paint(kind) {
  const W = 256,
    H = 128,
    c = canvas(W, H),
    g = c.getContext('2d'),
    img = g.createImageData(W, H),
    d = img.data,
    n1 = noiseField(W, H, 8, 11 + kind.length * 7),
    n2 = noiseField(W, H, 24, 29 + kind.length * 3),
    n3 = noiseField(W, H, 64, 47 + kind.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const lat = (y / H - 0.5) * 2,
        a = n1(x, y),
        b = n2(x, y),
        f = n3(x, y);
      let col;
      if (kind === 'sun') col = mix([255, 150, 40], [255, 236, 170], 0.5 * b + 0.5 * f);
      else if (kind === 'mercury') col = mix([110, 104, 100], [190, 182, 172], 0.6 * a + 0.4 * f);
      else if (kind === 'moon') col = mix([120, 120, 124], [215, 214, 210], 0.55 * a + 0.45 * f);
      else if (kind === 'venus') col = mix([206, 160, 90], [250, 226, 170], 0.5 + 0.5 * Math.sin(lat * 9 + a * 6));
      else if (kind === 'earth') {
        const land = a * 0.65 + b * 0.35 > 0.55 && Math.abs(lat) < 0.86;
        col = land ? mix([70, 120, 55], [150, 130, 80], f) : mix([18, 55, 140], [40, 100, 190], b);
        if (f * 0.6 + b * 0.4 > 0.64) col = mix(col, [250, 250, 255], 0.75);
        if (Math.abs(lat) > 0.86) col = [240, 245, 250];
      } else if (kind === 'mars') {
        col = mix([150, 60, 30], [215, 120, 70], 0.5 * a + 0.5 * f);
        if (Math.abs(lat) > 0.88) col = [240, 236, 230];
      } else if (kind === 'jupiter') {
        const band = 0.5 + 0.5 * Math.sin(lat * 13 + (b - 0.5) * 2.2);
        col = mix([160, 110, 75], [240, 225, 200], band);
        // the Great Red Spot
        const dx = (x - W * 0.62) / 18,
          dy = (y - H * 0.64) / 8;
        if (dx * dx + dy * dy < 1) col = mix(col, [200, 90, 60], 0.8 * (1 - dx * dx - dy * dy) + 0.2);
      } else if (kind === 'saturn') col = mix([200, 170, 110], [245, 228, 180], 0.5 + 0.5 * Math.sin(lat * 11 + b));
      else if (kind === 'uranus') col = mix([150, 215, 225], [195, 235, 240], 0.5 + 0.3 * Math.sin(lat * 6) + 0.2 * f);
      else if (kind === 'neptune') {
        col = mix([40, 70, 180], [80, 120, 220], 0.5 + 0.3 * Math.sin(lat * 7 + a * 3) + 0.2 * f);
        const dx = (x - W * 0.3) / 12,
          dy = (y - H * 0.62) / 6;
        if (dx * dx + dy * dy < 1) col = [25, 40, 110];
        if (b > 0.78 && Math.abs(lat) < 0.6) col = mix(col, [230, 240, 255], 0.6);
      } else {
        // Pluto: beige and grey, with its pale heart
        col = mix([150, 125, 100], [210, 190, 165], 0.5 * a + 0.5 * f);
        const dx = (x - W * 0.5) / 22,
          dy = (y - H * 0.55) / 18;
        const heart = Math.abs(dx) < 1 && dy > -1 && dy < 1 && dy < 1 - Math.abs(dx) * 1.2 + 0.3 * Math.cos(dx * 3);
        if (heart) col = [236, 228, 214];
      }
      const i = (y * W + x) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// a ring's bands, out from its inner edge (grey on black: it is the alphaMap, as the iPhone needs)
function ringBands(kind) {
  const c = canvas(256, 2),
    g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 2);
  const band = (a, b, v) => {
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.round(a * 256), 0, Math.max(1, Math.round((b - a) * 256)), 2);
  };
  if (kind === 'saturn') {
    band(0, 0.16, 70); // C ring
    band(0.16, 0.55, 235); // B ring
    band(0.55, 0.62, 25); // Cassini division
    band(0.62, 0.92, 175); // A ring
    band(0.84, 0.855, 40); // Encke gap
    band(0.96, 0.98, 120); // F ring
  } else if (kind === 'narrow') {
    for (const [a, v] of [
      [0.1, 150],
      [0.3, 120],
      [0.5, 140],
      [0.72, 110],
      [0.92, 230],
    ])
      band(a, a + 0.035, v);
  } else {
    band(0.05, 0.25, 80);
    band(0.25, 0.85, 150);
    band(0.85, 1, 60);
  }
  return new THREE.CanvasTexture(c);
}
// a flat ring round the origin in x-z, its u running from the inner edge out
function ringGeometry(inner, outer) {
  const g = new THREE.RingGeometry(inner, outer, 128, 1),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - inner) / (outer - inner), 0.5);
  g.rotateX(-Math.PI / 2);
  return g;
}
// a soft round dot, grey on black
function dot(size, hard) {
  const c = canvas(size, size),
    g = c.getContext('2d'),
    r = size / 2,
    grd = g.createRadialGradient(r, r, 0, r, r, r);
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  grd.addColorStop(0, 'rgb(255,255,255)');
  grd.addColorStop(hard ? 0.35 : 0.15, hard ? 'rgb(200,200,200)' : 'rgb(170,170,170)');
  grd.addColorStop(hard ? 0.6 : 0.45, 'rgb(40,40,40)');
  grd.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
// twinkling points, each with its own beat and size (aTw: seed, size); depth: how far each dims as it twinkles
function twinkleMaterial(size, attenuate, rate, depth) {
  const m = new THREE.PointsMaterial({
    size,
    sizeAttenuation: attenuate,
    vertexColors: true,
    alphaMap: dot(32, true),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.userData.time = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aTw;\nuniform float uTime;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vColor.rgb *= ${(1 - depth).toFixed(2)} + ${depth.toFixed(2)} * pow(0.5 + 0.5 * sin(uTime * ${rate.toFixed(2)} * (0.6 + aTw.x) + aTw.x * 60.0), 2.0);`,
      )
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aTw.y;')
      .replace(
        '#include <logdepthbuf_vertex>',
        'gl_PointSize = max(gl_PointSize, 1.2);\n#include <logdepthbuf_vertex>',
      );
  };
  return m;
}
// A thin dashed ribbon along a path on the plane (pts: Vector3s), width w metres, dashes `dash` long with gaps as long
function ribbonOf(pts, w, dash) {
  const n = pts.length,
    pos = new Float32Array(n * 6),
    dist = new Float32Array(n * 2),
    idx = [];
  let d = 0;
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)],
      b = pts[Math.min(n - 1, k + 1)],
      tx = b.x - a.x,
      tz = b.z - a.z,
      tl = Math.hypot(tx, tz) || 1,
      nx = -tz / tl,
      nz = tx / tl,
      p = pts[k];
    if (k) d += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z);
    pos.set([p.x + (nx * w) / 2, p.y, p.z + (nz * w) / 2, p.x - (nx * w) / 2, p.y, p.z - (nz * w) / 2], k * 6);
    dist[k * 2] = dist[k * 2 + 1] = d;
    if (k < n - 1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({
    color: 0xa6adbb,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDist;\nvarying float vDist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDist = aDist;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if (fract(vDist / ${(dash * 2).toFixed(2)}) > 0.5) discard;`,
      );
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}
function pointsOf(pos, col, tw) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aTw', new THREE.Float32BufferAttribute(tw, 2));
  return g;
}

// scene, renderer and camera: the world's (scene.js)
export function createSolar(scene, renderer, camera) {
  renderer.localClippingEnabled = true;
  // only what is above the plane is drawn: the bodies sit half in it
  const CLIP = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  // the sun: resting on the plane, burning bright enough for the night's glow to catch, and a halo round it
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_R, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: paint('sun'),
      emissiveIntensity: 2.4,
    }),
  );
  sun.position.y = SUN_R;
  root.add(sun);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xffb860,
      alphaMap: dot(64, false),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.setScalar(SUN_R * 6.5);
  halo.position.y = SUN_R;
  root.add(halo);
  // its light on the bodies (and on her), the same at any distance
  const light = new THREE.PointLight(0xfff0d8, 2.4, 0, 0);
  light.position.y = SUN_R;
  root.add(light);
  // today's date, in days from J2000
  const days0 = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const bodies = BODIES.map(([name, a, e, L0, varpi, period, w, tilt, spin, kind, ring, parent]) => {
    const r = size(w),
      body = new THREE.Group(),
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 40, 24),
        new THREE.MeshStandardMaterial({ map: paint(kind), roughness: 0.85, clippingPlanes: CLIP }),
      );
    // its axis tipped over, and turning on it
    const axis = new THREE.Group();
    axis.rotation.z = tilt * DEG;
    axis.add(mesh);
    body.add(axis);
    if (ring) {
      const [ri, ro, rt, rc, ro2, bands] = ring,
        rm = new THREE.Mesh(
          ringGeometry(r * ri, r * ro),
          new THREE.MeshStandardMaterial({
            color: rc,
            alphaMap: ringBands(bands),
            transparent: true,
            opacity: ro2,
            side: THREE.DoubleSide,
            depthWrite: false,
            roughness: 0.9,
            clippingPlanes: CLIP,
          }),
        );
      // tilted a little toward her view, about the axis across the screen
      rm.rotation.x = rt * DEG;
      body.add(rm);
    }
    root.add(body);
    // its orbit: a dashed ellipse round the sun (or, for the Moon, round the Earth), fine enough to stay within a few
    // centimetres of the true curve where she crosses it
    const A = a * AU,
      b = A * Math.sqrt(1 - e * e),
      n = Math.min(4096, Math.max(512, Math.round(A / 40))),
      pts = [];
    for (let k = 0; k <= n; k++) {
      const E = (k / n) * Math.PI * 2,
        x = A * (Math.cos(E) - e),
        y = b * Math.sin(E),
        X = x * Math.cos(varpi * DEG) - y * Math.sin(varpi * DEG),
        Y = x * Math.sin(varpi * DEG) + y * Math.cos(varpi * DEG);
      pts.push(new THREE.Vector3(X, 0.02, -Y));
    }
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({
        color: 0xa6adbb,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        toneMapped: false,
        dashSize: 2.5,
        gapSize: 2.5,
      }),
    );
    orbit.computeLineDistances();
    orbit.frustumCulled = false;
    // up close the same orbit as a ribbon 14 cm wide, which shows on a phone and can glow (the line above stays for
    // the view from far up, where the ribbon would be thinner than a pixel)
    const band = ribbonOf(pts, 0.14, 2.5);
    orbit.add(band);
    root.add(orbit);
    // x, z: where it is in the world; side: which side of its orbit she was on last frame; glow: its orbit lit up
    return { name, a, e, L0, varpi, period, r, spin, parent, body, mesh, orbit, x: 0, z: 0, side: 0, glow: 0 };
  });
  const byName = Object.fromEntries(bodies.map((B) => [B.name, B]));

  // The asteroid belt (2.2 to 3.3 AU): far off, a faint ring of points (seen zoomed out); near her, a field of
  // twinkling lights on the plane (below), the same every visit
  const BELT = [2.2 * AU, 3.3 * AU];
  const beltFar = (() => {
    const r = rng(7),
      pos = [],
      col = [],
      tw = [],
      c = new THREE.Color();
    for (let i = 0; i < 7000; i++) {
      const rad = BELT[0] + (BELT[1] - BELT[0]) * Math.min(1, Math.max(0, 0.5 + 0.22 * gauss(r))),
        a = r() * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0.04, Math.sin(a) * rad);
      c.setHSL(0.08 + r() * 0.06, 0.25, 0.5 + r() * 0.3);
      col.push(c.r, c.g, c.b);
      tw.push(r(), 1);
    }
    const p = new THREE.Points(pointsOf(pos, col, tw), twinkleMaterial(1.6, false, 1.2, 0.5));
    p.frustumCulled = false;
    root.add(p);
    return p;
  })();
  // Near her, the belt is drawn by a shader on a square of the plane that goes where she goes: a light in some of the
  // cells of a 0.7 m grid (more of them toward the belt's middle), each set somewhere in its cell, twinkling on its own
  // beat. Held upright the view is only a few metres across, so the field has to be dense, about two lights to the
  // square metre: far too many to lay as points. Far off they shrink no smaller than a pixel and dim instead.
  const BELT_CELL = 0.7;
  const nearMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOff: { value: new THREE.Vector2() },
      uBelt: { value: new THREE.Vector2(...BELT) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
uniform vec2 uOff;
varying vec2 vL;
void main() {
  vL = position.xz + uOff;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform float uTime;
uniform vec2 uBelt;
varying vec2 vL;
// a hash of a cell; the cell is taken modulo 1024 first, so the numbers stay small enough for the GPU's precision
float h21(vec2 p) { p = fract(p * vec2(0.2334, 0.8517) + 0.13); p += dot(p, p + 23.45); return fract(p.x * p.y); }
void main() {
  float cell = ${BELT_CELL.toFixed(2)};
  vec2 g = vL / cell, id = floor(g), f = fract(g), q = mod(id, 1024.0) / 1024.0 * 977.0;
  float u = (length((id + 0.5) * cell) - uBelt.x) / (uBelt.y - uBelt.x);
  if (u < 0.0 || u > 1.0) discard;
  float h = h21(q);
  if (h > 0.8 * pow(sin(3.14159 * u), 0.6)) discard;
  vec2 c = vec2(h21(q + 1.7), h21(q + 3.1)) * 0.5 + 0.25;
  float r = length(f - c) * cell,
    px = fwidth(vL.x),
    want = 0.03 + 0.035 * h21(q + 5.3),
    rad = max(want, px * 1.1),
    a = smoothstep(rad, rad * 0.35, r);
  if (a <= 0.0) discard;
  float tw = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(uTime * (1.3 + h21(q + 7.7) * 2.6) + h * 60.0), 2.0);
  vec3 col = mix(vec3(1.0, 0.82, 0.55), vec3(0.85, 0.9, 1.0), h21(q + 9.1));
  // spread over more of the screen than it is wide (far off): dimmer, so it is no brighter in all
  gl_FragColor = vec4(col * a * tw * min(1.0, (want * want) / (rad * rad)) * 1.6, 1.0);
}`,
  });
  const near = new THREE.Mesh(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2), nearMat);
  near.frustumCulled = false;
  near.renderOrder = 1;
  root.add(near);
  // the square goes where she goes, shown only in or near the belt
  function layBelt(lx, lz) {
    const d = Math.hypot(lx, lz);
    near.visible = d > BELT[0] - 260 && d < BELT[1] + 260;
    near.position.set(lx, 0.03, lz);
    nearMat.uniforms.uOff.value.set(lx, lz);
  }
  // Stars far below the plane, faint: most of them gathered in a soft band across the sky (scattered about it by a
  // gaussian, as the Milky Way is), the rest anywhere; most of them dim, a few brighter. They go wherever the camera goes.
  const stars = (() => {
    const r = rng(19),
      pos = [],
      col = [],
      tw = [],
      c = new THREE.Color(),
      R = 12000,
      // the band: a great circle tipped well under the plane
      bn = new THREE.Vector3(0.25, 0.8, 0.55).normalize(),
      e1 = new THREE.Vector3(1, 0, 0).addScaledVector(bn, -bn.x).normalize(),
      e2 = new THREE.Vector3().crossVectors(bn, e1),
      v = new THREE.Vector3();
    for (let i = 0; i < 3200; i++) {
      if (r() < 0.65) {
        const th = r() * Math.PI * 2;
        v.copy(e1)
          .multiplyScalar(Math.cos(th))
          .addScaledVector(e2, Math.sin(th))
          .addScaledVector(bn, 0.14 * gauss(r))
          .normalize();
      } else v.set(gauss(r), gauss(r), gauss(r)).normalize();
      // only under the plane
      if (v.y > -0.03) v.y = -Math.abs(v.y) - 0.03;
      v.normalize();
      pos.push(v.x * R, v.y * R, v.z * R);
      const bright = Math.min(1, Math.abs(gauss(r)) * 0.3);
      c.setHSL(0.55 + r() * 0.12, 0.25 * r(), 0.25 + 0.45 * bright);
      col.push(c.r, c.g, c.b);
      tw.push(r(), 0.8 + bright * 1.4);
    }
    const p = new THREE.Points(pointsOf(pos, col, tw), twinkleMaterial(1.5, false, 0.7, 0.35));
    p.frustumCulled = false;
    p.visible = false;
    scene.add(p);
    return p;
  })();

  // marks at the edge of the screen pointing to the sun and to each body whose orbit or self she has found
  const marks = document.createElement('div');
  marks.id = 'solmarks';
  marks.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;display:none';
  document.body.appendChild(marks);
  const markEls = new Map();
  const markOf = (name) => {
    if (!markEls.has(name)) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:0;top:0;transform:translate(-50%,-50%);font:600 11px/1.25 system-ui,sans-serif;' +
        'letter-spacing:0.04em;color:rgba(235,240,255,0.8);text-align:center;white-space:nowrap;text-shadow:0 0 4px #000';
      el.innerHTML = '<div class="arw" style="font-size:12px;line-height:1">&#9650;</div><div class="txt"></div>';
      marks.appendChild(el);
      markEls.set(name, el);
    }
    return markEls.get(name);
  };
  const _p = new THREE.Vector3(),
    her = { x: 0, z: 0 },
    // the marks placed so far this frame: [x, y, half width]
    placed = [];
  function placeMark(name, x, z, show) {
    const el = markOf(name);
    if (!show) {
      el.style.display = 'none';
      return;
    }
    const W = window.innerWidth,
      H = window.innerHeight,
      d = Math.hypot(x - her.x, z - her.z);
    _p.set(x, 0.5, z).project(camera);
    let sx = (_p.x * 0.5 + 0.5) * W,
      sy = (-_p.y * 0.5 + 0.5) * H;
    // behind the camera: point the other way
    if (_p.z > 1) {
      sx = W - sx;
      sy = H - sy;
    }
    const L = 26,
      T = 190,
      Rr = W - 26,
      Bt = H - 140,
      cx = W / 2,
      cy = H / 2,
      inside = sx > L && sx < Rr && sy > T && sy < Bt && _p.z <= 1;
    // close enough to see: no mark
    if (d < 40 || (inside && d < 60)) {
      el.style.display = 'none';
      return;
    }
    const dx = sx - cx,
      dy = sy - cy;
    if (!inside) {
      const k = Math.min(
        dx > 0 ? (Rr - cx) / dx : dx < 0 ? (L - cx) / dx : Infinity,
        dy > 0 ? (Bt - cy) / dy : dy < 0 ? (T - cy) / dy : Infinity,
      );
      sx = cx + dx * k;
      sy = cy + dy * k;
    }
    el.style.display = 'block';
    el.querySelector('.arw').style.transform = `rotate(${Math.atan2(dx, -dy).toFixed(3)}rad)`;
    el.querySelector('.txt').textContent =
      name + ' ' + (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km');
    // the whole of it on screen, and not on top of a mark already placed this frame
    const hw = (el.offsetWidth || 80) / 2 + 4;
    sx = Math.min(W - hw, Math.max(hw, sx));
    for (let k = 0; k < 6 && placed.some((q) => Math.abs(q[0] - sx) < q[2] + hw && Math.abs(q[1] - sy) < 28); k++)
      sy += sy > H / 2 ? -30 : 30;
    placed.push([sx, sy, hw]);
    el.style.left = sx.toFixed(1) + 'px';
    el.style.top = sy.toFixed(1) + 'px';
  }

  const found = new Set(),
    orbits = new Set();
  let on = false,
    t = 0;
  // where each body is on its orbit, game time t (s) after the system appeared
  function place() {
    const daysNow = days0 + (t * 365.256) / YEAR;
    for (const B of bodies) {
      const M = ((B.L0 + (360 * daysNow) / B.period - B.varpi) % 360) * DEG;
      let E = M;
      for (let k = 0; k < 8; k++) E = M + B.e * Math.sin(E);
      const A = B.a * AU,
        x = A * (Math.cos(E) - B.e),
        y = A * Math.sqrt(1 - B.e * B.e) * Math.sin(E),
        c = Math.cos(B.varpi * DEG),
        s = Math.sin(B.varpi * DEG),
        P = B.parent ? byName[B.parent].body.position : null;
      B.body.position.set(x * c - y * s + (P ? P.x : 0), 0, -(x * s + y * c) + (P ? P.z : 0));
      if (P) B.orbit.position.set(P.x, 0, P.z);
      B.x = root.position.x + B.body.position.x;
      B.z = root.position.z + B.body.position.z;
    }
  }
  // which side of a body's orbit (x, z) is on, in metres: - inside, + outside
  function sideOf(B, x, z) {
    const P = B.parent ? byName[B.parent] : null,
      dx = x - (P ? P.x : root.position.x),
      dz = z - (P ? P.z : root.position.z),
      th = Math.atan2(-dz, dx),
      A = B.a * AU,
      rr = (A * (1 - B.e * B.e)) / (1 + B.e * Math.cos(th - B.varpi * DEG));
    return Math.hypot(dx, dz) - rr;
  }
  const api = {
    // called the first time she comes near a body (name, false), and the first time she crosses its orbit (name, true)
    onFind: null,
    AU,
    get on() {
      return on;
    },
    // on: shown (paper at dusk). x, z: where she is, so the sun appears a few metres ahead of her
    set(v, x, z) {
      if (v === on) return;
      on = v;
      root.visible = stars.visible = v;
      marks.style.display = v ? 'block' : 'none';
      if (v) {
        root.position.set(x || 0, 0, (z || 0) - 9);
        t = 0;
        place();
        for (const B of bodies) B.side = 0;
      }
    },
    // every frame: the bodies go round and turn, the lights twinkle, orbits she crosses and bodies she comes near are
    // discovered, and the marks point the way. e: how far the view is zoomed out (0..1); quiet: the game is paused or
    // the front page is up (no marks)
    update(dt, S, e, now, quiet) {
      if (!on) return;
      t += dt;
      place();
      const tw = now / 1000;
      beltFar.material.userData.time.value = tw;
      nearMat.uniforms.uTime.value = tw;
      stars.material.userData.time.value = tw;
      stars.position.copy(camera.position);
      sun.rotation.y += dt * 0.05;
      layBelt(S.x - root.position.x, S.z - root.position.z);
      her.x = S.x;
      her.z = S.z;
      placed.length = 0;
      for (const B of bodies) {
        B.mesh.rotation.y += dt * B.spin;
        // crossing its orbit: the line lights up, and the first time the orbit is discovered
        const sd = sideOf(B, S.x, S.z);
        if (B.side && Math.sign(sd) !== Math.sign(B.side) && Math.abs(sd) < 60) {
          B.glow = 1;
          if (!orbits.has(B.name)) {
            orbits.add(B.name);
            if (api.onFind) api.onFind(B.name, true);
          }
        }
        B.side = sd;
        B.glow *= Math.exp(-dt / 1.6);
        const lit = orbits.has(B.name) ? 1 : 0;
        for (const m of [B.orbit.material, B.orbit.children[0].material]) {
          m.color.setHex(0xa6adbb).multiplyScalar(1 + lit * 0.5 + B.glow * 4);
          m.opacity = Math.min(1, 0.4 + lit * 0.2 + B.glow * 0.5);
        }
        if (!found.has(B.name) && Math.hypot(S.x - B.x, S.z - B.z) < B.r + FIND) {
          found.add(B.name);
          if (api.onFind) api.onFind(B.name, false);
        }
        B.body.visible = found.has(B.name) || e < 0.5;
        placeMark(B.name, B.x, B.z, !quiet && e < 0.5 && (found.has(B.name) || orbits.has(B.name)));
      }
      placeMark('Sun', root.position.x, root.position.z, !quiet && e < 0.5);
    },
    // If (x, z) is inside the sun or a body where it meets the plane: the nearest point outside and the way out
    hit(x, z) {
      if (!on) return null;
      const test = (cx, cz, r) => {
        const dx = x - cx,
          dz = z - cz,
          d = Math.hypot(dx, dz);
        if (d >= r) return null;
        const nx = d > 1e-6 ? dx / d : 0,
          nz = d > 1e-6 ? dz / d : 1;
        return { x: cx + nx * r * 1.002, z: cz + nz * r * 1.002, nx, nz };
      };
      const h = test(root.position.x, root.position.z, SUN_R + 0.3);
      if (h) return h;
      for (const B of bodies) {
        const q = test(B.x, B.z, B.r + 0.25);
        if (q) return q;
      }
      return null;
    },
    // the bodies and orbits discovered so far (saved), and back from a save
    get found() {
      return [...found];
    },
    get orbits() {
      return [...orbits];
    },
    restore(list, orbitList) {
      if (Array.isArray(list)) list.forEach((n) => found.add(n));
      if (Array.isArray(orbitList)) orbitList.forEach((n) => orbits.add(n));
    },
    // forget them all (for tests)
    forget() {
      found.clear();
      orbits.clear();
    },
    // for tests and screenshots: where each body is now (in the world), the sun, and which side of an orbit a point is
    get planets() {
      return bodies.map((B) => ({ name: B.name, x: B.x, z: B.z, r: B.r, visible: B.body.visible }));
    },
    get sun() {
      return { x: root.position.x, z: root.position.z, r: SUN_R };
    },
    sideOf: (name, x, z) => sideOf(byName[name], x, z),
    // the belt's lights are drawn round her now (for tests)
    get beltNear() {
      return near.visible;
    },
  };
  return api;
}
