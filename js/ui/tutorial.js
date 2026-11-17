// Tutorial mode: one skill at a time, taught step by step.
// Each step is a line of instruction and a test of the game that says when it is done. The game is checked every frame,
// so a step that is already true (say, she is already skating backward) passes straight away.
// A step can also say what must stay true while it is being worked on; if that breaks, the skill starts again.
import { TAU } from '../core/math.js';

// ---- tests, written against c = { S, speed, armed, rhythm, ev, mem }   (rhythm: 1 steps ready, 2 stepping, 3 toe pick ready)
const gliding = (c) => c.S.grounded && !c.S.move;
const forward = (c) => gliding(c) && !c.S.back && c.speed > 3.5;
const backward = (c) => gliding(c) && c.S.back && c.speed > 3;
const moving = (c) => gliding(c) && c.speed > 2.5;
const tookOff = (c) => c.ev && c.ev.type === 'takeoff';
const landedAny = (c) => c.ev && c.ev.type === 'land';
const moveIs = (id) => (c) => !!c.S.move && c.S.move.id === id;
const element = (kind, test) => (c) => !!c.ev && c.ev.type === 'element' && c.ev.d.kind === kind && c.ev.d.counted !== false && (!test || test(c.ev.d));
const amount = (id, f, n) => (c) => !!c.S.move && c.S.move.id === id && f(c.S.move.state) >= n;
const spinRevs = (st) => st.total / TAU;

const BACK_HINT = 'Skate backward: flick your right finger left for a three-turn, keep some speed';
const FWD_HINT = 'Skate forward and build speed. Going backward? Flick left first';

// A jump: get into the right way of skating, then one step for the whole jump: double tap, keep the finger down, rotate, lift.
const TAP = 'Double tap, keep your finger down and ';
const jump = (name, target, how, entry) => ({ name, target, steps: [
  ...(entry || [[FWD_HINT, forward]]),
  [TAP + how + ', then lift', landedAny],
] });

// A toe-pick jump: backward, flick down to plant the pick, then jump.
const toe = (name, target, how) => ({ name, target, steps: [
  [BACK_HINT, backward],
  ['Flick your right finger down. "Toe pick ready" appears', (c) => c.rhythm === 3],
  ['Within three seconds: ' + TAP.toLowerCase() + how + ', then lift', landedAny, (c) => c.rhythm === 3 || !c.S.grounded || landedAny(c)],
] });

const JUMPS = [
  jump('Waltz jump', 'Waltz jump', 'circle counter-clockwise half a turn'),
  jump('Axel', 'Axel', 'circle counter-clockwise 1½ turns'),
  jump('Inside Axel', 'Inside Axel', 'circle clockwise 1½ turns'),
  jump('Toe loop', 'Single toe loop', 'circle counter-clockwise one full turn', [[BACK_HINT, backward]]),
  jump('Salchow', 'Single Salchow', 'circle clockwise one full turn', [[BACK_HINT, backward]]),
  { name: 'Loop', target: 'Single loop', steps: [
    [BACK_HINT, backward],
    ['Land a clean toe loop or Salchow (one turn, backward)', (c) => landedAny(c) && /toe loop|Salchow/.test(c.ev.d.name) && (c.ev.d.grade === 'perfect' || c.ev.d.grade === 'clean')],
    ['The moment you land, ' + TAP.toLowerCase() + 'circle one full turn either way, then lift', landedAny],
  ] },
  jump('Double toe loop', 'Double toe loop', 'circle counter-clockwise two full turns', [[BACK_HINT, backward]]),
  jump('Double Axel', 'Double Axel', 'circle counter-clockwise 2½ turns'),
  jump('Triple toe loop', 'Triple toe loop', 'circle counter-clockwise three full turns, quickly', [[BACK_HINT, backward]]),
  { name: 'Jump combination', target: '+', steps: [
    ['Land any jump cleanly', (c) => { if (landedAny(c) && c.ev.d.name && c.ev.d.grade !== 'fall') { c.mem.t = c.now; return true; } return false; }],
    ['Within two seconds, jump again and land it', (c) => landedAny(c) && c.now - c.mem.t < 2600, (c) => c.now - c.mem.t < 2600 || !c.S.grounded],
  ] },
];

