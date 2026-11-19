// Rolling ice (v3-look47): a place whose frozen surface rises and falls. One height field, read by the game (where she
// stands, how a slope pulls her) and by the shaders (the ice, the line, her cloth); GLSL below is the same sum written
// out for the graphics chip, built from the same numbers, so the two always agree.
// The surface is long, low swells everywhere (CFG.waves.gentle), plus shorter waves (wavy) that come and go across the
// lake: two very long waves (patch) decide where, so in places the ice only rolls gently and in others it is wavy.
// The Canyon (since v3-look56 an ice trough on pillars, core/track.js) is a height field too, but only near her: the
// shaders draw its ice as a mesh of its own (render/slide.js), and the little that needs the height of the ice under a
// point in a shader (her clothes, kept above it) gets the ice's plane under her (uIceP, uIceG, set by setIcePlane).
// No three.js here: the game's rules use it too.
import { CFG } from '../config.js';
import { trackY } from './track.js';

const W = CFG.waves,
  TAU = Math.PI * 2;
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
// game's own switches (both 0: flat). uIceP, uIceG: in the Canyon, the plane of the ice under her (a point x, y, z on
// it, and its slope along x and z)
export const uWaves = { value: 0 },
  uCanyon = { value: 0 },
  uIceP = { value: { x: 0, y: 0, z: 0 } },
  uIceG = { value: { x: 0, y: 0 } },
  ICE_UNIFORMS = { uWaves, uCanyon, uIceP, uIceG };
// from a place (CFG.places): its waves, or the canyon
export const setTerrain = (place) => {
  uCanyon.value = place && place.canyon ? 1 : 0;
  uWaves.value = (!uCanyon.value && place && place.waves) || 0;
};
// the plane of the ice under her (S: x, z, gy, gx, gz), for the shaders
export function setIcePlane(S) {
  const p = uIceP.value;
  p.x = S.x;
  p.y = S.gy;
  p.z = S.z;
  uIceG.value.x = S.gx;
  uIceG.value.y = S.gz;
}
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
// the height of the ice at (x, z), metres
export const iceY = (x, z) => (uCanyon.value ? trackY(x, z) : uWaves.value ? uWaves.value * raw(x, z) : 0);
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
//   iceH(p, d)     the height of the ice: Rolling ice's, or in the Canyon the plane of the ice under her
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : v.toFixed(6));
const glslSum = (list, p) =>
  list.map((w) => `${f(w[0])} * sin(${f(w[1])} * ${p}.x + ${f(w[2])} * ${p}.y + ${f(w[3])})`).join(' + ');
export const ICE_GLSL = `
uniform float uWaves, uCanyon;
uniform vec3 uIceP;
uniform vec2 uIceG;
float iceRawD(vec2 p, float d) {
  float m = d * smoothstep(${f(W.mix[0])}, ${f(W.mix[1])}, (${glslSum(PATCH, 'p')}) / ${f(PATCH.length)});
  vec2 q = p + ${f(W.warp[0])} * vec2(sin(p.y * ${f(W.warp[1])} + 1.3), sin(p.x * ${f(W.warp[2])} + 0.4));
  return ${glslSum(GENTLE, 'p')} + m * (${glslSum(WAVY, 'q')});
}
float iceRaw(vec2 p) { return iceRawD(p, 1.0); }
float iceH(vec2 p, float d) {
  return uCanyon > 0.5 ? uIceP.y + uIceG.x * (p.x - uIceP.x) + uIceG.y * (p.y - uIceP.z) : uWaves * iceRawD(p, d);
}`;
