// The trick finger (tricks.js) driving the real skater (sim/skater.js), frame by frame on a made-up clock, so timing is
// exact and nothing here is flaky. Each check starts a fresh skater gliding along at speed with the left thumb steering.
import fs from 'node:fs';
import { createSkater } from '../js/sim/skater.js';
import { createTricks } from '../js/input/tricks.js';
import { TapTracker } from '../js/input/recognizer.js';
import { CFG } from '../js/config.js';
let failed = 0;
const ok = (name, cond, info) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : ''));
  if (!cond) failed++;
};
const TAU = Math.PI * 2,
  FX = JSON.parse(fs.readFileSync(new URL('./fixtures/session1.json', import.meta.url)));
// one of Mark's recorded right-thumb strokes, as [x, y] points
const real = (name) => {
  const f = FX[name],
    out = [];
  for (let i = 0; i < f.pts.length; i += 3) out.push([f.x0 + f.pts[i], f.y0 + f.pts[i + 1]]);
  return out;
};
const line = (x0, y0, x1, y1, n) =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
const circle = (cx, cy, r, turns, n) =>
  Array.from({ length: n + 1 }, (_, i) => [
    cx + Math.cos((turns * TAU * i) / n) * r,
    cy + Math.sin((turns * TAU * i) / n) * r,
  ]);
const still = (x, y, n) => Array.from({ length: n + 1 }, () => [x, y]);

// A skater heading along +z at about 7 m/s, steered by a half-pushed stick, and a trick finger on a 16 ms frame clock.
function rig() {
  const game = createSkater(() => {}),
    S = game.S,
    taps = new TapTracker(CFG.tap),
    logged = [];
  S.vz = 7;
  S.facing = 0;
  const tricks = createTricks(game, taps, {
    stroke: (role, read, s, extra) => logged.push(Object.assign({ read }, extra)),
  });
  let t = 1000,
    twoCalls = 0;
  tricks.onTwoThumb = () => twoCalls++;
  const seen = new Set();
  const tick = () => {
    t += 16;
    game.update(0.016, { x: 0, y: 0.6 });
    tricks.frame(t);
    if (S.move) seen.add(S.move.id);
  };
  const r = {
    game,
    S,
    tricks,
    taps,
    logged,
    seen,
    get t() {
      return t;
    },
    get twoCalls() {
      return twoCalls;
    },
    get move() {
      return S.move ? S.move.id : null;
    },
    wait(ms) {
      for (let k = 0; k < ms; k += 16) tick();
    },
    // the right thumb: down at a point (a double tap if `dbl`), then along a path one point per frame, then up
    down(p, dbl) {
      tricks.down(p[0], p[1], t, dbl === true && S.grounded && taps.isDouble(t));
    },
    up() {
      tricks.up(t);
    },
    leftDown(p) {
      tricks.leftDown(p[0], p[1], t);
    },
    leftUp() {
      tricks.leftUp(t);
    },
    // play paths for the right thumb (and the left one, if given), one point of each per frame
    play(right, left) {
      const n = Math.max(right.length, left ? left.length : 0);
      for (let i = 1; i < n; i++) {
        tick();
        if (i < right.length) tricks.move(right[i][0], right[i][1], t);
        if (left && i < left.length) tricks.leftMove(left[i][0], left[i][1], t);
      }
    },
    // a whole stroke: down at its first point, along it, held `hold` ms, lifted (unless hold is null)
    stroke(path, hold = 20) {
      r.down(path[0]);
      r.play(path);
      if (hold === null) return;
      r.wait(hold);
      r.up();
    },
    // A logged stroke (test/fixtures/session2.json), played at its own timing: the right thumb from (x0, y0), and the
    // left thumb, if logged, from where it was when the right one touched down. Notes when choreography started, and
    // whether she spun. The thumb lifts at the end.
    replay(f) {
      const tri = (a) => Array.from({ length: a.length / 3 }, (_, i) => a.slice(i * 3, i * 3 + 3)),
        R = tri(f.pts),
        L = f.left ? tri(f.left) : null,
        t0 = t,
        out = { danceAt: null, spun: false };
      if (L) tricks.leftDown(110, 620, t);
      tricks.down(f.x0, f.y0, t, false);
      const events = [...R.slice(1).map((p) => ['r', p]), ...(L ? L.slice(1).map((p) => ['l', p]) : [])];
      events.sort((a, b) => a[1][2] - b[1][2]);
      const note = () => {
        if (S.move && S.move.id === 'dance' && S.move.state.held) {
          if (out.danceAt === null) out.danceAt = t - t0;
          if (S.move.state.spin > 0) out.spun = true;
        }
      };
      for (const [who, p] of events) {
        while (t + 16 <= t0 + p[2]) {
          tick();
          note();
        }
        if (who === 'r') tricks.move(f.x0 + p[0], f.y0 + p[1], t);
        else tricks.leftMove(110 + p[0], 620 + p[1], t);
      }
      tick();
      note();
      tricks.up(t);
      if (L) tricks.leftUp(t);
      return out;
    },
    // a spin, left to wind down: the finger down until she dances, two quick circles, then lifted
    spinThenLift() {
      r.down([300, 560]);
      r.wait(CFG.dance.holdMs + 100);
      r.play(circle(300, 560, 40, 2, 50));
      r.up();
    },
  };
  r.wait(200);
  return r;
}

