// The trick finger. The rules of the control scheme live here and nowhere else:
//   quick double tap            -> jump; keep the second tap down and circle to rotate
//   drag (anything longer than a flick) -> choreography (moves/dance.js) for as long as the finger stays down: its strokes set the mood,
//                                  and circling turns her and brings out the spin positions
//   finger held down            -> choreography too: any time it is down and nothing else is happening, including after a jump has landed
//   flick up                    -> spiral, flick down -> hydroblade (each lasts at least a moment, and for as long as the finger stays down)
//   NOT REACHABLE at present (the code is kept): the spin as a move of its own (moves/spin.js), toe pick (Flip, Lutz), and after a 'steps ready':
//       scribble side to side   -> step sequence, one step per stroke
//       scribble up and down    -> swing rolls
//     and an even rhythm scores more (the rhythm bar shows it)
//   circle straight after a split leap -> twizzles: she turns as far as the finger circles and keeps travelling
//   flick left                  -> three-turn (swaps forward and backward skating)
//   flick right                 -> split leap
// Both thumbs together: dragged down and lifted is a hockey stop; swipe up is a spiral and swipe down, held, a hydroblade (both last while the thumbs stay down), spreading the
// thumbs apart is a spread eagle, and sideways flicks and scribbles do the same as with one finger.
// A single touch never jumps.
import { CFG } from '../config.js';
import { Stroke, Shape } from './recognizer.js';
import { createSpiral, createEagle, createHydro, createSwing } from '../moves/held.js';
import { createTwirl } from '../moves/twirl.js';
import { createTurn, createLeap, createStop } from '../moves/quick.js';
import { createSteps } from '../moves/steps.js';
import { createDance } from '../moves/dance.js';

