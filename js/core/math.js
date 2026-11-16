// How even a run of numbers is: 1 when they are all alike, falling to 0 as they scatter. Used to judge the rhythm of a scribble.
export const evenness = (a) => { if (a.length < 2) return 0.5; const m = a.reduce((x, y) => x + y, 0) / a.length; if (m <= 0) return 0; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length); return Math.max(0, Math.min(1, 1 - 2.2 * sd / m)); };
// Diminishing returns: approaches `most` as x grows, quickly at first. Used for spins, steps and held moves.
export const dimin = (most, x, quick) => most * (1 - Math.exp(-Math.max(0, x) / quick));
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const tri = (u) => { u -= Math.floor(u); return 4 * Math.abs(u - 0.5) - 1; };
