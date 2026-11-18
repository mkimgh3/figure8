// Everything drawn over the game in HTML: score, announcements, scoreboard, speedometer, touch guides, and the menu.
import { clamp } from '../core/math.js';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
// one decimal, a real minus sign, and never wider than a score card (-99.9 to 99.9); the running total goes to 9999.9
// in Olympic mode and has no limit in Infinite
const num = (v, most = 99.9) => {
  const x = Math.max(-most, Math.min(most, +v || 0));
  return (x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(1);
};
// four equal black cards; with labels for the live score card, without for the scoreboard. noTotal: Base, GOE and Art only
function cards(e, labels, size, noTotal) {
  const box = el('div', 'cards' + (size ? ' ' + size : labels ? '' : ' sm'));
  [
    ['Base', e.base, ''],
    ['GOE', e.goe, e.goe > 0 ? 'up' : e.goe < 0 ? 'dn' : ''],
    ['Art', e.art, e.art > 0 ? 'up' : e.art < 0 ? 'dn' : ''],
    ['Total', e.pts, 'tot'],
  ].forEach(([k, v, cls]) => {
    if (noTotal && cls === 'tot') return;
    const c = el('div', cls);
    if (labels) c.appendChild(el('span', '', k));
    c.appendChild(el('b', '', num(v)));
    c.title = k;
    box.appendChild(c);
  });
  return box;
}
const clockText = (s) => Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);

