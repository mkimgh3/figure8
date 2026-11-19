// Ice spray: small white flecks thrown up by hard edges, landings, spins and falls.
import * as THREE from './three.js';
import { iceY } from '../core/terrain.js';
export function createSpray(scene) {
  const N = 320,
    pos = new Float32Array(N * 3).fill(-50),
    vel = new Float32Array(N * 3),
    life = new Float32Array(N),
    still = new Uint8Array(N),
    // the ice under each fleck where it was thrown up, so it comes down onto it (rolling ice)
    floor = new Float32Array(N);
  let next = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  // opaque, used as an alpha map (see atmos.js)
  {
    const g = c.getContext('2d'),
      gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 32, 32);
    gr.addColorStop(0, 'rgb(255,255,255)');
    gr.addColorStop(0.5, 'rgb(140,140,140)');
    gr.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
  }
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      alphaMap: new THREE.CanvasTexture(c),
      color: 0xffffff,
      size: 0.11,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  pts.frustumCulled = false;
  pts.renderOrder = 4;
  scene.add(pts);
  return {
    // n flecks from (x, z), thrown mostly along (dx, dz) at about `speed`, fanned out by `spread`
    emit(x, z, dx, dz, n, speed, spread) {
      for (let i = 0; i < n; i++) {
        const k = next * 3;
        next = (next + 1) % N;
        const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * spread,
          v = speed * (0.4 + Math.random() * 0.8);
        pos[k] = x + (Math.random() - 0.5) * 0.15;
        floor[k / 3] = iceY(x, z) + 0.02;
        pos[k + 1] = floor[k / 3] + 0.01;
        pos[k + 2] = z + (Math.random() - 0.5) * 0.15;
        vel[k] = Math.sin(a) * v;
        vel[k + 1] = 0.6 + Math.random() * 1.6;
        vel[k + 2] = Math.cos(a) * v;
        life[k / 3] = 0.35 + Math.random() * 0.4;
        still[k / 3] = 0;
      }
    },
    // a fleck of drifting snow hanging in the air; it does not move, she does
    mote(x, y, z, sec) {
      const k = next * 3;
      still[next] = 1;
      life[next] = sec;
      next = (next + 1) % N;
      pos[k] = x;
      pos[k + 1] = y + iceY(x, z);
      pos[k + 2] = z;
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        any = true;
        const k = i * 3;
        life[i] -= dt;
        if (life[i] <= 0) {
          pos[k + 1] = -50;
          continue;
        }
        if (still[i]) continue;
        vel[k + 1] -= 7 * dt;
        const f = Math.exp(-2.5 * dt);
        vel[k] *= f;
        vel[k + 2] *= f;
        pos[k] += vel[k] * dt;
        pos[k + 1] = Math.max(floor[i], pos[k + 1] + vel[k + 1] * dt);
        pos[k + 2] += vel[k + 2] * dt;
      }
      if (any) geo.attributes.position.needsUpdate = true;
    },
  };
}
