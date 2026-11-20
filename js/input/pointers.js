// Raw touches. Decides which finger is which: a thumb on the left half of the screen steers, one on the right half does
// tricks (tricks.js), and while zoomed out (paused) a second finger pinches and pans the view.
// The steering thumb's touches go to tricks.js as well, which reads two-thumb gestures from where both thumbs went.
// When one starts a move, the stick is held where it was when the right thumb touched down, so the left thumb's part in
// the gesture does not steer her; it is live again once the left thumb settles.
import { CFG } from '../config.js';
import { clamp } from '../core/math.js';

export function createInput(canvas, game, tricks, taps, view, hud, onPinchClose) {
  const R = CFG.steer.stickRadius,
    T = CFG.tap,
    K = CFG.two;
  // the steering thumb: where it touched down (ox, oy), where it is (cx, cy), the stick it makes (x, y, -1..1),
  // and the stick as it was when the right thumb touched down (hx, hy)
  const steer = { id: null, ox: 0, oy: 0, cx: 0, cy: 0, x: 0, y: 0, t: 0, mt: 0, moved: false };
  Object.assign(steer, { frozen: false, frozenAt: 0, hx: 0, hy: 0 });
  const pinch = { on: false, id2: null, d0: 1, zf0: 1, cx0: 0, cy0: 0, px0: 0, pz0: 0, x2: 0, y2: 0 };
  const keys = {};
  let trickId = null,
    auto = null;
  const recentre = () => {
    steer.frozen = false;
    if (steer.id === null) return;
    steer.ox = steer.cx;
    steer.oy = steer.cy;
    steer.x = steer.y = 0;
    hud.stick(true, steer.ox, steer.oy, 0, 0);
  };
  // a two-thumb gesture has started a move: hold the stick where it was
  // what the right thumb was read as, shown for a moment just above where it is (or where it lifted)
  const READS = {
    down: 'Toe kick',
    left: 'Three-turn',
    right: 'Split leap',
    stop: 'Hockey stop',
    'circle-cw': 'Spiral',
    'circle-ccw': 'Hydroblade',
    'circle-apart': 'Spread eagle',
    'circle-biellmann': 'Biellmann',
    twirl: 'Twizzles',
    dance: 'Choreography',
    jump: 'Jump',
    none: 'no move',
    'stop-too-slow': 'too slow to stop',
  };
  const trick = { x: 0, y: 0 };
  tricks.onRead = (name) =>
    hud.padTag(READS[name] || name, trick.x, trick.y, name === 'none' || name === 'stop-too-slow');
  tricks.onTwoThumb = () => {
    if (steer.id === null) return;
    steer.frozen = true;
    steer.frozenAt = performance.now();
    steer.x = steer.hx;
    steer.y = steer.hy;
    hud.stick(true, steer.ox, steer.oy, steer.hx * R, steer.hy * R);
  };
  // after a two-thumb move the stick carries on from where it was held, wherever the thumb ended up
  const unfreeze = () => {
    if (!steer.frozen) return;
    steer.frozen = false;
    if (steer.id === null) return;
    steer.ox = steer.cx - steer.hx * R;
    steer.oy = steer.cy - steer.hy * R;
    steer.x = steer.hx;
    steer.y = steer.hy;
    hud.stick(true, steer.ox, steer.oy, steer.hx * R, steer.hy * R);
  };
  const pinchEnd = () => {
    pinch.on = false;
    if (view.zoomed && view.zf >= view.zMax * 0.72) onPinchClose();
  };

  canvas.addEventListener('pointerdown', (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    const now = performance.now();
    hud.touched();
    if (view.zoomed && !view.still && steer.id !== null && trickId === null && !pinch.on && pinch.id2 === null) {
      // zoomed out: a second finger pinches and pans
      Object.assign(pinch, {
        on: true,
        id2: e.pointerId,
        x2: e.clientX,
        y2: e.clientY,
        d0: Math.max(20, Math.hypot(e.clientX - steer.cx, e.clientY - steer.cy)),
        zf0: view.zf,
        cx0: (e.clientX + steer.cx) / 2,
        cy0: (e.clientY + steer.cy) / 2,
        px0: view.px,
        pz0: view.pz,
      });
      steer.x = steer.y = 0;
      steer.moved = true;
      hud.stick(false);
      return;
    }
    if (pinch.id2 !== null) return;
    // The left half of the screen steers and sets her speed; the right half does jumps, spins and every other skill.
    // A second thumb on a half that is already taken gets the role that is still free, so two thumbs always make a pair.
    const right = e.clientX >= window.innerWidth / 2,
      asTrick = !view.zoomed && trickId === null && (right || steer.id !== null);
    if (asTrick) {
      const dbl = game.S.grounded && taps.isDouble(now);
      if (dbl) taps.clear();
      trickId = e.pointerId;
      steer.hx = steer.x;
      steer.hy = steer.y;
      trick.x = e.clientX;
      trick.y = e.clientY;
      tricks.down(e.clientX, e.clientY, now, dbl);
      hud.pad(true, e.clientX, e.clientY, false);
    } else if (steer.id === null) {
      Object.assign(steer, { id: e.pointerId, ox: e.clientX, oy: e.clientY, cx: e.clientX, cy: e.clientY });
      Object.assign(steer, { x: 0, y: 0, t: now, mt: now, moved: false, frozen: false });
      if (!view.zoomed) {
        hud.stick(true, e.clientX, e.clientY, 0, 0);
        tricks.leftDown(e.clientX, e.clientY, now);
      }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pinch.on && (e.pointerId === steer.id || e.pointerId === pinch.id2)) {
      if (e.pointerId === steer.id) {
        steer.cx = e.clientX;
        steer.cy = e.clientY;
      } else {
        pinch.x2 = e.clientX;
        pinch.y2 = e.clientY;
      }
      view.zf = clamp((pinch.zf0 * Math.hypot(pinch.x2 - steer.cx, pinch.y2 - steer.cy)) / pinch.d0, 1, view.zMax);
      view.px = pinch.px0 - ((pinch.x2 + steer.cx) / 2 - pinch.cx0) / view.ppm;
      view.pz = pinch.pz0 - ((pinch.y2 + steer.cy) / 2 - pinch.cy0) / view.ppm;
      return;
    }
    const now = performance.now();
    if (e.pointerId === steer.id && view.zoomed) {
      // zoomed out: one finger drags the view around (paused on the scoreboard in the canyon, nothing moves)
      if (view.still) return;
      view.px -= (e.clientX - steer.cx) / view.ppm;
      view.pz -= (e.clientY - steer.cy) / view.ppm;
      steer.cx = e.clientX;
      steer.cy = e.clientY;
      steer.moved = true;
      return;
    }
    if (e.pointerId === steer.id) {
      steer.cx = e.clientX;
      steer.cy = e.clientY;
      steer.mt = now;
      tricks.leftMove(e.clientX, e.clientY, now);
      if (!steer.frozen) {
        let dx = e.clientX - steer.ox,
          dy = e.clientY - steer.oy;
        const l = Math.hypot(dx, dy);
        if (l > T.maxMovePx) steer.moved = true;
        if (l > R) {
          dx *= R / l;
          dy *= R / l;
        }
        steer.x = dx / R;
        steer.y = dy / R;
        if (!view.zoomed) hud.stick(true, steer.ox, steer.oy, dx, dy);
      }
    } else if (e.pointerId === trickId) {
      trick.x = e.clientX;
      trick.y = e.clientY;
      tricks.move(e.clientX, e.clientY, now);
      // the ring sits under the finger, no smoothing
      hud.pad(true, e.clientX, e.clientY, tricks.armed);
    }
  });
  const end = (e) => {
    const now = performance.now();
    if (e.pointerId === pinch.id2) {
      pinch.id2 = null;
      if (pinch.on) {
        pinchEnd();
        recentre();
      }
      return;
    }
    if (pinch.on && e.pointerId === steer.id) {
      pinchEnd();
      steer.id = null;
      steer.x = steer.y = 0;
      return;
    }
    if (e.pointerId === steer.id) {
      // choreography carries on under the right thumb when the left one lifts: she just coasts
      tricks.leftUp(now);
      if (!steer.moved && now - steer.t <= T.maxMs && !view.zoomed) taps.tap(now);
      steer.id = null;
      steer.x = steer.y = 0;
      steer.frozen = false;
      hud.stick(false);
    }
    if (e.pointerId === trickId) {
      tricks.up(now);
      trickId = null;
      unfreeze();
      hud.pad(false);
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!view.zoomed || view.still) return;
      e.preventDefault();
      view.zf = clamp(view.zf * Math.exp(-e.deltaY * 0.0015), 1, view.zMax);
      if (view.zf >= view.zMax * 0.97) onPinchClose();
    },
    { passive: false },
  );

  // keyboard, for desktop: WASD steers, Space jumps, A/D rotate in the air
  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    keys[e.code] = true;
    hud.touched();
    if (e.code === 'Space') {
      if (!view.zoomed) game.jump();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  return {
    keys,
    setAuto(a) {
      auto = a;
    },
    frame(now) {
      // steering is live again, from where it was, once the left thumb settles, or after a short grace even if it never
      // goes still (a thumb on glass always jitters, and the spiral or hydroblade is held with the right thumb down)
      if (steer.frozen && (now - steer.mt > K.settleMs || now - steer.frozenAt > K.freezeMs)) unfreeze();
      const was = tricks.armed;
      tricks.frame(now);
      if (tricks.armed !== was) hud.padArmed(tricks.armed);
    },
    read() {
      if (auto) return auto;
      const b = steer;
      return {
        x: b.x + (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
        y: b.y + (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0),
      };
    },
  };
}
