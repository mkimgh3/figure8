// Spin on the ice. The trick finger's circling drives it, and the way it circles picks the position:
//   counter-clockwise: slow is a camel, fast drops into a sit        clockwise: slow is a layback, fast pulls up into a scratch spin
// Each pair goes from an open, extended shape to a tight, quick one, as real spins do. The steering thumb lets the spin travel.
import { CFG } from '../config.js';
import { TAU, clamp, wrap, dimin } from '../core/math.js';
export function createSpin(S, api, seed) {
  const pre = { vx: S.vx, vz: S.vz, dir: api.speed() > 0.5 ? Math.atan2(S.vx, S.vz) : S.facing };
  const st = { angle: 0, goal: seed, vel: (seed < 0 ? -1 : 1) * 10, imp: 0, idle: 0, held: true, rel: 0, pos: seed < 0 ? 'Layback' : 'Camel', fv: 0, acc: 0, w0: 0, total: Math.abs(seed), fast: false, kinds: {} };
  return { id: 'spin', steer: 0, holdFacing: true, state: st,
    rotate(d) { if (!st.dropped) st.imp += d; }, hold() { if (!st.dropped) { st.held = true; st.rel = 0; } }, release() { st.held = false; },
    drop() { st.held = false; st.dropped = true; },          // the left thumb has lifted: she lets the spin wind down, whatever the finger does
    yaw: () => st.angle,
    update(dt, steer) {
      // she glides into the spin and settles; the steering thumb lets the spin travel slowly
      const m = Math.hypot(steer.x, steer.y); st.stick = m; if (m > 0.2) { const k = 1 - Math.exp(-2.5 * dt); S.vx += (steer.x * CFG.spin.travel - S.vx) * k; S.vz += (steer.y * CFG.spin.travel - S.vz) * k; } else { const f = Math.exp(-CFG.spin.decay * dt); S.vx *= f; S.vz *= f; }
      // the finger and her body are joined by a rubber band: she lags a little behind the finger, and carries on turning after it stops
      const K = CFG.spin, gain = K.gain * (st.pos === 'Camel' ? K.camel : st.pos === 'Sit' ? K.sit : st.pos === 'Layback' ? K.layback : 1);
      // how fast the finger itself is circling (rad/s), smoothed; with a gap between the two thresholds so the position does not flicker
      // how fast the finger is circling: what it turned in each quarter second, by the clock on the wall, so a slow frame never reads as a fast finger
      const now = performance.now(); if (!st.w0) st.w0 = now; st.acc += Math.abs(st.imp);
      if (now - st.w0 >= 250) { st.fv += (st.acc / ((now - st.w0) / 1000) - st.fv) * 0.6; st.acc = 0; st.w0 = now; }
      if (st.held && st.idle < 0.3) { st.fast = st.fast ? st.fv > K.slowBelow : st.fv > K.fastAbove; st.pos = st.vel >= 0 ? (st.fast ? 'Sit' : 'Camel') : (st.fast ? 'Scratch' : 'Layback'); }
      if (st.imp !== 0) { st.vel += (st.imp * gain / dt - st.vel) * K.pickup; st.goal += st.imp * gain; st.imp = 0; st.idle = 0; }
      else { st.idle += dt; if (st.idle > 0.07) { st.goal += st.vel * dt; st.vel *= Math.exp(-(st.held ? K.coast : K.easeOut) * dt); } }
      st.vel = clamp(st.vel, -32, 32); const da = (st.goal - st.angle) * (1 - Math.exp(-K.follow * dt)); st.angle += da; st.total += Math.abs(da);          // total: all she has turned, either way
      st.kinds[st.pos] = 1;
      api.emit('spinning', { position: st.pos, revs: st.total / TAU });
      if (!st.held) { st.rel += dt; if (Math.abs(st.vel) < CFG.spin.endVel || st.rel > CFG.spin.endMax) return false; }
      return true;
    },
    end() {
      const revs = st.total / TAU, kinds = Object.keys(st.kinds), preSp = Math.hypot(pre.vx, pre.vz);
      // an aborted spin gives her speed back; a finished one only sends her off if the thumb is steering, otherwise she stays where she spun
      const full = revs < 1 ? preSp : CFG.steer.maxSpeed * CFG.spin.exitSpeed, out = revs < 1 ? full : Math.max(api.speed(), full * 0.3);
      S.surge = full - out; S.flipK = 2.6;          // she swoops out: the rest of her exit speed builds over the next moment, and her body comes round slowly
      // she leaves along the curve the blade was already drawing, so the line flows out of the last loop instead of kinking
      const yawWas = S.facing + st.angle, dir = revs < 0.5 ? pre.dir : yawWas + (S.back ? Math.PI : 0) + (st.vel < 0 ? -1 : 1) * Math.PI / 2;
      S.facing = dir; S.vx = Math.sin(dir) * out; S.vz = Math.cos(dir) * out; S.flipYaw = wrap(yawWas - dir);          // the body eases round to the new heading
      const P = CFG.points, mult = kinds.length > 1 ? P.spinCombination : (st.pos !== 'Scratch' ? P.spinPosition : 1);
      api.emit('element', { kind: 'spin', name: kinds.length > 1 ? 'Combination spin' : st.pos + ' spin', detail: revs.toFixed(1) + ' revolutions' + (kinds.length > 1 ? ', ' + kinds.join(' + ').toLowerCase() : ''), base: dimin(P.spin[0] * mult, revs, P.spin[1]), counted: revs >= 1 });
    },
    blade(out, yaw) { const r = (st.pos === 'Sit' ? 0.2 : st.pos === 'Camel' ? 0.3 : st.pos === 'Layback' ? 0.16 : 0.12) * (st.held ? 1 : 1 + Math.min(st.rel, 1.6) * 1.1); /* the loops open out as she exits */ out.x += Math.sin(yaw) * r; out.z += Math.cos(yaw) * r; },
    spinRate: () => Math.abs(st.vel),
    // Arms and free leg follow the speed, as on real ice: spread wide when the spin is slow, pulled in tight when it is fast.
    pose(T, kit) {
      const f = clamp((Math.abs(st.vel) - 3) / 11, 0, 1), o = 1 - f, mix = (slow, fast) => slow * o + fast * f;
      const arms = { aLz: mix(-1.4, 0.45), aRz: mix(1.4, -0.45), aLx: mix(0.15, -0.75), aRx: mix(0.15, -0.75), aLe: mix(-0.15, -2.0), aRe: mix(-0.15, -2.0) };
      if (st.pos === 'Sit') { kit.set({ lean: 0.75, bodyY: 0.41, fL: 0, lRx: -2.2, lRk: 2.35, lRz: 0, lLx: -2.25, lLk: 0, lLz: mix(-0.45, 0), aLx: -2.2, aRx: -2.2, aLz: mix(-1.1, -0.1), aRz: mix(1.1, 0.1), aLe: -0.1, aRe: -0.1 }); }
      else if (st.pos === 'Camel') { kit.set({ lean: 1.45, bodyY: kit.HIP, fL: 0, lRx: -1.45, lRk: 0.05, lRz: 0, lLx: 0.1, lLk: 0, lLz: 0, aLz: mix(-1.4, -0.2), aRz: mix(1.4, 0.2), aLx: mix(0.15, 1.3), aRx: mix(0.15, 1.3), aLe: -0.15, aRe: -0.15 }); }
      else if (st.pos === 'Layback') { kit.set({ lean: -0.42, bodyY: kit.HIP - 0.02, fL: 0, lRx: 0.12, lRk: 0.12, lRz: 0, lLx: 0.5, lLk: 1.15, lLz: -0.2, aLz: mix(-2.0, -2.45), aRz: mix(2.0, 2.45), aLx: -0.35, aRx: -0.35, aLe: mix(-0.35, -0.75), aRe: mix(-0.35, -0.75) }); }
      else { kit.set(arms); kit.set({ lean: 0, bodyY: kit.HIP, fL: 0, lRx: 0, lRk: 0.05, lRz: 0, lLx: mix(0, -0.55), lLk: mix(0.1, 1.1), lLz: mix(-0.85, 0.15) }); }
      return st.held ? 9 : 4.5;          // winding down, she rises and opens out slowly
    } };
}
