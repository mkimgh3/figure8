// Points, laid out the way a skating judges' sheet reads. Every scored element has four numbers:
//   base   what the element is worth (real figure-skating values for jumps)
//   goe    grade of execution: how well it was done (landing quality; less for an element done again within
//          points.repeatWindow seconds)
//   art    what the skating around it adds (a jump out of figures, jump combinations, linking different kinds of element)
//   pts    the total
// Jumps landed one straight after another are one combination element, named like "Triple Salchow + Double toe loop".
// Choreography makes combinations too (v3-look61, CFG.choreo): a dance's moves, and more dancing or jumps within
// choreo.window seconds of the last, are one element, all artistry, named by its moves and scored when it closes.
import { CFG } from './config.js';
const P = CFG.points;
const r1 = (v) => Math.round(v * 10) / 10;
const VERSION = 2; // the points scale; a save from an older scale is set aside
const CODE = { 'Toe loop': 'T', Salchow: 'S', Loop: 'Lo', Axel: 'A', 'Inside Axel': 'iA' };

export function jumpBase(d) {
  const n = Math.floor(d.target),
    half = d.target % 1 !== 0,
    row = P.jumps[d.type],
    forward = d.type === 'Axel' || d.type === 'Inside Axel';
  if (!d.name) return 0;
  if (forward) return !half ? P.hop * n : n === 0 ? P.waltz : row[Math.min(n, 4) - 1];
  return n >= 1 ? row[Math.min(n, 4) - 1] : P.half;
}
// "2A", "3Lz" for the real jumps; nothing for hops, waltz jumps and half jumps
const codeOf = (d) => {
  const n = Math.floor(d.target),
    forward = d.type === 'Axel' || d.type === 'Inside Axel';
  return n >= 1 && (d.target % 1 !== 0) === forward ? n + CODE[d.type] : '';
};

