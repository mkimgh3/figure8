// A stumble (Infinite and Tutorial modes): a bad landing she rides out instead of falling. She lurches forward, throws
// her arms out to catch her balance, wobbles side to side and skates on, a little slower. The left thumb still steers.
import { CFG } from '../config.js';
export function createStumble(S) {
  const T = CFG.stumble.seconds;
  let t = 0;
  // which way the first wobble goes
  const side = Math.random() < 0.5 ? -1 : 1;
  return {
    id: 'stumble',
    steer: 0.5,
    update(dt) {
      t += dt;
      const f = Math.exp(-0.5 * dt);
      S.vx *= f;
      S.vz *= f;
      return t < T;
    },
    pose(P, kit) {
      // 0..1 over the stumble; the wobble dies away as she finds her feet
      const u = t / T,
        w = Math.sin(u * Math.PI * 3) * (1 - u) * side;
      kit.set({
        lean: 0.6 * (1 - u) + 0.15,
        bodyY: kit.HIP - 0.16 * Math.sin(Math.min(1, u * 2) * Math.PI * 0.5) * (1 - u * 0.6),
        roll: 0.32 * w,
        fL: 1,
        fR: 0,
        lLx: -0.55,
        lLk: 0.95,
        lLz: -0.08,
        lRx: 0.45 + 0.3 * w,
        lRk: 0.35,
        lRz: 0.25,
        aLz: -1.9 - 0.5 * w,
        aRz: 1.6 - 0.5 * w,
        aLx: 0.6,
        aRx: 0.3,
        aLe: -0.25,
        aRe: -0.5,
      });
      return 16;
    },
  };
}
