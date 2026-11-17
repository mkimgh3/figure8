// Raw touches. Decides which finger is which: a thumb on the left half of the screen steers, one on the right half performs tricks,
// and while zoomed out (paused) a second finger pinches and pans the view.
// When both are down it also watches for the two thumbs moving together and holds her course while they do.
import { CFG } from '../config.js';
import { clamp } from '../core/math.js';
import { Stroke, Duo } from './recognizer.js';

export function createInput(canvas, game, tricks, taps, view, hud, onPinchClose) {
  const R = CFG.steer.stickRadius, T = CFG.tap;
  const steer = { id: null, ox: 0, oy: 0, cx: 0, cy: 0, x: 0, y: 0, t: 0, moved: false, frozen: false, hx: 0, hy: 0 };
  const pinch = { on: false, id2: null, d0: 1, zf0: 1, cx0: 0, cy0: 0, px0: 0, pz0: 0, x2: 0, y2: 0 };
  const keys = {}; let trickId = null, auto = null, duo = null, left = null, dragT = 0, lastF = 0;
  const dancing = () => !!game.S.move && game.S.move.id === 'dance';
  // with both thumbs down, their shared motion is watched for two-thumb gestures
  const pair = (now) => { if (!tricks.canDuo()) return; left = new Stroke(steer.cx, steer.cy, now, CFG.rotate); duo = new Duo(CFG.duo, CFG.shape); steer.hx = steer.x; steer.hy = steer.y; };
  const recentre = () => { duo = null; left = null; steer.frozen = false; if (steer.id === null) return; steer.ox = steer.cx; steer.oy = steer.cy; steer.x = steer.y = 0; hud.stick(true, steer.ox, steer.oy, 0, 0); };
  game.recentreSteer = recentre;
  // after a two-thumb move the stick carries on from where it was held, wherever the thumb ended up
  const unfreeze = () => { if (!steer.frozen) return; steer.frozen = false; if (steer.id === null) return;
    steer.ox = steer.cx - steer.hx * R; steer.oy = steer.cy - steer.hy * R; steer.x = steer.hx; steer.y = steer.hy; hud.stick(true, steer.ox, steer.oy, steer.hx * R, steer.hy * R); };
  const duoEvent = (ev, lifted) => { if (!ev) return; if (Array.isArray(ev)) { ev.forEach((q) => duoEvent(q, lifted)); return; }
    if (ev === 'engage') return;
    if (tricks.perform(ev, duo, true, lifted === true)) { steer.frozen = true; steer.frozenAt = performance.now(); steer.x = steer.hx; steer.y = steer.hy; hud.stick(true, steer.ox, steer.oy, steer.hx * R, steer.hy * R); } };      // the gesture itself must not steer her
  const feedDuo = (now) => { if (!duo || !tricks.canDuo()) return; duoEvent(duo.update(left, tricks.stroke, now)); };
  const pinchEnd = () => { pinch.on = false; if (view.zoomed && view.zf >= view.zMax * 0.72) onPinchClose(); };

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const now = performance.now(); hud.touched();
    if (view.zoomed && steer.id !== null && trickId === null && !pinch.on && pinch.id2 === null) {            // zoomed out: a second finger pinches and pans
      Object.assign(pinch, { on: true, id2: e.pointerId, x2: e.clientX, y2: e.clientY, d0: Math.max(20, Math.hypot(e.clientX - steer.cx, e.clientY - steer.cy)), zf0: view.zf,
        cx0: (e.clientX + steer.cx) / 2, cy0: (e.clientY + steer.cy) / 2, px0: view.px, pz0: view.pz });
      steer.x = steer.y = 0; steer.moved = true; hud.stick(false); return; }
    if (pinch.id2 !== null) return;
    // The left half of the screen steers and sets her speed; the right half does jumps, spins and every other skill.
    // A second thumb on a half that is already taken gets the role that is still free, so two thumbs always make a pair.
    const right = e.clientX >= window.innerWidth / 2, asTrick = !view.zoomed && trickId === null && (right || steer.id !== null);
    if (asTrick) { const dbl = game.S.grounded && taps.isDouble(now);
      if (dbl) taps.clear(); trickId = e.pointerId; dragT = 0; tricks.down(e.clientX, e.clientY, now, dbl); hud.pad(true, e.clientX, e.clientY, false);
      if (steer.id !== null) pair(now);
    } else if (steer.id === null) {
      Object.assign(steer, { id: e.pointerId, ox: e.clientX, oy: e.clientY, cx: e.clientX, cy: e.clientY, x: 0, y: 0, t: now, moved: false, frozen: false }); if (!view.zoomed) hud.stick(true, e.clientX, e.clientY, 0, 0);
      if (trickId !== null && !view.zoomed) pair(now);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pinch.on && (e.pointerId === steer.id || e.pointerId === pinch.id2)) {
      if (e.pointerId === steer.id) { steer.cx = e.clientX; steer.cy = e.clientY; } else { pinch.x2 = e.clientX; pinch.y2 = e.clientY; }
      view.zf = clamp(pinch.zf0 * Math.hypot(pinch.x2 - steer.cx, pinch.y2 - steer.cy) / pinch.d0, 1, view.zMax);
      view.px = pinch.px0 - ((pinch.x2 + steer.cx) / 2 - pinch.cx0) / view.ppm; view.pz = pinch.pz0 - ((pinch.y2 + steer.cy) / 2 - pinch.cy0) / view.ppm; return; }
    const now = performance.now();
    if (e.pointerId === steer.id && view.zoomed) {                                             // zoomed out: one finger drags the view around
      view.px -= (e.clientX - steer.cx) / view.ppm; view.pz -= (e.clientY - steer.cy) / view.ppm; steer.cx = e.clientX; steer.cy = e.clientY; steer.moved = true; return; }
    if (e.pointerId === steer.id) {
      steer.cx = e.clientX; steer.cy = e.clientY; if (left) left.add(e.clientX, e.clientY, now);
      if (!steer.frozen) { let dx = e.clientX - steer.ox, dy = e.clientY - steer.oy; const l = Math.hypot(dx, dy);
        if (l > T.maxMovePx) steer.moved = true; if (l > R) { dx *= R / l; dy *= R / l; }
        steer.x = dx / R; steer.y = dy / R; if (!view.zoomed) hud.stick(true, steer.ox, steer.oy, dx, dy); }
      feedDuo(now);
    } else if (e.pointerId === trickId) { tricks.move(e.clientX, e.clientY, now); hud.pad(true, e.clientX, e.clientY, tricks.armed); feedDuo(now); }      // the ring sits under the finger, no smoothing
  });
  const end = (e) => {
    const now = performance.now();
    if (e.pointerId === pinch.id2) { pinch.id2 = null; if (pinch.on) { pinchEnd(); recentre(); } return; }
    if (pinch.on && e.pointerId === steer.id) { pinchEnd(); steer.id = null; steer.x = steer.y = 0; return; }
    if (e.pointerId === steer.id) { if (duo && trickId !== null && tricks.canDuo()) duoEvent(duo.end(), true); if (!steer.moved && now - steer.t <= T.maxMs && !view.zoomed) taps.tap(now); steer.id = null; steer.x = steer.y = 0; steer.frozen = false; duo = null; left = null; hud.stick(false); }
    if (e.pointerId === trickId) { let extra = null;
      if (duo && left) { if (tricks.canDuo()) duoEvent(duo.end(), true); const lp = left.points, k = Math.ceil(lp.length / 45); extra = { duo: duo.summary(), left: lp.filter((_, i) => i % k === 0).flat() }; }
      tricks.up(now, extra); trickId = null; duo = null; left = null; unfreeze(); hud.pad(false); }
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (!view.zoomed) return; e.preventDefault(); view.zf = clamp(view.zf * Math.exp(-e.deltaY * 0.0015), 1, view.zMax); if (view.zf >= view.zMax * 0.97) onPinchClose(); }, { passive: false });

  // keyboard, for desktop: WASD steers, Space jumps, A/D rotate in the air
  window.addEventListener('keydown', (e) => { if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; } keys[e.code] = true; hud.touched();
    if (e.code === 'Space') { if (!view.zoomed) game.jump(false); e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  return {
    keys, setAuto(a) { auto = a; },
    frame(now) { const fdt = Math.min(100, now - (lastF || now)); lastF = now;
      if (trickId === null) return; if (duo && tricks.canDuo()) duoEvent(duo.settle(now));
      // Choreography: with the left thumb down, a right thumb that keeps moving and is read as nothing else starts her dancing.
      // The left thumb goes on steering her; the right thumb's motion sets the mood and its circling turns her.
      if (tricks.stroke) { const sb = tricks.stroke.speedAt(now), D = CFG.dance;
        if (dancing()) game.S.move.feed(sb, fdt / 1000);
        else if (steer.id !== null && tricks.canDance()) { dragT = sb > D.moveSpeed ? dragT + fdt : Math.max(0, dragT - fdt * 2); if (dragT >= D.startMs && tricks.dance()) dragT = 0; }
        else dragT = 0; }
      // steering is live again, from where it was, once the left thumb settles, or after a short grace even if it never
      // goes still (a thumb on glass always jitters, and the spiral or hydroblade is held with the right thumb down)
      if (steer.frozen && left && (now - left.t > CFG.duo.settleMs || now - steer.frozenAt > CFG.duo.freezeMs)) unfreeze();
      const was = tricks.armed; tricks.frame(now, !!duo && duo.active && !duo.decided); if (tricks.armed !== was) hud.padArmed(true); },
    read() { if (auto) return auto; const b = steer;
      return { x: b.x + ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0), y: b.y + ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0) }; },
  };
}