export function createScoring(saved) {
  const st = { total: 0, jumps: 0, falls: 0, best: null, bestJump: null, time: 0, list: [] };
  if (saved && saved.v === VERSION)
    Object.assign(st, {
      total: +saved.total || 0,
      jumps: saved.jumps | 0,
      falls: saved.falls | 0,
      best: saved.best || null,
      bestJump: saved.bestJump || null,
      time: +saved.time || 0,
    });
  const fresh = () => ({ n: 0, kinds: {}, lastEnd: -99 });
  let clock = 0,
    startT = 0,
    chain = fresh(),
    inRow = 0,
    lastJumpEnd = -99,
    // the elements of the last points.repeatWindow seconds, { key, t }, for the repeat penalty
    recent = [],
    combo = null,
    // the choreography combination being made: { parts, art, last } (last: the clock when it was last added to)
    cho = null;
  const CH = CFG.choreo;
  const copy = (e) => ({ name: e.name, code: e.code, base: e.base, goe: e.goe, art: e.art, pts: e.pts });
  function record(e, replaces) {
    if (replaces) {
      const i = st.list.indexOf(replaces);
      if (i >= 0) st.list.splice(i, 1);
    }
    st.list.unshift(e);
    if (st.list.length > 40) st.list.pop();
    if (!st.best || e.pts > st.best.pts) st.best = copy(e);
    if (e.jump && (!st.bestJump || e.pts > st.bestJump.pts)) st.bestJump = copy(e);
    return e;
  }
  // key: what counts as the same element again (a stumbled jump is still that jump)
  function score(kind, name, base, quality, entry, code, key) {
    if (!(chain.n > 0 && startT - chain.lastEnd <= P.chainWindow)) chain = fresh();
    let mult = 1;
    if (kind === 'jump') {
      inRow = startT - lastJumpEnd <= P.jumpComboWindow && inRow < P.comboMax ? inRow + 1 : 1;
      mult = P.jumpCombo[Math.min(inRow, P.jumpCombo.length - 1)];
      lastJumpEnd = clock;
    } else inRow = 0;
    key = key || name;
    recent = recent.filter((r) => clock - r.t <= P.repeatWindow);
    const reps = recent.filter((r) => r.key === key).length,
      rep = P.repeat[Math.min(reps, P.repeat.length - 1)];
    recent.push({ key, t: clock });
    let link = 0;
    if (!chain.kinds[kind]) {
      chain.kinds[kind] = 1;
      const k = Object.keys(chain.kinds).length;
      if (k > 1) link = P.artistry * k;
    }
    const b = r1(base),
      exec = base * quality * rep,
      goe = r1(exec - base),
      art = r1(exec * (entry * mult - 1) + link);
    chain.n++;
    chain.lastEnd = clock;
    st.total = r1(st.total + b + goe + art);
    return { name, code, base: b, goe, art, pts: r1(b + goe + art), jump: kind === 'jump' };
  }
  return {
    state: st,
    tick(dt) {
      clock += dt;
      st.time += dt;
    },
    // an element has just begun
    mark() {
      startT = clock;
    },
    jump(d) {
      if (d.grade === 'fall') {
        chain = fresh();
        inRow = 0;
        recent = [];
        combo = null;
        st.falls++;
        const pts = r1(-Math.min(st.total, -P.fall));
        st.total = r1(st.total + pts);
        return record({
          name: d.crash ? 'Crash' : d.name ? d.name + ', fall' : 'Fall',
          code: '',
          base: 0,
          goe: pts,
          art: 0,
          pts,
        });
      }
      const base = jumpBase(d);
      if (!base) return null;
      let entry = 1;
      for (const [need, f] of P.entry)
        if ((d.entry || 0) >= need) {
          entry = f;
          break;
        }
      const q = d.grade === 'stumble' ? CFG.stumble.quality : P.quality[d.grade],
        e = score('jump', d.grade === 'stumble' ? d.name + ', stumbled' : d.name, base, q, entry, codeOf(d), d.name);
      st.jumps++;
      if (inRow >= 2 && combo && st.list[0] === combo) {
        // straight out of the last landing: one combination
        const m = {
          name: combo.name + ' + ' + e.name,
          code: combo.code && e.code ? combo.code + '+' + e.code : '',
          base: r1(combo.base + e.base),
          goe: r1(combo.goe + e.goe),
          art: r1(combo.art + e.art),
          pts: r1(combo.pts + e.pts),
          jump: true,
        };
        combo = record(m, combo);
        return combo;
      }
      combo = record(e);
      return combo;
    },
    element(d) {
      combo = null;
      return record(score(d.kind, d.name, d.base, d.quality || 1, 1, ''));
    },
    // a dance has ended (d: its element, with parts and base): it goes into the choreography combination, opening one
    choreo(d) {
      if (!d.counted) return;
      if (!cho) cho = { parts: [], art: 0, last: clock };
      for (const n of d.parts || []) if (!cho.parts.includes(n)) cho.parts.push(n);
      cho.art += d.base;
      cho.last = clock;
    },
    // a jump has landed (e: its scored element, d: what the skater reported): within an open combination it is one of
    // its moves, adding choreo.jumpArt of its points
    choreoJump(e, d) {
      if (!cho || !e || e.pts <= 0 || clock - cho.last > CH.window) return;
      cho.parts.push(d.name || e.name);
      cho.art += CH.jumpArt * e.pts;
      cho.last = clock;
    },
    // every frame (dancing: a dance is going on, which keeps the combination open): once nothing has been added for
    // choreo.window seconds, the combination becomes one element, all artistry, and is returned to be announced
    choreoDue(dancing) {
      if (!cho) return null;
      if (dancing) cho.last = clock;
      if (clock - cho.last < CH.window) return null;
      const art = r1(cho.art),
        n = cho.parts.length,
        e = {
          name:
            cho.parts.slice(0, CH.maxNames).join(' + ') + (n > CH.maxNames ? ' + ' + (n - CH.maxNames) + ' more' : ''),
          code: '',
          base: 0,
          goe: 0,
          art,
          pts: art,
          choreo: true,
          moves: n,
        };
      cho = null;
      combo = null;
      st.total = r1(st.total + art);
      return record(e);
    },
    // how much of the choreography combination's window is left, 0..1
    choreoLeft: () => (cho ? Math.max(0, 1 - (clock - cho.last) / CH.window) : 0),
    chainLeft: () => (chain.n > 0 ? Math.max(0, 1 - (clock - chain.lastEnd) / P.chainWindow) : 0), // how much of the linking window is left, 0..1
    reset() {
      Object.assign(st, { total: 0, jumps: 0, falls: 0, best: null, bestJump: null, time: 0, list: [] });
      chain = fresh();
      inRow = 0;
      recent = [];
      combo = null;
      cho = null;
    },
    serialise: () => ({
      v: VERSION,
      total: st.total,
      jumps: st.jumps,
      falls: st.falls,
      best: st.best,
      bestJump: st.bestJump,
      time: Math.round(st.time),
    }),
  };
}
