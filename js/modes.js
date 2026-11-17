// Ways to play besides free skating. Each mode owns the things it puts on the ice and is updated once a frame while it is on.
//   Jump park   launch pads all over the lake; skating over one throws her high, with time for more rotations
//   Race        a course ahead of her: coins to collect, hurdles to jump, blocks to steer round, a finish gate, all against the clock
// (The duet partner is in duet.js.)
import * as THREE from './render/three.js';
import { CFG } from './config.js';

const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
const solid = (color, emissive) => new THREE.MeshStandardMaterial({ color, emissive: emissive || 0, emissiveIntensity: emissive ? 0.6 : 0, roughness: 0.45, metalness: 0.2 });
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- Jump park
export function createPads(scene, game, say) {
  const K = CFG.modes.pads, S = game.S, group = new THREE.Group(); group.visible = false; scene.add(group);
  const pads = []; let cool = 0, t = 0;
  for (let i = 0; i < 9; i++) { const g = new THREE.Group(); g.rotation.x = -Math.PI / 2; g.position.y = 0.03;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(K.radius, 40), glow(0x39e6ff, 0.28)), rim = new THREE.Mesh(new THREE.RingGeometry(K.radius * 0.86, K.radius, 48), glow(0xcffaff, 0.95));
    const pulse = new THREE.Mesh(new THREE.RingGeometry(K.radius * 0.5, K.radius * 0.58, 40), glow(0xffffff, 0.8));
    [disc, rim, pulse].forEach((m) => { m.renderOrder = 1; g.add(m); }); group.add(g); pads.push({ g, pulse }); }
  // where the pad of a cell sits: the same place every visit
  const at = (cx, cz) => [(cx + 0.2 + 0.6 * hash(cx, cz)) * K.cell, (cz + 0.2 + 0.6 * hash(cz + 9.3, cx)) * K.cell];
  return { name: 'Jump park', hint: 'Skate over a glowing pad to be launched. Finger down and circle in the air.',
    on() { group.visible = true; cool = 0; }, off() { group.visible = false; }, line: () => '',
    pads: () => pads.map((p) => [p.g.position.x, p.g.position.z]),
    update(dt) { t += dt; cool -= dt; const cx = Math.floor(S.x / K.cell), cz = Math.floor(S.z / K.cell); let k = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const p = pads[k++], q = at(cx + i, cz + j); p.g.position.x = q[0]; p.g.position.z = q[1];
        const u = (t * 0.9 + k * 0.13) % 1; p.pulse.scale.setScalar(0.6 + u * 1.25); p.pulse.material.opacity = 0.8 * (1 - u);      // a ring that keeps rising out of the pad
        if (cool <= 0 && S.grounded && Math.hypot(S.x - q[0], S.z - q[1]) < K.radius && game.jump(K.boost)) { cool = K.cooldown; say('Launched!', 'finger down and circle', 1.2); } } } };
}

