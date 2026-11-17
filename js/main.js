// Wires the parts together and runs the frame loop. Game rules live in sim/, moves/, scoring.js and input/tricks.js.
import { CFG } from './config.js';
import { TAU } from './core/math.js';
import { TapTracker } from './input/recognizer.js';
import { createTricks } from './input/tricks.js';
import { createInput } from './input/pointers.js';
import { createSkater } from './sim/skater.js';
import { createScene } from './render/scene.js';
import { createModels } from './render/model.js';
import { loadAvatar } from './render/avatar.js';
import { createPoser } from './render/poses.js';
import { createTrace, PALETTES } from './render/trace.js';
import { createRing } from './render/ring.js';
import { createSpray } from './render/spray.js';
import { createIslands } from './render/islands.js';
import { createHud } from './ui/hud.js';
import { createTutorial } from './ui/tutorial.js';
import { createLog } from './log.js';
import { createScoring } from './scoring.js';
import * as save from './save.js';
import { createUpdater } from './update.js';
import { createPads, createRace } from './modes.js';
import { createDuet } from './duet.js';

const BUILD = 'v3-look23';
let world;
try { world = createScene(document.getElementById('c')); } catch (e) { document.getElementById('err').style.display = 'flex'; throw e; }
const saved = save.load();
const hud = createHud(world.coarse), log = createLog(BUILD), trace = createTrace(world.scene), ring = createRing(world.scene), spray = createSpray(world.scene), forest = createIslands(world.scene), models = createModels(world.scene);
// Tesa's realistic body loads in the background; until it arrives the simple figure stands in
// Each skater's realistic body (Microsoft Rocketbox avatars, MIT licence) loads in the background; until it arrives the simple figure stands in.
const avU = { uTime: { value: 0 }, uSparkle: { value: 1 } }, avatars = [null, null];
const texOf = (n) => ({ body: `assets/${n}_body.jpg`, bodyN: `assets/${n}_body_n.jpg`, mask: `assets/${n}_mask.png`, head: `assets/${n}_head.jpg`, headN: `assets/${n}_head_n.jpg`, hair: `assets/${n}_hair.webp` });
const showAvatar = () => avatars.forEach((a, i) => { if (!a) return; const on = models.index === i; a.visible = on; models.chars[i].inner.traverse((o) => { if (o.isMesh) o.visible = !on; }); });
// Tesa: a Scandinavian princess with white hair in a bun, slender and tall, in a pearl and lilac ball gown whose
// skirt reaches the ice and blooms open as she spins.
const AVA_SLIM = { Spine: -0.012, Spine1: -0.008, Pelvis: -0.006, Thigh: -0.01, Calf: -0.005, UpperArm: -0.006, Forearm: -0.003 };
const AVA_SKIRT = [{ length: 0.92, waist: [0.125, 0.095], rest: 19, open: 70, bell: 0.8, follow: 0.4, colours: [0xebe5f7, 0x8a74d4], opacity: 1, iridescence: 0.5, sheen: 0.7, sparkle: 0.6 },
  { length: 0.95, waist: [0.131, 0.101], rest: 22, open: 74, bell: 0.75, follow: 0.35, colours: [0xffffff, 0xc2b2ff], opacity: 0.4, iridescence: 0.9, sheen: 1, sparkle: 1.6 }];
const AV_OPTS = [{ url: 'assets/ava_model.js', tex: texOf('ava'), height: 1.72, skirt: AVA_SKIRT, inflate: AVA_SLIM, look: { iridescence: 0.8, sheen: 0xd9ccff, sparkle: 1, fabricSheen: true, skinRough: 0.85 } }, null];
loadAvatar(models, 0, AV_OPTS[0], avU, (a) => { avatars[0] = a; showAvatar(); });
// Ivor: tall, shirtless and muscular; the bulk is added along the normals, most on the chest, shoulders and arms
const MAX_BULK = { Spine2: 0.032, Spine1: 0.016, Spine: 0.002, Clavicle: 0.03, Neck: 0.034, UpperArm: 0.024, Forearm: 0.012, Thigh: 0.014, Calf: 0.009, RCheek: -0.004, LCheek: -0.004 };
// boulder shoulders: a round swell over each shoulder joint, and the traps rising toward the neck
const MAX_BUMPS = [{ bone: 'Bip01 L UpperArm', a: 0.042, r: 0.085, out: 0.02, up: 0.015 }, { bone: 'Bip01 R UpperArm', a: 0.042, r: 0.085, out: 0.02, up: 0.015 },
  { bone: 'Bip01 L UpperArm', mid: 'Bip01 Neck', a: 0.022, r: 0.06, up: 0.03 }, { bone: 'Bip01 R UpperArm', mid: 'Bip01 Neck', a: 0.022, r: 0.06, up: 0.03 }];
