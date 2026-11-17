// The trick finger. The rules of the control scheme live here and nowhere else:
//   quick double tap            -> jump; keep the second tap down and circle to rotate
//   rest the finger, then circle -> spin (the steering thumb picks sit or camel). A circle drawn straight away does nothing.
//   flick down                  -> toe pick ready for three seconds: the next jump, skating backward, is a Flip (counter-clockwise)
//                                  or a Lutz (clockwise), and goes a little higher
//   flick up                    -> a step sequence is ready for a few seconds; then
//       scribble side to side   -> step sequence, one step per stroke
//       scribble up and down    -> swing rolls
//     and an even rhythm scores more (the rhythm bar shows it)
//   circle straight away        -> twizzles: she turns as far as the finger circles and keeps travelling
//   flick left                  -> three-turn (swaps forward and backward skating)
//   flick right                 -> split leap
//   sharp swipe against her travel -> hockey stop, whichever way she is going (it takes the place of the flick that points that way)
// Both thumbs together: swipe up is a spiral and swipe down a hydroblade (both last while the thumbs stay down), spreading the
// thumbs apart is a spread eagle, and sideways flicks and scribbles do the same as with one finger.
// A single touch never jumps.
import { CFG } from '../config.js';
import { Stroke, Shape } from './recognizer.js';
import { createSpin } from '../moves/spin.js';
import { createSpiral, createEagle, createHydro, createSwing } from '../moves/held.js';
import { createTwirl } from '../moves/twirl.js';
import { createTurn, createLeap, createStop } from '../moves/quick.js';
import { createSteps } from '../moves/steps.js';

