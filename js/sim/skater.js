// The skater's physics and jump rules. No rendering and no DOM: it reports what happened through emit().
import { CFG } from '../config.js';
import { TAU, clamp, wrap } from '../core/math.js';
import { createFall } from '../moves/fall.js';
import { createStumble } from '../moves/stumble.js';
import { iceY, iceSlope, uWaves, uCanyon, setIcePlane } from '../core/terrain.js';
import { track, ensureTrack, onTube, tubeR } from '../core/track.js';

const COUNT = ['', 'Single', 'Double', 'Triple', 'Quad', 'Quint'];

export function createSkater(emit) {
  const S = {
    x: 0,
    // y: how high she is above the ice under her; gy: how high that ice is, and gx, gz its slope (rise per metre along x
    // and z; all 0 on flat ice); wy: her height in the world while she is in the air (v3-look47)
    y: 0,
    z: 0,
    gy: 0,
    gx: 0,
    gz: 0,
    wy: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    grounded: true,
    facing: Math.PI,
    back: false,
    spin: 0,
    goal: 0,
    takeBack: false,
    combo: false,
    cleanLand: false,
    landT: 9,
    airT: 0,
    turn: 0,
    boostT: 0,
    move: null,
    yawX: 0,
    flipYaw: 0,
    visY: 0,
    skated: 0,
    phase: 0,
    mag: 0,
    inW: 0,
    inA: 0,
    inOn: false,
    jumps: 0,
    fingerTurn: 0,
    push: 0,
    curve: 0,
    entry: 0,
    clock: 0,
    fallEndT: -99,
    bonus: 0,
    surge: 0,
    flipK: 9,
    // a toe kick readies a jump until this time (S.clock); toeJump: this jump was off one
    toeUntil: -9,
    toeJump: false,
    // Infinite and Tutorial: falls and crashes become stumbles
    forgiving: false,
    // the Tunnel (v3-look60): on its tube (ts metres along the run, tphi radians round from its bottom), and the ways
    // out of the ice (up), down the run (along) and round the tube (round) there, as unit vectors
    tube: false,
    ts: 0,
    tphi: 0,
    up: [0, 1, 0],
    along: [0, 0, -1],
    round: [1, 0, 0],
  };
  const C = CFG.steer,
    SLOPE = [0, 0],
    // where she is on the Tunnel's tube, worked out each step
    O = {};
  const speed = () => Math.hypot(S.vx, S.vz);
  const ensureSpeed = (min) => {
    if (speed() < min) {
      S.vx = Math.sin(S.facing) * min;
      S.vz = Math.cos(S.facing) * min;
    }
  };
  const rotateVel = (da) => {
    const a = Math.atan2(S.vx, S.vz) + da,
      v = speed();
    S.vx = Math.sin(a) * v;
    S.vz = Math.cos(a) * v;
  };
  const busy = () => !S.grounded || (S.move && S.move.id === 'fall');

  // ---- moves: anything she does on the ice besides plain skating. See moves/README.md for the template.
  // how: nothing when the move ran its course; 'move' when another move took over, 'jump' when she took off, 'crash'
  // when she ran into something. A move cut short scores only what it did, and nothing if she crashed (v3-look46).
  function endMove(how) {
    const m = S.move;
    if (!m) return;
    S.move = null;
    S.yawX = 0;
    if (m.end) m.end(how);
  }
  function startMove(m) {
    if (!S.grounded) return false;
    if (S.move && S.move.id === 'fall') return false;
    endMove('move');
    S.move = m;
    if (m.start) m.start();
    return true;
  }

  // ---- jumps
  // Which jump it is depends on the way she is skating, whether she takes off straight out of a landing, and which way she rotates.
  function jumpType(ccw) {
    if (!S.takeBack) return ccw ? 'Axel' : 'Inside Axel';
    if (S.combo) return 'Loop';
    // off a toe kick, skating backward: a toe loop, whichever way she turns
    if (S.toeJump) return 'Toe loop';
    return ccw ? 'Toe loop' : 'Salchow';
  }
  // The landing window is generous for singles and narrows with every extra rotation and for the harder jumps.
  const tolerance = (h, type) => clamp(1.25 - 0.2 * h, 0.45, 1.15) * (h >= 1 ? CFG.difficulty[type] || 1 : 1);
  function gradeOf(off, h, type) {
    const k = tolerance(h, type);
    for (const g of CFG.grades) if (off < g[0] * k) return g[1];
    return null;
  }
  // boost: a launch pad throws her this many times faster off the ice than her own legs would
  function jump(boost) {
    if (busy()) return false;
    endMove('jump');
    S.takeBack = S.back;
    S.combo = S.back && S.landT < CFG.jump.comboWindow && S.cleanLand;
    // a toe kick just before (CFG.toe) springs her higher
    S.toeJump = S.clock < S.toeUntil;
    S.toeUntil = -9;
    S.vy =
      (CFG.jump.vyBase + Math.min(speed(), C.maxSpeed) * CFG.jump.vyPerSpeed + S.bonus * CFG.jump.vyPerBonus) *
      (boost || 1) *
      (S.toeJump ? CFG.toe.lift : 1);
    S.grounded = false;
    S.wy = S.gy;
    S.spin = 0;
    S.goal = 0;
    S.fingerTurn = 0;
    S.airT = 0;
    S.jumps++;
    S.entry = S.curve;
    emit('takeoff', { yaw: S.facing + (S.back ? Math.PI : 0) });
    return true;
  }
  function airRotate(d) {
    if (!S.grounded) {
      S.goal += d;
      S.fingerTurn += d;
    }
  }
  function jumpName(t, n, half) {
    const c = COUNT[Math.min(n, 5)];
    if (!S.takeBack)
      return !half
        ? n
          ? c + ' hop'
          : ''
        : n === 0
          ? 'Waltz jump'
          : n === 1
            ? t
            : c + ' ' + (t === 'Axel' ? 'Axel' : 'inside Axel');
    const low = t === 'Salchow' ? t : t.toLowerCase();
    return n ? c + ' ' + low : half ? 'Half ' + low : '';
  }
  function land() {
    const rots = Math.abs(S.spin) / TAU,
      h = Math.round(rots * 2) / 2,
      n = Math.floor(h),
      half = h - n > 0.25,
      t = jumpType(S.spin >= 0);
    const off = Math.abs(rots - h),
      grade = gradeOf(off, h, t),
      name = jumpName(t, n, half);
    S.grounded = true;
    S.y = 0;
    S.vy = 0;
    S.landT = 0;
    S.cleanLand = false;
    if (half) S.back = !S.back; // a half turn swaps forward and backward skating
    const info = {
      name,
      type: t,
      rotations: +rots.toFixed(2),
      target: h,
      offDeg: Math.round(off * 360),
      grade: grade || 'fall',
      air: +S.airT.toFixed(2),
      fingerTurns: +(Math.abs(S.fingerTurn) / TAU).toFixed(2),
      entry: +S.entry.toFixed(1),
      back: S.back,
      combo: S.combo,
      speed: +speed().toFixed(1),
    };
    // Infinite and Tutorial: a landing that would be a fall is a stumble she rides out
    if (!grade && S.forgiving) {
      const K = CFG.stumble;
      info.grade = 'stumble';
      S.bonus *= 0.5;
      S.vx *= K.keep;
      S.vz *= K.keep;
      S.move = createStumble(S);
    } else if (grade) {
      S.cleanLand = grade !== 'shaky';
      if (grade === 'shaky') {
        S.vx *= 0.75;
        S.vz *= 0.75;
      }
      // a good landing carries her out faster than she could skate on her own
      const B = CFG.bonus,
        gain = name ? B[grade] * (1 + B.perRotation * Math.max(0, h - 1)) : 0;
      if (gain > 0) {
        const before = S.bonus;
        S.bonus = Math.min(B.max, S.bonus + gain);
        info.speedGain = +(S.bonus - before).toFixed(2);
        const v = speed(),
          k = v > 0.5 ? (v + gain * B.kick) / v : 1;
        S.vx *= k;
        S.vz *= k;
      }
    } else {
      S.bonus = 0;
      S.vx *= 0.7;
      S.vz *= 0.7;
      S.move = createFall(S, { ensureSpeed });
    }
    S.spin = 0;
    S.goal = 0;
    emit('land', info);
  }

  // She has run into something at (nx, nz) away from it: she goes down and slides back off it.
  function crash(nx, nz, what) {
    if (S.move && (S.move.id === 'fall' || S.move.id === 'stumble')) return false;
    // Infinite and Tutorial: she bounces off and stumbles instead of going down
    if (S.forgiving) {
      if (S.grounded) endMove('crash');
      S.yawX = 0;
      S.bonus *= 0.5;
      S.vx = nx * 3;
      S.vz = nz * 3;
      if (S.grounded) S.move = createStumble(S);
      emit('crash', { what, stumble: true });
      return true;
    }
    S.bonus = 0;
    if (S.grounded) endMove('crash');
    S.move = null;
    S.yawX = 0;
    S.grounded = true;
    S.y = 0;
    S.vy = 0;
    S.spin = 0;
    S.goal = 0;
    S.vx = nx * 2.2;
    S.vz = nz * 2.2;
    S.move = createFall(S, { ensureSpeed });
    emit('crash', { what });
    return true;
  }

  // where she is in the world from where she is on the Tunnel's tube (S.ts, S.tphi): the point of the ice under her
  // (x, z and gy), and the ways out of the ice (S.up, into the tube), down the run (S.along) and round it (S.round)
  function tubePlace() {
    onTube(S.ts, S.tphi, 0, O);
    S.x = O.x;
    S.z = O.z;
    S.gy = O.y;
    S.gx = S.gz = 0;
    S.up[0] = O.nx;
    S.up[1] = O.ny;
    S.up[2] = O.nz;
    S.along[0] = O.tx;
    S.along[1] = O.ty;
    S.along[2] = O.tz;
    S.round[0] = O.ax;
    S.round[1] = O.ay;
    S.round[2] = O.az;
    S.tube = true;
    setIcePlane(S);
  }
  // into the Tunnel at s metres along, on the bottom of the tube, sliding gently down it
  function enterTube(s) {
    S.ts = s;
    S.tphi = 0;
    S.vx = 0;
    S.vz = -2;
    S.facing = Math.PI;
    S.y = 0;
    S.vy = 0;
    track.hint = s;
    tubePlace();
    S.wy = S.gy;
  }
  function update(dt, steer) {
    const ix = steer.x,
      iy = steer.y,
      inMag = Math.hypot(ix, iy),
      mag = Math.min(1, inMag),
      prevFacing = S.facing;
    S.mag = mag;
    // how fast the thumb is sweeping round the ring: tight, quick thumb circles let her turn tighter
    const inA = Math.atan2(ix, iy);
    S.inW +=
      ((inMag > 0.15 && S.inOn ? Math.abs(wrap(inA - S.inA)) / Math.max(dt, 1e-3) : 0) - S.inW) *
      (1 - Math.exp(-7 * dt));
    S.inA = inA;
    S.inOn = inMag > 0.15;
    let sp = speed(),
      pushing = false;
    // the canyon: gravity carries her, so the thumb neither holds her back nor lets her glide to a stop (see below)
    const canyon = uCanyon.value > 0;
    if (S.grounded) {
      const m = S.move,
        steerK = m ? (m.steer === undefined ? 1 : m.steer) : 1;
      if (m && m.update(dt, steer) === false) endMove();
      sp = speed();
      if (mag > 0.1 && steerK > 0) {
        // gentle near the centre for fine work; speedK: the place's top speed (v3-look78: doubled among the planets)
        const top = C.maxSpeed * (S.speedK || 1),
          tv = (top + S.bonus) * Math.pow(mag, 1.3);
        // push off from rest
        if (sp < 0.4) {
          S.vx += (ix / mag) * C.accel * dt;
          S.vz += (iy / mag) * C.accel * dt;
          pushing = true;
        } else {
          let dir = Math.atan2(S.vx, S.vz);
          const da = wrap(Math.atan2(ix, iy) - dir);
          const fine = mag < C.fineBand ? 1 + (C.fineBand - mag) * 1.6 : 1;
          const mt =
              Math.min(C.turnCapBoosted, Math.min(C.turnCap, C.lateral / sp) * (fine + Math.min(1.6, S.inW / 2.5))) *
              steerK *
              dt,
            tn = clamp(da, -mt, mt);
          let ns = sp;
          if (tv > sp + 0.4) pushing = true;
          if (tv > sp)
            ns = Math.min(
              tv,
              sp +
                C.accel *
                  (m && m.accel !== undefined ? m.accel : 1) *
                  (S.boostT > 0 ? CFG.fall.boostAccel : 1) *
                  (1 - (0.55 * sp) / top) *
                  (Math.abs(da) > 1.6 ? 0.3 : 1) *
                  dt,
            );
          else ns = canyon ? sp : Math.max(tv, sp - C.easeOff * dt);
          ns = Math.max(0, ns - Math.abs(tn) * sp * 0.06);
          dir += tn; // tight carving costs a little speed
          S.vx = Math.sin(dir) * ns;
          S.vz = Math.cos(dir) * ns;
        }
      } else if (!m && !canyon) {
        const f = Math.exp(-C.glideDecay * dt);
        S.vx *= f;
        S.vz *= f;
      }
      // rolling ice: downhill speeds her up and uphill slows her, along the way she is going (it never turns her, and
      // never stops her dead or sends her back)
      if (uWaves.value) {
        const v = speed();
        if (v > 0.05) {
          const a = (-CFG.waves.pull * 9.81 * (S.gx * S.vx + S.gz * S.vz)) / v,
            nv = Math.max(Math.min(v, CFG.waves.minSpeed), v + a * dt);
          S.vx *= nv / v;
          S.vz *= nv / v;
        }
      }
    }
    // The Tunnel (v3-look60): on its tube she is always on the ice, wherever round it she is, in the air too. Her
    // speed there is on the ice: vx round the tube (the way phi grows), -vz down the run. Gravity along the ice pulls
    // her round toward the tube's bottom and on down the run; a bend throws her toward its outside, as it does a
    // bobsled, so at speed she rides up the walls, and right over the top if she is fast enough. Air drag that grows
    // with the square of her speed has her settle at CFG.canyon.top on a slope of CFG.canyon.settle; never faster.
    if (canyon) {
      const K = CFG.canyon,
        a = K.pull * 9.81;
      onTube(S.ts, S.tphi, 0, O);
      const along = -S.vz;
      S.vx += (-a * O.ay - along * along * (O.kx * O.ax + O.ky * O.ay + O.kz * O.az)) * dt;
      S.vz += a * O.ty * dt;
      const v = speed();
      if (v > 0.01) {
        const nv = Math.min(K.top, Math.max(0, v - ((a * K.settle) / (K.top * K.top)) * v * v * dt));
        S.vx *= nv / v;
        S.vz *= nv / v;
      }
    }
    sp = speed();
    if (sp > 0.25 && !(S.move && S.move.holdFacing))
      S.facing += wrap(Math.atan2(S.vx, S.vz) - S.facing) * (1 - Math.exp(-14 * dt));
    S.turn += (wrap(S.facing - prevFacing) / Math.max(dt, 1e-3) - S.turn) * (1 - Math.exp(-8 * dt));
    S.push += ((pushing && !S.move ? 1 : 0) - S.push) * (1 - Math.exp(-6 * dt)); // how hard she is working to gain speed
    if (S.grounded)
      S.curve =
        S.curve * Math.exp(-dt / 2.2) +
        Math.abs(wrap(S.facing - prevFacing)) +
        (S.move && S.move.id !== 'fall' ? 1.2 * dt : 0); // recent curving and figures
    if (canyon) {
      // on the tube: along it and round it; she cannot go back past its closed top end
      S.ts -= S.vz * dt;
      S.tphi += (S.vx * dt) / tubeR(S.ts);
      const top = track.S0 + 3;
      if (S.ts < top) {
        S.ts = top;
        if (S.vz > 0) S.vz = 0;
      }
      track.hint = S.ts;
      ensureTrack(S.ts + 300);
      tubePlace();
    } else {
      S.x += S.vx * dt;
      S.z += S.vz * dt;
      S.gy = iceY(S.x, S.z);
      iceSlope(S.x, S.z, SLOPE);
      S.gx = SLOPE[0];
      S.gz = SLOPE[1];
      S.tube = false;
    }
    if (!S.grounded) {
      S.airT += dt;
      S.spin += (S.goal - S.spin) * (1 - Math.exp(-20 * dt)); // she turns exactly as far as the finger has
      S.vy -= CFG.jump.gravity * dt;
      // in the Tunnel she jumps straight off the ice and comes back to it; elsewhere she flies through the world: over a
      // hollow she is higher above the ice, over a rise she comes down sooner
      if (canyon) S.y += S.vy * dt;
      else {
        S.wy += S.vy * dt;
        S.y = S.wy - S.gy;
      }
      if (S.y <= 0) land();
    } else S.wy = S.gy;
    if (S.boostT > 0) S.boostT -= dt;
    S.clock += dt;
    if (S.bonus > 0) S.bonus = Math.max(0, S.bonus - CFG.bonus.fade * dt);
    S.landT += dt;
    S.flipYaw *= Math.exp(-S.flipK * dt);
    if (Math.abs(S.flipYaw) < 0.03) S.flipK = 9;
    // speed still owed to her from a move's exit arrives smoothly
    if (S.surge > 0) {
      const dv = Math.min(S.surge, 6 * dt),
        v = speed();
      S.surge = S.grounded && !(S.move && S.move.id === 'fall') ? S.surge - dv : 0;
      if (S.surge >= 0 && v > 0.2 && S.grounded) {
        S.vx *= (v + dv) / v;
        S.vz *= (v + dv) / v;
      } else if (v <= 0.2) ensureSpeed(0.3);
    }
    S.visY *= Math.exp(-14 * dt);
  }
  const yaw = () =>
    S.facing + S.spin + (S.move && S.move.yaw ? S.move.yaw() : 0) + S.yawX + (S.back ? Math.PI : 0) + S.flipYaw;
  const liveGrade = () => {
    const turns = Math.abs(S.spin) / TAU,
      h = Math.round(turns * 2) / 2;
    return gradeOf(Math.abs(turns - h), h, jumpType(S.spin >= 0));
  };
  const liveName = () => {
    const r = Math.abs(S.spin) / TAU;
    return !S.takeBack && r < 1 ? 'Waltz jump' : jumpType(S.spin >= 0);
  };
  // every finished move that counts leaves her with some extra speed to spend, the more the move was worth
  // (less for a kind of move she has done in the last bonus.repeatWindow seconds: bonus.repeat times for each)
  const MOVES = {
    twizzles: 1,
    twirl: 1,
    spiral: 1,
    eagle: 1,
    hydro: 1,
    dance: 1,
    turn: 1,
    leap: 1,
    changeleap: 1,
    stop: 1,
  };
  let moveHist = [];
  const emitMove = (type, data) => {
    if (type === 'element' && data && MOVES[data.kind] && data.counted !== false) {
      const B = CFG.bonus;
      moveHist = moveHist.filter((h) => S.clock - h.t <= B.repeatWindow);
      const reps = moveHist.filter((h) => h.kind === data.kind).length;
      moveHist.push({ kind: data.kind, t: S.clock });
      const gain = (B.move[0] + B.move[1] * (data.base || 0)) * Math.pow(B.repeat, reps),
        before = S.bonus,
        v = speed();
      S.bonus = Math.min(B.max, S.bonus + gain);
      data.speedGain = +(S.bonus - before).toFixed(2);
      if (v > 0.5 && data.kind !== 'stop') {
        const k = (v + gain * B.kick) / v;
        S.vx *= k;
        S.vz *= k;
      }
    }
    emit(type, data);
  };
  return {
    S,
    emit: emitMove,
    speed,
    ensureSpeed,
    rotateVel,
    busy,
    startMove,
    endMove,
    jump,
    airRotate,
    crash,
    update,
    enterTube,
    yaw,
    liveGrade,
    liveName,
  };
}