// his strawberry-blond dreadlocks: 22 heavy locks of 12 joints each (lengths in metres)
const MAX_HAIR = { count: 22, joints: 12, length: 0.52, radius: 0.023, keep: 0.989, drag: 0.8, bend: 0.5, windy: 0.4, colours: [0xd29a62, 0xefc08a, 0xf8dcae] };      // heavy locks: damped, stiff, barely stirred by wind
AV_OPTS[1] = { url: 'assets/max_model.js', tex: texOf('max'), height: 1.92, skirt: false, inflate: MAX_BULK, bumps: MAX_BUMPS, mantle: true, longHair: MAX_HAIR, camera: world.camera, look: { iridescence: 0, sheen: 0xffd2b0, sheenAmt: 0.25, rough: 0.46, sparkle: 0 } };
loadAvatar(models, 1, AV_OPTS[1], avU, (a) => { avatars[1] = a; a.night(CFG.looks[lookIx].night ? 1 : 0); showAvatar(); });
let avatar = null;
const pose = createPoser(models), taps = new TapTracker(CFG.tap), score = createScoring(saved && saved.sc);
let dirty = false;
const showScore = () => hud.score(score.state);
const tutorial = createTutorial();
let placeIx = 0, lookIx = 0;
const setLook = (i) => { lookIx = ((i % CFG.looks.length) + CFG.looks.length) % CFG.looks.length; world.setLook(CFG.looks[lookIx]); trace.glow(CFG.looks[lookIx].lineGlow || 1); trace.punch(CFG.looks[lookIx].linePunch || 1, CFG.looks[lookIx].lineWide || 1); avatars.forEach((a) => a && a.night(CFG.looks[lookIx].night ? 1 : 0)); duet.night(CFG.looks[lookIx].night ? 1 : 0); hud.text('timename', CFG.looks[lookIx].name); };
const showGfx = () => hud.text('gfxname', world.qualityName);
const setPlace = (i) => { placeIx = ((i % CFG.places.length) + CFG.places.length) % CFG.places.length; const p = CFG.places[placeIx]; world.setPlace(p); forest.set(p.trees); hud.text('placename', p.name); };

// What the skater reports, and what the rest of the game does about it.
const game = createSkater((type, d) => {
  tutorial.event(type, d);
  if (type === 'takeoff') { ring.start(d.yaw); score.mark(); }
  else if (type === 'land') {
    spray.emit(game.S.x, game.S.z, game.S.vx, game.S.vz, d.grade === 'fall' ? 40 : 22, 2.2, 6.3);
    const e = score.jump(d); log.jump(Object.assign({ pts: e ? e.pts : 0 }, d));
    if (d.grade === 'fall') hud.say('Fall', (d.name ? d.name + ' under-rotated' : 'bad landing') + ' · ' + d.offDeg + '° off', 2.4, e);
    else if (d.name) { hud.say(d.name + (d.grade === 'perfect' ? '!' : ''), d.grade + ' landing · ' + d.offDeg + '° off' + (d.target % 1 ? (d.back ? ' · now backward' : ' · now forward') : '') + (d.speedGain ? ' · top speed +' + Math.round(d.speedGain * 3.6) + ' km/h' : ''), 2.8, e); trace.rosette(game.S, Math.floor(d.target)); }
    dirty = true; showScore();
  } else if (type === 'spinning') { if (d.revs > 0.5) hud.say(d.position + ' spin', d.revs.toFixed(1) + ' revolutions', 0.3); }
  else if (type === 'say') hud.say(d.big, d.small, d.hold);
  else if (type === 'crash') { spray.emit(game.S.x, game.S.z, game.S.vx, game.S.vz, 40, 2.4, 6.3); const e = score.jump({ grade: 'fall', crash: 'ran into ' + d.what }); hud.say('Crash', 'ran into ' + d.what, 2.4, e); dirty = true; showScore(); }
  else if (type === 'element') {
    if (d.counted === false) { log.element(d); return; }
    const e = score.element(d); log.element(Object.assign({ pts: e.pts }, d)); hud.say(d.name, d.detail, 2.8, e); dirty = true; showScore();
  }
});
const S = game.S, tricks = createTricks(game, taps, log);
const setZoom = () => { const z = world.toggleZoom(); hud.text('zoom', z ? 'Zoom in' : 'Zoom out'); hud.board(z, score.state); if (z) { hud.stick(false); persist(); } last = performance.now(); };
const input = createInput(document.getElementById('c'), game, tricks, taps, world.view, hud, setZoom);

