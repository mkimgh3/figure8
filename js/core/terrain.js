// Rolling ice (v3-look47): a place whose frozen surface rises and falls. One height field, read by the game (where she
// stands, how a slope pulls her) and by the shaders (the ice, the line, her cloth); GLSL below is the same sum written
// out for the graphics chip, built from the same numbers, so the two always agree.
// The surface is long, low swells everywhere (CFG.waves.gentle), plus shorter waves (wavy) that come and go across the
// lake: two very long waves (patch) decide where, so in places the ice only rolls gently and in others it is wavy.
// No three.js here: the game's rules use it too.
import { CFG } from '../config.js';

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

// how high the ice is (metres, times uWaves.value): a uniform the shaders share, and the game's own switch (0: flat)
export const uWaves = { value: 0 };
export const setWaves = (a) => {
  uWaves.value = a || 0;
};

const sum = (list, x, z) => {
  let h = 0;
  for (const w of list) h += w[0] * Math.sin(w[1] * x + w[2] * z + w[3]);
  return h;
};
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// the height field before uWaves
function raw(x, z) {
  const m = smooth(W.mix[0], W.mix[1], sum(PATCH, x, z) / PATCH.length),
    // the wavy crests are bent a little, so they do not run dead straight
    wx = x + W.warp[0] * Math.sin(z * W.warp[1] + 1.3),
    wz = z + W.warp[0] * Math.sin(x * W.warp[2] + 0.4);
  return sum(GENTLE, x, z) + m * sum(WAVY, wx, wz);
}
// the height of the ice at (x, z), metres
export const iceY = (x, z) => (uWaves.value ? uWaves.value * raw(x, z) : 0);
// its slope at (x, z): out[0] = rise per metre along x, out[1] along z
export function iceSlope(x, z, out) {
  if (!uWaves.value) {
    out[0] = out[1] = 0;
    return out;
  }
  const e = 0.25,
    k = uWaves.value / (2 * e);
  out[0] = (raw(x + e, z) - raw(x - e, z)) * k;
  out[1] = (raw(x, z + e) - raw(x, z - e)) * k;
  return out;
}

// GLSL: float iceRaw(vec2 p), the height before uWaves (p = world x, z); iceRawD(p, d) with only d of the wavy part
// (the far rim of the rolling ice, where its rings are too far apart for short waves)
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : v.toFixed(6));
const glslSum = (list, p) =>
  list.map((w) => `${f(w[0])} * sin(${f(w[1])} * ${p}.x + ${f(w[2])} * ${p}.y + ${f(w[3])})`).join(' + ');
export const ICE_GLSL = `
float iceRawD(vec2 p, float d) {
  float m = d * smoothstep(${f(W.mix[0])}, ${f(W.mix[1])}, (${glslSum(PATCH, 'p')}) / ${f(PATCH.length)});
  vec2 q = p + ${f(W.warp[0])} * vec2(sin(p.y * ${f(W.warp[1])} + 1.3), sin(p.x * ${f(W.warp[2])} + 0.4));
  return ${glslSum(GENTLE, 'p')} + m * (${glslSum(WAVY, 'q')});
}
float iceRaw(vec2 p) { return iceRawD(p, 1.0); }`;