// ---- Race
// A course is drawn in its own frame: f metres forward from the start line, s metres to the side. par is the time to beat, in seconds.
const COURSES = [
  { name: 'Coin trail', par: 17, finish: 150, build(c) { for (let f = 10; f <= 142; f += 4) c.coin(f, 9 * Math.sin(f / 15)); } },
  { name: 'Hurdles', par: 16, finish: 140, build(c) { for (let i = 0; i < 5; i++) { const f = 26 + i * 23, s = (i % 2 ? 1 : -1) * 2.5; c.hurdle(f, s); c.coin(f, s, 2.3); for (let k = 1; k <= 3; k++) c.coin(f + k * 5.5, s * (1 - k / 2)); } } },
  { name: 'Slalom', par: 17, finish: 140, build(c) { for (let i = 0; i < 8; i++) { const f = 20 + i * 15, side = i % 2 ? 1 : -1; c.block(f, side * 1.2); c.coin(f, -side * 3.2); c.coin(f + 7.5, 0); } } },
];
export function createRace(scene, game, say, getTotal, bests) {
  const K = CFG.modes.race, S = game.S, group = new THREE.Group(); group.visible = false; scene.add(group);
  const pool = (n, make) => { const a = []; for (let i = 0; i < n; i++) { const m = make(); m.visible = false; group.add(m); a.push(m); } return a; };
  // a coin is a gold gem that reads from above as well as from the side, over a soft ring on the ice that marks its spot
  const coinGeo = new THREE.OctahedronGeometry(0.3), spotGeo = new THREE.RingGeometry(0.34, 0.46, 28); coinGeo.scale(1, 1.25, 1); spotGeo.rotateX(-Math.PI / 2);
  const coins = pool(40, () => { const g = new THREE.Group(), gem = new THREE.Mesh(coinGeo, solid(0xffd24a, 0xffa800)), spot = new THREE.Mesh(spotGeo, glow(0xffd24a, 0.5)); spot.renderOrder = 1; g.add(gem); g.add(spot); g.gem = gem; g.spot = spot; return g; });
  const hurdles = pool(6, () => { const g = new THREE.Group(), bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.14, 0.14), solid(0xff5a6e, 0xff2040)); bar.position.y = 0.5; g.add(bar);
    [-2.5, 2.5].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10), solid(0xffffff)); p.position.set(x, 0.3, 0); g.add(p); }); return g; });
  const blocks = pool(9, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 1.3, 7), solid(0xbfe6ff, 0x3a8fd0)); m.position.y = 0.65; return m; });
  const gate = (color) => { const g = new THREE.Group(); [-6, 6].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 12), solid(0xffffff)); p.position.set(x, 1.6, 0); g.add(p); });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.35, 0.12), solid(color, color)); bar.position.y = 3.1; g.add(bar);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.35), glow(color, 0.7)); line.rotation.x = -Math.PI / 2; line.position.y = 0.03; g.add(line); group.add(g); return g; };
  const startGate = gate(0x4be08a), finishGate = gate(0xffc83a);
  let ix = 0, o = { x: 0, z: 0, h: 0 }, items = [], state = 'idle', clock = 0, got = 0, total = 0, cleared = 0, pts0 = 0, wait = 0, prevF = 0, spinT = 0;
  const world = (f, s) => [o.x + Math.sin(o.h) * f + Math.cos(o.h) * s, o.z + Math.cos(o.h) * f - Math.sin(o.h) * s];
  const local = (x, z) => { const dx = x - o.x, dz = z - o.z; return [Math.sin(o.h) * dx + Math.cos(o.h) * dz, Math.cos(o.h) * dx - Math.sin(o.h) * dz]; };
  // lay the course out ahead of her, along the way she is going
  function lay() {
    const sp = game.speed(), c = COURSES[ix]; o = { h: sp > 0.5 ? Math.atan2(S.vx, S.vz) : S.facing, x: S.x, z: S.z }; const st = world(8, 0); o.x = st[0]; o.z = st[1];
    [coins, hurdles, blocks].forEach((a) => a.forEach((m) => { m.visible = false; })); items = []; let nc = 0, nh = 0, nb = 0;
    const put = (m, f, s, y) => { const p = world(f, s); m.position.x = p[0]; m.position.z = p[1]; if (y !== undefined) m.position.y = y; m.rotation.y = o.h; m.visible = true; return m; };
    c.build({ coin(f, s, y) { if (nc < coins.length) { const m = put(coins[nc++], f, s, 0); m.gem.position.y = y || 1; m.spot.position.y = 0.03; items.push({ kind: 'coin', f, s, y: y || 1, m }); } },
      hurdle(f, s) { if (nh < hurdles.length) items.push({ kind: 'hurdle', f, s, m: put(hurdles[nh++], f, s) }); },
      block(f, s) { if (nb < blocks.length) items.push({ kind: 'block', f, s, m: put(blocks[nb++], f, s) }); } });
    put(startGate, 0, 0); put(finishGate, c.finish, 0);
    state = 'ready'; clock = 0; got = 0; cleared = 0; total = items.filter((i) => i.kind === 'coin').length; prevF = local(S.x, S.z)[0];
    say(c.name, 'through the green gate to start', 2.2);
  }
  return { name: 'Race', hint: 'Collect coins, jump the hurdles, steer round the blocks. Jumps score too.',
    on() { group.visible = true; ix = 0; lay(); }, off() { group.visible = false; state = 'idle'; },
    get course() { return { name: COURSES[ix].name, state, clock, got, total, origin: o, finish: COURSES[ix].finish, items: items.map((i) => ({ kind: i.kind, f: i.f, s: i.s, y: i.y, done: !!i.done })) }; },
    line: () => (state === 'idle' ? '' : COURSES[ix].name + ' · ' + (state === 'ready' ? 'ready' : clock.toFixed(1) + ' s') + ' · ' + got + '/' + total + ' coins'),
    update(dt, emit, crash) {
      if (state === 'idle') return; spinT += dt; const c = COURSES[ix], l = local(S.x, S.z), f = l[0], s = l[1];
      for (const it of items) if (it.kind === 'coin' && !it.done) { it.m.gem.rotation.y = spinT * 3 + it.f; it.m.gem.position.y = it.y + 0.08 * Math.sin(spinT * 2.5 + it.f); }
      if (state === 'done') { wait -= dt; if (wait <= 0) { ix = (ix + 1) % COURSES.length; lay(); } return; }
      if (state === 'ready') { if (prevF < 0 && f >= 0 && Math.abs(s) < 7) { state = 'run'; clock = 0; pts0 = getTotal(); say('Go!', '', 0.7); } else if (Math.hypot(f, s) > K.stray) lay(); prevF = f; return; }
      clock += dt;
      for (const it of items) { if (it.done) continue;
        if (it.kind === 'coin') { if (Math.hypot(f - it.f, s - it.s) < K.reach && Math.abs(S.y + 1 - it.y) < 1.5) { it.done = true; it.m.visible = false; got++; } }
        // a hurdle is cleared in the air and knocks her down on the ice
        else if (it.kind === 'hurdle') { if (prevF < it.f && f >= it.f && Math.abs(s - it.s) < 2.6) { it.done = true;
          if (S.y > 0.35) { cleared++; emit('element', { kind: 'hurdle', name: 'Hurdle cleared', detail: '', base: K.hurdle }); } else { const sp = Math.max(0.1, game.speed()); crash(-S.vx / sp, -S.vz / sp, 'a hurdle'); } } }
        else if (it.kind === 'block') { const d = Math.hypot(f - it.f, s - it.s); if (d < 1.15 && S.y < 1.3) { const p = it.m.position, n = Math.max(0.01, Math.hypot(S.x - p.x, S.z - p.z)); crash((S.x - p.x) / n, (S.z - p.z) / n, 'an ice block'); } } }
      if (f >= c.finish) { state = 'done'; wait = K.nextAfter; const earned = getTotal() - pts0, bonus = got * K.coin + Math.max(0, c.par - clock) * K.second, best = bests[c.name], isBest = !(best > 0) || clock < best; if (isBest) bests[c.name] = +clock.toFixed(2);
        emit('element', { kind: 'race', name: c.name + ' finished', detail: clock.toFixed(1) + ' s' + (isBest ? ', best time' : '') + ' · ' + got + '/' + total + ' coins · ' + earned.toFixed(1) + ' from moves', base: Math.max(0.1, bonus) }); }
      else if (clock > K.timeout || Math.abs(s) > K.stray || f < -K.stray) lay();
      prevF = f;
    } };
}
