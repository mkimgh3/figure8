// Choreography: the artistic part of a programme. It starts when the right thumb drags, and while it stays down she improvises, one pose
// flowing into the next. The left thumb goes on steering her and setting her speed. How the right thumb moves sets the mood
// (0..1): slow strokes give calm, broad, sustained gestures; quick ones give sharp, low, street-dance moves that hit on a
// beat. Circling it turns her.
import { CFG } from '../config.js';
import { clamp, wrap, dimin } from '../core/math.js';

// A pose is the joint angles of poses.js plus dy (hip height above or below standing) and yaw (which way she turns to face).
const N = { roll: 0, lean: 0.08, dy: 0, fL: 1, fR: 1, aLx: 0, aRx: 0, aLz: -0.8, aRz: 0.8, aLe: -0.3, aRe: -0.3, lLx: 0, lRx: 0, lLz: 0, lRz: 0, lLk: 0.05, lRk: 0.05, yaw: 0 };
const KEYS = Object.keys(N);
const CALM = [
  { lean: 0.7, fL: 0, lRx: -0.7, lLx: 0.7, lLk: 0, aLz: -1.5, aRz: 1.5, aLx: 0.5, aRx: -0.4, aLe: -0.1, aRe: -0.1 },                                   // arabesque, one arm leading
  { lean: -0.05, fL: 0, lLx: 0.35, lRx: -0.1, lRk: 0.15, aLz: -2.5, aRz: 2.5, aLe: -0.5, aRe: -0.5 },                                                // arms rounded overhead
  { dy: -0.22, lean: 0.15, fL: 0, lRx: -1.0, lRk: 1.3, lLx: 0.75, lLk: 0.15, aLz: -1.3, aRz: 2.3, aLx: 0.2, aLe: -0.1, aRe: -0.2, yaw: 0.5 },         // deep lunge, one arm lifted
  { dy: -0.05, lean: -0.35, fL: 0, lRx: -0.3, lRk: 0.5, lLx: 0.55, aLz: -1.6, aRz: 1.6, aLx: -0.5, aRx: -0.5, aLe: -0.1, aRe: -0.1, yaw: -0.7 },      // arched back, arms open behind
  { lean: 0.25, fL: 0, lLx: 0.6, lLk: 1.0, lRk: 0.12, aLz: -2.4, aLe: -0.6, aRz: 1.3, aRe: -0.15 },                                                   // attitude: free leg bent behind, one arm curved overhead
  { roll: 0.3, fL: 0, lLz: -0.3, lRk: 0.2, aLz: -2.0, aRz: 0.9, aRx: 0.3, aLe: -0.15, aRe: -0.4, yaw: 0.9 },                                          // long side reach on a deep edge
  { dy: -0.05, lean: 0.05, lLk: 0.3, lRk: 0.3, lLx: -0.15, lRx: -0.15, aLz: 0.3, aRz: -0.3, aLx: -0.85, aRx: -0.85, aLe: -1.85, aRe: -1.85 },         // holding herself
  { dy: -0.15, lean: 0.35, fL: 0, lRx: -0.6, lRk: 0.8, lLx: 0.5, lLz: 0.25, lLk: 0.3, aLz: -0.9, aRz: 0.9, aLx: 0.4, aRx: 0.4, aLe: -0.2, aRe: -0.2 }, // curtsy, arms offered low
  { lean: 0.1, fL: 0, lLx: -0.5, lLk: 0.1, lRk: 0.1, aLz: -1.45, aRz: 1.45, aLx: 0.15, aRx: 0.15, aLe: -0.1, aRe: -0.1, yaw: -1.2 },                   // free leg carried forward, arms wide
];
const LOW = { dy: -0.14, lLx: -0.55, lRx: -0.55, lLk: 0.85, lRk: 0.85, lLz: -0.3, lRz: 0.3 };      // the grounded stance street moves start from
const SHARP = [
  Object.assign({}, LOW, { aLz: -1.4, aLe: -1.57, aRz: 1.4, aRe: 0, lean: 0.05, roll: 0.1 }),                                                        // arms out, one forearm cocked at a right angle
  Object.assign({}, LOW, { lean: -0.12, roll: 0.16, aLz: 0.3, aRz: -0.3, aLx: -0.85, aRx: -0.85, aLe: -1.85, aRe: -1.85, yaw: 0.6 }),                  // arms crossed, weight on one hip
  Object.assign({}, LOW, { roll: -0.2, aRz: 2.3, aRe: 0, aLz: -0.6, aLe: -1.6, aLx: -0.3, yaw: -0.5 }),                                               // one arm thrown up on the diagonal, hand on hip
  Object.assign({}, LOW, { dy: -0.3, lean: 0.3, lLx: -1.0, lRx: -1.0, lLk: 1.4, lRk: 1.4, aLx: 1.3, aRx: 1.3, aLz: -0.2, aRz: 0.2, aLe: -0.2, aRe: -0.2 }),      // drop low, both arms punched forward
  Object.assign({}, LOW, { dy: -0.12, lean: -0.25, aLz: -1.4, aLe: -2.0, aRz: 1.4, aRe: -2.0 }),                                                     // rocked back, elbows up
  { lean: -0.1, fL: 0, lLx: -0.9, lLk: 0.1, lRx: -0.3, lRk: 0.5, dy: -0.06, aRx: 1.0, aLx: -0.8, aLz: -0.5, aRz: 0.5, aLe: -1.2, aRe: -1.2, yaw: 0.4 },      // kick step, arms pumping against it
  { roll: 0.3, dy: -0.12, lLz: -0.6, lLk: 0.1, lRz: 0.1, lRx: -0.5, lRk: 0.9, aLz: -1.5, aLe: -0.3, aRx: 0.9, aRz: -0.3, aRe: -0.4, yaw: -1.0 },      // side slide, both arms thrown one way
  Object.assign({}, LOW, { dy: -0.18, lean: 0.2, roll: -0.18, aLz: -0.25, aRz: 0.25, aLe: -1.3, aRe: -1.3, aLx: 0.2, aRx: 0.2 }),                      // hunched bounce, fists low
  Object.assign({}, LOW, { lean: 0.1, aLz: -1.9, aLe: -1.2, aRz: 0.5, aRx: 0.9, aRe: -0.1, yaw: 1.57 }),                                              // quarter turn, one arm framing the head, one pointing
];
const full = (p) => Object.assign({}, N, p);
const mirror = (p) => Object.assign({}, p, { roll: -p.roll, yaw: -p.yaw, fL: p.fR, fR: p.fL, aLx: p.aRx, aRx: p.aLx, aLz: -p.aRz, aRz: -p.aLz, aLe: p.aRe, aRe: p.aLe, lLx: p.lRx, lRx: p.lLx, lLz: -p.lRz, lRz: -p.lLz, lLk: p.lRk, lRk: p.lLk });

