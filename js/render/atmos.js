// Weather near the skater: falling snow (no mist: layers of it over the ice read as fog over everything). Both live in a box that follows the camera,
// so there is always some around her and none is wasted far away.
import * as THREE from './three.js';

// Soft shapes are drawn grey on an opaque black canvas and used as alpha maps. A canvas with nearly transparent
// pixels keeps almost nothing of their colour (it stores colour pre-multiplied by alpha), and on some phones that
// comes back as speckles of random colour: a fog of confetti.
export function softDot(size, inner) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(inner, 'rgb(153,153,153)'); gr.addColorStop(1, 'rgb(0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
export function createAtmos(scene) {
  const MAX = 700, BOX = 15, TOP = 9;
  const pos = new Float32Array(MAX * 3), seed = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) { pos[i * 3] = (Math.random() * 2 - 1) * BOX; pos[i * 3 + 1] = Math.random() * TOP; pos[i * 3 + 2] = (Math.random() * 2 - 1) * BOX; seed[i] = Math.random() * 6.28; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const snow = new THREE.Points(geo, new THREE.PointsMaterial({ alphaMap: softDot(32, 0.35), color: 0xffffff, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
  snow.frustumCulled = false; snow.renderOrder = 5; scene.add(snow);
  let count = 380, snowAmt = 0;
  const wind = new THREE.Vector2(0.6, 0.25);
  return {
    quality(q) { count = q.snow; geo.setDrawRange(0, count); },
    look(l) { snowAmt = l.snow; },
    // cx, cz: where the camera looks; e: 0 close view .. 1 overview (weather fades out up high)
    update(dt, t, cx, cz, e) {
      const near = 1 - e; snow.visible = snowAmt > 0 && near > 0.05; snow.material.opacity = 0.9 * snowAmt * near;
      if (snow.visible) { for (let i = 0; i < count; i++) { const k = i * 3, s = seed[i];
          pos[k] += (wind.x + Math.sin(t * 0.9 + s) * 0.35) * dt; pos[k + 1] -= (0.7 + (s % 1) * 0.5) * dt; pos[k + 2] += (wind.y + Math.cos(t * 0.7 + s) * 0.35) * dt;
          if (pos[k + 1] < 0) pos[k + 1] += TOP;
          // keep every flake inside the box around the camera: what drifts out one side comes back in the other
          let dx = pos[k] - cx; if (dx > BOX) pos[k] -= 2 * BOX; else if (dx < -BOX) pos[k] += 2 * BOX;
          let dz = pos[k + 2] - cz; if (dz > BOX) pos[k + 2] -= 2 * BOX; else if (dz < -BOX) pos[k + 2] += 2 * BOX; }
        geo.attributes.position.needsUpdate = true; }
    } };
}
