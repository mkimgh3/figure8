// The trick finger, the right thumb. The rules of the control scheme live here and nowhere else:
//   quick double tap   -> jump; keep the second tap down and circle to rotate her in the air
// (v3-look76, Mark: "remove the left swipe three point turn activation. make that hydro and make right swipe spiral;
// swipe up becomes leap and swipe down becomes toe kick in prep for jump". Forward and backward swap by spinning past
// half a turn in choreography and letting go, see CFG.dance.settle.)
//   flick left         -> hydroblade; flick right -> spiral (each lasts a moment, and for as long as the finger stays down)
//   flick up           -> split leap; a circle within afterLeapMs of it is twizzles
//   flick down         -> toe kick: a jump soon after goes higher (CFG.toe)
//   anything else      -> choreography (moves/dance.js) once the finger has been down holdMs with nothing else going on:
//                         held still, or dragged further or slower than a flick. It lasts while the finger stays down; the
//                         finger's strokes set the mood, and circling it turns her and brings out the spin positions.
// With the left thumb moving the same way (CFG.two):
//   both swiped down   -> hockey stop if a thumb lifts within stop.liftMs, hydroblade if both stay down
//   both moving apart  -> spread eagle
//   both up, left or right -> the same as the right thumb alone
// A flick has to be quick (CFG.swipe); while a stroke could still be one, choreography waits for it to be read.
// What the finger does is worked out from the skater on every call, not fixed when it touched down: whenever she is in
// the air it turns her, and when the move it started or took up is over (finished, a fall, a launch pad) and it is still
// down, she dances. Time comes in with every call (ms). This file never reads a clock, so it can be tested with a made-up one.
import { CFG } from '../config.js';
import { Stroke, Swipe, reversalsOf } from './recognizer.js';
import { createSpiral, createEagle, createHydro } from '../moves/held.js';
import { createTwirl } from '../moves/twirl.js';
import { createToeKick, createLeap, createStop } from '../moves/quick.js';
import { createDance } from '../moves/dance.js';

