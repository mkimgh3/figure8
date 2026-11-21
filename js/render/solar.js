// The solar system on paper at dusk (v3-look77, Mark: "for the dusk paper mode start the player with a 3d sun sphere and
// place planets around in distance analogous to planets position relative to sun. exaggerate the size of the planet.
// the sun is the size of 1.5 times the player, show the elliptical planet's orbit as faint dash line and for the asteroid
// belt show it as field of twinkling lights on the surface. the planets are halfway into the plane. for this option lets
// try invisible plane. for saturn have the rings slightly tilted and make sure to add rings for all planets with rings.
// do include pluto. for zoomed out view, only show the planets when they are discovered. the planets do revolve around
// the sun").
//
// The sheet itself is not drawn (CFG.paper.Dusk.space): she skates over a dark sky with stars far below it. The sun sits
// on the plane a few metres ahead of where she is when the system appears; each planet is on its own ellipse round it
// (the real shape and the real way round, from each orbit's elements at J2000; inclinations left out), where it really
// is on today's date, and goes round at a year of YEAR seconds for the Earth. Distances to scale (AU metres to one
// astronomical unit), the planets far larger than to scale; each is cut off where the plane is, so it sits half in it.
// Her line is drawn on the plane as usual.
import * as THREE from './three.js';

const AU = 36,
  YEAR = 120,
  SUN_R = 1.3,
  DEG = Math.PI / 180,
  // planets she has come this near (metres, past their radius) are discovered
  FIND = 10;
// name, a (AU), e, mean longitude at J2000 (deg), longitude of perihelion (deg), period (days), radius (m), axial tilt
// (deg), how fast it turns on its axis (rad/s, + the usual way), its picture (paint), its rings
// rings: [inner, outer (planet radii), tilt (deg, from lying flat), colour, opacity, bands]
// prettier-ignore
const PLANETS = [
  ['Mercury', 0.387, 0.2056, 252.25, 77.46, 87.97, 0.32, 0, 0.05, 'mercury'],
  ['Venus', 0.723, 0.0068, 181.98, 131.6, 224.7, 0.45, 177, -0.03, 'venus'],
  ['Earth', 1.0, 0.0167, 100.46, 102.94, 365.26, 0.48, 23.4, 0.5, 'earth'],
  ['Mars', 1.524, 0.0934, 355.45, 336.04, 686.98, 0.36, 25.2, 0.48, 'mars'],
  ['Jupiter', 5.203, 0.0484, 34.4, 14.75, 4332.6, 1.15, 3.1, 0.9, 'jupiter', [1.45, 1.8, 3, 0xd8c8b0, 0.35, 'faint']],
  ['Saturn', 9.537, 0.0539, 49.94, 92.43, 10759, 1.0, 26.7, 0.85, 'saturn', [1.25, 2.35, 16, 0xe8d6a8, 1, 'saturn']],
  ['Uranus', 19.19, 0.0473, 313.23, 170.96, 30685, 0.7, 97.8, -0.6, 'uranus', [1.6, 2.0, 82, 0xb8d8e0, 0.6, 'narrow']],
  ['Neptune', 30.07, 0.0086, 304.88, 44.97, 60190, 0.68, 28.3, 0.6, 'neptune', [1.7, 2.3, 10, 0x9fb8e0, 0.35, 'faint']],
  ['Pluto', 39.48, 0.2488, 238.93, 224.07, 90560, 0.3, 122.5, -0.1, 'pluto'],
];

// ---- pictures, painted in code (equirectangular, 256 by 128)
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
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
  const t = new THREE.CanvasTexture(c);
  return t;
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
// twinkling points: each with its own beat (aSeed)
function twinkleMaterial(size, attenuate, rate) {
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
      .replace('#include <common>', '#include <common>\nattribute float aSeed;\nuniform float uTime;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vColor.rgb *= 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * ${rate.toFixed(2)} * (0.6 + aSeed) + aSeed * 60.0), 2.0);`,
      )
      .replace(
        '#include <logdepthbuf_vertex>',
        'gl_PointSize = max(gl_PointSize, 1.5);\n#include <logdepthbuf_vertex>',
      );
  };
  return m;
}

