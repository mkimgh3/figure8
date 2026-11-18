// Choreography: the artistic part of a programme. It starts when the right thumb drags, and while it stays down she improvises: gestures, positions and spins, one pose
// flowing into the next. The left thumb goes on steering her and setting her speed. How the right thumb moves sets the mood
// (0..1): slow strokes give calm, broad, sustained gestures; quick ones give sharp, low, street-dance moves that hit on a
// beat. Circling it turns her.
import { CFG } from '../config.js';
import { clamp, wrap, dimin } from '../core/math.js';

// A pose is the joint angles of poses.js plus dy (hip height above or below standing) and yaw (which way she turns to face).
// The pose tables below keep one pose per row (prettier-ignore), so poses can be compared at a glance.
// prettier-ignore
const N = { roll: 0, lean: 0.08, dy: 0, fL: 1, fR: 1, aLx: 0, aRx: 0, aLz: -0.8, aRz: 0.8, aLe: -0.3, aRe: -0.3, lLx: 0, lRx: 0, lLz: 0, lRz: 0, lLk: 0.05, lRk: 0.05, yaw: 0 };
const KEYS = Object.keys(N);
// prettier-ignore
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
const LOW = { dy: -0.14, lLx: -0.55, lRx: -0.55, lLk: 0.85, lRk: 0.85, lLz: -0.3, lRz: 0.3 }; // the grounded stance street moves start from
// prettier-ignore
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
// While the finger circles she spins, and takes the positions of real spins: open and extended when it circles slowly, tight when fast.
// prettier-ignore
const SPIN_SLOW = [
  { lean: 1.45, fL: 0, lRx: -1.45, lRk: 0.05, lLx: 0.1, lLk: 0, aLz: -1.4, aRz: 1.4, aLx: 0.15, aRx: 0.15, aLe: -0.15, aRe: -0.15 },                                  // camel
  { lean: -0.42, dy: -0.02, fL: 0, lRx: 0.12, lRk: 0.12, lLx: 0.5, lLk: 1.15, lLz: -0.2, aLz: -2.2, aRz: 2.2, aLx: -0.35, aRx: -0.35, aLe: -0.5, aRe: -0.5 },        // layback
  { lean: 0.25, fL: 0, lLx: 0.6, lLk: 1.0, lRk: 0.12, aLz: -2.4, aLe: -0.6, aRz: 1.3, aRe: -0.15 },                                                                 // attitude
];
// prettier-ignore
const SPIN_FAST = [
  { lean: 0, fL: 0, lLx: -0.55, lLk: 1.1, lLz: 0.15, aLz: 0.45, aRz: -0.45, aLx: -0.75, aRx: -0.75, aLe: -2.0, aRe: -2.0 },                                         // scratch: arms and free leg pulled in
  { lean: 0, fL: 0, lLx: -0.3, lLk: 1.3, lLz: 0.12, aLz: -2.7, aRz: 2.7, aLx: 0, aRx: 0, aLe: -0.3, aRe: -0.3 },                                                    // arms stretched overhead
];
// Rook works his stick into the dance (S.hockey). armL is his right arm, the hand that holds the stick alone.
// prettier-ignore
const STICK_CALM = [
  { lean: 0.1, fL: 0, lLx: 0.4, lLk: 0.2, aLx: -1.45, aRx: -1.45, aLz: 0.12, aRz: -0.12, aLe: -0.2, aRe: -0.2 },                       // the stick presented level in both hands
  { lean: 0.3, fL: 0, lRx: -0.5, lLx: 0.6, lLk: 0.1, aLx: -1.5, aLz: -0.25, aLe: -0.05, aRz: 1.5, aRx: 0.2, aRe: -0.15, yaw: 0.3 },   // the stick held straight out ahead, the other arm wide
  { lean: -0.1, fL: 0, lLx: 0.3, lLk: 0.4, aLz: -1.55, aLx: 0.0, aLe: -0.05, aRz: 1.55, aRx: 0.0, aRe: -0.05, yaw: -0.6 },             // arms wide, the stick held out to the side
];
// a fast spin with both arms up: the stick turns over his head like a rotor
// prettier-ignore
export const STICK_OVERHEAD = { lean: 0, fL: 0, lLx: -0.3, lLk: 1.2, lLz: 0.12, aLz: -3.3, aRz: 3.3, aLx: 0.15, aRx: 0.15, aLe: -0.3, aRe: -0.3 };
// Tesa spins in deep laybacks (S.layback): leaning far back, the free leg lifted behind, the arms raised and curving
// back over her head; tighter and higher when the finger circles fast. Never mirrored, so the free leg stays the same.
// (With an arm raised overhead, a negative x turn swings it back, the opposite of a hanging arm.)
// prettier-ignore
export const LAYBACK_SLOW = { lean: -0.95, dy: -0.03, fL: 0, lRx: 0.75, lRk: 0.18, lLx: 1.15, lLk: 1.25, lLz: -0.22, aLz: -2.45, aRz: 2.45, aLx: -0.6, aRx: -0.6, aLe: -0.95, aRe: -0.95 };
// prettier-ignore
export const LAYBACK_FAST = { lean: -0.75, dy: -0.02, fL: 0, lRx: 0.6, lRk: 0.14, lLx: 0.95, lLk: 1.45, lLz: -0.1, aLz: -2.85, aRz: 2.85, aLx: -0.5, aRx: -0.5, aLe: -1.2, aRe: -1.2 };
// Which poses she draws on. Thumbs moving together: the long, open, travelling shapes. Thumbs going their own ways: the twisted, closed, contrasting ones.
// One thumb alone: any of them. Spinning: counter-clockwise takes the camel and then the scratch spin, clockwise the layback or attitude and then arms overhead.
const PICK = {
  calm: { 1: [0, 1, 4, 5, 8], '-1': [2, 3, 4, 6, 7] },
  sharp: { 1: [0, 3, 4, 7], '-1': [1, 2, 5, 6, 8] },
  slow: { 1: [0], '-1': [1, 2] },
  fast: { 1: [0], '-1': [1] },
};
const full = (p) => Object.assign({}, N, p);
const mirror = (p) =>
  Object.assign({}, p, {
    roll: -p.roll,
    yaw: -p.yaw,
    fL: p.fR,
    fR: p.fL,
    aLx: p.aRx,
    aRx: p.aLx,
    aLz: -p.aRz,
    aRz: -p.aLz,
    aLe: p.aRe,
    aRe: p.aLe,
    lLx: p.lRx,
    lRx: p.lLx,
    lLz: -p.lRz,
    lRz: -p.lLz,
    lLk: p.lRk,
    lRk: p.lLk,
  });

