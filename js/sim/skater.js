// The skater's physics and jump rules. No rendering and no DOM: it reports what happened through emit().
import { CFG } from '../config.js';
import { TAU, clamp, wrap } from '../core/math.js';
import { createFall } from '../moves/fall.js';

const COUNT = ['', 'Single', 'Double', 'Triple', 'Quad', 'Quint'];

export function createSkater(emit) {
  const S = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, grounded: true, facing: Math.PI, back: false,
    spin: 0, goal: 0, takeBack: false, flick: false, combo: false, cleanLand: false, landT: 9, airT: 0,
    turn: 0, boostT: 0, move: null, yawX: 0, flipYaw: 0, visY: 0, skated: 0, phase: 0, mag: 0,
    inW: 0, inA: 0, inOn: false, jumps: 0, fingerTurn: 0, push: 0, curve: 0, entry: 0, clock: 0, fallEndT: -99, bonus: 0 };
  const C = CFG.steer;
  const speed = () => Math.hypot(S.vx, S.vz);
  const ensureSpeed = (min) => { if (speed() < min) { S.vx = Math.sin(S.facing) * min; S.vz = Math.cos(S.facing) * min; } };
  const rotateVel = (da) => { const a = Math.atan2(S.vx, S.vz) + da, v = speed(); S.vx = Math.sin(a) * v; S.vz = Math.cos(a) * v; };
  const busy = () => !S.grounded || (S.move && S.move.id === 'fall');

  // ---- moves: anything she does on the ice besides plain skating. See moves/README.md for the template.
  function endMove() { const m = S.move; if (!m) return; S.move = null; S.yawX = 0; if (m.end) m.end(); }
  function startMove(m) { if (!S.grounded) return false; if (S.move && S.move.id === 'fall') return false; endMove(); S.move = m; if (m.start) m.start(); return true; }

  // ---- jumps
  // Which jump it is depends on the way she is skating, the kind of take-off, and which way she rotates.
  function jumpType(ccw) { if (!S.takeBack) return ccw ? 'Axel' : 'Inside Axel'; if (S.flick) return ccw ? 'Flip' : 'Lutz'; if (S.combo) return 'Loop'; return ccw ? 'Toe loop' : 'Salchow'; }
  // The landing window is generous for singles and narrows with every extra rotation and for the harder jumps.
  const tolerance = (h, type) => clamp(1.25 - 0.2 * h, 0.45, 1.15) * (h >= 1 ? (CFG.difficulty[type] || 1) : 1);
  function gradeOf(off, h, type) { const k = tolerance(h, type); for (const g of CFG.grades) if (off < g[0] * k) return g[1]; return null; }
  // boost: a launch pad throws her this many times faster off the ice than her own legs would
  function jump(flick, boost) {
    if (busy()) return false; endMove();
    S.takeBack = S.back; S.flick = !!flick && S.back;      // the toe pick only changes a backward take-off
    S.combo = S.back && !S.flick && S.landT < CFG.jump.comboWindow && S.cleanLand;
    S.vy = (CFG.jump.vyBase + Math.min(speed(), C.maxSpeed) * CFG.jump.vyPerSpeed + S.bonus * CFG.jump.vyPerBonus) * (S.flick ? 1.16 : 1) * (boost || 1);
    S.grounded = false; S.spin = 0; S.goal = 0; S.fingerTurn = 0; S.airT = 0; S.jumps++; S.entry = S.curve;
    emit('takeoff', { yaw: S.facing + (S.back ? Math.PI : 0) }); return true;
  }
  function airRotate(d) { if (!S.grounded) { S.goal += d; S.fingerTurn += d; } }
  function jumpName(t, n, half) {
    const c = COUNT[Math.min(n, 5)];
    if (!S.takeBack) return !half ? (n ? c + ' hop' : '') : n === 0 ? 'Waltz jump' : n === 1 ? t : c + ' ' + (t === 'Axel' ? 'Axel' : 'inside Axel');
    const low = (t === 'Salchow' || t === 'Lutz') ? t : t.toLowerCase(); return n ? c + ' ' + low : (half ? 'Half ' + low : '');
  }
  function land() {
    const rots = Math.abs(S.spin) / TAU, h = Math.round(rots * 2) / 2, n = Math.floor(h), half = h - n > 0.25, t = jumpType(S.spin >= 0);
    const off = Math.abs(rots - h), grade = gradeOf(off, h, t), name = jumpName(t, n, half);
    S.grounded = true; S.y = 0; S.vy = 0; S.landT = 0; S.cleanLand = false;
    if (half) S.back = !S.back;                                    // a half turn swaps forward and backward skating
    const info = { name, type: t, rotations: +rots.toFixed(2), target: h, offDeg: Math.round(off * 360), grade: grade || 'fall', air: +S.airT.toFixed(2),
      fingerTurns: +(Math.abs(S.fingerTurn) / TAU).toFixed(2), entry: +S.entry.toFixed(1), back: S.back, combo: S.combo, speed: +speed().toFixed(1) };
    if (grade) { S.cleanLand = grade !== 'shaky'; if (grade === 'shaky') { S.vx *= 0.75; S.vz *= 0.75; }
      // a good landing carries her out faster than she could skate on her own
      const B = CFG.bonus, gain = name ? B[grade] * (1 + B.perRotation * Math.max(0, h - 1)) : 0;
      if (gain > 0) { const before = S.bonus; S.bonus = Math.min(B.max, S.bonus + gain); info.speedGain = +(S.bonus - before).toFixed(2); const v = speed(), k = v > 0.5 ? (v + gain * B.kick) / v : 1; S.vx *= k; S.vz *= k; } }
    else { S.bonus = 0; S.vx *= 0.7; S.vz *= 0.7; S.move = createFall(S, { ensureSpeed }); }
    S.spin = 0; S.goal = 0; emit('land', info);
  }

  // She has run into something at (nx, nz) away from it: she goes down and slides back off it.
  function crash(nx, nz, what) { if (S.move && S.move.id === 'fall') return false; S.bonus = 0; if (S.grounded) endMove(); S.move = null; S.yawX = 0;
    S.grounded = true; S.y = 0; S.vy = 0; S.spin = 0; S.goal = 0; S.vx = nx * 2.2; S.vz = nz * 2.2; S.move = createFall(S, { ensureSpeed }); emit('crash', { what }); return true; }

  function update(dt, steer) {
    const ix = steer.x, iy = steer.y, inMag = Math.hypot(ix, iy), mag = Math.min(1, inMag), prevFacing = S.facing; S.mag = mag;
    // how fast the thumb is sweeping round the ring: tight, quick thumb circles let her turn tighter
    const inA = Math.atan2(ix, iy);
    S.inW += ((inMag > 0.15 && S.inOn ? Math.abs(wrap(inA - S.inA)) / Math.max(dt, 1e-3) : 0) - S.inW) * (1 - Math.exp(-7 * dt)); S.inA = inA; S.inOn = inMag > 0.15;
    let sp = speed(), pushing = false;
    if (S.grounded) {
      const m = S.move, steerK = m ? (m.steer === undefined ? 1 : m.steer) : 1;
      if (m && m.update(dt, steer) === false) endMove();
      sp = speed();
      if (mag > 0.1 && steerK > 0) {
        const tv = (C.maxSpeed + S.bonus) * Math.pow(mag, 1.3);                                     // gentle near the centre for fine work
        if (sp < 0.4) { S.vx += ix / mag * C.accel * dt; S.vz += iy / mag * C.accel * dt; pushing = true; }   // push off from rest
        else {
          let dir = Math.atan2(S.vx, S.vz); const da = wrap(Math.atan2(ix, iy) - dir);
          const fine = mag < C.fineBand ? 1 + (C.fineBand - mag) * 1.6 : 1;
          const mt = Math.min(C.turnCapBoosted, Math.min(C.turnCap, C.lateral / sp) * (fine + Math.min(1.6, S.inW / 2.5))) * steerK * dt, tn = clamp(da, -mt, mt);
          let ns = sp;
          if (tv > sp + 0.4) pushing = true;
          if (tv > sp) ns = Math.min(tv, sp + C.accel * (m && m.accel !== undefined ? m.accel : 1) * (S.boostT > 0 ? CFG.fall.boostAccel : 1) * (1 - 0.55 * sp / C.maxSpeed) * (Math.abs(da) > 1.6 ? 0.3 : 1) * dt);
          else ns = Math.max(tv, sp - C.easeOff * dt);
          ns = Math.max(0, ns - Math.abs(tn) * sp * 0.06); dir += tn;                    // tight carving costs a little speed
          S.vx = Math.sin(dir) * ns; S.vz = Math.cos(dir) * ns;
        }
      } else if (!m) { const f = Math.exp(-C.glideDecay * dt); S.vx *= f; S.vz *= f; }
    }
    sp = speed();
    if (sp > 0.25 && !(S.move && S.move.holdFacing)) S.facing += wrap(Math.atan2(S.vx, S.vz) - S.facing) * (1 - Math.exp(-14 * dt));
    S.turn += (wrap(S.facing - prevFacing) / Math.max(dt, 1e-3) - S.turn) * (1 - Math.exp(-8 * dt));
    S.push += ((pushing && !S.move ? 1 : 0) - S.push) * (1 - Math.exp(-6 * dt));                 // how hard she is working to gain speed
    if (S.grounded) S.curve = S.curve * Math.exp(-dt / 2.2) + Math.abs(wrap(S.facing - prevFacing)) + (S.move && S.move.id !== 'fall' ? 1.2 * dt : 0);      // recent curving and figures
    S.x += S.vx * dt; S.z += S.vz * dt;
    if (!S.grounded) {
      S.airT += dt; S.spin += (S.goal - S.spin) * (1 - Math.exp(-20 * dt));              // she turns exactly as far as the finger has
      S.vy -= CFG.jump.gravity * dt; S.y += S.vy * dt; if (S.y <= 0) land();
    }
    if (S.boostT > 0) S.boostT -= dt;
    S.clock += dt; if (S.bonus > 0) S.bonus = Math.max(0, S.bonus - CFG.bonus.fade * dt);
    S.landT += dt; S.flipYaw *= Math.exp(-9 * dt); S.visY *= Math.exp(-14 * dt);
  }
  const yaw = () => S.facing + S.spin + (S.move && S.move.yaw ? S.move.yaw() : 0) + S.yawX + (S.back ? Math.PI : 0) + S.flipYaw;
  const liveGrade = () => { const turns = Math.abs(S.spin) / TAU, h = Math.round(turns * 2) / 2; return gradeOf(Math.abs(turns - h), h, jumpType(S.spin >= 0)); };
  const liveName = () => { const r = Math.abs(S.spin) / TAU; return (!S.takeBack && r < 1) ? 'Waltz jump' : jumpType(S.spin >= 0); };
  // every finished move that counts leaves her with some extra speed to spend, the more the move was worth
  const MOVES = { spin: 1, twizzles: 1, twirl: 1, steps: 1, swing: 1, spiral: 1, eagle: 1, hydro: 1, dance: 1, turn: 1, leap: 1, stop: 1 };
  const emitMove = (type, data) => {
    if (type === 'element' && data && MOVES[data.kind] && data.counted !== false) { const B = CFG.bonus, gain = B.move[0] + B.move[1] * (data.base || 0), before = S.bonus, v = speed();
      S.bonus = Math.min(B.max, S.bonus + gain); data.speedGain = +(S.bonus - before).toFixed(2); if (v > 0.5 && data.kind !== 'stop') { const k = (v + gain * B.kick) / v; S.vx *= k; S.vz *= k; } }
    emit(type, data); };
  return { S, emit: emitMove, speed, ensureSpeed, rotateVel, busy, startMove, endMove, jump, airRotate, crash, update, yaw, liveGrade, liveName };
}
