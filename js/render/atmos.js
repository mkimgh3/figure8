// Weather near the skater: falling snow (no mist: layers of it over the ice read as fog over everything). Both live in a box that follows the camera,
// so there is always some around her and none is wasted far away.
import * as THREE from './three.js';

// Soft shapes are drawn grey on an opaque black canvas and used as alpha maps. A canvas with nearly transparent
// pixels keeps almost nothing of their colour (it stores colour pre-multiplied by alpha), and on some phones that
// comes back as speckles of random colour: a fog of confetti.
export function softDot(size, inner) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'),
    r = size / 2,
    gr = g.createRadialGradient(r, r, 0, r, r, r);
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  gr.addColorStop(0, 'rgb(255,255,255)');
  gr.addColorStop(inner, 'rgb(153,153,153)');
  gr.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
// A glint: a small bright core with four thin rays, grey on black like softDot
export function starDot(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'),
    r = size / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  const core = g.createRadialGradient(r, r, 0, r, r, r * 0.22);
  core.addColorStop(0, 'rgb(255,255,255)');
  core.addColorStop(0.4, 'rgb(150,150,150)');
  core.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);
  for (const [x0, y0, x1, y1, w, h] of [
    [0, r, size, r, size, size * 0.05],
    [r, 0, r, size, size * 0.05, size],
  ]) {
    const ray = g.createLinearGradient(x0, y0, x1, y1);
    ray.addColorStop(0, 'rgb(0,0,0)');
    ray.addColorStop(0.5, 'rgb(170,170,170)');
    ray.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = ray;
    g.fillRect(r - w / 2, r - h / 2, w, h);
  }
  return new THREE.CanvasTexture(c);
}
export function createAtmos(scene) {
  const MAX = 700,
    BOX = 15,
    TOP = 9;
  const pos = new Float32Array(MAX * 3),
    seed = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * BOX;
    pos[i * 3 + 1] = Math.random() * TOP;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    seed[i] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const snow = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      alphaMap: softDot(32, 0.35),
      color: 0xffffff,
      size: 0.07,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  snow.frustumCulled = false;
  snow.renderOrder = 5;
  scene.add(snow);
  let count = 380,
    snowAmt = 0;
  const wind = new THREE.Vector2(0.6, 0.25);
  // Diamond dust (v3-look41, at night): ice crystals hanging in the air round her, drifting slowly. Each glows faintly
  // and now and then flashes as it turns to the light, on its own beat.
  const DMAX = 400,
    DBOX = 6,
    DTOP = 3.4,
    dPos = new Float32Array(DMAX * 3),
    dCol = new Float32Array(DMAX * 3),
    dSeed = new Float32Array(DMAX * 2);
  for (let i = 0; i < DMAX; i++) {
    dPos[i * 3] = (Math.random() * 2 - 1) * DBOX;
    dPos[i * 3 + 1] = 0.05 + Math.random() * DTOP;
    dPos[i * 3 + 2] = (Math.random() * 2 - 1) * DBOX;
    dSeed[i * 2] = Math.random() * 100;
    // how often it flashes: once every 2 to 7 seconds
    dSeed[i * 2 + 1] = 0.15 + Math.random() * 0.35;
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  const dMat = new THREE.PointsMaterial({
    alphaMap: starDot(64),
    vertexColors: true,
    size: 0.3,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dGeo, dMat);
  dust.frustumCulled = false;
  dust.renderOrder = 6;
  scene.add(dust);
  let dCount = 320,
    dustAmt = 0;
  return {
    quality(q) {
      count = q.snow;
      geo.setDrawRange(0, count);
      dCount = Math.min(DMAX, q.dust || 0);
      dGeo.setDrawRange(0, dCount);
    },
    look(l) {
      snowAmt = l.snow;
      dustAmt = l.dust || 0;
    },
    // cx, cz: where the camera looks; e: 0 close view .. 1 overview (weather fades out up high); dist: how far the
    // camera is from where it looks (the glints keep about the same size on screen, close up or not)
    update(dt, t, cx, cz, e, dist) {
      const near = 1 - e;
      dust.visible = dustAmt > 0 && near > 0.05 && dCount > 0;
      if (dust.visible) {
        dMat.size = 0.3 * Math.min(1, Math.max(0.35, (dist || 13) / 13));
        const amt = dustAmt * near;
        for (let i = 0; i < dCount; i++) {
          const k = i * 3,
            s = dSeed[i * 2];
          dPos[k] += (0.12 + Math.sin(t * 0.3 + s) * 0.08) * dt;
          dPos[k + 1] -= (0.04 + Math.sin(t * 0.5 + s * 1.7) * 0.03) * dt;
          dPos[k + 2] += (0.05 + Math.cos(t * 0.27 + s) * 0.08) * dt;
          if (dPos[k + 1] < 0.05) dPos[k + 1] += DTOP;
          const dx = dPos[k] - cx,
            dz = dPos[k + 2] - cz;
          if (dx > DBOX) dPos[k] -= 2 * DBOX;
          else if (dx < -DBOX) dPos[k] += 2 * DBOX;
          if (dz > DBOX) dPos[k + 2] -= 2 * DBOX;
          else if (dz < -DBOX) dPos[k + 2] += 2 * DBOX;
          // a faint glow, then a brief flash; fewer and dimmer toward the edges of the box
          const ph = (t * dSeed[i * 2 + 1] + s) % 1,
            tri = 1 - Math.abs(ph * 2 - 1),
            flash = Math.pow(tri, 18),
            edge = Math.max(0, 1 - Math.hypot(dx, dz) / DBOX),
            b = (0.06 + 1.6 * flash) * amt * Math.min(1, edge * 2.5);
          dCol[k] = 0.82 * b;
          dCol[k + 1] = 0.9 * b;
          dCol[k + 2] = b;
        }
        dGeo.attributes.position.needsUpdate = true;
        dGeo.attributes.color.needsUpdate = true;
      }
      snow.visible = snowAmt > 0 && near > 0.05;
      snow.material.opacity = 0.9 * snowAmt * near;
      if (snow.visible) {
        for (let i = 0; i < count; i++) {
          const k = i * 3,
            s = seed[i];
          pos[k] += (wind.x + Math.sin(t * 0.9 + s) * 0.35) * dt;
          pos[k + 1] -= (0.7 + (s % 1) * 0.5) * dt;
          pos[k + 2] += (wind.y + Math.cos(t * 0.7 + s) * 0.35) * dt;
          if (pos[k + 1] < 0) pos[k + 1] += TOP;
          // keep every flake inside the box around the camera: what drifts out one side comes back in the other
          let dx = pos[k] - cx;
          if (dx > BOX) pos[k] -= 2 * BOX;
          else if (dx < -BOX) pos[k] += 2 * BOX;
          let dz = pos[k + 2] - cz;
          if (dz > BOX) pos[k + 2] -= 2 * BOX;
          else if (dz < -BOX) pos[k + 2] += 2 * BOX;
        }
        geo.attributes.position.needsUpdate = true;
      }
    },
  };
}
