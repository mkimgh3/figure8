// Diminishing returns: approaches `most` as x grows, quickly at first. Used for twizzles, choreography and held moves.
export const dimin = (most, x, quick) => most * (1 - Math.exp(-Math.max(0, x) / quick));
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
