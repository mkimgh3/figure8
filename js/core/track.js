// The Tunnel's run (the place was called the Canyon until v3-look60; it keeps `canyon: true` in CFG.places). Rebuilt
// in v3-look56 (Mark: "bobsled or waterslide type with looping ... the track also does spiral and twists like
// waterslide"), an open trough then, a round ice tube since v3-look57, and since v3-look60 (Mark: "make tunnel gradually
// get wider and narrower in cycle also make it go corkscrew and spiral wild fun warmhole like") a tube that widens and
// narrows as it goes and whose middle runs through three dimensions: straights, bends, spirals that pass under their
// own earlier turns, quick twists from one side to the other, and corkscrews, where the tube coils round the way it is
// going like a spring. It banks into every bend, which shows as the lines inside turning.
// The middle (the tube's axis) is laid down a metre at a time from a seeded list of sections, so it is the same run
// every visit, and it goes on for as long as she skates: more of it is made ahead of her as she goes.
// She skates on the tube's inside, anywhere round it (v3-look60, Mark: "remove height restriction ... it's actually
// quite fun being able to use the whole pipe, like skateboarder doing 360"): where she is is s, metres along the run,
// and phi, radians round the tube from its bottom (+ up its right side, seen going down the run). onTube() turns that
// into a point in the world, the way out of the ice there (into the tube), and the ways along and round.
// No three.js here: the game's rules use it too.
import { CFG } from '../config.js';

const K = CFG.canyon,
  DEG = Math.PI / 180,
  // where the run starts (m along it): a straight lead-in, closed at its top end
  S0 = -40,
  CELL = 32,
  TAU = Math.PI * 2;

// the samples, one a metre: the tube's middle x, y, z; the way the run goes (unit tx, ty, tz) and its heading on the
// map (radians, 0 toward +z, increasing to the left, never wrapped); bank wanted (radians) and its running sum (for the
// eased bank)
const X = [],
  Y = [],
  Z = [],
  TX = [],
  TY = [],
  TZ = [],
  TH = [],
  WANT = [],
  SUM = [0],
  grid = new Map();
let rnd = null,
  kNow = 0,
  gNow = 0.05;
const spirals = [];

export const track = {
  S0,
  X,
  Y,
  Z,
  TH,
  // the spirals' and corkscrews' middles: [x, z, top y, bottom y]
  spirals,
  // where she is along the run (m)
  hint: 0,
  get length() {
    return S0 + X.length - 1;
  },
};