// Ways to play: free skating, or one of the modes (modes.js, duet.js). Race best times are kept with the save.
const bests = (saved && saved.rb) || {}, sayMode = (big, small, hold) => hud.say(big, small, hold);
const duet = createDuet(world.scene, game, (m, i, done) => loadAvatar(m, i, AV_OPTS[i], avU, done));
const MODES = [null, createPads(world.scene, game, sayMode), createRace(world.scene, game, sayMode, () => score.state.total, bests), duet];
let modeIx = 0, modeLineT = 0;
const setMode = (i, quiet) => { const n = MODES.length; if (MODES[modeIx]) MODES[modeIx].off(); modeIx = ((i % n) + n) % n; const m = MODES[modeIx]; if (m) m.on(models.index);
  hud.text('modename', CFG.modes.names[modeIx]); hud.text('modeline', ''); if (m && !quiet && modeIx !== 2) hud.say(m.name, m.hint, 3.2); };

// saved drawing and score
if (saved) { trace.palette = saved.pv === 2 ? saved.pal | 0 : 0; trace.restore(saved.prints); S.x = +saved.x || 0; S.z = +saved.z || 0; S.skated = +saved.skated || 0; models.setChar(saved.ch | 0); world.snapTo(S.x, S.z); }
setPlace(saved ? saved.pl | 0 : 0); setLook(saved ? saved.tm | 0 : 0); setMode(saved ? saved.md | 0 : 0, true);
if (saved && saved.gq && saved.gq !== 'Auto' && CFG.quality[saved.gq]) world.setQuality(saved.gq, false); showGfx();
const persist = () => { if (!dirty) return; dirty = false; save.store({ x: S.x, z: S.z, skated: S.skated, pal: trace.palette, pv: 2, ch: models.index, pl: placeIx, tm: lookIx, md: modeIx, rb: bests, ui: uiIx, uv: 2, gq: world.auto ? 'Auto' : world.qualityName, sc: score.serialise(), prints: trace.serialise() }); };
setInterval(persist, 20000);       // saving a big drawing costs a frame or two, so it is done rarely and whenever the game pauses
 window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// buttons
const countText = () => { const c = log.counts(); return c.minutes + ' min played · ' + c.strokes + ' touches · ' + c.jumps + ' jumps recorded. Stays on this device until you send or copy it.'; };
// the build that is running, and bringing a Home Screen copy up to date: checked at launch, on coming back to the game, and from the menu
let updNote = '';
const showBuild = () => hud.text('buildname', 'Build ' + BUILD + (updNote ? ' · ' + updNote : ''));
const updater = createUpdater(BUILD, (s) => { updNote = s; showBuild(); }, () => { dirty = true; persist(); });
hud.on('update', () => updater.check(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) updater.check(false); });
updater.check(false);
const showMenu = () => { showBuild(); hud.text('logcount', countText()); hud.text('logstatus', ''); hud.text('charname', models.rig.name); hud.swatch(PALETTES[trace.palette].css, PALETTES[trace.palette].name); hud.sheet(true); };
hud.on('zoom', setZoom); hud.on('score', setZoom); hud.on('menu', showMenu); hud.on('close', () => { hud.sheet(false); last = performance.now(); });
hud.on('movesbtn', () => hud.page('moves')); hud.on('back', () => hud.page('home'));
// a tap outside the menu card closes the menu
document.getElementById('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') { hud.sheet(false); last = performance.now(); } });
hud.on('char', () => { models.setChar(models.index + 1); showAvatar(); hud.text('charname', models.rig.name); dirty = true; });
hud.on('timebtn', () => { setLook(lookIx + 1); dirty = true; });
hud.on('modebtn', () => { setMode(modeIx + 1); dirty = true; });
// Screen: the look and layout of everything drawn over the ice
const UI_STYLES = ['Classic', 'Broadcast', 'Glass', 'Minimal', 'Arcade'];
let uiIx = saved && saved.uv === 2 && UI_STYLES[saved.ui] ? saved.ui : 3;       // Minimal is the standard screen; a style chosen since then is kept
const setUi = (i) => { uiIx = (i + UI_STYLES.length) % UI_STYLES.length; UI_STYLES.forEach((n, k) => document.body.classList.toggle('ui-' + n.toLowerCase(), k === uiIx)); hud.text('uiname', UI_STYLES[uiIx]); };
setUi(uiIx);
hud.on('uibtn', () => { setUi(uiIx + 1); dirty = true; });
// Graphics: Auto, then each level in turn
hud.on('gfxbtn', () => { const opts = ['Auto', ...world.levels], cur = world.auto ? 'Auto' : world.qualityName, nx = opts[(opts.indexOf(cur) + 1) % opts.length];
  if (nx === 'Auto') world.setQuality(world.coarse ? 'Balanced' : 'High', true); else world.setQuality(nx, false); showGfx(); dirty = true; });
