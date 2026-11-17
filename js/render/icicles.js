// Icicles under the line: for a few seconds after a stretch of line is drawn, glints of its colour sink from it into the deep ice.
// Each spot on the line sheds a few glints that fall at different speeds, so together they draw out a thin spike that
// lengthens downward and fades. The ice writes no depth, so they show through it, shifting against the line as the view moves.
import * as THREE from './three.js';
import { CFG } from '../config.js';

export function createIcicles(scene) {
  const K = CFG.icicles,
    N = 1800,
    pos = new Float32Array(N * 3).fill(-50),
    col = new Float32Array(N * 3),
    base = new Float32Array(N * 3),
    vel = new Float32Array(N),
    life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // a soft dot, drawn opaque in grey on black and used as an alpha map (nearly transparent pixels speckle on iPhone)
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  {
    const g = c.getContext('2d'),
      gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 32, 32);
    gr.addColorStop(0, 'rgb(255,255,255)');
    gr.addColorStop(0.45, 'rgb(120,120,120)');
    gr.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  }
  const mat = new THREE.PointsMaterial({
    alphaMap: new THREE.CanvasTexture(c),
    vertexColors: true,
    size: K.size,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -1;
  scene.add(pts);
  const tint = new THREE.Color();
  let next = 0,
    lx = 1e9,
    lz = 1e9,
    strength = 1,
    on = true;
  return {
    set enabled(v) {
      on = v;
      pts.visible = v;
    },
    set strength(v) {
      strength = v;
    },
    // the blade is at (x, z), drawing in this colour: shed a spike for every `spacing` metres of line
    trail(x, z, colorInt) {
      if (!on) return;
      const d = Math.hypot(x - lx, z - lz);
      if (d < K.spacing) return;
      if (d > 3) {
        lx = x;
        lz = z;
        return;
      }
      lx = x;
      lz = z;
      tint.setHex(colorInt);
      const r = 0.35 + 0.65 * tint.r,
        g = 0.35 + 0.65 * tint.g,
        b = 0.35 + 0.65 * tint.b,
        jx = (Math.random() - 0.5) * 0.05,
        jz = (Math.random() - 0.5) * 0.05,
        v = K.sink * (0.6 + Math.random() * 0.9);
      for (let i = 0; i < K.perSpot; i++) {
        const k = next * 3;
        pos[k] = x + jx;
        pos[k + 1] = -0.02;
        pos[k + 2] = z + jz;
        base[k] = r;
        base[k + 1] = g;
        base[k + 2] = b;
        vel[next] = v * (1 - (i / K.perSpot) * 0.75);
        life[next] = K.seconds * (0.75 + Math.random() * 0.25);
        next = (next + 1) % N;
      }
    },
    update(dt) {
      if (!on) return;
      let any = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        any = true;
        const k = i * 3;
        life[i] -= dt;
        if (life[i] <= 0) {
          pos[k + 1] = -50;
          col[k] = col[k + 1] = col[k + 2] = 0;
          continue;
        }
        pos[k + 1] -= vel[i] * dt;
        const u = life[i] / K.seconds,
          f = Math.min(1, u * 2.2) * Math.min(1, (1 - u) * 12 + 0.25) * strength * K.bright;
        col[k] = base[k] * f;
        col[k + 1] = base[k + 1] * f;
        col[k + 2] = base[k + 2] * f;
      }
      if (any) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      }
    },
  };
}
