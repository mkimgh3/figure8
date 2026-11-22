// Quick moves: the three-turn and the split leap do not interrupt the skating; the hockey stop ends it.
import { CFG } from '../config.js';
import { clamp, sstep, wrap } from '../core/math.js';
// Three-turn: a half turn on one foot. It swaps forward and backward skating, which changes which jumps are on offer.
// Toe kick (v3-look61; the flick down since v3-look76): she reaches her free leg back and taps its toe pick into the
// ice behind her, arms gathering, ready to spring. A jump within CFG.toe.window seconds goes higher, and skating
// backward it is a toe loop (skater.js). The left thumb steers and pushes all the while.
export function createToeKick(S, api) {
  let t = 0;
  const T_ALL = 0.42;
  return {
    id: 'toe',
    steer: 1,
    start() {
      S.toeUntil = S.clock + CFG.toe.window;
    },
    update(dt) {
      t += dt;
      return t < T_ALL;
    },
    pose(T, kit) {
      // reach back, pick, and come up out of it
      const k = Math.sin(Math.PI * clamp(t / T_ALL, 0, 1));
      kit.set({
        lean: 0.1 + 0.25 * k,
        bodyY: kit.HIP - 0.08 * k,
        fL: 0,
        lRx: 0.15 + 0.75 * k,
        lRk: 0.2 + 0.3 * k,
        lLx: -0.15 * k,
        lLk: 0.15 + 0.45 * k,
        aLx: -0.5 * k,
        aRx: -0.5 * k,
        aLz: -0.9 + 0.3 * k,
        aRz: 0.9 - 0.3 * k,
        aLe: -0.3 - 0.6 * k,
        aRe: -0.3 - 0.6 * k,
      });
      return 22;
    },
  };
}
// The three-turn: no gesture since v3-look76 (spinning half way round in choreography and letting go swaps forward and
// backward now); kept for its scoring and tests.
export function createTurn(S, api) {
  let t = 0;
  const T_ALL = 0.45,
    dir = S.turn > 0 ? 1 : -1;
  return {
    id: 'turn',
    steer: 1,
    update(dt) {
      t += dt;
      const u = clamp(t / T_ALL, 0, 1);
      S.yawX = dir * Math.PI * sstep(0.15, 0.85, u);
      return u < 1;
    },
    // how: see endMove in skater.js. Cut short before half way round, she has not turned; past it she has, and it is
    // worth the share of the turn she made (nothing if she crashed)
    end(how) {
      const done = how ? clamp(t / T_ALL, 0, 1) : 1;
      if (done < 0.5) return;
      S.back = !S.back;
      api.emit('element', {
        kind: 'turn',
        name: 'Three-turn',
        detail: S.back ? 'now backward' : 'now forward',
        base: CFG.points.turn * done,
        counted: how !== 'crash',
      });
    },
    blade(out) {
      const u = clamp(t / T_ALL, 0, 1),
        z = 0.35 * Math.abs(Math.sin(Math.PI * 2 * u)) * dir;
      out.x += Math.cos(S.facing) * z;
      out.z -= Math.sin(S.facing) * z;
    },
    pose(T, kit) {
      kit.set({
        lean: 0.1,
        bodyY: kit.HIP - 0.03,
        fL: 0,
        lRx: -0.3,
        lRk: 0.35,
        lLx: 0.5,
        lLk: 0.5,
        aLx: -1.1 * dir,
        aRx: 1.1 * dir,
        aLz: -0.9,
        aRz: 0.9,
        aLe: -0.2,
        aRe: -0.2,
      });
      return 18;
    },
  };
}
// Hockey stop: she throws both blades side-on to her travel and skids to a halt in a burst of snow, arms flung wide.
// dir: which way she turns her body, 1 or -1
export function createStop(S, api, dir) {
  const K = CFG.stop,
    st = { t: 0, stopped: 0 },
    v0 = api.speed(),
    a = Math.atan2(S.vx, S.vz),
    decel = Math.max(K.decel, v0 / K.maxTime);
  return {
    id: 'stop',
    steer: 0,
    holdFacing: true,
    state: st,
    start() {
      api.emit('say', { big: 'Hockey stop', small: '', hold: 0.6 });
    },
    update(dt) {
      st.t += dt;
      const v = Math.max(0, api.speed() - decel * dt);
      S.vx = Math.sin(a) * v;
      S.vz = Math.cos(a) * v;
      if (v <= 0 && !st.stopped) st.stopped = st.t;
      const up = st.stopped ? sstep(st.stopped + K.hold, st.stopped + K.hold + K.rise, st.t) : 0;
      S.yawX = ((dir * Math.PI) / 2) * sstep(0, K.snap, st.t) * (1 - up);
      return up < 1;
    },
    // how: see endMove in skater.js. Cut short, it is worth the share of her speed she had shed, and counts only past
    // half of it (never after a crash)
    end(how) {
      const shed = st.stopped || !how ? 1 : clamp(1 - api.speed() / Math.max(v0, 0.1), 0, 1);
      api.emit('element', {
        kind: 'stop',
        name: 'Hockey stop',
        detail: 'from ' + Math.round(v0 * 3.6) + ' km/h',
        base: CFG.points.stop * clamp(v0 / CFG.steer.maxSpeed, 0.25, 1) * shed,
        counted: how !== 'crash' && shed >= 0.5,
      });
    },
    skid: () => (st.stopped ? 0 : 1),
    blade(out) {
      out.width = 3.2;
    },
    // the arms fly up and out in the first instant, then settle wide; knees deep, weight thrown back against the skid
    pose(T, kit) {
      const hit = 1 - sstep(0.1, 0.4, st.t);
      kit.set({
        roll: -0.32 * dir,
        lean: 0.14,
        bodyY: kit.HIP - 0.15,
        fL: 1,
        fR: 1,
        lLx: -0.62,
        lRx: -0.62,
        lLk: 0.95,
        lRk: 0.95,
        lLz: -0.24,
        lRz: 0.24,
        aLz: -1.62 - 0.55 * hit,
        aRz: 1.62 + 0.55 * hit,
        aLx: 0.1,
        aRx: 0.1,
        aLe: -0.05,
        aRe: -0.05,
      });
      return 34;
    },
  };
}
// Split leap: a low, travelling leap with the legs in a split. No rotation, no landing to judge.
export function createLeap(S, api) {
  let t = 0;
  const T_ALL = 0.7;
  const u = () => clamp(t / T_ALL, 0, 1);
  return {
    id: 'leap',
    steer: 0.6,
    start() {
      api.ensureSpeed(4);
      api.emit('say', { big: 'Split leap', small: '', hold: 0.6 });
    },
    update(dt) {
      t += dt;
      const x = u();
      if (x > 0.15 && x < 0.85) S.visY = 0.6 * Math.sin(((x - 0.15) / 0.7) * Math.PI);
      return x < 1;
    },
    // how: see endMove in skater.js. Cut short, it counts only once she was past the top of the leap, for the share
    // of it she made (never after a crash)
    end(how) {
      const done = how ? u() : 1;
      api.emit('element', {
        kind: 'leap',
        name: 'Split leap',
        detail: 'travelling',
        base: CFG.points.leap * done,
        counted: how !== 'crash' && done >= 0.5,
      });
    },
    blade(out) {
      const x = u();
      out.pen = x < 0.15 || x > 0.85;
    },
    airborne: () => {
      const x = u();
      return x > 0.15 && x < 0.85;
    },
    pose(T, kit) {
      const x = u();
      if (x > 0.12 && x < 0.88)
        kit.set({
          lean: 0.05,
          bodyY: kit.HIP,
          fL: 0,
          fR: 0,
          aLz: -2.3,
          aRz: 2.3,
          aLx: 0,
          aRx: 0,
          aLe: -0.1,
          aRe: -0.1,
          lLx: -1.25,
          lRx: 1.15,
          lLk: 0.08,
          lRk: 0.08,
          lLz: 0,
          lRz: 0,
        });
      else kit.set({ lean: 0.3, bodyY: kit.HIP - 0.12, lLx: -0.6, lRx: -0.6, lLk: 0.9, lRk: 0.9 });
      return 20;
    },
  };
}