export function createTricks(game, taps, log) {
  const S = game.S,
    K = CFG.two;
  // the right thumb while it is down: its stroke, and the reading of it as a flick
  let stroke = null,
    swipe = null;
  // what it is doing: 'pending' (nothing yet), 'air' (she is or was just airborne), 'held' (it started or took up the
  // move `own`), 'done' (that move is over and the finger is still down)
  let role = null,
    own = null;
  // it touched down on a dance that was winding down and took it up again. Its first stroke is still read as a flick:
  // a flick made while a spin winds down starts that flick's move instead.
  let tookUp = false;
  // the stroke is still being read as a possible flick
  const reading = () => role === 'pending' || (tookUp && role === 'held' && own.id === 'dance');
  // for the log: what the stroke was read as, and whether it was a two-thumb gesture
  let outcome = '',
    two = false;
  // a circle before this time is twizzles
  let leapUntil = -1e9;
  // both thumbs swiped down: waiting to see whether one lifts (hockey stop) or both stay (hydroblade)
  let stopWait = null;
  // the left thumb while it is down (kept, stilled, until the right thumb lifts if it lifts first), and where it was
  // when the right thumb's swipe began
  let left = null,
    leftLifted = false,
    leftAt = null;
  let lastT = null;

  // she is in the air: the finger turns her. The move it held is over: it is free to dance.
  function sync() {
    if (!S.grounded) {
      if (role !== 'air') {
        role = 'air';
        own = null;
      }
      stopWait = null;
      return;
    }
    if (role === 'held' && S.move !== own) {
      role = 'done';
      own = null;
    }
    // something new has started (a fall, say) while both thumbs were waiting
    if (stopWait && S.move && S.move !== stopWait.was) stopWait = null;
  }
  function start(m, name, isTwo) {
    if (!game.startMove(m)) return false;
    role = 'held';
    own = m;
    outcome = name;
    two = isTwo;
    if (isTwo && api.onTwoThumb) api.onTwoThumb();
    told(name.endsWith('dance') ? 'dance' : name);
    return true;
  }
  // what the stroke was read as, for the word shown by the thumb (pointers.js)
  const told = (name) => {
    if (api.onRead) api.onRead(name);
  };
  function stop(inward) {
    if (game.speed() < CFG.stop.minSpeed) {
      outcome = 'stop-too-slow';
      return false;
    }
    return start(createStop(S, game, inward), 'stop', true);
  }
  // A swipe has been read. r: the reading (Swipe.read); lifted: it was read as the right thumb lifted.
  function act(r, t, lifted) {
    if (!S.grounded) return false;
    // how the left thumb moved over the same time; only a fairly straight movement counts (a thumb circling to steer does not)
    let L = left && leftAt ? { x: left.x - leftAt.x, y: left.y - leftAt.y } : null;
    const ll = L ? Math.hypot(L.x, L.y) : 0;
    if (L && (Math.abs(left.turn - leftAt.turn) > 1.2 || left.path - leftAt.path > ll * 1.5)) L = null;
    const cos = L && ll > 0 && r.d > 0 ? (L.x * r.dx + L.y * r.dy) / (ll * r.d) : 0;
    // both thumbs moved apart, each by spreadEachPx or more, and the gap between them grew by spreadPx
    let spread = false;
    if (L && r.smooth && cos < -0.5 && r.d >= K.spreadEachPx && ll >= K.spreadEachPx) {
      const gap0 = Math.hypot(stroke.x - r.dx - leftAt.x, stroke.y - r.dy - leftAt.y),
        gap1 = Math.hypot(stroke.x - left.x, stroke.y - left.y);
      spread = gap1 - gap0 >= K.spreadPx;
    }
    // the left thumb went the same way, about as far: a two-thumb swipe
    const together = !!L && cos > K.parallelCos && ll >= Math.max(K.sameMinPx, r.d * K.sameShare);
    // lean the way she is already curving
    const inward = S.turn > 0 ? -1 : 1;
    if (spread) return start(createEagle(S, game, inward), 'spread', true);
    if (r.dir === 'down' && together) {
      if (lifted || leftLifted) return stop(inward);
      stopWait = { until: t + CFG.stop.liftMs, inward, was: S.move };
      outcome = 'both-down';
      return false;
    }
    if (r.dir === 'right') return start(createSpiral(S, game), 'right', together);
    if (r.dir === 'left') return start(createHydro(S, game, inward), 'left', together);
    if (r.dir === 'down') return start(createToeKick(S, game), 'down', false);
    if (r.dir === 'up' && start(createLeap(S, game), 'up', together)) {
      leapUntil = t + CFG.twirl.afterLeapMs;
      return true;
    }
    return false;
  }
  // The finger has been down holdMs and nothing else is going on: she dances. That covers a finger held still or dragged
  // (not a flick), one kept down through a jump and its landing, and one kept down after its move has run its course.
  // A finger circling (turned dance.circleTurn or more) starts it at once: quick spinning loops are often separate
  // touches, each far shorter than holdMs, and each later loop takes up the dance the first one started.
  function mayDance(t) {
    if (!S.grounded || S.move) return false;
    const circling = role === 'pending' && Math.abs(stroke.turn) >= CFG.dance.circleTurn;
    if (t - stroke.t0 < CFG.dance.holdMs && !circling) return false;
    if (role === 'done') return true;
    if (role === 'air') return S.landT >= CFG.dance.afterLand;
    if (role !== 'pending' || stopWait || swipe.pending()) return false;
    // straight after a split leap a circle means twizzles, so only a finger kept still starts choreography then
    return !(t < leapUntil && stroke.path >= CFG.swipe.restPx);
  }
  function dance() {
    const circled = role === 'pending' ? stroke.turn : 0;
    if (!start(createDance(S, game), outcome ? outcome + '+dance' : 'dance', false)) return;
    // the circling that started it counts: she turns as far as the finger already has
    if (circled) own.rotate(-circled);
  }
  // the right thumb's speed sets the dance's mood; with the left thumb, how alike the two thumbs' directions are
  function feed(dt, t) {
    const sb = stroke.speedAt(t),
      sa = left && !leftLifted ? left.speedAt(t) : 0;
    const k = sa > 1 && sb > 1 ? 1 / (sa * sb) : 0;
    // how alike the two thumbs' directions are, and the same with the left thumb's mirrored left to right
    // and each thumb's place and motion, which shape the dance (a thumb at rest has none)
    const lon = !!left && !leftLifted;
    own.feed(
      sb,
      dt,
      sa,
      k && (left.vx * stroke.vx + left.vy * stroke.vy) * k,
      k && (-left.vx * stroke.vx + left.vy * stroke.vy) * k,
      {
        rx: stroke.x,
        ry: stroke.y,
        rvx: sb > 0 ? stroke.vx : 0,
        rvy: sb > 0 ? stroke.vy : 0,
        left: lon,
        lx: lon ? left.x : 0,
        ly: lon ? left.y : 0,
        lvx: lon && sa > 0 ? left.vx : 0,
        lvy: lon && sa > 0 ? left.vy : 0,
      },
    );
  }
  const leftPoints = () => {
    if (!left) return undefined;
    const p = left.points,
      k = Math.ceil(p.length / 45);
    return p.filter((_, i) => i % k === 0).flat();
  };

  const api = {
    // called when a two-thumb gesture starts a move, so the left thumb's part in it does not steer her (set by pointers.js)
    onTwoThumb: null,
    // called with what a stroke was read as ('up', 'dance', 'jump', 'none', ...), to show it by the thumb (set by pointers.js)
    onRead: null,
    get active() {
      return stroke !== null;
    },
    get role() {
      return role;
    },
    // the finger is dancing: the ring under it shows
    get armed() {
      return role === 'held' && !!own && own.id === 'dance';
    },
    down(x, y, t, isDoubleTap) {
      stroke = new Stroke(x, y, t, CFG.rotate);
      swipe = new Swipe(CFG.swipe);
      role = 'pending';
      own = null;
      outcome = '';
      two = false;
      stopWait = null;
      leftAt = null;
      tookUp = false;
      if (isDoubleTap && game.jump()) {
        role = 'air';
        outcome = 'jump';
        told('jump');
      } else if (!S.grounded) {
        role = 'air';
        outcome = 'air-rotate';
      } else if (S.move && S.move.id === 'dance' && !S.move.state.held) {
        // a dance winding down: the finger takes it up again (and a circle carries the spin on at once)
        S.move.hold();
        role = 'held';
        own = S.move;
        outcome = 'dance-continue';
        tookUp = true;
      }
    },
    move(x, y, t) {
      if (!stroke) return;
      const px = stroke.x,
        py = stroke.y,
        d = stroke.add(x, y, t);
      if (stroke.x === px && stroke.y === py) return;
      sync();
      // screen-clockwise is skater-clockwise
      if (role === 'air') return void game.airRotate(-d);
      // twizzles and choreography: the finger's circling turns her
      if (role === 'held' && own.rotate) own.rotate(-d);
      if (!reading()) return;
      if (swipe.t0 === null)
        leftAt = left && !leftLifted ? { x: left.x, y: left.y, turn: left.turn, path: left.path } : null;
      swipe.add(stroke.x - px, stroke.y - py, t);
      // a circle straight after a split leap is twizzles; any other time it is part of choreography
      if (role === 'pending' && t < leapUntil && Math.abs(stroke.turn) >= CFG.twirl.startTurn && S.grounded) {
        if (start(createTwirl(S, game, -stroke.turn), 'twirl', false)) leapUntil = -1e9;
      }
      // a circle starts choreography straight away, without waiting for the next frame
      if (role === 'pending' && mayDance(t)) dance();
    },
    // every frame: a swipe is read once the finger is still, a two-thumb swipe down that stays down becomes a
    // hydroblade, a dance is fed the thumbs' motion, and a finger with nothing going on starts one
    frame(t) {
      const dt = lastT === null ? 0 : Math.min(0.1, (t - lastT) / 1000);
      lastT = t;
      if (!stroke) return;
      sync();
      if (stopWait && t >= stopWait.until) {
        const w = stopWait;
        stopWait = null;
        start(createHydro(S, game, w.inward), 'both-down-held', true);
      }
      if (reading() && !stopWait) {
        const r = swipe.read(t, false);
        if (r) act(r, t, false);
      }
      if (role === 'held' && own.id === 'dance') feed(dt, t);
      if (mayDance(t)) dance();
    },
    up(t) {
      if (!stroke) return;
      sync();
      const tap = stroke.isTap(t, CFG.tap);
      if (stopWait) {
        const w = stopWait;
        stopWait = null;
        stop(w.inward);
      } else if (role === 'pending') {
        if (tap) {
          taps.tap(t);
          outcome = 'tap';
        } else {
          const r = swipe.read(t, true);
          if (r) act(r, t, true);
          if (role === 'pending' && !outcome) outcome = 'none';
          // a stroke that did nothing says so, faintly, so a misfire is plain to see
          if (role === 'pending' && (outcome === 'none' || outcome === 'stop-too-slow')) told(outcome);
        }
      } else if (reading() && !tap) {
        // a flick that took up a winding-down dance, read as it lifts
        const r = swipe.read(t, true);
        if (r) act(r, t, true);
      }
      // a tap that took up a winding-down dance can still be the first half of a double tap
      if (outcome === 'dance-continue' && tap) taps.tap(t);
      if (role === 'held' && S.move === own && own.release) own.release();
      // (v3-look79, for the music tests) the left thumb's turns back too, as ms from the right thumb's touch (l0: when the
      // left one went down, the same way)
      log.stroke('trick', outcome, stroke, {
        armed: api.armed,
        two,
        left: leftPoints(),
        l0: left ? Math.round(left.t0 - stroke.t0) : undefined,
        lrev: left ? reversalsOf(left.points, CFG.reversal) : undefined,
      });
      stroke = null;
      swipe = null;
      role = null;
      own = null;
      stopWait = null;
      leftAt = null;
      if (leftLifted) {
        left = null;
        leftLifted = false;
      }
    },
    // the left thumb, which steers (pointers.js); tricks.js only watches it for two-thumb gestures and the dance's mood
    leftDown(x, y, t) {
      left = new Stroke(x, y, t, CFG.rotate);
      leftLifted = false;
      leftAt = null;
    },
    leftMove(x, y, t) {
      if (left && !leftLifted) left.add(x, y, t);
    },
    leftUp(t) {
      if (!left) return;
      if (!stroke) {
        left = null;
        return;
      }
      leftLifted = true;
      if (stopWait) {
        const w = stopWait;
        stopWait = null;
        stop(w.inward);
      }
    },
  };
  return api;
}