export function createTricks(game, taps, log) {
  let stroke = null, shape = null, mode = null, outcome = '', fired = false, armed = false, stepsUntil = 0, toeUntil = 0;
  const stepping = () => S.move && (S.move.id === 'steps' || S.move.id === 'swing');
  const S = game.S;
  // ev is what the recogniser read; src carries its details (.side for a corner, .loopSign for a figure eight)
  // a sharp one-finger swipe straight against the way she is travelling (the screen and the ice share their directions)
  const against = (sh) => { const K = CFG.stop, sp = game.speed(), d = Math.hypot(sh.x, sh.y);
    return sp >= K.minSpeed && d > 0 && sh.speed >= K.swipePxPerS && (sh.x * S.vx + sh.y * S.vz) / (d * sp) <= K.cos; };
  // two: the event is the shared motion of both thumbs
  function perform(ev, src, two) {
    if (!ev || ev === 'engage' || mode !== 'pending' || armed) return false;
    if (ev === 'beat') { if (fired && S.move && S.move.beat) { S.move.beat(src.shape || src); stepsUntil = performance.now() + CFG.steps.keepMs; } return false; }      // the stroke's size and tempo go to the move
    if (fired || !S.grounded) return false;
    const inward = S.turn > 0 ? -1 : 1; let m = null;                         // lean the way she is already curving
    const flick = ev === 'up' || ev === 'down' || ev === 'left' || ev === 'right' || ev === 'slash';
    if (two && ev === 'up') { m = createSpiral(S, game); ev = 'spiral'; } else if (two && ev === 'down') { m = createHydro(S, game, inward); ev = 'hydro'; }
    else if (!two && flick && against(src)) { m = createStop(S, game, inward); ev = 'stop'; }
    else if (ev === 'up') { stepsUntil = performance.now() + CFG.steps.readyMs; fired = true; outcome = 'steps-ready'; game.emit('say', { big: 'Step sequence ready', small: 'scribble side to side, or up and down', hold: 1.6 }); return true; }
    else if (ev === 'down') { toeUntil = performance.now() + CFG.jump.toeReadyMs; fired = true; outcome = 'toe-ready';
      game.emit('say', { big: 'Toe pick ready', small: S.back ? 'double tap: counter-clockwise Flip, clockwise Lutz' : 'skate backward, then double tap', hold: 1.6 }); return true; }
    if ((ev === 'scribbleX' || ev === 'scribbleY') && performance.now() > stepsUntil && !stepping()) return false;      // scribbles only count once a sequence is ready
    if (ev === 'left') m = createTurn(S, game); else if (ev === 'right') m = createLeap(S, game);
    else if (ev === 'scribbleX') m = createSteps(S, game); else if (ev === 'scribbleY') m = createSwing(S, game);
    else if (ev === 'spread') m = createEagle(S, game, inward);
    if (!m || !game.startMove(m)) return false;
    fired = true; outcome = ev; if (m.beat) { m.beat(src.shape || src); stepsUntil = performance.now() + CFG.steps.keepMs; } return true;
  }
  return {
    perform,
    // for the rhythm bar: 0 hidden, 1 a sequence is ready, 2 one is running; and how even the rhythm is, 0..1
    // states: 1 steps ready, 2 steps running, 3 toe pick ready
    rhythm(now) { return stepping() ? [2, S.move.state.stab] : now < toeUntil ? [3, 0] : now < stepsUntil ? [1, 0] : [0, 0]; },
    get active() { return stroke !== null; }, get stroke() { return stroke; }, get armed() { return armed; },
    canDuo: () => (mode === 'pending' || mode === 'twirl') && !armed,
    down(x, y, t, isDoubleTap) {
      stroke = new Stroke(x, y, t, CFG.rotate); shape = new Shape(CFG.shape); outcome = ''; fired = false; armed = false;
      if (isDoubleTap && game.jump(t < toeUntil)) { mode = 'air'; outcome = t < toeUntil && S.back ? 'toe-jump' : 'jump'; toeUntil = 0; }
      else if (!S.grounded) { mode = 'air'; outcome = 'air-rotate'; }
      else if (S.move && S.move.id === 'spin') { mode = 'spin'; S.move.hold(); outcome = 'spin-continue'; }
      else mode = 'pending';
    },
    move(x, y, t) {
      if (!stroke) return; const px = stroke.x, py = stroke.y, d = stroke.add(x, y, t); if (stroke.x === px && stroke.y === py) return;
      if (mode === 'air') game.airRotate(-d);                                             // screen-clockwise = skater clockwise
      else if (mode === 'spin') { if (S.move && S.move.id === 'spin') S.move.rotate(-d); }
      else if (armed) { if (Math.abs(stroke.turn) >= CFG.spin.startTurn && S.landT > CFG.spin.landLockout && game.startMove(createSpin(S, game, -stroke.turn))) { mode = 'spin'; outcome = 'spin'; game.recentreSteer(); } }
      else if (mode === 'twirl') { if (S.move && S.move.id === 'twirl') S.move.rotate(-d); }
      else { perform(shape.add(stroke.x - px, stroke.y - py, d, t), shape);
        if (!fired && !shape.decided && Math.abs(stroke.turn) >= CFG.twirl.startTurn && game.startMove(createTwirl(S, game, -stroke.turn))) { mode = 'twirl'; outcome = 'twirl'; } }
    },
    // every frame: a finger that has rested is ready to spin, and a flick is read once the finger stops
    // wait: both thumbs are moving together and their shared gesture has not been read yet, so the finger's own flick holds back
    frame(t, wait) {
      if (mode !== 'pending') return;
      if (!armed && !fired && t - stroke.t0 >= CFG.spin.holdMs && stroke.path <= CFG.spin.holdMovePx && S.grounded && !(S.move && S.move.id === 'fall')) armed = true;
      if (!armed && !wait) perform(shape.settle(t), shape);
    },
    up(t, extra) {
      if (!stroke) return;
      if (mode === 'pending') {
        if (stroke.isTap(t, CFG.tap)) { taps.tap(t); outcome = 'tap'; }
        else { if (!armed) perform(shape.end(), shape); if (!fired) outcome = armed ? 'armed-no-circle' : 'none'; }
        if (fired && S.move && S.move.release) S.move.release();
      }
      if ((mode === 'spin' || mode === 'twirl') && S.move && S.move.id === mode) S.move.release();
      log.stroke('trick', outcome, stroke, Object.assign({ armed }, extra || {})); stroke = null; shape = null; mode = null; armed = false;
    },
  };
}
