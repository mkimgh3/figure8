// The Canyon's run, rebuilt in v3-look56 (Mark: "make it more like halfpipe simple, flatter bottom and curved side wide
// bobsled or waterslide type with looping ... the track also does spiral and twists like waterslide"), an open trough
// then and a round ice tube since v3-look57, winding down over a snowy hillside toward -z. Along it, straights, bends,
// spirals that pass under their own earlier turns, and quick twists from one side to the other. It banks into every
// bend, so between bends it twists over.
// The centre line is laid down a metre at a time from a seeded list of sections, so it is the same run every visit, and
// it goes on for as long as she skates: more of it is made ahead of her as she goes.
// For the game it is a height field near her: the height of the ice at (x, z) is found from the nearest point of the
// centre line within `W` metres along it of where she is (`hint`), so a spiral's turns above and below hers do not count.
// No three.js here: the game's rules use it too.
import { CFG } from '../config.js';

const K = CFG.canyon,
  DEG = Math.PI / 180,
  // where the run starts (m along it): a straight lead-in, closed at its top end
  S0 = -40,
  // how far along the run (m, either way from her) the nearest point is looked for
  W = 44,
  CELL = 32;

// the samples, one a metre: centre line x, y, z, heading (radians, 0 toward +z, increasing to the left), curvature
// (1/m, + to the left), bank wanted (radians) and its running sum (for the eased bank)
const X = [],
  Y = [],
  Z = [],
  TH = [],
  KA = [],
  WANT = [],
  SUM = [0],
  grid = new Map();
let rnd = null,
  kNow = 0,
  gNow = 0.05,
  spirals = [];

export const track = {
  S0,
  X,
  Y,
  Z,
  TH,
  // the spirals' middles: [x, z, top y, bottom y]
  spirals,
  // where she is along the run (m): the queries look near here
  hint: 0,
  get length() {
    return S0 + X.length - 1;
  },
};

// ---- the shape across the run: a round tube (v3-look57; v3-look56 was an open trough with a flat floor), its bottom
// on the centre line. Round, it is the same shape however it is banked: the bank shows only in the lines drawn inside.
const RT = K.tube,
  REACH = K.reach * DEG;
// how high the ice is (m above the centre line) at `d` metres across the run (+ to the right, seen going down it):
// the tube's lower half, and level with its middle past its sides. (p, the bank, does not change it.)
export function across(d, p) {
  const q = Math.min(Math.abs(d), RT);
  return RT - Math.sqrt(RT * RT - q * q);
}
// how far across she can ride up the wall: out[0] left (negative), out[1] right
export function lips(p, out) {
  out[0] = -RT * Math.sin(REACH);
  out[1] = RT * Math.sin(REACH);
  return out;
}
// the tube's inside as points (across, up) in the run's own frame, `n` steps round from the bottom (anticlockwise seen
// down the run, so its faces look inward; the first point repeats at the end), radius r
export function profile(n, r = RT) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (2 * Math.PI * i) / n;
    pts.push([r * Math.sin(t), RT - r * Math.cos(t)]);
  }
  return pts;
}
export const TUBE = RT;

// the hillside under the run: it drops toward -z
export const hillY = (z) => K.hill * z;

