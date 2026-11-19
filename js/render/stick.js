// Rook's hockey stick. It is not tied to one bone: every frame it is placed from where his two hands are, so it works in
// every pose the game has without new animation.
//   Hands close together: held in both, the shaft running from the top hand through the bottom one (skating, the
//   scratch spin, the overhead spin with both arms up, where it turns over his head like a rotor).
//   Hands apart: held in the bottom hand near the butt end and pointed the way that forearm points, swung forward
//   (held out to the side or in front in the open poses, raised high when the arm is up).
// The blade never goes below the ice: if the shaft would reach down through it, it is tilted up until the blade rests
// on the surface, so in the hockey stance the blade slides along the ice in front of him.
import * as THREE from './three.js';
import { clamp } from '../core/math.js';
import { iceY } from '../core/terrain.js';

const SHAFT = 1.42,
  LIE = 0.8, // the angle between shaft and blade (radians off straight): about 135 degrees, as on a real stick
  ICE = 0.035;
const UP = new THREE.Vector3(0, 1, 0);

export function createStick(scene) {
  const g = new THREE.Group();
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.42, metalness: 0.1 }),
    tape = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.9 }),
    accent = new THREE.MeshStandardMaterial({ color: 0x7fd1ff, roughness: 0.5 });
  const box = (w, h, l, m, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m);
    b.position.z = z;
    b.castShadow = true;
    g.add(b);
    return b;
  };
  // the shaft runs along +z from the butt end; tape on the knob, an ice-blue band, and the blade at the far end
  box(0.03, 0.022, SHAFT, carbon, SHAFT / 2);
  box(0.034, 0.026, 0.12, tape, 0.06);
  box(0.032, 0.024, 0.05, accent, 0.4);
  const blade = new THREE.Group();
  blade.position.z = SHAFT;
  blade.rotation.x = -LIE;
  g.add(blade);
  {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.075, 0.3), tape);
    b.position.set(0, 0.0, 0.14);
    b.castShadow = true;
    blade.add(b);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.08, 0.06), carbon);
    heel.position.set(0, 0, 0.01);
    blade.add(heel);
  }
  g.visible = false;
  scene.add(g);

  const D = new THREE.Vector3(),
    D1 = new THREE.Vector3(),
    D2 = new THREE.Vector3(),
    B = new THREE.Vector3(),
    B1 = new THREE.Vector3(),
    B2 = new THREE.Vector3(),
    N = new THREE.Vector3(),
    X = new THREE.Vector3(),
    M = new THREE.Matrix4(),
    fwd = new THREE.Vector3();
  let k2 = 1;
  return {
    group: g,
    set visible(v) {
      g.visible = v;
    },
    // bottom, top: the two hands (world); elbow: the bottom hand's elbow (world); yaw: which way he faces
    update(dt, bottom, top, elbow, yaw) {
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      // one hand: along the forearm, swung forward and a little down
      D1.copy(bottom).sub(elbow).normalize().addScaledVector(fwd, 0.9);
      D1.y -= 0.15;
      D1.normalize();
      B1.copy(bottom).addScaledVector(D1, -0.12);
      // two hands: from the top hand through the bottom one
      D2.copy(bottom).sub(top);
      const gap = D2.length();
      D2.multiplyScalar(1 / Math.max(gap, 1e-4));
      B2.copy(top).addScaledVector(D2, -0.1);
      // how much the hands hold it together, eased so the stick does not jump between grips
      const want = clamp((0.78 - gap) / 0.25, 0, 1);
      k2 += (want - k2) * (1 - Math.exp(-10 * dt));
      D.copy(D1).lerp(D2, k2).normalize();
      B.copy(B1).lerp(B2, k2);
      // keep the blade on or above the ice (on rolling ice, the ice where the blade is)
      const tipY = B.y + D.y * SHAFT,
        floor = iceY(B.x + D.x * SHAFT, B.z + D.z * SHAFT) + ICE;
      if (tipY < floor) {
        const h = Math.hypot(D.x, D.z) || 1,
          dy = clamp((floor - B.y) / SHAFT, -0.99, 0.99),
          s = Math.sqrt(1 - dy * dy) / h;
        D.set(D.x * s, dy, D.z * s);
      }
      // a frame for the stick: z along the shaft, y as near to up as the shaft allows (the blade bends that way)
      N.copy(UP).addScaledVector(D, -UP.dot(D));
      if (N.lengthSq() < 1e-6) N.copy(fwd);
      N.normalize();
      X.crossVectors(N, D);
      M.makeBasis(X, N, D);
      g.quaternion.setFromRotationMatrix(M);
      g.position.copy(B);
    },
  };
}
