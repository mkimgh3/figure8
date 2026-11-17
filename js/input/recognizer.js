// Pure gesture maths: no DOM, no game state, so it can be tested against recorded finger traces.
import { clamp, wrap } from '../core/math.js';

// One finger's stroke. add() returns the rotation (radians, screen-clockwise positive) that this sample contributes.
// Rotation is how far the path has turned, so one finger circle is exactly one turn. It only counts while the finger
// circles wider than a minimum radius around a pivot that trails it; turning just before that is credited when it does.
export class Stroke {
  constructor(x, y, t, cfg) {
    this.cfg = cfg; this.x0 = this.x = x; this.y0 = this.y = y; this.t0 = this.t = t;
    this.cx = x; this.cy = y; this.heading = null; this.buf = 0; this.bufT = t;
    this.path = 0; this.turn = 0; this.absTurn = 0; this.minX = this.maxX = x; this.minY = this.maxY = y;
    this.vx = 0; this.vy = 0; this.restMs = null;            // restMs: how long the finger rested before it first moved
    this.points = [[0, 0, 0]];
  }
  add(x, y, t) {
    const c = this.cfg, dx = x - this.x, dy = y - this.y, l = Math.hypot(dx, dy);
    if (l < c.minSegPx) return 0;
    const al = 1 - Math.exp(-Math.min(0.1, (t - this.t) / 1000) / c.pivotLag);
    this.cx += (x - this.cx) * al; this.cy += (y - this.cy) * al;
    const h = Math.atan2(dy, dx); let dh = this.heading === null ? 0 : wrap(h - this.heading); this.heading = h;
    if (Math.abs(dh) > 2) dh = 0;                                   // a straight reversal is not rotation
    let d = 0;
    if (Math.hypot(x - this.cx, y - this.cy) >= c.minRadiusPx) { d = dh + this.buf; this.buf = 0; }
    else { if (this.buf === 0) this.bufT = t; else if (t - this.bufT > c.bufferMs) { this.buf = 0; this.bufT = t; } this.buf = clamp(this.buf + dh, -c.bufferCap, c.bufferCap); }
    const dtv = Math.max(1, t - this.t), kv = 1 - Math.exp(-dtv / 60); this.vx += (dx / dtv * 1000 - this.vx) * kv; this.vy += (dy / dtv * 1000 - this.vy) * kv;
    this.path += l; this.turn += d; this.absTurn += Math.abs(d); this.x = x; this.y = y; this.t = t;
    if (this.restMs === null && this.path > 12) this.restMs = t - dtv - this.t0;
    if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x; if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
    this.points.push([Math.round(x - this.x0), Math.round(y - this.y0), Math.round(t - this.t0)]);
    return d;
  }
  get durationMs() { return this.t - this.t0; }
  get dispX() { return this.x - this.x0; }
  get dispY() { return this.y - this.y0; }
  isTap(now, tapCfg) { return now - this.t0 <= tapCfg.maxMs && this.path <= tapCfg.maxMovePx; }
  // current speed in px/s; zero once the finger has been still for a moment
  speedAt(now) { return now - this.t > 110 ? 0 : Math.hypot(this.vx, this.vy); }
  summary() { return { rest: this.restMs === null ? null : Math.round(this.restMs), ms: Math.round(this.durationMs), path: Math.round(this.path), turn: +this.turn.toFixed(2), dx: Math.round(this.dispX), dy: Math.round(this.dispY),
    w: Math.round(this.maxX - this.minX), h: Math.round(this.maxY - this.minY) }; }
}

// Remembers the last quick tap so the next touch can be read as the second half of a double tap.
export class TapTracker {
  constructor(cfg) { this.cfg = cfg; this.last = -1e9; }
  tap(t) { this.last = t; }
  isDouble(t) { return t - this.last <= this.cfg.doubleMs; }
  clear() { this.last = -1e9; }
}