// ---- the tube: round, its radius going in and out along the run (CFG.canyon.tube: the middle radius, then [amount,
// wavelength] pairs), never below tubeMin
const TB = K.tube;
export function tubeR(s) {
  let r = TB[0];
  for (let i = 1; i + 1 < TB.length; i += 2) r += TB[i] * Math.sin((TAU * s) / TB[i + 1] + i * 0.9);
  return Math.max(K.tubeMin, r);
}
// the middle radius, and the widest it gets (m)
export const TUBE = TB[0],
  TUBE_MAX = TB.reduce((a, v, i) => (i % 2 ? a + v : a), TB[0]);

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
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
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
    for (const a of [X, Y, Z, TX, TY, TZ, TH, WANT, SUM]) a.pop();
  }
}
// the first sample
function start(x, y, z, th, g) {
  const l = Math.sqrt(1 + g * g);
  X.push(x);
  Y.push(y);
  Z.push(z);
  TX.push(Math.sin(th) / l);
  TY.push(-g / l);
  TZ.push(Math.cos(th) / l);
  TH.push(th);
  WANT.push(0);
  SUM.push(SUM[SUM.length - 1]);
  addCell(0);
}
// one more metre, the way (tx, ty, tz) says (a unit vector); k: how sharply it turns (1/m, + left), for its bank
function step(tx, ty, tz, k) {
  const i = X.length - 1;
  X.push(X[i] + tx);
  Y.push(Y[i] + ty);
  Z.push(Z[i] + tz);
  TX.push(tx);
  TY.push(ty);
  TZ.push(tz);
  TH.push(TH[i] + wrap(Math.atan2(tx, tz) - TH[i]));
  const w = Math.max(-K.roll[1], Math.min(K.roll[1], K.roll[0] * k)) * DEG;
  WANT.push(w);
  SUM.push(SUM[SUM.length - 1] + w);
  addCell(X.length - 1);
}
// lay `len` metres turning toward curvature k (1/m) and dropping `grade` m per m on the map, both eased in over K.ease
// metres
function lay(len, k, grade) {
  const k0 = kNow,
    g0 = gNow;
  let th = TH[TH.length - 1];
  for (let m = 1; m <= len; m++) {
    const f = Math.min(1, m / K.ease);
    kNow = k0 + (k - k0) * f;
    gNow = g0 + (grade - g0) * f;
    th += kNow;
    const h = th - kNow / 2,
      l = Math.sqrt(1 + gNow * gNow);
    step(Math.sin(h) / l, -gNow / l, Math.cos(h) / l, kNow);
  }
}
// a corkscrew: `turns` coils of radius r (m) round the way the run was going, one every `pitch` metres along it,
// turning the way dir says (1 left); it eases into and out of the coil over K.ease metres and then carries on the way
// it was going
function corkscrew(turns, r, pitch, dir) {
  const i = X.length - 1,
    A = [TX[i], TY[i], TZ[i]],
    // across (to the right of the way it goes) and up from it
    bl = Math.hypot(A[0], A[2]) || 1,
    B = [-A[2] / bl, 0, A[0] / bl],
    C = [B[1] * A[2] - B[2] * A[1], B[2] * A[0] - B[0] * A[2], B[0] * A[1] - B[1] * A[0]],
    c = pitch / TAU,
    w = 1 / Math.hypot(r, c),
    tilt = Math.asin(Math.min(0.95, r * w)),
    len = Math.round((turns * TAU) / w),
    e = K.ease,
    y0 = Y[i];
  let mx = 0,
    mz = 0;
  for (let m = 1; m <= len; m++) {
    const f = Math.max(0, Math.min(1, m / e, (len - m) / e)),
      a = tilt * f * f * (3 - 2 * f),
      p = dir * w * m,
      ca = Math.cos(a),
      sa = Math.sin(a),
      cp = Math.cos(p),
      sp = Math.sin(p);
    // its bank: a steady roll the way it coils, so the lines inside wind round with it
    step(
      ca * A[0] + sa * (cp * B[0] + sp * C[0]),
      ca * A[1] + sa * (cp * B[1] + sp * C[1]),
      ca * A[2] + sa * (cp * B[2] + sp * C[2]),
      (dir * K.roll[1] * f) / K.roll[0],
    );
    mx += X[X.length - 1];
    mz += Z[Z.length - 1];
  }
  spirals.push([mx / len, mz / len, y0, Y[Y.length - 1]]);
}
// does anything laid since `from` come too close to the run laid before it: two parts of the tube nearer than both
// their radii, their walls and K.gap between them
function clashes(from) {
  const wall = 2 * K.shell + K.gap;
  for (let j = from; j < X.length; j++) {
    const cx = Math.floor(X[j] / CELL),
      cz = Math.floor(Z[j] / CELL),
      rj = tubeR(S0 + j) + wall;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const c = grid.get(cx + a + ',' + (cz + b));
        if (!c) continue;
        for (const i of c) {
          if (i > j - 40) continue;
          const dx = X[i] - X[j],
            dy = Y[i] - Y[j],
            dz = Z[i] - Z[j],
            need = rj + tubeR(S0 + i);
          if (dx * dx + dy * dy + dz * dz < need * need) return true;
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
    grade = (g, len) => Math.max(0.03, Math.min(0.2, g * steep, spare / len));
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
      turn = ((((dir * (out - dev)) % TAU) + TAU) % TAU) / DEG;
    let deg = turn + 360;
    if (deg < K.spiral.deg[0]) deg += 360;
    const len = Math.round(deg * DEG * r),
      need = (2 * (TUBE_MAX + K.shell) + K.gap + 1) / (TAU * r),
      g = Math.max(need, Math.min(0.24, K.spiral.grade * steep));
    if (g * len > spare) return null;
    return () => {
      const a = X.length - 1;
      lay(len, dir / r, g);
      // its middle: the average over its last whole turn
      const n = X.length - 1,
        turn = Math.round(TAU * r);
      let mx = 0,
        mz = 0;
      for (let i = n - turn; i < n; i++) {
        mx += X[i];
        mz += Z[i];
      }
      spirals.push([mx / turn, mz / turn, Y[a], Y[n]]);
    };
  };
  // a corkscrew straight on the way it is going, dropping as it goes
  const cork = (dir) => {
    const C = K.corkscrew,
      turns = Math.round(range(C.turns)),
      r = range(C.radius),
      pitch = range(C.pitch);
    return () => {
      lay(20, 0, grade(C.grade, 20));
      corkscrew(turns, r, pitch, dir);
    };
  };
  // turn back toward downhill if heading well off it, then straight on down
  const straightDown = (len, g) => () => {
    if (Math.abs(dev) > 25 * DEG) lay(Math.round(Math.abs(dev) * 60), -Math.sign(dev) / 60, g);
    lay(len, 0, g);
  };
  const side = rnd() < 0.5 ? 1 : -1,
    r = rnd(),
    W = K.wild;
  if (high < H[0] + 4) tries.push(straightDown(80, 0.03));
  else if (high > H[1]) tries.push(spiral(side), spiral(-side), cork(side));
  else {
    // back toward downhill when heading well off it
    const dir = Math.abs(dev) > 70 * DEG ? -Math.sign(dev) : side;
    if (r < W[0]) {
      const len = Math.round(range(K.straight.len));
      tries.push(() => lay(len, 0, grade(K.straight.grade, len)));
    } else if (r < W[1]) {
      const deg = Math.min(range(K.bend.deg), (130 * DEG - dir * dev) / DEG),
        deg2 = Math.min(deg, (130 * DEG + dir * dev) / DEG);
      tries.push(bend(dir, Math.max(40, deg), range(K.bend.radius), K.bend.grade));
      tries.push(bend(-dir, Math.max(40, deg2), range(K.bend.radius), K.bend.grade));
    } else if (r < W[2]) {
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
    } else if (r < W[3]) tries.push(cork(side), cork(-side));
    else tries.push(spiral(side), spiral(-side), cork(side));
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
  start(0, y0 - S0 * 0.05, -S0, Math.PI, 0.05);
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
// The run at s metres along: its middle (x, y, z), the way it goes (tx, ty, tz), across it to the right (rx, ry, rz,
// level) and up from it (ux, uy, uz), all unit; its heading on the map th, bank, radius r; and how its way bends (kx,
// ky, kz: the change in its way per metre)
export function trackFrame(s, o) {
  ensureTrack(s + 2);
  const u = Math.max(0, Math.min(X.length - 2.001, s - S0)),
    i = Math.floor(u),
    t = u - i,
    j = i + 1;
  o.x = X[i] + (X[j] - X[i]) * t;
  o.y = Y[i] + (Y[j] - Y[i]) * t;
  o.z = Z[i] + (Z[j] - Z[i]) * t;
  let tx = TX[i] + (TX[j] - TX[i]) * t,
    ty = TY[i] + (TY[j] - TY[i]) * t,
    tz = TZ[i] + (TZ[j] - TZ[i]) * t;
  const tl = Math.hypot(tx, ty, tz);
  tx /= tl;
  ty /= tl;
  tz /= tl;
  o.tx = tx;
  o.ty = ty;
  o.tz = tz;
  const rl = Math.hypot(tx, tz) || 1;
  o.rx = -tz / rl;
  o.ry = 0;
  o.rz = tx / rl;
  // up = right x way
  o.ux = o.ry * tz - o.rz * ty;
  o.uy = o.rz * tx - o.rx * tz;
  o.uz = o.rx * ty - o.ry * tx;
  o.th = TH[i] + (TH[j] - TH[i]) * t;
  o.bank = bankAt(i) + (bankAt(j) - bankAt(i)) * t;
  o.r = tubeR(s);
  const k = Math.max(1, Math.min(X.length - 2, j));
  o.kx = (TX[k + 1] - TX[k - 1]) * 0.5;
  o.ky = (TY[k + 1] - TY[k - 1]) * 0.5;
  o.kz = (TZ[k + 1] - TZ[k - 1]) * 0.5;
  return o;
}
// a point on the tube's ice: phi radians round from its bottom (+ up its right side) at s metres along, `lift` metres
// in from the ice; out: x, y, z; the way out of the ice, into the tube (nx, ny, nz); the way round it as phi grows (ax,
// ay, az); and the run's frame there (trackFrame's fields)
export function onTube(s, phi, lift, o) {
  trackFrame(s, o);
  const sn = Math.sin(phi),
    cs = Math.cos(phi),
    r = o.r - lift;
  // from the middle out to the ice: down and to the side
  const ox = sn * o.rx - cs * o.ux,
    oy = sn * o.ry - cs * o.uy,
    oz = sn * o.rz - cs * o.uz;
  o.px = o.x;
  o.py = o.y;
  o.pz = o.z;
  o.x = o.px + ox * r;
  o.y = o.py + oy * r;
  o.z = o.pz + oz * r;
  o.nx = -ox;
  o.ny = -oy;
  o.nz = -oz;
  o.ax = cs * o.rx + sn * o.ux;
  o.ay = cs * o.ry + sn * o.uy;
  o.az = cs * o.rz + sn * o.uz;
  return o;
}
// the middle of the run at s metres along, its heading and bank (x, y, z, th, bank): trackFrame without the rest
export const trackPoint = (s, o) => trackFrame(s, o);
