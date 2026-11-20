// Skating sounds (js/audio.js, v3-look59): they must live alongside the music app. Checked with a stand-in for the
// browser's Web Audio: an ambient audio session asked for before any sound is made, nothing that would take over the
// lock screen's player, silent until a tap, and off means suspended.
import fs from 'fs';
let failed = 0;
const ok = (name, cond, info) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : ''));
  if (!cond) failed++;
};

// a stand-in AudioContext: every node takes any call, every parameter any value
const log = [];
const param = () => ({
  value: 0,
  setValueAtTime() {},
  setTargetAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
});
const node = () =>
  new Proxy(
    {},
    {
      get: (t, k) => {
        if (!(k in t)) t[k] = ['gain', 'frequency', 'Q', 'threshold', 'ratio'].includes(k) ? param() : () => {};
        return t[k];
      },
      set: (t, k, v) => ((t[k] = v), true),
    },
  );
class FakeContext {
  constructor() {
    log.push('context made while the session was ' + globalThis.navigator.audioSession.type);
    this.state = 'suspended';
    this.sampleRate = 8000;
    this.currentTime = 0;
    this.destination = node();
  }
  createBuffer(c, n) {
    return { getChannelData: () => new Float32Array(n) };
  }
  createGain() {
    return node();
  }
  createBiquadFilter() {
    return node();
  }
  createBufferSource() {
    return node();
  }
  createOscillator() {
    return node();
  }
  createDynamicsCompressor() {
    return node();
  }
  resume() {
    this.state = 'running';
    log.push('resumed');
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    log.push('suspended');
    return Promise.resolve();
  }
}
globalThis.window = { AudioContext: FakeContext };
Object.defineProperty(globalThis, 'navigator', { value: { audioSession: { type: 'auto' } }, configurable: true });
globalThis.document = { hidden: false, addEventListener() {} };

const { createAudio } = await import('../js/audio.js');
const a = createAudio();
a.update({ speed: 10, grounded: true, turn: 1, skid: false, spin: 0, paused: false });
a.land('perfect');
ok('no sound is set up before a tap', a.state === 'none' && log.length === 0, log);
a.unlock();
ok(
  'on the first tap it asks for an ambient session (mixes with the music app) before making any sound',
  log[0] === 'context made while the session was ambient' && navigator.audioSession.type === 'ambient',
  log,
);
await Promise.resolve();
ok('and starts', a.state === 'running', a.state);
let threw = null;
try {
  a.update({ speed: 30, grounded: true, turn: 1.5, skid: true, spin: 12, paused: false });
  a.stride(8);
  a.takeoff();
  a.land('fall');
  a.crash(true);
} catch (e) {
  threw = String(e);
}
ok('every sound plays without trouble', threw === null, threw);
a.setOn(false);
await new Promise((r) => setTimeout(r, 300));
ok('off, it is suspended', a.state === 'suspended' && !a.on, a.state);
const src = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
ok(
  'it never uses an <audio> element or the lock screen (Media Session), which would take over from the music app',
  !/new Audio\(|createElement\(['"]audio|mediaSession|HTMLAudioElement/.test(src),
);

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
