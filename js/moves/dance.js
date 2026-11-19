// Choreography: the artistic part of a programme. It starts when the right thumb drags, and while it stays down she improvises: gestures, positions and spins, one pose
// flowing into the next. The left thumb goes on steering her and setting her speed. How the right thumb moves sets the mood
// (0..1): slow strokes give calm, broad, sustained gestures; quick ones give sharp, low, street-dance moves that hit on a
// beat. Circling it turns her. Both thumbs moving in step (the same way, or mirrored like a pair of arms) bring out the
// elegant gestures; both moving at random, out of step with each other, hip hop (v3-look48).
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
  calm: { 1: [0, 1, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16], '-1': [2, 3, 4, 6, 7] },
  sharp: { 1: [0, 3, 4, 7], '-1': [1, 2, 5, 6, 8] },
  slow: { 1: [0], '-1': [1, 2] },
  fast: { 1: [0], '-1': [1] },
};
const full = (p) => Object.assign({}, N, p);
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
    inSpin = st.spin > 0;
    hipSet = st.hip;
    if (st.hip && !inSpin) {
      spinSet = 0;
      u = 0;
      st.poses++;
      return hipStep();
    }
    routine = -1;
    snap = !inSpin && st.poses > 0 && (sharp || Math.random() < st.mood);
    const set = inSpin ? (st.spin > 1 ? SPIN_FAST : SPIN_SLOW) : snap ? SHARP : CALM;
    spinSet = st.spin;
    dirSet = st.dir >= 0 ? 1 : -1;
    togSet = st.tog > 0.4 ? 1 : st.tog < -0.4 ? -1 : 0;
    const ids =
      (inSpin ? PICK[st.spin > 1 ? 'fast' : 'slow'][dirSet] : PICK[snap ? 'sharp' : 'calm'][togSet]) ||
      set.map((_, k) => k);
    let i = ids[Math.floor(Math.random() * ids.length)];
    if (i === last && ids.length > 1) i = ids[(ids.indexOf(i) + 1) % ids.length];
    last = i;
    to = full(set[i]);
    if (Math.random() < 0.5) to = mirror(to);
    // Rook: the overhead stick spin, and about half his calm gestures with the stick (never mirrored: the stick stays in
    // his right hand)
    if (S.hockey && inSpin && st.spin > 1) to = full(STICK_OVERHEAD);
    // Tesa: her layback in place of the plain one, and now and then in a fast spin
    else if (S.layback && inSpin && (st.spin > 1 ? Math.random() < 0.3 : i === 1))
      to = full(st.spin > 1 ? LAYBACK_FAST : LAYBACK_SLOW);
    else if (S.hockey && !inSpin && !snap && Math.random() < 0.5)
      to = full(STICK_CALM[Math.floor(Math.random() * STICK_CALM.length)]);
    // she keeps turning as she dances: each pose faces a little further round, and now and then she turns right about
    facing += inSpin
      ? 0
      : st.poses === 0
        ? to.yaw * 0.4
        : to.yaw + (Math.random() < (snap ? 0.15 : 0.25) ? (Math.random() < 0.5 ? -Math.PI : Math.PI) : 0);
    to.yaw = facing;
    u = 0;
    st.poses++;
    if (inSpin) {
      dur = 0.55 + Math.random() * 0.25;
      hold = 1.2 + Math.random() * 1.4;
    } else if (snap) {
      dur = 0.12 + Math.random() * 0.08;
      hold = (0.2 + Math.random() * 0.3) * (1.4 - 0.6 * st.mood);
    } else {
      dur = (1.1 + Math.random() * 0.9) * (1.25 - 0.6 * st.mood);
      hold = 0.25 + Math.random() * 0.8;
    }
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
    feed(sb, dt, sa, cos, cosM) {
      const both = sa > K.moveSpeed && sb > K.moveSpeed;
      if (both) {
        st.sync += (Math.max(cos, cosM ?? cos) - st.sync) * (1 - Math.exp(-H.syncRate * dt));
        st.bothT = 0;
      } else st.bothT += dt;
      const want = st.bothT < H.linger ? (st.sync > H.inStep ? 1 : st.sync < H.outOfStep ? -1 : st.tog) : 0;
      st.tog += (want - st.tog) * (1 - Math.exp(-2.5 * dt));
      st.hip = st.hip ? st.tog < -0.15 : st.tog < -0.6;
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
      st.hipW += ((st.hip && !inSpin ? 1 : 0) - st.hipW) * (1 - Math.exp(-6 * dt));
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
      st.spin =
        st.rate > K.spinFast
          ? 2
          : st.rate > (st.spin ? K.spinOut : K.spinIn)
            ? st.spin === 2 && st.rate > K.spinFast * 0.75
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
      if (
        begun &&
        (st.held
          ? st.spin !== spinSet || (st.spin > 0 && u >= 1 && (st.dir >= 0 ? 1 : -1) !== dirSet)
          : st.spin > 0 && st.spin !== spinSet)
      )
        next(); // into a spin, out of one, or from the open shape to the tight one
      else if (begun && st.held && !inSpin && st.hip !== hipSet)
        next(); // into hip hop, or out of it into the elegant gestures, at once
      else if (begun && st.held && !inSpin && !snap && st.mood > 0.6)
        next(true); // the thumbs have turned sharp: she breaks off the slow gesture at once
      else if (u < 1) u = Math.min(1, u + dt / dur);
      else if (begun && (hold -= dt) <= 0 && st.held) next();
      // calm poses ease in and out; sharp ones hit and stop
      const e = snap ? 1 - Math.pow(1 - u, 3) : u * u * u * (u * (u * 6 - 15) + 10);
      for (const k of KEYS) cur[k] = from[k] + (to[k] - from[k]) * e;
      turned += (turnGoal - turned) * (1 - Math.exp(-K.follow * dt));
      S.yawX = cur.yaw + turned; // the rubber band: she trails the finger a little and eases to a stop after it
      if (!st.held) {
        st.rel += dt;
        return st.rel < 0.35 || (st.spin > 0 && st.rel < 6);
      }
      return true;
    },
    // how: see endMove in skater.js. It is scored on what she did (CFG.dance.score), so one cut short is already worth
    // less; a crash out of it counts for nothing
    end(how) {
      S.flipYaw = wrap(cur.yaw + turned);
      S.flipK = 2.6; // her body eases back round to face the way she is going
      const m = st.t > 0 ? st.moodSum / st.t : 0;
      api.emit('element', {
        kind: 'dance',
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
      out.bodyY = kit.HIP + cur.dy - 0.04 * st.mood * Math.abs(Math.sin(beat)) * (1 - hw);
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
      out.side = 0;
      kit.set(out);
      // the joints take up the dance gradually over the first moment; hip hop hits hardest
      return (4 + (10 + 14 * Math.max(st.mood, hw)) * Math.min(1, st.t / 0.9)) * (1 + 0.4 * hw);
    },
  };
}
export const POSES = { N, CALM, SHARP, HIPHOP, GROOVE };
