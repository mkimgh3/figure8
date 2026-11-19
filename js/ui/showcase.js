// The front page's turntable (v3-look40). A finger dragged across the scene turns the skater round, so she can be seen
// from every side; a flick sets her spinning and she slows to a stop by herself. As she is turned she goes through
// gestures (a wave, a curtsy or a bow, the arms in one shape after another; Rook shows off his stick). Spun fast she
// pulls into a spin position, which flares the skirts, and as the spin dies away she finishes with a flourish. A tap
// brings out the next gesture. Left alone a while, she now and then strikes a pose of her own, and between gestures
// she settles back into her stance.
// S: the skater's state (S.facing is what turns); el: the element that takes the drag (touches on `skip` are left
// alone); who(): 0 Tesa, 1 Ivor, 2 Rook; onTurn(): called the first time she is turned.
import { CFG } from '../config.js';

// A pose: the joint angles of poses.js, dy (hip height above or below standing), and wave / waveR (how much her right or
// left hand waves). armL is the character's RIGHT arm. A positive x turn swings a hanging limb backward; a negative
// one, forward. With an arm raised overhead it is the other way round.
// prettier-ignore
const N = { roll: 0, lean: 0.08, dy: 0, fL: 1, fR: 1, aLx: 0, aRx: 0, aLz: -0.8, aRz: 0.8, aLe: -0.3, aRe: -0.3, lLx: 0, lRx: 0, lLz: 0, lRz: 0, lLk: 0.05, lRk: 0.05, wave: 0, waveR: 0 };
const KEYS = Object.keys(N),
  JOINTS = KEYS.filter((k) => k !== 'dy' && k !== 'wave' && k !== 'waveR');
const full = (p) => Object.assign({ name: '' }, N, p);