export function createDance(S, api) {
  const K = CFG.dance,
    st = {
      t: 0,
      held: true,
      rel: 0,
      mood: 0.2,
      moodSum: 0,
      idle: 0,
      poses: 0,
      rate: 0,
      spin: 0,
      turns: 0,
      dir: 0,
      tog: 0,
      weave: 0,
    };
  // gain: how far the spin has wound up, 0 (two thumb circles to one turn of hers) to 1 (one to one). It builds while a spin is kept going, fades
  // when it is not, and is kept on the skater between dances, so a spin taken up again carries on from what was left. w: her turning speed while winding down.
  let gain = (S.spinGain || 0) * Math.exp(-Math.max(0, S.clock - (S.spinGainT || 0)) / K.gainFade),
    w = 0;
  const cur = full({}),
    from = full({}),
    out = {};
  let to = full({}),
    u = 1,
    dur = 1,
    hold = 0,
    snap = false,
    last = -1,
    facing = 0,
    begun = false,
    beat = 0,
    turnGoal = 0,
    turned = 0,
    lastGoal = 0,
    inSpin = false,
    spinSet = 0,
    dirSet = 1,
    togSet = 0;
  // the first pose is always a calm one, grown out of her skating
  function next(sharp) {
    for (const k of KEYS) from[k] = cur[k];
    inSpin = st.spin > 0;
    snap = !inSpin && st.poses > 0 && (sharp || Math.random() < st.mood);
    const set = inSpin ? (st.spin > 1 ? SPIN_FAST : SPIN_SLOW) : snap ? SHARP : CALM;
    spinSet = st.spin;
    dirSet = st.dir >= 0 ? 1 : -1;
    togSet = st.tog > 0.4 ? 1 : st.tog < -0.4 ? -1 : 0;
    const ids =
      (inSpin ? PICK[st.spin > 1 ? 'fast' : 'slow'][dirSet] : PICK[snap ? 'sharp' : 'calm'][togSet]) ||
      set.map((_, k) => k);
    let i = ids[Math.floor(Math.random() * ids.length)];
    if (i === last && ids.length > 1) i = ids[(ids.indexOf(i) + 1) % ids.length];
    last = i;
    to = full(set[i]);
    if (Math.random() < 0.5) to = mirror(to);
    // Rook: the overhead stick spin, and about half his calm gestures with the stick (never mirrored: the stick stays in
    // his right hand)
    if (S.hockey && inSpin && st.spin > 1) to = full(STICK_OVERHEAD);
    else if (S.layback && inSpin) to = full(st.spin > 1 ? LAYBACK_FAST : LAYBACK_SLOW);
    else if (S.hockey && !inSpin && !snap && Math.random() < 0.5)
      to = full(STICK_CALM[Math.floor(Math.random() * STICK_CALM.length)]);
    // she keeps turning as she dances: each pose faces a little further round, and now and then she turns right about
    facing += inSpin
      ? 0
      : st.poses === 0
        ? to.yaw * 0.4
        : to.yaw + (Math.random() < (snap ? 0.15 : 0.25) ? (Math.random() < 0.5 ? -Math.PI : Math.PI) : 0);
    to.yaw = facing;
    u = 0;
    st.poses++;
    if (inSpin) {
      dur = 0.55 + Math.random() * 0.25;
      hold = 1.2 + Math.random() * 1.4;
    } else if (snap) {
      dur = 0.12 + Math.random() * 0.08;
      hold = (0.2 + Math.random() * 0.3) * (1.4 - 0.6 * st.mood);
    } else {
      dur = (1.1 + Math.random() * 0.9) * (1.25 - 0.6 * st.mood);
      hold = 0.25 + Math.random() * 0.8;
    }
  }
  return {
    id: 'dance',
    steer: 1,
    accel: K.accel,
    state: st,
    start() {}, // no banner and no jolt: dancing is simply how she skates while the finger is down
    // the thumb lifts: a spin winds down by itself, still steered by the left thumb; the thumb coming back takes it up again
    release() {
      if (!st.held) return;
      st.held = false;
      st.rel = 0;
      w = st.spin > 0 ? st.dir : 0;
    },
    hold() {
      st.held = true;
      st.rel = 0;
    },
    // called every frame with the right thumb's speed (px/s): slow strokes are calm, quick ones sharp. sa is the left thumb's speed and
    // cos how alike the two thumbs' directions are; from them, tog drifts toward 1 while they move together, -1 while they move apart, 0 with one alone
    feed(sb, dt, sa, cos) {
      st.tog += ((sa > K.moveSpeed && sb > K.moveSpeed ? (cos > 0.3 ? 1 : -1) : 0) - st.tog) * (1 - Math.exp(-2 * dt));
      st.mood += (clamp((sb - K.calmPx) / (K.sharpPx - K.calmPx), 0, 1) - st.mood) * (1 - Math.exp(-1.6 * dt));
    },
    // the right thumb circling turns her, as far as it circles; she follows it on a short rubber band
    rotate(d) {
      if (st.held) turnGoal += d * (K.turnRatio + (1 - K.turnRatio) * gain);
    },
    update(dt) {
      st.t += dt;
      st.moodSum += st.mood * dt;
      beat += dt * (2.2 + 3.8 * st.mood) * Math.PI;
      // she goes where the thumbs steer her and picks up speed as they push, and drifts along a lazy winding path when they don't
      // if she is nearly standing she is eased up to a gentle glide, never set moving at a stroke
      // spinning with no push from the left thumb, she slowly loses her momentum and the spin settles on the spot
      if (st.spin > 0 && S.mag < 0.15) {
        const f = Math.exp(-dt / K.spinCoast);
        S.vx *= f;
        S.vz *= f;
      } else {
        const v = api.speed();
        if (v < K.glide) {
          const nv = Math.min(K.glide, v + 2.5 * dt);
          if (v > 0.05) {
            S.vx *= nv / v;
            S.vz *= nv / v;
          } else {
            S.vx = Math.sin(S.facing) * nv;
            S.vz = Math.cos(S.facing) * nv;
          }
        }
      }
      if (S.mag < 0.15) api.rotateVel(Math.sin(st.t * 0.8) * 0.55 * dt * Math.min(1, st.t / 1.5));
      // how fast the finger is turning her (rad/s): 0 not spinning, 1 a slow spin, 2 a fast one, with a gap between going in and coming out
      if (!st.held) {
        w *= Math.exp(-dt / K.spinDown);
        turnGoal += w * dt;
      }
      st.rate += (Math.abs(turnGoal - lastGoal) / Math.max(dt, 1e-3) - st.rate) * (1 - Math.exp(-3 * dt));
      st.dir += ((turnGoal - lastGoal) / Math.max(dt, 1e-3) - st.dir) * (1 - Math.exp(-3 * dt));
      st.turns += Math.abs(turnGoal - lastGoal);
      lastGoal = turnGoal;
      // spinning along a straight path, her blade weaves like a twizzle; on a curve the line stays clean
      st.weave += ((st.spin > 0 ? 1 - clamp(Math.abs(S.turn) / 0.8, 0, 1) : 0) - st.weave) * (1 - Math.exp(-3 * dt));
      st.spin =
        st.rate > K.spinFast
          ? 2
          : st.rate > (st.spin ? K.spinOut : K.spinIn)
            ? st.spin === 2 && st.rate > K.spinFast * 0.75
              ? 2
              : 1
            : 0;
      if (st.held && st.spin > 0) gain = Math.min(1, gain + dt / K.gainRise);
      else gain *= Math.exp(-dt / K.gainFade);
      S.spinGain = gain;
      S.spinGainT = S.clock;
      if (
        begun &&
        (st.held
          ? st.spin !== spinSet || (st.spin > 0 && u >= 1 && (st.dir >= 0 ? 1 : -1) !== dirSet)
          : st.spin > 0 && st.spin !== spinSet)
      )
        next(); // into a spin, out of one, or from the open shape to the tight one
      else if (begun && st.held && !inSpin && !snap && st.mood > 0.6)
        next(true); // the thumbs have turned sharp: she breaks off the slow gesture at once
      else if (u < 1) u = Math.min(1, u + dt / dur);
      else if (begun && (hold -= dt) <= 0 && st.held) next();
      // calm poses ease in and out; sharp ones hit and stop
      const e = snap ? 1 - Math.pow(1 - u, 3) : u * u * u * (u * (u * 6 - 15) + 10);
      for (const k of KEYS) cur[k] = from[k] + (to[k] - from[k]) * e;
      turned += (turnGoal - turned) * (1 - Math.exp(-K.follow * dt));
      S.yawX = cur.yaw + turned; // the rubber band: she trails the finger a little and eases to a stop after it
      if (!st.held) {
        st.rel += dt;
        return st.rel < 0.35 || (st.spin > 0 && st.rel < 6);
      }
      return true;
    },
    end() {
      S.flipYaw = wrap(cur.yaw + turned);
      S.flipK = 2.6; // her body eases back round to face the way she is going
      const m = st.t > 0 ? st.moodSum / st.t : 0;
      api.emit('element', {
        kind: 'dance',
        name: 'Choreography',
        detail:
          st.t.toFixed(1) +
          ' seconds, ' +
          (m < 0.33 ? 'flowing' : m > 0.6 ? 'sharp' : 'mixed') +
          (st.turns > 9 ? ', ' + (st.turns / 6.2832).toFixed(1) + ' turns' : ''),
        base: dimin(CFG.points.dance[0], st.t, CFG.points.dance[1]),
        counted: st.t >= K.minScore,
      });
    },
    // how fast she is turning in a spin (rad/s), which flares the skirts and the hair (v3-look38: the spins inside
    // choreography had not been reporting it since v3-look33, so the skirts barely lifted)
    spinRate: () => (st.spin > 0 ? st.rate : 0),
    blade(o, yaw) {
      o.width = 1.3;
      if (st.weave > 0.02) {
        const r = Math.min(0.45, (0.33 * api.speed()) / Math.max(st.rate, 2)) * st.weave;
        o.x += Math.sin(yaw) * r;
        o.z += Math.cos(yaw) * r;
      }
    },
    pose(T, kit) {
      // the first pose grows out of however she was skating
      if (!begun) {
        begun = true;
        for (const k of KEYS) if (k in T) cur[k] = T[k];
        cur.dy = T.bodyY - kit.HIP;
        cur.yaw = 0;
        next();
      }
      // on top of the pose: a slow sway when calm, a bounce on the beat when sharp
      for (const k of KEYS) if (k !== 'dy' && k !== 'yaw') out[k] = cur[k];
      out.bodyY = kit.HIP + cur.dy - 0.04 * st.mood * Math.abs(Math.sin(beat));
      out.roll = cur.roll + 0.07 * (1 - st.mood) * Math.sin(st.t * 1.1);
      out.side = 0;
      kit.set(out);
      // the joints take up the dance gradually over the first moment
      return 4 + (10 + 14 * st.mood) * Math.min(1, st.t / 0.9);
    },
  };
}
