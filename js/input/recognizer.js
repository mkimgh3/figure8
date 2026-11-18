// Pure gesture maths: no DOM, no game state and no clock (time comes in with every call), so it can be tested against recorded finger traces.
import { clamp, wrap } from '../core/math.js';

// One finger's stroke. add() returns the rotation (radians, screen-clockwise positive) that this sample contributes.
// Rotation is how far the path has turned, so one finger circle is exactly one turn. It only counts while the finger
// circles wider than a minimum radius around a pivot that trails it; turning just before that is credited when it does.
export class Stroke {
  constructor(x, y, t, cfg) {
    this.cfg = cfg;
    this.x0 = this.x = x;
    this.y0 = this.y = y;
    this.t0 = this.t = t;
    this.cx = x;
    this.cy = y;
    this.heading = null;
    this.buf = 0;
    this.bufT = t;
    this.path = 0;
    this.turn = 0;
    this.absTurn = 0;
    this.minX = this.maxX = x;
    this.minY = this.maxY = y;
    this.vx = 0;
    this.vy = 0;
    this.restMs = null; // restMs: how long the finger rested before it first moved
    this.points = [[0, 0, 0]];
  }
  add(x, y, t) {
    const c = this.cfg,
      dx = x - this.x,
      dy = y - this.y,
      l = Math.hypot(dx, dy);
    if (l < c.minSegPx) return 0;
    const al = 1 - Math.exp(-Math.min(0.1, (t - this.t) / 1000) / c.pivotLag);
    this.cx += (x - this.cx) * al;
    this.cy += (y - this.cy) * al;
    const h = Math.atan2(dy, dx);
    let dh = this.heading === null ? 0 : wrap(h - this.heading);
    this.heading = h;
    if (Math.abs(dh) > 2) dh = 0; // a straight reversal is not rotation
    let d = 0;
    if (Math.hypot(x - this.cx, y - this.cy) >= c.minRadiusPx) {
      d = dh + this.buf;
      this.buf = 0;
    } else {
      if (this.buf === 0) this.bufT = t;
      else if (t - this.bufT > c.bufferMs) {
        this.buf = 0;
        this.bufT = t;
      }
      this.buf = clamp(this.buf + dh, -c.bufferCap, c.bufferCap);
    }
    const dtv = Math.max(1, t - this.t),
      kv = 1 - Math.exp(-dtv / 60);
    this.vx += ((dx / dtv) * 1000 - this.vx) * kv;
    this.vy += ((dy / dtv) * 1000 - this.vy) * kv;
    this.path += l;
    this.turn += d;
    this.absTurn += Math.abs(d);
    this.x = x;
    this.y = y;
    this.t = t;
    if (this.restMs === null && this.path > 12) this.restMs = t - dtv - this.t0;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
    this.points.push([Math.round(x - this.x0), Math.round(y - this.y0), Math.round(t - this.t0)]);
    return d;
  }
  get durationMs() {
    return this.t - this.t0;
  }
  get dispX() {
    return this.x - this.x0;
  }
  get dispY() {
    return this.y - this.y0;
  }
  isTap(now, tapCfg) {
    return now - this.t0 <= tapCfg.maxMs && this.path <= tapCfg.maxMovePx;
  }
  // current speed in px/s; zero once the finger has been still for a moment
  speedAt(now) {
    return now - this.t > 110 ? 0 : Math.hypot(this.vx, this.vy);
  }
  summary() {
    return {
      rest: this.restMs === null ? null : Math.round(this.restMs),
      ms: Math.round(this.durationMs),
      path: Math.round(this.path),
      turn: +this.turn.toFixed(2),
      dx: Math.round(this.dispX),
      dy: Math.round(this.dispY),
      w: Math.round(this.maxX - this.minX),
      h: Math.round(this.maxY - this.minY),
    };
  }
}

// Remembers the last quick tap so the next touch can be read as the second half of a double tap.
export class TapTracker {
  constructor(cfg) {
    this.cfg = cfg;
    this.last = -1e9;
  }
  tap(t) {
    this.last = t;
  }
  isDouble(t) {
    return t - this.last <= this.cfg.doubleMs;
  }
  clear() {
    this.last = -1e9;
  }
}

