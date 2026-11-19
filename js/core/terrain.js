// Rolling ice (v3-look47): a place whose frozen surface rises and falls. One height field, read by the game (where she
// stands, how a slope pulls her) and by the shaders (the ice, the line, her cloth); GLSL below is the same sum written
// out for the graphics chip, built from the same numbers, so the two always agree.
// The surface is long, low swells everywhere (CFG.waves.gentle), plus shorter waves (wavy) that come and go across the
// lake: two very long waves (patch) decide where, so in places the ice only rolls gently and in others it is wavy.
// Canyon (v3-look50, Mark: "a new landscape where it's like river ice canyon, bob sled down hill like course, natural
// max speed of 70 km/h ... undulating ice ... procedural"): a frozen river running downhill toward -z (north, up the
// screen) between rock walls, winding as a sum of long sine bends. Across it: a flat floor that curves up into banks
// like a bobsled run, the outside of each bend banked higher, then the canyon walls (steep rock with snow on top). The
// floor rolls with Rolling ice's waves, lower. All of it from CFG.canyon, in JS and GLSL alike.
// No three.js here: the game's rules use it too.
import { CFG } from '../config.js';

const W = CFG.waves,
  K = CFG.canyon,
  TAU = Math.PI * 2,
  BENDS = K.bends.map(([a, len, ph]) => [a, TAU / len, ph]),
  WK = TAU / K.width[2];
// each wave as [amplitude, x wave number, z wave number, phase]
const prep = (list) =>
  list.map(([a, len, deg, ph]) => {
    const r = (deg * Math.PI) / 180,
      k = TAU / len;
    return [a, Math.cos(r) * k, Math.sin(r) * k, ph];
  });
const GENTLE = prep(W.gentle),
  WAVY = prep(W.wavy),
  PATCH = prep(W.patch);

// how high the ice is (metres, times uWaves.value), and whether it is the canyon (1): uniforms the shaders share, and the
// game's own switches (both 0: flat)
export const uWaves = { value: 0 },
  uCanyon = { value: 0 },
  ICE_UNIFORMS = { uWaves, uCanyon };
// from a place (CFG.places): its waves, or the canyon
export const setTerrain = (place) => {
  uCanyon.value = place && place.canyon ? 1 : 0;
  uWaves.value = (!uCanyon.value && place && place.waves) || 0;
};
// is the ice anything but flat
export const terrainOn = () => uWaves.value > 0 || uCanyon.value > 0;

const sum = (list, x, z) => {
  let h = 0;
  for (const w of list) h += w[0] * Math.sin(w[1] * x + w[2] * z + w[3]);
  return h;
};
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// the height field before uWaves; det: how much of the wavy part (1 all)
function raw(x, z, det = 1) {
  const m = det * smooth(W.mix[0], W.mix[1], sum(PATCH, x, z) / PATCH.length),
    // the wavy crests are bent a little, so they do not run dead straight
    wx = x + W.warp[0] * Math.sin(z * W.warp[1] + 1.3),
    wz = z + W.warp[0] * Math.sin(x * W.warp[2] + 0.4);
  return sum(GENTLE, x, z) + m * sum(WAVY, wx, wz);
}
// ---- the canyon
// the run's centre line (x for a z), and how it slopes and curves
export const canyonCentre = (z) => {
  let c = 0;
  for (const [a, k, ph] of BENDS) c += a * Math.sin(k * z + ph);
  return c;
};
const centreD = (z) => {
  let c = 0;
  for (const [a, k, ph] of BENDS) c += a * k * Math.cos(k * z + ph);
  return c;
};
const centreDD = (z) => {
  let c = 0;
  for (const [a, k, ph] of BENDS) c -= a * k * k * Math.sin(k * z + ph);
  return c;
};
// half the width of the run at z
export const canyonWidth = (z) => K.width[0] + K.width[1] * Math.sin(z * WK + 0.7);
// how far (x, z) is across the run from its centre line (metres, + toward +x)
export const canyonOff = (x, z) => (x - canyonCentre(z)) / Math.sqrt(1 + centreD(z) ** 2);
// the way across the run at z (a unit vector in x, z, toward +x), into out
export function canyonAcross(z, out) {
  const c1 = centreD(z),
    sq = Math.sqrt(1 + c1 * c1);
  out[0] = 1 / sq;
  out[1] = -c1 / sq;
  return out;
}
const rock = (x, z) =>
  0.6 * Math.sin(0.31 * z + 0.23 * x) +
  0.3 * Math.sin(0.77 * z - 0.61 * x + 1.1) +
  0.15 * Math.sin(1.9 * z + 1.3 * x + 2.3);
function canyon(x, z) {
  const c1 = centreD(z),
    sq = Math.sqrt(1 + c1 * c1),
    d = (x - canyonCentre(z)) / sq,
    dd = Math.abs(d),
    w = canyonWidth(z),
    q = Math.min(K.rise, (dd - 0.5 * w) / (0.5 * w));
  // the floor, curving up into the banks and on up the valley side
  let h = q <= 0 ? 0 : q <= 1 ? K.bank * q * q : K.bank * (2 * q - 1);
  // the outside of a bend banked higher (the inside stays as it is)
  h += K.bend * Math.max(0, (-centreDD(z) / (sq * sq * sq)) * d) * (1 - smooth(w, w + 4, dd));
  // the canyon walls, rough rock
  h += K.cliff[0] * smooth(w - 1, w + K.cliff[1], dd) + K.rough * rock(x, z) * smooth(w, w + 3, dd);
  // the floor rolls; and the whole run goes downhill toward -z
  return h + K.undulate * raw(x, z) * (1 - smooth(0.6 * w, w, dd)) + K.grade * z;
}

