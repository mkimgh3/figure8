// Rolling ice (core/terrain.js) and the skater on it: flat when it is off, slopes that speed her up and slow her down,
// and jumps measured from the ice under her.
import { iceY, iceSlope, setTerrain, ICE_GLSL } from '../js/core/terrain.js';
import { track, ensureTrack, resetTrack, trackPoint, trackNear, across, lips, hillY, TUBE } from '../js/core/track.js';
const setWaves = (w) => setTerrain({ waves: w });
import { createSkater } from '../js/sim/skater.js';
import { CFG } from '../js/config.js';
let failed = 0;
const ok = (name, cond, info) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : ''));
  if (!cond) failed++;
};
const g = [0, 0];

// ---- the height field
setWaves(0);
ok('flat ice when the waves are off', iceY(12.3, -40) === 0 && iceSlope(5, 5, g)[0] === 0 && g[1] === 0);
setWaves(1);
{
  let lo = 9,
    hi = -9,
    steep = 0;
  for (let x = -200; x < 200; x += 0.9)
    for (let z = -200; z < 200; z += 0.9) {
      const h = iceY(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
      iceSlope(x, z, g);
      steep = Math.max(steep, Math.hypot(g[0], g[1]));
    }
  ok('it rises and falls by about one and a half metres either way', lo < -1 && hi > 1 && lo > -2 && hi < 2, [lo, hi]);
  ok('never steeper than about 32 degrees', steep > 0.3 && steep < 0.63, +steep.toFixed(3));
}
{
  // the slope agrees with the height
  const x = 7.7,
    z = -3.1,
    e = 0.01;
  iceSlope(x, z, g);
  const sx = (iceY(x + e, z) - iceY(x - e, z)) / (2 * e),
    sz = (iceY(x, z + e) - iceY(x, z - e)) / (2 * e);
  ok('the slope is the rise of the height', Math.abs(sx - g[0]) < 0.01 && Math.abs(sz - g[1]) < 0.01, [
    sx,
    g[0],
    sz,
    g[1],
  ]);
}
{
  // some stretches only roll gently, others are wavy
  const rough = (cx, cz) => {
    let s = 0;
    for (let k = 0; k < 400; k++) {
      iceSlope(cx + (k % 20), cz + Math.floor(k / 20), g);
      s += Math.hypot(g[0], g[1]);
    }
    return s / 400;
  };
  const a = rough(-100, 30),
    b = rough(140, 130);
  ok('gentle in some places, wavy in others', Math.max(a, b) > 2 * Math.min(a, b), [+a.toFixed(3), +b.toFixed(3)]);
}
ok(
  'the shaders get the same sum',
  /float iceRawD\(vec2 p, float d\)/.test(ICE_GLSL) && /float iceH\(vec2 p, float d\)/.test(ICE_GLSL),
);

// ---- the skater
function skate(x, z, heading, v, secs, steer) {
  const game = createSkater(() => {}),
    S = game.S;
  S.x = x;
  S.z = z;
  S.facing = heading;
  S.vx = Math.sin(heading) * v;
  S.vz = Math.cos(heading) * v;
  game.update(0.001, steer || { x: 0, y: 0 });
  return {
    game,
    S,
    run: (t) => {
      for (let k = 0; k < t / 0.016; k++) game.update(0.016, steer || { x: 0, y: 0 });
    },
  };
}
{
  // find a steep spot, and coast down it and up it
  let best = null;
  for (let x = 0; x < 60 && !best; x += 0.5)
    for (let z = 0; z < 60 && !best; z += 0.5) {
      iceSlope(x, z, g);
      if (Math.hypot(g[0], g[1]) > 0.18) best = { x, z, up: Math.atan2(g[0], g[1]) };
    }
  ok('there is a slope to try', !!best, best);
  if (best) {
    const down = skate(best.x, best.z, best.up + Math.PI, 3, 0),
      up = skate(best.x, best.z, best.up, 3, 0),
      flat = (() => {
        setWaves(0);
        const r = skate(best.x, best.z, best.up, 3, 0);
        r.run(0.3);
        setWaves(1);
        return r.game.speed();
      })();
    down.run(0.3);
    up.run(0.3);
    const vd = down.game.speed(),
      vu = up.game.speed();
    ok('downhill she speeds up, uphill she slows', vd > flat + 0.1 && vu < flat - 0.1, [
      +vd.toFixed(2),
      +flat.toFixed(2),
      +vu.toFixed(2),
    ]);
    ok('a slope never turns her', Math.abs(Math.atan2(up.S.vx, up.S.vz) - best.up) < 1e-6);
  }
}
{
  // stands on the ice wherever she is; jumps are measured from the ice under her and end when she meets it again
  const r = skate(3, 4, 0.7, 6, 0, { x: 0, y: 1 });
  r.run(1);
  ok(
    'on the ice she stands at its height',
    r.S.grounded && Math.abs(r.S.gy - iceY(r.S.x, r.S.z)) < 1e-9 && r.S.y === 0,
  );
  const lands = [];
  for (let k = 0; k < 6; k++) {
    r.game.jump();
    const t0 = r.S.clock;
    let low = 0;
    while (!r.S.grounded && r.S.clock - t0 < 3) {
      r.game.update(0.016, { x: 0, y: 1 });
      if (!r.S.grounded) low = Math.min(low, r.S.y);
    }
    lands.push(+(r.S.clock - t0).toFixed(2));
    ok('jump ' + (k + 1) + ': lands, never below the ice', r.S.grounded && low >= 0, { air: lands[k], low });
    r.run(0.8);
  }
  ok('over hollows and rises the jumps last different times', Math.max(...lands) - Math.min(...lands) > 0.015, lands);
}
setWaves(0);
{
  const r = skate(0, 0, 0, 5, 0);
  r.run(1);
  ok(
    'flat ice: coasting is as before (glide only)',
    Math.abs(r.game.speed() - 5 * Math.exp(-CFG.steer.glideDecay * 1)) < 0.05,
    r.game.speed(),
  );
}

// ---- the Canyon's run (v3-look56, core/track.js)
setTerrain(CFG.places.find((p) => p.canyon));
resetTrack();
ensureTrack(4000);
{
  const { X, Y, Z } = track,
    K = CFG.canyon;
  let up = 0,
    clash = 0,
    under = 0,
    low = Infinity;
  for (let j = 1; j < X.length; j++) {
    if (Y[j] > Y[j - 1] + 1e-9) up++;
    low = Math.min(low, Y[j] - hillY(Z[j]));
  }
  for (let j = 0; j < X.length; j += 2)
    for (let i = 0; i < j - 40; i += 2) {
      const d = Math.hypot(X[i] - X[j], Z[i] - Z[j]);
      if (d < K.apart - 2 && Y[i] - Y[j] < K.clear) clash++;
      if (d < 2 && Y[i] - Y[j] >= K.clear) under++;
    }
  ok('the run only ever goes downhill', up === 0, up);
  ok('it never comes near itself unless it passes well under', clash === 0, clash);
  ok('it spirals: it passes under itself', track.spirals.length >= 2 && under > 10, [track.spirals.length, under]);
  ok('it stays above the hillside', low > 5, +low.toFixed(1));
  const L = [0, 0],
    q = TUBE * Math.SQRT1_2;
  lips(0, L);
  ok(
    'across it: the round bottom of a tube, the same however it is banked',
    across(0, 0) === 0 &&
      Math.abs(across(q, 0) - TUBE * (1 - Math.SQRT1_2)) < 1e-9 &&
      across(-q, 0.3) === across(q, 0) &&
      Math.abs(L[1] - TUBE * Math.sin((CFG.canyon.reach * Math.PI) / 180)) < 1e-9 &&
      L[0] === -L[1],
    [across(q, 0), L],
  );
  let step = 0;
  for (let d = L[0]; d < L[1]; d += 0.01) step = Math.max(step, Math.abs(across(d + 0.01, 0) - across(d, 0)));
  ok('and the ice is all one surface up to as far as she can ride', step < 0.05, +step.toFixed(3));
  const P = trackPoint(777, {}),
    N = trackNear(P.x, P.z, {}, 777);
  ok(
    'the height field near her is the run: at its middle, the centre line',
    Math.abs(N.s - 777) < 0.05 && Math.abs(iceY(P.x, P.z) - P.y - across(0, P.bank)) < 1e-6,
    [N.s, iceY(P.x, P.z), P.y],
  );
}
function ride(steer, secs) {
  resetTrack();
  const g = createSkater(() => {}),
    S = g.S,
    P = trackPoint(2, {}),
    N = {},
    L = [0, 0];
  S.x = P.x;
  S.z = P.z;
  S.facing = P.th;
  S.vx = Math.sin(P.th) * 2;
  S.vz = Math.cos(P.th) * 2;
  let top = 0,
    out = 0;
  for (let t = 0; t < secs; t += 1 / 60) {
    let st = { x: 0, y: 0 };
    if (steer) {
      const A = trackPoint(track.hint + 8, {}),
        tx = A.x - S.x,
        tz = A.z - S.z,
        l = Math.hypot(tx, tz);
      st = { x: tx / l, y: tz / l };
    }
    g.update(1 / 60, st);
    top = Math.max(top, g.speed());
    trackNear(S.x, S.z, N);
    lips(N.bank, L);
    out = Math.max(out, N.d - L[1], L[0] - N.d);
  }
  return { top, out, s: track.hint };
}
{
  const r = ride(true, 90);
  ok(
    'steered down the run she passes 80 km/h and never 120',
    r.top * 3.6 > 80 && r.top <= CFG.canyon.top + 1e-9,
    +(r.top * 3.6).toFixed(1),
  );
  ok('and stays inside the tube, through its spirals', r.out <= 0 && r.s > 1600, [+r.out.toFixed(2), Math.round(r.s)]);
  const f = ride(false, 60);
  ok('let go, the tube keeps turning her back in and it carries her on down', f.out <= 0 && f.s > 600, [
    +f.out.toFixed(2),
    Math.round(f.s),
  ]);
}
setTerrain(null);

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
