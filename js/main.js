// Wires the parts together and runs the frame loop. Game rules live in sim/, moves/, scoring.js and input/tricks.js.
import { CFG } from './config.js';
import { TAU } from './core/math.js';
import { setTerrain, iceY, setIcePlane, uCanyon } from './core/terrain.js';
import { TapTracker } from './input/recognizer.js';
import { createTricks } from './input/tricks.js';
import { createInput } from './input/pointers.js';
import { createSkater } from './sim/skater.js';
import { createScene } from './render/scene.js';
import { createModels } from './render/model.js';
import { loadAvatar } from './render/avatar.js';
import { createBear } from './render/bear.js';
import { createPoser } from './render/poses.js';
import { createTrace, PALETTES } from './render/trace.js';
import { createRing } from './render/ring.js';
import { createSpray } from './render/spray.js';
import { createIcicles } from './render/icicles.js';
import { createIslands } from './render/islands.js';
import { createSolar } from './render/solar.js';
import { createHud } from './ui/hud.js';
import { createTutorial } from './ui/tutorial.js';
import { createLog } from './log.js';
import { createScoring } from './scoring.js';
import * as save from './save.js';
import { createUpdater } from './update.js';
import { createPads, createRace } from './modes.js';
import { createDuet } from './duet.js';
import { createStick } from './render/stick.js';
import { createFront } from './ui/front.js';
import { createShowcase } from './ui/showcase.js';
import { createAudio } from './audio.js';
import * as THREE from './render/three.js';

// v3-look40: the front page frames the skater below the status bar and above the choices, from lower down and further
// back; a drag turns her round (a turntable), a flick spins her, and she goes through gestures as she turns
const BUILD = 'v3-look84';
let world;
try {
  world = createScene(document.getElementById('c'));
} catch (e) {
  document.getElementById('err').style.display = 'flex';
  throw e;
}
const saved = save.load();
const hud = createHud(world.coarse),
  log = createLog(BUILD),
  trace = createTrace(world.scene),
  ring = createRing(world.scene),
  spray = createSpray(world.scene),
  icicles = createIcicles(world.scene),
  forest = createIslands(world.scene),
  solar = createSolar(world.scene, world.renderer, world.camera),
  models = createModels(world.scene),
  stick = createStick(world.scene);
// Each skater's realistic body (Microsoft Rocketbox avatars, MIT licence) loads in the background the first time that
// skater is chosen; until it arrives the simple figure stands in.
const avU = { uTime: { value: 0 }, uSparkle: { value: 1 } },
  avatars = [null, null, null, null, null, null],
  asked = [false, false, false, false, false, false];
const texOf = (n) => ({
  body: `assets/${n}_body.jpg`,
  bodyN: `assets/${n}_body_n.jpg`,
  mask: `assets/${n}_mask.png`,
  head: `assets/${n}_head.jpg`,
  headN: `assets/${n}_head_n.jpg`,
  hair: `assets/${n}_hair.webp`,
});
const showAvatar = () =>
  avatars.forEach((a, i) => {
    if (!a) return;
    const on = models.index === i;
    a.visible = on;
    models.chars[i].inner.traverse((o) => {
      if (o.isMesh) o.visible = !on;
    });
  });
