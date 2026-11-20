// Moves that last as long as the right thumb stays down: spiral, hydroblade, spread eagle, Biellmann. Started by both
// thumbs circling (input/tricks.js, CFG.two). Since v3-look61 the left thumb steers her, pushes and eases off in all of
// them as in plain skating (until then the spiral and hydroblade coasted, slowing, and steered less).
import { CFG } from '../config.js';
import { dimin } from '../core/math.js';
const P = CFG.points;

function held(S, api, o) {
  const st = { t: 0, held: true };
  return Object.assign(
    {
      id: o.id,
      steer: 1,
      state: st,
      leanIntoTurn: o.leanIntoTurn,
      start() {
        api.ensureSpeed(o.minSpeed);
        api.emit('say', { big: o.name, small: '', hold: 0.7 });
      },
      release() {
        st.held = false;
      },
      update(dt, steer) {
        st.t += dt;
        if (o.tick) o.tick(dt, steer);
        // every held move lasts minTime; after that it ends when the right thumb lifts, or after CFG.held.maxTime seconds
        if (st.t < o.minTime) return true;
        return st.held && st.t <= CFG.held.maxTime;
      },
      // how: see endMove in skater.js. Scored by the time held, so one cut short is already worth less; a crash
      // out of it counts for nothing
      end(how) {
        api.emit('element', {
          kind: o.id,
          name: o.name,
          detail: st.t.toFixed(1) + ' seconds held',
          base: dimin(P[o.id][0], st.t, P[o.id][1]),
          counted: how !== 'crash',
        });
      },
    },
    o.extra(st),
  );
}
export const createSpiral = (S, api) =>
  held(S, api, {
    id: 'spiral',
    name: 'Spiral',
    minSpeed: 3,
    minTime: 1.0,
    extra: () => ({
      blade(out) {
        out.width = 2.6;
      },
      pose(T, kit) {
        kit.set(kit.WIDE);
        kit.set({
          lean: 1.2,
          bodyY: kit.HIP,
          fL: 0,
          lRx: -1.2,
          lRk: 0.05,
          lRz: 0,
          lLx: 0.55,
          lLk: 0,
          lLz: 0,
          aLx: 0.35,
          aRx: 0.35,
        });
      },
    }),
  });
// dir: 1 curves to her right (screen-clockwise), -1 to her left
export const createEagle = (S, api, dir) =>
  held(S, api, {
    id: 'eagle',
    name: 'Spread eagle',
    minSpeed: 3,
    minTime: 1.0,
    leanIntoTurn: true,
    // curves on its own only when the thumb is not steering
    tick(dt, steer) {
      if (Math.hypot(steer.x, steer.y) < 0.15) api.rotateVel(-dir * 0.45 * dt);
    },
    extra: () => ({
      // two blades, two tracks
      blade(out) {
        out.double = true;
      },
      pose(T, kit) {
        kit.set(kit.WIDE);
        kit.set({
          side: dir,
          lean: -0.12,
          bodyY: 0.83,
          lLx: 0.12,
          lRx: 0.12,
          lLk: 0.08,
          lRk: 0.08,
          lLz: -0.5,
          lRz: 0.5,
        });
      },
    }),
  });
export const createHydro = (S, api, dir) =>
  held(S, api, {
    id: 'hydro',
    name: 'Hydroblade',
    minSpeed: 3,
    minTime: 1.2,
    // curves on its own, low on its edge, only when the thumb is not steering
    tick(dt, steer) {
      if (Math.hypot(steer.x, steer.y) < 0.15) api.rotateVel(-dir * 1.5 * dt);
    },
    extra: () => ({
      blade(out) {
        out.width = 2;
      },
      pose(T, kit) {
        kit.set({
          roll: 0.8 * dir,
          lean: 0.35,
          bodyY: 0.47,
          fL: 0,
          lRx: -1.65,
          lRk: 2.2,
          lRz: 0,
          lLx: 0.75,
          lLk: 0.05,
          lLz: -0.35 * dir,
          aLz: -1.3,
          aRz: 1.3,
          aLx: -0.3,
          aRx: -0.3,
          aLe: -0.1,
          aRe: -0.1,
        });
      },
    }),
  });
// Biellmann (v3-look61, Mark: "the move where one leg is raised behind over head and held with hand raised up grabbing
// angle"): gliding on one foot, the free leg drawn up behind her until the blade is over her head, both hands up over
// it holding the blade, back arched.
export const createBiellmann = (S, api) =>
  held(S, api, {
    id: 'biellmann',
    name: 'Biellmann',
    minSpeed: 3,
    minTime: 1.0,
    extra: () => ({
      blade(out) {
        out.width = 1.2;
      },
      pose(T, kit) {
        kit.set({
          lean: 0.3,
          bodyY: kit.HIP,
          fL: 0,
          lLx: 2.95,
          lLk: 1.05,
          lLz: 0,
          lRx: 0,
          lRk: 0.08,
          lRz: 0,
          aLz: -2.85,
          aRz: 2.85,
          aLx: -0.95,
          aRx: -0.95,
          aLe: -0.7,
          aRe: -0.7,
        });
      },
    }),
  });
