// Spin on the ice. The trick finger's circling drives it; the steering thumb picks the position (down = sit, up = camel).
import { CFG } from '../config.js';
import { TAU, clamp, wrap, dimin } from '../core/math.js';
export function createSpin(S, api, seed) {
  const pre = { vx: S.vx, vz: S.vz, dir: api.speed() > 0.5 ? Math.atan2(S.vx, S.vz) : S.facing };
  const st = { angle: 0, goal: seed, vel: (seed < 0 ? -1 : 1) * 10, imp: 0, idle: 0, held: true, rel: 0, pos: 'Upright', kinds: {} };
  return { id: 'spin', steer: 0, holdFacing: true, state: st,
    rotate(d) { st.imp += d; }, hold() { st.held = true; st.rel = 0; }, release() { st.held = false; },
    yaw: () => st.angle,
    update(dt, steer) {
      // she glides into the spin and settles; the steering thumb lets the spin travel slowly
      const m = Math.hypot(steer.x, steer.y); st.stick = m; if (m > 0.2) { const k = 1 - Math.exp(-2.5 * dt); S.vx += (steer.x * CFG.spin.travel - S.vx) * k; S.vz += (steer.y * CFG.spin.travel - S.vz) * k; } else { const f = Math.exp(-CFG.spin.decay * dt); S.vx *= f; S.vz *= f; }
      // the finger and her body are joined by a rubber band: she lags a little behind the finger, and carries on turning after it stops
      const K = CFG.spin;
      if (st.imp !== 0) { st.vel += (st.imp * K.gain / dt - st.vel) * K.pickup; st.goal += st.imp * K.gain; st.imp = 0; st.idle = 0; }
      else { st.idle += dt; if (st.idle > 0.07) { st.goal += st.vel * dt; st.vel *= Math.exp(-(st.held ? K.coast : K.easeOut) * dt); } }
      st.vel = clamp(st.vel, -32, 32); st.angle += (st.goal - st.angle) * (1 - Math.exp(-K.follow * dt));
      st.pos = steer.y > 0.5 ? 'Sit' : steer.y < -0.5 ? 'Camel' : 'Upright'; st.kinds[st.pos] = 1;
      api.emit('spinning', { position: st.pos, revs: Math.abs(st.angle) / TAU });
      if (!st.held) { st.rel += dt; if (Math.abs(st.vel) < CFG.spin.endVel || st.rel > CFG.spin.endMax) return false; }
      return true;
    },
    end() {
      const revs = Math.abs(st.angle) / TAU, kinds = Object.keys(st.kinds), preSp = Math.hypot(pre.vx, pre.vz);
      // an aborted spin gives her speed back; a finished one only sends her off if the thumb is steering, otherwise she stays where she spun
      const out = revs < 1 ? preSp : (st.stick || 0) > 0.2 ? Math.max(2.6, Math.min(preSp, 7) * 0.75) : Math.min(api.speed(), 0.6);
      // she leaves along the curve the blade was already drawing, so the line flows out of the last loop instead of kinking
      const yawWas = S.facing + st.angle, dir = revs < 0.5 ? pre.dir : yawWas + (S.back ? Math.PI : 0) + (st.vel < 0 ? -1 : 1) * Math.PI / 2;
      S.facing = dir; S.vx = Math.sin(dir) * out; S.vz = Math.cos(dir) * out; S.flipYaw = wrap(yawWas - dir);          // the body eases round to the new heading
      const P = CFG.points, mult = kinds.length > 1 ? P.spinCombination : (st.pos !== 'Upright' ? P.spinPosition : 1);
      api.emit('element', { kind: 'spin', name: kinds.length > 1 ? 'Combination spin' : st.pos + ' spin', detail: revs.toFixed(1) + ' revolutions' + (kinds.length > 1 ? ', ' + kinds.join(' + ').toLowerCase() : ''), base: dimin(P.spin[0] * mult, revs, P.spin[1]), counted: revs >= 1 });
    },
    blade(out, yaw) { const r = (st.pos === 'Sit' ? 0.2 : st.pos === 'Camel' ? 0.3 : 0.12) * (st.held ? 1 : 1 + Math.min(st.rel, 1.6) * 1.1); /* the loops open out as she exits */ out.x += Math.sin(yaw) * r; out.z += Math.cos(yaw) * r; },
    spinRate: () => Math.abs(st.vel),
    // Arms and free leg follow the speed, as on real ice: spread wide when the spin is slow, pulled in tight when it is fast.
    pose(T, kit) {
      const f = clamp((Math.abs(st.vel) - 3) / 11, 0, 1), o = 1 - f, mix = (slow, fast) => slow * o + fast * f;
      const arms = { aLz: mix(-1.4, 0.45), aRz: mix(1.4, -0.45), aLx: mix(0.15, -0.75), aRx: mix(0.15, -0.75), aLe: mix(-0.15, -2.0), aRe: mix(-0.15, -2.0) };
      if (st.pos === 'Sit') { kit.set({ lean: 0.75, bodyY: 0.41, fL: 0, lRx: -2.2, lRk: 2.35, lRz: 0, lLx: -2.25, lLk: 0, lLz: mix(-0.45, 0), aLx: -2.2, aRx: -2.2, aLz: mix(-1.1, -0.1), aRz: mix(1.1, 0.1), aLe: -0.1, aRe: -0.1 }); }
      else if (st.pos === 'Camel') { kit.set({ lean: 1.45, bodyY: kit.HIP, fL: 0, lRx: -1.45, lRk: 0.05, lRz: 0, lLx: 0.1, lLk: 0, lLz: 0, aLz: mix(-1.4, -0.2), aRz: mix(1.4, 0.2), aLx: mix(0.15, 1.3), aRx: mix(0.15, 1.3), aLe: -0.15, aRe: -0.15 }); }
      else { kit.set(arms); kit.set({ lean: 0, bodyY: kit.HIP, fL: 0, lRx: 0, lRk: 0.05, lRz: 0, lLx: mix(0, -0.55), lLk: mix(0.1, 1.1), lLz: mix(-0.85, 0.15) }); }
      return 9;
    } };
}
