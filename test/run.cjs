const { open } = require('./smoke.cjs');
(async () => {
  const { b, p, errs, ev, st, sleep, tap } = await open();
  const out = {};
  let failed = 0;
  const ok = (n, c, i) => {
    console.log((c ? 'ok   ' : 'FAIL ') + n + (i !== undefined ? '  (' + JSON.stringify(i) + ')' : ''));
    if (!c) failed++;
  };
  ok('page loads without errors', errs.length === 0, errs);
  // software rendering starves the timers; skip drawing while gestures are timed
  await p.evaluate(() => {
    const w = window.__game.world;
    w._render = w.render;
    w.render = () => {};
  });
  await ev('pointerdown', 1, 100, 640);
  await ev('pointermove', 1, 160, 640);
  await sleep(6000);
  let s = await st();
  ok('steering builds speed and draws a line', s.kmh > 25 && s.prints > 50, s);
  await tap(2, 300, 560);
  await sleep(500);
  s = await st();
  ok('single tap does not jump', s.grounded && s.jumps === 0, s);
  await ev('pointerdown', 2, 300, 560);
  await sleep(700);
  s = await st();
  ok('touch and hold does not jump, and starts choreography', s.grounded && s.jumps === 0 && s.move === 'dance', s);
  await ev('pointerup', 2, 300, 560);
  await sleep(500);
  await tap(2, 300, 560);
  await sleep(120);
  await ev('pointerdown', 2, 336, 560);
  await sleep(120);
  s = await st();
  ok('double tap jumps', !s.grounded && s.jumps === 1, s);
  const res = await p.evaluate(
    () =>
      new Promise((res) => {
        const c = document.getElementById('c'),
          g = window.__game,
          t0 = performance.now();
        let peak = 0;
        const iv = setInterval(() => {
          const t = (performance.now() - t0) / 1000,
            a = Math.min(t * 1.6, 1) * 6.2832;
          c.dispatchEvent(
            new PointerEvent('pointermove', {
              pointerId: 2,
              clientX: 300 + Math.cos(a) * 36,
              clientY: 560 + Math.sin(a) * 36,
              pointerType: 'touch',
              bubbles: true,
            }),
          );
          peak = Math.max(peak, Math.abs(g.S.spin) / 6.2832);
          if (g.S.grounded) {
            clearInterval(iv);
            res(+peak.toFixed(2));
          }
        }, 16);
      }),
  );
  await ev('pointerup', 2, 300, 560);
  await sleep(200);
  s = await st();
  const lj = JSON.parse(await p.evaluate(() => window.__game.log.text())).jumps.slice(-1)[0];
  ok(
    'in the air she turns exactly as far as the finger was counted (headless touch rate is low, so under one turn)',
    res > 0.55 && Math.abs(res - lj.fingerTurns) < 0.05,
    { rotation: res, fingerTurns: lj.fingerTurns, pop: s.pop },
  );
  await sleep(2500);
  // gestures: a helper that plays a path with one or two fingers at 60 samples a second
  const play = (paths, holdMs, liftMs) =>
    p.evaluate(
      ([paths, holdMs, liftMs]) =>
        new Promise((res) => {
          const c = document.getElementById('c'),
            g = window.__game,
            E = (t, id, x, y) =>
              c.dispatchEvent(
                new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true }),
              );
          const seen = {};
          let i = 0;
          const n = Math.max(...paths.map((q) => q.pts.length));
          paths.forEach((q) => {
            if (q.down) E('pointerdown', q.id, q.pts[0][0], q.pts[0][1]);
          });
          setTimeout(() => {
            const iv = setInterval(() => {
              i++;
              paths.forEach((q) => {
                const k = Math.min(i, q.pts.length - 1);
                E('pointermove', q.id, q.pts[k][0], q.pts[k][1]);
              });
              if (g.S.move) seen[g.S.move.id] = 1;
              if (i >= n) {
                clearInterval(iv);
                setTimeout(() => {
                  if (g.S.move) seen[g.S.move.id] = 1;
                  paths.forEach((q) => {
                    if (q.up) {
                      const l = q.pts[q.pts.length - 1];
                      E('pointerup', q.id, l[0], l[1]);
                    }
                  });
                  setTimeout(() => {
                    if (g.S.move) seen[g.S.move.id] = 1;
                    res(Object.keys(seen));
                  }, 120);
                }, liftMs);
              }
            }, 16);
          }, holdMs || 0);
        }),
      [paths, holdMs || 0, liftMs === undefined ? 200 : liftMs],
    );
  const line = (x0, y0, x1, y1, n) =>
    Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  const circle = (cx, cy, r, loops, n) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * loops * 6.2832;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  const zig = (x, y, dx, dy, reps, n) => {
    let o = [];
    for (let k = 0; k < reps; k++) o = o.concat(line(x, y, x + dx, y + dy, n), line(x + dx, y + dy, x, y, n));
    return o;
  };
  const R = (pts) => [{ id: 2, pts, down: true, up: true }];
  const calm = async () => {
    await sleep(3200);
  };
  await ev('pointermove', 1, 160, 640);
  await sleep(2500);
  let seen = await play(R(circle(300, 560, 36, 5, 200)));
  s = await st();
  ok('a circle is part of choreography, not twizzles', seen.includes('dance') && !seen.includes('twirl'), seen);
  {
    const tb = await p.evaluate(
      () =>
        new Promise((res) => {
          const S = window.__game.S,
            iv = setInterval(() => {
              if (!S.move) {
                clearInterval(iv);
                res([+S.bonus.toFixed(2), null]);
              }
            }, 30);
          setTimeout(() => {
            clearInterval(iv);
            res([S.bonus, S.move && S.move.id]);
          }, 7000);
        }),
    );
    ok('finishing a move leaves her a speed bonus', tb[0] > 0.1 && tb[1] === null, tb);
  }
  const resteer = async () => {
    await ev('pointerup', 1, 160, 640);
    await sleep(100);
    await ev('pointerdown', 1, 100, 640);
    await ev('pointermove', 1, 160, 640);
  };
  await resteer();
  await calm();
  seen = await play(R(line(300, 560, 380, 556, 6)));
  ok('flick right is a split leap', seen.includes('leap'), seen);
  {
    const tag = await p.evaluate(() => document.getElementById('padtag').textContent);
    ok('and the thumb shows what it was read as', tag === 'Split leap', tag);
  }
  seen = await play(R(circle(300, 560, 36, 2.2, 90)));
  ok('a circle straight after a split leap is twizzles', seen.includes('twirl'), seen);
  await calm();
  await ev('pointermove', 1, 100, 700);
  await sleep(1500);
  const b0 = (await st()).back;
  seen = await play(R(line(380, 560, 300, 556, 6)));
  await sleep(600);
  ok(
    'flick left across her travel is a three-turn that swaps direction',
    seen.includes('turn') && (await st()).back !== b0,
    seen,
  );
  await ev('pointermove', 1, 160, 640);
  await calm();
  seen = await play(R(line(300, 600, 296, 500, 6)));
  await sleep(100);
  ok('flick up is a spiral', seen.includes('spiral'), seen);
  await calm();
  seen = await play(R(line(300, 500, 304, 600, 6)));
  await sleep(100);
  ok('flick down is a hydroblade', seen.includes('hydro'), seen);
  await calm();
  seen = await play(R(line(260, 560, 340, 560, 6).concat(line(340, 560, 342, 480, 6))));
  ok('a corner no longer triggers a spread eagle', !seen.includes('eagle'), seen);
  await calm();
  // both thumbs together
  await ev('pointermove', 1, 160, 640);
  await sleep(1500);

  await ev('pointermove', 1, 160, 640);
  await sleep(800);
  seen = await play([
    { id: 1, pts: line(160, 640, 110, 640, 7) },
    { id: 2, pts: line(300, 640, 350, 640, 7), down: true, up: true },
  ]);
  ok('thumbs spreading apart is a spread eagle', seen.includes('eagle'), seen);
  await calm();
  await ev('pointermove', 1, 160, 640);
  await sleep(600);
  seen = await play([
    { id: 1, pts: circle(130, 640, 30, 1.5, 60) },
    { id: 2, pts: line(300, 600, 380, 600, 8), down: true, up: true },
  ]);
  const fz = await p.evaluate(() => {
    const r = window.__game.input.read();
    return Math.hypot(r.x, r.y);
  });
  ok('steering stays live while the right finger moves', fz > 0.2 && !seen.includes('eagle'), { seen, fz });
  await ev('pointermove', 1, 160, 640);
  await calm();
  s = await p.evaluate(() => ({
    total: window.__game.score.state.total,
    n: window.__game.score.state.list.length,
    top: document.getElementById('total').textContent,
  }));
  ok('moves score points and the score shows them', s.total > 2 && s.n >= 5 && Math.abs(+s.top - s.total) < 0.05, s);
  seen = await play([
    { id: 1, pts: line(160, 640, 160, 560, 7) },
    { id: 2, pts: line(300, 640, 300, 560, 7), down: true, up: true },
  ]);
  ok('both thumbs swiping up are a spiral', seen.includes('spiral') && !seen.includes('stop'), {
    seen,
    last: await p.evaluate(() => {
      const l = JSON.parse(window.__game.log.text()).strokes.slice(-1)[0];
      return { read: l.read, ms: l.ms, two: l.two };
    }),
  });
  await calm();
  await ev('pointermove', 1, 160, 640);
  await sleep(500);
  seen = await play([
    { id: 1, pts: line(160, 600, 160, 680, 7) },
    { id: 2, pts: line(300, 600, 300, 680, 7), down: true, up: false },
  ]);
  await sleep(500);
  {
    const hm = await p.evaluate(() => window.__game.S.move && window.__game.S.move.id);
    ok('both thumbs swiped down and held are a hydroblade', hm === 'hydro' && !seen.includes('stop'), { seen, hm });
  }
  await ev('pointerup', 2, 300, 680);
  await calm();
  await ev('pointermove', 1, 160, 640);
  seen = await play([
    { id: 1, pts: circle(130, 620, 42, 2.2, 150) },
    { id: 2, pts: circle(300, 600, 42, 2.2, 150), down: true, up: true },
  ]);
  ok(
    'circling both thumbs is no longer a spiral or a hydroblade',
    !seen.includes('spiral') && !seen.includes('hydro'),
    seen,
  );
  await sleep(3500);
  await resteer();
  await calm();
  await ev('pointermove', 1, 160, 640);
  await sleep(500);
  // the spiral is held with the right thumb down while the left thumb jitters on the glass: steering must come back anyway
  {
    const lc = line(160, 640, 160, 560, 7).concat(Array.from({ length: 20 }, () => [160, 560])),
      e0 = lc[lc.length - 1],
      jit = Array.from({ length: 50 }, (_, i) => [e0[0] + (i % 2 ? 6 : -6), e0[1]]);
    seen = await play([
      { id: 1, pts: lc.concat(jit) },
      { id: 2, pts: line(300, 640, 300, 560, 7), down: true, up: false },
    ]);
    const a = await p.evaluate(() => window.__game.input.read().x);
    await ev('pointermove', 1, e0[0] - 60, e0[1]);
    await sleep(50);
    const b2 = await p.evaluate(() => [window.__game.input.read().x, window.__game.S.move && window.__game.S.move.id]);
    ok(
      'steering works during a held spiral without lifting the left thumb',
      seen.includes('spiral') && a - b2[0] > 0.3 && b2[1] === 'spiral',
      { seen, a, b: b2 },
    );
    await ev('pointermove', 2, 330, 560);
    await ev('pointermove', 2, 370, 560);
    await sleep(50);
    const b3 = await p.evaluate(() => [window.__game.input.read().x, window.__game.S.move && window.__game.S.move.id]);
    ok('the right thumb never steers, even in a held spiral', Math.abs(b3[0] - b2[0]) < 0.05 && b3[1] === 'spiral', {
      before: b2[0],
      after: b3[0],
      move: b3[1],
    });
    await ev('pointerup', 2, 370, 560);
    await sleep(80);
    const b4 = await p.evaluate(() => window.__game.input.read().x);
    ok('lifting the right thumb leaves the stick as it was', Math.abs(b4 - b2[0]) < 0.05, { b4, stick: b2[0] });
    await calm();
    await ev('pointermove', 1, 160, 640);
  }
  // hockey stop: a sharp swipe against her travel, on any heading; the same swipe along her travel is the ordinary flick
  {
    await sleep(2500);
    const v = await p.evaluate(() => {
      const S = window.__game.S,
        sp = Math.hypot(S.vx, S.vz);
      return [S.vx / sp, S.vz / sp, sp];
    });

    const w = await p.evaluate(() => {
      const S = window.__game.S,
        sp = Math.hypot(S.vx, S.vz);
      return [S.vx / sp, S.vz / sp, sp];
    });
    seen = await play(R(line(300, 560, 300 - w[0] * 110, 560 - w[1] * 110, 3)));
    ok('a one-finger swipe against her travel is not a hockey stop', !seen.includes('stop'), { seen, w });
    await calm();
    await ev('pointermove', 1, 160, 640);
    await sleep(2500);
    seen = await play(
      [
        { id: 1, pts: line(160, 600, 160, 690, 6) },
        { id: 2, pts: line(300, 600, 300, 690, 6), down: true, up: true },
      ],
      0,
      20,
    );
    const hs = await p.evaluate(
      () =>
        new Promise((res) => {
          const g = window.__game;
          let low = 99;
          const iv = setInterval(() => {
            low = Math.min(low, Math.hypot(g.S.vx, g.S.vz));
            const e = g.score.state.list[0];
            if (!g.S.move) {
              clearInterval(iv);
              res({ name: e && e.name, pts: e && e.pts, low: +low.toFixed(2) });
            }
          }, 30);
          setTimeout(() => {
            clearInterval(iv);
            res({ timeout: true, low });
          }, 8000);
        }),
    );
    ok(
      'both thumbs dragged down and lifted are a hockey stop: she halts and it scores',
      seen.includes('stop') && hs.name === 'Hockey stop' && hs.pts > 0 && hs.low < 0.3,
      { seen, w, hs },
    );
    await ev('pointermove', 1, 160, 640);
    await sleep(2500);
  }
  // choreography: both thumbs kept moving without lifting; slow matching strokes are calm, quick scattered ones sharp
  {
    await calm();
    const wave = (x, y, ax, ay, n, per, ph) =>
      Array.from({ length: n + 1 }, (_, i) => [
        x + Math.sin((i / per) * 6.2832 + ph) * ax,
        y + Math.cos((i / per) * 6.2832 * 0.5 + ph) * ay,
      ]);
    seen = await play([
      { id: 1, pts: wave(160, 640, 40, 10, 200, 150, 0) },
      { id: 2, pts: wave(300, 620, 40, 10, 200, 150, 0), down: true, up: false },
    ]);
    const calmMood = await p.evaluate(() => {
      const m = window.__game.S.move;
      return m && m.id === 'dance' ? +m.state.mood.toFixed(2) : null;
    });
    ok(
      'dragging the right thumb starts choreography, and slow strokes keep it calm',
      seen.includes('dance') && calmMood !== null && calmMood < 0.4,
      { seen, calmMood },
    );
    await play([
      { id: 1, pts: wave(160, 640, 55, 45, 150, 14, 0) },
      { id: 2, pts: wave(300, 620, 70, 80, 220, 7, 2) },
    ]);
    const sharp = await p.evaluate(() => {
      const m = window.__game.S.move;
      return m && m.id === 'dance' ? { mood: +m.state.mood.toFixed(2), poses: m.state.poses } : null;
    });
    ok(
      'quick scattered strokes turn it sharp, without lifting',
      !!sharp && sharp.mood > 0.6 && sharp.poses >= 3,
      sharp,
    );
    const h0 = await p.evaluate(() => {
      const S = window.__game.S;
      return Math.atan2(S.vx, S.vz);
    });
    await play([
      { id: 1, pts: line(160, 640, 160, 400, 60) },
      { id: 2, pts: line(300, 620, 300, 380, 60) },
    ]);
    const dsteer = await p.evaluate(() => {
      const g = window.__game,
        S = g.S,
        r = g.input.read();
      return {
        y: +r.y.toFixed(2),
        x: +r.x.toFixed(2),
        heading: +Math.atan2(S.vx, S.vz).toFixed(2),
        move: S.move && S.move.id,
      };
    });
    ok('the left thumb steers her while she dances', dsteer.move === 'dance' && dsteer.y < -0.5, {
      from: +h0.toFixed(2),
      dsteer,
    });
    const y0 = await p.evaluate(() => window.__game.S.yawX);
    await play([{ id: 2, pts: circle(300, 420, 40, 4, 110).map((q) => [q[0] - 40, q[1]]) }]);
    const y1 = await p.evaluate(() => {
      const S = window.__game.S,
        m = S.move;
      return [S.yawX, m && m.id, m && m.state.spin, m && +m.state.rate.toFixed(1)];
    });
    ok(
      'circling the right thumb spins her inside the choreography, in a spin position',
      Math.abs(y1[0] - y0) > 5 && y1[1] === 'dance' && y1[2] > 0,
      { y0, y1 },
    );
    const g1 = await p.evaluate(() => window.__game.S.spinGain);
    await ev('pointerup', 2, 300, 420);
    await sleep(400);
    const sd = await p.evaluate(() => {
      const S = window.__game.S,
        m = S.move;
      return {
        move: m && m.id,
        held: m && m.state.held,
        yaw: S.yawX,
        ring: getComputedStyle(document.getElementById('pad')).display,
      };
    });
    await sleep(300);
    const sd2 = await p.evaluate(() => {
      const S = window.__game.S;
      return { move: S.move && S.move.id, yaw: S.yawX, gain: S.spinGain };
    });
    ok('a sustained spin winds up the thumb-to-spin ratio', g1 > 0.1, { g1 });
    ok(
      'with the thumb lifted the spin winds down by itself',
      sd.move === 'dance' &&
        sd.held === false &&
        sd.ring === 'none' &&
        (sd2.move !== 'dance' || Math.abs(sd2.yaw - sd.yaw) > 0.1),
      { sd, sd2 },
    );
    await ev('pointerdown', 2, 300, 420);
    await sleep(150);
    const rs = await p.evaluate(() => {
      const S = window.__game.S,
        m = S.move;
      return {
        move: m && m.id,
        held: m && m.state.held,
        gain: S.spinGain,
        ring: getComputedStyle(document.getElementById('pad')).display,
      };
    });
    ok(
      'the thumb coming back takes the spin up again with the ratio that was left, and the ring shows',
      rs.move === 'dance' && rs.held === true && rs.gain > 0.03 && rs.ring === 'block',
      rs,
    );
    await ev('pointerup', 2, 300, 420);
    await p.evaluate(
      () =>
        new Promise((res) => {
          const S = window.__game.S,
            t0 = Date.now();
          const iv = setInterval(() => {
            if (!S.move || Date.now() - t0 > 15000) {
              clearInterval(iv);
              res();
            }
          }, 50);
        }),
    );
    // v3-look61: it is scored as a combination once nothing more is added for CFG.choreo.window seconds (game time)
    const de = await p.evaluate(
      () =>
        new Promise((res) => {
          const g = window.__game,
            t0 = Date.now(),
            iv = setInterval(() => {
              const e = g.score.state.list[0];
              if ((e && e.choreo) || Date.now() - t0 > 30000) {
                clearInterval(iv);
                res(e ? { name: e.name, pts: e.pts, base: e.base, choreo: !!e.choreo } : null);
              }
            }, 100);
        }),
    );
    ok(
      'lifting ends the choreography, and a moment later it scores as a combination of her moves, all artistry',
      de && de.choreo && de.pts > 0.5 && de.base === 0 && de.name.length > 3,
      de,
    );
    await ev('pointermove', 1, 160, 640);
    await calm();
  }
  const card = await p.evaluate(() => {
    const e = window.__game.score.state.list[0];
    return {
      name: e.name,
      base: e.base,
      goe: e.goe,
      art: e.art,
      pts: e.pts,
      cells: document.querySelectorAll('#pop .cards div').length,
      name2: (document.querySelector('#pop .pname') || {}).textContent,
      sub: document.getElementById('sub').textContent,
      best: window.__game.score.state.best.pts,
    };
  });
  ok(
    'an action gets a score card, choreography scores without one (v3-look70), and the best action is tracked',
    card.cells === 4 &&
      card.name2 !== card.name &&
      !!card.name2 &&
      Math.abs(card.base + card.goe + card.art - card.pts) < 0.11 &&
      /Best jump/.test(card.sub) &&
      card.best >= card.pts,
    card,
  );
  // a fresh steering thumb
  await ev('pointerup', 1, 160, 640);
  await sleep(300);
  await ev('pointerdown', 1, 100, 640);
  await ev('pointermove', 1, 160, 640);
  await sleep(2500);
  // a finger kept down through a jump: she dances on from the landing until it lifts
  {
    await tap(2, 300, 560);
    await sleep(120);
    await ev('pointerdown', 2, 336, 560);
    const al = await p.evaluate(
      () =>
        new Promise((res) => {
          const S = window.__game.S;
          let air = false;
          const iv = setInterval(() => {
            if (!S.grounded) air = true;
            if (air && S.grounded && S.move && S.move.id === 'dance') {
              clearInterval(iv);
              res({ air, move: 'dance', landT: +S.landT.toFixed(2) });
            }
          }, 30);
          setTimeout(() => {
            clearInterval(iv);
            res({ air, move: S.move && S.move.id, timeout: true });
          }, 9000);
        }),
    );
    ok(
      'a finger kept down through a jump starts choreography after the landing',
      al.air && al.move === 'dance' && !al.timeout,
      al,
    );
    await ev('pointerup', 2, 336, 560);
    await sleep(1500);
    s = await st();
    ok('lifting it ends the choreography', s.move === null, s);
    await sleep(2500);
  }
  // bad landing -> fall -> back up
  await ev('pointermove', 1, 220, 590);
  await sleep(3500);
  await p.evaluate(() => {
    const g = window.__game;
    g.game.jump();
    g.game.airRotate(1.25 * 6.2832);
  });
  await sleep(1800);
  s = await st();
  ok('a quarter-turn-off landing is a fall', /fall/i.test(s.pop) && s.move === 'fall', s);
  await sleep(1500);
  s = await st();
  ok('she gets back up', s.move === null, s);
  const bo = await p.evaluate(
    () =>
      new Promise((res) => {
        const g = window.__game,
          S = g.S;
        S.x += 400;
        S.fallEndT = S.clock - 10;
        g.game.jump();
        g.game.airRotate(2 * 6.2832);
        const iv = setInterval(() => {
          if (S.grounded) {
            clearInterval(iv);
            const bonus = S.bonus;
            g.game.jump();
            g.game.airRotate(1.25 * 6.2832);
            const iv2 = setInterval(() => {
              if (S.grounded) {
                clearInterval(iv2);
                const afterFall = S.bonus;
                setTimeout(() => {
                  const b1 = S.boostT;
                  g.game.jump();
                  g.game.airRotate(1.25 * 6.2832);
                  const iv3 = setInterval(() => {
                    if (S.grounded && !S.move) {
                      clearInterval(iv3);
                      res({ bonus, afterFall, firstBoost: b1 > 0, secondBoost: S.boostT > 0 });
                    }
                  }, 30);
                }, 1500);
              }
            }, 30);
          }
        }, 30);
      }),
  );
  ok(
    'a clean double raises top speed, a fall loses it, and a second quick fall gets no boost',
    bo.bonus > 0.5 && bo.afterFall === 0 && bo.firstBoost && !bo.secondBoost,
    bo,
  );
  await sleep(1500);
  // one-finger double tap with no steering finger
  await ev('pointerup', 1, 220, 590);
  await sleep(700);
  const j0 = (await st()).jumps;
  await tap(5, 200, 500);
  await sleep(120);
  await ev('pointerdown', 6, 200, 500);
  await sleep(150);
  s = await st();
  ok('one-finger double tap jumps', s.jumps === j0 + 1, s);
  await ev('pointerup', 6, 200, 500);
  await sleep(1500);
  await p.evaluate(() => {
    const w = window.__game.world;
    w.render = w._render;
  });
  // islands: land appears, and she cannot skate onto it
  const isl = await p.evaluate(
    () =>
      new Promise((res) => {
        const g = window.__game;
        g.setPlace(1);
        setTimeout(() => {
          let t = null,
            at = null;
          for (let i = -60; i <= 60 && !t; i++)
            for (let j = -60; j <= 60 && !t; j++) {
              t = g.forest.hit(g.S.x + i * 10, g.S.z + j * 10);
              if (t) at = [g.S.x + i * 10, g.S.z + j * 10];
            }
          if (!t) return res({ land: false });
          g.S.x = at[0];
          g.S.z = at[1];
          const t0 = performance.now();
          let frames = 0;
          const wait = () => {
            frames++;
            const on = !!g.forest.hit(g.S.x, g.S.z);
            if (on && performance.now() - t0 < 8000) return requestAnimationFrame(wait);
            res({ land: true, stillOnLand: on, fell: g.S.move ? g.S.move.id : null, frames });
          };
          requestAnimationFrame(wait);
        }, 300);
      }),
  );
  ok(
    'islands exist and the shore keeps her on the ice without a fall',
    isl.land && !isl.stillOnLand && isl.fell !== 'fall',
    isl,
  );
  await p.evaluate(() => window.__game.setPlace(0));
  await sleep(1500);
  // zoom + pinch
  await p.tap('#zoom');
  await sleep(2500);
  await ev('pointerdown', 1, 150, 480);
  await ev('pointerdown', 2, 240, 480);
  for (let i = 1; i <= 10; i++) {
    await ev('pointermove', 1, 150 - i * 5, 480);
    await ev('pointermove', 2, 240 + i * 5, 480);
    await sleep(30);
  }
  const zf = await p.evaluate(() => window.__game.view.zf);
  ok('pinch zooms the overview', zf > 1.5, zf);
  await ev('pointerup', 2, 290, 480);
  await ev('pointerup', 1, 100, 480);
  await sleep(800);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'v2_zoom.png') });
  ok(
    'zooming out pauses and shows the scoreboard',
    await p.evaluate(
      () => document.body.classList.contains('paused') && document.querySelectorAll('#blist .row').length > 3,
    ),
  );
  const x0 = await p.evaluate(() => window.__game.S.x + window.__game.S.z);
  await sleep(400);
  ok('nothing moves while paused', x0 === (await p.evaluate(() => window.__game.S.x + window.__game.S.z)));
  await p.tap('#zoom');
  await sleep(2000);
  // the canyon has no overview: Scores pauses on the scoreboard over the view as it was, which is then left undrawn
  {
    const was = await p.evaluate(() => {
      const g = window.__game,
        S = g.S,
        was = [S.x, S.z, S.vx, S.vz];
      g.setPlace(4);
      return was;
    });
    await sleep(1000);
    await p.tap('#zoom');
    await sleep(2500);
    await ev('pointerdown', 1, 150, 480);
    await ev('pointerdown', 2, 240, 480);
    for (let i = 1; i <= 10; i++) {
      await ev('pointermove', 1, 150 - i * 5, 480);
      await ev('pointermove', 2, 240 + i * 5, 480);
      await sleep(30);
    }
    await ev('pointerup', 2, 290, 480);
    await ev('pointerup', 1, 100, 480);
    const st = await p.evaluate(async () => {
      const g = window.__game,
        f0 = g.world.renderer.info.render.frame;
      await new Promise((r) => setTimeout(r, 600));
      return {
        e: g.view.e,
        zoomed: g.view.zoomed,
        zf: g.view.zf,
        still: document.body.classList.contains('still') && document.body.classList.contains('paused'),
        drawn: g.world.renderer.info.render.frame - f0,
        foot: document.getElementById('bfoot').textContent,
      };
    });
    ok(
      'in the canyon Scores shows the scoreboard without zooming out, and stops drawing',
      st.e < 0.02 && st.zoomed && st.zf === 1 && st.still && st.drawn === 0 && !/pinch/.test(st.foot),
      st,
    );
    await p.tap('#zoom');
    await sleep(800);
    const back = await p.evaluate((was) => {
      const g = window.__game,
        S = g.S,
        f0 = g.world.renderer.info.render.frame;
      const r = { zoomed: g.view.zoomed, still: document.body.classList.contains('still') };
      g.setPlace(0);
      [S.x, S.z, S.vx, S.vz] = was;
      return new Promise((res) =>
        setTimeout(() => res(Object.assign(r, { drawn: g.world.renderer.info.render.frame - f0 })), 500),
      );
    }, was);
    ok('and Skate goes back to skating and drawing', !back.zoomed && !back.still && back.drawn > 0, back);
    await sleep(1000);
  }
  // menu + log
  await p.tap('#menu');
  await sleep(300);
  const count = await p.evaluate(() => document.getElementById('logcount').textContent);
  ok('menu shows the log counts', /touches/.test(count), count);
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'v2_menu.png') });
  const logObj = JSON.parse(await p.evaluate(() => window.__game.log.text()));
  ok(
    'log recorded strokes with what they were read as',
    logObj.strokes.length >= 5 &&
      logObj.strokes.some((x) => x.read === 'jump') &&
      logObj.strokes.some((x) => x.read === 'right') &&
      logObj.strokes.some((x) => x.read === 'twirl') &&
      logObj.strokes.some((x) => x.two && x.left) &&
      logObj.strokes.some((x) => x.read === 'tap'),
    logObj.strokes.map((x) => x.read),
  );
  ok(
    'log recorded jumps with finger turns and grade',
    logObj.jumps.length >= 2 && logObj.jumps[0].fingerTurns > 0.5,
    logObj.jumps[0],
  );
  ok('log recorded frame rate', logObj.fps.length > 0, logObj.fps.slice(0, 3));
  console.log('log size', JSON.stringify(logObj).length, 'bytes');
  await p.tap('#copy');
  await sleep(300);
  {
    const cp = await p.evaluate(() => ({
      status: document.getElementById('logstatus').textContent,
      send: !!document.getElementById('send'),
    }));
    // headless Chrome may refuse the clipboard; either answer means the button works
    ok("Copy log is the menu's log button, and it answers", !cp.send && /Copied|blocked/.test(cp.status), cp);
  }
  await p.tap('#movesbtn');
  await sleep(200);
  ok(
    'the Moves button opens the move list',
    await p.evaluate(() => !document.getElementById('pg-moves').hidden && document.getElementById('pg-home').hidden),
  );
  await p.tap('#back');
  await sleep(200);
  ok('back returns to the menu home', await p.evaluate(() => !document.getElementById('pg-home').hidden));
  await p.mouse.click(195, 30);
  await sleep(300);
  ok(
    'tapping outside the card closes the menu',
    await p.evaluate(() => document.getElementById('sheet').style.display === 'none'),
  );
  // the front page: Menu > Front page opens it (paused); Tutorial mode lists every step of a skill at once
  await p.tap('#menu');
  await sleep(200);
  await p.tap('#homebtn');
  await sleep(200);
  const fr = await p.evaluate(() => ({
    open: window.__game.front.open,
    shown: !document.getElementById('front').hidden,
    sheet: document.getElementById('sheet').style.display,
    rows: ['fchar', 'fplace', 'ftime', 'fmode'].map((id) =>
      [...document.getElementById(id).children].map((b) => b.textContent),
    ),
  }));
  ok(
    'Menu > Front page shows the skater, place, time and mode choices',
    fr.open &&
      fr.shown &&
      fr.sheet === 'none' &&
      fr.rows[0].join() === 'Tesa,Ivor,Rook,Bjorn,Lumi,Seolhwa' &&
      fr.rows[1].join() === 'Open lake,Islands,Paper,Rolling ice,Tunnel' &&
      fr.rows[2].join() === 'Dawn,Day,Dusk' &&
      fr.rows[3].join() === 'Olympic,Infinite,Tutorial',
    fr,
  );
  {
    const x0 = await p.evaluate(() => window.__game.S.x);
    await sleep(400);
    ok('nothing moves on the front page', (await p.evaluate(() => window.__game.S.x)) === x0);
  }
  {
    // v3-look40: she is framed whole below the status bar and above the title; a drag across the scene turns her
    // round and brings out a gesture, a flick spins her
    await p.waitForFunction(() => window.__game.world.showing > 0.98, null, { timeout: 30000 });
    await sleep(300);
    const fp = await p.evaluate(() => {
      const g = window.__game,
        c = g.world.camera,
        V = c.position.constructor,
        S = g.S,
        y = (h) => ((1 - new V(S.x, h, S.z).project(c).y) / 2) * innerHeight;
      return {
        head: Math.round(y(1.75)),
        blades: Math.round(y(0)),
        top: parseFloat(getComputedStyle(document.getElementById('front')).paddingTop),
        title: Math.round(document.querySelector('#fcard h1').getBoundingClientRect().top),
      };
    });
    ok(
      'the front page shows her whole, below the status bar and down to the title',
      fp.head > fp.top + 30 && fp.blades < fp.title + 40 && fp.blades - fp.head > 150,
      fp,
    );
    const tp = (type, x, y) =>
      p.evaluate(
        ([type, x, y]) =>
          document
            .getElementById('front')
            .dispatchEvent(
              new PointerEvent(type, { pointerId: 9, clientX: x, clientY: y, pointerType: 'touch', bubbles: true }),
            ),
        [type, x, y],
      );
    const f0 = await p.evaluate(() => window.__game.S.facing);
    await tp('pointerdown', 100, 200);
    for (let k = 1; k <= 12; k++) {
      await tp('pointermove', 100 + k * 8, 200);
      await sleep(60);
    }
    await p.waitForFunction(() => window.__game.showcase.state().mode === 'turn', null, { timeout: 5000 });
    const s1 = await p.evaluate(() => window.__game.showcase.state());
    await tp('pointerup', 196, 200);
    ok(
      'dragging across the scene turns her round, and she starts a gesture',
      Math.abs(s1.facing - f0 - 96 * 0.012) < 0.05 && s1.mode === 'turn' && s1.gesture === 'wave',
      s1,
    );
    await tp('pointerdown', 60, 200);
    for (let k = 1; k <= 5; k++) await tp('pointermove', 60 + k * 50, 200);
    await tp('pointerup', 310, 200);
    await p.waitForFunction(() => window.__game.showcase.state().mode === 'spin', null, { timeout: 5000 });
    const s2 = await p.evaluate(() => ({
      ...window.__game.showcase.state(),
      hint: document.getElementById('fturn').classList.contains('gone'),
    }));
    ok('a flick spins her into a spin position, and the drag hint goes', s2.w > 6 && s2.hint, s2);
  }
  await p.evaluate(() => [...document.getElementById('fmode').children][2].click());
  await sleep(100);
  await p.tap('#fstart');
  await sleep(250);
  ok('Start stops the turntable', await p.evaluate(() => window.__game.showcase.state().w === 0));
  let tu = await p.evaluate(() => ({
    front: window.__game.front.open,
    on: window.__game.tutorial.on,
    jumpOn: document.getElementById('tutjump').classList.contains('on'),
    sel: !document.getElementById('tsel').hidden,
    name: document.getElementById('tname').textContent,
    steps: [...document.getElementById('tlist').children].map((li) => [li.className, li.textContent]),
    forgiving: window.__game.S.forgiving,
  }));
  ok(
    'Tutorial mode: Jumps open with a skill selector, every step listed and the first one current, and no falls',
    !tu.front &&
      tu.on &&
      tu.jumpOn &&
      tu.sel &&
      tu.name === 'Waltz jump' &&
      tu.steps.length === 2 &&
      tu.steps[0][0] === 'now' &&
      tu.steps[1][0] === '' &&
      tu.forgiving,
    tu,
  );
  await p.tap('#tnext');
  await sleep(150);
  ok(
    'the arrow moves to the next skill',
    (await p.evaluate(() => document.getElementById('tname').textContent)) === 'Axel',
  );
  await p.tap('#tutspin');
  await sleep(150);
  tu = await p.evaluate(() => ({
    name: document.getElementById('tname').textContent,
    steps: [...document.getElementById('tlist').children].map((li) => [li.className, li.textContent]),
  }));
  ok(
    'Spins & steps lists spins first, all five steps of Twizzles at once',
    tu.name === 'Twizzles' && tu.steps.length === 5 && /left thumb/i.test(tu.steps[0][1]),
    tu,
  );
  await ev('pointerdown', 1, 100, 560);
  await ev('pointermove', 1, 104, 520);
  // she has to reach 2.5 m/s, which takes longer in wall time when the headless page draws slowly (a fixed 1.5 s wait
  // failed now and then), so wait for the tick
  await p
    .waitForFunction(() => document.querySelector('#tlist li').className === 'done', null, { timeout: 8000 })
    .catch(() => {});
  tu = await p.evaluate(() => [...document.getElementById('tlist').children].map((li) => li.className));
  ok('a step passes: it is ticked off and the next one is current', tu[0] === 'done' && tu[1] === 'now', tu);
  await ev('pointerup', 1, 104, 520);
  await sleep(300);
  // back to Olympic: the tutorial goes away
  await p.evaluate(() => window.__game.setPlay(0));
  await sleep(100);
  ok(
    'leaving Tutorial mode closes the tutorial',
    await p.evaluate(
      () =>
        document.getElementById('tut').hidden && document.getElementById('tsel').hidden && !window.__game.tutorial.on,
    ),
  );
  // the published version file must name the build that is running, or Home Screen copies would keep reloading
  await p.tap('#menu');
  await sleep(200);
  const bn = await p.evaluate(() => document.getElementById('buildname').textContent),
    vf = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'version.json'), 'utf8'));
  ok(
    'the menu shows the build, and version.json names the same one (run npm run stamp)',
    bn.includes('Build ' + vf.build) && vf.files.includes('js/main.js'),
    { menu: bn, file: vf.build },
  );
  await p.tap('#update');
  await sleep(600);
  const up = await p.evaluate(() => document.getElementById('buildname').textContent);
  ok('Update says it is up to date when nothing newer is published', /up to date/.test(up), up);
  await p.tap('#modebtn');
  const mn = await p.evaluate(() => [document.getElementById('modename').textContent, window.__game.modeIx]);
  ok('the menu switches the way to play', mn[0] === 'Jump park' && mn[1] === 1, mn);
  await p.tap('#close');
  await sleep(150);
  // ways to play (from a standstill her own jump reaches about 1 m, so a launch must clear 1.7 m)
  const until = (fn, ms) =>
    p.evaluate(
      ([src, ms]) =>
        new Promise((res) => {
          const f = new Function('g', 'return (' + src + ')(g)'),
            t0 = performance.now();
          const iv = setInterval(() => {
            const v = f(window.__game);
            if (v || performance.now() - t0 > ms) {
              clearInterval(iv);
              res(v || null);
            }
          }, 30);
        }),
      [fn.toString(), ms],
    );
  await until((g) => g.S.grounded && !g.S.move, 6000);
  {
    const j0 = await p.evaluate(() => {
      const g = window.__game,
        S = g.S,
        pad = g.modes[1].pads()[4];
      S.x = pad[0];
      S.z = pad[1];
      return S.jumps;
    });
    const up = await until((g) => !g.S.grounded && { vy: g.S.vy, jumps: g.S.jumps }, 1500),
      top = await until((g) => g.S.vy < 0 && { y: g.S.y }, 4000);
    ok('Jump park: a pad launches her higher than her own jump', !!up && up.jumps === j0 + 1 && !!top && top.y > 1.7, {
      up,
      top,
    });
    await until((g) => g.S.grounded && !g.S.move, 8000);
  }
  {
    await p.evaluate(() => {
      const g = window.__game;
      g.setMode(2);
      const c = g.modes[2].course,
        o = c.origin,
        S = g.S;
      g.input.setAuto({ x: Math.sin(o.h), y: Math.cos(o.h) });
      S.vx = Math.sin(o.h) * 6;
      S.vz = Math.cos(o.h) * 6;
    });
    const run = await until((g) => g.modes[2].course.state === 'run', 9000);
    const coin = await p.evaluate(
      () =>
        new Promise((res) => {
          const g = window.__game,
            c = g.modes[2].course,
            o = c.origin,
            it = c.items.filter((i) => i.kind === 'coin')[3],
            S = g.S;
          S.x = o.x + Math.sin(o.h) * it.f + Math.cos(o.h) * it.s;
          S.z = o.z + Math.cos(o.h) * it.f - Math.sin(o.h) * it.s;
          setTimeout(() => res(g.modes[2].course.got), 300);
        }),
    );
    await p.evaluate(() => {
      const g = window.__game,
        c = g.modes[2].course,
        o = c.origin,
        S = g.S;
      S.x = o.x + Math.sin(o.h) * (c.finish - 2);
      S.z = o.z + Math.cos(o.h) * (c.finish - 2);
    });
    const fin = await until(
      (g) =>
        g.modes[2].course.state === 'done' && {
          name: g.score.state.list[0].name,
          pts: g.score.state.list[0].pts,
          line: document.getElementById('modeline').textContent,
        },
      6000,
    );
    ok(
      'Race: the clock starts at the gate, coins are collected, and finishing scores',
      !!run && coin >= 1 && !!fin && /Coin trail finished/.test(fin.name) && fin.pts > 0 && /coins/.test(fin.line),
      { run, coin, fin },
    );
  }
  {
    await p.evaluate(() => window.__game.setMode(3));
    await sleep(1200);
    const du = await p.evaluate(() => {
      const g = window.__game,
        q = g.modes[3].partner;
      return { gap: +Math.hypot(q.x - g.S.x, q.z - g.S.z).toFixed(2), visible: q.visible, who: q.who };
    });
    ok('Duet: the other skater keeps beside her', du.visible && du.who === 1 && du.gap > 1 && du.gap < 4.5, du);
    await p.evaluate(() => {
      window.__game.setMode(0);
      window.__game.input.setAuto(null);
    });
    const off = await p.evaluate(() => window.__game.modes[3].partner.visible);
    ok(
      'back in Free skate the partner and the course are gone',
      off === false && (await p.evaluate(() => document.getElementById('modeline').textContent)) === '',
      off,
    );
  }
  // the score chip and the buttons
  {
    const ui = await p.evaluate(() => ({
      tlab: document.getElementById('tlab').textContent,
      zoom: document.getElementById('zoom').textContent,
    }));
    ok('the total is labelled, and the pause button says Scores', ui.tlab === 'Total' && ui.zoom === 'Scores', ui);
    await p.tap('#zoom');
    await sleep(300);
    const paused = await p.evaluate(() => document.getElementById('zoom').textContent);
    await p.tap('#zoom');
    await sleep(300);
    ok('paused, it says Skate', paused === 'Skate', paused);
  }
  // Infinite: no falls, each score one big number over Base, GOE and Art, and no limit on the total
  {
    await p.evaluate(() => window.__game.setPlay(1));
    await until((g) => g.S.grounded && !g.S.move, 6000);
    await p.evaluate(() => {
      const g = window.__game;
      g.S.vz = 6;
      g.game.jump();
      g.game.airRotate(Math.PI * 0.5);
    });
    const st = await until((g) => g.S.grounded && g.S.move && { move: g.S.move.id, falls: g.score.state.falls }, 4000);
    ok(
      'Infinite: a quarter-turn-off landing is a stumble, not a fall',
      !!st && st.move === 'stumble' && st.falls === 0,
      st,
    );
    await until((g) => !g.S.move, 3000);
    await p.evaluate(() =>
      window.__game.game.emit('element', { kind: 'turn', name: 'Three-turn', detail: '', base: 0.3 }),
    );
    await sleep(100);
    const pop = await p.evaluate(() => {
      const el = document.getElementById('pop');
      return {
        inf: el.classList.contains('inf'),
        desc: el.querySelector('.pdesc') && el.querySelector('.pdesc').textContent,
        big: !!el.querySelector('.ptotal'),
        cards: [...el.querySelectorAll('.cards span')].map((s) => s.textContent),
        name: !!el.querySelector('.pname'),
      };
    });
    ok(
      'Infinite: the score card describes the move over Base, GOE and Art, with no big number',
      pop.inf && pop.desc === 'Three-turn' && pop.cards.join() === 'Base,GOE,Art' && !pop.name && !pop.big,
      pop,
    );
    await p.evaluate(() => {
      const g = window.__game;
      g.score.state.total = 123456.7;
      g.game.emit('element', { kind: 'leap', name: 'Split leap', detail: '', base: 0.6 });
    });
    await sleep(1500);
    const tot = await p.evaluate(() => document.getElementById('total').textContent);
    ok('Infinite: the total has no limit', parseFloat(tot) > 120000, tot);
    await p.evaluate(() => window.__game.setPlay(0));
    await sleep(1200);
    const olympic = await p.evaluate(() => ({
      total: document.getElementById('total').textContent,
      forgiving: window.__game.S.forgiving,
    }));
    ok(
      'Olympic keeps its own score, up to 9999.9, and falls again',
      parseFloat(olympic.total) <= 9999.9 && !olympic.forgiving,
      olympic,
    );
  }
  // paper: a blank sheet for each time of day, with its own line
  {
    const sheets = await p.evaluate(async () => {
      const g = window.__game,
        out = [];
      g.setPlace(2);
      for (let i = 0; i < 3; i++) {
        g.setLook(i);
        await new Promise((r) => setTimeout(r, 120));
        out.push({
          look: g.CFG.looks[i].name,
          ink: g.world.paper && g.world.paper.ink,
          ice: g.world.ice.mesh.visible,
          night: document.body.classList.contains('night'),
        });
      }
      g.setLook(1);
      g.setPlace(0);
      return out;
    });
    ok(
      'Paper: pencil on tan at dawn, a pen on white by day, glowing lines on black at dusk; no ice',
      sheets.map((x) => x.ink).join() === 'pencil,pen,glow' &&
        sheets.every((x) => !x.ice) &&
        sheets.map((x) => x.night).join() === 'false,false,true',
      sheets,
    );
  }
  // Ivor (v3-look72): a superhero's build (wide at the shoulders, narrow at the waist), a sculpted beard that rides on
  // his head and does not move by itself, and the changing camera angles (Menu > View)
  {
    await p.evaluate(() => window.__game.setChar(1));
    await until((g) => g.avatars[1], 20000);
    await sleep(800);
    const iv = await p.evaluate(() => {
      const g = window.__game,
        a = g.avatars[1];
      let beard = null;
      a.root.traverse((o) => {
        if (o.userData.triangles) beard = o;
      });
      // the beard's place on his head: the same before and after a second of skating
      const head = (v) => (beard.parent.updateMatrixWorld(true), beard.parent.worldToLocal(v));
      const THREE = g.world.camera.position.constructor;
      const at = () => head(beard.children[0].getWorldPosition(new THREE()));
      return {
        name: document.getElementById('charname').textContent,
        real: a.visible,
        triangles: beard ? beard.userData.triangles : 0,
        onHead: beard ? beard.parent.name : null,
        still: beard ? at().distanceTo(at()) : null,
      };
    });
    ok(
      'Ivor: his body loads with a sculpted beard on his head',
      iv.name === 'Ivor' && iv.real && iv.triangles > 2000 && /Head/.test(iv.onHead) && iv.still < 1e-6,
      iv,
    );
    const ang = await p.evaluate(() => {
      const w = window.__game.world,
        i0 = w.angles.index;
      w.angles.next();
      return { on: w.angles.on, i0, label: document.getElementById('viewname').textContent };
    });
    await sleep(600);
    const ang2 = await p.evaluate(() => window.__game.world.angles.index);
    await p.evaluate(() => document.getElementById('viewbtn').click());
    const off = await p.evaluate(() => ({
      on: window.__game.world.angles.on,
      label: document.getElementById('viewname').textContent,
    }));
    await p.evaluate(() => document.getElementById('viewbtn').click());
    ok(
      'View: the angle moves on to the next, and the menu switches it to Fixed and back',
      ang.on && ang.label === 'Changing' && ang2 === (ang.i0 + 1) % 4 && !off.on && off.label === 'Fixed',
      { ang, ang2, off },
    );
    await p.evaluate(() => window.__game.setChar(0));
  }
  // Rook, the hockey player, and his stick
  {
    await p.evaluate(() => window.__game.setChar(2));
    await until((g) => g.avatars[2], 20000);
    await sleep(800);
    const rk = await p.evaluate(() => {
      const g = window.__game,
        st = g.stick.group;
      st.updateMatrixWorld(true);
      const v = st.position.clone();
      let low = Infinity;
      st.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) low = Math.min(low, v.set(x, y, z).applyMatrix4(o.matrixWorld).y);
      });
      return {
        name: document.getElementById('charname').textContent,
        stick: st.visible,
        real: !!g.avatars[2] && g.avatars[2].visible,
        low: +low.toFixed(3),
        hockey: g.S.hockey,
      };
    });
    ok(
      'Rook: his body loads, his stick shows, and its blade rests on the ice, not through it',
      rk.name === 'Rook' && rk.stick && rk.real && rk.hockey && rk.low > -0.03 && rk.low < 0.15,
      rk,
    );
    await p.evaluate(() => window.__game.setChar(0));
    ok('back to Tesa, the stick is gone', !(await p.evaluate(() => window.__game.stick.group.visible)));
  }
  // Lumi and Seolhwa, on Tesa's body (v3-look71). Seolhwa's sleeves lie at her hands, are let out long as she spins and
  // drawn back when the spin is over. The body is stepped here: the headless run is too slow to wait for a spin.
  {
    await p.evaluate(() => window.__game.setChar(4));
    await until((g) => g.avatars[4], 20000);
    await sleep(500);
    const lm = await p.evaluate(() => {
      const g = window.__game;
      return {
        name: document.getElementById('charname').textContent,
        real: !!g.avatars[4] && g.avatars[4].visible,
        layback: g.S.layback,
      };
    });
    ok('Lumi: her body loads', lm.name === 'Lumi' && lm.real && lm.layback, lm);
    await p.evaluate(() => window.__game.setChar(5));
    await until((g) => g.avatars[5], 20000);
    await sleep(500);
    const sl = await p.evaluate(() => {
      const g = window.__game,
        a = g.avatars[5],
        S = g.S,
        rb = a.ribbons[0],
        n = rb.n;
      // how long the sleeve is now: along its chain, from her wrist to its end
      const long = () => {
        const q = rb.points;
        let l = 0;
        for (let i = 3; i < n * 3; i += 3) l += Math.hypot(q[i] - q[i - 3], q[i + 1] - q[i - 2], q[i + 2] - q[i - 1]);
        return +l.toFixed(3);
      };
      const run = (k, spin) => {
        for (let i = 0; i < k; i++) a.update(1 / 30, S, spin, spin);
      };
      run(90, 0);
      const rest = long();
      run(90, 1);
      const out = +a.sleeves.toFixed(3),
        full = long();
      run(150, 0);
      return {
        name: document.getElementById('charname').textContent,
        real: a.visible,
        ribbons: a.ribbons.length,
        rest,
        full,
        out,
        back: long(),
        after: +a.sleeves.toFixed(3),
        finite: Array.from(rb.points).every(Number.isFinite),
      };
    });
    ok(
      'Seolhwa: her sleeves end at her hands, are let out long in a spin, and draw back after it',
      sl.name === 'Seolhwa' &&
        sl.real &&
        sl.ribbons === 5 &&
        sl.finite &&
        sl.rest < 0.3 &&
        sl.full > 1.4 &&
        sl.out > 0.95 &&
        sl.back < 0.35 &&
        sl.after < 0.05,
      sl,
    );
    await p.evaluate(() => window.__game.setChar(0));
  }
  // portrait (this page is 390 x 844): the view pulls back as she speeds up, and comes back in as she slows
  {
    const height = () => p.evaluate(() => window.__game.world.camera.position.y);
    const hold = (v) =>
      p.evaluate((v) => {
        const g = window.__game,
          S = g.S,
          h = Math.atan2(S.vx, S.vz) || 0;
        g.input.setAuto(v ? { x: Math.sin(h), y: Math.cos(h) } : { x: 0, y: 0 });
        S.vx = Math.sin(h) * v;
        S.vz = Math.cos(h) * v;
      }, v);
    await hold(0);
    await sleep(4000);
    const slow = await height();
    await hold(14);
    await sleep(5000);
    const fast = await height();
    await hold(0);
    await sleep(5000);
    const back = await height();
    await p.evaluate(() => window.__game.input.setAuto(null));
    ok(
      'portrait: the view pulls back at speed and comes back in as she slows',
      fast > slow * 1.4 && back < fast * 0.8,
      { slow: +slow.toFixed(1), fast: +fast.toFixed(1), back: +back.toFixed(1) },
    );
  }
  ok('no errors during the run', errs.length === 0, errs);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
