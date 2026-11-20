// The points (scoring.js) and the moves' own scoring as the skater runs them (moves cut short, the repeat penalty, the
// speed bonus, choreography), on a made-up clock so nothing here is flaky.
import { createScoring, jumpBase } from '../js/scoring.js';
import { createSkater } from '../js/sim/skater.js';
import { createTurn, createLeap, createStop } from '../js/moves/quick.js';
import { createSpiral } from '../js/moves/held.js';
import { createDance } from '../js/moves/dance.js';
import { CFG } from '../js/config.js';
let failed = 0;
const ok = (name, cond, info) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : ''));
  if (!cond) failed++;
};
const P = CFG.points,
  near = (a, b, e = 0.051) => Math.abs(a - b) < e;

// ---- base values of jumps
ok('a double Axel is worth the Axel row at two', jumpBase({ name: 'Double Axel', type: 'Axel', target: 2.5 }) === 3.3);
ok('a triple toe loop', jumpBase({ name: 'Triple toe loop', type: 'Toe loop', target: 3 }) === 4.2);
ok('a waltz jump', jumpBase({ name: 'Waltz jump', type: 'Axel', target: 0.5 }) === P.waltz);
ok('a half loop', jumpBase({ name: 'Half loop', type: 'Loop', target: 0.5 }) === P.half);
ok('no name, no points', jumpBase({ name: '', type: 'Toe loop', target: 0 }) === 0);

// ---- the score sheet. Elements go in at times set by tick(); `el` scores a 1-point element of a kind and name.
function sheet() {
  const sc = createScoring();
  return {
    sc,
    at(dt) {
      sc.tick(dt);
      sc.mark();
    },
    el(name, kind) {
      return sc.element({ kind: kind || 'spiral', name, base: 1 });
    },
  };
}
{
  const s = sheet();
  s.at(0);
  const a = s.el('Spiral');
  s.at(5);
  const b = s.el('Spiral');
  s.at(5);
  const c = s.el('Spiral');
  ok('the same element again is marked down: 0.7, then 0.5', a.goe === 0 && near(b.goe, -0.3) && near(c.goe, -0.5), [
    a.goe,
    b.goe,
    c.goe,
  ]);
}
{
  const s = sheet();
  s.at(0);
  s.el('Spiral');
  s.at(5);
  s.el('Hydroblade', 'hydro');
  s.at(5);
  const a2 = s.el('Spiral');
  s.at(5);
  const b2 = s.el('Hydroblade', 'hydro');
  ok('taking turns at two elements no longer dodges it (A, B, A, B)', near(a2.goe, -0.3) && near(b2.goe, -0.3), [
    a2.goe,
    b2.goe,
  ]);
}
{
  const s = sheet();
  s.at(0);
  s.el('Spiral');
  s.at(P.repeatWindow + 1);
  const again = s.el('Spiral');
  ok('after repeatWindow seconds it is new again', again.goe === 0, again.goe);
}
{
  const s = sheet();
  s.at(0);
  s.el('Spiral');
  s.at(2);
  s.sc.jump({ grade: 'fall', name: 'Double toe loop' });
  s.at(2);
  const after = s.el('Spiral');
  ok('a fall starts the count afresh', after.goe === 0, after.goe);
}
{
  const s = sheet();
  s.at(0);
  const j1 = s.sc.jump({ name: 'Double toe loop', type: 'Toe loop', target: 2, grade: 'clean' });
  s.at(1);
  const j2 = s.sc.jump({ name: 'Double toe loop', type: 'Toe loop', target: 2, grade: 'stumble' });
  ok('a stumbled jump counts as that jump again', j2 && /stumbled/.test(j2.name), j2 && j2.name);
  ok('two jumps in a row make one combination', j2 && / \+ /.test(j2.name) && s.sc.state.list.length === 1, [
    j1.name,
    j2 && j2.name,
  ]);
}
{
  const s = sheet(),
    names = ['Single toe loop', 'Single loop', 'Single Salchow', 'Waltz jump'];
  names.forEach((name, i) => {
    s.at(i ? 1 : 0);
    s.sc.jump({ name, type: i === 3 ? 'Axel' : 'Toe loop', target: i === 3 ? 0.5 : 1, grade: 'clean' });
  });
  const l = s.sc.state.list;
  ok(
    'a combination stops at three jumps; the fourth starts a new element',
    l.length === 2 && l[1].name.split(' + ').length === P.comboMax && l[0].name === 'Waltz jump',
    l.map((e) => e.name),
  );
}
{
  const s = sheet();
  s.at(0);
  s.el('Spiral');
  s.at(1);
  const linked = s.el('Three-turn', 'turn');
  ok('a new kind within the chain window adds artistry', near(linked.art, P.artistry * 2), linked.art);
  const total = s.sc.state.total;
  s.at(1);
  const f = s.sc.jump({ grade: 'fall' });
  ok('a fall costs a point', near(s.sc.state.total, total + P.fall) && f.pts === P.fall, [total, s.sc.state.total]);
}
{
  const s = sheet();
  s.at(0);
  s.sc.jump({ grade: 'fall' });
  ok('a fall never takes the total below zero', s.sc.state.total === 0, s.sc.state.total);
}