hud.on('place', () => { setPlace(placeIx + 1); dirty = true; });
hud.on('pal', () => { trace.palette = trace.palette + 1; hud.swatch(PALETTES[trace.palette].css, PALETTES[trace.palette].name); dirty = true; });
// destructive buttons ask for a second tap
const confirmTap = (id, label, ask, run) => { let armed = 0; hud.on(id, () => { if (Date.now() < armed) { armed = 0; hud.text(id, label); run(); } else { armed = Date.now() + 3000; hud.text(id, ask); setTimeout(() => { if (armed) { armed = 0; hud.text(id, label); } }, 3100); } }); };
confirmTap('fresh', 'Fresh ice', 'Tap again to erase', () => { trace.clear(); S.skated = 0; dirty = true; persist(); hud.sheet(false); });
confirmTap('rescore', 'Reset score', 'Tap again to reset', () => { score.reset(); showScore(); dirty = true; persist(); if (world.view.zoomed) hud.board(true, score.state); });
hud.on('send', async () => { hud.text('logstatus', 'Sending…'); hud.text('logstatus', (await log.send()) ? 'Sent. Tell Claude the log is in.' : 'Could not send from here. Use Copy log and paste it to Claude.'); });
hud.on('copy', async () => { try { await navigator.clipboard.writeText(log.text()); hud.text('logstatus', 'Copied. Paste it to Claude.'); } catch (e) { hud.text('logstatus', 'Copy was blocked by the browser.'); } });
hud.on('clearlog', () => { log.clear(); hud.text('logstatus', 'New log started.'); hud.text('logcount', countText()); });

