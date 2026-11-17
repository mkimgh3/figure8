// Every tuning number in one place. Change feel here, not in the logic.
export const CFG = {
  steer: {
    stickRadius: 60,        // px of thumb travel for full speed
    maxSpeed: 13.5,         // m/s
    accel: 2.6,             // m/s2 push-off
    lateral: 15,            // m/s2: how hard she can carve
    turnCap: 3.4,           // rad/s at low speed
    turnCapBoosted: 6.5,    // rad/s with quick thumb circles
    glideDecay: 0.32,       // 1/s with no input
    easeOff: 1.3,           // m/s2 when the thumb eases back
    fineBand: 0.45,         // stick fraction under which steering is extra precise
  },
  tap: { maxMs: 260, maxMovePx: 14, doubleMs: 330 },
  rotate: { minRadiusPx: 26, pivotLag: 0.3, minSegPx: 5, bufferCap: 2.5, bufferMs: 500 },
  // A spin needs a deliberate start: rest the finger for holdMs, then circle. A circle drawn straight away does nothing,
  // because that is exactly what an in-air rotation looks like (playtest 1: 26 spins, most unintended).
  // The rubber band between finger and skater: follow (1/s) is how closely her body keeps up with the finger, pickup (0..1) how quickly
  // her spin takes on the finger's speed, coast (1/s) how fast it fades when the finger stops but stays down. After the finger lifts
  // it eases out at easeOut (1/s) until it is slower than endVel (rad/s), or for endMax seconds at most.
  // exitSpeed: she swoops out of a finished spin at this fraction of top speed. Lifting the left thumb winds the spin down.
  // The finger's own circling speed picks the position: faster than fastAbove (rad/s) is the fast one of the pair, and it stays until slower than slowBelow.
  // camel, sit, layback: in these positions she turns this fraction as far as upright for the same finger circle, so they are slower and easier to place.
  spin: { fastAbove: 10, slowBelow: 7.5, layback: 0.6, exitSpeed: 0.5, camel: 0.55, sit: 0.6, holdMs: 240, holdMovePx: 12, startTurn: 3.1, landLockout: 0.6, gain: 0.8, decay: 1.5, travel: 3.6, follow: 7, pickup: 0.3, coast: 0.45, easeOut: 0.75, endVel: 1.6, endMax: 3 },
  // Two-finger moves: both thumbs moving together.
  shape: { flickPx: 50, reversalPx: 22, idleMs: 110, eightTurn: 4.2 },      // flicks, scribbles and drawn shapes
  duo: { minSpeed: 110, engageMs: 70, parallelCos: 0.5, spreadPx: 80, spreadEachPx: 25, calmTurn: 3.3, settleMs: 150, freezeMs: 350 },
  // Hockey stop: both thumbs dragged down and lifted, while she moves at minSpeed or more. (The same drag held down is a hydroblade.)
  // She stops within maxTime seconds, holds the pose for `hold`, then turns back to face front over `rise`. snap: seconds to throw the blades sideways.
  stop: { minSpeed: 2.5, decel: 16, maxTime: 0.6, snap: 0.12, hold: 0.45, rise: 0.35 },
  twirl: { startTurn: 3.1, afterLeapMs: 3000 },      // a circle is twizzles for afterLeapMs after a split leap; any other time it is a spin
  // Choreography: the right thumb rested on the glass for holdMs. It lasts while that thumb stays down. Its speed,
  // between calmPx and sharpPx (px/s), slides the dancing from calm and broad to sharp and street, and its circling turns her. It ends when
  // either thumb lifts, and scores once it has lasted minScore seconds.
  // While she dances the left thumb still steers and speeds her up, at `accel` times the usual rate.
  dance: { startMs: 650, moveSpeed: 50, idleEnd: 1.2, calmPx: 200, sharpPx: 700, minScore: 2, accel: 0.8, holdMs: 450 },
  steps: { shortPx: 80, longPx: 170, readyMs: 5000, keepMs: 2500, qualityMin: 0.7, qualityMax: 1.3 },      // flick up makes a step sequence ready for readyMs; an even rhythm earns up to qualityMax                                       // stroke length that picks the step: toe steps / mohawk / serpentine                                                // an immediate circle: finger-driven twizzles
  jump: { vyBase: 5.4, vyPerSpeed: 0.2, vyPerBonus: 0.4, gravity: 14, comboWindow: 0.7, toeReadyMs: 3000 },      // toeReadyMs: how long a flick down keeps the toe pick ready
  grades: [[0.05, 'perfect'], [0.10, 'clean'], [0.16, 'shaky']],      // fraction of a turn off a clean half or whole turn
  difficulty: { 'Toe loop': 1, 'Salchow': 0.97, 'Loop': 0.93, 'Flip': 0.9, 'Lutz': 0.85, 'Inside Axel': 0.9, 'Axel': 0.88 },
  fall: { seconds: 1.15, boostSeconds: 3, boostAccel: 3.2, repeatWindow: 5 },      // only a first fall gets help back up to speed; any fall within repeatWindow seconds of the last gets none, and restarts the wait
  // Speed beyond what steering alone can reach is earned by landing jumps: the better and bigger the jump, the more. It fades slowly and a fall loses it.
  // Every other finished move earns it too: move[0] plus move[1] for each point of the move's base value. Each m/s of it also lifts her next jump (jump.vyPerBonus).
  bonus: { perfect: 1.1, clean: 0.6, shaky: 0, perRotation: 0.45, max: 6, fade: 0.22, kick: 0.6, move: [0.3, 0.35] },
  // Points, on the scale of real figure skating: jumps carry the big base values, everything else is worth a few points at most.
  points: {
    jumps: { 'Toe loop': [0.4, 1.3, 4.2, 9.5], 'Salchow': [0.4, 1.3, 4.3, 9.7], 'Loop': [0.5, 1.7, 4.9, 10.5], 'Flip': [0.5, 1.8, 5.3, 11.0], 'Lutz': [0.6, 2.1, 5.9, 11.5], 'Inside Axel': [1.0, 3.0, 7.5, 12.0], 'Axel': [1.1, 3.3, 8.0, 12.5] },
    waltz: 0.3, half: 0.2, hop: 0.2, quality: { perfect: 1.3, clean: 1, shaky: 0.7 }, fall: -1,
    jumpCombo: [1, 1, 1.5, 2, 2.5], jumpComboWindow: 2.5,          // 2nd, 3rd, 4th jump in a row: one combination element, the later jumps worth more
    chainWindow: 3, artistry: 0.3,                                 // elements linked within chainWindow seconds; each new kind adds artistry x kinds so far
    // Everything that lasts: [most it can be worth, how quickly it gets there]. Value = most x (1 - e^(-amount / quickness)),
    // so the first revolutions, steps or seconds count most and carrying on adds less and less.
    spin: [2.0, 3], spinPosition: 1.25, spinCombination: 1.6,      // per revolution
    twizzles: [2.0, 2],                                            // per turn
    steps: [3.9, 5],                                               // per step; x0.6 with one kind of step, full value with three
    swing: [1.5, 3], spiral: [1.6, 2], eagle: [1.6, 2], hydro: [2.0, 2], dance: [3.0, 6],      // per second
    turn: 0.3, leap: 0.6, stop: 0.8,                               // stop: from full speed; less from slower
    entry: [[4.5, 1.5], [1.6, 1.25]],                              // a jump out of curves and figures (radians turned in the seconds before take-off) beats one from a straight run-up
    repeat: [1, 0.7, 0.5],                                         // the same element again straight away is worth less
  },
  trace: { width: 0.075, length: 0.2, spacing: 0.13, saveMax: 50000 },
  camera: { fov: 38, fovFast: 9, closeHeight: 10.5, closeBack: 5.6, tilt: 28, tiltSpeed: 9, tiltAir: 8, speedLift: 0.2, lookAhead: 0.22, lookMax: 2.2, minOverview: 16 },      // at speed the view widens instead of rising, so the ice rushes past
  // Times of day. Each is a complete lighting setup; the menu cycles through them. sun: [elevation, azimuth] in degrees (azimuth 0 = from the south, 90 = from the west).
  looks: [
    // linePunch deepens the line's colours (1 = as painted); lineWide draws it wider.
    { name: 'Day', glow: [0, 0.5, 9], lineGlow: 1, linePunch: 1.2, lineWide: 1.35, sun: [42, 45], sunColor: 0xfff3e2, sunPower: 2.3, sky: [0x86b4ee, 0xf4f8ff, 0xd4e4f5], hemi: [0xf2f8ff, 0xdde9f6, 1.15], ice: 0xe3eef9, deep: 0x4a78b0, exposure: 1.0, cloud: 0, aurora: 0, snow: 0, mist: 0, mistColor: 0xffffff, stars: 0 },
    { name: 'Golden hour', glow: [0, 0.5, 9], lineGlow: 1, sun: [11, 60], sunColor: 0xffb46e, sunPower: 3.2, sky: [0x7194d6, 0xffcfa0, 0xe9cfb6], hemi: [0xdfe6ff, 0xd9c2b0, 0.9], ice: 0xf2e8e0, deep: 0x5f78b8, exposure: 1.0, cloud: 0, aurora: 0, snow: 0, mist: 0, mistColor: 0xffe2c4, stars: 0 },
    { name: 'Blue hour', glow: [0.6, 0.25, 1.3], lineGlow: 1.5, night: true, sun: [-3, 70], sunColor: 0x8fa6ff, sunPower: 0.3, sky: [0x1d2b66, 0x9a8fd6, 0x39407a], hemi: [0x9aaaf0, 0x34407a, 1.45], ice: 0xb3c0ea, deep: 0x30449a, exposure: 1.1, cloud: 0, aurora: 0.2, snow: 0, mist: 0, mistColor: 0xc2c4f4, stars: 0.3 },
    { name: 'Night', spot: 1, glow: [0.65, 0.25, 1.3], lineGlow: 1.8, night: true, sun: [38, -30], sunColor: 0xb3c6ff, sunPower: 0.7, sky: [0x040818, 0x18264f, 0x0a1230], hemi: [0x4a5ca8, 0x0e1430, 0.5], ice: 0x6a7fb8, deep: 0x1c2a70, exposure: 1.15, cloud: 0, aurora: 1, snow: 0, mist: 0, mistColor: 0x7c8fe0, stars: 1 },
    { name: 'Dawn', glow: [0, 0.5, 9], lineGlow: 1, linePunch: 1.2, lineWide: 1.35, sun: [7, -70], sunColor: 0xffc4d2, sunPower: 2.4, sky: [0x7e98d6, 0xffd6de, 0xd9cfe6], hemi: [0xf0e4f6, 0xcfd3ec, 1.0], ice: 0xece8f6, deep: 0x5e6ab4, exposure: 1.0, cloud: 0, aurora: 0, snow: 0, mist: 0, mistColor: 0xfff0f6, stars: 0.1 },
  ],
  places: [
    { name: 'Open lake', trees: false },
    { name: 'Islands', trees: true, camera: 1.35 },          // camera: how much further back the view sits
  ],
  // Graphics levels. 'Auto' starts at the top that suits the device and steps down if frames drop.
  quality: {
    High: { dpr: 3, shadow: 2048, reflection: true, snow: 0, mist: 0, glow: true },
    Balanced: { dpr: 2, shadow: 1024, reflection: true, snow: 0, mist: 0, glow: true },
    Low: { dpr: 1.5, shadow: 1024, reflection: false, snow: 0, mist: 0, glow: false },
  },
  // Ways to play, chosen in the menu.
  modes: {
    names: ['Free skate', 'Jump park', 'Race', 'Duet'],
    // Jump park: one launch pad in every `cell` metres of ice, `radius` wide; it throws her `boost` times faster off the ice than her own jump.
    pads: { cell: 22, radius: 1.5, boost: 1.45, cooldown: 1.2 },
    // Race: coins are worth `coin` points each, a hurdle jumped `hurdle`, and every second under the course's par time `second`.
    // A course is laid out again if she strays `stray` metres from it or takes longer than `timeout` seconds.
    race: { coin: 0.1, hurdle: 0.5, second: 0.3, reach: 1.3, stray: 70, timeout: 150, nextAfter: 4 },
    // Duet: the partner skates `beside` metres to her side and does what she does `delay` seconds later; `keepUp` (0..1) is how much
    // of the ground that delay costs it makes up, so it stays level with her instead of trailing.
    duet: { beside: 2.1, delay: 0.22, keepUp: 0.85 },
  },
  log: { maxStrokes: 160, maxPointsPerStroke: 90 },
};