// Reads one finger's stroke as a flick, or not. A flick is quick and straight: all its motion happens within flickMs, it
// travels at least flickPx, never turns back on itself (by reversalPx or more) and hardly curves. It is read once, when the
// finger has been still for idleMs, or when it lifts.
//   pending()       it could still be a flick: so far it has moved straight and quickly, and it has not been read yet.
//                   Choreography holds off while it is, so a flick kept down is not taken for a finger held still.
//   read(t, lifted) once the finger is still (or lifts): { dir, dx, dy, d, straight, smooth }. dir is 'up', 'down', 'left'
//                   or 'right' for a flick, and null otherwise (too short, diagonal, curved, turned back, or too slow).
//                   smooth: it never turned back and hardly curved, however long it took. Null until the finger is still,
//                   and after the one reading. A twitch shorter than restPx followed by stillness is not read: the finger
//                   is resting, and its next motion starts afresh.
export class Swipe {
  constructor(cfg) {
    this.c = cfg;
    this.decided = false;
    this.reset();
  }
  reset() {
    this.x = 0;
    this.y = 0;
    this.path = 0;
    this.turn = 0;
    this.t0 = null;
    this.lastMove = 0;
    this.heading = null;
    this.reversals = 0;
    this.dirX = 0;
    this.dirY = 0;
    this.sx = 0;
    this.sy = 0;
  }
  // dx, dy: how far the finger moved since the last call (px, a step of Stroke.minSegPx or more); t: time (ms)
  add(dx, dy, t) {
    if (this.decided) return;
    if (this.t0 === null) this.t0 = t;
    this.lastMove = t;
    this.x += dx;
    this.y += dy;
    this.path += Math.hypot(dx, dy);
    // how far its heading has turned since this swipe began (a sharp turn back is a reversal, counted below)
    const h = Math.atan2(dy, dx);
    if (this.heading !== null) {
      const dh = wrap(h - this.heading);
      if (Math.abs(dh) <= 2) this.turn += dh;
    }
    this.heading = h;
    // a reversal: having gone reversalPx or more one way along x (or y), the finger heads back
    if (Math.abs(dx) > Math.abs(dy) * 1.2) {
      const s = dx > 0 ? 1 : -1;
      if (this.dirX && s !== this.dirX) {
        if (Math.abs(this.sx) >= this.c.reversalPx) this.reversals++;
        this.sx = 0;
      }
      this.dirX = s;
      this.sx += dx;
    }
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      const s = dy > 0 ? 1 : -1;
      if (this.dirY && s !== this.dirY) {
        if (Math.abs(this.sy) >= this.c.reversalPx) this.reversals++;
        this.sy = 0;
      }
      this.dirY = s;
      this.sy += dy;
    }
  }
  get distance() {
    return Math.hypot(this.x, this.y);
  }
  get smooth() {
    return this.reversals === 0 && Math.abs(this.turn) <= 1.2;
  }
  // smooth, a path hardly longer than the distance covered, and all of it within flickMs
  get straight() {
    return this.smooth && this.path <= this.distance * 1.25 && this.lastMove - this.t0 <= this.c.flickMs;
  }
  pending() {
    return !this.decided && this.t0 !== null && this.straight;
  }
  read(t, lifted) {
    if (this.decided || this.t0 === null) return null;
    if (!lifted && t - this.lastMove < this.c.idleMs) return null;
    const d = this.distance;
    if (!lifted && d < this.c.restPx) {
      this.reset();
      return null;
    }
    this.decided = true;
    const x = this.x,
      y = this.y,
      straight = this.straight;
    let dir = null;
    if (straight && d >= this.c.flickPx) {
      if (Math.abs(y) > Math.abs(x) * 1.2) dir = y < 0 ? 'up' : 'down';
      else if (Math.abs(x) > Math.abs(y) * 1.2) dir = x > 0 ? 'right' : 'left';
    }
    return { dir, dx: x, dy: y, d, straight, smooth: this.smooth };
  }
}