export function createDance(S, api) {
  const K = CFG.dance, st = { t: 0, held: true, rel: 0, mood: 0.2, moodSum: 0, idle: 0, poses: 0 };
  const cur = full({}), from = full({}), out = {}; let to = full({}), u = 1, dur = 1, hold = 0, snap = false, last = -1, facing = 0, begun = false, beat = 0, turnGoal = 0, turned = 0;
  function next(sharp) {
    for (const k of KEYS) from[k] = cur[k];
    snap = sharp || Math.random() < st.mood; const set = snap ? SHARP : CALM; let i = Math.floor(Math.random() * set.length); if (i === last) i = (i + 1) % set.length; last = i;
    to = full(set[i]); if (Math.random() < 0.5) to = mirror(to);
    // she keeps turning as she dances: each pose faces a little further round, and now and then she turns right about
    facing += to.yaw + (Math.random() < (snap ? 0.15 : 0.25) ? (Math.random() < 0.5 ? -Math.PI : Math.PI) : 0); to.yaw = facing;
    u = 0; st.poses++;
    if (snap) { dur = 0.12 + Math.random() * 0.08; hold = (0.2 + Math.random() * 0.3) * (1.4 - 0.6 * st.mood); }
    else { dur = (1.1 + Math.random() * 0.9) * (1.25 - 0.6 * st.mood); hold = 0.25 + Math.random() * 0.8; }
  }
  return { id: 'dance', steer: 1, accel: K.accel, state: st,
    start() { api.ensureSpeed(3.5); api.emit('say', { big: 'Choreography', small: '', hold: 0.8 }); },
    release() { st.held = false; },
    // called every frame with the right thumb's speed (px/s): slow strokes are calm, quick ones sharp
    feed(sb, dt) {
      st.mood += (clamp((sb - K.calmPx) / (K.sharpPx - K.calmPx), 0, 1) - st.mood) * (1 - Math.exp(-1.6 * dt)); },
    // the right thumb circling turns her, as far as it circles; she follows it on a short rubber band
    rotate(d) { turnGoal += d; },
    update(dt) {
      st.t += dt; st.moodSum += st.mood * dt; api.ensureSpeed(2.6); beat += dt * (2.2 + 3.8 * st.mood) * Math.PI;
      // she goes where the thumbs steer her and picks up speed as they push, and drifts along a lazy winding path when they don't
      if (S.mag < 0.15) api.rotateVel(Math.sin(st.t * 0.8) * 0.55 * dt);
      if (begun && st.held && !snap && st.mood > 0.6) next(true);                                   // the thumbs have turned sharp: she breaks off the slow gesture at once
      else if (u < 1) u = Math.min(1, u + dt / dur); else if (begun && (hold -= dt) <= 0 && st.held) next();
      // calm poses ease in and out; sharp ones hit and stop
      const e = snap ? 1 - Math.pow(1 - u, 3) : u * u * u * (u * (u * 6 - 15) + 10); for (const k of KEYS) cur[k] = from[k] + (to[k] - from[k]) * e;
      turned += (turnGoal - turned) * (1 - Math.exp(-7 * dt)); S.yawX = cur.yaw + turned;
      if (!st.held) { st.rel += dt; return st.rel < 0.35; } return true; },
    end() { S.flipYaw = wrap(cur.yaw + turned); S.flipK = 2.6;         // her body eases back round to face the way she is going
      const m = st.t > 0 ? st.moodSum / st.t : 0;
      api.emit('element', { kind: 'dance', name: 'Choreography', detail: st.t.toFixed(1) + ' seconds, ' + (m < 0.33 ? 'flowing' : m > 0.6 ? 'sharp' : 'mixed'), base: dimin(CFG.points.dance[0], st.t, CFG.points.dance[1]), counted: st.t >= K.minScore }); },
    blade(o) { o.width = 1.3; },
    pose(T, kit) {
      if (!begun) { begun = true; for (const k of KEYS) if (k in T) cur[k] = T[k]; cur.dy = T.bodyY - kit.HIP; cur.yaw = 0; next(); }      // the first pose grows out of however she was skating
      // on top of the pose: a slow sway when calm, a bounce on the beat when sharp
      for (const k of KEYS) if (k !== 'dy' && k !== 'yaw') out[k] = cur[k];
      out.bodyY = kit.HIP + cur.dy - 0.04 * st.mood * Math.abs(Math.sin(beat)); out.roll = cur.roll + 0.07 * (1 - st.mood) * Math.sin(st.t * 1.1); out.side = 0;
      kit.set(out); return 14 + 14 * st.mood; } };
}
