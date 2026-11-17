// Everything drawn over the game in HTML: score, announcements, scoreboard, speedometer, touch guides, and the menu.
import { clamp } from '../core/math.js';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
// one decimal, a real minus sign, and never wider than the card (-99.9 to 99.9)
const num = (v) => {
  const x = Math.max(-99.9, Math.min(99.9, +v || 0));
  return (x < 0 ? '\u2212' : '') + Math.abs(x).toFixed(1);
};
// four equal black cards; with labels for the live score card, without for the scoreboard
function cards(e, labels, size) {
  const box = el('div', 'cards' + (labels ? '' : ' ' + (size || 'sm')));
  [
    ['Base', e.base, ''],
    ['GOE', e.goe, e.goe > 0 ? 'up' : e.goe < 0 ? 'dn' : ''],
    ['Art', e.art, e.art > 0 ? 'up' : e.art < 0 ? 'dn' : ''],
    ['Total', e.pts, 'tot'],
  ].forEach(([k, v, cls]) => {
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
  const bar = $('cbar');
  hint.textContent = coarse
    ? 'Left thumb steers. Right finger: double tap to jump. Tap Tutorial to learn each skill step by step.'
    : 'WASD steers. Space jumps, A or D rotates in the air.';
  return {
    // An announcement: a big line and a small one. Or, for a scored element, its name over four black cards: Base, GOE, Art, Total.
    say(big, small, hold, card) {
      pop.textContent = '';
      if (card) {
        pop.appendChild(el('div', 'pname', card.name));
        pop.appendChild(cards(card, true));
      } else {
        pop.appendChild(el('div', 'big', big));
        if (small) pop.appendChild(el('small', '', small));
      }
      pop.style.opacity = 1;
      popT = hold;
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
        if (bj) c.appendChild(cards(bj, false, 'xs'));
      }
    },
    // the scoreboard shown while paused: total, jumps, the highest-scoring element, then every element, newest first
    board(open, st) {
      document.body.classList.toggle('paused', open);
      if (!open) return;
      $('btotal').textContent = num(st.total);
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
        $('total').textContent = num(shown);
      }
      if (popT > 0) {
        popT -= dt;
        if (popT <= 0) pop.style.opacity = 0;
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