// ---- laying the run
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wrap = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const range = (r) => r[0] + rnd() * (r[1] - r[0]);
const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
function addCell(i) {
  const k = key(X[i], Z[i]);
  let c = grid.get(k);
  if (!c) grid.set(k, (c = []));
  c.push(i);
}
function dropTo(n) {
  while (X.length > n) {
    const i = X.length - 1,
      c = grid.get(key(X[i], Z[i]));
    if (c) c.pop();
    X.pop();
    Y.pop();
    Z.pop();
    TH.pop();
    KA.pop();
    WANT.pop();
    SUM.pop();
  }
}
function push(x, y, z, th, k) {
  X.push(x);
  Y.push(y);
  Z.push(z);
  TH.push(th);
  KA.push(k);
  const w = Math.max(-K.roll[1], Math.min(K.roll[1], K.roll[0] * k)) * DEG;
  WANT.push(w);
  SUM.push(SUM[SUM.length - 1] + w);
  addCell(X.length - 1);
}
// lay `len` metres turning toward curvature k (1/m) and dropping `grade` m per m, both eased in over K.ease metres
function lay(len, k, grade) {
  const k0 = kNow,
    g0 = gNow;
  for (let m = 1; m <= len; m++) {
    const f = Math.min(1, m / K.ease),
      i = X.length - 1;
    kNow = k0 + (k - k0) * f;
    gNow = g0 + (grade - g0) * f;
    const th = TH[i] + kNow;
    push(X[i] + Math.sin(TH[i] + kNow / 2), Y[i] - gNow, Z[i] + Math.cos(TH[i] + kNow / 2), th, kNow);
  }
}
// does anything laid since `from` come too close to the run laid before it: side by side nearer than K.apart, or one
// over the other with less than K.clear between them
function clashes(from) {
  for (let j = from; j < X.length; j++) {
    const cx = Math.floor(X[j] / CELL),
      cz = Math.floor(Z[j] / CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const c = grid.get(cx + a + ',' + (cz + b));
        if (!c) continue;
        for (const i of c) {
          if (i > j - 40) continue;
          const dx = X[i] - X[j],
            dz = Z[i] - Z[j];
          if (dx * dx + dz * dz < K.apart * K.apart && Y[i] - Y[j] < K.clear) return true;
        }
      }
  }
  return false;
}
// one more section of the run, chosen by how high the run is above the hillside and which way it is heading
function grow() {
  const i = X.length - 1,
    dev = wrap(TH[i] - Math.PI),
    high = Y[i] - hillY(Z[i]),
    H = K.height,
    mid = (H[0] + H[1]) / 2,
    // how far it may drop before it is too low over the hillside (m)
    spare = high - H[0],
    steep = Math.max(0.45, Math.min(1.6, 1 + (high - mid) / 25)),
    // the drop for a section `len` long: steeper high up, gentler low down, never so much it ends up too low
    grade = (g, len) => Math.max(0.03, Math.min(0.14, g * steep, spare / len));
  const tries = [];
  const bend = (dir, deg, r, g) => {
    const len = Math.round(deg * DEG * r);
    return () => lay(len, dir / r, grade(g, len));
  };
  // a spiral, turning the way `dir` says (1 left) until it heads roughly downhill again, at least 450 degrees, dropping
  // enough each turn to pass under the turn before; none where the run is too low over the hillside for that
  const spiral = (dir) => {
    const r = range(K.spiral.radius),
      out = (rnd() - 0.5) * 80 * DEG,
      turn = ((((dir * (out - dev)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / DEG;
    let deg = turn + 360;
    if (deg < K.spiral.deg[0]) deg += 360;
    const len = Math.round(deg * DEG * r),
      need = (K.clear + 1.5) / (2 * Math.PI * r),
      g = Math.max(need, Math.min(0.14, K.spiral.grade * steep));
    if (g * len > spare) return null;
    return () => {
      const a = X.length - 1;
      lay(len, dir / r, g);
      // its middle: the average over its last whole turn
      const n = X.length - 1,
        turn = Math.round(2 * Math.PI * r);
      let mx = 0,
        mz = 0;
      for (let i = n - turn; i < n; i++) {
        mx += X[i];
        mz += Z[i];
      }
      spirals.push([mx / turn, mz / turn, Y[a], Y[n]]);
    };
  };
  // turn back toward downhill if heading well off it, then straight on down
  const straightDown = (len, g) => () => {
    if (Math.abs(dev) > 25 * DEG) lay(Math.round(Math.abs(dev) * 75), -Math.sign(dev) / 75, g);
    lay(len, 0, g);
  };
  const side = rnd() < 0.5 ? 1 : -1;
  if (high < H[0] + 4) tries.push(straightDown(80, 0.03));
  else if (high > H[1] || (high > mid && rnd() < 0.5)) tries.push(spiral(side), spiral(-side));
  else {
    const r = rnd(),
      // back toward downhill when heading well off it
      dir = Math.abs(dev) > 70 * DEG ? -Math.sign(dev) : side;
    if (r < 0.24) {
      const len = Math.round(range(K.straight.len));
      tries.push(() => lay(len, 0, grade(K.straight.grade, len)));
    } else if (r < 0.54) {
      const deg = Math.min(range(K.bend.deg), (130 * DEG - dir * dev) / DEG),
        deg2 = Math.min(deg, (130 * DEG + dir * dev) / DEG);
      tries.push(bend(dir, Math.max(40, deg), range(K.bend.radius), K.bend.grade));
      tries.push(bend(-dir, Math.max(40, deg2), range(K.bend.radius), K.bend.grade));
    } else if (r < 0.76) {
      const d1 = range(K.twist.deg),
        r1 = range(K.twist.radius);
      tries.push(() => {
        bend(dir, d1, r1, K.twist.grade)();
        bend(-dir, d1, r1, K.twist.grade)();
      });
      tries.push(() => {
        bend(-dir, d1, r1, K.twist.grade)();
        bend(dir, d1, r1, K.twist.grade)();
      });
    } else tries.push(spiral(side), spiral(-side));
  }
  tries.push(straightDown(50, 0.03), () => lay(40, 0, 0.14));
  for (let t = tries.length - 1; t >= 0; t--) if (!tries[t]) tries.splice(t, 1);
  const n = X.length,
    sp = spirals.length,
    k0 = kNow,
    g0 = gNow;
  for (let t = 0; t < tries.length; t++) {
    tries[t]();
    if (t === tries.length - 1 || !clashes(n)) return;
    dropTo(n);
    spirals.length = sp;
    kNow = k0;
    gNow = g0;
  }
}
// start again from the top: a straight lead-in down toward -z, with its top end at S0 metres
export function resetTrack() {
  dropTo(0);
  SUM.length = 1;
  grid.clear();
  spirals.length = 0;
  rnd = mulberry(K.seed);
  kNow = 0;
  gNow = 0.05;
  const y0 = hillY(0) + K.height[1] - 6;
  push(0, y0 - S0 * 0.05, -S0, Math.PI, 0);
  lay(60, 0, 0.05);
  track.hint = 0;
}
// make sure the run is laid out to s metres along it (and a little more, for its eased bank)
export function ensureTrack(s) {
  if (!X.length) resetTrack();
  while (track.length < s + K.rollEase + 2) grow();
}

// the bank at sample i (radians): the bank each bend wants, averaged over K.rollEase metres either side, so it rolls
// over smoothly and leans into a bend before it
function bankAt(i) {
  const e = K.rollEase,
    a = Math.max(0, i - e),
    b = Math.min(X.length - 1, i + e);
  return (SUM[b + 1] - SUM[a]) / (b - a + 1);
}
// the centre line at s metres along: x, y, z, heading, bank
export function trackPoint(s, out) {
  ensureTrack(s);
  const u = Math.max(0, Math.min(X.length - 1.001, s - S0)),
    i = Math.floor(u),
    t = u - i;
  out.x = X[i] + (X[i + 1] - X[i]) * t;
  out.y = Y[i] + (Y[i + 1] - Y[i]) * t;
  out.z = Z[i] + (Z[i + 1] - Z[i]) * t;
  out.th = TH[i] + (TH[i + 1] - TH[i]) * t;
  out.bank = bankAt(i) + (bankAt(i + 1) - bankAt(i)) * t;
  return out;
}
const segDist = (i, x, z, q) => {
  const ax = X[i],
    az = Z[i],
    dx = X[i + 1] - ax,
    dz = Z[i + 1] - az,
    t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))),
    ex = ax + dx * t - x,
    ez = az + dz * t - z;
  q.t = t;
  return ex * ex + ez * ez;
};
const Q = { t: 0 };
// the nearest point of the run to (x, z) near `hint`: s along it, d across (+ right), the centre line's height y there,
// its heading th and bank; and dist, how far (x, z) is from the centre line
export function trackNear(x, z, out, hint = track.hint) {
  if (!X.length) resetTrack();
  const n = X.length - 2,
    h = Math.max(0, Math.min(n, Math.round(hint - S0)));
  let best = -1,
    bd = Infinity;
  for (let i = Math.max(0, h - W); i <= Math.min(n, h + W); i += 3) {
    const dx = X[i] - x,
      dz = Z[i] - z,
      d2 = dx * dx + dz * dz;
    if (d2 < bd) {
      bd = d2;
      best = i;
    }
  }
  // far from the run near her: anywhere on it
  if (bd > 30 * 30) {
    const cx = Math.floor(x / CELL),
      cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const c = grid.get(cx + a + ',' + (cz + b));
        if (c)
          for (const i of c) {
            const dx = X[i] - x,
              dz = Z[i] - z,
              d2 = dx * dx + dz * dz;
            if (d2 < bd && i <= n) {
              bd = d2;
              best = i;
            }
          }
      }
  }
  let bi = best,
    bt = 0;
  bd = Infinity;
  for (let i = Math.max(0, best - 3); i <= Math.min(n, best + 3); i++) {
    const d2 = segDist(i, x, z, Q);
    if (d2 < bd) {
      bd = d2;
      bi = i;
      bt = Q.t;
    }
  }
  const th = TH[bi] + (TH[bi + 1] - TH[bi]) * bt,
    cx = X[bi] + (X[bi + 1] - X[bi]) * bt,
    cz = Z[bi] + (Z[bi + 1] - Z[bi]) * bt;
  out.s = S0 + bi + bt;
  out.th = th;
  out.y = Y[bi] + (Y[bi + 1] - Y[bi]) * bt;
  out.bank = bankAt(bi) + (bankAt(bi + 1) - bankAt(bi)) * bt;
  out.d = (x - cx) * -Math.cos(th) + (z - cz) * Math.sin(th);
  out.dist = Math.sqrt(bd);
  return out;
}
const NEAR = { s: 0, th: 0, y: 0, bank: 0, d: 0, dist: 0 };
// the height of the ice at (x, z)
export function trackY(x, z) {
  trackNear(x, z, NEAR);
  return NEAR.y + across(NEAR.d, NEAR.bank);
}
