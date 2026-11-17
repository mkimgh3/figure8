// Twizzles driven by the finger: she turns exactly as far as the finger circles, travelling the whole time and keeping her speed.
import { CFG } from '../config.js';
import { TAU, dimin } from '../core/math.js';
export function createTwirl(S, api, seed) {
  const st = { angle: 0, goal: seed, held: true, rel: 0, draw: 0 };
  return {
    id: 'twirl',
    steer: 0.7,
    state: st,
    start() {
      api.ensureSpeed(3.5);
    },
    rotate(d) {
      st.goal += d;
    },
    // finish facing cleanly forward or backward
    release() {
      if (!st.held) return;
      st.held = false;
      st.goal = Math.round(st.goal / Math.PI) * Math.PI;
    },
    update(dt) {
      api.ensureSpeed(3.2);
      st.angle += (st.goal - st.angle) * (1 - Math.exp(-18 * dt));
      S.yawX = st.angle;
      st.draw += (st.angle - st.draw) * (1 - Math.exp(-7 * dt));
      const t = Math.abs(st.angle) / TAU;
      if (t > 0.6) api.emit('say', { big: t.toFixed(1) + '×', small: 'twizzles', hold: 0.3 });
      if (!st.held) {
        st.rel += dt;
        if (Math.abs(st.goal - st.angle) < 0.06 || st.rel > 0.6) return false;
      }
      return true;
    },
    end() {
      const turns = Math.abs(st.goal) / TAU,
        P = CFG.points;
      if (Math.round(st.goal / Math.PI) % 2 !== 0) S.back = !S.back;
      api.emit('element', {
        kind: 'twizzles',
        name: 'Twizzles',
        detail: turns.toFixed(1) + ' turns',
        base: dimin(P.twizzles[0], turns, P.twizzles[1]),
        counted: turns >= 1,
      });
    },
    // each turn draws a loop: wide and round, following a smoothed angle so the line curls instead of zigzagging
    // The sway is kept small against her speed (never more than about a third of it sideways), so the line weaves and never folds into points.
    blade(out, yaw) {
      const a = yaw - st.angle + st.draw,
        w = (st.w = (st.w || 0) + (Math.abs(st.goal - st.draw) * 7 - (st.w || 0)) * 0.08);
      const r =
        Math.min(0.5, (0.33 * api.speed()) / Math.max(w, 2)) *
        Math.min(1, Math.abs(st.draw) / 1.5) *
        (st.held ? 1 : Math.max(0, 1 - st.rel / 0.5));
      out.x += Math.sin(a) * r;
      out.z += Math.cos(a) * r;
    },
    spinRate: () => Math.abs(st.goal - st.angle) * 18,
    pose(T, kit) {
      kit.set({
        lean: 0,
        bodyY: kit.HIP,
        fL: 0,
        aLx: -0.5,
        aRx: -0.5,
        aLe: -2.1,
        aRe: -2.1,
        aLz: 0.25,
        aRz: -0.25,
        lRx: 0,
        lRk: 0.05,
        lRz: 0,
        lLx: -0.3,
        lLk: 1.3,
        lLz: 0.12,
      });
      return 18;
    },
  };
}