// prettier-ignore
const WAVE = { name: 'wave', lean: 0.02, roll: 0.05, aLz: -2.55, aLx: 0.2, aLe: -0.3, wave: 1, aRz: 0.55, aRx: 0.1, aRe: -0.35 }; // her right arm raised high, waving side to side, the other low
// prettier-ignore
const TADA = { name: 'ta-da', lean: 0.02, fL: 0, lLx: 0.45, lLk: 0.1, lRk: 0.08, aLz: -2.25, aRz: 2.25, aLx: 0.25, aRx: 0.25, aLe: -0.1, aRe: -0.1 }; // arms flung up in a V, toe pointed behind
// prettier-ignore
const FLEX = { name: 'flex', dy: -0.03, lLz: -0.12, lRz: 0.12, aLz: -1.45, aRz: 1.45, aLx: -1.57, aRx: -1.57, aLe: -1.9, aRe: -1.9 }; // both arms up, showing his muscles
// Tesa: graceful
// prettier-ignore
const GRACE = [
  WAVE,
  { name: 'curtsy', dy: -0.15, lean: 0.35, fL: 0, lRx: -0.6, lRk: 0.8, lLx: 0.5, lLz: 0.25, lLk: 0.3, aLz: -0.9, aRz: 0.9, aLx: 0.4, aRx: 0.4, aLe: -0.2, aRe: -0.2 },
  { name: 'crown', lean: -0.05, fL: 0, lLx: 0.35, lRx: -0.1, lRk: 0.15, aLz: -2.75, aRz: 2.75, aLx: 0.25, aRx: 0.25, aLe: -0.9, aRe: -0.9 }, // arms rounded overhead, hands meeting
  TADA,
  { name: 'attitude', lean: 0.25, fL: 0, lLx: 0.6, lLk: 1.0, lRk: 0.12, aLz: -2.4, aLe: -0.6, aRz: 1.3, aRe: -0.15 },                         // free leg bent behind, one arm curved overhead
  { name: 'reach', fL: 0, lLx: -0.35, aLz: -1.3, aLx: 0.35, aLe: -0.15, aRz: 2.6, aRx: 0.3, aRe: -0.65 },                                   // toe pointed in front, one arm curved overhead, the other out
  { name: 'hip', roll: -0.1, fL: 0, lLx: -0.2, lLz: -0.15, aRz: 2.3, aRe: 0, aLz: -0.6, aLe: -1.6, aLx: -0.3 },                              // hand on hip, the other arm up on the diagonal
];
// Ivor: bold
// prettier-ignore
const BOLD = [
  WAVE,
  { name: 'bow', lean: 0.55, dy: -0.04, fL: 0, lLx: 0.35, lLk: 0.15, aRz: -0.3, aRx: -0.85, aRe: -1.85, aLz: -0.6, aLx: 0.6, aLe: -0.1 },     // a deep bow, one arm across him, the other swept back
  FLEX,
  { name: 'fist', roll: 0.06, aLz: -2.6, aLx: 0.1, aLe: -0.3, aRz: 0.6, aRe: -0.4 },                                                        // one fist punched up
  { name: 'akimbo', lLz: -0.12, lRz: 0.12, aLz: -0.6, aRz: 0.6, aLe: -1.6, aRe: -1.6, aLx: -0.3, aRx: -0.3 },                                // hands on hips
  TADA,
];
// Rook: the stick stays in his right hand (armL), so he waves with his left
// prettier-ignore
const STICK = [
  { name: 'wave', aRz: 0.9, aRx: -1.2, aRe: -1.6, waveR: 1, aLz: -0.35, aLx: -0.5, aLe: -0.1 },                                              // left glove waving, the stick held low
  { name: 'celebrate', fL: 0, lLx: -0.7, lLk: 1.0, aLz: -2.75, aLx: -0.15, aLe: -0.15, aRz: 1.15, aRx: -0.2, aRe: -0.4 },                    // the stick thrown up, one knee raised
  { name: 'present', lean: 0.1, fL: 0, lLx: 0.4, lLk: 0.2, aLx: -1.45, aRx: -1.45, aLz: 0.12, aRz: -0.12, aLe: -0.2, aRe: -0.2 },            // the stick held out level in both hands
  { name: 'point', lean: 0.3, fL: 0, lRx: -0.5, lLx: 0.6, lLk: 0.1, aLx: -1.5, aLz: -0.25, aLe: -0.05, aRz: 1.5, aRx: 0.2, aRe: -0.15 },     // the stick straight out ahead, the other arm wide
  { name: 'wide', lean: -0.1, fL: 0, lLx: 0.3, lLk: 0.4, aLz: -1.55, aLe: -0.05, aRz: 1.55, aRe: -0.05 },                                     // arms wide, the stick out to the side
  FLEX,
];
// Bjorn, the polar bear (v3-look48): big and friendly
// prettier-ignore
const BEAR = [
  WAVE,
  { name: 'belly', lean: -0.08, aLx: -0.55, aRx: -0.55, aLz: 0.3, aRz: -0.3, aLe: -1.35, aRe: -1.35 },                                     // both paws on his belly
  { name: 'roar', lean: -0.12, dy: -0.03, aLz: -2.3, aRz: 2.3, aLx: -0.5, aRx: -0.5, aLe: -1.1, aRe: -1.1 },                                // paws up, claws out
  { name: 'hug', lean: 0.1, aLz: -1.25, aRz: 1.25, aLx: -0.85, aRx: -0.85, aLe: -0.7, aRe: -0.7 },                                          // arms open for a hug
  FLEX,
  TADA,
];
// spun fast: the tight spin positions (Rook spins the stick over his head)
// prettier-ignore
const SPINS = [
  [
    { name: 'scratch spin', lean: 0, fL: 0, lLx: -0.55, lLk: 1.1, lLz: 0.15, aLz: 0.45, aRz: -0.45, aLx: -0.75, aRx: -0.75, aLe: -2.0, aRe: -2.0 },
    { name: 'spin, arms overhead', lean: 0, fL: 0, lLx: -0.3, lLk: 1.3, lLz: 0.12, aLz: -2.7, aRz: 2.7, aLe: -0.3, aRe: -0.3 },
  ],
  [{ name: 'spin, arms in', lean: 0, fL: 0, lLx: -0.55, lLk: 1.1, lLz: 0.15, aLz: 0.45, aRz: -0.45, aLx: -0.75, aRx: -0.75, aLe: -2.0, aRe: -2.0 }],
  [{ name: 'stick spin', lean: 0, fL: 0, lLx: -0.3, lLk: 1.2, lLz: 0.12, aLz: -3.3, aRz: 3.3, aLx: 0.15, aRx: 0.15, aLe: -0.3, aRe: -0.3 }],
  [{ name: 'spin, arms in', lean: 0, fL: 0, lLx: -0.55, lLk: 1.1, lLz: 0.15, aLz: 0.45, aRz: -0.45, aLx: -0.75, aRx: -0.75, aLe: -2.0, aRe: -2.0 }],
];
// as the spin dies away: a flourish, held
// prettier-ignore
const FINISH = [
  { name: 'flourish', lean: 0.42, dy: -0.025, fL: 0, lRx: -0.8, lRk: 0.7, lLx: 0.75, lLk: 0.1, lLz: -0.1, aLz: -2.25, aRz: 2.25, aLx: 0.25, aRx: 0.25, aLe: -0.1, aRe: -0.1 },
  { name: 'flourish', lean: 0.3, dy: -0.02, fL: 0, lRx: -0.6, lRk: 0.5, lLx: 0.6, lLk: 0.1, aLz: -1.45, aRz: 1.45, aLx: -0.2, aRx: -0.2, aLe: -0.1, aRe: -0.1 },
  STICK[1],
  { name: 'flourish', lean: 0.3, dy: -0.02, fL: 0, lRx: -0.6, lRk: 0.5, lLx: 0.6, lLk: 0.1, aLz: -1.45, aRz: 1.45, aLx: -0.2, aRx: -0.2, aLe: -0.1, aRe: -0.1 },
];
const SETS = [GRACE, BOLD, STICK, BEAR];
const ease = (u) => u * u * u * (u * (u * 6 - 15) + 10);