// The butterfly (v3-look80 as the "change leap flip", v3-look81 the switch leap; v3-look82, Mark: "i want the move like
// where the body actually leaps with torso bent doing 360 and then landing"): the flick up while she skates a tight curve
// one way is this instead of the split leap. She sinks deep, her chest swinging down over her knees and her arms back,
// and springs up with her body level, face to the ice, her legs scissoring (one kicked up behind, the other low, then
// switching through) and her arms spread like wings, turning once right round in the air the way she was curving, and
// lands on one foot, the other stretched out behind her, arms open, skating on the way she was.
export function createChangeLeap(S, api) {
  const C = CFG.changeLeap,
    dir = (S.arc || S.turn) > 0 ? 1 : -1;
  let t = 0,
    y = 0;
  const u = () => clamp(t / C.time, 0, 1),
    // how far through her time in the air, 0 on the ice before, 1 back on it
    air = (x) => clamp((x - C.up) / (C.down - C.up), 0, 1);
  return {
    id: 'changeleap',
    steer: 0.5,
    start() {
      api.ensureSpeed(4);
      api.emit('say', { big: 'Butterfly', small: '', hold: 0.7 });
    },
    update(dt) {
      t += dt;
      const a = air(u());
      if (a > 0 && a < 1) S.visY = C.height * Math.sin(a * Math.PI);
      y = dir * 2 * Math.PI * sstep(0.06, 0.94, a);
      S.yawX = y;
      return u() < 1;
    },
    // how: see endMove in skater.js. She ends facing the nearest way along her path: right round, as she was; cut short
    // past half way, the other way (forward and backward swap), her body easing the rest of the way. Cut short, it counts
    // only once she was past the top, for the share of it she made
    end(how) {
      const done = how ? u() : 1,
        k = Math.round(y / Math.PI);
      if (Math.abs(k) % 2 === 1) S.back = !S.back;
      S.flipYaw = wrap(y - k * Math.PI);
      S.flipK = 6;
      api.emit('element', {
        kind: 'changeleap',
        name: 'Butterfly',
        detail: Math.abs(y) > 1.5 * Math.PI ? 'a full turn' : 'part of a turn',
        base: CFG.points.changeLeap * done,
        counted: how !== 'crash' && done >= 0.5,
      });
    },
    blade(out) {
      const a = air(u());
      out.pen = a <= 0 || a >= 1;
    },
    airborne: () => {
      const a = air(u());
      return a > 0 && a < 1;
    },
    pose(T, kit) {
      const x = u(),
        a = air(x);
      if (x < C.up) {
        // the wind-up: down deep in her knees, her chest swinging down over them and her arms swept back, ready to
        // throw herself up and round
        const w = sstep(0, C.up, x);
        kit.set({
          lean: 0.35 + 0.75 * w,
          bodyY: kit.HIP - 0.08 - 0.14 * w,
          fL: 1,
          fR: 1,
          lRx: -0.35 - 1.3 * w,
          lRk: 0.5 + 0.9 * w,
          lRz: 0.05,
          lLx: -0.35 - 0.95 * w,
          lLk: 0.5 + 0.6 * w,
          lLz: -0.05,
          aLz: -0.9 + 0.5 * w,
          aRz: 0.9 - 0.5 * w,
          aLx: 0.2 + 0.9 * w,
          aRx: 0.2 + 0.9 * w,
          aLe: -0.2,
          aRe: -0.2,
        });
      } else if (a < 1) {
        // in the air: her body level, face to the ice; her legs scissor, one kicked up behind and the other low, then
        // switching through (knees softening as they pass); arms spread like wings
        const s = sstep(0.25, 0.7, a),
          mix = (p, q) => p + (q - p) * s,
          k = 0.1 + 0.5 * Math.sin(Math.PI * s);
        kit.set({
          // level soon after takeoff, coming up again for the landing
          lean: 1.1 + 0.42 * sstep(0, 0.2, a) - 0.95 * sstep(0.72, 1, a),
          bodyY: kit.HIP,
          fL: 0,
          fR: 0,
          lRx: mix(0.55, -0.75),
          lLx: mix(-0.75, 0.55),
          lRk: k + 0.25 * (1 - s),
          lLk: k + 0.25 * s,
          lLz: -0.12,
          lRz: 0.12,
          aLz: -1.55,
          aRz: 1.55,
          aLx: 0.3,
          aRx: 0.3,
          aLe: -0.12,
          aRe: -0.12,
        });
      } else {
        // the landing: on the leg that came forward, its knee giving, the other stretched out behind, arms open
        kit.set(kit.WIDE);
        kit.set({
          lean: 0.35,
          bodyY: kit.HIP - 0.08,
          fL: 1,
          fR: 0,
          lLx: -0.6,
          lLk: 0.55,
          lLz: 0,
          lRx: 0.7,
          lRk: 0.05,
          lRz: 0,
        });
      }
      return 20;
    },
  };
}
