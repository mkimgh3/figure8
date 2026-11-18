// Playtest log: what each touch was read as, how each jump went, and how smoothly the game ran.
// It stays on the device until the player copies it (Menu > Copy log) and pastes it to Claude.
import { CFG } from './config.js';
const KEY = 'icedoodle2-log';

export function createLog(build) {
  const L = CFG.log,
    t0 = performance.now();
  let data = {
    build,
    started: new Date().toISOString(),
    standalone: !!(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches),
    device: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      ua: navigator.userAgent,
      coarse: window.matchMedia('(pointer: coarse)').matches,
    },
    strokes: [],
    jumps: [],
    elements: [],
    fps: [],
    notes: [],
    steer: { seconds: 0, fullStick: 0, maxKmh: 0, metres: 0 },
  };
  try {
    const old = JSON.parse(localStorage.getItem(KEY));
    if (old && old.build === build && Array.isArray(old.strokes)) {
      data = old;
      data.resumed = (data.resumed || 0) + 1;
    }
  } catch (e) {}
  const at = () => +((performance.now() - t0) / 1000).toFixed(1);
  let acc = 0,
    frames = 0,
    worst = 0,
    dirty = false;
  const persist = () => {
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
  };
  setInterval(persist, 5000);
  window.addEventListener('pagehide', persist);
  return {
    stroke(role, outcome, s, extra) {
      const pts =
        s.points.length > L.maxPointsPerStroke
          ? s.points.filter((_, i) => i % Math.ceil(s.points.length / L.maxPointsPerStroke) === 0)
          : s.points;
      data.strokes.push(
        Object.assign(
          { t: at(), role, read: outcome, x0: Math.round(s.x0), y0: Math.round(s.y0), pts: pts.flat() },
          s.summary(),
          extra || {},
        ),
      );
      if (data.strokes.length > L.maxStrokes) data.strokes.shift();
      dirty = true;
    },
    jump(info) {
      data.jumps.push(Object.assign({ t: at() }, info));
      if (data.jumps.length > 300) data.jumps.shift();
      dirty = true;
    },
    element(info) {
      data.elements.push(Object.assign({ t: at() }, info));
      if (data.elements.length > 300) data.elements.shift();
      dirty = true;
    },
    note(text) {
      data.notes.push({ t: at(), text });
      dirty = true;
    },
    tick(dt, game, steer) {
      acc += dt;
      frames++;
      if (dt > worst) worst = dt;
      const kmh = game.speed() * 3.6;
      data.steer.seconds += dt;
      if (Math.hypot(steer.x, steer.y) > 0.95) data.steer.fullStick += dt;
      if (kmh > data.steer.maxKmh) data.steer.maxKmh = Math.round(kmh);
      data.steer.metres = Math.round(game.S.skated);
      if (acc >= 5) {
        data.fps.push([Math.round(frames / acc), Math.round(1 / worst)]);
        if (data.fps.length > 240) data.fps.shift();
        acc = 0;
        frames = 0;
        worst = 0;
        dirty = true;
      }
    },
    counts: () => ({
      strokes: data.strokes.length,
      jumps: data.jumps.length,
      minutes: +(data.steer.seconds / 60).toFixed(1),
    }),
    text() {
      data.steer.seconds = Math.round(data.steer.seconds);
      data.steer.fullStick = Math.round(data.steer.fullStick);
      return JSON.stringify(data);
    },
    clear() {
      data.strokes = [];
      data.jumps = [];
      data.elements = [];
      data.fps = [];
      data.notes = [];
      data.steer = { seconds: 0, fullStick: 0, maxKmh: 0, metres: 0 };
      data.started = new Date().toISOString();
      dirty = true;
      persist();
    },
  };
}