// ---- the moves on the skater: what they report when they end, and the speed they earn
function rig() {
  const out = [];
  const game = createSkater((type, d) => type === 'element' && out.push(d)),
    S = game.S;
  S.vz = 6;
  S.facing = 0;
  const step = (s, steer) => {
    for (let k = 0; k < s / 0.016; k++) game.update(0.016, steer || { x: 0, y: 0.6 });
  };
  return { game, S, out, step };
}
{
  const r = rig();
  r.game.startMove(createTurn(r.S, r.game));
  r.step(0.12);
  const back0 = r.S.back;
  r.game.startMove(createSpiral(r.S, r.game));
  ok('a three-turn cut short before half way does not happen', r.out.length === 0 && r.S.back === back0, r.out);
}
{
  const r = rig();
  r.game.startMove(createTurn(r.S, r.game));
  r.step(0.33);
  const back0 = r.S.back;
  r.game.startMove(createSpiral(r.S, r.game));
  const e = r.out[0];
  ok(
    'past half way it does, worth the share she made',
    e && e.kind === 'turn' && e.base < P.turn && e.base > P.turn * 0.5 && r.S.back !== back0,
    e,
  );
}
{
  const r = rig();
  r.game.startMove(createLeap(r.S, r.game));
  r.step(0.2);
  r.game.startMove(createSpiral(r.S, r.game));
  ok('a split leap cut short before its top does not count', r.out[0] && r.out[0].counted === false, r.out[0]);
}
{
  const r = rig();
  r.game.startMove(createStop(r.S, r.game, 1));
  r.step(0.1);
  r.game.startMove(createSpiral(r.S, r.game));
  ok('a hockey stop cut short at speed does not count', r.out[0] && r.out[0].counted === false, r.out[0]);
}
{
  const r = rig();
  r.game.startMove(createSpiral(r.S, r.game));
  r.step(1.5);
  r.game.crash(0, -1, 'a rock');
  ok('a spiral ended by a crash counts for nothing', r.out[0] && r.out[0].counted === false, r.out[0]);
}
{
  const r = rig(),
    gains = [];
  for (let k = 0; k < 3; k++) {
    r.game.startMove(createTurn(r.S, r.game));
    r.step(0.6);
    gains.push(r.out[k].speedGain);
    r.S.bonus = 0;
  }
  const f = CFG.bonus.repeat;
  ok(
    'three-turns in a row earn less speed each time',
    near(gains[1], gains[0] * f, 0.02) && near(gains[2], gains[0] * f * f, 0.02),
    gains,
  );
}
// choreography: worth more for what she does than for how long the finger stays down
function dance(spin, steer, v0) {
  const r = rig(),
    d = createDance(r.S, r.game);
  r.S.vz = v0;
  r.game.startMove(d);
  for (let k = 0; k < 8 / 0.016; k++) {
    if (spin) d.rotate(spin * 0.016);
    r.game.update(0.016, steer);
  }
  r.game.endMove();
  return r.out[0];
}
{
  const idle = dance(0, { x: 0, y: 0 }, 2),
    lively = dance(9, { x: 0, y: 1 }, 6);
  ok('eight seconds of choreography count', idle && idle.counted !== false && lively && lively.counted !== false);
  ok(
    'spinning and travelling is worth clearly more than holding gestures',
    idle && lively && lively.base > idle.base * 1.6,
    [idle && +idle.base.toFixed(2), lively && +lively.base.toFixed(2)],
  );
  ok('and never more than the most choreography is worth', lively && lively.base <= P.dance[0], lively && lively.base);
}

