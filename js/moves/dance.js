// Choreography: the artistic part of a programme. It starts when the right thumb drags, and while it stays down she improvises: gestures, positions and spins, one pose
// flowing into the next. The left thumb goes on steering her and setting her speed. How the right thumb moves sets the mood
// (0..1): slow strokes give calm, broad, sustained gestures; quick ones give sharp, low, street-dance moves that hit on a
// beat. Circling it turns her. Both thumbs moving in step (the same way, or mirrored like a pair of arms) bring out the
// elegant gestures; both moving at random, out of step with each other, hip hop (v3-look48).
// v3-look62 (Mark: "a fluidic experience of music into virtual choreography ... gestures each seamlessly transitioning
// from one to another as not to break the trance"): the thumbs are not read for triggers here. They are read all the
// time as a few flowing quantities (CFG.dance.express): how high on the glass the right thumb has drifted and whether
// it is rising or falling (level), how far to one side (side), whether the two thumbs are opening apart or closing
// together (open), and how fast they move (the mood). Each next pose is the one whose own shape best matches those
// (every pose is measured the same way: arms high or low, open or folded, leaning one way or the other), with some
// chance in it and no repeats, so a sequence is never the same twice. On top of the pose her body follows the thumbs
// live: the right thumb lifts her right arm, the left her left, a rising thumb lifts her chest, a sideways one sways
// her. And every joint moves on a spring toward its pose, keeping its momentum when the pose changes, so one movement
// runs into the next without a join. The spiral, Biellmann, hydroblade and spread eagle are positions in it.
import { CFG } from '../config.js';
import { clamp, wrap, dimin } from '../core/math.js';