// Tesa: a Scandinavian princess with white hair in a bun, slender and tall, in a princess's winter coat (v3-look39):
// a fitted ice-blue velvet coat, buttoned to the waist and open below it, trimmed with white fur down its front edges,
// round the hem and at the cuffs, bordered and scattered with crystals, over a short white skating skirt embroidered
// with crystals; a white fur collar; a pearl-edged silver kokoshnik. As she spins the coat swings open and up and shows
// her legs; both layers fold and ripple like cloth and trail behind the spin.
const AVA_SLIM = {
  Spine: -0.012,
  Spine1: -0.008,
  Pelvis: -0.006,
  Thigh: -0.01,
  Calf: -0.005,
  UpperArm: -0.006,
  Forearm: -0.003,
};
const AVA_SKIRT = [
  {
    length: 0.34,
    waist: [0.12, 0.09],
    rest: 11,
    open: 38,
    lift: 0,
    bell: 0.8,
    follow: 0.45,
    lobes: 11,
    godet: 0.3,
    flute: 0.02,
    trail: 0.25,
    k: 5,
    gain: 1.2,
    colours: [0xfbfcff, 0xe2e9f8],
    opacity: 1,
    rough: 0.3,
    iridescence: 0.35,
    sheen: 0.6,
    sparkle: 0.4,
    embroider: 'under',
  },
  {
    length: 0.86,
    waist: [0.137, 0.107],
    rest: 22,
    open: 84,
    lift: 0.08,
    bell: 0.85,
    follow: 0.5,
    split: [6, 44, 150],
    lobes: 7,
    godet: 0.32,
    flute: 0.05,
    trail: 0.45,
    k: 4.5,
    gain: 1.6,
    colours: [0x8ab1e8, 0x4870bf],
    opacity: 1,
    rough: 0.72,
    iridescence: 0,
    sheen: 1,
    sheenColor: 0xd4e6ff,
    sparkle: 0.15,
    embroider: 'over',
    fur: { shells: 5, length: 0.024, density: [260, 60], colour: 0xc9c2dc, tip: 0xffffff, edge: [0.026, 0.06] },
  },
];
const AVA_STOLE = {
  size: 0.7,
  light: true,
  fur: { shells: 4, length: 0.016, density: [64, 22], colour: 0xc9c2dc, tip: 0xffffff },
};
const AV_OPTS = [
  {
    url: 'assets/ava_model.js',
    tex: texOf('ava'),
    height: 1.72,
    skirt: AVA_SKIRT,
    // stars of light winking over her coat, skirt and kokoshnik at night (v3-look41)
    glints: { count: 60, size: 0.22, bright: 3, rate: [0.35, 0.9], coat: 0.75, tiara: 0.12, day: 0 },
    camera: world.camera,
    mantle: AVA_STOLE,
    cuffs: {
      length: 0.075,
      radius: 0.036,
      colour: 0xe8e4f0,
      fur: { shells: 4, length: 0.012, density: [48, 8], colour: 0xc9c2dc, tip: 0xffffff },
    },
    tiara: true,
    flareGain: 1.6,
    inflate: AVA_SLIM,
    look: {
      iridescence: 0.6,
      sheen: 0xd6e6ff,
      sparkle: 1,
      fabricSheen: true,
      skinRough: 0.85,
      crystals: 1.3,
      tint: [0.36, 0.55, 1.0],
      tintAmt: 0.9,
      sleeve: 0x7aa3e0,
    },
  },
  null,
  null,
];
// Ivor: tall, shirtless and muscular; the bulk is added along the normals, most on the chest, shoulders and arms
const MAX_BULK = {
  Spine2: 0.036,
  Spine1: 0.004,
  Spine: -0.008,
  Clavicle: 0.036,
  Neck: 0.036,
  UpperArm: 0.034,
  Forearm: 0.02,
  Thigh: 0.034,
  Calf: 0.022,
  RCheek: -0.004,
  LCheek: -0.004,
};
// boulder shoulders: a round swell over each shoulder joint, and the traps rising toward the neck
const MAX_BUMPS = [
  { bone: 'Bip01 L UpperArm', a: 0.052, r: 0.09, out: 0.02, up: 0.015 },
  { bone: 'Bip01 R UpperArm', a: 0.052, r: 0.09, out: 0.02, up: 0.015 },
  // v3-look72: his chest, and the lats that widen his back under the arms
  { at: [0.075, -0.13, 1.32], a: 0.022, r: 0.065 },
  { at: [-0.075, -0.13, 1.32], a: 0.022, r: 0.065 },
  { at: [0.155, 0.03, 1.22], a: 0.02, r: 0.08 },
  { at: [-0.155, 0.03, 1.22], a: 0.02, r: 0.08 },
  { bone: 'Bip01 L UpperArm', mid: 'Bip01 Neck', a: 0.022, r: 0.06, up: 0.03 },
  { bone: 'Bip01 R UpperArm', mid: 'Bip01 Neck', a: 0.022, r: 0.06, up: 0.03 },
];
// his strawberry-blond dreadlocks: 22 heavy locks of 12 joints each (lengths in metres)
// heavy locks: damped, stiff, barely stirred by wind
const MAX_HAIR = {
  count: 22,
  joints: 12,
  length: 0.52,
  radius: 0.023,
  keep: 0.989,
  drag: 0.8,
  bend: 0.5,
  windy: 0.4,
  colours: [0xd29a62, 0xefc08a, 0xf8dcae],
};
// v3-look72, Mark: "make ivor torso more narrow and wider shoulder give him viking beard", then "superhero type body
// wide chest and shoulder narrow waist thick legs. beard is decorative non functional does not move". On the same
// model: the trunk drawn in at the waist and let out across the ribs (taperTrunk in avatar.js; rows of [height in the
// model's metres, across, front to back]), the collarbones moved out 5 cm each side, a deep chest, lats under the
// arms, bigger arms and thick legs (MAX_BULK, MAX_BUMPS); and a sculpted beard that rides on his head (beard.js).
// v3-look72 took his fur mantle off; v3-look73 put it back (size 1.1) and brought the beard forward to lie over it.
const MAX_SHAPE = {
  mid: -0.01,
  taper: [
    [0.86, 1, 1],
    [0.95, 0.94, 0.97],
    [1.05, 0.8, 0.9],
    [1.14, 0.82, 0.92],
    [1.23, 0.98, 0.99],
    [1.32, 1.12, 1.05],
    [1.41, 1.06, 1.03],
    [1.48, 1, 1],
  ],
  shoulders: 0.05,
};
// (heights and places in the head's own metres: x across, -y forward, z up)
const MAX_BEARD = {
  thick: [0.006, 0.02],
  top: 1.7,
  bottom: 1.55,
  soft: 0.004,
  // the mesh's grain: 5.6 mm, about 15,000 triangles (4.2 mm was 27,600 and looked the same from the play view)
  cell: 0.0056,
  melt: 0.022,
  shapes: [
    // the beard below the chin, out over the fur on his chest (v3-look73: further forward, to lie on the mantle), wide
    // and flat
    { a: [0, -0.1, 1.545], b: [0, -0.215, 1.425], r: [0.046, 0.018], flat: 1.5 },
    // from each side of the jaw in to the point
    { a: [0.068, -0.045, 1.58], b: [0.02, -0.2, 1.445], r: [0.026, 0.014], flat: 1.2 },
    { a: [-0.068, -0.045, 1.58], b: [-0.02, -0.2, 1.445], r: [0.026, 0.014], flat: 1.2 },
  ],
  // no moustache (v3-look82, Mark: "ivor mustache is too much get rid of it"): the beard is cut away round his mouth and
  // over his upper lip, an oval [centre, radii] (the drooping moustache shapes of v3-look72 are gone too)
  shave: { at: [0, -0.12, 1.626], r: [0.05, 0.07, 0.036] },
  braids: [
    { a: [0.017, -0.222, 1.43], b: [0.026, -0.265, 1.315], r: 0.011, rings: [0.42, 0.78] },
    { a: [-0.017, -0.222, 1.43], b: [-0.026, -0.265, 1.315], r: 0.011, rings: [0.42, 0.78] },
  ],
  colour: 0xc8884f,
  ring: 0xdfe3ea,
};
AV_OPTS[1] = {
  url: 'assets/max_model.js',
  shape: MAX_SHAPE,
  beard: MAX_BEARD,
  // no hair texture: his dreadlocks replace the model's hair cards
  tex: Object.assign(texOf('max'), { hair: null }),
  height: 1.92,
  skirt: false,
  inflate: MAX_BULK,
  bumps: MAX_BUMPS,
  // his fur mantle (back in v3-look73, Mark: "bring back his viking fur clothing"): a little larger than before
  // (1), to lie over his broader shoulders; at 1.2 it was a ring round him
  mantle: { size: 1.1 },
  longHair: MAX_HAIR,
  // the base model's round face, drawn in a little at the cheeks and jaw (v3-look43)
  slimFace: 0.1,
  camera: world.camera,
  look: { iridescence: 0, sheen: 0xffd2b0, sheenAmt: 0.25, rough: 0.46, sparkle: 0 },
};
// Rook: a hockey player, on his own body and face since v3-look44 (Rocketbox Male_Adult_08: short brown hair,
// clean-shaven), in a loose navy jersey with shoulder pads, padded pants, striped socks, a helmet and gloves, on hockey
// skates, with his stick (stick.js).
const ROOK_BULK = {
  Spine2: 0.042,
  Spine1: 0.038,
  Spine: 0.034,
  Pelvis: 0.03,
  Clavicle: 0.034,
  Neck: 0.008,
  UpperArm: 0.03,
  Forearm: 0.024,
  Thigh: 0.034,
  Calf: 0.012,
};
const ROOK_PADS = [
  { bone: 'Bip01 L UpperArm', a: 0.045, r: 0.1, out: 0.01, up: 0.025 },
  { bone: 'Bip01 R UpperArm', a: 0.045, r: 0.1, out: 0.01, up: 0.025 },
];
AV_OPTS[2] = {
  url: 'assets/rook_model.js',
  // no hair texture: his helmet replaces the model's hair cards
  tex: Object.assign(texOf('rook'), { hair: null }),
  height: 1.86,
  skirt: false,
  inflate: ROOK_BULK,
  bumps: ROOK_PADS,
  hockey: true,
  look: { iridescence: 0, sheen: 0xaab8e0, sheenAmt: 0.2, rough: 0.72, sparkle: 0 },
};
// Bjorn, the polar bear (v3-look48): his body is built in code (bear.js), at once, the first time he is chosen
AV_OPTS[3] = { bear: true };
// Lumi and Seolhwa (v3-look71, Mark: "lets do 3 female variations. we can use the same body but different appearance.
// keep the current, make new one with figure skater costume, and one wearing hanbok korean clothes with black hair
// pinned. her signature is long sleeves that flays out beyond arms length like long ribbon ... when she spins and
// automatically reduces to arms length as spin reduces"). Both are Tesa's body and face (the same model file) with
// their own hair colour (look.hair, through assets/ava_head_mask.png) and clothes.
//
// Lumi: a competition dress. Tesa's painted bodice and sheer sleeves taken to violet in the shader, skin-toned tights,
// and a short two-layer chiffon skirt, violet at the waist to pink at the hem, set with crystals; chestnut hair.
const LUMI_SKIRT = [
  {
    length: 0.25,
    waist: [0.125, 0.095],
    rest: 15,
    open: 74,
    lift: 0.02,
    bell: 0.8,
    follow: 0.45,
    lobes: 13,
    godet: 0.3,
    flute: 0.025,
    trail: 0.3,
    k: 6,
    gain: 1.3,
    colours: [0x6a2ae0, 0xf276b4],
    opacity: 1,
    rough: 0.36,
    iridescence: 0.35,
    sheen: 0.7,
    sheenColor: 0xffd0ee,
    sparkle: 0.8,
  },
  {
    length: 0.32,
    waist: [0.132, 0.102],
    rest: 19,
    open: 82,
    lift: 0.03,
    bell: 0.8,
    follow: 0.45,
    lobes: 9,
    godet: 0.34,
    flute: 0.04,
    trail: 0.4,
    k: 5,
    gain: 1.6,
    colours: [0x5b22d6, 0xff5fa8],
    opacity: 1,
    rough: 0.34,
    iridescence: 0.45,
    sheen: 0.7,
    sheenColor: 0xffd0ee,
    sparkle: 1,
    crystals: 0.3,
  },
];
AV_OPTS[4] = {
  url: 'assets/ava_model.js',
  tex: Object.assign(texOf('ava'), { headMask: 'assets/ava_head_mask.png' }),
  height: 1.72,
  skirt: LUMI_SKIRT,
  glints: { count: 36, size: 0.2, bright: 3, rate: [0.35, 0.9], coat: 0.7, tiara: 0, day: 0 },
  camera: world.camera,
  flareGain: 1.6,
  inflate: AVA_SLIM,
  look: {
    iridescence: 0.3,
    sheen: 0xffd6f0,
    sparkle: 1,
    fabricSheen: true,
    skinRough: 0.85,
    crystals: 0.5,
    tint: [0.34, 0.11, 0.9],
    tintAmt: 0.95,
    tights: 0xe6b494,
    hair: 0x5c3218,
    brow: 0.3,
  },
};
// Seolhwa ("snow flower"): a hanbok for the ice. An ivory jeogori painted on her body (assets/seol_body.jpg: crimson
// collar crossing left over right, white inner strip) with wide sleeves built over her arms; a crimson chima tied under
// the bust and falling to mid-calf, a band of gold leaf above its hem, over a white underskirt; the jacket's two
// crimson ties from a knot on her right breast; black hair in its bun with a gold and jade pin through it and a
// crimson ribbon down her back. Her signature: the sleeves' ends lie at her hands and are let out, up to `ends.full`
// metres, as she spins (ribbon.js), drawing back as the spin dies.
const SEOL_SKIRT = [
  {
    length: 0.7,
    waist: [0.14, 0.11],
    rest: 11,
    open: 48,
    lift: 0,
    bell: 0.85,
    follow: 0.45,
    lobes: 11,
    godet: 0.3,
    flute: 0.02,
    trail: 0.25,
    k: 5,
    gain: 1.2,
    colours: [0xfbfaf6, 0xebe7df],
    opacity: 1,
    rough: 0.5,
    iridescence: 0,
    sheen: 0.4,
    sparkle: 0,
  },
  {
    top: 1.215,
    length: 0.97,
    waist: [0.132, 0.112],
    rest: 13,
    open: 66,
    lift: 0.06,
    bell: 0.75,
    follow: 0.5,
    lobes: 9,
    godet: 0.3,
    flute: 0.05,
    trail: 0.4,
    k: 4.2,
    gain: 1.5,
    colours: [0xc21a34, 0x9c1028],
    opacity: 1,
    rough: 0.55,
    iridescence: 0,
    sheen: 0.5,
    sheenColor: 0xffc0b0,
    sparkle: 0,
    embroider: 'hem',
    embColour: 0xe6b84a,
    embSolid: true,
    embScatter: 2,
  },
];
AV_OPTS[5] = {
  url: 'assets/ava_model.js',
  tex: Object.assign(texOf('ava'), {
    body: 'assets/seol_body.jpg',
    mask: 'assets/seol_mask.png',
    head: 'assets/seol_head.jpg',
    headMask: 'assets/ava_head_mask.png',
  }),
  height: 1.72,
  skirt: SEOL_SKIRT,
  camera: world.camera,
  flareGain: 1.6,
  inflate: AVA_SLIM,
  hanbok: {
    cloth: '#f6f1e6',
    trim: '#a8122a',
    gold: '#d9b35a',
    sleeve: { from: 0.16, past: 0.02, rise: 0.048, half: [0.052, 0.064], drop: [0.06, 0.11] },
    // rest: metres of sleeve beyond the wrist when she is not spinning (to her fingertips); full: in a full spin.
    // gain: a spin of 1 / gain of the fastest (18 radians a second) lets them all the way out: 10 radians a second
    ends: {
      n: 24,
      width: [0.13, 0.1],
      rest: 0.18,
      full: 1.7,
      gain: 1.8,
      keep: 0.985,
      drag: 0.3,
      flutter: 0.8,
      flat: 0.7,
      twist: 0.5,
    },
    // the knot: [across (her right is -), metres over the ice]; tails: [length, across from the knot]
    ties: {
      at: [-0.055, 1.272],
      width: 0.055,
      tails: [
        [0.5, -0.014],
        [0.6, 0.014],
      ],
    },
    daenggi: { length: 0.36, width: 0.05 },
    // round shapes the ribbons cannot enter: [the bone it rides on, where (standing, metres), radius]
    balls: [
      ['Bip01 Spine2', [0, 1.3, 0], 0.16],
      ['Bip01 Pelvis', [0, 1.02, 0], 0.22],
      ['Bip01 Pelvis', [0, 0.74, 0], 0.3],
      ['Bip01 Pelvis', [0, 0.46, 0], 0.37],
    ],
  },
  look: {
    iridescence: 0,
    sheen: 0xfff4e0,
    sheenAmt: 0.3,
    rough: 0.62,
    sparkle: 0,
    fabricSheen: true,
    skinRough: 0.85,
    hair: 0x18161d,
    brow: 0.55,
    lips: 0xb0283a,
  },
};
// load a skater's realistic body the first time it is needed
const ensureAvatar = (i) => {
  if (asked[i] || !AV_OPTS[i]) return;
  asked[i] = true;
  if (AV_OPTS[i].bear) {
    avatars[i] = createBear(models, i, world.scene);
    return showAvatar();
  }
  loadAvatar(models, i, AV_OPTS[i], avU, (a) => {
    avatars[i] = a;
    a.night(CFG.looks[lookIx].night ? 1 : 0);
    showAvatar();
  });
};
let avatar = null;
const pose = createPoser(models),
  taps = new TapTracker(CFG.tap);
