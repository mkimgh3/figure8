import fs from 'node:fs';
import { Stroke, Duo, Shape } from '../js/input/recognizer.js';
import { CFG } from '../js/config.js';
let failed = 0; const ok = (name, cond, info) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : '')); if (!cond) failed++; };
const TAU = Math.PI * 2, FX = JSON.parse(fs.readFileSync(new URL('./fixtures/session1.json', import.meta.url)));
const samples = (f) => { const out = []; for (let i = 0; i < f.pts.length; i += 3) out.push([f.x0 + f.pts[i], f.y0 + f.pts[i + 1], f.pts[i + 2]]); return out; };
// plays two finger paths (arrays of [x,y,ms]) through a Duo and returns the events it reports
function play(pa, pb) {
  const a = new Stroke(pa[0][0], pa[0][1], 0, CFG.rotate), b = new Stroke(pb[0][0], pb[0][1], 0, CFG.rotate), duo = new Duo(CFG.duo, CFG.shape), ev = [];
  const push = (e) => { if (!e) return; if (Array.isArray(e)) ev.push(...e); else ev.push(e); };
  const all = [...pa.slice(1).map((p) => [p, a]), ...pb.slice(1).map((p) => [p, b])].sort((u, v) => u[0][2] - v[0][2]); let t = 0;
  for (const [p, s] of all) { for (let f = t + 16; f < p[2]; f += 16) push(duo.settle(f)); t = p[2]; s.add(p[0], p[1], p[2]); push(duo.update(a, b, p[2])); }
  ev.beforeLift = ev.slice(); push(duo.end()); return { ev, a, b, duo };
}
// plays one finger path through a Shape, the way the trick finger does
function solo(pts, holdAfter = 0) {
  const s = new Stroke(pts[0][0], pts[0][1], 0, CFG.rotate), sh = new Shape(CFG.shape), ev = []; let t = 0;
  for (const p of pts.slice(1)) { for (let f = t + 16; f < p[2]; f += 16) { const e = sh.settle(f); if (e) ev.push(e); } t = p[2]; const x = s.x, y = s.y, d = s.add(p[0], p[1], p[2]); if (s.x !== x || s.y !== y) { const e = sh.add(s.x - x, s.y - y, d, p[2]); if (e) ev.push(e); } }
  for (let f = t + 16; f <= t + holdAfter; f += 16) { const e = sh.settle(f); if (e) ev.push(e); }
  ev.beforeLift = ev.slice(); const e = sh.end(); if (e) ev.push(e); return { ev, sh, s };
}
const shift = (pts, dx, dy = 0, dt = 0) => pts.map((p) => [p[0] + dx, p[1] + dy, p[2] + dt]);
const mirrorX = (pts, axis) => pts.map((p) => [2 * axis - p[0], p[1], p[2]]);
const line = (x0, y0, x1, y1, ms, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, ms * i / n]);
const still = (x, y, ms, n = 12) => Array.from({ length: n + 1 }, (_, i) => [x, y, ms * i / n]);
const circ = (cx, cy, r, turns, ms, cw = true, n = 60) => Array.from({ length: n + 1 }, (_, i) => { const a = (cw ? 1 : -1) * turns * TAU * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, ms * i / n]; });

// --- his real right-finger strokes, paired with a left thumb doing the same thing 180 px to the left
for (const [name, want] of [['scribbleX', 'scribbleX'], ['scribbleY', 'scribbleY'], ['scribbleYlong', 'scribbleY'], ['flickUp', 'up'], ['flickDown', 'down'], ['flickLeft', 'left'], ['flickRight', 'right']]) {
  const r = samples(FX[name]), res = play(shift(r, -180, 8, 12), r);
  ok(`real ${name}, both thumbs together -> ${want}`, res.ev.includes(want) && res.ev[0] === 'engage', res.ev);
}
// --- the same right-finger strokes with the left thumb resting must do nothing
for (const name of ['scribbleX', 'scribbleY', 'flickUp', 'flickDown', 'flickLeft', 'flickRight', 'unintendedSpin', 'jumpRotation']) {
  const r = samples(FX[name]), res = play(still(110, 620, r[r.length - 1][2]), r); ok(`real ${name}, left thumb resting -> nothing`, res.ev.length === 0, res.ev);
}
// --- a steering thumb drifting slowly while the right finger works must do nothing
{ const r = samples(FX.scribbleX), res = play(line(110, 620, 135, 600, r[r.length - 1][2]), r); ok('slow steering drift + right scribble -> nothing', res.ev.length === 0, res.ev); }
{ const r = circ(290, 560, 36, 2, 1000), res = play(line(110, 620, 150, 640, 1000, 40), r); ok('steering drift + right-finger circles -> nothing', res.ev.length === 0, res.ev); }
// --- synthetic pairs
ok('thumbs spreading apart -> spread', play(line(160, 600, 80, 600, 220), line(240, 600, 320, 600, 220)).ev.includes('spread'));
ok('circling thumbs are never read as a spread or a flick', play(circ(110, 600, 34, 1.2, 900, true), circ(290, 600, 34, 1.2, 900, false)).ev.every((e) => e === 'engage' || e === 'beat'), play(circ(110, 600, 34, 1.2, 900, true), circ(290, 600, 34, 1.2, 900, false)).ev);
ok('same-way circles are not an eight', !play(circ(110, 600, 34, 1.2, 900, true), circ(290, 600, 34, 1.2, 900, true)).ev.includes('eight'));
{ const r = solo([...line(290, 560, 360, 490, 100), [360, 490, 300]]); ok('one finger diagonal flick -> slash, drawn fast', r.ev.join() === 'slash' && r.sh.speed > 900, { ev: r.ev, speed: Math.round(r.sh.speed) }); }
ok('same-way circles are not a spiral gesture any more', play(circ(110, 600, 42, 2.2, 1800, true), circ(290, 600, 42, 2.2, 1800, true)).ev.every((e) => e === 'engage'), play(circ(110, 600, 42, 2.2, 1800, true), circ(290, 600, 42, 2.2, 1800, true)).ev);
{ const up = [...line(110, 600, 110, 520, 180), [110, 520, 400]]; const res = play(up, shift(up, 180)); ok('both up and hold -> up, decided while the fingers are still down', res.ev.beforeLift.join() === 'engage,up', res.ev); }
{ const pa = [...line(110, 600, 190, 600, 200), ...shift(line(190, 600, 110, 600, 200), 0, 0, 210), ...shift(line(110, 600, 190, 600, 200), 0, 0, 420), ...shift(line(190, 600, 110, 600, 200), 0, 0, 630)];
  const res = play(pa, shift(pa, 180)); ok('long scribble keeps reporting beats', res.ev.includes('scribbleX') && res.ev.includes('beat'), res.ev); }

