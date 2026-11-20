// Skating sounds (v3-look59, Mark: "add skate sound, but make sure it's set such that i can have my music app playing
// instead of system confusing which one to focus on").
// Living alongside the music app: before the game makes any sound it asks iOS for an "ambient" audio session
// (navigator.audioSession, Safari 16.4 and later). Ambient sound mixes with whatever else is playing, never pauses or
// ducks it, and follows the ring/silent switch, as a game's sound effects do. Everything is made here with the Web Audio
// API from filtered noise and a few tones: no sound files and no <audio> element, which on an iPhone would take over
// the lock screen's player (the music app's controls) and could stop the music. Nothing is set for the lock screen
// (no Media Session), so the music app keeps it.
// Browsers only let sound start from a tap, so the sound is set up on the first touch (unlock()), and again after the
// page comes back from the background. Off (the menu's Sound switch), the audio is suspended altogether.
//
// What plays: a soft hiss of the blade gliding, louder and brighter the faster she goes; a scrape on each push, a
// rougher one when she carves hard; a spray for a hockey stop or skid; a fine drilling hiss in a spin; wind at speed;
// a click on takeoff and a thump and scrape on landing (harder for a fall or a crash).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createAudio() {
  let ctx = null,
    on = true,
    master = null,
    noise = null,
    layers = null,
    hidden = false;

  // white noise, two seconds of it, looped by the layers and cut into bursts by the one-shot sounds
  function makeNoise() {
    const n = ctx.sampleRate * 2,
      b = ctx.createBuffer(1, n, ctx.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // a looping layer: noise through a filter (and a second, if given) into its own gain, silent until update() opens it
  function layer(type, f, q, type2, f2) {
    const src = ctx.createBufferSource(),
      flt = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = noise;
    src.loop = true;
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    g.gain.value = 0;
    src.connect(flt);
    let last = flt;
    if (type2) {
      const f2n = ctx.createBiquadFilter();
      f2n.type = type2;
      f2n.frequency.value = f2;
      flt.connect(f2n);
      last = f2n;
    }
    last.connect(g);
    g.connect(master);
    src.start(0, Math.random() * 1.9);
    return { flt, g };
  }
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    // ambient: mix with the music app instead of taking over from it (must be set before the context is made)
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    } catch (e) {}
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return false;
    }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = on ? 0.55 : 0;
    master.connect(comp);
    comp.connect(ctx.destination);
    noise = makeNoise();
    layers = {
      // the blade gliding: a soft high hiss
      glide: layer('bandpass', 3000, 0.7, 'highpass', 1100),
      // carving hard on an edge: a lower, rougher scrape
      carve: layer('bandpass', 1500, 1.3),
      // a hockey stop or skid: a broad spray of ice
      skid: layer('bandpass', 2300, 0.55),
      // a spin: a fine drilling hiss
      spin: layer('bandpass', 4300, 3),
      // wind at speed
      wind: layer('lowpass', 500, 0.5),
    };
    // an old iPhone only lets sound out once something has played in a tap: a moment of silence
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    return true;
  }
  // from a tap (or a key): make the sound ready, or wake it after the page was in the background
  function unlock() {
    if (!on || hidden) return;
    if (!ctx && !build()) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!ctx) return;
    if (hidden) ctx.suspend().catch(() => {});
    else if (on) ctx.resume().catch(() => {});
  });
  const live = () => ctx && on && ctx.state === 'running';
  const to = (param, v, tc) => param.setTargetAtTime(v, ctx.currentTime, tc);

  // every frame. st: speed (m/s), grounded, turn (rad/s), skid (a stop or skid going on), spin (rad/s), paused
  function update(st) {
    if (!live()) return;
    const L = layers,
      v = st.paused ? 0 : st.speed,
      ground = !st.paused && st.grounded;
    to(L.glide.g.gain, ground && v > 0.25 ? 0.02 + 0.16 * Math.pow(clamp01(v / 14), 0.8) : 0, 0.08);
    to(L.glide.flt.frequency, 2500 + 110 * Math.min(v, 30), 0.15);
    to(L.carve.g.gain, ground ? 0.26 * clamp01((Math.abs(st.turn) * v - 3) / 16) : 0, 0.06);
    to(L.skid.g.gain, ground && st.skid ? 0.55 * clamp01(v / 6) : 0, 0.04);
    to(L.spin.g.gain, ground ? 0.16 * clamp01((st.spin - 4) / 14) : 0, 0.1);
    const w = clamp01((v - 7) / 24);
    to(L.wind.g.gain, 0.3 * w * w, 0.25);
    to(L.wind.flt.frequency, 380 + 26 * v, 0.3);
  }

  // ---- one-shot sounds
  // a burst of filtered noise: centre frequency, sharpness, length (s), loudness, rise (s)
  function burst(f, q, dur, level, rise = 0.01, type = 'bandpass') {
    const t = ctx.currentTime,
      src = ctx.createBufferSource(),
      flt = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = noise;
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + rise);
    g.gain.exponentialRampToValueAtTime(0.0005, t + rise + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 1.5, rise + dur + 0.05);
  }
  // a low thump, falling in pitch
  function thump(f, dur, level) {
    const t = ctx.currentTime,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + dur);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // each push of a stride: a short scrape, louder the harder she is working (v: speed, m/s)
  function stride(v) {
    if (!live()) return;
    burst(1700 + Math.random() * 500, 1.1, 0.2, 0.1 + 0.18 * clamp01(v / 10), 0.03);
  }
  function takeoff() {
    if (!live()) return;
    burst(3600, 1.2, 0.09, 0.28, 0.005);
    burst(1400, 0.8, 0.16, 0.12, 0.01);
  }
  // grade: as the skater reports it ('fall' and 'stumble' land harder)
  function land(grade) {
    if (!live()) return;
    const hard = grade === 'fall' || grade === 'stumble';
    thump(hard ? 95 : 120, hard ? 0.28 : 0.16, hard ? 0.7 : 0.45);
    burst(2400, 0.8, hard ? 0.7 : 0.4, hard ? 0.4 : 0.32, 0.008);
    if (hard) burst(900, 0.7, 0.8, 0.25, 0.05, 'lowpass');
  }
  function crash(soft) {
    if (!live()) return;
    thump(85, 0.3, soft ? 0.45 : 0.75);
    burst(1100, 0.6, soft ? 0.4 : 0.7, 0.35, 0.01);
  }
  // the menu's Sound switch
  function setOn(v) {
    on = !!v;
    if (!ctx) return;
    master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05);
    if (on) unlock();
    else setTimeout(() => !on && ctx.suspend().catch(() => {}), 200);
  }
  return {
    unlock,
    update,
    stride,
    takeoff,
    land,
    crash,
    setOn,
    get on() {
      return on;
    },
    get state() {
      return ctx ? ctx.state : 'none';
    },
  };
}