export function createHud(coarse) {
  const pop = $('pop'),
    arc = $('arc'),
    kmh = $('kmhn'),
    spfill = $('spfill'),
    joy = $('joy'),
    knob = $('knob'),
    pad = $('pad'),
    hint = $('hint'),
    sheet = $('sheet');
  let popT = 0,
    touched = false,
    hudT = 0,
    shown = 0,
    target = 0,
    barOn = false,
    chipKey = null;
  const bar = $('cbar'),
    tag = $('padtag');
  let tagT = 0,
    // Infinite mode: no limit on the total, and the score card is the move's description over small Base, GOE and Art
    totalMax = 9999.9,
    infMode = false;
  // the running total's font shrinks when the number is too wide for the score chip (each Screen style sizes both)
  const totalEl = $('total'),
    scoreEl = $('score');
  let totalLen = 0;
  function fitTotal(len) {
    totalLen = len;
    totalEl.style.fontSize = '';
    const cs = getComputedStyle(scoreEl),
      room = scoreEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      w = totalEl.scrollWidth;
    if (room > 0 && w > room)
      totalEl.style.fontSize = (parseFloat(getComputedStyle(totalEl).fontSize) * room) / w + 'px';
  }
  hint.textContent = coarse
    ? 'Left thumb steers. Right finger: double tap to jump. Tutorial mode, on the front page, teaches every skill.'
    : 'WASD steers. Space jumps, A or D rotates in the air.';
  return {
    // An announcement: a big line and a small one. Or, for a scored element, its name over four black cards: Base, GOE, Art, Total.
    say(big, small, hold, card) {
      pop.textContent = '';
      pop.classList.toggle('inf', !!card && infMode);
      if (card && infMode) {
        // what she did and how (v3-look38: this replaced one big number for the points, which was too big)
        pop.appendChild(el('div', 'pdesc', big || card.name));
        if (small) pop.appendChild(el('small', '', small));
        pop.appendChild(cards(card, true, 'inf', true));
      } else if (card) {
        pop.appendChild(el('div', 'pname', card.name));
        pop.appendChild(cards(card, true));
      } else {
        pop.appendChild(el('div', 'big', big));
        if (small) pop.appendChild(el('small', '', small));
      }
      pop.style.opacity = 1;
      popT = hold;
    },
    // the front page's mode: 'infinite' takes the limit off the total and shows each score as its description
    mode(name) {
      infMode = name === 'infinite';
      totalMax = infMode ? Infinity : 9999.9;
      shown = target;
      const text = num(shown, totalMax);
      totalEl.textContent = text;
      fitTotal(text.length);
    },
    // fit the total again, after the Screen style has changed its size
    refit() {
      fitTotal(totalEl.textContent.length);
    },
    touched() {
      if (!touched) {
        touched = true;
        setTimeout(() => {
          hint.style.opacity = 0;
        }, 12000);
      }
    },
    stick(on, ox, oy, dx, dy) {
      joy.style.display = on ? 'block' : 'none';
      if (on) {
        joy.style.transform = 'translate3d(' + ox + 'px,' + oy + 'px,0)';
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
    },
    pad(on, x, y, armed) {
      pad.style.display = on ? 'block' : 'none';
      if (on) {
        pad.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        pad.classList.toggle('armed', !!armed);
      } else pad.classList.remove('armed');
    },
    padArmed(on) {
      pad.classList.toggle('armed', on);
    },
    // what the right thumb was just read as, for a moment just above (x, y); faint for a stroke that did nothing
    padTag(text, x, y, faint) {
      // kept clear of the screen's edges, however near them the thumb lifted
      x = Math.max(70, Math.min(window.innerWidth - 70, x));
      tag.textContent = text;
      tag.classList.toggle('faint', !!faint);
      tag.style.transform = 'translate3d(' + x + 'px,' + (y - 46) + 'px,0) translate(-50%,-100%)';
      tag.style.opacity = faint ? 0.6 : 1;
      tagT = 0.9;
    },
    // k: how fast she is spinning, 0..1. The ring goes from a faint blue to a full one.
    padSpin(k) {
      const q = Math.round(k * 20) / 20;
      if (q === pad._k) return;
      pad._k = q;
      pad.style.borderColor = 'rgba(110,175,255,' + (0.5 + 0.5 * q).toFixed(2) + ')';
      pad.style.background = 'rgba(70,140,255,' + (0.1 + 0.55 * q).toFixed(2) + ')';
    },
    // the chip: total, then the best jump: its full name (wrapping when long) over its own small score cards
    score(st) {
      target = st.total;
      if (st.total < shown) shown = st.total;
      const bj = st.bestJump,
        key = bj ? bj.name + bj.pts : '';
      if (key !== chipKey) {
        chipKey = key;
        $('sub').textContent = bj ? 'Best jump' : 'Best jump \u2013';
        $('bjname').textContent = bj ? bj.name : '';
        const c = $('bjcards');
        c.textContent = '';
        if (bj) c.appendChild(cards(bj, true, 'xs'));
      }
    },
    // the scoreboard shown while paused: total, jumps, the highest-scoring element, then every element, newest first
    board(open, st) {
      document.body.classList.toggle('paused', open);
      if (!open) return;
      $('btotal').textContent = num(st.total, totalMax);
      $('bsum').textContent =
        st.jumps +
        (st.jumps === 1 ? ' jump' : ' jumps') +
        (st.falls ? ' \u00b7 ' + st.falls + (st.falls === 1 ? ' fall' : ' falls') : '') +
        ' \u00b7 ' +
        clockText(st.time);
      const best = $('bbest');
      best.textContent = '';
      if (st.best) {
        best.appendChild(el('div', 'pname', 'Highest \u00b7 ' + st.best.name));
        best.appendChild(cards(st.best, false));
      } else best.hidden = true;
      best.hidden = !st.best;
      const list = $('blist');
      list.textContent = '';
      if (!st.list.length)
        list.appendChild(el('p', 'empty', 'Nothing scored yet. Jumps, spins and moves appear here with their points.'));
      st.list.forEach((e) => {
        const row = el('div', 'row');
        row.appendChild(el('b', '', e.name));
        row.appendChild(cards(e, false));
        list.appendChild(row);
      });
    },
    // left: 0..1 of the linking window remaining
    combo(left) {
      const on = left > 0;
      if (on) bar.style.transform = 'scaleX(' + left.toFixed(3) + ')';
      if (on !== barOn) {
        barOn = on;
        bar.style.opacity = on ? 1 : 0;
      }
    },
    update(dt, speedMs, colorHex) {
      if (shown !== target) {
        shown = Math.abs(target - shown) < 0.05 ? target : shown + (target - shown) * Math.min(1, dt * 9);
        const text = num(shown, totalMax);
        $('total').textContent = text;
        if (text.length !== totalLen) fitTotal(text.length);
      }
      if (popT > 0) {
        popT -= dt;
        if (popT <= 0) pop.style.opacity = 0;
      }
      if (tagT > 0) {
        tagT -= dt;
        if (tagT <= 0) tag.style.opacity = 0;
      }
      const v = speedMs * 3.6,
        f = clamp(v / 72, 0, 1);
      arc.setAttribute('stroke-dashoffset', (169.6 * (1 - f)).toFixed(1));
      spfill.style.transform = 'scaleX(' + f.toFixed(3) + ')';
      hudT += dt;
      if (hudT > 0.25) {
        hudT = 0;
        kmh.textContent = Math.round(v);
        const hex = '#' + ('00000' + colorHex.toString(16)).slice(-6);
        arc.setAttribute('stroke', hex);
        spfill.style.background = hex;
      }
    },
    on(id, fn) {
      $(id).addEventListener('click', fn);
    },
    text(id, s) {
      $(id).textContent = s;
    },
    sheet(open) {
      sheet.style.display = open ? 'flex' : 'none';
      if (open) this.page('home');
    },
    page(name) {
      $('pg-home').hidden = name !== 'home';
      $('pg-moves').hidden = name !== 'moves';
      $('card').scrollTop = 0;
    },
    swatch(css, name) {
      $('swatch').style.background = css;
      $('palname').textContent = name;
    },
  };
}