// --- one thumb: flicks
for (const [name, move] of [
  ['flickUp', 'spiral'],
  ['flickDown', 'hydro'],
  ['flickLeft', 'turn'],
  ['flickRight', 'leap'],
]) {
  const r = rig();
  r.stroke(real(name));
  r.wait(60);
  ok(`real ${name} -> ${move}`, r.seen.has(move) && !r.seen.has('dance'), [...r.seen]);
}
for (const rest of [0, 150, 250]) {
  const r = rig();
  r.down(real('flickDown')[0]);
  r.wait(rest);
  r.play(real('flickDown'));
  r.wait(600);
  ok(
    `flick down after resting ${rest} ms, kept down -> hydroblade, not choreography`,
    r.move === 'hydro' && !r.seen.has('dance'),
    { move: r.move, seen: [...r.seen] },
  );
}
{
  const r = rig();
  r.stroke(line(300, 600, 300, 450, 30));
  ok(
    'a slow straight drag (150 px in 480 ms) -> choreography, not a spiral',
    r.seen.has('dance') && !r.seen.has('spiral'),
    [...r.seen],
  );
}
{
  const r = rig();
  r.down([300, 560]);
  r.wait(CFG.dance.holdMs - 30);
  const before = r.move;
  r.wait(60);
  ok('a finger held still -> choreography after holdMs, not before', before === null && r.move === 'dance', {
    before,
    after: r.move,
  });
  r.play(circle(300, 560, 40, 3, 90));
  ok(
    'circling it inside choreography spins her (no twizzles)',
    r.move === 'dance' && r.S.move.state.spin > 0 && !r.seen.has('twirl'),
    r.S.move.state.spin,
  );
  r.up();
  r.wait(8000);
  ok(
    'lifting ends it (after the spin winds down), and it scores',
    r.move === null && r.logged.some((l) => l.read === 'dance'),
    r.move,
  );
}
// --- spiral and hydroblade (v3-look61): the left thumb pushes and steers in them as in plain skating, and they last
// while the right thumb stays down (until then they coasted, slowing, and ended as her speed ran down)
for (const [name, move] of [
  ['flickUp', 'spiral'],
  ['flickDown', 'hydro'],
]) {
  const r = rig();
  r.wait(2500);
  r.down(real(name)[0]);
  r.play(real(name));
  for (let k = 0; k < 30 && r.move !== move; k++) r.wait(16);
  r.S.vz *= 0.4;
  r.S.vx *= 0.4;
  const v0 = r.game.speed();
  r.wait(1500);
  ok(`${move}: the left thumb still pushes her`, r.move === move && r.game.speed() > v0 + 1, {
    v0: +v0.toFixed(1),
    v1: +r.game.speed().toFixed(1),
  });
  r.wait(4000);
  const still = r.move;
  r.up();
  r.wait(100);
  ok(`${move}: held while the right thumb stays down, and lifting ends it`, still === move && r.move !== move, {
    still,
    after: r.move,
  });
}
// The bug in Mark's playtest of v3-look34: with the left thumb steering (sweeping, or circling for tighter turns), the
// old two-thumb reader held back choreography, so the right thumb's circles did not spin her.
for (const [label, leftPath] of [
  ['still', still(110, 620, 180)],
  ['sweeping side to side', Array.from({ length: 181 }, (_, i) => [110 + 30 * Math.sin((i * 0.016 * TAU) / 1), 620])],
  ['circling for tight turns', circle(110, 620, 25, 4.3, 180)],
  ['pushing up, then still', Array.from({ length: 181 }, (_, i) => [110, 620 - Math.min(i, 40) * 1.6])],
]) {
  const r = rig();
  r.leftDown(leftPath[0]);
  r.down([340, 560]);
  r.play(circle(300, 560, 40, 3.6, 180), leftPath);
  ok(
    `right thumb circling while the left thumb is ${label} -> she spins`,
    r.move === 'dance' && r.S.move.state.spin > 0,
    { move: r.move, spin: r.S.move && r.S.move.state.spin },
  );
}
// Strokes from Mark's 17 Nov playtest (v3-look34) where the right thumb did nothing, replayed at their logged timing.
{
  const LOG = JSON.parse(fs.readFileSync(new URL('./fixtures/session2.json', import.meta.url)));
  {
    // v3-look35: his quick loops after a landing, each loop its own short touch
    const r = rig();
    r.stroke(still(300, 560, 2), 40);
    r.down([300, 560], true);
    r.up();
    for (let k = 0; k < 300 && (!r.S.grounded || r.S.move); k++) r.wait(16);
    r.wait(500);
    const t0 = r.t,
      outs = [];
    for (const s of LOG.loopsAfterJump.strokes) {
      r.wait(Math.max(0, t0 + s.at - r.t));
      outs.push(r.replay(s));
    }
    const first = outs.findIndex((o) => o.danceAt !== null),
      spunBy = outs.findIndex((o) => o.spun),
      reads = r.logged.slice(-outs.length).map((l) => l.read);
    ok(
      'his quick loops after a landing (each a separate touch) -> choreography during the first loop',
      first === 0 && outs[0].danceAt <= 200,
      { first, at: outs[0].danceAt },
    );
    ok('and she is spinning within three loops', spunBy >= 0 && spunBy <= 2, { spunBy });
    ok(
      'the loops make one choreography: each new touch takes it up',
      reads[0] === 'dance' && reads.slice(1).every((x) => x === 'dance-continue'),
      reads,
    );
  }
  for (const name of ['circlingWhileSteering', 'circlingAfterJump']) {
    const r = rig(),
      out = r.replay(LOG[name]);
    ok(
      `his ${name} stroke (nothing in v3-look34) -> choreography within 0.4 s, and she spins`,
      out.danceAt !== null && out.danceAt <= 400 && out.spun,
      out,
    );
  }
  {
    // the after-jump one, after a real jump: double tap, circle once, lift, land, then his stroke half a second later
    const r = rig();
    r.stroke(still(300, 560, 2), 40);
    r.down([300, 560], true);
    r.play(circle(300, 560, 40, 1, 30));
    r.up();
    for (let k = 0; k < 300 && (!r.S.grounded || r.S.move); k++) r.wait(16);
    r.wait(500);
    const out = r.replay(LOG.circlingAfterJump);
    ok(
      'the same stroke half a second after a landing -> choreography within 0.4 s, and she spins',
      out.danceAt !== null && out.danceAt <= 400 && out.spun,
      out,
    );
  }
  for (const [name, move] of [
    ['flickDownInWindDown', 'hydro'],
    ['flickRightInWindDown', 'leap'],
  ]) {
    const r = rig();
    r.spinThenLift();
    r.wait(500);
    const winding = r.move === 'dance' && !r.S.move.state.held && r.S.move.state.spin > 0;
    r.seen.clear();
    r.replay(LOG[name]);
    r.wait(300);
    ok(`his ${name} (ignored in v3-look34) -> ${move}, ending the spin`, winding && r.seen.has(move), {
      winding,
      seen: [...r.seen],
    });
  }
  {
    const r = rig();
    r.spinThenLift();
    r.wait(500);
    r.down([300, 560]);
    const took = r.move === 'dance' && r.S.move.state.held;
    r.play(circle(300, 560, 40, 2, 50));
    ok(
      'touching down while a spin winds down still takes it up, and circling carries the spin on',
      took && r.move === 'dance' && r.S.move.state.spin > 0,
      { took, spin: r.S.move && r.S.move.state.spin },
    );
    r.up();
  }
  {
    const r = rig();
    r.spinThenLift();
    r.wait(500);
    r.stroke(still(300, 560, 2), 40);
    r.wait(100);
    r.down([300, 560], true);
    ok('a double tap while a spin winds down still jumps', !r.S.grounded, r.move);
  }
}
// --- jumps
{
  const r = rig();
  r.stroke(still(300, 560, 2), 40);
  r.wait(100);
  ok('a tap does not jump', r.S.grounded && r.S.jumps === 0);
  r.down([300, 560], true);
  ok('a second tap within doubleMs jumps', !r.S.grounded && r.S.jumps === 1);
  r.play(circle(300, 560, 40, 1, 30));
  ok('circling the finger in the air turns her', Math.abs(r.S.goal) / TAU > 0.9, +(r.S.goal / TAU).toFixed(2));
  // 1.2 turns lands as a fall: the finger waits until she is up
  for (let k = 0; k < 300 && (!r.S.grounded || r.S.move); k++) r.wait(16);
  r.wait(CFG.dance.afterLand * 1000 + 100);
  ok('kept down through the landing (and the fall) -> choreography once she is up', r.move === 'dance', {
    move: r.move,
    seen: [...r.seen],
  });
}
// --- the finger always follows the skater
{
  const r = rig();
  r.down([300, 560]);
  r.wait(400);
  const was = r.move;
  r.game.jump(1.45);
  r.play(circle(300, 560, 40, 1, 30));
  ok(
    'a launch pad while dancing: the finger still turns her in the air',
    was === 'dance' && Math.abs(r.S.goal) / TAU > 0.9,
    { was, turns: +(r.S.goal / TAU).toFixed(2) },
  );
  for (let k = 0; k < 300 && (!r.S.grounded || r.S.move); k++) r.wait(16);
  r.wait(CFG.dance.afterLand * 1000 + 100);
  ok('and dances again once she is back on the ice', r.move === 'dance', r.move);
}
{
  const r = rig();
  r.down([300, 560]);
  r.wait(400);
  r.game.crash(0, -1, 'a test');
  const fell = r.move;
  r.wait(CFG.fall.seconds * 1000 + 100);
  ok('a crash while dancing: she falls, and dances again when she is up', fell === 'fall' && r.move === 'dance', {
    fell,
    now: r.move,
  });
}
// --- twizzles and the split leap
{
  const r = rig();
  r.stroke(real('flickRight'));
  r.wait(300);
  r.stroke(circle(300, 560, 40, 2, 60));
  ok('a circle straight after a split leap -> twizzles', r.seen.has('twirl') && !r.seen.has('dance'), [...r.seen]);
}
{
  const r = rig();
  r.stroke(real('flickRight'));
  r.wait(800);
  r.down([300, 560]);
  r.wait(CFG.dance.holdMs + 60);
  ok(
    'a finger held still after a split leap -> choreography, without waiting out afterLeapMs',
    r.move === 'dance',
    r.move,
  );
}
// --- two thumbs
{
  const r = rig();
  r.leftDown([100, 600]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), line(100, 600, 100, 690, 6));
  r.wait(20);
  r.up();
  r.wait(40);
  ok(
    'both thumbs swiped down and lifted -> hockey stop, steering held',
    r.seen.has('stop') && !r.seen.has('hydro') && r.twoCalls === 1,
    { seen: [...r.seen], two: r.twoCalls },
  );
}
for (const pause of [0, 140, 200]) {
  const r = rig();
  r.leftDown([100, 600]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), line(100, 600, 100, 690, 6));
  r.wait(pause);
  r.up();
  r.wait(40);
  ok(
    `... and still a hockey stop when the lift comes ${pause} ms after the thumbs stop`,
    r.seen.has('stop') && !r.seen.has('hydro'),
    [...r.seen],
  );
}
{
  const r = rig();
  r.leftDown([100, 600]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), line(100, 600, 100, 690, 6));
  r.wait(CFG.swipe.idleMs + CFG.stop.liftMs - 60);
  const early = r.move;
  r.wait(200);
  ok('both thumbs swiped down and held -> hydroblade once liftMs has passed', early === null && r.move === 'hydro', {
    early,
    now: r.move,
  });
}
{
  const r = rig();
  r.leftDown([100, 600]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), line(100, 600, 100, 690, 6));
  r.leftUp();
  r.wait(300);
  ok('both swiped down and the left thumb lifted -> hockey stop', r.seen.has('stop'), [...r.seen]);
}
{
  const r = rig();
  r.leftDown([100, 600]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), line(100, 600, 102, 612, 6));
  r.wait(20);
  r.up();
  r.wait(40);
  ok(
    'a right flick down while the steering thumb drifts a little -> hydroblade, not a stop',
    r.seen.has('hydro') && !r.seen.has('stop') && r.twoCalls === 0,
    [...r.seen],
  );
}
{
  const r = rig();
  r.leftDown([160, 640]);
  r.down([300, 640]);
  r.play(line(300, 640, 350, 640, 7), line(160, 640, 110, 640, 7));
  r.wait(300);
  ok('thumbs spreading apart -> spread eagle', r.move === 'eagle' && r.twoCalls === 1, r.move);
}
{
  const r = rig();
  r.leftDown([160, 640]);
  r.down([300, 600]);
  r.play(line(300, 600, 380, 600, 8), circle(130, 640, 30, 1.5, 60));
  r.wait(200);
  ok(
    'a right flick right while the left thumb circles to steer -> split leap, not spread eagle',
    r.seen.has('leap') && !r.seen.has('eagle') && r.twoCalls === 0,
    [...r.seen],
  );
}
{
  const r = rig();
  r.leftDown([160, 640]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), circle(130, 640, 30, 1.5, 60));
  r.up();
  r.wait(40);
  ok(
    'a right flick down while the left thumb circles to steer -> hydroblade, not a hockey stop',
    r.seen.has('hydro') && !r.seen.has('stop'),
    [...r.seen],
  );
}
{
  const r = rig();
  r.leftDown([160, 640]);
  r.down([300, 640]);
  r.play(line(300, 640, 300, 560, 7), line(160, 640, 160, 560, 7));
  r.wait(300);
  ok('both thumbs swiped up -> spiral, steering held', r.move === 'spiral' && r.twoCalls === 1, r.move);
}
{
  const r = rig();
  const zig = (x, y) => [0, 1, 2, 3].flatMap((k) => line(x + (k % 2 ? 60 : 0), y, x + (k % 2 ? 0 : 60), y, 8));
  r.leftDown([100, 640]);
  r.down([260, 640]);
  r.play(zig(260, 640), zig(100, 640));
  ok('both thumbs scribbling together -> choreography, without waiting for the scribble to end', r.seen.has('dance'), [
    ...r.seen,
  ]);
}
{
  const r = rig();
  r.S.vx = 0;
  r.S.vz = 1;
  r.leftDown([100, 600]);
  r.down([300, 600]);
  r.play(line(300, 600, 300, 690, 6), line(100, 600, 100, 690, 6));
  r.up();
  r.wait(40);
  ok(
    'a hockey stop needs speed: too slow, nothing happens',
    !r.seen.has('stop') && r.logged.some((l) => l.read === 'stop-too-slow'),
    [...r.seen],
  );
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
