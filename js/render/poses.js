// Turns the skater's state into joint angles. Plain skating, sprinting, the air and the landing live here;
// each move supplies its own pose through move.pose().
import { HIP } from './model.js';
import { clamp } from '../core/math.js';

const TUCK = { aLz: 0.45, aRz: -0.45, aLx: -0.75, aRx: -0.75, aLe: -2.0, aRe: -2.0 };
const WIDE = { aLz: -1.4, aRz: 1.4, aLx: 0.15, aRx: 0.15, aLe: -0.15, aRe: -0.15 };
// How she holds her arms coming out of a jump: a different one each landing, held for a moment, then eased away.
const LANDINGS = [
  WIDE,                                                                                                        // straight out to the sides
  { aLz: -0.55, aLx: 1.25, aLe: -0.2, aRz: 1.35, aRx: -0.35, aRe: -0.1 },                                     // one arm reaching forward, the other out behind
  { aLz: -2.25, aRz: 2.25, aLx: 0.25, aRx: 0.25, aLe: -0.1, aRe: -0.1 },                                      // lifted high in a V
  { aLz: -0.95, aRz: 0.95, aLx: -0.75, aRx: -0.75, aLe: -0.2, aRe: -0.2 },                                    // swept low and back, like wings
  { aLz: -1.3, aLx: 0.35, aLe: -0.15, aRz: 2.6, aRx: 0.3, aRe: -0.65 },                                       // one arm curved overhead, the other out
  { aLz: -1.15, aLx: 0.9, aLe: -0.9, aRz: 1.15, aRx: 0.9, aRe: -0.9 },                                        // rounded in front, as if holding a hoop
];
const mirror = (o) => ({ aLz: -o.aRz, aRz: -o.aLz, aLx: o.aRx, aRx: o.aLx, aLe: o.aRe, aRe: o.aLe });
const LAND_HOLD = 1.5, LAND_EASE = 0.7;                                                                      // seconds held, then eased back to skating
// Carving arms: when she curves, her arms flow through these, from holding herself to a broad open reach.
const HUG = { aLz: 0.3, aRz: -0.3, aLx: -0.85, aRx: -0.85, aLe: -1.85, aRe: -1.85 };                         // arms folded across her chest
const SOFT = { aLz: -0.5, aRz: 0.5, aLx: 0.3, aRx: 0.3, aLe: -0.75, aRe: -0.75 };                            // low and rounded at her sides
const FLOWS = [HUG, SOFT, LANDINGS[5], { aLz: 0.3, aLx: -0.85, aLe: -1.85, aRz: 1.5, aRx: 0.1, aRe: -0.15 }, WIDE, LANDINGS[1], LANDINGS[4], LANDINGS[3], LANDINGS[2]];
const ARMS = ['aLz', 'aRz', 'aLx', 'aRx', 'aLe', 'aRe'];
const CARVE = { from: 3.5, full: 9, ease: 1.6, change: [1.6, 2.4], hold: [0.6, 2.2] };      // from/full: sideways pull (m/s2) where the arms begin to flow and where they fully do; ease: how gently they come in and out (1/s); change, hold: seconds to move to the next gesture and to rest in it

