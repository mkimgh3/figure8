// The flick reader (Swipe) against Mark's recorded right-thumb strokes from his first playtest, plus made-up strokes for
// the edges, and the rest and rotation measures that Stroke keeps.
import fs from 'node:fs';
import { Stroke, Swipe } from '../js/input/recognizer.js';
import { CFG } from '../js/config.js';
let failed = 0;
const ok = (name, cond, info) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : ''));
  if (!cond) failed++;
};
const TAU = Math.PI * 2,
  FX = JSON.parse(fs.readFileSync(new URL('./fixtures/session1.json', import.meta.url)));
// a recorded stroke as [x, y, ms] samples
const samples = (f) => {
  const out = [];
  for (let i = 0; i < f.pts.length; i += 3) out.push([f.x0 + f.pts[i], f.y0 + f.pts[i + 1], f.pts[i + 2]]);
  return out;
};
const line = (x0, y0, x1, y1, ms, t0 = 0, n = 12) =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, t0 + (ms * i) / n]);
const circ = (cx, cy, r, turns, ms, n = 60) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (turns * TAU * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, (ms * i) / n];
  });
// Plays one finger's path through a Stroke and a Swipe the way tricks.js does: a reading tried every 16 ms frame while it
// is down, then `hold` ms more of stillness, then (if `lift`) one last reading as it lifts.
function play(pts, hold = 0, lift = true) {
  const s = new Stroke(pts[0][0], pts[0][1], pts[0][2], CFG.rotate),
    w = new Swipe(CFG.swipe),
    reads = [],
    pending = [];
  let t = pts[0][2];
  const frame = (f) => {
    const r = w.read(f, false);
    if (r) reads.push(Object.assign({ t: f, lifted: false }, r));
    pending.push([f, w.pending()]);
  };
  for (const p of pts.slice(1)) {
    for (let f = t + 16; f < p[2]; f += 16) frame(f);
    t = p[2];
    const x = s.x,
      y = s.y;
    s.add(p[0], p[1], p[2]);
    if (s.x !== x || s.y !== y) w.add(s.x - x, s.y - y, p[2]);
  }
  for (let f = t + 16; f <= t + hold; f += 16) frame(f);
  if (lift) {
    const r = w.read(t + hold + 1, true);
    if (r) reads.push(Object.assign({ t: t + hold + 1, lifted: true }, r));
  }
  return { reads, dir: reads.length ? reads[0].dir : undefined, w, s, pending };
}

// --- his real flicks
for (const [name, want] of [
  ['flickUp', 'up'],
  ['flickDown', 'down'],
  ['flickLeft', 'left'],
  ['flickRight', 'right'],
]) {
  const lifted = play(samples(FX[name]));
  ok(`real ${name}, lifted at once -> ${want}`, lifted.dir === want && lifted.reads.length === 1, lifted.reads);
  const held = play(samples(FX[name]), 400, false);
  ok(`real ${name}, kept down -> ${want} once it is still`, held.dir === want && !held.reads[0].lifted, held.reads);
}
// --- his real strokes that are not flicks
for (const name of ['scribbleX', 'scribbleY', 'scribbleYlong', 'unintendedSpin', 'unintendedSpin2', 'jumpRotation']) {
  const r = play(samples(FX[name]));
  ok(
    `real ${name} is no flick`,
    r.reads.every((q) => q.dir === null),
    r.reads.map((q) => q.dir),
  );
}

// --- made-up strokes
{
  const r = play(line(300, 600, 300, 450, 500));
  ok('a slow straight drag (150 px in 500 ms) is no flick', r.dir === null, r.reads);
  // its first movement is the second sample, 42 ms in; give it one more sample past flickMs from there
  const after = r.pending.filter(([f]) => f > 42 + CFG.swipe.flickMs + 42);
  ok(
    'and stops being a possible flick once it has gone on longer than flickMs',
    after.length > 0 && after.every(([, p]) => !p),
  );
}
{
  const r = play(line(300, 600, 300, 480, 120), 300, false),
    during = r.pending.filter(([f]) => f > 20 && f < 120);
  ok(
    'a quick flick is a possible flick while it moves, and until it is read',
    during.every(([, p]) => p),
    during,
  );
  ok(
    'and is read once, 110 ms after it stops',
    r.reads.length === 1 && r.reads[0].t >= 120 + CFG.swipe.idleMs,
    r.reads,
  );
}
ok('a quick diagonal is no flick', play(line(290, 560, 360, 490, 100)).dir === null);
ok('a circle is no flick', play(circ(290, 560, 40, 1, 800)).dir === null);
ok(
  'one quick out-and-back stroke is no flick',
  play([...line(300, 600, 300, 500, 100), ...line(300, 500, 300, 600, 100, 100).slice(1)]).dir === null,
);
{
  // a twitch, stillness, then a flick: the twitch is the finger settling, not the start of the stroke
  const r = play([[300, 600, 0], [308, 600, 20], ...line(308, 600, 308, 500, 100, 260)], 0);
  ok('a twitch under restPx, then still, then a flick -> the flick', r.dir === 'up', r.reads);
}
{
  const r = play(line(300, 600, 330, 600, 80));
  ok('a short quick stroke, lifted, is read as no flick', r.dir === null && r.reads.length === 1, r.reads);
}

// --- Stroke: how long the finger rested before it moved, and in-air rotation as counted in his session
const stroked = (p) => {
  const s = new Stroke(p[0][0], p[0][1], p[0][2], CFG.rotate);
  for (const q of p.slice(1)) s.add(q[0], q[1], q[2]);
  return s;
};
for (const name of ['unintendedSpin', 'unintendedSpin2', 'jumpRotation']) {
  const s = stroked(samples(FX[name]));
  ok(`real ${name} moved at once -> rest under 100 ms`, s.restMs < 100, s.restMs);
}
{
  const p = [
      [326, 560, 0],
      [326, 560, 100],
      [326, 560, 200],
      ...circ(290, 560, 36, 1, 800)
        .map((q) => [q[0], q[1], q[2] + 300])
        .slice(1),
    ],
    s = stroked(p);
  ok(
    'rest 300 ms then circle -> the rest is measured, and the circle still counts',
    s.restMs >= 280 && s.restMs < 400 && Math.abs(s.turn) > CFG.twirl.startTurn,
    { rest: s.restMs, turn: +s.turn.toFixed(2) },
  );
}
{
  const s = stroked(samples(FX.jumpRotation));
  ok(
    'real in-air rotation counts the same as it did in his session',
    Math.abs(Math.abs(s.turn) / TAU - FX.jumpRotation.countedTurns) < 0.03,
    +(Math.abs(s.turn) / TAU).toFixed(2),
  );
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