// the height of the ice at (x, z), metres
export const iceY = (x, z) => (uCanyon.value ? canyon(x, z) : uWaves.value ? uWaves.value * raw(x, z) : 0);
// its slope at (x, z): out[0] = rise per metre along x, out[1] along z
export function iceSlope(x, z, out) {
  if (!terrainOn()) {
    out[0] = out[1] = 0;
    return out;
  }
  const e = 0.25;
  out[0] = (iceY(x + e, z) - iceY(x - e, z)) / (2 * e);
  out[1] = (iceY(x, z + e) - iceY(x, z - e)) / (2 * e);
  return out;
}

// A skater's reflection: the mirror in the ice under her (on rolling ice, in its slope there), from S (x, z, gy, gx,
// gz), written into M (anything with a three.js Matrix4's set()).
export function iceMirror(S, M) {
  const gx = S.gx || 0,
    gz = S.gz || 0,
    l = Math.hypot(gx, 1, gz),
    nx = -gx / l,
    ny = 1 / l,
    nz = -gz / l,
    d2 = 2 * (nx * S.x + ny * (S.gy || 0) + nz * S.z);
  return M.set(
    1 - 2 * nx * nx,
    -2 * nx * ny,
    -2 * nx * nz,
    d2 * nx,
    -2 * ny * nx,
    1 - 2 * ny * ny,
    -2 * ny * nz,
    d2 * ny,
    -2 * nz * nx,
    -2 * nz * ny,
    1 - 2 * nz * nz,
    d2 * nz,
    0,
    0,
    0,
    1,
  );
}

// GLSL (p = world x, z; the shader using it gets ICE_UNIFORMS):
//   iceRawD(p, d)  Rolling ice before uWaves, with only d of the wavy part (the far rim of the drawn ice, where its
//                  rings are too far apart for short waves)
//   canyonH(p, d, und, wall)  the canyon's height; und: how much of it is the floor's rolling, wall: 0 on the run, 1 on
//                  the rock
//   iceH(p, d)     the height of the ice, whichever it is
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : v.toFixed(6));
const glslSum = (list, p) =>
  list.map((w) => `${f(w[0])} * sin(${f(w[1])} * ${p}.x + ${f(w[2])} * ${p}.y + ${f(w[3])})`).join(' + ');
const bendSum = (fn) => BENDS.map(fn).join(' + ');
export const ICE_GLSL = `
uniform float uWaves, uCanyon;
float iceRawD(vec2 p, float d) {
  float m = d * smoothstep(${f(W.mix[0])}, ${f(W.mix[1])}, (${glslSum(PATCH, 'p')}) / ${f(PATCH.length)});
  vec2 q = p + ${f(W.warp[0])} * vec2(sin(p.y * ${f(W.warp[1])} + 1.3), sin(p.x * ${f(W.warp[2])} + 0.4));
  return ${glslSum(GENTLE, 'p')} + m * (${glslSum(WAVY, 'q')});
}
float iceRaw(vec2 p) { return iceRawD(p, 1.0); }
float canyonH(vec2 p, float det, out float und, out float wall) {
  float z = p.y;
  float c0 = ${bendSum(([a, k, ph]) => `${f(a)} * sin(${f(k)} * z + ${f(ph)})`)};
  float c1 = ${bendSum(([a, k, ph]) => `${f(a * k)} * cos(${f(k)} * z + ${f(ph)})`)};
  float c2 = -(${bendSum(([a, k, ph]) => `${f(a * k * k)} * sin(${f(k)} * z + ${f(ph)})`)});
  float sq = sqrt(1.0 + c1 * c1), d = (p.x - c0) / sq, dd = abs(d);
  float w = ${f(K.width[0])} + ${f(K.width[1])} * sin(z * ${f(WK)} + 0.7);
  float q = min(${f(K.rise)}, (dd - 0.5 * w) / (0.5 * w));
  float h = q <= 0.0 ? 0.0 : (q <= 1.0 ? ${f(K.bank)} * q * q : ${f(K.bank)} * (2.0 * q - 1.0));
  h += ${f(K.bend)} * max(0.0, -c2 / (sq * sq * sq) * d) * (1.0 - smoothstep(w, w + 4.0, dd));
  float rk = 0.6 * sin(0.31 * z + 0.23 * p.x) + 0.3 * sin(0.77 * z - 0.61 * p.x + 1.1) + 0.15 * sin(1.9 * z + 1.3 * p.x + 2.3);
  h += ${f(K.cliff[0])} * smoothstep(w - 1.0, w + ${f(K.cliff[1])}, dd) + ${f(K.rough)} * rk * smoothstep(w, w + 3.0, dd);
  wall = smoothstep(w - 1.2, w + 3.5, dd);
  und = ${f(K.undulate)} * iceRawD(p, det) * (1.0 - smoothstep(0.6 * w, w, dd));
  return h + und + ${f(K.grade)} * z;
}
float iceH(vec2 p, float d) {
  float u, w;
  return uCanyon > 0.5 ? canyonH(p, d, u, w) : uWaves * iceRawD(p, d);
}`;