export function createShowcase(S, el, skip, who, onTurn) {
  const K = CFG.showcase,
    cur = full({}),
    from = full({});
  let to = full({}),
    u = 1,
    dur = 0.7,
    // rest: her stance; turn: being turned; spin; finish: the flourish; idle: a pose of her own
    mode = 'rest',
    // how much of the gesture shows over her stance, and where that is going
    amt = 0,
    amtGoal = 0,
    // her turning speed (rad/s), and turning still to be counted from the finger
    w = 0,
    acc = 0,
    turned = 0,
    since = 0,
    quiet = 0,
    idleAt = K.idle[0],
    pick = -1,
    t = 0,
    // the finger
    id = null,
    lastX = 0,
    downX = 0,
    downT = 0,
    told = false;
  // the finger's last moves [time (ms), x], for its speed: timed by the events themselves, not by the frames, so a slow
  // frame cannot make a slow drag look like a flick
  const trail = [];
  const fingerRate = () => {
    if (trail.length < 2 || performance.now() - trail[trail.length - 1][0] > 120) return 0;
    const a = trail[0],
      b = trail[trail.length - 1];
    return ((b[1] - a[1]) / Math.max(16, b[0] - a[0])) * 1000 * K.perPx;
  };
  const show = (p, d) => {
    for (const k of KEYS) from[k] = cur[k];
    to = full(p);
    u = 0;
    dur = d;
    since = 0;
    amtGoal = 1;
  };
  const next = () => {
    const L = SETS[who()] || GRACE;
    // the first gesture is always the wave
    pick = pick < 0 ? 0 : (pick + 1 + Math.floor(Math.random() * (L.length - 1))) % L.length;
    show(L[pick], 0.75);
    turned = 0;
  };
  const rest = () => {
    mode = 'rest';
    amtGoal = 0;
    quiet = 0;
    idleAt = K.idle[0] + Math.random() * (K.idle[1] - K.idle[0]);
  };
  // she is being turned: the first stretch of turning brings out a gesture
  const turning = () => {
    if (mode === 'rest' || mode === 'idle' || mode === 'finish') {
      mode = 'turn';
      next();
    }
  };
  el.addEventListener('pointerdown', (e) => {
    if (id !== null || (skip && skip.contains(e.target))) return;
    id = e.pointerId;
    lastX = downX = e.clientX;
    downT = t;
    trail.length = 0;
    try {
      el.setPointerCapture(id);
    } catch (err) {}
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const d = (e.clientX - lastX) * K.perPx;
    lastX = e.clientX;
    S.facing += d;
    acc += d;
    const tm = e.timeStamp || performance.now();
    trail.push([tm, e.clientX]);
    while (trail.length > 2 && tm - trail[0][0] > 100) trail.shift();
    if (Math.abs(e.clientX - downX) > 6) {
      turning();
      if (!told && onTurn) onTurn();
      told = true;
    }
  });
  const up = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    // a flick sets her spinning at the finger's speed
    w = Math.max(-K.maxSpin, Math.min(K.maxSpin, fingerRate()));
    // a tap: the next gesture
    if (Math.abs(e.clientX - downX) < 8 && t - downT < 0.4) {
      mode = 'idle';
      next();
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return {
    // called every frame while the front page is open
    update(dt, now) {
      t = now / 1000;
      if (id !== null) {
        // held: she turns with the finger, and her speed is the finger's (still, it stops her); let go, she keeps it
        w += (fingerRate() - w) * (1 - Math.exp(-15 * dt));
        w = Math.max(-K.maxSpin, Math.min(K.maxSpin, w));
        turned += Math.abs(acc);
        acc = 0;
      } else if (w !== 0) {
        // let go: she spins on and slows to a stop
        S.facing += w * dt;
        turned += Math.abs(w * dt);
        w *= Math.exp(-dt / K.coast);
        w = Math.sign(w) * Math.max(0, Math.abs(w) - K.drag * dt);
      }
      const sp = Math.abs(w);
      if (sp > K.spinIn && mode !== 'spin') {
        mode = 'spin';
        const L = SPINS[who()] || SPINS[0];
        show(L[Math.floor(Math.random() * L.length)], 0.45);
      } else if (mode === 'spin') {
        if (sp < K.spinOut) {
          mode = 'finish';
          show(FINISH[who()] || FINISH[0], 0.6);
        }
      } else if (mode === 'turn') {
        if (turned > K.every && since > K.minHold) next();
        else if (id === null && sp < 0.3 && since > K.hold) rest();
      } else if (mode === 'finish' || mode === 'idle') {
        if (id === null && since > K.hold) rest();
      } else if (id === null) {
        quiet += dt;
        if (quiet > idleAt) {
          mode = 'idle';
          next();
        }
      }
      since += dt;
      u = Math.min(1, u + dt / dur);
      const e = ease(u);
      for (const k of KEYS) cur[k] = from[k] + (to[k] - from[k]) * e;
      amt += (amtGoal - amt) * (1 - Math.exp(-K.blend * dt));
    },
    // over the stance poses.js has worked out (T), as much of the gesture as shows; returns how quickly the joints follow
    pose(T, kit) {
      if (amt < 0.003) return 0;
      const k = amt * amt * (3 - 2 * amt),
        s = Math.sin(t * 9);
      const g = {};
      for (const key of JOINTS) g[key] = cur[key];
      g.bodyY = kit.HIP + cur.dy;
      // the raised right arm swings side to side; Rook's left glove waves from the elbow
      g.aLz += 0.22 * s * cur.wave;
      g.aLe += 0.2 * s * cur.wave;
      g.aRe += 0.4 * s * cur.waveR;
      g.aRz -= 0.1 * s * cur.waveR;
      for (const key in g) T[key] += (g[key] - T[key]) * k;
      return 14;
    },
    // how fast she turns (rad/s), which flares the skirts and the hair
    spinRate: () => Math.abs(w),
    // Start: she stops where she is
    stop() {
      w = 0;
      acc = 0;
      id = null;
      rest();
      amt = 0;
    },
    // for tests and screenshots: show gesture i of her set at once, or the spin (-1) or the flourish (-2)
    force(i) {
      const p = i === -1 ? SPINS[who()][0] : i === -2 ? FINISH[who()] : SETS[who()][i];
      show(p, 0.01);
      mode = 'idle';
      since = -999;
      amt = 1;
      u = 1;
      for (const k of KEYS) cur[k] = to[k];
    },
    state: () => ({ mode, gesture: to.name, amt: +amt.toFixed(2), w: +w.toFixed(2), facing: +S.facing.toFixed(2) }),
    names: () => (SETS[who()] || GRACE).map((p) => p.name),
  };
}