// Each of the front page's modes keeps its own score: Olympic, Infinite, Tutorial
const scores = [createScoring(saved && saved.sc), createScoring(saved && saved.sci), createScoring(saved && saved.sct)];
let score = scores[0];
let dirty = false;
const showScore = () => hud.score(score.state);
const tutorial = createTutorial();
const wrapIx = (i, n) => ((i % n) + n) % n;
let placeIx = 0,
  lookIx = 0,
  paperOn = false,
  inCanyon = false;
// The place and the time of day together: the ice and its light, or a paper sheet whose surface and line depend on the
// time of day (CFG.paper).
const applyScene = () => {
  const look = CFG.looks[lookIx],
    place = CFG.places[placeIx],
    sheet = place.paper ? CFG.paper[look.name] : null;
  paperOn = !!sheet;
  // rolling ice, the canyon, or flat; where she stands follows at once
  setTerrain(place);
  // the Canyon: arriving from another place, she starts at the top of the run, sliding gently down it
  // the Tunnel: arriving from another place, she starts at the top of the run, on the bottom of the tube
  if (place.canyon && !inCanyon) game.enterTube(2);
  inCanyon = !!place.canyon;
  if (!place.canyon) {
    S.tube = false;
    S.gy = S.wy = iceY(S.x, S.z);
  }
  world.setLook(look);
  world.setPaper(sheet);
  // paper at dusk: the solar system, its sun a few metres ahead of her (v3-look77), where her top speed is doubled
  // (v3-look78: at her usual top speed the Earth is 8 min 19 s away, as it is for light)
  solar.set(!!(sheet && sheet.space), S.x, S.z);
  S.speedK = sheet && sheet.space ? 2 : 1;
  // and her jumps are light (v3-look82)
  S.gravK = sheet && sheet.space ? sheet.gravity || 1 : 1;
  S.jumpK = sheet && sheet.space ? sheet.jump || 1 : 1;
  world.setPlace(place);
  boardStill();
  forest.set(place.trees);
  trace.ink(sheet);
  trace.glow(look.lineGlow || 1);
  trace.punch(look.linePunch || 1, look.lineWide || 1);
  // the crystals on her clothes flash brighter at night
  avU.uSparkle.value = look.sparkle || 1;
  avatars.forEach((a) => a && a.night(look.night ? 1 : 0));
  forest.night(look.night ? 1 : 0);
  duet.night(look.night ? 1 : 0);
  icicles.strength = look.night ? 1 : 0.75;
  hud.text('timename', look.name);
  hud.text('placename', place.name);
};
const setLook = (i) => {
  lookIx = wrapIx(i, CFG.looks.length);
  applyScene();
};
const showGfx = () => hud.text('gfxname', world.qualityName);
const setPlace = (i) => {
  placeIx = wrapIx(i, CFG.places.length);
  applyScene();
};
const setChar = (i) => {
  models.setChar(i);
  ensureAvatar(models.index);
  showAvatar();
  S.hockey = !!models.rig.hockey;
  S.layback = !!models.rig.layback;
  stick.visible = S.hockey;
  hud.text('charname', models.rig.name);
};
// Olympic, Infinite or Tutorial
const PLAY = ['olympic', 'infinite', 'tutorial'];
let playIx = 0;
const setPlay = (i) => {
  playIx = wrapIx(i, PLAY.length);
  score = scores[playIx];
  S.forgiving = CFG.play.forgiving[playIx];
  PLAY.forEach((k, j) => document.body.classList.toggle('play-' + k, j === playIx));
  tutorial.setOn(playIx === 2);
  showScore();
  hud.mode(PLAY[playIx]);
  hud.text('playname', CFG.play.names[playIx]);
  if (world.view.zoomed) hud.board(true, score.state);
};