// --- one finger alone: his real strokes
for (const [name, want] of [['scribbleX', 'scribbleX'], ['scribbleY', 'scribbleY'], ['scribbleYlong', 'scribbleY'], ['flickUp', 'up'], ['flickDown', 'down'], ['flickLeft', 'left'], ['flickRight', 'right']]) { const r = solo(samples(FX[name])); ok(`one finger, real ${name} -> ${want}`, r.ev.includes(want), r.ev); }
for (const name of ['unintendedSpin', 'unintendedSpin2', 'jumpRotation']) { const r = solo(samples(FX[name])); ok(`one finger, real ${name} (circling) -> nothing`, r.ev.length === 0, r.ev); }
{ const r = solo([...line(290, 560, 290, 480, 120), [290, 480, 400]], 0); ok('one finger flick up and hold -> up before lifting', r.ev.beforeLift.join() === 'up', r.ev); }
{ const r = solo([...line(250, 600, 310, 600, 120), ...shift(line(310, 600, 310, 530, 120), 0, 0, 125).slice(1)]); ok('one finger sideways then up -> corner (right, up)', r.ev.includes('corner') && r.sh.side === 1 && r.sh.vertical === -1, r.ev); }
{ const arc = (cx, a0, dir, t0) => Array.from({ length: 61 }, (_, i) => [cx + Math.cos(a0 + dir * TAU * i / 60) * 36, 560 + Math.sin(a0 + dir * TAU * i / 60) * 36, t0 + 900 * i / 60]);
  const r = solo([...arc(290, 0, 1, 0), ...arc(362, Math.PI, -1, 900).slice(1)]); ok('one finger loop then reverse loop -> eight', r.ev.includes('eight'), r.ev); }
{ const r = solo(circ(290, 560, 80, 1.5, 1500)); ok('one finger big circle -> nothing (not a corner, not a scribble)', r.ev.length === 0, r.ev); }

// --- spin arming: rest first, then circle
const rested = (f) => { const p = samples(f), s = new Stroke(p[0][0], p[0][1], 0, CFG.rotate); for (const q of p.slice(1)) s.add(q[0], q[1], q[2]); return s; };
for (const name of ['unintendedSpin', 'unintendedSpin2', 'jumpRotation']) { const s = rested(FX[name]); ok(`real ${name} moved at once (rest ${s.restMs} ms) -> does not arm a spin`, s.restMs < CFG.spin.holdMs, s.restMs); }
{ const p = [...still(326, 560, 300, 3), ...shift(circ(290, 560, 36, 1, 800), 0, 0, 300).slice(1)], s = new Stroke(p[0][0], p[0][1], 0, CFG.rotate); for (const q of p.slice(1)) s.add(q[0], q[1], q[2]);
  ok('rest 300 ms then circle -> arms, and half a loop passes the start threshold', s.restMs >= CFG.spin.holdMs && Math.abs(s.turn) > CFG.spin.startTurn, { rest: s.restMs, turn: +s.turn.toFixed(2) }); }
{ const s = rested(FX.jumpRotation); ok('real in-air rotation counts the same as it did in his session', Math.abs(Math.abs(s.turn) / TAU - FX.jumpRotation.countedTurns) < 0.03, +(Math.abs(s.turn) / TAU).toFixed(2)); }
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