// hip hop (v3-look48): both thumbs moving at random brings it out; moving in step, the same way or mirrored, does not
function thumbs(kind) {
  const r = rig(),
    d = createDance(r.S, r.game);
  r.S.vz = 3;
  r.game.startMove(d);
  let a = 0;
  for (let k = 0; k < 3 / 0.016; k++) {
    a += 0.4 + Math.random();
    const b = kind === 'random' ? Math.random() * 6.283 : kind === 'mirror' ? Math.PI - a : a;
    // speeds 400 px/s each; cos of the angle between them, and with the left one mirrored
    d.feed(400, 0.016, 400, Math.cos(a - b), -Math.cos(a + b));
    r.game.update(0.016, { x: 0, y: 0.3 });
  }
  return { hip: d.state.hip, sync: +d.state.sync.toFixed(2), d, r };
}
{
  const rnd = thumbs('random'),
    same = thumbs('same'),
    mir = thumbs('mirror');
  ok('thumbs moving at random: hip hop', rnd.hip, rnd.sync);
  ok('thumbs moving the same way: no hip hop', !same.hip && same.sync > 0.9, same.sync);
  ok('thumbs mirrored like a pair of arms: no hip hop', !mir.hip && mir.sync > 0.9, mir.sync);
  ok('hip hop leaves her steering to the left thumb in full (v3-look61)', rnd.d.steer === 1 && same.d.steer === 1);
  rnd.r.game.endMove();
  const e = rnd.r.out[0];
  ok('and is named in the element', e && /hip hop/.test(e.detail), e && e.detail);
}

// ---- choreography combinations (v3-look61)
{
  const sc = createScoring();
  sc.tick(1);
  sc.choreo({ kind: 'dance', choreo: true, counted: true, base: 1.5, parts: ['Arabesque', 'Camel spin'] });
  ok('a dance is not scored at once', sc.state.list.length === 0 && sc.choreoDue(false) === null);
  sc.tick(2);
  sc.mark();
  const j = sc.jump({ grade: 'perfect', name: 'Double Axel', type: 'Axel', target: 2.5, offDeg: 2 });
  sc.choreoJump(j, { name: 'Double Axel' });
  sc.tick(1);
  sc.choreo({ kind: 'dance', choreo: true, counted: true, base: 1, parts: ['Camel spin', 'Robot'] });
  const before = sc.state.total;
  sc.tick(CFG.choreo.window - 0.5);
  const early = sc.choreoDue(false);
  sc.tick(1);
  const e = sc.choreoDue(false);
  ok(
    'dances and a jump within the window make one combination, scored when it closes',
    early === null && e && e.name === 'Arabesque + Camel spin + Double Axel + Robot',
    e && e.name,
  );
  ok(
    'all artistry: no base or GOE, what the dances are worth plus jumpArt of the jump',
    e && e.base === 0 && e.goe === 0 && Math.abs(e.art - (2.5 + CFG.choreo.jumpArt * j.pts)) < 0.11,
    e && [e.art, j.pts],
  );
  ok('and it is added to the total', Math.abs(sc.state.total - before - e.art) < 0.01, [before, sc.state.total]);
  const sc2 = createScoring();
  sc2.choreo({ kind: 'dance', choreo: true, counted: true, base: 1, parts: ['Fan'] });
  sc2.tick(CFG.choreo.window + 5);
  ok('dancing keeps the window open', sc2.choreoDue(true) === null && sc2.choreoLeft() === 1);
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