// Skating sounds (audio.js, v3-look59): they mix with the music app (an ambient audio session), start on the first
// touch, and the menu's Sound switch turns them off (saved)
const audio = createAudio();
audio.setOn(!(saved && saved.snd === 0));
for (const t of ['pointerdown', 'touchend', 'click', 'keydown'])
  window.addEventListener(t, audio.unlock, { capture: true, passive: true });
// the push of each stride, for its scrape: entering the part of the stride where she pushes off
let striding = false;

// What the skater reports, and what the rest of the game does about it.
const game = createSkater((type, d) => {
  tutorial.event(type, d);
  if (type === 'takeoff') {
    ring.start(d.yaw);
    score.mark();
    audio.takeoff();
  } else if (type === 'land') {
    audio.land(d.grade);
    if (!game.S.tube) spray.emit(game.S.x, game.S.z, game.S.vx, game.S.vz, d.grade === 'fall' ? 40 : 22, 2.2, 6.3);
    const e = score.jump(d);
    // a jump within a choreography combination is one of its moves too
    score.choreoJump(e, d);
    log.jump(Object.assign({ pts: e ? e.pts : 0 }, d));
    if (d.grade === 'fall')
      hud.say('Fall', (d.name ? d.name + ' under-rotated' : 'bad landing') + ' · ' + d.offDeg + '° off', 2.4, e);
    else if (d.grade === 'stumble')
      hud.say('Stumble', (d.name ? d.name + ' under-rotated' : 'bad landing') + ' · ' + d.offDeg + '° off', 2.4, e);
    else if (d.name) {
      hud.say(
        d.name + (d.grade === 'perfect' ? '!' : ''),
        d.grade +
          ' landing · ' +
          d.offDeg +
          '° off' +
          (d.target % 1 ? (d.back ? ' · now backward' : ' · now forward') : '') +
          (d.speedGain ? ' · top speed +' + Math.round(d.speedGain * 3.6) + ' km/h' : ''),
        2.8,
        e,
      );
      if (!game.S.tube) trace.rosette(game.S, Math.floor(d.target));
    }
    dirty = true;
    showScore();
  } else if (type === 'say') hud.say(d.big, d.small, d.hold);
  else if (type === 'crash') {
    if (!game.S.tube) spray.emit(game.S.x, game.S.z, game.S.vx, game.S.vz, 40, 2.4, 6.3);
    audio.crash(!!d.stumble);
    // Infinite and Tutorial: she bounces off and stumbles, and it costs nothing
    if (d.stumble) {
      hud.say('Bump', 'ran into ' + d.what, 2);
      return;
    }
    const e = score.jump({ grade: 'fall', crash: 'ran into ' + d.what });
    hud.say('Crash', 'ran into ' + d.what, 2.4, e);
    dirty = true;
    showScore();
  } else if (type === 'element') {
    if (d.counted === false) {
      log.element(d);
      return;
    }
    // choreography is not announced: it goes into a combination, scored when that closes (v3-look61, below)
    if (d.choreo) {
      score.choreo(d);
      log.element(d);
      return;
    }
    const e = score.element(d);
    log.element(Object.assign({ pts: e.pts }, d));
    hud.say(d.name, d.detail, 2.8, e);
    dirty = true;
    showScore();
  }
});
const S = game.S,
  tricks = createTricks(game, taps, log);
