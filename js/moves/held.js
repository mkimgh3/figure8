// Moves that last as long as the finger (or both thumbs) stays down: spiral, spread eagle, hydroblade, swing rolls.
import { CFG } from '../config.js';
import { clamp, evenness, dimin } from '../core/math.js';
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
export const createSpiral = (S, api) => held(S, api, { id: 'spiral', name: 'Spiral', steer: 0.5, minSpeed: 3.5, minTime: 1.0,
  extra: () => ({ blade(out) { out.width = 2.6; },
    pose(T, kit) { kit.set(kit.WIDE); kit.set({ lean: 1.2, bodyY: kit.HIP, fL: 0, lRx: -1.2, lRk: 0.05, lRz: 0, lLx: 0.55, lLk: 0, lLz: 0, aLx: 0.35, aRx: 0.35 }); } }) });
// dir: 1 curves to her right (screen-clockwise), -1 to her left
export const createEagle = (S, api, dir) => held(S, api, { id: 'eagle', name: 'Spread eagle', steer: 0.9, minSpeed: 3.5, minTime: 1.0, leanIntoTurn: true,
  tick(dt, steer) { if (Math.hypot(steer.x, steer.y) < 0.15) api.rotateVel(-dir * 0.45 * dt); },          // curves on its own only when the thumb is not steering
  extra: () => ({ blade(out) { out.double = true; },                                                              // two blades, two tracks
    pose(T, kit) { kit.set(kit.WIDE); kit.set({ side: dir, lean: -0.12, bodyY: 0.83, lLx: 0.12, lRx: 0.12, lLk: 0.08, lRk: 0.08, lLz: -0.5, lRz: 0.5 }); } }) });
export const createHydro = (S, api, dir) => held(S, api, { id: 'hydro', name: 'Hydroblade', steer: 0.4, minSpeed: 3, minTime: 1.2,
  tick(dt, steer) { if (Math.hypot(steer.x, steer.y) < 0.15) api.rotateVel(-dir * 1.5 * dt); const f = Math.exp(-0.12 * dt); S.vx *= f; S.vz *= f; },
  extra: () => ({ blade(out) { out.width = 2; },
    pose(T, kit) { kit.set({ roll: 0.8 * dir, lean: 0.35, bodyY: 0.47, fL: 0, lRx: -1.65, lRk: 2.2, lRz: 0, lLx: 0.75, lLk: 0.05, lLz: -0.35 * dir, aLz: -1.3, aRz: 1.3, aLx: -0.3, aRx: -0.3, aLe: -0.1, aRe: -0.1 }); } }) });
// Swing rolls: deep alternating lobes with the arms banking, the basic ice-dance edge pattern.
// The scribble shapes them: longer strokes make wider lobes, quicker strokes make them come faster. Lasts while the scribble keeps going.
export function createSwing(S, api) {
  const st = { t: 0, ph: 0, amp: 0.9, w: 3.2, tAmp: 0.9, tW: 3.2, beatT: 0.9, stab: 0.5, per: [], amps: [] };
  return { id: 'swing', steer: 1, state: st,
    start() { api.ensureSpeed(4); api.emit('say', { big: 'Swing rolls', small: '', hold: 0.7 }); },
    beat(g) { st.beatT = 0.9; if (g && g.ampPx > 0) { if (g.periodMs > 40) { st.per.push(g.periodMs); st.amps.push(g.ampPx); if (st.per.length > 5) { st.per.shift(); st.amps.shift(); } st.stab = Math.min(evenness(st.per), evenness(st.amps)); } st.tAmp = clamp(g.ampPx / 110, 0.3, 2.4); if (g.periodMs > 60) st.tW = clamp(Math.PI / (g.periodMs / 1000), 1.5, 9); } }, release() {},
    update(dt) { st.t += dt; st.beatT -= dt; api.ensureSpeed(3.8); const k = 1 - Math.exp(-5 * dt); st.amp += (st.tAmp - st.amp) * k; st.w += (st.tW - st.w) * k; st.ph += st.w * dt; return !(st.beatT <= 0 && st.t >= 1.6); },
    end() { api.emit('element', { kind: 'swing', name: 'Swing rolls', detail: Math.max(1, Math.round(st.ph / Math.PI)) + ' lobes', base: dimin(P.swing[0], st.t, P.swing[1]), quality: +(CFG.steps.qualityMin + (CFG.steps.qualityMax - CFG.steps.qualityMin) * st.stab).toFixed(2), qLabel: st.stab > 0.75 ? 'steady rhythm' : st.stab > 0.4 ? 'fair rhythm' : 'uneven rhythm' }); },
    blade(out) { const z = st.amp * Math.sin(st.ph); out.x += Math.cos(S.facing) * z; out.z -= Math.sin(S.facing) * z; out.width = 1.4; },
    pose(T, kit) { const w = Math.sin(st.ph), d = Math.min(1.3, st.amp); kit.set({ lean: 0.2, bodyY: kit.HIP - 0.04 * d, fL: 0, lRx: -0.35, lRk: 0.4, lRz: 0, lLx: 0.6 * Math.abs(w), lLk: 0.15, lLz: -0.25 * w, aLz: -1.35 + 0.5 * w, aRz: 1.35 + 0.5 * w, aLx: 0.1, aRx: 0.1, aLe: -0.15, aRe: -0.15, roll: 0.42 * w * d }); return 11; } };
}
