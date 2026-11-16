import { Stroke, TapTracker } from '../js/input/recognizer.js';
import { CFG } from '../js/config.js';
let failed = 0; const ok = (name, cond, info) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!cond) failed++; };
const TAU = Math.PI * 2;
// play a circle of `turns` at `radius` px and `tps` turns per second, sampled at `hz`
function circle(turns, radius, tps, hz = 60, cw = true) {
  const s = new Stroke(300 + radius, 500, 0, CFG.rotate); const n = Math.round(turns / tps * hz);
  for (let i = 1; i <= n; i++) { const a = (cw ? 1 : -1) * (i / n) * turns * TAU; s.add(300 + Math.cos(a) * radius, 500 + Math.sin(a) * radius, i * 1000 / hz); }
  return s;
}
for (const [turns, r, tps, hz] of [[1, 36, 1.2, 60], [2, 36, 2, 60], [3, 40, 3, 120], [1.5, 60, 1.5, 60], [2, 36, 2, 30]]) {
  const s = circle(turns, r, tps, hz), got = s.turn / TAU;
  ok(`circle ${turns} turns r${r} ${tps}tps @${hz}Hz counts within 0.12 turn`, Math.abs(got - turns) < 0.12, got.toFixed(2));
}
ok('counter-clockwise circle is negative', circle(1, 36, 1.2, 60, false).turn < -5);
ok('tiny circle (r 8) counts nothing', Math.abs(circle(3, 8, 3).turn) < 0.3, circle(3, 8, 3).turn.toFixed(2));
ok('small circle (r 16) counts nothing', Math.abs(circle(2, 16, 2).turn) < 0.5, circle(2, 16, 2).turn.toFixed(2));
{ const s = new Stroke(100, 100, 0, CFG.rotate); for (let i = 1; i <= 12; i++) s.add(100 + i * 10, 100, i * 16); ok('straight swipe has no rotation', Math.abs(s.turn) < 0.2, s.turn.toFixed(2)); }
{ const s = new Stroke(100, 100, 0, CFG.rotate); for (let k = 0; k < 6; k++) for (let i = 1; i <= 5; i++) s.add(100 + (k % 2 ? 5 - i : i) * 12, 100, (k * 5 + i) * 16); ok('side-to-side scribble has no rotation', Math.abs(s.turn) < 0.5, s.turn.toFixed(2)); }
{ const s = new Stroke(100, 100, 0, CFG.rotate); s.add(103, 101, 40); ok('still touch is a tap', s.isTap(120, CFG.tap)); ok('long press is not a tap', !s.isTap(600, CFG.tap)); }
{ const s = new Stroke(100, 100, 0, CFG.rotate); for (let i = 1; i <= 5; i++) s.add(100 + i * 8, 100, i * 16); ok('a swipe is not a tap', !s.isTap(100, CFG.tap)); }
{ const t = new TapTracker(CFG.tap); t.tap(1000); ok('second touch 200 ms later is a double tap', t.isDouble(1200)); ok('second touch 600 ms later is not', !t.isDouble(1600)); }
{ const s = circle(0.35, 36, 1.2); ok('a third of a loop stays under the spin threshold', Math.abs(s.turn) < CFG.spin.startTurn, s.turn.toFixed(2)); }
{ const s = circle(0.7, 36, 1.2); ok('0.7 loop passes the spin threshold', Math.abs(s.turn) >= CFG.spin.startTurn, s.turn.toFixed(2)); }
console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0);