// Reads the shape of one stream of motion: a single finger, or the shared motion of two thumbs.
//   scribbleX / scribbleY   side to side, or up and down (two reversals); then 'beat' on each further reversal
//   eight                   one loop, then a loop the other way (sign in .loopSign)
//   corner                  a sharp L: sideways, then up or down (.side is -1 left / 1 right, .vertical is -1 up / 1 down)
//   up, down, left, right   a straight flick, reported once the motion stops or the finger lifts
//   slash                   a straight flick on a diagonal
export class Shape {
  constructor(cfg) { this.c = cfg; this.x = 0; this.y = 0; this.path = 0; this.t0 = null; this.lastMove = 0; this.decided = null;
    this.minX = 0; this.maxX = 0; this.minY = 0; this.maxY = 0; this.revX = 0; this.revY = 0; this.dirX = 0; this.dirY = 0; this.sx = 0; this.sy = 0;
    this.l1 = 0; this.l2 = 0; this.diag = 0; this.noCorner = false; this.side = 0; this.hx = 0; this.hy = 0; this.vertical = 0; this.loopSign = 1; }
  add(dx, dy, dturn, t) {
    const c = this.c; if (this.t0 === null) { this.t0 = t; this.revT = t; this.ampPx = 0; this.periodMs = 0; } this.lastMove = t; this.x += dx; this.y += dy; this.path += Math.hypot(dx, dy); let beat = false;
    if (this.x < this.minX) this.minX = this.x; if (this.x > this.maxX) this.maxX = this.x; if (this.y < this.minY) this.minY = this.y; if (this.y > this.maxY) this.maxY = this.y;
    if (Math.abs(dx) > Math.abs(dy) * 1.2) { const d = dx > 0 ? 1 : -1; if (this.dirX && d !== this.dirX) { if (Math.abs(this.sx) >= c.reversalPx) { this.revX++; beat = true; this.ampPx = Math.abs(this.sx); this.ampDir = this.sx > 0 ? 1 : -1; this.periodMs = t - this.revT; this.revT = t; } this.sx = 0; } this.dirX = d; this.sx += dx; }
    if (Math.abs(dy) > Math.abs(dx) * 1.2) { const d = dy > 0 ? 1 : -1; if (this.dirY && d !== this.dirY) { if (Math.abs(this.sy) >= c.reversalPx) { this.revY++; beat = true; this.ampPx = Math.abs(this.sy); this.periodMs = t - this.revT; this.revT = t; } this.sy = 0; } this.dirY = d; this.sy += dy; }
    if (dturn !== 0) { if (this.l1 === 0 || dturn * this.l1 > 0) { if (Math.abs(this.l2) < 1.5) { this.l1 += dturn; this.l2 = 0; } else this.l2 += dturn; } else this.l2 += dturn; }
    if (this.decided) return beat && (this.decided === 'scribbleX' || this.decided === 'scribbleY') ? 'beat' : null;
    // a corner is sharp: a level sideways leg, then little travel on the diagonal before the vertical leg
    if (Math.abs(dx) <= Math.abs(dy) * 2 && Math.abs(dy) <= Math.abs(dx) * 2) { this.diag += Math.hypot(dx, dy); if (this.diag > 30) { this.noCorner = true; this.side = 0; } }
    if (!this.noCorner && Math.abs(dx) > Math.abs(dy) * 1.2) { if (Math.abs(this.y) > Math.max(18, Math.abs(this.x) * 0.4)) { this.noCorner = true; this.side = 0; } else if (Math.abs(this.x) >= 40) { this.side = this.x > 0 ? 1 : -1; this.hx = this.x; this.hy = this.y; } }
    const w = this.maxX - this.minX, h = this.maxY - this.minY; let ev = null;
    if (Math.abs(this.l1) >= c.eightTurn && Math.abs(this.l2) >= c.eightTurn && this.l1 * this.l2 < 0) { ev = 'eight'; this.loopSign = this.l1 > 0 ? 1 : -1; }
    else if (this.revX >= 2 && h < Math.max(26, w * 0.45)) ev = 'scribbleX';
    else if (this.revY >= 2 && w < Math.max(26, h * 0.45)) ev = 'scribbleY';
    if (ev) this.decided = ev; return ev;
  }
  flick() { const c = this.c, d = Math.hypot(this.x, this.y);
    if (this.decided) return null;
    // an L that stopped: sideways leg, sharp turn, vertical leg, and no more turning than a corner has (a circle keeps turning)
    if (this.side && !this.noCorner && this.revX + this.revY === 0 && Math.abs(this.l1) < 2.4 && Math.abs(this.y - this.hy) >= 45 && Math.abs(this.x - this.hx) < Math.abs(this.y - this.hy) * 0.7) { this.vertical = this.y < this.hy ? -1 : 1; this.decided = 'corner'; return 'corner'; }
    // one out-and-back stroke is a short scribble
    if (this.revX + this.revY === 1 && this.path >= 100 && Math.abs(this.l1) < 1.5) { const w = this.maxX - this.minX, h = this.maxY - this.minY;
      if (this.revY === 1 && w < Math.max(26, h * 0.45)) { this.decided = 'scribbleY'; return this.decided; } if (this.revX === 1 && h < Math.max(26, w * 0.45)) { this.decided = 'scribbleX'; return this.decided; } }
    if ( this.revX + this.revY > 0 || d < c.flickPx || this.path > d * 1.25 || Math.abs(this.l1) > 1.2) return null;
    this.decided = Math.abs(this.y) > Math.abs(this.x) * 1.2 ? (this.y < 0 ? 'up' : 'down') : Math.abs(this.x) > Math.abs(this.y) * 1.2 ? (this.x > 0 ? 'right' : 'left') : 'slash'; return this.decided; }
  // how fast the stroke was drawn, in px/s
  get speed() { return this.t0 === null ? 0 : this.path / Math.max(16, this.lastMove - this.t0) * 1000; }
  settle(t) { return this.t0 !== null && !this.decided && t - this.lastMove >= this.c.idleMs ? this.flick() : null; }    // call every frame
  end() { return this.flick(); }                                                                                        // call when the finger lifts
}

