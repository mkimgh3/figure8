// Moves that last as long as the finger (or both thumbs) stays down: spiral, spread eagle, hydroblade.
import { CFG } from '../config.js';
import { dimin } from '../core/math.js';
const P = CFG.points;

function held(S, api, o) {
  const st = { t: 0, held: true };
  return Object.assign({ id: o.id, steer: o.steer, state: st, leanIntoTurn: o.leanIntoTurn,
    start() { api.ensureSpeed(o.minSpeed + 0.5); api.emit('say', { big: o.name, small: '', hold: 0.7 }); },
    release() { st.held = false; },
    update(dt, steer) { st.t += dt; api.ensureSpeed(o.minSpeed); if (o.tick) o.tick(dt, steer); return !((!st.held && st.t >= o.minTime) || st.t > 12); },
    end() { api.emit('element', { kind: o.id, name: o.name, detail: st.t.toFixed(1) + ' seconds held', base: dimin(P[o.id][0], st.t, P[o.id][1]) }); },
  }, o.extra(st));
}
export const createSpiral = (S, api) => held(S, api, { id: 'spiral', name: 'Spiral', steer: 0.8, minSpeed: 3.5, minTime: 1.0,
  extra: () => ({ blade(out) { out.width = 2.6; },
    pose(T, kit) { kit.set(kit.WIDE); kit.set({ lean: 1.2, bodyY: kit.HIP, fL: 0, lRx: -1.2, lRk: 0.05, lRz: 0, lLx: 0.55, lLk: 0, lLz: 0, aLx: 0.35, aRx: 0.35 }); } }) });
// dir: 1 curves to her right (screen-clockwise), -1 to her left
export const createEagle = (S, api, dir) => held(S, api, { id: 'eagle', name: 'Spread eagle', steer: 0.9, minSpeed: 3.5, minTime: 1.0, leanIntoTurn: true,
  tick(dt, steer) { if (Math.hypot(steer.x, steer.y) < 0.15) api.rotateVel(-dir * 0.45 * dt); },          // curves on its own only when the thumb is not steering
  extra: () => ({ blade(out) { out.double = true; },                                                              // two blades, two tracks
    pose(T, kit) { kit.set(kit.WIDE); kit.set({ side: dir, lean: -0.12, bodyY: 0.83, lLx: 0.12, lRx: 0.12, lLk: 0.08, lRk: 0.08, lLz: -0.5, lRz: 0.5 }); } }) });
export const createHydro = (S, api, dir) => held(S, api, { id: 'hydro', name: 'Hydroblade', steer: 0.65, minSpeed: 3, minTime: 1.2,
  tick(dt, steer) { if (Math.hypot(steer.x, steer.y) < 0.15) api.rotateVel(-dir * 1.5 * dt); const f = Math.exp(-0.12 * dt); S.vx *= f; S.vz *= f; },
  extra: () => ({ blade(out) { out.width = 2; },
    pose(T, kit) { kit.set({ roll: 0.8 * dir, lean: 0.35, bodyY: 0.47, fL: 0, lRx: -1.65, lRk: 2.2, lRz: 0, lLx: 0.75, lLk: 0.05, lLz: -0.35 * dir, aLz: -1.3, aRz: 1.3, aLx: -0.3, aRx: -0.3, aLe: -0.1, aRe: -0.1 }); } }) });
