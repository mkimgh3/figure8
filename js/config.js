// Every tuning number in one place. Change feel here, not in the logic.
export const CFG = {
  steer: {
    stickRadius: 60, // px of thumb travel for full speed
    maxSpeed: 13.5, // m/s
    accel: 2.6, // m/s2 push-off
    lateral: 15, // m/s2: how hard she can carve
    turnCap: 3.4, // rad/s at low speed
    turnCapBoosted: 6.5, // rad/s with quick thumb circles
    glideDecay: 0.32, // 1/s with no input
    easeOff: 1.3, // m/s2 when the thumb eases back
    fineBand: 0.45, // stick fraction under which steering is extra precise
  },
  tap: { maxMs: 260, maxMovePx: 14, doubleMs: 330 },
  rotate: { minRadiusPx: 26, pivotLag: 0.3, minSegPx: 5, bufferCap: 2.5, bufferMs: 500 },
  // A flick: the right thumb travels flickPx or more, straight (never turning back by reversalPx), with all its motion
  // inside flickMs. It is read once the thumb has been still idleMs, or lifts. Anything slower or longer is a drag.
  // A twitch shorter than restPx followed by stillness counts as resting, not as a stroke.
  swipe: { flickPx: 50, flickMs: 300, restPx: 20, reversalPx: 22, idleMs: 110 },
  // Two-thumb gestures, read when the right thumb's swipe is read, from how the left thumb moved over the same time.
  // Together: the left thumb went the same way (cosine above parallelCos) and at least sameMinPx, and at least sameShare
  // of the right thumb's distance. Apart (spread eagle): opposite ways, each spreadEachPx or more, the gap growing by spreadPx.
  // After a two-thumb move starts, steering stays held until the left thumb has been still settleMs, or freezeMs at most.
  two: {
    parallelCos: 0.5,
    sameMinPx: 30,
    sameShare: 0.4,
    spreadPx: 80,
    spreadEachPx: 25,
    settleMs: 150,
    freezeMs: 350,
  },
  // Hockey stop: both thumbs swiped down, and one of them lifted within liftMs of the swipe being read, while she moves at
  // minSpeed or more. Both kept down past liftMs is a hydroblade.
  // She stops within maxTime seconds, holds the pose for `hold`, then turns back to face front over `rise`. snap: seconds to throw the blades sideways.
  stop: { minSpeed: 2.5, liftMs: 250, decel: 16, maxTime: 0.6, snap: 0.12, hold: 0.45, rise: 0.35 },
  // Spiral and hydroblade: the left thumb steers but cannot push. She slows as she glides (glide, 1/s; the hydroblade drags
  // a little more, hydroDrag), and comes out of the move once her speed is below endSpeed (m/s), even with the finger down,
  // or after maxTime seconds. So the faster she goes in, the longer she can hold it. Going in gives her a small push of
  // `kick` (m/s), over about 0.25 s. (v3-look37: glide 0.32 to 0.1 and endSpeed 2.5 to 1.6: from 8 m/s a spiral lasts
  // about 16 s instead of 4.)
  held: { glide: 0.1, hydroDrag: 0.04, endSpeed: 1.6, kick: 1.5, maxTime: 40 },
  twirl: { startTurn: 3.1, afterLeapMs: 3000 }, // a circle is twizzles for afterLeapMs after a split leap; any other time it is part of choreography
  // Choreography: the right thumb down holdMs with nothing else going on (held still, or dragged further or slower than a
  // flick), or still down afterLand seconds after a jump lands, or after the move it started is over. It lasts while that
  // thumb stays down. Circling turns her, turnRatio of a turn for each finger circle, following the finger at `follow` (1/s)
  // like a rubber band: turned faster than spinIn (rad/s) she takes spin positions until slower than spinOut, the open ones
  // (camel, layback, attitude) below spinFast and the tight ones (scratch, arms overhead) above it. The thumb's speed,
  // between calmPx and sharpPx (px/s), slides the dancing from calm and broad to sharp and street; both thumbs moving faster
  // than moveSpeed (px/s) the same way bring out open shapes, against each other closed ones. Lifting the right thumb ends
  // it (a spin winds down first); it scores once it has lasted minScore seconds.
  // While she dances the left thumb still steers and speeds her up, at `accel` times the usual rate.
  dance: {
    moveSpeed: 50,
    calmPx: 200,
    sharpPx: 700,
    minScore: 2,
    accel: 0.8,
    holdMs: 300,
    // a circling thumb starts it at once, once it has turned this far (radians; about 140 degrees)
    circleTurn: 2.5,
    afterLand: 0.3,
    spinIn: 2.2,
    spinOut: 1.3,
    spinFast: 5,
    turnRatio: 0.5,
    follow: 3.5,
    glide: 2.6,
    // a spin kept going winds up from turnRatio to one turn of hers per thumb circle over gainRise seconds, and fades back over about gainFade when it is not;
    // with the thumb lifted her turning dies away over about spinDown seconds
    gainRise: 3,
    gainFade: 4,
    spinDown: 1.5,
    // spinning with the left thumb not pushing, her travel speed dies away over about this many seconds
    spinCoast: 2.5,
  },
  jump: { vyBase: 5.4, vyPerSpeed: 0.2, vyPerBonus: 0.4, gravity: 14, comboWindow: 0.7 },
  // fraction of a turn off a clean half or whole turn
  grades: [
    [0.05, 'perfect'],
    [0.1, 'clean'],
    [0.16, 'shaky'],
  ],
  difficulty: { 'Toe loop': 1, Salchow: 0.97, Loop: 0.93, 'Inside Axel': 0.9, Axel: 0.88 },
  fall: { seconds: 1.15, boostSeconds: 3, boostAccel: 3.2, repeatWindow: 5 }, // only a first fall gets help back up to speed; any fall within repeatWindow seconds of the last gets none, and restarts the wait
  // Speed beyond what steering alone can reach is earned by landing jumps: the better and bigger the jump, the more. It fades slowly and a fall loses it.
  // Every other finished move earns it too: move[0] plus move[1] for each point of the move's base value. Each m/s of it also lifts her next jump (jump.vyPerBonus).
  bonus: { perfect: 1.1, clean: 0.6, shaky: 0, perRotation: 0.45, max: 6, fade: 0.22, kick: 0.6, move: [0.3, 0.35] },
  // Points, on the scale of real figure skating: jumps carry the big base values, everything else is worth a few points at most.
  points: {
    jumps: {
      'Toe loop': [0.4, 1.3, 4.2, 9.5],
      Salchow: [0.4, 1.3, 4.3, 9.7],
      Loop: [0.5, 1.7, 4.9, 10.5],
      'Inside Axel': [1.0, 3.0, 7.5, 12.0],
      Axel: [1.1, 3.3, 8.0, 12.5],
    },
    waltz: 0.3,
    half: 0.2,
    hop: 0.2,
    quality: { perfect: 1.3, clean: 1, shaky: 0.7 },
    fall: -1,
    jumpCombo: [1, 1, 1.5, 2, 2.5],
    jumpComboWindow: 2.5, // 2nd, 3rd, 4th jump in a row: one combination element, the later jumps worth more
    chainWindow: 3,
    artistry: 0.3, // elements linked within chainWindow seconds; each new kind adds artistry x kinds so far
    // Everything that lasts: [most it can be worth, how quickly it gets there]. Value = most x (1 - e^(-amount / quickness)),
    // so the first turns or seconds count most and carrying on adds less and less.
    twizzles: [2.0, 2], // per turn
    spiral: [1.6, 2],
    eagle: [1.6, 2],
    hydro: [2.0, 2],
    dance: [3.0, 6], // per second
    turn: 0.3,
    leap: 0.6,
    stop: 0.8, // stop: from full speed; less from slower
    // a jump out of curves and figures (radians turned in the seconds before take-off) beats one from a straight run-up
    entry: [
      [4.5, 1.5],
      [1.6, 1.25],
    ],
    repeat: [1, 0.7, 0.5], // the same element again straight away is worth less
  },
  // Icicles: every `spacing` metres of new line sheds perSpot glints that sink (m/s) into the ice and fade over `seconds`.
  // (v3-look36: fewer, smaller and dimmer than before; at 4 glints and brightness 1.5 they read as stitching beside the line)
  icicles: { seconds: 5, spacing: 0.16, perSpot: 3, sink: 0.6, size: 0.11, bright: 0.85 },
  trace: { width: 0.075, length: 0.2, spacing: 0.13, saveMax: 50000 },
  camera: {
    fov: 38,
    fovFast: 9, // at speed the view widens instead of rising, so the ice rushes past
    closeHeight: 10.5,
    closeBack: 5.6,
    tilt: 28,
    tiltSpeed: 9,
    tiltAir: 8,
    speedLift: 0.2,
    lookAhead: 0.22,
    lookMax: 2.2,
    minOverview: 16,
    portrait: 1.2, // how much further back the view sits when the screen is taller than it is wide
    // In portrait it pulls back further with speed: from portraitFrom (m/s) it eases out, reaching portraitFast more
    // (0.7: 70% further back) at portraitFrom + portraitSpan (14 m/s, 50 km/h), and eases back in as she slows.
    // portraitEase (1/s): how quickly it follows her speed.
    portraitFast: 0.7,
    portraitFrom: 4,
    portraitSpan: 10,
    portraitEase: 1,
  },
  // Times of day: dawn, day and dusk. Each is a complete lighting setup; the front page and the menu choose one.
  // sun: [elevation, azimuth] in degrees (azimuth 0 = from the south, 90 = from the west).
  // linePunch deepens the line's colours (1 = as painted); lineWide draws it wider. spot: the two follow spots.
  // (v3-look37: Golden hour, Blue hour and Night are gone; dusk is a deep blue dark with the follow spots.)
  looks: [
    {
      name: 'Dawn',
      glow: [0, 0.5, 9],
      lineGlow: 1,
      linePunch: 1.2,
      lineWide: 1.35,
      sun: [7, -70],
      sunColor: 0xffc4d2,
      sunPower: 2.4,
      sky: [0x7e98d6, 0xffd6de, 0xd9cfe6],
      hemi: [0xf0e4f6, 0xcfd3ec, 1.0],
      ice: 0xece8f6,
      deep: 0x5e6ab4,
      exposure: 1.0,
      cloud: 0,
      aurora: 0,
      snow: 0,
      mist: 0,
      mistColor: 0xfff0f6,
      stars: 0.1,
    },
    {
      name: 'Day',
      glow: [0, 0.5, 9],
      lineGlow: 1,
      linePunch: 1.2,
      lineWide: 1.35,
      sun: [42, 45],
      sunColor: 0xfff3e2,
      sunPower: 2.3,
      sky: [0x86b4ee, 0xf4f8ff, 0xd4e4f5],
      hemi: [0xf2f8ff, 0xdde9f6, 1.15],
      ice: 0xe3eef9,
      deep: 0x4a78b0,
      exposure: 1.0,
      cloud: 0,
      aurora: 0,
      snow: 0,
      mist: 0,
      mistColor: 0xffffff,
      stars: 0,
    },
    {
      name: 'Dusk',
      spot: 1,
      glow: [0.65, 0.25, 1.3],
      lineGlow: 1.8,
      night: true,
      sun: [38, -30],
      sunColor: 0xaec2ff,
      sunPower: 0.75,
      sky: [0x0a1648, 0x2b3f95, 0x0f1c56],
      hemi: [0x5a72d0, 0x16225a, 0.62],
      ice: 0x7a90d0,
      deep: 0x203a98,
      exposure: 1.15,
      cloud: 0,
      aurora: 0.35,
      snow: 0,
      mist: 0,
      mistColor: 0x7c8fe0,
      stars: 0.7,
    },
  ],
  // Places. camera: how much further back the view sits. paper: a blank sheet instead of the lake (see `paper` below).
  places: [
    { name: 'Open lake', trees: false },
    { name: 'Islands', trees: true, camera: 1.35 },
    { name: 'Paper', trees: false, paper: true },
  ],
  // Paper, one sheet for each time of day: the surface colour and grain (0..1), and how her blade draws.
  // ink: 'pencil' (thin graphite that the paper's tooth breaks up), 'pen' (a broad calligraphy nib: thick across the
  // nib, a hairline along it, thinner the faster she goes) or 'glow' (white light). nib: the pen's angle (radians from
  // screen-up); thin/thick: its stroke as a share of the full width; fast: how much speed thins it; wide: the line's width.
  paper: {
    Dawn: { surface: 0xe8d9bd, grain: 1, ink: 'pencil', inkColor: 0x303037, wide: 1.3, night: false },
    Day: {
      surface: 0xffffff,
      grain: 0,
      ink: 'pen',
      inkColor: 0x111318,
      wide: 3.2,
      nib: 0.75,
      thin: 0.12,
      fast: 0.45,
      night: false,
    },
    Dusk: {
      surface: 0x050506,
      grain: 0.15,
      ink: 'glow',
      inkColor: 0xffffff,
      wide: 0.75,
      glow: 1.15,
      bloom: [0.28, 0.12, 1.05],
      night: true,
    },
  },
  // Graphics levels. 'Auto' starts at the top that suits the device and steps down if frames drop.
  quality: {
    High: { dpr: 3, shadow: 2048, reflection: true, snow: 0, mist: 0, glow: true },
    Balanced: { dpr: 2, shadow: 1024, reflection: true, snow: 0, mist: 0, glow: true },
    Low: { dpr: 1.5, shadow: 1024, reflection: false, snow: 0, mist: 0, glow: false },
  },
  // The three modes on the front page. Olympic: falls count, and the total stops at 9999.9. Infinite: she never falls (a
  // bad landing is a stumble), the score card is one big number, and the total has no limit. Tutorial: the lessons, all
  // of a skill's steps listed at once, and stumbles instead of falls. Each mode keeps its own score.
  play: {
    names: ['Olympic', 'Infinite', 'Tutorial'],
    about: [
      'Judged like the real thing. Falls cost points.',
      'No falls, no limit. Skate and score forever.',
      'Learn each skill step by step. No falls.',
    ],
    forgiving: [false, true, true],
  },
  // A stumble, in Infinite and Tutorial: a bad landing she rides out instead of falling. She wobbles for `seconds`, keeps
  // `keep` of her speed and half her speed bonus, and the jump scores at `quality` of its base.
  stumble: { seconds: 0.75, keep: 0.8, quality: 0.5 },
  // Ways to play, chosen in the menu (Menu > Play).
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