// The scoreboard over the overview, or (the canyon, where there is no overview: view.still) over the view as it was
const boardStill = () => {
  const still = world.view.still;
  document.body.classList.toggle('still', still);
  hud.text(
    'bfoot',
    still ? 'Paused. Tap Skate to skate on.' : 'Paused. Drag to move around, pinch to zoom. Tap Skate to skate on.',
  );
};
const setZoom = () => {
  const z = world.toggleZoom();
  hud.text('zoom', z ? 'Skate' : 'Scores');
  boardStill();
  hud.board(z, score.state);
  if (z) {
    hud.stick(false);
    persist();
  }
  last = performance.now();
};
const input = createInput(document.getElementById('c'), game, tricks, taps, world.view, hud, setZoom);

// Ways to play: free skating, or one of the modes (modes.js, duet.js). Race best times are kept with the save.
const bests = (saved && saved.rb) || {},
  sayMode = (big, small, hold) => hud.say(big, small, hold);
const duet = createDuet(world.scene, game, (m, i, done) => loadAvatar(m, i, AV_OPTS[i], avU, done));
// the duet partner never plays Rook (who would need his stick)
const MODES = [
  null,
  createPads(world.scene, game, sayMode),
  createRace(world.scene, game, sayMode, () => score.state.total, bests),
  duet,
];
let modeIx = 0,
  modeLineT = 0;
const setMode = (i, quiet) => {
  const n = MODES.length;
  if (MODES[modeIx]) MODES[modeIx].off();
  modeIx = ((i % n) + n) % n;
  const m = MODES[modeIx];
  if (m) m.on(models.index);
  hud.text('modename', CFG.modes.names[modeIx]);
  hud.text('modeline', '');
  if (m && !quiet && modeIx !== 2) hud.say(m.name, m.hint, 3.2);
};

// saved drawing and score
if (saved) {
  trace.palette = saved.pv === 2 ? saved.pal | 0 : 0;
  trace.restore(saved.prints, saved.pf || 5);
  S.x = +saved.x || 0;
  S.z = +saved.z || 0;
  S.skated = +saved.skated || 0;
  world.snapTo(S.x, S.z);
}
setChar(saved ? saved.ch | 0 : 0);
placeIx = saved ? wrapIx(saved.pl | 0, CFG.places.length) : 0;
// before v3-look37 there were five times of day (Day, Golden hour, Blue hour, Night, Dawn); now Dawn, Day, Dusk
setLook(saved ? (saved.lv === 2 ? saved.tm | 0 : ([1, 1, 2, 2, 0][saved.tm | 0] ?? 1)) : 1);
setMode(saved ? saved.md | 0 : 0, true);
setPlay(saved ? saved.pm | 0 : 0);
if (saved && saved.gq && saved.gq !== 'Auto' && CFG.quality[saved.gq]) world.setQuality(saved.gq, false);
showGfx();
const persist = () => {
  if (!dirty) return;
  dirty = false;
  save.store({
    x: S.x,
    z: S.z,
    skated: S.skated,
    pal: trace.palette,
    pv: 2,
    pf: 6,
    ch: models.index,
    pl: placeIx,
    tm: lookIx,
    lv: 2,
    md: modeIx,
    pm: playIx,
    rb: bests,
    ui: uiIx,
    uv: 3,
    gq: world.auto ? 'Auto' : world.qualityName,
    snd: audio.on ? 1 : 0,
    sol: solar.found,
    solo: solar.orbits,
    va: world.angles.mode,
    sc: scores[0].serialise(),
    sci: scores[1].serialise(),
    sct: scores[2].serialise(),
    prints: trace.serialise(),
  });
};
setInterval(persist, 20000); // saving a big drawing costs a frame or two, so it is done rarely and whenever the game pauses
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});

// the front page: skater, place, time of day and mode, then Start. Dragging across the scene turns the skater round.
const showcase = createShowcase(
  S,
  document.getElementById('front'),
  document.getElementById('fcard'),
  () => models.index,
  () => front.turned(),
);
const front = createFront(
  [
    { id: 'fchar', names: () => models.chars.map((c) => c.name), get: () => models.index, set: setChar },
    { id: 'fplace', names: () => CFG.places.map((p) => p.name), get: () => placeIx, set: setPlace },
    { id: 'ftime', names: () => CFG.looks.map((l) => l.name), get: () => lookIx, set: setLook },
    { id: 'fmode', names: () => CFG.play.names, get: () => playIx, set: setPlay },
  ],
  () => CFG.play.about[playIx],
  () => {
    showcase.stop();
    dirty = true;
    persist();
    last = performance.now();
    log.note(
      'start: ' +
        [models.rig.name, CFG.places[placeIx].name, CFG.looks[lookIx].name, CFG.play.names[playIx]].join(', '),
    );
  },
  (on) => {
    world.showcase(on);
    // standing still for the front page, she turns a little toward the camera
    if (on && game.speed() < 0.5) S.facing = 0.4;
  },
);
front.show();

