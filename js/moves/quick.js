// Two quick moves that do not interrupt the skating.
import { CFG } from '../config.js';
import { clamp, sstep } from '../core/math.js';
// Three-turn: a half turn on one foot. It swaps forward and backward skating, which changes which jumps are on offer.
export function createTurn(S, api) {
  let t = 0; const T_ALL = 0.45, dir = S.turn > 0 ? 1 : -1;
  return { id: 'turn', steer: 1,
    update(dt) { t += dt; const u = clamp(t / T_ALL, 0, 1); S.yawX = dir * Math.PI * sstep(0.15, 0.85, u); return u < 1; },
    end() { S.back = !S.back; api.emit('element', { kind: 'turn', name: 'Three-turn', detail: S.back ? 'now backward' : 'now forward', base: CFG.points.turn }); },
    blade(out) { const u = clamp(t / T_ALL, 0, 1), z = 0.35 * Math.abs(Math.sin(Math.PI * 2 * u)) * dir; out.x += Math.cos(S.facing) * z; out.z -= Math.sin(S.facing) * z; },
    pose(T, kit) { kit.set({ lean: 0.1, bodyY: kit.HIP - 0.03, fL: 0, lRx: -0.3, lRk: 0.35, lLx: 0.5, lLk: 0.5, aLx: -1.1 * dir, aRx: 1.1 * dir, aLz: -0.9, aRz: 0.9, aLe: -0.2, aRe: -0.2 }); return 18; } };
}
// Split leap: a low, travelling leap with the legs in a split. No rotation, no landing to judge.
export function createLeap(S, api) {
  let t = 0; const T_ALL = 0.7;
  const u = () => clamp(t / T_ALL, 0, 1);
  return { id: 'leap', steer: 0.6,
    start() { api.ensureSpeed(4); api.emit('say', { big: 'Split leap', small: '', hold: 0.6 }); },
    update(dt) { t += dt; const x = u(); if (x > 0.15 && x < 0.85) S.visY = 0.6 * Math.sin((x - 0.15) / 0.7 * Math.PI); return x < 1; },
    end() { api.emit('element', { kind: 'leap', name: 'Split leap', detail: 'travelling', base: CFG.points.leap }); },
    blade(out) { const x = u(); out.pen = x < 0.15 || x > 0.85; },
    airborne: () => { const x = u(); return x > 0.15 && x < 0.85; },
    pose(T, kit) { const x = u(); if (x > 0.12 && x < 0.88) kit.set({ lean: 0.05, bodyY: kit.HIP, fL: 0, fR: 0, aLz: -2.3, aRz: 2.3, aLx: 0, aRx: 0, aLe: -0.1, aRe: -0.1, lLx: -1.25, lRx: 1.15, lLk: 0.08, lRk: 0.08, lLz: 0, lRz: 0 });
      else kit.set({ lean: 0.3, bodyY: kit.HIP - 0.12, lLx: -0.6, lRx: -0.6, lLk: 0.9, lRk: 0.9 }); return 20; } };
}