export function createSolar(scene, renderer) {
  renderer.localClippingEnabled = true;
  // only what is above the plane is drawn: the planets sit half in it
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
  // its light on the planets (and on her)
  const light = new THREE.PointLight(0xfff0d8, 2.4, 0, 0);
  light.position.y = SUN_R;
  root.add(light);
  // today's date, in days from J2000
  const days0 = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const planets = PLANETS.map(([name, a, e, L0, varpi, period, r, tilt, spin, kind, ring]) => {
    const body = new THREE.Group(),
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
    // its orbit: a faint dashed ellipse
    const b = a * Math.sqrt(1 - e * e),
      pts = [];
    for (let k = 0; k <= 360; k++) {
      const E = (k / 360) * Math.PI * 2,
        x = a * (Math.cos(E) - e),
        y = b * Math.sin(E),
        X = x * Math.cos(varpi * DEG) - y * Math.sin(varpi * DEG),
        Y = x * Math.sin(varpi * DEG) + y * Math.cos(varpi * DEG);
      pts.push(new THREE.Vector3(X * AU, 0.02, -Y * AU));
    }
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({
        color: 0xdfe8ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        dashSize: Math.max(0.8, a * AU * 0.02),
        gapSize: Math.max(0.8, a * AU * 0.02),
      }),
    );
    orbit.computeLineDistances();
    root.add(orbit);
    return { name, a, e, L0, varpi, period, r, spin, body, mesh, orbit, x: 0, z: 0 };
  });
  // the asteroid belt: a field of twinkling lights on the plane, from 2.2 to 3.3 AU, turning slowly
  const belt = (() => {
    const n = 4200,
      r = rng(7),
      pos = [],
      col = [],
      seed = [],
      c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const rad = (2.2 + Math.pow(r(), 0.9) * 1.1) * AU,
        a = r() * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0.04, Math.sin(a) * rad);
      c.setHSL(0.08 + r() * 0.06, 0.25 + r() * 0.3, 0.55 + r() * 0.35);
      col.push(c.r, c.g, c.b);
      seed.push(r());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const p = new THREE.Points(g, twinkleMaterial(0.55, true, 2.2));
    p.frustumCulled = false;
    root.add(p);
    return p;
  })();
  // stars far below the plane (and round it), so the dark under her is deep sky
  const stars = (() => {
    const n = 2600,
      r = rng(19),
      pos = [],
      col = [],
      seed = [],
      c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1,
        th = r() * Math.PI * 2,
        s = Math.sqrt(1 - u * u),
        // mostly below, a few round the horizon
        y = -Math.abs(u) * 0.95 - 0.05;
      const R = 2500;
      pos.push(Math.cos(th) * s * R, y * R, Math.sin(th) * s * R);
      c.setHSL(0.55 + r() * 0.12, 0.3 * r(), 0.65 + r() * 0.35);
      col.push(c.r, c.g, c.b);
      seed.push(r());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    const p = new THREE.Points(g, twinkleMaterial(2.4, false, 0.8));
    p.frustumCulled = false;
    root.add(p);
    return p;
  })();

  const found = new Set();
  let on = false,
    t = 0;
  // where each planet is on its orbit, years' worth of game time (s) after the system appeared
  function place() {
    const daysNow = days0 + (t * 365.256) / YEAR;
    for (const P of planets) {
      const M = ((P.L0 + (360 * daysNow) / P.period - P.varpi) % 360) * DEG;
      let E = M;
      for (let k = 0; k < 6; k++) E = M + P.e * Math.sin(E);
      const x = P.a * (Math.cos(E) - P.e),
        y = P.a * Math.sqrt(1 - P.e * P.e) * Math.sin(E),
        c = Math.cos(P.varpi * DEG),
        s = Math.sin(P.varpi * DEG);
      P.body.position.set((x * c - y * s) * AU, 0, -(x * s + y * c) * AU);
      P.x = root.position.x + P.body.position.x;
      P.z = root.position.z + P.body.position.z;
    }
  }
  const api = {
    // called with a planet's name the first time she comes near it
    onFind: null,
    get on() {
      return on;
    },
    // on: shown (paper at dusk). x, z: where she is, so the sun appears a few metres ahead of her
    set(v, x, z) {
      if (v === on) return;
      on = v;
      root.visible = v;
      if (v) {
        root.position.set(x || 0, 0, (z || 0) - 8);
        t = 0;
        place();
      }
    },
    // every frame: the planets go round and turn, the lights twinkle, and those she comes near are discovered.
    // e: how far the view is zoomed out (0..1): zoomed out, only the discovered planets show.
    update(dt, S, e, now) {
      if (!on) return;
      t += dt;
      place();
      const tw = now / 1000;
      belt.material.userData.time.value = tw;
      stars.material.userData.time.value = tw;
      belt.rotation.y += (dt * Math.PI * 2) / (YEAR * 4.6);
      sun.rotation.y += dt * 0.05;
      for (const P of planets) {
        P.mesh.rotation.y += dt * P.spin;
        if (!found.has(P.name) && Math.hypot(S.x - P.x, S.z - P.z) < P.r + FIND) {
          found.add(P.name);
          if (api.onFind) api.onFind(P.name);
        }
        P.body.visible = found.has(P.name) || e < 0.5;
      }
    },
    // If (x, z) is inside the sun or a planet where it meets the plane: the nearest point outside and the way out
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
      for (const P of planets) {
        const q = test(P.x, P.z, P.r + 0.25);
        if (q) return q;
      }
      return null;
    },
    // the planets discovered so far (saved), and back from a save
    get found() {
      return [...found];
    },
    restore(list) {
      if (Array.isArray(list)) list.forEach((n) => found.add(n));
    },
    // forget them all (for tests)
    forget() {
      found.clear();
    },
    // for tests and screenshots: where each planet is now (in the world), and the sun
    get planets() {
      return planets.map((P) => ({ name: P.name, x: P.x, z: P.z, r: P.r, visible: P.body.visible }));
    },
    get sun() {
      return { x: root.position.x, z: root.position.z, r: SUN_R };
    },
  };
  return api;
}
