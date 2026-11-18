// A light ring around the skater during a jump: it fills as she turns, with small marks at the half and whole turn.
import * as THREE from './three.js';
import { TAU } from '../core/math.js';
const COLORS = { ok: 0x7df0c4, shaky: 0xffdf8a, fall: 0xff9db0 };

export function createRing(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const flat = (geo, color, opacity) => {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    group.add(m);
    return m;
  };
  flat(new THREE.RingGeometry(1.06, 1.085, 72), 0xffffff, 0.55); // hairline guide
  // the filling arc: one whole ring built once, of which only the first part is drawn (drawRange), turned to where it
  // starts (until v3-look44 a new ring was built every frame in the air)
  const SEGS = 240,
    arc = flat(new THREE.RingGeometry(1.03, 1.115, SEGS, 1, 0, TAU), COLORS.ok, 0.95);
  const whole = flat(new THREE.CircleGeometry(0.075, 20), 0xffffff, 1),
    half = flat(new THREE.CircleGeometry(0.05, 16), 0xffffff, 0.9);
  let t0 = 0;
  return {
    start(yaw) {
      t0 = yaw - Math.PI / 2;
      whole.position.set(Math.cos(t0) * 1.073, 0, -Math.sin(t0) * 1.073);
      half.position.set(-Math.cos(t0) * 1.073, 0, Math.sin(t0) * 1.073);
    },
    update(game, scale) {
      const S = game.S;
      group.visible = !S.grounded;
      if (S.grounded) return;
      const turns = Math.abs(S.spin) / TAU,
        len = Math.max(0.01, (turns - Math.floor(turns)) * TAU),
        gr = game.liveGrade();
      arc.geometry.setDrawRange(0, 6 * Math.max(1, Math.round((len / TAU) * SEGS)));
      arc.rotation.z = S.spin >= 0 ? t0 : t0 - len;
      arc.material.color.setHex(!gr ? COLORS.fall : gr === 'shaky' ? COLORS.shaky : COLORS.ok); // mint: lands clean now, gold: shaky, rose: would fall
      group.position.set(S.x, S.y + 0.9, S.z);
      group.scale.set(scale, 1, scale);
    },
  };
}
