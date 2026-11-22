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
  // A thumb turning back on itself (v3-look79, recognizer.js Reversals): moving faster than minPx (px/s) the opposite way
  // (cosine below cos) from where it was lately heading (eased over `lag` seconds, only while it moves); at most one
  // every `gap` seconds. The to-and-fro of a thumb shaking to fast music; the log keeps their times for the music tests.
  reversal: { minPx: 260, lag: 0.08, cos: -0.2, gap: 0.09 },
  // Two-thumb gestures, read when the right thumb's swipe is read, from how the left thumb moved over the same time.
  // Together: the left thumb went the same way (cosine above parallelCos) and at least sameMinPx, and at least sameShare
  // of the right thumb's distance. Apart (spread eagle): opposite ways, each spreadEachPx or more, the gap growing by spreadPx.
  // After a two-thumb move starts, steering stays held until the left thumb has been still settleMs, or freezeMs at most.
  // (v3-look61 read both thumbs circling as a spiral, hydroblade, spread eagle or Biellmann, and a flick down as a toe
  // kick. Mark, the same day: "in my attempt to systemitize and categorize the movement into specific combos of keys
  // have destroyed that element we designed before, now it has become an operation trying to activate the moves". So
  // v3-look62 went back to these, and those positions are part of choreography instead: CFG.dance.express.)
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
  // Spiral, hydroblade, spread eagle: held while the right thumb stays down (each at least a moment), or maxTime seconds.
  // Since v3-look61 (Mark: "for all these the left thumb should still have control of steer and speed") the left thumb
  // steers, pushes and eases off in them as in plain skating; before, the spiral and hydroblade coasted, slowing.
  held: { maxTime: 40 },
  // Choreography combinations (v3-look61, Mark: "no longer announce choreo. rather, do delayed scoring. when choreo is
  // registered treated like combo, within a duration various choreo moves are scored as artistic only with the move combo
  // list ... if jump is activated within the duration, it gets added as artistic"): a dance's gestures, positions and
  // spins, and any more dancing or jumps within `window` seconds of the last, make one element, scored all as artistry
  // and announced when the window closes, named by its moves (the first maxNames of them). Each dance adds what it is
  // worth (points.dance, CFG.dance.score); each jump in it jumpArt of its points (it is scored as a jump as well).
  choreo: { window: 4, jumpArt: 0.5, maxNames: 6 },
  // twizzles: no gesture since v3-look80 (Mark: "remove twizzle after leap"; a circle after the leap is choreography);
  // the move is kept for its scoring
  twirl: { startTurn: 3.1 },
  // The butterfly (v3-look80 as the "change leap flip", v3-look81 the switch leap, v3-look82 the butterfly; v3-look81,
  // Mark: "when skater is moving in spiral by constant steering counter or clockwise. when at certain radius or smaller
  // and activates swipe up it changes from standard leap jump to switch leap"): the flick up while she skates a curve one
  // way no wider than `radius` m (her path's bend eased over `ease` s, at `minSpeed` m/s or more) that has already taken
  // her `turned` radians round. It takes `time` seconds; she leaves the ice at `up` of the way through and lands at
  // `down`, `height` m up at the top, having turned once right round.
  changeLeap: { time: 1.2, up: 0.24, down: 0.86, height: 0.8, radius: 6, turned: 1.2, ease: 0.4, minSpeed: 1.5 },
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
    accel: 1,
    holdMs: 300,
    // a circling thumb starts it at once, once it has turned this far (radians; about 140 degrees)
    circleTurn: 2.5,
    afterLand: 0.3,
    spinIn: 2.2,
    spinOut: 1.3,
    spinFast: 5,
    // Settling (v3-look76, Mark: "when right thumb is held down for a bit and not moving anymore, return the skater
    // rotation to the direction of the travel ... if i spin only 1/4 turn and let go, the skater returns to direction
    // of travel it was originally starting from. but if i spin 3/4 and let go, then it returns to skating backwards"):
    // with the thumb still for `rest` seconds (slower than restPx px/s) and no spin going, or with it lifted and the
    // spin over, she comes round (at `rate`, 1/s) to face the way she is going, forward or backward, whichever is
    // nearer; past half a turn round she ends skating the other way. `bias` (a share of a half turn) leans an even
    // choice back the way she came: a quarter turn unwinds, three quarters goes on to backward.
    settle: { rest: 0.5, restPx: 40, rate: 2.4, bias: 0.08 },
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
    // What choreography is worth (v3-look46; until then it was the seconds alone). Each second counts as `still` when she
    // only holds gestures, plus `travel` at travelSpeed m/s or more, plus `spin` in a fast spin (0.7 of it in a slow one),
    // at most 1 in all; points.dance turns those seconds into value. Then variety: each kind she has shown (calm
    // gestures, sharp ones, a slow spin, a fast spin, travelling for travelTime seconds) adds `kind` to a share that
    // starts at `base`, so all five give the full value and one alone gives 0.6 of it.
    score: { still: 0.35, travel: 0.35, spin: 0.3, travelSpeed: 4, travelTime: 1, base: 0.5, kind: 0.1 },
    // How the thumbs are read while she dances (v3-look62, moves/dance.js). reach: how far (px) the right thumb drifts
    // from its resting place to mean fully high, low or to one side (the resting place follows it at `recentre`, 1/s);
    // speed: the thumb speed (px/s) that counts as fully rising, falling or sweeping; ease: how quickly those readings
    // follow the thumbs (1/s). Choosing the next pose: wLevel, wOpen, wSide weigh how well a pose's shape matches the
    // thumbs; chance: how much luck is added; repeat: how much one of the last `memory` poses is marked down. moveOn:
    // how far the thumbs must have moved on from the pose she is in for her to leave it early, once it is `settle` of
    // the way taken up. spring: how briskly joints follow (a pose is all but taken up in its own time at 5.5). live:
    // how much her body follows the thumbs directly, on top of the pose; of that, with the right thumb fully high, low
    // or to one side: arms (radians both arms rise or fall), bow (radians she bows when it is low), tip (radians she tips
    // sideways), sink (metres her hips drop when it is low). v3-look63: stronger and by the thumb's place, not only its
    // motion (Mark could not tell v3-look62's engine was there): moveOn 1.25 to 0.7, settle 0.7 to 0.45, chance 0.55 to
    // 0.35, ease 5 to 7. v3-look65 (smooth, no sudden moves): trend, how quickly "where the thumbs have been lately"
    // follows them (1/s), which is what poses are chosen by; minPose, the least seconds between pose changes; ease 7 to
    // 4.5, arms 0.8 to 0.6, moveOn 0.7 to 0.9, settle 0.45 to 0.85.
    express: {
      reach: 110,
      recentre: 0.06,
      speed: 600,
      ease: 4.5,
      trend: 1.1,
      minPose: 1.5,
      wLevel: 1.8,
      wOpen: 0.5,
      wSide: 0.7,
      chance: 0.35,
      repeat: 1.4,
      memory: 8,
      moveOn: 0.9,
      settle: 0.85,
      spring: 5.5,
      live: 1,
      // turning gently she takes one of the open spin positions (camel, layback, attitude) this share of the time, and
      // otherwise dances on as the thumbs shape her (v3-look64)
      spinPose: 0.25,
      // how quickly her turning one way is taken up for reading a spin (1/s): slow enough that a thumb sweeping to and
      // fro does not count as circling
      spinEase: 1.8,
      arms: 0.6,
      bow: 0.22,
      tip: 0.24,
      sink: 0.09,
      // v3-look68, energetic thumbs. quick: how much shorter a pose's time, its hold and the wait between poses get when
      // the right thumb is fully energetic (0.5: half). accent: the thumb's energy runs from calmPx to livelyPx (px/s),
      // rising at `rise` and settling at `fall` (1/s). A jab is the thumb above hitPx going the other way (the cosine
      // of the angle below turnCos) from `back` seconds earlier, or above burstPx having been below `still` within
      // `window` seconds; at most one every `gap` seconds. Each is answered by an accent of her arms or of her legs, in
      // turn, taken in about `dur` seconds (or `perRad` seconds for each radian its furthest joint has to go, if that is
      // longer) and held about `hold`; it is chosen by where the thumb is (`place`) and
      // above all by which way it jabbed (`way`). v3-look69: the arms' accents are steps of a phrase (PHRASES in
      // dance.js); a step nobody jabs for is taken by itself in about `unfold` seconds.
      quick: 0.5,
      accent: {
        // v3-look79: 280 to 950 (was 300 to 650). In Mark's 21 Nov log his thumb ran at about 400 px/s to Circle of
        // Life and 800 to Never Too Much, so the old range read both songs' dancing much the same, the fast one maxed out
        calmPx: 280,
        livelyPx: 950,
        rise: 2.5,
        fall: 1.2,
        hitPx: 380,
        burstPx: 600,
        still: 150,
        turnCos: -0.3,
        back: 0.09,
        window: 0.2,
        gap: 0.45,
        dur: 0.36,
        perRad: 0.23,
        unfold: 0.85,
        // how much less her arms follow the thumb directly when it is fully energetic (0.8: a fifth as much)
        quiet: 0.8,
        hold: 0.35,
        place: 0.4,
        way: 0.9,
      },
    },
    // Hip hop (v3-look48): both thumbs moving (faster than moveSpeed), each frame scored by how much in step they are (1:
    // the same way, or mirrored like a pair of arms; about 0.4 at random), smoothed at syncRate (1/s). Above inStep the
    // elegant gestures, below outOfStep hip hop, held while both have moved within `linger` seconds. Steps on the beat at
    // bpm; the groove dips her `dip` metres on every beat and sways her hips `sway` radians; the left thumb steers at
    // `steer` of the usual while she dances it (v3-look61: 1, all of it; at 0.35 steering in choreography felt stiff, since
    // a left thumb steering while the right one dances reads as out of step). accel (v3-look61: 1, was 0.8): how hard the
    // left thumb pushes her while she dances.
    // The groove (v3-look79). Mark, with a log of dancing to Never Too Much: "pay attention to any intentional discord
    // movement of chaotic moves, these are moves where i am dancing to fast pace music". To fast music his thumb shakes
    // to and fro, two to three times a second, often in short bursts. Each turn back (CFG.reversal) is half a step: her
    // feet step and her body sways and bounces in time with the thumb, whatever its rhythm (early, late, uneven), and
    // waits when it pauses. Reversals between minH and maxH seconds apart count; `full` of them within `window` seconds
    // (or four of the thumb's own half-steps, if longer) bring the whole groove, rising at `rise` and settling at `fall`
    // (1/s); not in a spin. A step is one reversal when they come slower than `one` s apart, two below that, four below
    // `four`. `follow` (1/s): how closely her rhythm keeps up with the thumb's. Her legs go `stance` of the way to a soft
    // two-footed stance (the arms keep the dance's shapes and phrases); on each step she sinks `dip` m (knees `knee`),
    // sways `sway` rad toward the foot she is on, swings her arms `swing` rad and bends her elbows `elbow`; at the
    // thumb's own quick rate her shoulders shimmy (`shimmy`). Pose changes and accents wait for the next step, so they
    // land on her beat. A new dance within `carry` s takes up the last one's groove.
    // v3-look82 (Mark: "lets look into foot works currently very rigid and doesnt match the upper body"): on each step
    // the other foot leaves the ice and makes a gesture shaped by her arms and body (FOOT in dance.js), `foot` of it at
    // full size (steps quicker than `quick` s make smaller ones); `lift`: how much of a plain lift of the heel is mixed
    // in. And in every pose a free leg answers the live bow and tip of her body by `counter` (dance.js).
    groove: {
      minH: 0.12,
      maxH: 0.9,
      window: 1.2,
      full: 4,
      rise: 3,
      fall: 1.5,
      one: 0.35,
      four: 0.15,
      follow: 22,
      stance: 0.75,
      dip: 0.035,
      knee: 0.11,
      sway: 0.06,
      lift: 0.35,
      foot: 1,
      quick: 0.5,
      counter: 0.6,
      swing: 0.22,
      elbow: 0.25,
      shimmy: 0.05,
      carry: 1,
    },
    hiphop: { bpm: 96, syncRate: 2, inStep: 0.75, outOfStep: 0.6, linger: 0.6, dip: 0.05, sway: 0.07, steer: 1 },
  },
  // pushing for speed (render/poses.js, v3-look82: long, slow strokes): `rate` [radians of stride a second at a
  // standstill, more for each m/s]; a stride is a push with each leg, so at 7 m/s about one push a second
  stride: { rate: [2.3, 0.12] },
  // the speed tuck (render/poses.js), from `from` m/s (50 km/h), fully at `full` (61 km/h): reached in the Canyon
  tuck: { from: 14, full: 17 },
  // Bjorn's dash on all fours (v3-look48, an easter egg): skating at `speed` m/s or more with his path turning less than
  // `turn` rad/s for `after` seconds, he drops onto all fours: body pitched forward `lean` radians, hips `y` metres up.
  // v3-look82 (long strides): `rate` [strides a second, more for each m/s] (about 1.1 at 7 m/s; it was 1.7), `reach`
  // [front, hind]: how far each leg swings either way (radians; it was 0.5 and 0.45).
  dash: { speed: 5, turn: 0.3, after: 2.5, lean: 1.35, y: 0.61, rate: [0.75, 0.05], reach: [0.85, 0.75] },
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
  // A move of the same kind as one in the last repeatWindow seconds earns repeat times as much for each such one
  // (v3-look46: until then three-turns one after another kept earning the full bonus).
  bonus: {
    perfect: 1.1,
    clean: 0.6,
    shaky: 0,
    perRotation: 0.45,
    max: 6,
    fade: 0.22,
    kick: 0.6,
    move: [0.3, 0.35],
    repeat: 0.6,
    repeatWindow: 20,
  },
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
    // at most this many jumps in one combination, as in real skating; the next one starts a new element (v3-look46:
    // Mark's screenshot had ten hops, waltz jumps and half loops chained into one, its name running down the screen)
    comboMax: 3,
    chainWindow: 3,
    artistry: 0.3, // elements linked within chainWindow seconds; each new kind adds artistry x kinds so far
    // Everything that lasts: [most it can be worth, how quickly it gets there]. Value = most x (1 - e^(-amount / quickness)),
    // so the first turns or seconds count most and carrying on adds less and less.
    twizzles: [2.0, 2], // per turn
    spiral: [1.6, 2],
    eagle: [1.6, 2],
    hydro: [2.0, 2],
    dance: [3.6, 6], // per active second (dance.score)
    turn: 0.3,
    leap: 0.6,
    changeLeap: 1.4,
    stop: 0.8, // stop: from full speed; less from slower
    // a jump out of curves and figures (radians turned in the seconds before take-off) beats one from a straight run-up
    entry: [
      [4.5, 1.5],
      [1.6, 1.25],
    ],
    // an element done again within repeatWindow seconds is worth less: the second time 0.7, the third and on 0.5
    // (v3-look46: counted over that time; until then only straight after itself, so A, B, A, B was never marked down)
    repeat: [1, 0.7, 0.5],
    repeatWindow: 20,
  },
  // Toe kick (v3-look61, back in v3-look76 as the flick down, Mark: "swipe down becomes toe kick in prep for jump"): she
  // taps her free toe into the ice behind her. A jump within `window` seconds goes `lift` times higher, and skating
  // backward it is a toe loop.
  toe: { window: 2, lift: 1.18 },
  // Icicles: every `spacing` metres of new line sheds perSpot glints that sink (m/s) into the ice and fade over `seconds`.
  // (v3-look36: fewer, smaller and dimmer than before; at 4 glints and brightness 1.5 they read as stitching beside the line)
  icicles: { seconds: 5, spacing: 0.16, perSpot: 3, sink: 0.6, size: 0.11, bright: 0.85 },
  trace: { width: 0.075, length: 0.2, spacing: 0.13, saveMax: 50000 },
  camera: {
    fov: 38,
    // at speed the view widens instead of rising, so the ice rushes past (v3-look69: 6, it was 9; see portraitFar)
    fovFast: 6,
    closeHeight: 10.5,
    closeBack: 5.6,
    tilt: 28,
    tiltSpeed: 9,
    tiltAir: 8,
    speedLift: 0.2,
    lookAhead: 0.22,
    lookMax: 2.2,
    minOverview: 16,
    // how far back the view sits when the screen is wider than it is tall (v3-look46: closer, Mark: "zoom in a bit")
    landscape: 0.82,
    // Upright, the view follows her speed (v3-look46, Mark: "zoomed in when slow and zoomed out when fast"): portraitNear
    // times the usual distance up to portraitFrom (m/s), easing out to portraitFar at portraitFrom + portraitSpan
    // (11.5 m/s, about 41 km/h), and back in as she slows. portraitEase (1/s): how quickly it follows her speed, slow
    // enough that a push or a landing does not make the view pump. Before v3-look46: 1.2 slow to 2.04 at 14 m/s.
    portraitNear: 0.85,
    // v3-look69 (Mark, after v3-look67 had eased the zoom with turning: "and now the camera zooms out too much"): far
    // 1.65, it was 2.2, so upright at 30 km/h she is about 20 m away, not 26, and the view moves less in all.
    portraitFar: 1.65,
    portraitFrom: 1.5,
    portraitSpan: 10,
    portraitEase: 1.4,
    // The view also comes in closer the faster she turns (v3-look66, Mark: "it was camera zoom was just speed based so
    // when i would skate around 30km/h and do intricate moves i couldnt see the detail. try combining camera zoom by
    // speed with rate of direction change"): from `from` rad/s of turning (her path curving, a spin, turning in a dance)
    // the distance shrinks, to `zoom` times at `full` rad/s; it follows the turning at `in` (1/s) coming closer and
    // `out` going back, so it comes in promptly and eases out. Not in the Tunnel (its own chase view) or the overview.
    // v3-look67 (Mark: "zooms in too much too close a little bit too much camera zoom movement overall a bit dizzy"):
    // gentler and slower. It was from 0.45, full 2.4, zoom 0.55, in 1.4, out 0.45.
    // v3-look69: zoom 0.82 (from a nearer view, it needs less).
    turn: { from: 0.6, full: 2.8, zoom: 0.82, in: 0.6, out: 0.3 },
    // Changing angles (v3-look72, Mark: "incorporate additional camera angle, it could be procedural or just cycling
    // through"): every `hold` seconds on the ice (not in the air, not on the front page, not zoomed out, not in the
    // Tunnel) the view moves on to the next of `list`: [degrees more side-on, times the distance]. The place's own
    // view, low and close (her moves seen from the side), the place's own again, then high and back (the drawing seen
    // from above). Only the pitch and the distance change, never the way the view faces, so steering is as before and
    // nothing swings round (he gets dizzy). It eases over about five seconds (`ease`, 1/s). `max`: the most side-on the
    // view ever is (degrees from straight down), so even low, fast and in the air it never looks out at the horizon.
    // v3-look79, the views by name (Mark: "lets call low camera view flat view, default view axo and top down view
    // top"): axo, the place's own; flat, low and close; high, high and back; top, nearly straight down and a little
    // further back (v3-look78, among the planets). Each [degrees more side-on, times the distance]. `list`: the order
    // they come round in (v3-look80, Mark: "top and high view for all for changing, call changing auto": top joins
    // high everywhere; v3-look82, Mark: "remove top view from view rotation and only to paper mode": top only on paper,
    // `paper`, unless the sheet has its own). Menu > View: Auto, or one of them held (save key `va`).
    angles: {
      views: { axo: [0, 1], flat: [13, 0.86], high: [-16, 1.12], top: [-40, 1.45] },
      list: ['axo', 'flat', 'axo', 'high'],
      paper: ['axo', 'flat', 'axo', 'high', 'axo', 'top'],
      hold: 22,
      ease: 0.45,
      max: 66,
    },
    // v3-look79 (Mark: "during flat view in phone landscape mode sometimes the skater jump is too close to top and
    // overlap with score and the indicator ring goes beyond screen. might have to look a little higher"): in a jump the
    // view rises just enough to keep the top of her (`clear` metres over her blades: her hands, the jump's ring) `top`
    // CSS pixels below the screen's top edge [upright, sideways], judged at the top of the jump, so it rises once, as
    // she takes off (`rise`, 1/s), and settles back after the landing (`fall`); never more than `max` metres.
    airFit: { clear: 2.2, top: [130, 84], rise: 4, fall: 1.4, max: 8 },
    // The front page (v3-look40): the view comes round low in front of her, `elev` degrees above level, as close as fits
    // her from `low` to `high` metres (her blades to her hands overhead) into the space between the status bar and the
    // choices, and `half` metres either side of her (the coat flying open). `ease` (1/s): how quickly the framing follows
    // when that space changes.
    showcase: { elev: 16, low: -0.06, high: 2.25, half: 0.95, ease: 5 },
  },
  // The front page's turntable (ui/showcase.js). perPx: radians she turns per pixel the finger drags; maxSpin (rad/s): the
  // fastest a flick spins her; coast (s): how long a spin takes to die away, and drag (rad/s each second) stops the last of
  // it. Turned faster than spinIn (rad/s) she takes a spin position, kept until slower than spinOut, then finishes with a
  // flourish. Turned slowly, she moves to the next gesture each `every` radians, showing each at least minHold seconds;
  // `hold` (s): how long a gesture or the flourish stays once she has stopped. Left alone `idle` seconds (a range), she
  // strikes a pose on her own. blend (1/s): how quickly she goes into a gesture and back to her stance.
  showcase: {
    perPx: 0.012,
    maxSpin: 24,
    coast: 1.6,
    drag: 0.8,
    spinIn: 6,
    spinOut: 2.5,
    every: 1.3,
    minHold: 0.9,
    hold: 2.2,
    idle: [5, 9],
    blend: 3,
  },
  // Times of day: dawn, day and dusk. Each is a complete lighting setup; the front page and the menu choose one.
  // sun: [elevation, azimuth] in degrees (azimuth 0 = from the south, 90 = from the west).
  // linePunch deepens the line's colours (1 = as painted); lineWide draws it wider. spot: the two follow spots.
  // (v3-look37: Golden hour, Blue hour and Night are gone; dusk is a deep blue dark with the follow spots.)
  // glow: the bloom [strength, radius, threshold]. v3-look41 took dusk's from [0.65, 0.25, 1.3] to a faint one that only
  // the brightest light passes (it haloed her white fur and blurred the line), and put sparkle on her clothes instead:
  // stars winking over her coat (`glints` in Tesa's options in main.js) and `sparkle` (how brightly the crystals on her
  // clothes flash, 1 as made). Two more kinds are built but off (0): glitter (frost crystals on the ice winking, mostly
  // round her) and dust (diamond dust hanging in the air round her); Mark wanted the sparkle on her, not on the ice.
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
      glow: [0.28, 0.18, 1.6],
      lineGlow: 1.8,
      glitter: 0,
      dust: 0,
      sparkle: 1.6,
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
  // waves: how high the ice rises and falls (CFG.waves; 0 or left out: flat). tilt: degrees more side-on the view is,
  // so the slopes show. Rolling ice (v3-look47) comes last so the places saved before it keep their numbers.
  // Tunnel (the Canyon until v3-look60): its view chases her along the run (CFG.canyon.view, since v3-look56).
  // v3-look72 (Mark: "the rolling hill camera is very nice. implement on all views except for tunnel"): every place
  // but the Tunnel has Rolling ice's tilt.
  places: [
    { name: 'Open lake', trees: false, tilt: 18 },
    { name: 'Islands', trees: true, camera: 1.35, tilt: 18 },
    { name: 'Paper', trees: false, paper: true, tilt: 18 },
    { name: 'Rolling ice', trees: false, waves: 1, tilt: 18 },
    { name: 'Tunnel', trees: false, canyon: true },
  ],
  // Rolling ice (v3-look47, Mark: "undulating ice, various, gentle to wavy"; core/terrain.js). Each wave: [height (m),
  // wavelength (m), direction (degrees), phase]. gentle: long low swells everywhere. wavy: shorter waves, only where the
  // two very long `patch` waves add up to more than mix[0] (fully from mix[1]), so the lake goes from gently rolling to
  // wavy and back. warp: bends the wavy crests (metres, and two wave numbers). pull: how much of a slope's pull she feels
  // (1: all of gravity); it only speeds her up or slows her down, never turns her. minSpeed: a slope slows her no further.
  // grid: the ice drawn as a mesh round the view, out to `radius` metres (rings `step` apart at the middle, `grow` more
  // for every metre out, `sides` round), the waves easing out between fade[0] and fade[1] of the radius, and the short
  // wavy ones already between detail[0] and detail[1] metres, where the rings are too far apart to draw them.
  // v3-look48 (Mark: "rolling wave looks good, make it more dramatic"): the swells about twice as high (plus or minus
  // 1 m on their own), the wavy crests half as high again and a little longer, wavy stretches more common, the view 4
  // degrees more side-on; slopes pull a little less (0.6 to 0.45) so she still climbs the steeper faces.
  waves: {
    gentle: [
      [0.45, 30, 20, 0],
      [0.32, 44, 115, 1.7],
      [0.22, 60, 250, 4.1],
    ],
    wavy: [
      [0.23, 7, 65, 0.6],
      [0.18, 9, 82, 2.9],
      [0.13, 11.5, 47, 5.2],
    ],
    patch: [
      [1, 170, 35, 0.3],
      [1, 230, 140, 2.2],
    ],
    mix: [-0.4, 0.4],
    warp: [3, 0.11, 0.13],
    pull: 0.45,
    minSpeed: 0.3,
    // how much brighter a slope facing the sun is drawn (and darker facing away), per unit of slope; and a crest (paler)
    // or hollow (deeper blue), per metre up or down
    relief: 3,
    rise: 0.32,
    grid: { radius: 150, step: 0.3, grow: 0.025, sides: 256, fade: [0.55, 0.95], detail: [35, 70] },
  },
  // The Tunnel (the place called Canyon until v3-look60; still `canyon: true`; core/track.js, render/slide.js). Rebuilt
  // in v3-look56 as an ice slide winding down a snowy hillside (Mark: "bobsled or waterslide type with looping ... the
  // track also does spiral and twists like waterslide"), closed into a tube in v3-look57 ("full pipe design like going
  // through a tunnel or large tube ... also increase steepness and therefore max speed"), and in v3-look60 (Mark:
  // "change name of canyon to tunnel and remove height restriction ... like skateboarder doing 360. make the skater
  // always on ice ... make tunnel gradually get wider and narrower in cycle also make it go corkscrew and spiral wild
  // fun warmhole like") skated all the way round, widening and narrowing, with corkscrews. Before v3-look56 it was a
  // frozen river between rock walls (git history at v3-look55); the open trough is at v3-look56, the plain tube at
  // v3-look59.
  // tube: the tube's radius inside (m), then [amount, wavelength (m)] pairs it swells and shrinks by along the run, never
  // below tubeMin. shell: its wall's thickness (m); gap: at least this much air between two parts of the run (m).
  // Along, laid a metre at a time from sections chosen in turn (seeded by `seed`, so the same run every visit):
  // straights, bends, twists (a bend one way straight into one the other way), corkscrews (turns coils of radius[]
  // metres, one every pitch[] metres along) and spirals (turning 450 to 810 degrees on the map, each turn passing under
  // the one before), each with its ranges of lengths (m), angles (degrees) and radii (m), and its drop (m per m on the
  // map, steeper when the run is high above the hillside and gentler when low). wild: where a random 0..1 picks a
  // straight (below wild[0]), a bend (below wild[1]), a twist, a corkscrew, else a spiral. Curves ease in over `ease`
  // metres. It banks into bends: roll[0] degrees per 1/m of curve, at most roll[1], averaged over rollEase metres
  // either way; in a round tube the bank shows as the lines inside turning (`twistLook` times it). hill: the hillside
  // drops this much per metre toward -z; the run keeps between height[0] and height[1] metres above it. rings: a ring of
  // light round the inside every rings[0] metres, rings[1] wide.
  // pull: how much of gravity she feels; air drag has her settle at `top` m/s (120 km/h) on a slope of `settle`, and
  // she never goes faster. On the tube she is always on the ice: gravity pulls her round toward its bottom, and its
  // bends throw her toward their outside, so with speed she rides up the walls and right over the top.
  canyon: {
    seed: 7,
    tube: [6, 2, 260, 0.7, 90],
    tubeMin: 3.3,
    shell: 0.6,
    gap: 1.5,
    straight: { len: [50, 110], grade: 0.15 },
    bend: { deg: [60, 150], radius: [45, 80], grade: 0.14 },
    spiral: { deg: [450, 810], radius: [26, 36], grade: 0.14 },
    twist: { deg: [45, 80], radius: [40, 60], grade: 0.14 },
    corkscrew: { turns: [2, 4], radius: [7, 10], pitch: [34, 44], grade: 0.14 },
    wild: [0.14, 0.34, 0.5, 0.75],
    ease: 22,
    roll: [1500, 26],
    rollEase: 20,
    twistLook: 2,
    hill: 0.2,
    height: [28, 105],
    rings: [12, 0.4],
    pull: 0.85,
    top: 33.3,
    settle: 0.12,
    // the view (v3-look56, Mark: "the camera can be more zoomed in and lower tilted up to look more at the horizon,
    // parallel to the track"): it chases her from back[] metres behind her along the run, high[] metres in from the ice
    // under her (air more in a jump), never nearer the tube's far wall than `inside`, looking at a point a metre in from
    // the ice ahead[] metres beyond her; each [slow, fast]. Sideways it sits `wide` times as far back. fov: how tall the
    // view is (degrees) [upright, sideways], fovFast more at speed: upright a phone shows only a narrow slice across, so
    // it is taller than elsewhere (38). v3-look60 (Mark: "when player goes up the side of the tunnel follow the camera so
    // to the player the skater is always upright"): it stays round the tube where she is and turns all the way with
    // her, easing round at `turn` (1/s).
    view: {
      back: [5.5, 9],
      high: [2.1, 2.5],
      air: 1.2,
      ahead: [5, 14],
      wide: 1.1,
      inside: 1.1,
      turn: 9,
      fov: [66, 48],
      fovFast: 10,
    },
  },
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
      // v3-look77: the sheet is not drawn, and the solar system is out on it (render/solar.js)
      space: true,
      // v3-look78 (Mark: "this landscape also has a near top down view as well as other camera views. the top down view
      // is zoomed out slightly farther than normal"): its own changing angles (CFG.camera.angles): the usual view, nearly
      // straight down and a little further back, low and close, the usual again, straight down, high and back
      angles: ['axo', 'top', 'flat', 'axo', 'top', 'high'],
      // v3-look82 (Mark: "in space mode higher jump less gravity"): gravity in her jumps, times the usual (so a jump goes
      // two and a half times as high and stays up two and a half times as long)
      gravity: 0.4,
    },
  },
  // Graphics levels. 'Auto' starts at the top that suits the device and steps down if frames drop. dust: how many
  // crystals of diamond dust hang round her at night.
  quality: {
    High: { dpr: 3, shadow: 2048, reflection: true, snow: 0, mist: 0, glow: true, dust: 320 },
    Balanced: { dpr: 2, shadow: 1024, reflection: true, snow: 0, mist: 0, glow: true, dust: 240 },
    Low: { dpr: 1.5, shadow: 1024, reflection: false, snow: 0, mist: 0, glow: false, dust: 140 },
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
