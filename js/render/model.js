// The three skaters' simple stand-in figures. All share the same joints (arms, forearms, legs, shins, feet), so every
// pose works for all of them.
import * as THREE from './three.js';
export const HIP = 0.93;

export function createModels(scene) {
  const hero = new THREE.Group(),
    body = new THREE.Group();
  body.position.y = HIP;
  hero.add(body);
  scene.add(hero);
  // shine 0..90: matte skin to satin and patent leather
  const mat = (color, shine, metal) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: Math.min(0.9, Math.max(0.22, 1 - shine / 95)),
      metalness: metal || 0,
      envMapIntensity: 0.55,
    });
  const add = (geo, material, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.renderOrder = 2;
    parent.add(m);
    return m;
  };
  function capsule(r1, r2, len) {
    // hangs from the origin down to -len, rounded at both ends
    const pts = [];
    let i, a;
    for (i = 0; i <= 4; i++) {
      a = (i / 4) * 1.5708;
      pts.push(new THREE.Vector2(Math.sin(a) * r2 + 1e-4, -len - Math.cos(a) * r2));
    }
    for (i = 0; i <= 4; i++) {
      a = (i / 4) * 1.5708;
      pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-4, Math.sin(a) * r1));
    }
    return new THREE.LatheGeometry(pts, 18);
  }
  const lathe = (profile, sx, sz) => {
    const g = new THREE.LatheGeometry(
      profile.map((q) => new THREE.Vector2(q[0], q[1])),
      32,
    );
    g.scale(sx, 1, sz);
    return g;
  };
  const ball = (r, sx, sy, sz) => {
    const g = new THREE.SphereGeometry(r, 24, 18);
    g.scale(sx, sy, sz);
    return g;
  };
  const mBlade = mat(0xc9d2de, 90, 1);
  const limbs = (inner, o) => {
    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(o.shoulder * side, o.shoulderY, 0);
      inner.add(g);
      add(capsule(o.upper[0], o.upper[1], o.upper[2]), o.upperMat, g);
      if (o.bicep) add(ball(0.066, 1, 1.35, 1.05), o.upperMat, g, 0, -0.125, 0.014);
      const lower = new THREE.Group();
      lower.position.y = -o.upper[2];
      g.add(lower);
      add(capsule(o.fore[0], o.fore[1], o.fore[2]), o.skin, lower);
      add(ball(o.hand, 0.82, 1.22, 0.58), o.skin, lower, 0, -o.fore[2] - 0.035, 0);
      return { g, lower };
    };
    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(o.hip * side, HIP, 0);
      inner.add(g);
      add(capsule(o.thigh[0], o.thigh[1], 0.42), o.legMat, g);
      const lower = new THREE.Group();
      lower.position.y = -0.42;
      g.add(lower);
      add(capsule(o.shin[0], o.shin[1], 0.36), o.legMat, lower);
      const foot = new THREE.Group();
      foot.position.y = -0.4;
      lower.add(foot);
      add(capsule(o.boot, o.boot, 0.05), o.bootMat, foot, 0, 0.03, 0);
      add(ball(1, o.boot - 0.002, 0.038, 0.118), o.bootMat, foot, 0, -0.055, 0.045);
      add(new THREE.BoxGeometry(0.012, 0.03, 0.28), mBlade, foot, 0, -0.097, 0.04);
      return { g, lower, foot };
    };
    return { armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  };

  // Tesa
  const a = new THREE.Group();
  a.position.y = -HIP;
  body.add(a);
  const mSkin = mat(0xf1c6a4, 12),
    mDress = mat(0x6a35dd, 62, 0.15),
    mSkirt = mat(0x8c58f4, 62, 0.15),
    mTights = mat(0xe4b28e, 10),
    mHair = mat(0x3a2414, 30),
    mBoot = mat(0xffffff, 60);
  mSkirt.side = THREE.DoubleSide;
  add(
    lathe(
      [
        [0.02, 0.9],
        [0.125, 0.93],
        [0.118, 0.99],
        [0.1, 1.07],
        [0.118, 1.16],
        [0.135, 1.25],
        [0.128, 1.34],
        [0.085, 1.4],
        [0.045, 1.425],
      ],
      1.2,
      0.72,
    ),
    mDress,
    a,
  );
  const skirt = new THREE.Group();
  a.add(skirt);
  add(
    lathe(
      [
        [0.275, 0.83],
        [0.245, 0.875],
        [0.185, 0.95],
        [0.125, 1.04],
      ],
      1,
      0.92,
    ),
    mSkirt,
    skirt,
  );
  add(new THREE.CylinderGeometry(0.04, 0.046, 0.1, 10), mSkin, a, 0, 1.455, 0);
  add(ball(0.105, 0.94, 1.08, 1), mSkin, a, 0, 1.59, 0);
  add(ball(0.11, 0.97, 1.04, 1), mHair, a, 0, 1.606, -0.024);
  add(ball(0.052, 1, 1, 1), mHair, a, 0, 1.69, -0.085);
  const ava = Object.assign(
    { name: 'Tesa', inner: a, scale: 1, skirt, hair: null, layback: true },
    limbs(a, {
      shoulder: 0.185,
      shoulderY: 1.375,
      upper: [0.044, 0.036, 0.26],
      fore: [0.035, 0.028, 0.23],
      hand: 0.036,
      upperMat: mDress,
      skin: mSkin,
      hip: 0.082,
      thigh: [0.08, 0.056],
      shin: [0.054, 0.04],
      legMat: mTights,
      boot: 0.046,
      bootMat: mBoot,
    }),
  );

  // Ivor: tall, muscular, bare-chested, long strawberry-blond dreadlocks, viking kit
  const m = new THREE.Group();
  m.position.y = -HIP;
  m.visible = false;
  body.add(m);
  const mTan = mat(0xdca57c, 16),
    mBlond = mat(0xf0cf62, 55),
    mPants = mat(0x14161d, 70),
    mBelt = mat(0xc9a13b, 80),
    mBootM = mat(0x0c0d10, 60);
  add(
    lathe(
      [
        [0.02, 0.89],
        [0.14, 0.92],
        [0.142, 0.99],
        [0.134, 1.045],
      ],
      1.24,
      0.82,
    ),
    mPants,
    m,
  );
  add(
    lathe(
      [
        [0.136, 1.03],
        [0.139, 1.05],
        [0.136, 1.07],
      ],
      1.24,
      0.82,
    ),
    mBelt,
    m,
  );
  add(
    lathe(
      [
        [0.02, 1.0],
        [0.128, 1.045],
        [0.132, 1.1],
        [0.158, 1.2],
        [0.19, 1.3],
        [0.178, 1.385],
        [0.1, 1.43],
        [0.05, 1.45],
      ],
      1.28,
      0.78,
    ),
    mTan,
    m,
  );
  [-1, 1].forEach((sd) => {
    add(ball(0.088, 1.15, 0.78, 0.62), mTan, m, 0.088 * sd, 1.275, 0.088);
    add(ball(0.08, 1, 0.95, 1), mTan, m, 0.262 * sd, 1.39, 0);
  });
  add(ball(0.09, 1.7, 0.5, 0.95), mTan, m, 0, 1.425, -0.015);
  add(new THREE.CylinderGeometry(0.052, 0.06, 0.1, 10), mTan, m, 0, 1.475, 0);
  add(ball(0.107, 0.95, 1.08, 1), mTan, m, 0, 1.615, 0);
  add(ball(0.113, 0.98, 1.03, 1), mBlond, m, 0, 1.632, -0.024);
  const hair = new THREE.Group();
  hair.position.set(0, 1.66, -0.075);
  m.add(hair);
  [-0.085, -0.052, -0.018, 0.018, 0.052, 0.085].forEach((x, i) => {
    const st = add(capsule(0.034, 0.016, 0.3 + (i % 2) * 0.05), mBlond, hair, x, 0, 0);
    st.rotation.z = x * 1.5;
    st.rotation.x = 0.1;
    st.scale.set(1.25, 1.12, 1);
  });
  const max = Object.assign(
    { name: 'Ivor', inner: m, scale: 1.14, skirt: new THREE.Group(), hair },
    limbs(m, {
      shoulder: 0.262,
      shoulderY: 1.385,
      upper: [0.07, 0.058, 0.27],
      fore: [0.056, 0.04, 0.24],
      hand: 0.046,
      upperMat: mTan,
      skin: mTan,
      bicep: true,
      hip: 0.098,
      thigh: [0.1, 0.07],
      shin: [0.068, 0.047],
      legMat: mPants,
      boot: 0.052,
      bootMat: mBootM,
    }),
  );

  // Rook: a hockey player in a navy jersey, padded pants, striped socks and a helmet. His stick is drawn by stick.js.
  const k = new THREE.Group();
  k.position.y = -HIP;
  k.visible = false;
  body.add(k);
  const mJersey = mat(0x1d2b53, 8),
    mYoke = mat(0xeef2f8, 8),
    mPantsK = mat(0x141c36, 45),
    mSock = mat(0x1d2b53, 6),
    mSkinK = mat(0xe2b08c, 14),
    mHelmet = mat(0x10172c, 75),
    mSkate = mat(0x0b0c10, 70);
  // padded pants
  add(
    lathe(
      [
        [0.02, 0.8],
        [0.16, 0.82],
        [0.168, 0.9],
        [0.158, 0.98],
      ],
      1.25,
      0.9,
    ),
    mPantsK,
    k,
  );
  // the jersey: loose and boxy, wider at the shoulders where the pads are, with a white yoke
  add(
    lathe(
      [
        [0.02, 0.86],
        [0.165, 0.87],
        [0.17, 0.98],
        [0.175, 1.12],
        [0.2, 1.26],
        [0.21, 1.36],
        [0.13, 1.43],
        [0.05, 1.45],
      ],
      1.3,
      0.82,
    ),
    mJersey,
    k,
  );
  add(
    lathe(
      [
        [0.205, 1.34],
        [0.18, 1.41],
        [0.12, 1.445],
        [0.05, 1.46],
      ],
      1.31,
      0.83,
    ),
    mYoke,
    k,
  );
  [-1, 1].forEach((sd) => add(ball(0.095, 1.1, 0.9, 1), mJersey, k, 0.26 * sd, 1.38, 0));
  add(new THREE.CylinderGeometry(0.05, 0.056, 0.1, 10), mSkinK, k, 0, 1.48, 0);
  add(ball(0.104, 0.95, 1.08, 1), mSkinK, k, 0, 1.6, 0);
  // the helmet: a shell over the top and back of the head, and a clear visor
  add(ball(0.122, 0.98, 0.9, 1.05), mHelmet, k, 0, 1.635, -0.012);
  const ka = Object.assign(
    { name: 'Rook', inner: k, scale: 1.08, skirt: new THREE.Group(), hair: null, hockey: true },
    limbs(k, {
      shoulder: 0.255,
      shoulderY: 1.37,
      upper: [0.07, 0.06, 0.27],
      fore: [0.058, 0.05, 0.24],
      hand: 0.05,
      upperMat: mJersey,
      skin: mJersey,
      hip: 0.1,
      thigh: [0.11, 0.075],
      shin: [0.068, 0.05],
      legMat: mSock,
      boot: 0.055,
      bootMat: mSkate,
    }),
  );

  const chars = [ava, max, ka];
  let index = 0;
  return {
    hero,
    body,
    chars,
    get rig() {
      return chars[index];
    },
    get index() {
      return index;
    },
    setChar(i) {
      index = ((i % chars.length) + chars.length) % chars.length;
      chars.forEach((c, j) => {
        c.inner.visible = j === index;
      });
      hero.scale.setScalar(chars[index].scale);
    },
  };
}