const MOVES = [
  { name: 'Twizzles', steps: [
    ['Skate along with your left thumb', moving],
    ['Flick your right finger to the right for a split leap', element('leap')],
    ['Straight after the leap, circle your right finger', moveIs('twirl')],
    ['Keep circling: two turns', amount('twirl', (st) => Math.abs(st.goal) / TAU, 2), moveIs('twirl')],
    ['Lift to finish', element('twizzles')],
  ] },
  { name: 'Three-turn', steps: [
    ['Skate along with your left thumb', moving],
    ['Flick your right finger to the left', element('turn')],
  ] },
  { name: 'Split leap', steps: [
    ['Skate along with your left thumb', moving],
    ['Flick your right finger to the right', element('leap')],
  ] },
  { name: 'Hockey stop', steps: [
    ['Skate along with your left thumb and build some speed', (c) => moving(c) && c.speed > 5],
    ['Put your right finger down too, drag both thumbs down together, and lift', element('stop')],
  ] },
  { name: 'Spiral', steps: [
    ['Skate along with your left thumb', moving],
    ['Flick your right finger up, and keep it down', moveIs('spiral')],
    ['Keep it down to hold the spiral', amount('spiral', (st) => st.t, 2), moveIs('spiral')],
    ['Lift to finish', element('spiral')],
  ] },
  { name: 'Hydroblade', steps: [
    ['Skate along with your left thumb', moving],
    ['Flick your right finger down, and keep it down', moveIs('hydro')],
    ['Keep it down to stay low', amount('hydro', (st) => st.t, 2), moveIs('hydro')],
    ['Lift to finish', element('hydro')],
  ] },
  { name: 'Choreography', steps: [
    ['Skate along with your left thumb', moving],
    ['Hold your right finger down, or drag it about', moveIs('dance')],
    ['Keep it moving: slow strokes are calm, quick ones sharp. The left thumb still steers', amount('dance', (st) => st.t, 3), moveIs('dance')],
    ['Now circle it: she spins. Slow circles open her out, fast ones pull her in', (c) => moveIs('dance')(c) && c.S.move.state.spin > 0, moveIs('dance')],
    ['Lift your right finger to finish', element('dance')],
  ] },
  { name: 'Spread eagle', steps: [
    ['Skate along with your left thumb', moving],
    ['Put your right finger down and spread your thumbs apart', moveIs('eagle')],
    ['Hold it, and steer with your left thumb', amount('eagle', (st) => st.t, 2), moveIs('eagle')],
    ['Lift to finish', element('eagle')],
  ] },
];
export const LESSONS = { jumps: JUMPS, moves: MOVES };

const $ = (id) => document.getElementById(id);

export function createTutorial() {
  const root = $('tut'), single = $('tutbtn'), cats = { jumps: $('tutjump'), moves: $('tutspin') }, sel = $('tsel'), nameEl = $('tname'), panel = $('tpanel'), dots = $('tdots'), stepEl = $('tstep');
  let cat = null, ix = 0, step = 0, mem = {}, doneT = 0, noteT = 0, note = '', events = [];
  const lesson = () => LESSONS[cat][ix];
  function show() {
    root.classList.toggle('open', !!cat); single.hidden = !!cat; sel.hidden = panel.hidden = !cat;
    Object.keys(cats).forEach((k) => { cats[k].hidden = !cat; cats[k].classList.toggle('on', k === cat); cats[k].setAttribute('aria-pressed', String(k === cat)); });
    if (cat) { nameEl.textContent = lesson().name; render(); }
  }
  function render() {
    const L = lesson(); dots.textContent = '';
    L.steps.forEach((_, i) => { const d = document.createElement('i'); d.className = i < step || doneT ? 'done' : i === step ? 'now' : ''; dots.appendChild(d); });
    stepEl.textContent = doneT ? '✓ ' + L.name + '! Again, or › for the next skill' : note || L.steps[step][0];
    panel.classList.toggle('win', !!doneT); panel.classList.toggle('note', !doneT && !!note);
  }
  function restart(why) { step = 0; mem = {}; note = why || ''; noteT = why ? 2.6 : 0; render(); }
  function pick(d) { const n = LESSONS[cat].length; ix = (ix + d + n) % n; doneT = 0; restart(); nameEl.textContent = lesson().name; }
  single.addEventListener('click', () => { cat = 'jumps'; ix = 0; doneT = 0; restart(); show(); });
  Object.keys(cats).forEach((k) => cats[k].addEventListener('click', () => { if (cat === k) cat = null; else { cat = k; ix = 0; doneT = 0; restart(); } show(); }));      // the active one again: tutorial off
  $('tprev').addEventListener('click', () => pick(-1)); $('tnext').addEventListener('click', () => pick(1));
  // a swipe across the selector also changes skill
  let sx = null; sel.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  sel.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 30 && e.target === nameEl) pick(e.clientX < sx ? 1 : -1); sx = null; });
  show();
  return {
    get on() { return !!cat; },
    event(type, d) { if (cat) events.push({ type, d }); },
    // c: { S, speed, armed, rhythm, now }
    tick(dt, c) {
      if (!cat) { events.length = 0; return; }
      if (noteT > 0) { noteT -= dt; if (noteT <= 0) { note = ''; render(); } }
      if (doneT) { doneT -= dt; if (doneT <= 0) { doneT = 0; restart(); } events.length = 0; return; }
      const L = lesson(); c.mem = mem;
      for (const ev of [...events.splice(0), null]) {
        c.ev = ev; const s = L.steps[step];
        if (s[2] && !s[2](c) && !(s[1](c))) { restart('Not quite. Start again: ' + L.steps[0][0].charAt(0).toLowerCase() + L.steps[0][0].slice(1)); return; }
        if (!s[1](c)) continue;
        const last = step === L.steps.length - 1;
        if (last && L.target && ev && ev.type === 'land') {          // the final landing decides it
          const d = ev.d, ok = d.grade !== 'fall' && (L.target === '+' ? true : d.name === L.target);
          if (!ok) { restart(d.grade === 'fall' ? 'A fall: ' + (d.offDeg) + '° off. Stop your finger closer to the full turn' : 'That was ' + (d.name ? 'a ' + d.name : 'no jump') + '. Try again'); return; }
        }
        if (last) { doneT = 3; render(); return; }
        step++; note = ''; render();
      }
    },
  };
}