// A pose is the joint angles of poses.js plus dy (hip height above or below standing) and yaw (which way she turns to face).
// The pose tables below keep one pose per row (prettier-ignore), so poses can be compared at a glance.
// prettier-ignore
const N = { roll: 0, lean: 0.08, dy: 0, fL: 1, fR: 1, aLx: 0, aRx: 0, aLz: -0.8, aRz: 0.8, aLe: -0.3, aRe: -0.3, lLx: 0, lRx: 0, lLz: 0, lRz: 0, lLk: 0.05, lRk: 0.05, yaw: 0 };
const KEYS = Object.keys(N);
// prettier-ignore
const CALM = [
  { lean: 0.7, fL: 0, lRx: -0.7, lLx: 0.7, lLk: 0, aLz: -1.5, aRz: 1.5, aLx: 0.5, aRx: -0.4, aLe: -0.1, aRe: -0.1 },                                   // arabesque, one arm leading
  { lean: -0.05, fL: 0, lLx: 0.35, lRx: -0.1, lRk: 0.15, aLz: -2.5, aRz: 2.5, aLe: -0.5, aRe: -0.5 },                                                // arms rounded overhead
  { dy: -0.22, lean: 0.15, fL: 0, lRx: -1.0, lRk: 1.3, lLx: 0.75, lLk: 0.15, aLz: -1.3, aRz: 2.3, aLx: 0.2, aLe: -0.1, aRe: -0.2, yaw: 0.5 },         // deep lunge, one arm lifted
  { dy: -0.05, lean: -0.35, fL: 0, lRx: -0.3, lRk: 0.5, lLx: 0.55, aLz: -1.6, aRz: 1.6, aLx: -0.5, aRx: -0.5, aLe: -0.1, aRe: -0.1, yaw: -0.7 },      // arched back, arms open behind
  { lean: 0.25, fL: 0, lLx: 0.6, lLk: 1.0, lRk: 0.12, aLz: -2.4, aLe: -0.6, aRz: 1.3, aRe: -0.15 },                                                   // attitude: free leg bent behind, one arm curved overhead
  { roll: 0.3, fL: 0, lLz: -0.3, lRk: 0.2, aLz: -2.0, aRz: 0.9, aRx: 0.3, aLe: -0.15, aRe: -0.4, yaw: 0.9 },                                          // long side reach on a deep edge
  { dy: -0.05, lean: 0.05, lLk: 0.3, lRk: 0.3, lLx: -0.15, lRx: -0.15, aLz: 0.3, aRz: -0.3, aLx: -0.85, aRx: -0.85, aLe: -1.85, aRe: -1.85 },         // holding herself
  { dy: -0.15, lean: 0.35, fL: 0, lRx: -0.6, lRk: 0.8, lLx: 0.5, lLz: 0.25, lLk: 0.3, aLz: -0.9, aRz: 0.9, aLx: 0.4, aRx: 0.4, aLe: -0.2, aRe: -0.2 }, // curtsy, arms offered low
  { lean: 0.1, fL: 0, lLx: -0.5, lLk: 0.1, lRk: 0.1, aLz: -1.45, aRz: 1.45, aLx: 0.15, aRx: 0.15, aLe: -0.1, aRe: -0.1, yaw: -1.2 },                   // free leg carried forward, arms wide
  // v3-look48: more elegant gestures, for the thumbs moving in step
  { lean: 0.05, fL: 0, lLx: 0.3, lLk: 0.05, aLz: -2.75, aLe: -0.45, aLx: 0.1, aRz: 0.55, aRx: -0.55, aRe: -0.55, yaw: 0.4 },                           // port de bras: one arm swept overhead, the other low in front
  { lean: 0.5, fL: 0, lLx: 0.75, lLk: 0.05, lRk: 0.1, aLz: -0.95, aRz: 0.95, aLx: 0.95, aRx: 0.95, aLe: -0.1, aRe: -0.1 },                              // swan: bowed forward, arms swept back like wings, free leg behind
  { lean: -0.15, fL: 0, lLx: 0.25, lLk: 0.05, aLz: -2.55, aRz: 2.55, aLx: 0.1, aRx: 0.1, aLe: -0.05, aRe: -0.05, yaw: 0.2 },                            // a wide V, arms straight up and out, chest lifted
  { lean: 0.32, fL: 0, lLx: 0.55, lLk: 0.05, lRk: 0.1, aLx: -1.45, aRx: -1.45, aLz: 0.05, aRz: -0.05, aLe: -0.05, aRe: -0.05 },                         // both arms reaching forward, the free leg stretched behind
  { dy: -0.12, lean: -0.42, lLx: 0.65, lLk: 0.1, lRx: -0.55, lRk: 0.45, aLz: -1.9, aRz: 1.35, aLx: -0.4, aRx: -0.25, aLe: -0.2, aRe: -0.15, yaw: 1.1 }, // Ina Bauer: feet apart along the line, back arched, arms open
  { lean: 0.08, fL: 0, lLx: 0.35, aLx: -0.95, aLz: 0.35, aLe: -2.05, aRx: -1.85, aRz: 0.25, aRe: -0.1, yaw: -0.4 },                                     // one hand to the heart, the other offered up and out
  { lean: 0.18, fL: 0, lLx: 1.05, lLk: 1.45, lRk: 0.12, aLz: -2.8, aLx: -0.35, aLe: -0.55, aRz: 1.1, aRx: 0.25, aRe: -0.2 },                           // free leg raised high behind, one arm reaching back over the head for it
  { lean: 0.12, fL: 0, lLx: 0.4, aLz: -0.95, aLx: -0.95, aLe: -0.1, aRz: 2.25, aRx: 0.55, aRe: -0.15, yaw: 0.6 },                                      // a fan: one arm low and forward, the other high and back
  // v3-look62: the held moves as positions she flows through
  { lean: 1.2, fL: 0, lRx: -1.2, lRk: 0.05, lLx: 0.55, lLk: 0, aLz: -1.45, aRz: 1.45, aLx: 0.35, aRx: 0.35, aLe: -0.1, aRe: -0.1 },                       // spiral: bowed level, the free leg stretched out behind
  { lean: 0.3, fL: 0, lLx: 2.95, lLk: 1.05, lRk: 0.08, aLz: -2.85, aRz: 2.85, aLx: -0.95, aRx: -0.95, aLe: -0.7, aRe: -0.7 },                            // Biellmann: the free leg drawn up behind to her head, both hands up to it
  { roll: 0.75, lean: 0.35, dy: -0.4, fL: 0, lRx: -1.65, lRk: 2.2, lLx: 0.75, lLk: 0.05, lLz: -0.35, aLz: -1.3, aRz: 1.3, aLx: -0.3, aRx: -0.3, aLe: -0.1, aRe: -0.1 }, // hydroblade: low over the ice on a deep edge
  { lean: -0.12, dy: -0.06, lLx: 0.12, lRx: 0.12, lLk: 0.08, lRk: 0.08, lLz: -0.5, lRz: 0.5, aLz: -1.5, aRz: 1.5, aLe: -0.08, aRe: -0.08, yaw: 1.3 },    // spread eagle: feet turned out heel to heel, arms wide
  // v3-look68: from ballet and modern dance (Mark: "like ballet and modern dance ... moments of intentional upper and lower body movement")
  { lean: -0.12, fL: 0, lLx: -1.5, lLk: 0.03, lRk: 0.08, aLz: -1.5, aRz: 1.5, aLx: 0.1, aRx: 0.1, aLe: -0.08, aRe: -0.08 },                              // battement: the free leg thrown high in front, arms wide
  { roll: -0.22, fL: 0, lLz: -1.3, lLk: 0.03, lRk: 0.06, aLz: -1.45, aRz: 2.6, aLe: -0.05, aRe: -0.4 },                                                // side extension: the free leg high to the side, the far arm overhead
  { lean: -0.03, fL: 0, lLx: -1.2, lLk: 1.9, lRk: 0.05, aLz: -2.6, aRz: 1.5, aLe: -0.45, aRe: -0.1 },                                                  // passe: the knee drawn up, foot by the standing knee, one arm curved overhead
  { dy: -0.16, lean: 0.55, lLk: 0.7, lRk: 0.7, lLx: -0.75, lRx: -0.75, aLx: -1.1, aRx: -1.1, aLz: -0.25, aRz: 0.25, aLe: -1.0, aRe: -1.0 },            // contraction: hollowed over bent knees, arms rounded low in front
  { dy: -0.24, lean: 0.03, lLz: -0.5, lRz: 0.5, lLk: 1.0, lRk: 1.0, lLx: -0.5, lRx: -0.5, aLz: -1.45, aRz: 1.45, aLe: -0.3, aRe: -0.3 },               // plie: deep and wide, arms held out
  { roll: -0.5, fL: 0, lLz: -1.0, lLk: 0.03, lRk: 0.05, aLz: -1.6, aRz: 2.9, aLe: -0.03, aRe: -0.03 },                                                  // tilt: tipped right over to one side, the free leg rising the other way, arms in one line
  { lean: -0.5, fL: 0, lLx: -1.0, lLk: 0.05, lRk: 0.15, aLz: -2.2, aRz: 2.2, aLx: -0.6, aRx: -0.6, aLe: -0.2, aRe: -0.2 },                              // layout: arched right back, the free leg kicked forward, arms flung back
  { lean: 0.05, roll: 0.12, fL: 0, lLx: 0.45, lLk: 0.03, aLz: -2.35, aLe: -0.03, aRz: 0.45, aRx: 0.35, aRe: -0.03, yaw: 0.3 },                          // allonge: one long line from a hand high in front to the other low behind
];
const LOW = { dy: -0.14, lLx: -0.55, lRx: -0.55, lLk: 0.85, lRk: 0.85, lLz: -0.3, lRz: 0.3 }; // the grounded stance street moves start from
// prettier-ignore
const SHARP = [
  Object.assign({}, LOW, { aLz: -1.4, aLe: -1.57, aRz: 1.4, aRe: 0, lean: 0.05, roll: 0.1 }),                                                        // arms out, one forearm cocked at a right angle
  Object.assign({}, LOW, { lean: -0.12, roll: 0.16, aLz: 0.3, aRz: -0.3, aLx: -0.85, aRx: -0.85, aLe: -1.85, aRe: -1.85, yaw: 0.6 }),                  // arms crossed, weight on one hip
  Object.assign({}, LOW, { roll: -0.2, aRz: 2.3, aRe: 0, aLz: -0.6, aLe: -1.6, aLx: -0.3, yaw: -0.5 }),                                               // one arm thrown up on the diagonal, hand on hip
  Object.assign({}, LOW, { dy: -0.3, lean: 0.3, lLx: -1.0, lRx: -1.0, lLk: 1.4, lRk: 1.4, aLx: 1.3, aRx: 1.3, aLz: -0.2, aRz: 0.2, aLe: -0.2, aRe: -0.2 }),      // drop low, both arms punched forward
  Object.assign({}, LOW, { dy: -0.12, lean: -0.25, aLz: -1.4, aLe: -2.0, aRz: 1.4, aRe: -2.0 }),                                                     // rocked back, elbows up
  { lean: -0.1, fL: 0, lLx: -0.9, lLk: 0.1, lRx: -0.3, lRk: 0.5, dy: -0.06, aRx: 1.0, aLx: -0.8, aLz: -0.5, aRz: 0.5, aLe: -1.2, aRe: -1.2, yaw: 0.4 },      // kick step, arms pumping against it
  { roll: 0.3, dy: -0.12, lLz: -0.6, lLk: 0.1, lRz: 0.1, lRx: -0.5, lRk: 0.9, aLz: -1.5, aLe: -0.3, aRx: 0.9, aRz: -0.3, aRe: -0.4, yaw: -1.0 },      // side slide, both arms thrown one way
  Object.assign({}, LOW, { dy: -0.18, lean: 0.2, roll: -0.18, aLz: -0.25, aRz: 0.25, aLe: -1.3, aRe: -1.3, aLx: 0.2, aRx: 0.2 }),                      // hunched bounce, fists low
  Object.assign({}, LOW, { lean: 0.1, aLz: -1.9, aLe: -1.2, aRz: 0.5, aRx: 0.9, aRe: -0.1, yaw: 1.57 }),                                              // quarter turn, one arm framing the head, one pointing
];
// While the finger circles she spins, and takes the positions of real spins: open and extended when it circles slowly, tight when fast.
// prettier-ignore
const SPIN_SLOW = [
  { lean: 1.45, fL: 0, lRx: -1.45, lRk: 0.05, lLx: 0.1, lLk: 0, aLz: -1.4, aRz: 1.4, aLx: 0.15, aRx: 0.15, aLe: -0.15, aRe: -0.15 },                                  // camel
  { lean: -0.42, dy: -0.02, fL: 0, lRx: 0.12, lRk: 0.12, lLx: 0.5, lLk: 1.15, lLz: -0.2, aLz: -2.2, aRz: 2.2, aLx: -0.35, aRx: -0.35, aLe: -0.5, aRe: -0.5 },        // layback
  { lean: 0.25, fL: 0, lLx: 0.6, lLk: 1.0, lRk: 0.12, aLz: -2.4, aLe: -0.6, aRz: 1.3, aRe: -0.15 },                                                                 // attitude
];
// prettier-ignore
const SPIN_FAST = [
  { lean: 0, fL: 0, lLx: -0.55, lLk: 1.1, lLz: 0.15, aLz: 0.45, aRz: -0.45, aLx: -0.75, aRx: -0.75, aLe: -2.0, aRe: -2.0 },                                         // scratch: arms and free leg pulled in
  { lean: 0, fL: 0, lLx: -0.3, lLk: 1.3, lLz: 0.12, aLz: -2.7, aRz: 2.7, aLx: 0, aRx: 0, aLe: -0.3, aRe: -0.3 },                                                    // arms stretched overhead
];
// Rook works his stick into the dance (S.hockey). armL is his right arm, the hand that holds the stick alone.
// prettier-ignore
const STICK_CALM = [
  { lean: 0.1, fL: 0, lLx: 0.4, lLk: 0.2, aLx: -1.45, aRx: -1.45, aLz: 0.12, aRz: -0.12, aLe: -0.2, aRe: -0.2 },                       // the stick presented level in both hands
  { lean: 0.3, fL: 0, lRx: -0.5, lLx: 0.6, lLk: 0.1, aLx: -1.5, aLz: -0.25, aLe: -0.05, aRz: 1.5, aRx: 0.2, aRe: -0.15, yaw: 0.3 },   // the stick held straight out ahead, the other arm wide
  { lean: -0.1, fL: 0, lLx: 0.3, lLk: 0.4, aLz: -1.55, aLx: 0.0, aLe: -0.05, aRz: 1.55, aRx: 0.0, aRe: -0.05, yaw: -0.6 },             // arms wide, the stick held out to the side
];
// a fast spin with both arms up: the stick turns over his head like a rotor
// prettier-ignore
export const STICK_OVERHEAD = { lean: 0, fL: 0, lLx: -0.3, lLk: 1.2, lLz: 0.12, aLz: -3.3, aRz: 3.3, aLx: 0.15, aRx: 0.15, aLe: -0.3, aRe: -0.3 };
// Tesa's layback (S.layback), one of her spin positions: leaning back with the free leg lifted behind and the arms
// raised and curving back over her head; tighter and higher when the finger circles fast. Never mirrored, so the free
// leg stays the same. (With an arm raised overhead, a negative x turn swings it back, the opposite of a hanging arm.)
// prettier-ignore
export const LAYBACK_SLOW = { lean: -0.62, dy: -0.03, fL: 0, lRx: 0.45, lRk: 0.16, lLx: 0.95, lLk: 1.2, lLz: -0.2, aLz: -2.4, aRz: 2.4, aLx: -0.45, aRx: -0.45, aLe: -0.85, aRe: -0.85 };
// prettier-ignore
export const LAYBACK_FAST = { lean: -0.5, dy: -0.02, fL: 0, lRx: 0.4, lRk: 0.12, lLx: 0.8, lLk: 1.4, lLz: -0.1, aLz: -2.8, aRz: 2.8, aLx: -0.4, aRx: -0.4, aLe: -1.1, aRe: -1.1 };
// Hip hop (v3-look48, Mark: "hip hop movement when two thumbs in random uncoordinated movement while held down
// together"): routines of steps, each hit sharply and held for its beats (CFG.dance.hiphop.bpm), over a groove in pose()
// (the knees dip on every beat and the hips sway from one side to the other). Each step is laid over GROOVE, the low,
// loose stance they start from, and a routine can be danced mirrored. [pose, beats]
// prettier-ignore
const GROOVE = { dy: -0.07, lean: 0.12, fL: 1, fR: 1, lLx: -0.35, lRx: -0.35, lLk: 0.5, lRk: 0.5, lLz: -0.12, lRz: 0.12, aLz: -0.35, aRz: 0.35, aLe: -0.6, aRe: -0.6 };
// What each pose is called, in the order of its table, for the choreography combination's list of moves (v3-look61)
const NAMES = {
  calm: [
    'Arabesque',
    'Arms overhead',
    'Lunge',
    'Arched back',
    'Attitude',
    'Side reach',
    'Embrace',
    'Curtsy',
    'Leg forward',
    'Port de bras',
    'Swan',
    'V arms',
    'Forward reach',
    'Ina Bauer',
    'Hand to heart',
    'Leg held high',
    'Fan',
    'Spiral',
    'Biellmann',
    'Hydroblade',
    'Spread eagle',
    'Battement',
    'Side extension',
    'Passé',
    'Contraction',
    'Plié',
    'Tilt',
    'Layout',
    'Allongé',
  ],
  sharp: [
    'Cocked arm',
    'Arms crossed',
    'Diagonal',
    'Low punch',
    'Elbows up',
    'Kick step',
    'Side slide',
    'Bounce',
    'Point',
  ],
  slow: ['Camel spin', 'Layback spin', 'Attitude spin'],
  fast: ['Scratch spin', 'Overhead spin'],
  hiphop: [
    'B-boy stance',
    'Robot',
    'Dab',
    'Running man',
    'Hands in the air',
    'Chest pop',
    'Shoulder bounce',
    'Floss',
    'Kick out',
  ],
};
// prettier-ignore
const HIPHOP = [
  // b-boy stance: arms crossed and leaning back, then pointing straight ahead, the other hand on the hip
  [[{ lean: -0.08, roll: 0.1, aLz: 0.3, aRz: -0.3, aLx: -0.85, aRx: -0.85, aLe: -1.85, aRe: -1.85 }, 2],
   [{ lean: 0.18, aLx: -1.5, aLz: -0.1, aLe: -0.05, aRz: 0.6, aRx: -0.3, aRe: -1.6, yaw: 0.35 }, 2]],
  // the robot: elbows at right angles, forearms up, then one up and one down, turning a step each time
  [[{ dy: -0.02, lLk: 0.25, lRk: 0.25, lLx: -0.15, lRx: -0.15, aLz: -1.57, aLx: -1.57, aLe: -1.57, aRz: 1.57, aRx: -1.57, aRe: -1.57 }, 1],
   [{ dy: -0.02, lLk: 0.25, lRk: 0.25, lLx: -0.15, lRx: -0.15, aLz: -1.57, aLx: -1.57, aLe: -1.57, aRz: 1.57, aRx: 1.57, aRe: -1.57, yaw: 0.5 }, 1],
   [{ dy: -0.02, lLk: 0.25, lRk: 0.25, lLx: -0.15, lRx: -0.15, aLz: -1.57, aLx: 1.57, aLe: -1.57, aRz: 1.57, aRx: -1.57, aRe: -1.57, yaw: 0.5 }, 1],
   [{ dy: -0.02, lLk: 0.25, lRk: 0.25, lLx: -0.15, lRx: -0.15, aLz: -1.57, aLx: -1.57, aLe: -1.57, aRz: 1.57, aRx: -1.57, aRe: -1.57, yaw: -1.0 }, 1]],
  // the dab: a bounce down, then the head ducked into one elbow and the other arm thrown up and out
  [[{ dy: -0.12, lLk: 0.8, lRk: 0.8, lLx: -0.55, lRx: -0.55, lean: 0.25, aLz: -0.25, aRz: 0.25, aLe: -0.4, aRe: -0.4, aLx: 0.3, aRx: 0.3 }, 1],
   [{ lean: 0.2, roll: 0.16, aLx: -1.85, aLz: 0.55, aLe: -1.95, aRz: 2.3, aRx: -0.3, aRe: -0.02 }, 2]],
  // running man: knees driven up in turn, arms pumping against them
  [[{ fL: 0, lLx: -1.25, lLk: 1.6, lRk: 0.35, lRx: -0.1, aLx: 0.7, aLe: -1.4, aRx: -0.9, aRe: -1.4, aLz: -0.25, aRz: 0.25 }, 0.5],
   [{ fR: 0, lRx: -1.25, lRk: 1.6, lLk: 0.35, lLx: -0.1, aRx: 0.7, aRe: -1.4, aLx: -0.9, aLe: -1.4, aLz: -0.25, aRz: 0.25 }, 0.5],
   [{ fL: 0, lLx: -1.25, lLk: 1.6, lRk: 0.35, lRx: -0.1, aLx: 0.7, aLe: -1.4, aRx: -0.9, aRe: -1.4, aLz: -0.25, aRz: 0.25 }, 0.5],
   [{ fR: 0, lRx: -1.25, lRk: 1.6, lLk: 0.35, lLx: -0.1, aRx: 0.7, aRe: -1.4, aLx: -0.9, aLe: -1.4, aLz: -0.25, aRz: 0.25 }, 0.5]],
  // hands in the air, swaying from side to side
  [[{ dy: -0.03, roll: 0.14, aLz: -2.75, aRz: 2.35, aLe: -0.35, aRe: -0.35, aLx: 0.1, aRx: 0.1 }, 1],
   [{ dy: -0.03, roll: -0.14, aLz: -2.35, aRz: 2.75, aLe: -0.35, aRe: -0.35, aLx: 0.1, aRx: 0.1 }, 1],
   [{ dy: -0.03, roll: 0.14, aLz: -2.75, aRz: 2.35, aLe: -0.35, aRe: -0.35, aLx: 0.1, aRx: 0.1 }, 1],
   [{ dy: -0.03, roll: -0.14, aLz: -2.35, aRz: 2.75, aLe: -0.35, aRe: -0.35, aLx: 0.1, aRx: 0.1 }, 1]],
  // chest pop: thrown back with the elbows pulled behind, then hunched forward, fists low
  [[{ dy: -0.02, lean: -0.3, aLx: 0.75, aRx: 0.75, aLz: -0.5, aRz: 0.5, aLe: -1.35, aRe: -1.35 }, 1],
   [{ dy: -0.13, lean: 0.4, lLk: 0.8, lRk: 0.8, lLx: -0.6, lRx: -0.6, aLx: -0.65, aRx: -0.65, aLz: -0.15, aRz: 0.15, aLe: -0.9, aRe: -0.9 }, 1],
   [{ dy: -0.02, lean: -0.3, aLx: 0.75, aRx: 0.75, aLz: -0.5, aRz: 0.5, aLe: -1.35, aRe: -1.35 }, 1],
   [{ dy: -0.13, lean: 0.4, lLk: 0.8, lRk: 0.8, lLx: -0.6, lRx: -0.6, aLx: -0.65, aRx: -0.65, aLz: -0.15, aRz: 0.15, aLe: -0.9, aRe: -0.9 }, 1]],
  // shoulder bounce: elbows out and up, the shoulders tipping one way and then the other on every half beat
  [[{ roll: 0.17, aLz: -1.0, aLe: -1.45, aRz: 0.55, aRe: -1.45, aLx: -0.2, aRx: -0.2 }, 0.5],
   [{ roll: -0.17, aLz: -0.55, aLe: -1.45, aRz: 1.0, aRe: -1.45, aLx: -0.2, aRx: -0.2 }, 0.5],
   [{ roll: 0.17, aLz: -1.0, aLe: -1.45, aRz: 0.55, aRe: -1.45, aLx: -0.2, aRx: -0.2 }, 0.5],
   [{ roll: -0.17, aLz: -0.55, aLe: -1.45, aRz: 1.0, aRe: -1.45, aLx: -0.2, aRx: -0.2 }, 0.5]],
  // the floss: straight arms swung to one side, one in front of her and one behind, the hips to the other
  [[{ roll: -0.12, aLz: -0.45, aLx: -0.45, aLe: -0.05, aRz: -0.25, aRx: 0.45, aRe: -0.05 }, 0.5],
   [{ roll: 0.12, aLz: 0.25, aLx: 0.45, aLe: -0.05, aRz: 0.45, aRx: -0.45, aRe: -0.05 }, 0.5],
   [{ roll: -0.12, aLz: -0.45, aLx: -0.45, aLe: -0.05, aRz: -0.25, aRx: 0.45, aRe: -0.05 }, 0.5],
   [{ roll: 0.12, aLz: 0.25, aLx: 0.45, aLe: -0.05, aRz: 0.45, aRx: -0.45, aRe: -0.05 }, 0.5]],
  // kick out: one leg flicked forward, arms snapped the other way, back into the groove
  [[{ fR: 0, lRx: -1.05, lRk: 0.05, lLk: 0.65, dy: -0.1, lean: -0.05, aLx: -0.9, aLz: -0.4, aLe: -0.3, aRx: 0.6, aRz: 0.5, aRe: -0.3 }, 1],
   [{ aLz: -0.6, aRz: 0.6, aLe: -1.2, aRe: -1.2, roll: 0.08 }, 1]],
];
// Which poses she draws on. Thumbs moving in step: the long, open, travelling shapes and the elegant gestures. Thumbs
// going their own ways (before hip hop takes over): the twisted, closed, contrasting ones. One thumb alone: any of them.
// Spinning: counter-clockwise takes the camel and then the scratch spin, clockwise the layback or attitude and then arms
// overhead.
const PICK = {
  slow: { 1: [0], '-1': [1, 2] },
  fast: { 1: [0], '-1': [1] },
};
const full = (p) => Object.assign({}, N, p);
// A pose measured the way the thumbs are (v3-look62), each -1..1: level (arms high: up; hips low or bowed: down), open
// (arms long and wide: 1; folded in: -1) and side (which way it leans, turns and reaches; its mirror image is the
// opposite)
const describe = (p) => {
  const q = full(p),
    arm = (Math.abs(q.aLz) + Math.abs(q.aRz)) / 2;
  return {
    level: clamp((arm - 1.3) / 1.4 + q.dy / 0.3 - Math.max(0, q.lean - 0.3) * 0.6, -1, 1),
    open: clamp(1 - (Math.abs(q.aLe) + Math.abs(q.aRe)) / 1.6, -1, 1),
    side: clamp(q.roll * 2 + q.yaw * 0.5 + (Math.abs(q.aRz) - Math.abs(q.aLz)) * 0.45, -1, 1),
  };
};
// The same for a pose's arms alone and for its legs and trunk alone (v3-look68: an accent moves one or the other).
// Legs: the free leg lifted high or the back arched: up; hips low or bowed over: down.
const ARMK = ['aLx', 'aRx', 'aLz', 'aRz', 'aLe', 'aRe'],
  LEGK = ['roll', 'lean', 'dy', 'fL', 'fR', 'lLx', 'lRx', 'lLz', 'lRz', 'lLk', 'lRk'];
