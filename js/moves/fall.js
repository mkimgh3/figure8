// A bad landing: she goes down, slides, and gets straight back up with a few seconds of quick push-offs.
import { CFG } from '../config.js';
export function createFall(S, api) {
  let t = CFG.fall.seconds;
  return {
    id: 'fall',
    steer: 0,
    update(dt) {
      const f = Math.exp(-2.2 * dt);
      S.vx *= f;
      S.vz *= f;
      t -= dt;
      return t > 0;
    },
    end() {
      S.boostT = S.clock - S.fallEndT > CFG.fall.repeatWindow ? CFG.fall.boostSeconds : 0; // one assisted recovery; falling again straight away gets none
      S.fallEndT = S.clock;
      api.ensureSpeed(3.5);
    },
    pose(T, kit) {
      if (t > 0.42)
        kit.set({
          lean: -0.55,
          bodyY: 0.2,
          fL: 0,
          fR: 0,
          lLx: -0.95,
          lRx: -0.8,
          lLk: 0.5,
          lRk: 0.25,
          lLz: -0.12,
          lRz: 0.12,
          aLx: 0.9,
          aRx: 0.9,
          aLz: -0.45,
          aRz: 0.45,
          aLe: -0.2,
          aRe: -0.2,
        });
      else kit.set({ lean: 0.45, bodyY: 0.62, lLx: -1.2, lRx: -1.2, lLk: 1.5, lRk: 1.5 });
      return 17;
    },
  };
}
