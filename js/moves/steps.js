// Step sequence, conducted by the finger: every stroke of the scribble is exactly one step, and the length of the stroke picks it.
//   short stroke   -> toe steps (quick, on the picks)
//   medium stroke  -> mohawk (step from one foot to the other, turning to face the other way)
//   long stroke    -> serpentine (one deep S-shaped edge)
// The step goes to the side the stroke went. Nothing is random and only one step happens at a time.
import { CFG } from '../config.js';
import { sstep, evenness, dimin } from '../core/math.js';
const STEPS = { toe: { n: 'Toe steps', sec: 0.36, turn: 0 }, mohawk: { n: 'Mohawk', sec: 0.5, turn: Math.PI }, serp: { n: 'Serpentine', sec: 0.85, turn: 0 } };
const pick = (px) => (px < CFG.steps.shortPx ? 'toe' : px < CFG.steps.longPx ? 'mohawk' : 'serp');
export function createSteps(S, api) {
  const st = { k: null, u: 1, sd: 1, base: 0, done: 0, kinds: {}, next: null, idle: 0, stab: 0.5, per: [] };
  const begin = (q) => { st.k = q.k; st.sd = q.sd; st.u = 0; st.next = null; api.emit('say', { big: STEPS[q.k].n, small: 'step ' + (st.done + 1), hold: 0.7 }); };
  return { id: 'steps', steer: 1, state: st,
    start() { api.ensureSpeed(3.8); },
    // one stroke of the finger: g.ampPx is its length, g.ampDir the way it went
    beat(g) { st.idle = 0; if (!g || !(g.ampPx > 0)) return; if (g.periodMs > 40) { st.per.push(g.periodMs); if (st.per.length > 5) st.per.shift(); st.stab = evenness(st.per); } const q = { k: pick(g.ampPx), sd: g.ampDir || 1 }; if (st.u >= 1) begin(q); else st.next = q; },      // a stroke made mid-step waits its turn; a newer one replaces it
    release() {},
    update(dt) { api.ensureSpeed(3.8);
      if (st.u >= 1) { st.idle += dt; return st.idle < 0.55; }
      const U = STEPS[st.k]; st.u = Math.min(1, st.u + dt / U.sec);
      S.yawX = st.base + U.turn * st.sd * sstep(0.3, 0.7, st.u);
      if (st.u >= 1) { st.base += U.turn * st.sd; st.done++; st.kinds[st.k] = 1; st.idle = 0; if (st.next) begin(st.next); }
      return true; },
    end() { const nk = Object.keys(st.kinds).length, P = CFG.points; if (Math.round(st.base / Math.PI) % 2 !== 0) S.back = !S.back;      // an odd number of half turns leaves her facing the other way
      api.emit('element', { kind: 'steps', name: 'Step sequence', detail: st.done + ' steps, ' + nk + (nk === 1 ? ' kind' : ' kinds'), base: dimin(P.steps[0], st.done, P.steps[1]) * (0.6 + 0.4 * Math.min(1, nk / 3)), counted: st.done > 0,
        quality: +(CFG.steps.qualityMin + (CFG.steps.qualityMax - CFG.steps.qualityMin) * st.stab).toFixed(2), qLabel: st.stab > 0.75 ? 'steady rhythm' : st.stab > 0.4 ? 'fair rhythm' : 'uneven rhythm' }); },
    // every step draws one unbroken curve that leaves her line and rejoins it without a corner
    blade(out) { if (st.u >= 1) return; const x = st.u, k = st.k, bell = Math.sin(Math.PI * x) * Math.sin(Math.PI * x); let z = 0;
      if (k === 'serp') z = 0.85 * bell;                                                                       // one deep lobe to that side
      else if (k === 'toe') z = 0.22 * Math.sin(4 * Math.PI * x) * Math.sin(Math.PI * x);                      // quick little ripples
      else z = 0.5 * bell * (0.6 + 0.8 * x);                                                                   // a curl that swings wider as she steps across
      out.x += Math.cos(S.facing) * z * st.sd; out.z -= Math.sin(S.facing) * z * st.sd; },
    pose(T, kit) { const HIP = kit.HIP; kit.set({ lean: 0.12, bodyY: HIP - 0.03, lLz: 0, lRz: 0 }); if (st.u >= 1) return 12;
      const k = st.k, x = st.u, sd = st.sd, wv = Math.sin(Math.PI * x);
      if (k === 'serp') kit.set({ fL: 0, lRx: -0.35, lRk: 0.4, lLx: 0.6, lLk: 0.15, aLz: -1.35 + 0.45 * wv * sd, aRz: 1.35 + 0.45 * wv * sd, aLx: 0.1, aRx: 0.1, aLe: -0.15, aRe: -0.15, roll: 0.38 * wv * sd, lean: 0.2 });
      else if (k === 'toe') { const q = Math.sin(x * 4 * Math.PI), qL = Math.max(0, q), qR = Math.max(0, -q);
        kit.set({ fL: 0, fR: 0, lLx: -qL - 0.15, lLk: qL * 1.5 + 0.1, lRx: -qR - 0.15, lRk: qR * 1.5 + 0.1, aLz: -0.6 - qR * 0.5, aRz: 0.6 + qL * 0.5, aLx: -0.4 + q * 0.5, aRx: -0.4 - q * 0.5, aLe: -1.0, aRe: -1.0, bodyY: HIP + 0.03 }); }
      else { kit.set(kit.WIDE); kit.set({ lean: 0.02, lLz: -0.42, lRz: 0.42, lLx: 0.1, lRx: 0.1, lLk: 0.12, lRk: 0.12, bodyY: HIP - 0.07, aLx: 0.3, aRx: 0.3 }); }
      return 16; } };
}