const describeArms = (p) => {
  const q = full(p);
  return {
    level: clamp(((Math.abs(q.aLz) + Math.abs(q.aRz)) / 2 - 1.3) / 1.3, -1, 1),
    open: clamp(1 - (Math.abs(q.aLe) + Math.abs(q.aRe)) / 1.6, -1, 1),
    side: clamp((Math.abs(q.aRz) - Math.abs(q.aLz)) * 0.7 + (q.aRx - q.aLx) * 0.3, -1, 1),
  };
};
const describeLegs = (p) => {
  const q = full(p),
    // how high the free leg is carried, in front, to the side or behind
    lift =
      q.fL === 0
        ? Math.max(-q.lLx, Math.abs(q.lLz), q.lLx * 0.7)
        : q.fR === 0
          ? Math.max(-q.lRx, Math.abs(q.lRz), q.lRx * 0.7)
          : 0;
  return {
    level: clamp(
      Math.max(0, lift - 0.4) / 0.9 + q.dy / 0.22 - Math.max(0, q.lean - 0.3) * 0.7 - Math.min(0, q.lean) * 0.6,
      -1,
      1,
    ),
    open: 0,
    side: clamp(q.roll * 2 + q.yaw * 0.4 - (q.lLz + q.lRz) * 0.5, -1, 1),
  };
};
const DESC = {
  calm: CALM.map(describe),
  sharp: SHARP.map(describe),
  arms: CALM.map(describeArms),
  legs: CALM.map(describeLegs),
};
const mirror = (p) =>
  Object.assign({}, p, {
    roll: -p.roll,
    yaw: -p.yaw,
    fL: p.fR,
    fR: p.fL,
    aLx: p.aRx,
    aRx: p.aLx,
    aLz: -p.aRz,
    aRz: -p.aLz,
    aLe: p.aRe,
    aRe: p.aLe,
    lLx: p.lRx,
    lRx: p.lLx,
    lLz: -p.lRz,
    lRz: -p.lLz,
    lLk: p.lRk,
    lRk: p.lLk,
  });