// buttons
const countText = () => {
  const c = log.counts();
  return (
    c.minutes +
    ' min played · ' +
    c.strokes +
    ' touches · ' +
    c.jumps +
    ' jumps recorded. Stays on this device until you copy it.'
  );
};
// the build that is running, and bringing a Home Screen copy up to date: checked at launch, on coming back to the game, and from the menu
let updNote = '';
const showBuild = () => hud.text('buildname', 'Build ' + BUILD + (updNote ? ' · ' + updNote : ''));
const updater = createUpdater(
  BUILD,
  (s) => {
    updNote = s;
    showBuild();
  },
  () => {
    dirty = true;
    persist();
  },
);
hud.on('update', () => updater.check(true));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updater.check(false);
});
updater.check(false);
const showMenu = () => {
  showBuild();
  hud.text('logcount', countText());
  hud.text('logstatus', '');
  hud.text('charname', models.rig.name);
  hud.swatch(PALETTES[trace.palette].css, PALETTES[trace.palette].name);
  hud.sheet(true);
};
hud.on('zoom', setZoom);
hud.on('score', setZoom);
hud.on('menu', showMenu);
hud.on('close', () => {
  hud.sheet(false);
  last = performance.now();
});
hud.on('movesbtn', () => hud.page('moves'));
hud.on('homebtn', () => {
  hud.sheet(false);
  front.show();
});
hud.on('back', () => hud.page('home'));
// a tap outside the menu card closes the menu
document.getElementById('sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet') {
    hud.sheet(false);
    last = performance.now();
  }
});
hud.on('char', () => {
  setChar(models.index + 1);
  dirty = true;
});
hud.on('timebtn', () => {
  setLook(lookIx + 1);
  dirty = true;
});
hud.on('modebtn', () => {
  setMode(modeIx + 1);
  dirty = true;
});
// Screen: the look and layout of everything drawn over the ice
const UI_STYLES = ['Classic', 'Broadcast', 'Glass', 'Minimal', 'Arcade'];
// Minimal is the standard screen; v3-look38 set everyone back to it once (uv 3), and a style chosen since then is kept
let uiIx = saved && saved.uv === 3 && UI_STYLES[saved.ui] ? saved.ui : 3;
const setUi = (i) => {
  uiIx = (i + UI_STYLES.length) % UI_STYLES.length;
  UI_STYLES.forEach((n, k) => document.body.classList.toggle('ui-' + n.toLowerCase(), k === uiIx));
  hud.text('uiname', UI_STYLES[uiIx]);
  hud.refit();
};
setUi(uiIx);
hud.on('uibtn', () => {
  setUi(uiIx + 1);
  dirty = true;
});
// View: Auto, the camera's angle moving on now and then (v3-look72; called Changing until v3-look80), or one view
// held: axo, flat, high or top (v3-look79, named by Mark). Saved; before v3-look79 `va` was 1 (changing) or 0 (fixed,
// which was axo); in v3-look79 'changing' was Auto. Anything not a view's name is Auto.
const VIEWS = ['auto', 'axo', 'flat', 'high', 'top'];
world.angles.mode = saved && saved.va === 0 ? 'axo' : saved && saved.va;
const showView = () => hud.text('viewname', world.angles.mode.charAt(0).toUpperCase() + world.angles.mode.slice(1));
showView();
hud.on('viewbtn', () => {
  world.angles.mode = VIEWS[(VIEWS.indexOf(world.angles.mode) + 1) % VIEWS.length];
  showView();
  dirty = true;
});
// the planets she has found on paper at dusk (v3-look77): saved, and each announced the first time she comes near it
solar.restore(saved && saved.sol, saved && saved.solo);
solar.onFind = (name, orbit) => {
  hud.say(name + (orbit ? ' orbit' : '') + ' discovered!', null, 2.6);
  dirty = true;
};
// Sound: on or off
const showSound = () => hud.text('soundname', audio.on ? 'On' : 'Off');
showSound();
hud.on('soundbtn', () => {
  audio.setOn(!audio.on);
  showSound();
  dirty = true;
});
// Graphics: Auto, then each level in turn
hud.on('gfxbtn', () => {
  const opts = ['Auto', ...world.levels],
    cur = world.auto ? 'Auto' : world.qualityName,
    nx = opts[(opts.indexOf(cur) + 1) % opts.length];
  if (nx === 'Auto') world.setQuality(world.coarse ? 'Balanced' : 'High', true);
  else world.setQuality(nx, false);
  showGfx();
  dirty = true;
});
hud.on('place', () => {
  setPlace(placeIx + 1);
  dirty = true;
});
hud.on('pal', () => {
  trace.palette = trace.palette + 1;
  hud.swatch(PALETTES[trace.palette].css, PALETTES[trace.palette].name);
  dirty = true;
});
// destructive buttons ask for a second tap
const confirmTap = (id, label, ask, run) => {
  let armed = 0;
  hud.on(id, () => {
    if (Date.now() < armed) {
      armed = 0;
      hud.text(id, label);
      run();
    } else {
      armed = Date.now() + 3000;
      hud.text(id, ask);
      setTimeout(() => {
        if (armed) {
          armed = 0;
          hud.text(id, label);
        }
      }, 3100);
    }
  });
};
confirmTap('fresh', 'Fresh ice', 'Tap again to erase', () => {
  trace.clear();
  S.skated = 0;
  dirty = true;
  persist();
  hud.sheet(false);
});
confirmTap('rescore', 'Reset score', 'Tap again to reset', () => {
  score.reset();
  showScore();
  dirty = true;
  persist();
  if (world.view.zoomed) hud.board(true, score.state);
});
hud.on('copy', async () => {
  try {
    await navigator.clipboard.writeText(log.text());
    hud.text('logstatus', 'Copied. Paste it to Claude.');
  } catch (e) {
    hud.text('logstatus', 'Copy was blocked by the browser.');
  }
});
hud.on('clearlog', () => {
  log.clear();
  hud.text('logstatus', 'New log started.');
  hud.text('logcount', countText());
});

// The left thumb steers the way the screen shows: when the view has swung round (down the canyon), the stick turns
// with it. a: the view's swing (radians, see scene.js).
function onScreen(s, a) {
  if (!a) return s;
  const c = Math.cos(a),
    n = Math.sin(a);
  return { x: s.x * c + s.y * n, y: s.y * c - s.x * n };
}

// frame loop
const blade = { x: 0, z: 0, width: 1, pen: true, double: false },
  ZERO = { x: 0, y: 0 },
  hB = new THREE.Vector3(),
  hT = new THREE.Vector3(),
  hE = new THREE.Vector3(),
  hF = new THREE.Vector3();
let last = performance.now(),
  lastMove = null,
  fAcc = 0,
  fN = 0;
