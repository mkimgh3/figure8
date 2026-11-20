// Ribbons of cloth simulated in the world (v3-look71): Seolhwa's sleeves, which fly out long as she spins and draw
// back to her hands as the spin dies, the ties of her jacket and the ribbon in her hair.
//
// Each is a chain of points held at one end, with gravity, air drag and a flutter that grows with its speed through
// the air, kept out of her body (round shapes) and off the ice, and drawn as a band of cloth laid across the chain.
// Bjorn's scarf (bear.js) is the same idea; here the length can change from frame to frame.
import * as THREE from './three.js';
import { iceAbove } from '../core/terrain.js';

const ICEN = [0, 1, 0];
const _d = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _h = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _c = new THREE.Vector3();

// A picture for a ribbon or a sleeve, its held end at the top: a base colour with a fine weave, and bands across it.
// bands: [[from, to, colour], ...] as shares of its length
export function clothTexture(base, bands) {
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 32, 256);
  for (const [a, b, colour] of bands || []) {
    g.fillStyle = colour;
    g.fillRect(0, Math.round(a * 256), 32, Math.max(1, Math.round((b - a) * 256)));
  }
  g.fillStyle = 'rgba(0,0,0,0.035)';
  for (let y = 0; y < 256; y += 2) g.fillRect(0, y, 32, 1);
  const t = new THREE.CanvasTexture(cv);
  // the picture's top is v = 0, the held end
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// o: { n (points along it), width: [at the held end, at the free end] (metres), material,
//      keep (the share of its speed it keeps every 12 ms: air drag), drag (more drag the faster it moves, per metre:
//      in a spin this is what sweeps a long ribbon back into a curve; its sweep at r metres out is about atan(drag * r),
//      whatever the spin's speed), flutter, gravity (1 = real),
//      flat (0..1: how far it turns its face to the sky where it runs level, so it shows from above),
//      twist (radians it twists to and fro along its length as it flies) }
export function createRibbon(o) {
  const n = o.n,
    p = new Float32Array(n * 3),
    q = new Float32Array(n * 3),
    vp = new Float32Array(n * 9),
    uv = new Float32Array(n * 6),
    ix = [],
    keep = o.keep ?? 0.986,
    drag = o.drag ?? 0,
    flutter = o.flutter ?? 1,
    grav = 9.8 * (o.gravity ?? 1),
    flat = o.flat ?? 0,
    twist = o.twist ?? 0,
    prev = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // three across each point (an edge, the middle, the other edge), so the cloth can curl
    const v = i / (n - 1);
    uv.set([0, v, 0.5, v, 1, v], i * 6);
    if (i < n - 1)
      for (let c = 0; c < 2; c++) {
        const a = i * 3 + c;
        ix.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(vp, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(ix);
  const mesh = new THREE.Mesh(g, o.material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.renderOrder = 2;
  // its image in the ice: the same cloth, drawn through the mirror's matrix
  const ghost = o.material.clone();
  ghost.transparent = true;
  ghost.opacity = 0.26;
  ghost.depthWrite = true;
  const mirror = new THREE.Mesh(g, ghost);
  mirror.matrixAutoUpdate = false;
  mirror.matrixWorldAutoUpdate = false;
  mirror.frustumCulled = false;
  mirror.renderOrder = -1;
  let ready = false,
    time = Math.random() * 10;
  return {
    mesh,
    mirror,
    points: p,
    n,
    // start again from where it is held (after she has been moved, or shown again)
    reset() {
      ready = false;
    },
    // root: where it is held; dir: the way it leaves there; lay: across its width there (unit vectors, in the world);
    // len: its length now (metres); balls: [{ w: Vector3 (in the world), r }] it cannot enter
    step(dt, root, dir, lay, len, balls) {
      const seg = len / (n - 1);
      if (!ready) {
        for (let i = 0; i < n; i++) {
          const k = i * 3,
            a = Math.min(i, 1) * seg,
            b = Math.max(0, i - 1) * seg;
          p[k] = q[k] = root.x + dir.x * a;
          p[k + 1] = q[k + 1] = root.y + dir.y * a - b;
          p[k + 2] = q[k + 2] = root.z + dir.z * a;
        }
        prev.copy(root);
        ready = true;
      }
      // she moved far in one frame (a new place): bring it along instead of dragging it there
      if (prev.distanceToSquared(root) > 9) {
        _c.subVectors(root, prev);
        for (let i = 0; i < n * 3; i += 3) {
          p[i] += _c.x;
          p[i + 1] += _c.y;
          p[i + 2] += _c.z;
          q[i] += _c.x;
          q[i + 1] += _c.y;
          q[i + 2] += _c.z;
        }
        prev.copy(root);
      }
      const steps = Math.max(1, Math.min(6, Math.ceil(dt / 0.012))),
        h = dt / steps;
      for (let st = 0; st < steps; st++) {
        time += h;
        // the held end moves evenly from where it was to where it is, so a fast spin does not jerk the cloth
        _c.lerpVectors(prev, root, (st + 1) / steps);
        p[0] = _c.x;
        p[1] = _c.y;
        p[2] = _c.z;
        p[3] = _c.x + dir.x * seg;
        p[4] = _c.y + dir.y * seg;
        p[5] = _c.z + dir.z * seg;
        for (let i = 2; i < n; i++) {
          const k = i * 3,
            sp = Math.hypot(p[k] - q[k], p[k + 1] - q[k + 1], p[k + 2] - q[k + 2]) / h,
            kp = keep / (1 + drag * sp * h),
            vx = (p[k] - q[k]) * kp,
            vy = (p[k + 1] - q[k + 1]) * kp,
            vz = (p[k + 2] - q[k + 2]) * kp,
            // a flutter, stronger the faster the cloth moves through the air and further out along it
            fl = Math.min(7, sp) * 1.3 * (i / n) * flutter;
          q[k] = p[k];
          q[k + 1] = p[k + 1];
          q[k + 2] = p[k + 2];
          p[k] += vx + fl * Math.sin(time * 13 + i * 0.9) * h * h * 9;
          p[k + 1] += vy - grav * h * h + fl * Math.sin(time * 11 + i * 1.3 + 2) * h * h * 6;
          p[k + 2] += vz + fl * Math.cos(time * 12 + i * 0.7) * h * h * 9;
        }
        for (let it = 0; it < 4; it++) {
          for (let i = 2; i < n; i++) {
            const a = (i - 1) * 3,
              b = i * 3,
              dx = p[b] - p[a],
              dy = p[b + 1] - p[a + 1],
              dz = p[b + 2] - p[a + 2],
              l = Math.hypot(dx, dy, dz) || 1e-6,
              c = (l - seg) / l;
            if (i === 2) {
              p[b] -= dx * c;
              p[b + 1] -= dy * c;
              p[b + 2] -= dz * c;
            } else {
              p[a] += dx * c * 0.5;
              p[a + 1] += dy * c * 0.5;
              p[a + 2] += dz * c * 0.5;
              p[b] -= dx * c * 0.5;
              p[b + 1] -= dy * c * 0.5;
              p[b + 2] -= dz * c * 0.5;
            }
          }
          // out of her body, and never through the ice
          for (let i = 2; i < n; i++) {
            const k = i * 3;
            if (balls)
              for (const B of balls) {
                const dx = p[k] - B.w.x,
                  dy = p[k + 1] - B.w.y,
                  dz = p[k + 2] - B.w.z,
                  l = Math.hypot(dx, dy, dz);
                if (l < B.r && l > 1e-6) {
                  p[k] = B.w.x + (dx / l) * B.r;
                  p[k + 1] = B.w.y + (dy / l) * B.r;
                  p[k + 2] = B.w.z + (dz / l) * B.r;
                }
              }
            const dd = iceAbove(p[k], p[k + 1], p[k + 2], ICEN) - 0.015;
            if (dd < 0) {
              p[k] -= ICEN[0] * dd;
              p[k + 1] -= ICEN[1] * dd;
              p[k + 2] -= ICEN[2] * dd;
            }
          }
        }
        // cloth does not stretch: whatever the pull, no link is left much longer than it should be
        for (let i = 2; i < n; i++) {
          const a = (i - 1) * 3,
            b = i * 3,
            dx = p[b] - p[a],
            dy = p[b + 1] - p[a + 1],
            dz = p[b + 2] - p[a + 2],
            l = Math.hypot(dx, dy, dz);
          if (l > seg * 1.12) {
            const c = (seg * 1.12) / l;
            p[b] = p[a] + dx * c;
            p[b + 1] = p[a + 1] + dy * c;
            p[b + 2] = p[a + 2] + dz * c;
          }
        }
      }
      prev.copy(root);
      // the band of cloth: flat across the chain, its edges carried along it from the held end
      _s.copy(lay);
      const sp0 = Math.min(
        1,
        Math.hypot(p[n * 3 - 3] - q[n * 3 - 3], p[n * 3 - 2] - q[n * 3 - 2], p[n * 3 - 1] - q[n * 3 - 1]) / h / 4,
      );
      for (let i = 0; i < n; i++) {
        const k = i * 3,
          j = Math.min(n - 1, i + 1),
          b = j === i ? i - 1 : i,
          t = i / (n - 1);
        _d.set(p[j * 3] - p[b * 3], p[j * 3 + 1] - p[b * 3 + 1], p[j * 3 + 2] - p[b * 3 + 2]);
        if (_d.lengthSq() < 1e-12) _d.copy(dir);
        _d.normalize();
        _s.addScaledVector(_d, -_s.dot(_d));
        if (_s.lengthSq() < 1e-6) _s.set(1, 0, 0).addScaledVector(_d, -_d.x);
        _s.normalize();
        if (flat) {
          // where it runs level, its face turns to the sky
          _h.set(_d.z, 0, -_d.x);
          const hl = _h.length();
          if (hl > 0.25) {
            if (_h.dot(_s) < 0) _h.negate();
            _s.lerp(_h.multiplyScalar(1 / hl), flat * Math.min(1, (hl - 0.25) / 0.5) * Math.min(1, i / 3)).normalize();
          }
        }
        // across the cloth here: the carried edge, twisted a little to and fro as it flies
        _c.copy(_s);
        if (twist) {
          const a = twist * sp0 * Math.sin(time * 3.3 - i * 0.5) * Math.min(1, i / 4);
          _n.crossVectors(_d, _s);
          _c.multiplyScalar(Math.cos(a)).addScaledVector(_n, Math.sin(a));
        }
        const hw = (o.width[0] + (o.width[1] - o.width[0]) * t) * 0.5;
        // it curls a little across its width (the middle stands off the edges), so it never shows as a line
        _n.crossVectors(_c, _d).multiplyScalar(hw * 0.3);
        vp[i * 9] = p[k] - _c.x * hw;
        vp[i * 9 + 1] = p[k + 1] - _c.y * hw;
        vp[i * 9 + 2] = p[k + 2] - _c.z * hw;
        vp[i * 9 + 3] = p[k] + _n.x;
        vp[i * 9 + 4] = p[k + 1] + _n.y;
        vp[i * 9 + 5] = p[k + 2] + _n.z;
        vp[i * 9 + 6] = p[k] + _c.x * hw;
        vp[i * 9 + 7] = p[k + 1] + _c.y * hw;
        vp[i * 9 + 8] = p[k + 2] + _c.z * hw;
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    },
  };
}