// Two thumbs moving together. Feed it both strokes whenever either moves.
// Reports 'engage' once they are in step, 'spread' when they move apart,
// and otherwise whatever Shape reads from their shared motion.
export class Duo {
  constructor(cfg, shapeCfg) { this.cfg = cfg; this.shape = new Shape(shapeCfg); this.sync = 0; this.peak = 0; this.lastT = null; this.active = false; this.decided = null; this.px = null; }
  update(a, b, t) {
    const c = this.cfg, dt = this.lastT === null ? 0 : Math.min(100, t - this.lastT); this.lastT = t;
    if (this.px === null) { this.sep0 = Math.hypot(a.x - b.x, a.y - b.y); this.ta0 = a.turn; this.tb0 = b.turn; this.ax0 = a.x; this.ay0 = a.y; this.bx0 = b.x; this.by0 = b.y; this.pa0 = a.path; this.pb0 = b.path; }
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ddx = this.px === null ? 0 : mx - this.px, ddy = this.px === null ? 0 : my - this.py; this.px = mx; this.py = my;
    const sa = a.speedAt(t), sb = b.speedAt(t), moving = sa > c.minSpeed && sb > c.minSpeed, cos = moving ? (a.vx * b.vx + a.vy * b.vy) / (sa * sb) : 0;
    const mirror = moving && a.vx * b.vx < 0 && Math.abs(a.vx) > Math.abs(a.vy) * 0.8 && Math.abs(b.vx) > Math.abs(b.vy) * 0.8;
    const ta = a.turn - this.ta0, tb = b.turn - this.tb0, circling = moving && Math.abs(ta) > 1.2 && Math.abs(tb) > 1.2;
    if (moving && (cos > c.parallelCos || mirror || circling)) this.sync += dt; else if (!this.active) this.sync = Math.max(0, this.sync - dt * 2);
    if (this.sync > this.peak) this.peak = this.sync;
    let ev = null; const was = this.active;
    if (!this.active && this.sync >= c.engageMs) this.active = true;
    // the shared motion is read from the start of the stroke, so a quick flick is not lost while waiting to engage
    const se = ddx !== 0 || ddy !== 0 ? this.shape.add(ddx, ddy, 0, t) : null;                // a thumb resting on the glass is not motion
    if (!this.active) { if (se) this.pending = se; return null; }
    if (!this.decided) {
      const sep = Math.hypot(a.x - b.x, a.y - b.y) - this.sep0, common = Math.hypot(this.shape.x, this.shape.y);
      // circling thumbs are steering or rotating, not a shared gesture
      const calm = Math.abs(ta) < c.calmTurn + 0.005 * (a.path - this.pa0) && Math.abs(tb) < c.calmTurn + 0.005 * (b.path - this.pb0), da = Math.hypot(a.x - this.ax0, a.y - this.ay0), db = Math.hypot(b.x - this.bx0, b.y - this.by0);
      if (!calm) { this.pending = null; return was ? null : 'engage'; }
      if (sep >= c.spreadPx && common < sep * 0.5 && Math.abs(ta) < 1 && Math.abs(tb) < 1 && da >= c.spreadEachPx && db >= c.spreadEachPx) ev = 'spread';
      else if (se && se !== 'beat' && se !== 'corner' && se !== 'eight') ev = se; else if (this.pending && this.pending !== 'corner' && this.pending !== 'eight') ev = this.pending;
      if (ev) { this.decided = ev; this.pending = null; return was ? ev : ['engage', ev]; }
    } else if (se === 'beat') return 'beat';
    return was ? null : 'engage';
  }
  settle(t) { if (!this.active || this.decided) return null; const e = this.shape.settle(t); if (e) this.decided = e; return e; }
  end() { if (!this.active || this.decided) return null; const e = this.shape.end(); if (e) this.decided = e; return e; }
  summary() { return this.peak > 0 ? { sync: Math.round(this.peak), read: this.decided || (this.active ? 'engaged' : 'no'), cx: Math.round(this.shape.x), cy: Math.round(this.shape.y), revX: this.shape.revX, revY: this.shape.revY } : null; }
}