export function createDance(S, api) {
  const K = CFG.dance,
    st = {
      t: 0,
      held: true,
      rel: 0,
      mood: 0.2,
      moodSum: 0,
      idle: 0,
      poses: 0,
      rate: 0,
      spin: 0,
      turns: 0,
      dir: 0,
      tog: 0,
      // how much the two thumbs move in step (1: the same way or mirrored; about 0.4 at random), and seconds since both
      // last moved; hip: dancing hip hop, and hipT its clock (beats are counted on it)
      sync: 1,
      bothT: 9,
      hip: false,
      hipT: 0,
      hipW: 0,
      weave: 0,
      // what it is worth (CFG.dance.score): the active seconds, the kinds of thing she has shown, and the seconds she has
      // spent travelling fast
      work: 0,
      kinds: {},
      travelT: 0,
      // the moves she has shown, each once, in order (v3-look61: the choreography combination is named by them)
      parts: [],
      // what the thumbs are saying (v3-look62, CFG.dance.express), each -1..1 and eased: level, side, open (see the top
      // of the file); rise, sway: the right thumb's own motion up and across; lrise: the left thumb's, up
      fx: { level: 0, side: 0, open: 0, rise: 0, sway: 0, lrise: 0 },
      // the same, where the thumbs have been lately (eased over a second or so): what the next pose is chosen by, so a
      // thumb looping round does not ask for a new pose every half loop (v3-look65)
      sl: { level: 0, side: 0, open: 0 },
      // (v3-look68) en: how energetic the right thumb is, 0 drifting to 1 quick and busy; accents: how many of its
      // sharp jabs she has answered with an accent
      en: 0,
      accents: 0,
    };
  const X = K.express,
    // the right thumb's resting place on the glass (it follows the thumb slowly), and the thumbs' usual distance apart
    home = { on: false, x: 0, y: 0, gap: 0 },
    // each joint's speed (the springs), the pose now being taken as the thumbs are measured, and the last few chosen
    vel = {},
    want = { level: 0, open: 0, side: 0 },
    // where each joint is being led: it follows the pose a moment behind, and the joint's spring follows it, so a new
    // pose is begun gently instead of with a kick (v3-look65)
    lead = {},
    lately = { calm: [], sharp: [], arms: [], legs: [] },
    // the right thumb's velocity over the last moment (seconds, px/s, px/s; flat), for reading its jabs
    trail = [];
  for (const k of KEYS) vel[k] = 0;
  // seconds since the pose last changed
  let since = 0,
    // the feed's own clock, seconds since the last accent, the jab waiting to be answered (its direction on the glass),
    // and whether the next accent is the arms' turn
    ft = 0,
    sinceHit = 9,
    hit = null,
    upper = false,
    // how much her body follows the thumbs directly just now (eased, so going into a spin position does not jolt it)
    amp = X.live;
  const named = (n) => {
    if (n && !st.parts.includes(n)) st.parts.push(n);
  };
  // gain: how far the spin has wound up, 0 (two thumb circles to one turn of hers) to 1 (one to one). It builds while a spin is kept going, fades
  // when it is not, and is kept on the skater between dances, so a spin taken up again carries on from what was left. w: her turning speed while winding down.
  let gain = (S.spinGain || 0) * Math.exp(-Math.max(0, S.clock - (S.spinGainT || 0)) / K.gainFade),
    w = 0;
  const cur = full({}),
    from = full({}),
    out = {};
  let to = full({}),
    u = 1,
    dur = 1,
    hold = 0,
    snap = false,
    last = -1,
    facing = 0,
    begun = false,
    beat = 0,
    turnGoal = 0,
    // her turning one way, eased slowly so a thumb sweeping to and fro cancels out (the spin is read from it)
    net = 0,
    netGoal = 0,
    turned = 0,
    lastGoal = 0,
    inSpin = false,
    spinSet = 0,
    dirSet = 1,
    togSet = 0,
    hipSet = false,
    routine = -1,
    stepIx = 0,
    hipMirror = false,
    nextAt = 0;
  const H = K.hiphop,
    beatLen = 60 / H.bpm;
  // the next step of the hip hop routine, hit on the beat: a new routine (never the same twice running) when this one is
  // done, now and then danced twice
  function hipStep() {
    const len = routine >= 0 ? HIPHOP[routine].length : 0;
    if (routine < 0 || stepIx >= len * (len <= 2 ? 2 : 1)) {
      let r = Math.floor(Math.random() * HIPHOP.length);
      if (r === routine) r = (r + 1) % HIPHOP.length;
      routine = r;
      stepIx = 0;
      hipMirror = Math.random() < 0.5;
      named(NAMES.hiphop[r]);
    }
    const [p, beats] = HIPHOP[routine][stepIx % HIPHOP[routine].length];
    stepIx++;
    to = full(Object.assign({}, GROOVE, p));
    if (hipMirror) to = mirror(to);
    // each step's turn adds to where she faces (the robot turns a step at a time)
    facing += to.yaw || 0;
    to.yaw = facing;
    snap = true;
    dur = Math.min(0.11, beatLen * beats * 0.4);
    // on the beat: the step after this one lands `beats` beats after this one did
    nextAt = Math.max(nextAt, st.hipT) + beats * beatLen;
    hold = Math.max(0.02, nextAt - st.hipT - dur);
  }
  // the first pose is always a calm one, grown out of her skating
  function next(sharp) {
    for (const k of KEYS) from[k] = cur[k];
    // Turning gently (the thumb looping round, as Mark's does all the time: in his 20 Nov log 56 turns in 50 seconds),
    // she goes on dancing as the thumbs shape her, and only now and then takes one of the open spin positions. Until
    // v3-look64 any turning at all was a spin, with its own positions and the thumbs' shaping nearly off, so his dances
    // were almost all spins and he could not tell the engine was there. Circled fast, she spins as before.
    const turning = st.spin > 0;
    inSpin = st.spin > 1 || (st.spin === 1 && Math.random() < X.spinPose);
    hipSet = st.hip;
    if (st.hip && !turning) {
      spinSet = 0;
      u = 0;
      st.poses++;
      return hipStep();
    }
    routine = -1;
    // v3-look65 (Mark: "i keep seeing choppy movement i think it's hip hop it is not looking good remove it and focus on
    // elegant smooth transition from one move to another no sudden jumps"): only the elegant set now. No hip hop, and
    // none of the sharp street poses that hit in a tenth of a second; quick thumbs make her flow faster, not snap.
    snap = false;
    const set = inSpin ? (st.spin > 1 ? SPIN_FAST : SPIN_SLOW) : snap ? SHARP : CALM;
    spinSet = st.spin;
    dirSet = st.dir >= 0 ? 1 : -1;
    togSet = st.tog > 0.4 ? 1 : st.tog < -0.4 ? -1 : 0;
    let i,
      flip = Math.random() < 0.5;
    if (inSpin) {
      const ids = PICK[st.spin > 1 ? 'fast' : 'slow'][dirSet] || set.map((_, k) => k);
      i = ids[Math.floor(Math.random() * ids.length)];
      if (i === last && ids.length > 1) i = ids[(ids.indexOf(i) + 1) % ids.length];
    } else {
      // the pose (or its mirror image) that best matches what the thumbs are saying, with some chance in it, and not
      // one of the last few: so the dance follows the thumbs and is never the same twice
      const key = snap ? 'sharp' : 'calm',
        D = DESC[key],
        was = lately[key],
        f = st.sl;
      let best = -Infinity;
      for (let k = 0; k < set.length; k++) {
        const d = D[k],
          age = was.indexOf(k),
          base =
            -X.wLevel * (d.level - f.level) ** 2 -
            X.wOpen * (d.open - f.open) ** 2 -
            (age < 0 ? 0 : X.repeat / (age + 1));
        for (const m of [false, true]) {
          const sc = base - X.wSide * ((m ? -d.side : d.side) - f.side) ** 2 + Math.random() * X.chance;
          if (sc > best) {
            best = sc;
            i = k;
            flip = m;
          }
        }
      }
      was.unshift(i);
      if (was.length > X.memory) was.pop();
      const d = D[i];
      want.level = d.level;
      want.open = d.open;
      want.side = flip ? -d.side : d.side;
    }
    last = i;
    to = full(set[i]);
    if (flip) to = mirror(to);
    let name = (inSpin ? NAMES[st.spin > 1 ? 'fast' : 'slow'] : NAMES[snap ? 'sharp' : 'calm'])[i];
    // Rook: the overhead stick spin, and about half his calm gestures with the stick (never mirrored: the stick stays in
    // his right hand)
    if (S.hockey && inSpin && st.spin > 1) {
      to = full(STICK_OVERHEAD);
      name = 'Stick spin';
    }
    // Tesa: her layback in place of the plain one, and now and then in a fast spin
    else if (S.layback && inSpin && (st.spin > 1 ? Math.random() < 0.3 : i === 1)) {
      to = full(st.spin > 1 ? LAYBACK_FAST : LAYBACK_SLOW);
      name = 'Layback spin';
    } else if (S.hockey && !inSpin && !snap && Math.random() < 0.5) {
      to = full(STICK_CALM[Math.floor(Math.random() * STICK_CALM.length)]);
      name = 'Stick flourish';
    }
    named(name);
    // she keeps turning as she dances: each pose faces a little further round (v3-look65: no more sudden about-turns)
    facing += turning ? 0 : st.poses === 0 ? to.yaw * 0.4 : to.yaw;
    to.yaw = facing;
    u = 0;
    since = 0;
    st.poses++;
    if (inSpin) {
      dur = 0.8 + Math.random() * 0.3;
      hold = 1.2 + Math.random() * 1.4;
    } else if (snap) {
      dur = 0.12 + Math.random() * 0.08;
      hold = (0.2 + Math.random() * 0.3) * (1.4 - 0.6 * st.mood);
    } else {
      // (v3-look65) a pose is taken over 1.1 to 2.4 seconds, a little quicker when the thumbs are quick
      // (v3-look68) and up to twice as quick again while the thumb is energetic
      const brisk = 1 - X.quick * st.en;
      dur = (1.3 + Math.random() * 0.9) * (1.1 - 0.25 * st.mood) * brisk;
      hold = (0.3 + Math.random() * 0.8) * brisk;
    }
  }
  // An accent (v3-look68). Mark, with a log of his thumb jabbing and scribbling fast: "in these movements we can do
  // some more faster transition, like ballet and modern dance, not just about smooth transition but moments of
  // intentional upper and lower body movement fast and slow". Each sharp jab of the right thumb is answered at once
  // by a quick, deliberate movement of her arms alone or her legs and trunk alone, in turn, the rest of her held: the
  // shape that best matches the jab (up the glass: arms high, a kick, an arch; down: arms low, a plie, a lunge; to
  // one side: that way), taken from the same elegant positions, in about a third of a second on the same springs, so
  // it is quick but never a jump. It is rhythm, not a trigger: there is no gesture to make for a particular move.
  function accent(h) {
    upper = !upper;
    const key = upper ? 'arms' : 'legs',
      D = DESC[key],
      was = lately[key],
      A = X.accent,
      level = clamp(A.place * st.fx.level - A.way * h.y, -1, 1),
      side = clamp(A.place * st.fx.side + A.way * h.x, -1, 1);
    let best = -Infinity,
      i = 0,
      flip = false;
    for (let k = 0; k < CALM.length; k++) {
      const d = D[k],
        age = was.indexOf(k),
        base =
          -X.wLevel * (d.level - level) ** 2 -
          X.wOpen * (d.open - st.fx.open) ** 2 -
          (age < 0 ? 0 : X.repeat / (age + 1));
      for (const m of [false, true]) {
        const sc = base - X.wSide * ((m ? -d.side : d.side) - side) ** 2 + Math.random() * X.chance;
        if (sc > best) {
          best = sc;
          i = k;
          flip = m;
        }
      }
    }
    was.unshift(i);
    if (was.length > X.memory) was.pop();
    let P = full(CALM[i]);
    if (flip) P = mirror(P);
    to = Object.assign({}, to);
    // how far the joint with furthest to go has to travel: a big movement is given a little longer, so it is quick
    // but nothing whips
    let far = 0;
    for (const k of upper ? ARMK : LEGK) {
      far = Math.max(far, Math.abs(P[k] - cur[k]));
      to[k] = P[k];
    }
    // a pose is known by its legs: the arms alone do not make it one of her moves
    if (!upper) named(NAMES.calm[i]);
    // she is where the thumbs are, so she does not leave it at once for that
    want.level = st.sl.level;
    want.side = st.sl.side;
    want.open = st.sl.open;
    u = 0;
    since = 0;
    dur = Math.max(A.dur * (0.85 + 0.3 * Math.random()), far * A.perRad);
    hold = A.hold * (0.6 + 0.8 * Math.random());
    st.accents++;
  }
  return {
    id: 'dance',
    // hip hop: the left thumb is busy dancing, so it steers her only a little
    get steer() {
      return st.hip ? H.steer : 1;
    },
    accel: K.accel,
    state: st,
    start() {}, // no banner and no jolt: dancing is simply how she skates while the finger is down
    // the thumb lifts: a spin winds down by itself, still steered by the left thumb; the thumb coming back takes it up again
    release() {
      if (!st.held) return;
      st.held = false;
      st.rel = 0;
      w = st.spin > 0 ? st.dir : 0;
    },
    hold() {
      st.held = true;
      st.rel = 0;
    },
    // called every frame with the right thumb's speed (px/s): slow strokes are calm, quick ones sharp. sa is the left thumb's speed and
    // cos how alike the two thumbs' directions are; from them, tog drifts toward 1 while they move together, -1 while they move apart, 0 with one alone
    // cosM: the same with the left thumb's movement mirrored left to right, so thumbs moving like a pair of arms count as
    // in step too. tog: 1 in step, -1 out of step, 0 one thumb alone. Out of step long enough, she dances hip hop.
    // ex (v3-look62): the right thumb's place (rx, ry, px) and motion (rvx, rvy, px/s), the left's (lx, ly, lvx, lvy) and
    // whether it is down (left)
    feed(sb, dt, sa, cos, cosM, ex) {
      if (ex) {
        const f = st.fx,
          k = 1 - Math.exp(-X.ease * dt),
          gap = ex.left ? Math.hypot(ex.rx - ex.lx, ex.ry - ex.ly) : 0;
        if (!home.on) {
          home.on = true;
          home.x = ex.rx;
          home.y = ex.ry;
          home.gap = gap;
        }
        // its resting place drifts after it, so a thumb parked high does not hold her up for ever
        const kh = 1 - Math.exp(-X.recentre * dt);
        home.x += (ex.rx - home.x) * kh;
        home.y += (ex.ry - home.y) * kh;
        if (ex.left) home.gap += (gap - (home.gap || gap)) * kh + (home.gap ? 0 : gap);
        const rise = clamp(-ex.rvy / X.speed, -1, 1),
          sway = clamp(ex.rvx / X.speed, -1, 1);
        f.rise += (rise - f.rise) * k;
        f.sway += (sway - f.sway) * k;
        f.lrise += ((ex.left ? clamp(-ex.lvy / X.speed, -1, 1) : rise * 0.6) - f.lrise) * k;
        f.level += (clamp((-(ex.ry - home.y) / X.reach) * 0.8 + rise * 0.6, -1, 1) - f.level) * k;
        f.side += (clamp(((ex.rx - home.x) / X.reach) * 0.8 + sway * 0.5, -1, 1) - f.side) * k;
        f.open += ((ex.left ? clamp((gap - home.gap) / X.reach, -1, 1) : 0) - f.open) * k;
        const ks = 1 - Math.exp(-X.trend * dt);
        st.sl.level += (f.level - st.sl.level) * ks;
        st.sl.side += (f.side - st.sl.side) * ks;
        st.sl.open += (f.open - st.sl.open) * ks;
        // (v3-look68) how energetic the thumb is: quick to rise, slower to settle
        const A = X.accent,
          sp = Math.hypot(ex.rvx, ex.rvy),
          e = clamp((sp - A.calmPx) / (A.livelyPx - A.calmPx), 0, 1);
        st.en += (e - st.en) * (1 - Math.exp(-(e > st.en ? A.rise : A.fall) * dt));
        // and its jabs: the thumb moving fast the opposite way from a moment ago (a zigzag's corner), or fast out of
        // near stillness. A thumb going round in a loop does neither.
        ft += dt;
        sinceHit += dt;
        trail.push(ft, ex.rvx, ex.rvy);
        while (trail[0] < ft - A.window) trail.splice(0, 3);
        if (sp > A.hitPx && sinceHit >= A.gap) {
          let ox = 0,
            oy = 0,
            slow = sp;
          for (let i = 0; i < trail.length; i += 3) {
            const v = Math.hypot(trail[i + 1], trail[i + 2]);
            if (trail[i] <= ft - A.back) {
              ox = trail[i + 1];
              oy = trail[i + 2];
            }
            if (v < slow) slow = v;
          }
          const os = Math.hypot(ox, oy);
          if (
            (os > A.hitPx * 0.6 && (ox * ex.rvx + oy * ex.rvy) / (os * sp) < A.turnCos) ||
            (sp > A.burstPx && slow < A.still)
          ) {
            hit = { x: ex.rvx / sp, y: ex.rvy / sp };
            sinceHit = 0;
          }
        }
      }
      const both = sa > K.moveSpeed && sb > K.moveSpeed;
      if (both) {
        st.sync += (Math.max(cos, cosM ?? cos) - st.sync) * (1 - Math.exp(-H.syncRate * dt));
        st.bothT = 0;
      } else st.bothT += dt;
      const want = st.bothT < H.linger ? (st.sync > H.inStep ? 1 : st.sync < H.outOfStep ? -1 : st.tog) : 0;
      st.tog += (want - st.tog) * (1 - Math.exp(-2.5 * dt));
      st.hip = false;
      st.mood += (clamp((sb - K.calmPx) / (K.sharpPx - K.calmPx), 0, 1) - st.mood) * (1 - Math.exp(-1.6 * dt));
    },
    // the right thumb circling turns her, as far as it circles; she follows it on a short rubber band
    rotate(d) {
      if (st.held) turnGoal += d * (K.turnRatio + (1 - K.turnRatio) * gain);
    },
    update(dt) {
      st.t += dt;
      st.moodSum += st.mood * dt;
      if (st.hip) st.hipT += dt;
      st.hipW += ((st.hip && st.spin === 0 ? 1 : 0) - st.hipW) * (1 - Math.exp(-6 * dt));
      beat += dt * (2.2 + 3.8 * st.mood) * Math.PI;
      // she goes where the thumbs steer her and picks up speed as they push, and drifts along a lazy winding path when they don't
      // if she is nearly standing she is eased up to a gentle glide, never set moving at a stroke
      // spinning with no push from the left thumb, she slowly loses her momentum and the spin settles on the spot
      if (st.spin > 0 && S.mag < 0.15) {
        const f = Math.exp(-dt / K.spinCoast);
        S.vx *= f;
        S.vz *= f;
      } else {
        const v = api.speed();
        if (v < K.glide) {
          const nv = Math.min(K.glide, v + 2.5 * dt);
          if (v > 0.05) {
            S.vx *= nv / v;
            S.vz *= nv / v;
          } else {
            S.vx = Math.sin(S.facing) * nv;
            S.vz = Math.cos(S.facing) * nv;
          }
        }
      }
      if (S.mag < 0.15) api.rotateVel(Math.sin(st.t * 0.8) * 0.55 * dt * Math.min(1, st.t / 1.5));
      // how fast the finger is turning her (rad/s): 0 not spinning, 1 a slow spin, 2 a fast one, with a gap between going in and coming out
      if (!st.held) {
        w *= Math.exp(-dt / K.spinDown);
        turnGoal += w * dt;
      }
      st.rate += (Math.abs(turnGoal - lastGoal) / Math.max(dt, 1e-3) - st.rate) * (1 - Math.exp(-3 * dt));
      st.dir += ((turnGoal - lastGoal) / Math.max(dt, 1e-3) - st.dir) * (1 - Math.exp(-3 * dt));
      st.turns += Math.abs(turnGoal - lastGoal);
      lastGoal = turnGoal;
      // spinning along a straight path, her blade weaves like a twizzle; on a curve the line stays clean
      st.weave += ((st.spin > 0 ? 1 - clamp(Math.abs(S.turn) / 0.8, 0, 1) : 0) - st.weave) * (1 - Math.exp(-3 * dt));
      // (v3-look64) by how fast she is really going round, one way: the thumb's turning with its to and fro taken out.
      // Until then it was by all the turning the thumb's path did, so a flowing scribble with no circle in it counted as
      // a fast spin (in Mark's 20 Nov log his thumb went round 18 times in a dance and she was counted 56 turns).
      net += ((turnGoal - netGoal) / Math.max(dt, 1e-3) - net) * (1 - Math.exp(-X.spinEase * dt));
      netGoal = turnGoal;
      const round = Math.abs(net);
      st.spin =
        round > K.spinFast
          ? 2
          : round > (st.spin ? K.spinOut : K.spinIn)
            ? st.spin === 2 && round > K.spinFast * 0.75
              ? 2
              : 1
            : 0;
      // what this moment adds to her score: holding gestures, travelling, spinning (at most a whole second's worth)
      {
        const sc = K.score,
          v = api.speed();
        st.work +=
          dt *
          Math.min(
            1,
            sc.still + sc.travel * Math.min(1, v / sc.travelSpeed) + (st.spin ? sc.spin * (st.spin > 1 ? 1 : 0.7) : 0),
          );
        if (v >= sc.travelSpeed && (st.travelT += dt) >= sc.travelTime) st.kinds.travel = 1;
        // the kinds she has shown, from the thumb's mood and the spin (not from the poses drawn, so it scores the same
        // whether or not anything is on screen)
        if (st.hip) st.kinds.hiphop = 1;
        if (st.spin) st.kinds[st.spin > 1 ? 'fast' : 'spin'] = 1;
        else if (st.mood < 0.4) st.kinds.calm = 1;
        else if (st.mood > 0.6) st.kinds.sharp = 1;
      }
      if (st.held && st.spin > 0) gain = Math.min(1, gain + dt / K.gainRise);
      else gain *= Math.exp(-dt / K.gainFade);
      S.spinGain = gain;
      S.spinGainT = S.clock;
      // how much quicker everything goes when the thumb is energetic (v3-look68)
      const brisk = 1 - X.quick * st.en,
        jab = hit;
      hit = null;
      if (
        begun &&
        (st.held
          ? st.spin !== spinSet || (st.spin > 0 && u >= 1 && (st.dir >= 0 ? 1 : -1) !== dirSet)
          : st.spin > 0 && st.spin !== spinSet)
      )
        next(); // into a spin, out of one, or from the open shape to the tight one
      else if (jab && begun && st.held && !inSpin && st.spin < 2 && !st.hip)
        accent(jab); // the thumb jabbed: an accent, at once
      else if (begun && st.held && st.spin === 0 && st.hip !== hipSet)
        next(); // into hip hop, or out of it into the elegant gestures, at once
      else if (
        begun &&
        st.held &&
        !inSpin &&
        u >= X.settle &&
        since >= X.minPose * brisk &&
        Math.abs(want.level - st.sl.level) + Math.abs(want.side - st.sl.side) + 0.5 * Math.abs(want.open - st.sl.open) >
          X.moveOn
      )
        next(); // the thumbs have moved on from this pose (where they have been lately, not this instant): so does she
      else if (u < 1) u = Math.min(1, u + dt / dur);
      else if (begun && (hold -= dt) <= 0 && st.held) next();
      since += dt;
      // every joint on a spring toward its pose (v3-look62; until then each pose was eased in over its own time from a
      // standstill): it settles in about the pose's time, slowly for calm ones and at once for sharp ones, and keeps
      // its momentum when the pose changes, so one movement runs into the next. Solved exactly, so a slow frame
      // cannot make it overshoot.
      {
        const w = X.spring / dur,
          e = Math.exp(-w * dt),
          kl = 1 - Math.exp(-2 * w * dt);
        for (const k of KEYS) {
          if (lead[k] === undefined) lead[k] = cur[k];
          lead[k] += (to[k] - lead[k]) * kl;
          const d = cur[k] - lead[k],
            tmp = (vel[k] + w * d) * dt;
          cur[k] = lead[k] + (d + tmp) * e;
          vel[k] = (vel[k] - w * tmp) * e;
        }
      }
      turned += (turnGoal - turned) * (1 - Math.exp(-K.follow * dt));
      S.yawX = cur.yaw + turned; // the rubber band: she trails the finger a little and eases to a stop after it
      if (!st.held) {
        st.rel += dt;
        return st.rel < 0.35 || (st.spin > 0 && st.rel < 6);
      }
      return true;
    },
    // how: see endMove in skater.js. It is scored on what she did (CFG.dance.score), so one cut short is already worth
    // less; a crash out of it counts for nothing. Since v3-look61 it is not scored on its own: it goes into a choreography
    // combination (choreo: true, CFG.choreo), named by its moves (parts), scored and announced when that closes.
    end(how) {
      S.flipYaw = wrap(cur.yaw + turned);
      S.flipK = 2.6; // her body eases back round to face the way she is going
      const m = st.t > 0 ? st.moodSum / st.t : 0;
      api.emit('element', {
        kind: 'dance',
        choreo: true,
        parts: st.parts.slice(),
        name: 'Choreography',
        detail:
          st.t.toFixed(1) +
          ' seconds, ' +
          (st.kinds.hiphop ? 'hip hop, ' : '') +
          (m < 0.33 ? 'flowing' : m > 0.6 ? 'sharp' : 'mixed') +
          (st.turns > 9 ? ', ' + (st.turns / 6.2832).toFixed(1) + ' turns' : ''),
        base:
          dimin(CFG.points.dance[0], st.work, CFG.points.dance[1]) *
          Math.min(1, K.score.base + K.score.kind * Object.keys(st.kinds).length),
        counted: st.t >= K.minScore && how !== 'crash',
      });
    },
    // how fast she is turning in a spin (rad/s), which flares the skirts and the hair (v3-look38: the spins inside
    // choreography had not been reporting it since v3-look33, so the skirts barely lifted)
    spinRate: () => (st.spin > 0 ? st.rate : 0),
    blade(o, yaw) {
      o.width = 1.3;
      if (st.weave > 0.02) {
        const r = Math.min(0.45, (0.33 * api.speed()) / Math.max(st.rate, 2)) * st.weave;
        o.x += Math.sin(yaw) * r;
        o.z += Math.cos(yaw) * r;
      }
    },
    pose(T, kit) {
      // the first pose grows out of however she was skating
      if (!begun) {
        begun = true;
        for (const k of KEYS) if (k in T) cur[k] = T[k];
        cur.dy = T.bodyY - kit.HIP;
        cur.yaw = 0;
        next();
      }
      // on top of the pose: a slow sway when calm, a bounce on the beat when sharp
      for (const k of KEYS) if (k !== 'dy' && k !== 'yaw') out[k] = cur[k];
      const hw = st.hipW;
      out.bodyY = kit.HIP + cur.dy;
      out.roll = cur.roll + 0.07 * (1 - st.mood) * Math.sin(st.t * 1.1) * (1 - hw);
      // hip hop's groove: down on every beat, the hips swaying one way on one beat and the other way on the next
      if (hw > 0.01) {
        const b = st.hipT / beatLen,
          dip = hw * (0.5 + 0.5 * Math.cos(2 * Math.PI * b));
        out.bodyY -= H.dip * dip;
        out.lLk += 2.6 * H.dip * dip;
        out.lRk += 2.6 * H.dip * dip;
        out.lLx -= 1.3 * H.dip * dip;
        out.lRx -= 1.3 * H.dip * dip;
        out.lean += 0.5 * H.dip * dip;
        out.aLe -= 0.2 * dip;
        out.aRe -= 0.2 * dip;
        out.roll += hw * H.sway * Math.sin(Math.PI * b);
      }
      // Her body follows the thumbs live (v3-look62), less in a spin and not in hip hop. v3-look63 (Mark: "i couldnt
      // tell anything you just did with the new engine"): it follows where the right thumb is, not only how it moves,
      // and much more strongly. Thumb high on the glass: both arms rise, her chest lifts, she grows tall. Low: the arms
      // come down, she bows and sinks into her knees. To one side: she leans and tips that way. Thumbs closing
      // together: her elbows fold in. And as each thumb moves, its own arm goes with it (the right thumb her right arm,
      // the left her left). She breathes, so she is never quite still.
      {
        const f = st.fx,
          a = (amp += (X.live * (1 - hw) * (inSpin ? (st.spin > 1 ? 0.55 : 0.8) : 1) - amp) * 0.1),
          br = Math.sin(st.t * 0.9),
          low = Math.max(0, -f.level),
          shut = Math.max(0, -f.open);
        out.aLz = clamp(out.aLz - a * (X.arms * f.level + 0.45 * f.rise) - 0.05 * br, -3.2, 0.6);
        out.aRz = clamp(
          out.aRz + a * (X.arms * f.level + 0.45 * f.lrise) + 0.05 * Math.sin(st.t * 0.9 + 0.7),
          -0.6,
          3.2,
        );
        out.aLx -= a * (0.3 * f.sway + 0.25 * f.side);
        out.aRx += a * (0.3 * f.sway + 0.25 * f.side);
        out.aLe -= a * 0.6 * shut;
        out.aRe -= a * 0.6 * shut;
        out.lean += a * (X.bow * low - 0.14 * Math.max(0, f.level) - 0.1 * f.rise);
        out.roll += a * (X.tip * f.side + 0.12 * f.sway);
        out.bodyY += a * (0.04 * Math.max(0, f.level) - X.sink * low + 0.025 * f.rise) + 0.006 * Math.sin(st.t * 1.3);
        out.lLk += a * 1.6 * X.sink * low;
        out.lRk += a * 1.6 * X.sink * low;
      }
      out.side = 0;
      kit.set(out);
      // the joints take up the dance gradually over the first moment; hip hop hits hardest
      return (4 + (10 + 14 * Math.max(st.mood, hw, st.en)) * Math.min(1, st.t / 0.9)) * (1 + 0.4 * hw);
    },
  };
}
export const POSES = { N, CALM, SHARP, HIPHOP, GROOVE, NAMES, DESC };