// frame loop
const blade = { x: 0, z: 0, width: 1, pen: true, double: false }, ZERO = { x: 0, y: 0 };
let last = performance.now(), lastMove = null, fAcc = 0, fN = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const paused = world.view.zoomed || document.getElementById('sheet').style.display === 'flex';       // zooming out, or opening the menu, pauses the skating
  const steer = paused ? ZERO : input.read();
  if (!paused) {
    input.frame(now);
    if (!S.grounded) { if (input.keys.KeyA || input.keys.ArrowLeft) game.airRotate(15 * dt); else if (input.keys.KeyD || input.keys.ArrowRight) game.airRotate(-15 * dt); }
    const before = trace.count; trace.speed = game.speed() / CFG.steer.maxSpeed;
    game.update(dt, steer); score.tick(dt);
    if (S.move !== lastMove) { lastMove = S.move; if (S.move && S.move.id !== 'fall') score.mark(); }
    const yaw = game.yaw(); blade.x = S.x; blade.z = S.z; blade.width = 1; blade.pen = true; blade.double = false;
    if (S.move && S.move.blade) S.move.blade(blade, yaw);
    const px = Math.cos(S.facing) * 0.16, pz = -Math.sin(S.facing) * 0.16;
    if (blade.double) { blade.x += px; blade.z += pz; }
    const dashed = !S.grounded || (!blade.pen && S.visY > 0.05);
    trace.follow(S, blade.x, blade.z, blade.width, blade.pen || dashed, dashed);
    if (trace.count !== before) { dirty = true; if (blade.double) trace.place(S.x - px, S.z - pz, S.facing, trace.colorAt(S.skated), 1); }       // spread eagle: both blades draw
    if (!S.grounded) { const r = Math.abs(S.spin) / TAU; if (r > 0.3) hud.say(r.toFixed(1) + '×', game.liveName(), 0.25); }
    hud.combo(score.chainLeft()); tutorial.tick(dt, { S, speed: game.speed(), armed: tricks.armed, rhythm: tricks.rhythm(now)[0], now }); { const r = tricks.rhythm(now); hud.rhythm(r[0], r[1]); }
    // a shore turns her along it: she keeps the speed that runs along the coast and loses what was heading inland
    { const t = forest.hit(S.x, S.z); if (t) { S.x = t.x; S.z = t.z; const vn = S.vx * t.nx + S.vz * t.nz; if (vn < 0) { S.vx -= vn * t.nx; S.vz -= vn * t.nz; if (S.grounded && vn < -2 && Math.random() < 0.5) spray.emit(S.x, S.z, t.nx, t.nz, 3, 2, 1.5); } } }
    // the mode in play: its pads or course, and its line under the speed
    if (modeIx === 1) MODES[1].update(dt); else if (modeIx === 2) MODES[2].update(dt, game.emit, game.crash);
    modeLineT -= dt; if (modeIx && modeLineT <= 0) { modeLineT = 0.1; hud.text('modeline', MODES[modeIx].line()); }
    // spray: off a hard edge, off each push when she is working for speed, and around a spin
    const sp = game.speed(), edge = Math.abs(S.turn) * sp;
    if (S.grounded) { const hx = Math.cos(S.facing), hz = -Math.sin(S.facing), out = S.turn > 0 ? -1 : 1;
      if (edge > 9 && Math.random() < dt * 40) spray.emit(blade.x, blade.z, hx * out, hz * out, 2, 1.2 + edge * 0.08, 0.9);
      if (S.move && S.move.skid && S.move.skid() && sp > 0.8) spray.emit(blade.x, blade.z, S.vx, S.vz, 3 + Math.round(sp * 0.8), 1.8 + sp * 0.35, 1.9);       // a skid throws snow ahead of her
      if (S.push > 0.5 && Math.sin(S.phase) * Math.sin(S.phase - 0.4) < 0) spray.emit(S.x, S.z, -S.vx, -S.vz, 5, 1.6, 1.4);
      if (S.move && S.move.spinRate && S.move.spinRate() > 8 && Math.random() < dt * 30) spray.emit(blade.x, blade.z, Math.random() - 0.5, Math.random() - 0.5, 1, 1.1, 6.3); }
    // drifting snow hangs in the air ahead of her; the faster she goes, the more of it whips past
    if (sp > 6) { const n = (sp - 6) * 5 * dt, ux = S.vx / sp, uz = S.vz / sp; for (let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); k > 0; k--) { const f = 5 + Math.random() * 13, w = (Math.random() - 0.5) * 18; spray.mote(S.x + ux * f - uz * w, 0.3 + Math.random() * 2.6, S.z + uz * f + ux * w, 1.3); }
      if (S.grounded && sp > 9 && Math.random() < dt * 30) spray.emit(blade.x, blade.z, -S.vx, -S.vz, 1, 1.4, 0.8); }
    spray.update(dt); fAcc += dt; fN++; if (fAcc >= 3) { world.adapt(fN / fAcc); showGfx(); fAcc = 0; fN = 0; }
    pose(game, dt, now);
    avatar = avatars[models.index];
    if (avatar && avatar.visible) { const spinRate = (S.move && S.move.spinRate ? S.move.spinRate() : 0) + (S.grounded ? 0 : Math.abs(S.goal - S.spin) * 20);
      avU.uTime.value = now / 1000; avatar.reflection(world.quality.reflection, 0.26); avatar.update(dt, S, Math.min(1, spinRate / 18 + game.speed() * 0.02), Math.min(1, spinRate / 18)); }
    if (modeIx === 3) duet.update(dt, now, models.index, world.quality.reflection);
    ring.update(game, models.rig.scale); log.tick(dt, game, steer);
  }
  world.update(game, paused ? 0.016 : dt, trace.bounds, trace.uScale); forest.update(S.x, S.z); trace.sharpen(world.view.e);
  hud.update(dt, game.speed(), trace.colorAt(S.skated));
  world.render(); requestAnimationFrame(frame);
}
hud.swatch(PALETTES[trace.palette].css, PALETTES[trace.palette].name); showScore();
window.__game = { CFG, modes: MODES, setMode, get modeIx() { return modeIx; }, get avatar() { return avatar; }, tutorial, world, forest, setPlace, game, S, input, tricks, score, trace, log, view: world.view, zoom: setZoom, hudText: () => document.getElementById('pop').textContent };
requestAnimationFrame(frame);