export function createTricks(game, taps, log) {
  let stroke = null, shape = null, mode = null, outcome = '', fired = false, stepsUntil = 0, toeUntil = 0, leapUntil = 0;
  const stepping = () => S.move && (S.move.id === 'steps' || S.move.id === 'swing');
  const S = game.S;
  // ev is what the recogniser read; src carries its details (.side for a corner, .loopSign for a figure eight)
  // two: the event is the shared motion of both thumbs. lifted: it was read as a thumb left the glass, so the gesture was a drag and release, not a hold
  function perform(ev, src, two, lifted) {
    if (!ev || ev === 'engage' || mode !== 'pending') return false;
    if (ev === 'beat') { if (fired && S.move && S.move.beat) { S.move.beat(src.shape || src); stepsUntil = performance.now() + CFG.steps.keepMs; } return false; }      // the stroke's size and tempo go to the move
    if (fired || !S.grounded) return false;
    const inward = S.turn > 0 ? -1 : 1; let m = null;                         // lean the way she is already curving
    if (ev === 'up') { m = createSpiral(S, game); ev = 'spiral'; }
    else if (two && ev === 'down' && lifted) { if (game.speed() < CFG.stop.minSpeed) return false; m = createStop(S, game, inward); ev = 'stop'; }
    else if (ev === 'down') { m = createHydro(S, game, inward); ev = 'hydro'; }
    if ((ev === 'scribbleX' || ev === 'scribbleY') && performance.now() > stepsUntil && !stepping()) return false;      // scribbles only count once a sequence is ready
    if (ev === 'left') m = createTurn(S, game); else if (ev === 'right') { m = createLeap(S, game); leapUntil = performance.now() + CFG.twirl.afterLeapMs; }
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
    get active() { return stroke !== null; }, get stroke() { return stroke; }, get armed() { return mode === 'dance'; },
    canDuo: () => mode === 'pending' || mode === 'twirl',
    // the right thumb is dragging with nothing else read from it: she starts to improvise
    canDance: () => mode === 'pending' && !fired && S.grounded && !(S.move && S.move.id === 'fall'),
    dance() { if (!game.startMove(createDance(S, game))) return false; mode = 'dance'; fired = true; outcome = 'dance'; return true; },
    down(x, y, t, isDoubleTap) {
      stroke = new Stroke(x, y, t, CFG.rotate); shape = new Shape(CFG.shape); outcome = ''; fired = false;
      if (isDoubleTap && game.jump(t < toeUntil)) { mode = 'air'; outcome = t < toeUntil && S.back ? 'toe-jump' : 'jump'; toeUntil = 0; }
      else if (!S.grounded) { mode = 'air'; outcome = 'air-rotate'; }
      else if (S.move && S.move.id === 'spin') { mode = 'spin'; S.move.hold(); outcome = 'spin-continue'; }
      else if (S.move && S.move.id === 'dance' && !S.move.state.held) { mode = 'dance'; S.move.hold(); fired = true; outcome = 'dance-continue'; }
      else mode = 'pending';
    },
    move(x, y, t) {
      if (!stroke) return; const px = stroke.x, py = stroke.y, d = stroke.add(x, y, t); if (stroke.x === px && stroke.y === py) return;
      if (mode === 'air') game.airRotate(-d);                                             // screen-clockwise = skater clockwise
      else if (mode === 'spin') { if (S.move && S.move.id === 'spin') S.move.rotate(-d); }
      else if (mode === 'twirl') { if (S.move && S.move.id === 'twirl') S.move.rotate(-d); }
      else if (mode === 'dance') { if (S.move && S.move.id === 'dance') S.move.rotate(-d); }          // dancing, the finger's circling turns her
      else { perform(shape.add(stroke.x - px, stroke.y - py, d, t), shape);
        // a circle straight after a split leap is twizzles; any other time it is simply part of a drag
        if (!fired && !shape.decided && t < leapUntil && Math.abs(stroke.turn) >= CFG.twirl.startTurn && game.startMove(createTwirl(S, game, -stroke.turn))) { mode = 'twirl'; outcome = 'twirl'; leapUntil = 0; } }
    },
    // every frame: a finger that has rested is ready to spin, and a flick is read once the finger stops
    // wait: both thumbs are moving together and their shared gesture has not been read yet, so the finger's own flick holds back
    frame(t, wait) {
      // The finger is still down with nothing going on: she dances, until it lifts. That covers a finger simply held, one kept down
      // through a jump and its landing, and one kept down after a flick's move, a held move or a fall has run its course.
      if (stroke && mode !== 'dance' && (mode !== 'pending' || fired) && S.grounded && !S.move && t - stroke.t0 >= CFG.dance.holdMs && (mode !== 'air' || S.landT >= CFG.dance.afterLand) && game.startMove(createDance(S, game))) { mode = 'dance'; fired = true; outcome = outcome ? outcome + '+dance' : 'dance'; return; }
      if (mode !== 'pending') return;
      if (!wait && !fired && t >= leapUntil && t - stroke.t0 >= CFG.dance.holdMs && this.canDance() && this.dance()) return;          // a finger held longer than a tap
      // a drag: the finger has kept moving for longer than any flick, and nothing else was read from it. She starts to dance.
      // (Not while both thumbs are still drawing a shared gesture, and not straight after a split leap, when a circle means twizzles.)
      if (!wait && t >= leapUntil && stroke.path >= CFG.dance.dragPx && t - stroke.t0 - (stroke.restMs || 0) >= CFG.dance.dragMs && t - stroke.t < 120 && this.canDance() && this.dance()) return;
      if (!wait) perform(shape.settle(t), shape);
    },
    up(t, extra) {
      if (!stroke) return;
      if (mode === 'pending') {
        if (stroke.isTap(t, CFG.tap)) { taps.tap(t); outcome = 'tap'; }
        else { perform(shape.end(), shape); if (!fired) outcome = 'none'; }
        if (fired && S.move && S.move.release) S.move.release();
      }
      if (outcome === 'dance-continue' && stroke.isTap(t, CFG.tap)) taps.tap(t);
      if ((mode === 'spin' || mode === 'twirl' || mode === 'dance') && S.move && S.move.id === mode) S.move.release();
      log.stroke('trick', outcome, stroke, Object.assign({ armed: mode === 'dance' }, extra || {})); stroke = null; shape = null; mode = null;
    },
  };
}