// pose the skater, move the realistic body to match, and place Rook's stick. show: the front page's turntable, if open
function drawSkater(dt, now, show) {
  setIcePlane(S);
  pose(game, dt, now, show);
  avatar = avatars[models.index];
  if (avatar && avatar.visible) {
    const spinRate =
      (S.move && S.move.spinRate ? S.move.spinRate() : 0) +
      (S.grounded ? 0 : Math.abs(S.goal - S.spin) * 20) +
      (show ? show.spinRate() : 0);
    avU.uTime.value = now / 1000;
    avatar.reflection(world.quality.reflection && !paperOn && !uCanyon.value, 0.26);
    avatar.update(dt, S, Math.min(1, spinRate / 18 + game.speed() * 0.02), Math.min(1, spinRate / 18));
  }
  // Rook's stick, placed from his hands: the realistic body's palms, or the stand-in's hands until that has loaded
  if (S.hockey) {
    if (!(avatar && avatar.visible && avatar.hands(hB, hT, hE))) {
      const r = models.rig;
      models.hero.updateMatrixWorld(true);
      r.armL.lower.localToWorld(hB.set(0, -0.28, 0));
      r.armR.lower.localToWorld(hT.set(0, -0.28, 0));
      r.armL.lower.getWorldPosition(hE);
    }
    stick.update(
      dt,
      hB,
      hT,
      hE,
      models.hero.userData.yaw ?? models.hero.rotation.y,
      S.tube ? S.up : null,
      S.tube ? models.hero.getWorldDirection(hF) : null,
    );
  }
}
// The Home Screen copy on iPhone (v3-look43): the page cannot draw the bottom 47 pt of the screen, which iOS fills with
// the page's background colour, and iOS shades the top under the status bar with that colour too. So the page's
// background (and theme colour) follow the colour of the view at the bottom of the screen: read back from the screen
// soon after anything that changes it (time of day, place, zoom, menu, front page) and every few seconds, with the
// front page's darkening laid over it as it is on screen. Elsewhere it does nothing.
const edgeMeta = document.querySelector('meta[name="theme-color"]'),
  standaloneIOS = !!window.navigator.standalone;
// times in milliseconds of the page clock (the frame's `now`), so the readings keep to real time however slow the frames
let edgeAt = 0,
  edgeAgain = true,
  edgeKey = '',
  edgeCss = '';
function matchEdges(now) {
  if (!standaloneIOS) return;
  // held upright: black above and below, the view fading into the bottom strip (v3-look77)
  const upright = window.innerHeight > window.innerWidth;
  document.body.classList.toggle('edge-black', upright);
  if (upright) {
    if (edgeCss !== '#000') {
      edgeCss = '#000';
      document.documentElement.style.backgroundColor = '#000';
      document.body.style.backgroundColor = '#000';
      if (edgeMeta) edgeMeta.setAttribute('content', '#000');
    }
    return;
  }
  const key = [lookIx, placeIx, models.index, front.open, world.view.zoomed, menuOpen()].join();
  if (key !== edgeKey) {
    edgeKey = key;
    edgeAt = now + 350;
    edgeAgain = true;
  }
  if (now < edgeAt) return;
  edgeAt = now + (edgeAgain ? 1200 : 5000);
  edgeAgain = false;
  const c = world.edgeColour(window.innerHeight - 2),
    // the front page darkens the bottom of the screen (Minimal: 82% of a deep navy; other screens: 32%), and the menu
    // all of it (Minimal: 58%; others: 35% of a slate blue)
    dk = front.open
      ? uiIx === 3
        ? [6, 12, 26, 0.82]
        : [10, 20, 45, 0.32]
      : menuOpen()
        ? uiIx === 3
          ? [6, 12, 26, 0.58]
          : [22, 38, 63, 0.35]
        : null;
  const rgb = c.map((v, k) => Math.round(dk ? v + (dk[k] - v) * dk[3] : v)),
    css = `rgb(${rgb.join(',')})`;
  if (css === edgeCss) return;
  edgeCss = css;
  document.documentElement.style.backgroundColor = css;
  document.body.style.backgroundColor = css;
  if (edgeMeta) edgeMeta.setAttribute('content', css);
}
const menuOpen = () => document.getElementById('sheet').style.display === 'flex';
let stillKey = '',
  stillUntil = 0;