export function createPoser(model) {
  const pose = { roll: 0, lean: 0.1, bodyY: HIP, side: 0, fL: 1, fR: 1, aLx: 0, aRx: 0, aLz: -0.8, aRz: 0.8, aLe: -0.3, aRe: -0.3, lLx: 0, lRx: 0, lLz: 0, lRz: 0, lLk: 0.05, lRk: 0.05 };
  let lastLandT = 99, arms = WIDE, pick = 0;
  // carving arms: `flow` is where the arms are now, easing from `flowA` to `flowB`; carve is how much of it shows, 0..1
  const flow = Object.assign({}, SOFT); let flowA = SOFT, flowB = SOFT, flowT = 1, flowLen = 1, flowRest = 0, flowIx = 1, carve = 0;
  const nextFlow = () => { flowA = Object.assign({}, flow); flowIx = (flowIx + 1 + Math.floor(Math.random() * (FLOWS.length - 1))) % FLOWS.length; flowB = Math.random() < 0.5 ? FLOWS[flowIx] : mirror(FLOWS[flowIx]);
    flowT = 0; flowLen = CARVE.change[0] + Math.random() * (CARVE.change[1] - CARVE.change[0]); flowRest = CARVE.hold[0] + Math.random() * (CARVE.hold[1] - CARVE.hold[0]); };
  return function update(game, dt, now) {
    const S = game.S, sp = game.speed(), m = S.move, g = clamp(sp / 7, 0, 1);
    const hustle = Math.max((S.boostT > 0 && !m && S.grounded && S.mag > 0.1) ? Math.min(1, S.boostT / 0.6) : 0, S.grounded && !m ? S.push * 0.75 : 0);      // sprinting after a fall, or simply pushing for speed
    S.phase += (1.5 + sp * 0.2) * (1 + 1.6 * hustle) * dt;
    const sw = Math.sin(S.phase), pL = Math.max(0, sw), pR = Math.max(0, -sw), ln = 0.08 + 0.2 * g + 0.22 * hustle;
    const T = { roll: 0, lean: ln, bodyY: HIP - 0.03 * g, side: 0, fL: 1, fR: 1,
      aLx: 0.3 * sw * g - 0.1, aRx: -0.3 * sw * g - 0.1, aLz: -0.7 - 0.25 * g, aRz: 0.7 + 0.25 * g, aLe: -0.3, aRe: -0.3,
      lLx: -0.28 * g - ln + pL * 0.5 * g, lLz: -pL * 0.38 * g - 0.03, lLk: 0.55 * g * (1 - pL * 0.7) + 0.05,
      lRx: -0.28 * g - ln + pR * 0.5 * g, lRz: pR * 0.38 * g + 0.03, lRk: 0.55 * g * (1 - pR * 0.7) + 0.05 };
    const set = (o) => { for (const k in o) T[k] = o[k]; };
    // gliding, the arms drift slowly on their own, so they are never held in quite the same place
    const t = now / 1000, dz = 0.22 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 0.91 + 1.3), dx = 0.25 * Math.sin(t * 0.29 + 2.1), de = 0.2 * Math.sin(t * 0.53 + 0.7);
    T.aLz -= dz * (1 - 0.5 * g); T.aRz += (0.22 * Math.sin(t * 0.33 + 1.9) + 0.12 * Math.sin(t * 0.83)) * (1 - 0.5 * g);
    T.aLx += dx * (1 - g * 0.6); T.aRx += 0.25 * Math.sin(t * 0.31 + 4.2) * (1 - g * 0.6); T.aLe -= Math.max(0, de); T.aRe -= Math.max(0, 0.2 * Math.sin(t * 0.47 + 2.6));
    if (hustle > 0) set({ aLx: 0.95 * sw * hustle - 0.2, aRx: -0.95 * sw * hustle - 0.2, aLe: -1.25, aRe: -1.25, aLz: -0.35, aRz: 0.35, bodyY: HIP - 0.1 * hustle,      // sprinting: low, driving arms, long pushes
      lLx: -0.5 - ln + pL * 0.9, lRx: -0.5 - ln + pR * 0.9, lLk: 0.9 * (1 - pL * 0.8) + 0.05, lRk: 0.9 * (1 - pR * 0.8) + 0.05, lLz: -pL * 0.5 - 0.03, lRz: pR * 0.5 + 0.03 });
    if (g > 0.6 && !hustle) set({ lean: ln + 0.22 * (g - 0.6) * 2.5, bodyY: HIP - 0.03 * g - 0.05 * (g - 0.6) * 2.5, aLx: T.aLx + 0.5 * (g - 0.6) * 2.5, aRx: T.aRx + 0.5 * (g - 0.6) * 2.5 });      // at full speed she gets low and the arms sweep back
    // curving, her arms leave the still skating pose and drift from one gesture to the next, never snapping
    { const pull = Math.abs(S.turn) * sp, want = S.grounded && !m ? clamp((pull - CARVE.from) / (CARVE.full - CARVE.from), 0, 1) * (1 - hustle) : 0, was = carve;
      carve += (want - carve) * (1 - Math.exp(-CARVE.ease * dt));
      if (was < 0.02 && want > 0 && flowT >= flowLen) nextFlow();                                            // a fresh gesture each time she starts to curve
      if (carve > 0.02) { flowT += dt; if (flowT > flowLen + flowRest) nextFlow(); }
      const u = clamp(flowT / flowLen, 0, 1), e = u * u * u * (u * (u * 6 - 15) + 10), w = carve * carve * (3 - 2 * carve);
      for (const k of ARMS) { flow[k] = flowA[k] + (flowB[k] - flowA[k]) * e; T[k] += (flow[k] - T[k]) * w; } }
    let rate = 13;
    if (!S.grounded) { set(TUCK); set({ lean: 0, bodyY: HIP, fL: 0, fR: 0, lLx: -0.06, lRx: 0.04, lLz: 0.07, lRz: -0.07, lLk: 0.05, lRk: 0.05 }); rate = 22; }
    else if (m && m.pose) { const r = m.pose(T, { set, TUCK, WIDE, HIP }); if (r) rate = r; }
    else if (S.landT < LAND_HOLD + LAND_EASE) {
      // the landing: free leg extended behind, arms in this landing's shape; held, then eased back as she skates on
      if (S.landT < lastLandT) { pick = (pick + 1 + Math.floor(Math.random() * (LANDINGS.length - 1))) % LANDINGS.length; arms = Math.random() < 0.5 ? LANDINGS[pick] : mirror(LANDINGS[pick]); }
      const w = (S.landT < LAND_HOLD ? 1 : 1 - (S.landT - LAND_HOLD) / LAND_EASE) * (1 - hustle), L = Object.assign({ lean: 0.5, bodyY: 0.875, fL: 0, lRx: -0.85, lRk: 0.75, lRz: 0, lLx: 0.8, lLk: 0.1, lLz: -0.1 }, arms);
      const e = w * w * (3 - 2 * w); for (const k in L) T[k] += (L[k] - T[k]) * e;
      rate = 9; }
    lastLandT = S.landT;
    const kp = 1 - Math.exp(-rate * dt); for (const k in T) pose[k] += (T[k] - pose[k]) * kp;
    const r = model.rig;
    r.armL.g.rotation.set(pose.aLx, 0, pose.aLz); r.armR.g.rotation.set(pose.aRx, 0, pose.aRz); r.armL.lower.rotation.x = pose.aLe; r.armR.lower.rotation.x = pose.aRe;
    r.legL.g.rotation.set(pose.lLx, 0, pose.lLz); r.legR.g.rotation.set(pose.lRx, 0, pose.lRz); r.legL.lower.rotation.x = pose.lLk; r.legR.lower.rotation.x = pose.lRk;
    r.legL.foot.rotation.x = -(pose.lean + pose.lLx + pose.lLk) * pose.fL + 0.3 * (1 - pose.fL);       // planted blades stay flat, free feet point
    r.legR.foot.rotation.x = -(pose.lean + pose.lRx + pose.lRk) * pose.fR + 0.3 * (1 - pose.fR);
    const spinRate = (m && m.spinRate ? m.spinRate() : 0) + (S.grounded ? 0 : Math.abs(S.goal - S.spin) * 20);
    if (r.hair) { r.hair.rotation.x = 0.12 + 0.5 * g + Math.min(0.5, spinRate / 30) + Math.sin(now * 0.007) * 0.07 - pose.lean * 0.5; r.hair.rotation.z = clamp(S.turn * 0.12, -0.5, 0.5) + Math.sin(now * 0.005) * 0.05; }
    const flare = 1 + 0.4 * clamp(spinRate / 20, 0, 1) + 0.06 * g; r.skirt.scale.set(flare, 1 - (flare - 1) * 0.35, flare);
    model.body.position.y = pose.bodyY; model.body.rotation.set(pose.lean, 0, clamp(-S.turn * 0.16, -0.5, 0.5) * g * (m && !m.leanIntoTurn ? 0 : 1) + pose.roll);
    model.hero.position.set(S.x, S.y + S.visY, S.z); model.hero.rotation.y = game.yaw() + pose.side * 1.5708;
  };
}
