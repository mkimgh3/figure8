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
    const de = await p.evaluate(() => {
      const g = window.__game,
        e = g.score.state.list[0];
      return { name: e.name, pts: e.pts, move: g.S.move && g.S.move.id };
    });
    ok(
      'lifting ends the choreography and it scores',
      de.name === 'Choreography' && de.pts > 0.5 && de.move === null,
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
    'each action gets a score card and the best action is tracked',
    card.cells === 4 &&
      card.name2 === card.name &&
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
  await p.tap('#send');
  await sleep(600);
  ok(
    'send falls back cleanly when Claude storage is absent',
    /Copy log/.test(await p.evaluate(() => document.getElementById('logstatus').textContent)),
  );
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
  // tutorial: the pill splits, the selector moves, a step passes, the active category again turns it off
  await p.tap('#tutbtn');
  await sleep(200);
  let tu = await p.evaluate(() => ({
    jumpOn: document.getElementById('tutjump').classList.contains('on'),
    sel: !document.getElementById('tsel').hidden,
    single: document.getElementById('tutbtn').hidden,
    name: document.getElementById('tname').textContent,
    step: document.getElementById('tstep').textContent,
  }));
  ok(
    'Tutorial splits into Jumps and Spins & steps, with a skill selector and a first step',
    tu.jumpOn && tu.sel && tu.single && tu.name === 'Waltz jump' && tu.step.length > 10,
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
  ok(
    'Spins & steps lists spins first',
    (await p.evaluate(() => document.getElementById('tname').textContent)) === 'Twizzles',
  );
  await ev('pointerdown', 1, 100, 560);
  await ev('pointermove', 1, 104, 520);
  await sleep(500);
  await ev('pointerdown', 2, 300, 560);
  await sleep(500);
  tu = await p.evaluate(() => document.getElementById('tstep').textContent);
  ok('the first step of the skill is shown', /left thumb/i.test(tu), tu);
  await ev('pointerup', 2, 300, 560);
  await ev('pointerup', 1, 104, 520);
  await sleep(400);
  await p.tap('#tutspin');
  await sleep(150);
  ok(
    'tapping the active category ends tutorial mode',
    await p.evaluate(
      () =>
        !document.getElementById('tutbtn').hidden &&
        document.getElementById('tsel').hidden &&
        !window.__game.tutorial.on,
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
  ok('no errors during the run', errs.length === 0, errs);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  await b.close();
  process.exit(failed ? 1 : 0);
})();