function frame(now) {
  // real: the time this frame took; dt: the game's step, held to 0.05 s so a slow frame does not throw her about
  const real = (now - last) / 1000,
    dt = Math.min(real, 0.05);
  last = now;
  // zooming out, opening the menu, or the front page pauses the skating
  const paused = world.view.zoomed || document.getElementById('sheet').style.display === 'flex' || front.open;
  const steer = paused ? ZERO : onScreen(input.read(), world.view.yaw);
  if (!paused) {
    input.frame(now);
    if (!S.grounded) {
      if (input.keys.KeyA || input.keys.ArrowLeft) game.airRotate(15 * dt);
      else if (input.keys.KeyD || input.keys.ArrowRight) game.airRotate(-15 * dt);
    }
    const before = trace.count;
    trace.speed = Math.min(1, game.speed() / CFG.steer.maxSpeed);
    game.update(dt, steer);
    score.tick(dt);
    // a choreography combination that has closed: scored now, all artistry. Not announced (v3-look70, Mark: "remove
    // choregraphy text that appears"): the total goes up and the element is in Scores, nothing comes up over the dance.
    {
      const c = score.choreoDue(!!(S.move && S.move.id === 'dance'));
      if (c) {
        log.element({ kind: 'choreo', name: c.name, pts: c.pts, moves: c.moves });
        dirty = true;
        showScore();
      }
    }
    if (S.move !== lastMove) {
      lastMove = S.move;
      if (S.move && S.move.id !== 'fall' && S.move.id !== 'stumble') score.mark();
    }
    const yaw = game.yaw();
    blade.x = S.x;
    blade.z = S.z;
    blade.width = 1;
    blade.pen = true;
    blade.double = false;
    if (S.move && S.move.blade) S.move.blade(blade, yaw);
    const px = Math.cos(S.facing) * 0.16,
      pz = -Math.sin(S.facing) * 0.16;
    if (blade.double) {
      blade.x += px;
      blade.z += pz;
    }
    const dashed = !S.grounded || (!blade.pen && S.visY > 0.05);
    // in the Tunnel the line lies on the tube's ice wherever round it she is
    if (S.tube) trace.followTube(S, blade.width, blade.pen || dashed, dashed);
    else trace.follow(S, blade.x, blade.z, blade.width, blade.pen || dashed, dashed);
    if (trace.count !== before) {
      dirty = true;
      if (S.grounded && blade.pen && !paperOn && !S.tube) icicles.trail(blade.x, blade.z, trace.colorAt(S.skated));
      // spread eagle: both blades draw
      if (blade.double) trace.place(S.x - px, S.z - pz, S.facing, trace.colorAt(S.skated), 1);
    }
    if (!S.grounded) {
      const r = Math.abs(S.spin) / TAU;
      if (r > 0.3) hud.say(r.toFixed(1) + '×', game.liveName(), 0.25);
    }
    hud.padSpin(S.move && S.move.id === 'dance' ? Math.min(1, S.move.state.rate / (CFG.dance.spinFast * 1.4)) : 0);
    hud.combo(Math.max(score.chainLeft(), score.choreoLeft()));
    tutorial.tick(dt, { S, speed: game.speed(), armed: tricks.armed, now });
    // a shore turns her along it: she keeps the speed that runs along the coast and loses what was heading inland
    {
      const t = forest.hit(S.x, S.z) || solar.hit(S.x, S.z);
      if (t) {
        S.x = t.x;
        S.z = t.z;
        const vn = S.vx * t.nx + S.vz * t.nz;
        if (vn < 0) {
          S.vx -= vn * t.nx;
          S.vz -= vn * t.nz;
          if (S.grounded && vn < -2 && Math.random() < 0.5) spray.emit(S.x, S.z, t.nx, t.nz, 3, 2, 1.5);
        }
      }
    }
    // the mode in play: its pads or course, and its line under the speed
    if (modeIx === 1) MODES[1].update(dt);
    else if (modeIx === 2) MODES[2].update(dt, game.emit, game.crash);
    modeLineT -= dt;
    if (modeIx && modeLineT <= 0) {
      modeLineT = 0.1;
      hud.text('modeline', MODES[modeIx].line());
    }
    // spray: off a hard edge, off each push when she is working for speed, and around a spin
    const sp = game.speed(),
      edge = Math.abs(S.turn) * sp;
    const pushing = S.grounded && S.push > 0.5 && Math.sin(S.phase) * Math.sin(S.phase - 0.4) < 0;
    if (pushing && !striding) audio.stride(sp);
    striding = pushing;
    // paper is a blank sheet: no snow thrown up, nothing drifting in the air
    if (S.grounded && !paperOn && !S.tube) {
      const hx = Math.cos(S.facing),
        hz = -Math.sin(S.facing),
        out = S.turn > 0 ? -1 : 1;
      if (edge > 9 && Math.random() < dt * 40)
        spray.emit(blade.x, blade.z, hx * out, hz * out, 2, 1.2 + edge * 0.08, 0.9);
      if (S.move && S.move.skid && S.move.skid() && sp > 0.8)
        spray.emit(blade.x, blade.z, S.vx, S.vz, 3 + Math.round(sp * 0.8), 1.8 + sp * 0.35, 1.9); // a skid throws snow ahead of her
      if (S.push > 0.5 && Math.sin(S.phase) * Math.sin(S.phase - 0.4) < 0)
        spray.emit(S.x, S.z, -S.vx, -S.vz, 5, 1.6, 1.4);
      if (S.move && S.move.spinRate && S.move.spinRate() > 8 && Math.random() < dt * 30)
        spray.emit(blade.x, blade.z, Math.random() - 0.5, Math.random() - 0.5, 1, 1.1, 6.3);
    }
    // drifting snow hangs in the air ahead of her; the faster she goes, the more of it whips past
    if (sp > 6 && !paperOn && !S.tube) {
      const n = (sp - 6) * 5 * dt,
        ux = S.vx / sp,
        uz = S.vz / sp;
      for (let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); k > 0; k--) {
        const f = 5 + Math.random() * 13,
          w = (Math.random() - 0.5) * 18;
        spray.mote(S.x + ux * f - uz * w, 0.3 + Math.random() * 2.6, S.z + uz * f + ux * w, 1.3);
      }
      if (S.grounded && sp > 9 && Math.random() < dt * 30) spray.emit(blade.x, blade.z, -S.vx, -S.vz, 1, 1.4, 0.8);
    }
    spray.update(dt);
    icicles.update(dt);
    // the frame rate for Auto graphics, from the real frame times (a gap of over half a second is the page coming back
    // from the background, not a slow frame)
    if (real < 0.5) {
      fAcc += real;
      fN++;
    }
    if (fAcc >= 3) {
      world.adapt(fN / fAcc);
      showGfx();
      fAcc = 0;
      fN = 0;
    }
    drawSkater(dt, now);
    if (modeIx === 3) duet.update(dt, now, models.index, world.quality.reflection && !paperOn && !uCanyon.value);
    // (v3-look84, Mark: "make the indicator ring larger so its not so tiny") bigger as the view stands further back
    ring.update(game, models.rig.scale * Math.max(1, world.angles.dist), world.camera);
    log.tick(dt, game, steer, real);
  }
  // on the front page the skater stands for the showcase: posed and drawn, turned by the finger, framed in the space
  // the choices leave free
  else if (front.open) {
    showcase.update(dt, now);
    world.showcase(true, front.band(now));
    drawSkater(dt, now, showcase);
  }
  // paused on the scoreboard in the canyon the view stands still: it is drawn for a moment after anything that changes
  // it (the time of day, a skater loading, the menu, turning the phone), then left on screen as it is
  let draw = true;
  if (world.view.still && !front.open) {
    const shown = [lookIx, placeIx, models.index, !!avatars[models.index], world.qualityName, uiIx, menuOpen()],
      key = shown.join() + ',' + innerWidth + 'x' + innerHeight;
    if (key !== stillKey) {
      stillKey = key;
      stillUntil = now + 1500;
    }
    draw = now < stillUntil;
  } else stillKey = '';
  audio.update({
    speed: game.speed(),
    grounded: S.grounded,
    turn: S.turn,
    skid: !!(S.move && S.move.skid && S.move.skid()),
    spin: S.move && S.move.spinRate ? S.move.spinRate() : 0,
    paused,
  });
  if (draw) {
    world.update(game, paused ? 0.016 : dt, trace.bounds, trace.uScale);
    forest.update(S.x, S.z);
    solar.update(paused ? 0 : dt, S, world.view.e, now, paused, world.angles.flat);
    trace.sharpen(world.view.e);
  }
  hud.update(dt, game.speed(), trace.colorAt(S.skated));
  if (draw) {
    world.render();
    matchEdges(now);
  }
  requestAnimationFrame(frame);
}
hud.swatch(PALETTES[trace.palette].css, PALETTES[trace.palette].name);
showScore();
window.__game = {
  CFG,
  modes: MODES,
  setMode,
  get modeIx() {
    return modeIx;
  },
  get avatar() {
    return avatar;
  },
  avatars,
  stick,
  front,
  showcase,
  setPlay,
  setChar,
  setLook,
  get playIx() {
    return playIx;
  },
  tutorial,
  world,
  forest,
  solar,
  setPlace,
  game,
  S,
  input,
  tricks,
  get score() {
    return score;
  },
  scores,
  trace,
  log,
  view: world.view,
  zoom: setZoom,
  audio,
  hudText: () => document.getElementById('pop').textContent,
};
requestAnimationFrame(frame);
