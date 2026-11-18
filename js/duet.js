// Duet: a second skater, run by the game, keeps beside her and does what she does a moment later.
// The partner is Tesa, or Ivor when the player is Tesa (never Rook, whose stick follows only the player). It has its own
// simple figure, and its realistic body loads the first time it is needed.
import { CFG } from './config.js';
import { createModels } from './render/model.js';
import { createPoser } from './render/poses.js';

const COPY = [
  'x',
  'y',
  'z',
  'vx',
  'vz',
  'vy',
  'grounded',
  'facing',
  'back',
  'spin',
  'goal',
  'landT',
  'turn',
  'boostT',
  'move',
  'yawX',
  'flipYaw',
  'visY',
  'mag',
  'push',
  'airT',
];

// loadBody(models, index, onReady) starts loading a realistic body onto the partner's figure
export function createDuet(scene, game, loadBody) {
  const K = CFG.modes.duet,
    S = game.S,
    models = createModels(scene),
    pose = createPoser(models),
    bodies = [null, null, null],
    asked = [false, false, false];
  const partnerOf = (playerIx) => (playerIx === 0 ? 1 : 0);
  const P = { phase: 1.7 },
    trail = [];
  let on = false,
    who = -1,
    yaw = 0,
    clock = 0,
    night = 0;
  const like = { S: P, speed: () => Math.hypot(P.vx || 0, P.vz || 0), yaw: () => yaw };
  models.hero.visible = false;
  const show = () => {
    models.hero.visible = on;
    bodies.forEach((b, i) => {
      if (b) b.visible = on && i === who;
    });
    const real = on && !!bodies[who];
    models.chars.forEach((c, i) =>
      c.inner.traverse((m) => {
        if (m.isMesh) m.visible = i === who && !real;
      }),
    );
  };
  function setWho(i) {
    if (i === who) return;
    who = i;
    models.setChar(i);
    show();
    if (on && !asked[i]) {
      asked[i] = true;
      loadBody(models, i, (b) => {
        bodies[i] = b;
        b.night(night);
        show();
      });
    }
  }
  return {
    name: 'Duet',
    hint: 'Your partner skates beside you and follows your moves.',
    on(playerIx) {
      on = true;
      trail.length = 0;
      who = -1;
      setWho(partnerOf(playerIx));
      show();
    },
    off() {
      on = false;
      show();
    },
    line: () => '',
    get partner() {
      return {
        x: models.hero.position.x,
        z: models.hero.position.z,
        y: models.hero.position.y,
        who,
        real: !!bodies[who],
        visible: models.hero.visible,
      };
    },
    night(k) {
      night = k;
      bodies.forEach((b) => b && b.night(k));
    },
    update(dt, now, playerIx, reflect, time) {
      if (!on) return;
      setWho(partnerOf(playerIx));
      clock += dt;
      // remember where she was and what she was doing; the partner lives a moment in her past
      const snap = { t: clock, yaw: game.yaw() };
      for (const k of COPY) snap[k] = S[k];
      trail.push(snap);
      while (trail.length > 2 && trail[1].t <= clock - K.delay) trail.shift();
      const q = trail[0];
      for (const k of COPY) P[k] = q[k];
      yaw = q.yaw;
      const side = K.beside * models.rig.scale,
        ahead = (clock - q.t) * K.keepUp;
      P.x += Math.cos(q.facing) * side + q.vx * ahead;
      P.z += -Math.sin(q.facing) * side + q.vz * ahead;
      pose(like, dt, now);
      const b = bodies[who];
      if (b && b.visible) {
        const rate =
          (P.move && P.move.spinRate ? P.move.spinRate() : 0) + (P.grounded ? 0 : Math.abs(P.goal - P.spin) * 20);
        b.reflection(reflect, 0.26);
        b.update(dt, P, Math.min(1, rate / 18 + like.speed() * 0.02), Math.min(1, rate / 18));
      }
    },
  };
}
