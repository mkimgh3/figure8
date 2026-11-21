// Playtest log: what each touch was read as, how each jump went, and how smoothly the game ran.
// It stays on the device until the player copies it (Menu > Copy log) and pastes it to Claude.
import { CFG } from './config.js';
import { reversalsOf } from './input/recognizer.js';
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
      // v3-look41: the screen's height and the safe area the phone reports at the top, for the status bar
      screenH: window.screen ? screen.height : 0,
      safeTop: (() => {
        try {
          const d = document.createElement('div');
          d.style.cssText = 'position:fixed;padding-top:env(safe-area-inset-top)';
          document.body.appendChild(d);
          const v = parseFloat(getComputedStyle(d).paddingTop) || 0;
          d.remove();
          return v;
        } catch (e) {
          return -1;
        }
      })(),
      sbar: getComputedStyle(document.documentElement).getPropertyValue('--sbar').trim(),
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
  // (v3-look79) to the hundredth of a second, to line touches up with a song's beat (it was to the tenth)
  const at = () => +((performance.now() - t0) / 1000).toFixed(2);
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
          // (v3-look79) where the thumb turned back on itself, as ms from its touch, found at full detail before the
          // points above were thinned: the rhythm of a thumb shaking to music
          { rev: reversalsOf(s.points, CFG.reversal) },
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
    // dt: the game's step (held to at most 0.05 s); real: the time the frame really took, for the frame rate (until
    // v3-look45 the rate came from dt, so it could not show anything below 20 fps)
    tick(dt, game, steer, real) {
      const f = real === undefined ? dt : real;
      // a gap of over half a second (the page in the background) is not a frame
      if (f < 0.5) {
        acc += f;
        frames++;
        if (f > worst) worst = f;
      }
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
