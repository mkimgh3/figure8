// A realistic skater on a real skeleton, moved by the game's existing poses.
//
// The game poses a simple stand-in figure (model.js: body, upper arms, forearms, thighs, shins, feet). Every frame this
// module copies that pose onto the bones of a full human model: each stand-in joint's rotation away from its own rest
// pose is applied to the matching bone, measured from the bone's rest pose. Spine, neck, head, hands and fingers follow
// along. So every move in the game works for this character without being animated again.
//
// The model is from the Microsoft Rocketbox avatar library (MIT licence). Its clothes are recoloured into a skating
// costume (assets/ava_body.jpg), and a skirt, steel blades and a mirror image for the ice's reflection are added here.
import * as THREE from './three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { HIP } from './model.js';
import { createHair } from './hair.js';
import { starDot } from './atmos.js';

const LIFT = 0.045;
const WIND = { x: 1.8, y: 0.75 }; // a breeze over the lake, metres per second (same way the snow drifts)                                   // how far the blades raise her above where her shoes were
const UP = new THREE.Vector3(0, 1, 0),
  DOWN = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion(),
  _q2 = new THREE.Quaternion(),
  _v = new THREE.Vector3(),
  _v2 = new THREE.Vector3(),
  _m = new THREE.Matrix4();

function tex(loader, url, srgb) {
  const t = loader.load(url);
  t.flipY = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Costume material: iridescent, with a soft sheen and sequins that flash when they catch the sun (mask red = costume).
function costumeMaterial(map, normalMap, mask, U, look) {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    roughness: look.rough || 0.55,
    metalness: 0,
    iridescence: look.iridescence,
    iridescenceMap: mask,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [260, 720],
    sheen: look.sheenAmt ?? 0.35,
    sheenColor: new THREE.Color(look.sheen),
    sheenRoughness: 0.45,
    envMapIntensity: 1.0,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask };
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uSparkle = U.uSparkle;
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uMask; uniform float uTime, uSparkle;\nfloat sh21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nvec4 mk = texture2D(uMask, vMapUv);' +
          // the costume recoloured: its light and shade kept, its colour taken toward look.tint
          (look.tint
            ? ' { vec3 tn = vec3(' +
              look.tint.map((x) => x.toFixed(3)).join(', ') +
              '); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))) * tn, mk.r * ' +
              (look.tintAmt ?? 0.85).toFixed(2) +
              '); }'
            : '') +
          // the sleeves (painted sheer, marked at 0.62 in the mask's red) made opaque in look.sleeve, keeping their glints
          (look.sleeve
            ? (() => {
                const c = new THREE.Color(look.sleeve);
                return (
                  ' { float slv = smoothstep(0.45, 0.56, mk.r) * (1.0 - smoothstep(0.72, 0.86, mk.r)) * (1.0 - mk.g) * (1.0 - mk.b);' +
                  ` diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}) * (0.8 + 0.35 * dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), slv); }`
                );
              })()
            : '') +
          (look.skinRough
            ? ' roughnessFactor = mix(' +
              look.skinRough.toFixed(2) +
              ', roughnessFactor, clamp(mk.r + mk.g + mk.b, 0.0, 1.0));'
            : '') +
          ' roughnessFactor = mix(roughnessFactor, 0.3, mk.r); roughnessFactor = mix(roughnessFactor, 0.42, mk.g); roughnessFactor = mix(roughnessFactor, 0.22, mk.b);',
      )
      // sheen on the clothes only: on skin it rims thin edges white
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>' +
          (look.fabricSheen
            ? '\n#ifdef USE_SHEEN\nmaterial.sheenColor *= clamp(mk.r + mk.g + mk.b, 0.0, 1.0);\n#endif'
            : ''),
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
{ vec2 cell = floor(vMapUv * 640.0); float r = sh21(cell);
  if (mk.r > 0.5 && r > 0.9) { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(directionalLights[0].direction + Vv);
    vec3 n2 = normalize(normal + (vec3(sh21(cell + 1.3), sh21(cell + 2.7), sh21(cell + 4.1)) - 0.5) * 0.9);
    float s = pow(max(dot(n2, Hh), 0.0), 90.0) * (0.55 + 0.45 * sin(uTime * 5.0 + r * 60.0));
    totalEmissiveRadiance += directionalLights[0].color * s * 0.5 * uSparkle * ${look.sparkle.toFixed(2)}; } }
#endif` +
          (look.crystals
            ? `
{ vec2 cq = vMapUv * 230.0, cc = floor(cq); float cr = sh21(cc + 9.1);
  if (mk.r > 0.5 && cr > ${(1 - 0.3 * look.crystals).toFixed(3)} && length(fract(cq) - 0.5) < 0.36) {
    vec3 n3 = normalize(normal + (vec3(sh21(cc + 1.7), sh21(cc + 5.3), sh21(cc + 8.9)) - 0.5) * 1.4);
    totalEmissiveRadiance += crystal(n3, normalize(vViewPosition), cr) * uSparkle; } }`
            : ''),
      );
    if (look.crystals) sh.fragmentShader = sh.fragmentShader.replace('void main() {', CRYSTAL + '\nvoid main() {');
  };
  return m;
}

// Never below the ice (v3-look43): cloth that would pass through it in a deep crouch lies on it instead. Goes after
// skinning. The mirror image is drawn flipped (its model matrix turns it upside down), so there the same rule keeps it
// below the surface.
const ABOVE_ICE = `
{ vec4 wq = modelMatrix * vec4(transformed, 1.0); float fl = sign(determinant(mat3(modelMatrix)));
  if (wq.y * fl < 0.012) { wq.y = 0.012 * fl; transformed = (inverse(modelMatrix) * wq).xyz; } }`;

// A mirror crystal: a tiny flat facet (n: its normal, tilted at random) that reflects the sky and flashes white when it
// turns to the sun or a spotlight, twinkling a little as it moves. Used on Tesa's bodice and gown.
const CRYSTAL = `
vec3 crystal(vec3 n, vec3 V, float r) {
  vec3 c = vec3(0.0);
  // each crystal flashes on its own beat, briefly and brightly, and glints whenever it turns to a light
  float tw = 0.45 + 2.6 * pow(max(0.0, sin(uTime * (1.2 + r * 1.9) + r * 70.0)), 24.0);
  vec3 R = reflect(-V, n);
#if NUM_HEMI_LIGHTS > 0
  float hy = dot(R, hemisphereLights[0].direction) * 0.5 + 0.5;
  c += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, hy) * 0.5;
#endif
#if NUM_DIR_LIGHTS > 0
  c += directionalLights[0].color * pow(max(dot(n, normalize(directionalLights[0].direction + V)), 0.0), 180.0) * 2.5 * tw;
#endif
#if NUM_SPOT_LIGHTS > 0
  for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
    vec3 L = normalize(spotLights[i].position + vViewPosition);
    c += spotLights[i].color * pow(max(dot(n, normalize(L + V)), 0.0), 180.0) * 0.8 * tw;
  }
#endif
  return c;
}`;

// Fur: copies of a skinned mesh pushed out along its normals, each one drawing only the cross-sections of the strands at
// its own height, so the surface grows a soft pile with a fuzzy edge. base must carry a 'furUv' attribute.
// o: { shells, length (metres), density: [strands across u, strands across v], colour (deep in the pile), tip,
//      edge: [u, v] to grow only along the piece's edges: within u of either side and v of the bottom (a fur trim) }
function furShells(base, o) {
  const out = [],
    deep = new THREE.Color(o.colour),
    tip = new THREE.Color(o.tip ?? 0xffffff);
  for (let k = 1; k <= o.shells; k++) {
    const h = k / o.shells,
      m = new THREE.MeshStandardMaterial({
        color: deep.clone().lerp(tip, h),
        roughness: 1,
        side: THREE.DoubleSide,
        envMapIntensity: 0.7,
      });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 furUv;\nvarying vec2 vFur, vFr;')
        .replace('#include <morphnormal_vertex>', '#include <morphnormal_vertex>\nvec3 furN = normalize(objectNormal);')
        .replace(
          '#include <morphtarget_vertex>',
          `#include <morphtarget_vertex>
transformed += furN * ${(o.length * h).toFixed(4)};
vFr = furUv;
vFur = furUv * vec2(${o.density[0].toFixed(1)}, ${o.density[1].toFixed(1)});`,
        )
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>' + ABOVE_ICE);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vFur, vFr;\nfloat fh(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }',
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
${o.edge ? `if (vFr.x > ${o.edge[0].toFixed(3)} && vFr.x < ${(1 - o.edge[0]).toFixed(3)} && vFr.y < ${(1 - o.edge[1]).toFixed(3)}) discard;` : ''}
{ vec2 c = floor(vFur), f = fract(vFur) - 0.5 + (vec2(fh(c + 3.1), fh(c + 7.7)) - 0.5) * 0.5;
  float len = 0.35 + 0.65 * fh(c);
  if (${h.toFixed(3)} > len || length(f) > 0.62 * (1.0 - ${h.toFixed(3)} / len) + 0.06) discard; }`,
        );
    };
    const s2 = new THREE.SkinnedMesh(base.geometry, m);
    if (base.morphTargetInfluences) s2.morphTargetInfluences = base.morphTargetInfluences;
    s2.frustumCulled = false;
    out.push(s2);
  }
  return out;
}

// Crystal embroidery on the skirts. The skirt is divided into a grid of tiny cells (EMB_GRID: across, down), and a
// crystal is stitched into each cell whose centre (u round the skirt from the front, or from one edge of an overdress;
// t from the waist down) falls on the pattern, plus a few scattered ones. One cell is a crystal's width, so the lines
// come out as rows of single stones.
//   under: two rows round the hem, a garland of swags above them, and twelve vines down the skirt with pairs of leaves
//   over:  a border just inside each front edge and above the hem, and a scatter of six-stone flowers
const EMB_GRID = [220, 80];
const EMBROIDERY = {
  under: `float emb(vec2 c) {
  float u = c.x, t = c.y, du = 0.5 / ${EMB_GRID[0].toFixed(1)}, dt = 0.5 / ${EMB_GRID[1].toFixed(1)};
  if (abs(t - 0.905) < dt || abs(t - 0.955) < dt) return 1.0;
  if (abs(t - (0.845 - 0.05 * abs(sin(u * 3.14159 * 16.0)))) < dt) return 1.0;
  float k = floor(u * 12.0 + 0.5) / 12.0, d = u - k - 0.006 * sin(t * 26.0);
  if (t > 0.1 && t < 0.79 && abs(d) < du) return 1.0;
  float row = floor(t * ${EMB_GRID[1].toFixed(1)});
  if (t > 0.14 && t < 0.77 && mod(row, 8.0) == 4.0 && abs(abs(d) - 0.011) < du * 1.2) return 1.0;
  return 0.0;
}`,
  over: `float emb(vec2 c) {
  float u = c.x, t = c.y, du = 0.5 / ${EMB_GRID[0].toFixed(1)}, dt = 0.5 / ${EMB_GRID[1].toFixed(1)};
  if (t > 0.05 && (abs(u - 0.04) < du || abs(u - 0.96) < du)) return 1.0;
  if (abs(t - 0.915) < dt) return 1.0;
  vec2 g = vec2(u * 16.0, t * 7.0), f = (fract(g) - 0.5) / vec2(16.0, 7.0);
  float ring = abs(length(f * vec2(1.0, 0.45)) - 0.012);
  if (t > 0.18 && t < 0.86 && mod(floor(g.x) + floor(g.y), 2.0) == 0.0 && ring < du * 1.1) return 1.0;
  return 0.0;
}`,
};

// A skirt, or the skirt of a coat, from the waist down, skinned to the hips and thighs so it moves with the legs. It is
// cut as cloth, not as a cone: as she spins it swings open along a curve (the cloth bends out more and more towards
// the hem), falls into deep folds (the hem has far less cloth than a flat circle would need), ripples as waves run
// round it, and trails behind the way she turns. Five morphs, each with its normals so the folds are lit: 0 half
// open, 1 fully open, 2 and 3 the travelling ripples, 4 the trail (its sign is which way she turns).
// toBind: from where she stands now back into the model's bind space (where its skinning weights were made)
// o: { length, waist: [rx, rz], rest (degrees from hanging straight down), open (the hem's angle when fully open),
//      bell (below 1: fuller near the waist), follow (how much the hem follows each leg), colours: [top, hem], opacity,
//      sheen, sparkle, rough, sheenColor, iridescence, lift (metres the hem rises when fully open),
//      godet (fold depth, as a share of how far the hem swings out), lobes (folds round it), flute (ripple height,
//      metres), trail (radians the hem trails in a full spin), split: [at the waist, at the hem, at the hem when fully
//      open] (degrees left open at the front, for a coat), embroider ('under' or 'over': rows of crystals stitched in
//      a pattern), gain (how readily it opens), k (its spring: lower is heavier and slower) }
function buildSkirt(skeleton, toBind, bone, U, o) {
  const pelvis = bone('Bip01 Pelvis'),
    thighL = bone('Bip01 L Thigh'),
    thighR = bone('Bip01 R Thigh');
  const ix = (b) => skeleton.bones.indexOf(b);
  const P = new THREE.Vector3();
  pelvis.getWorldPosition(P);
  const RINGS = 16,
    SEG = 84,
    SUB = 8,
    waistY = P.y + 0.07,
    L = o.length,
    [rx0, rz0] = o.waist,
    D = Math.PI / 180,
    thR = o.rest * D,
    thO = o.open * D,
    liftH = o.lift ?? 0.05,
    bell = o.bell || 1,
    follow = o.follow ?? 0.7,
    sp = o.split || [0, 0, 0],
    lobes = o.lobes || 9,
    godet = o.godet ?? 0.25,
    flute = o.flute ?? 0.045,
    trail = o.trail ?? 0.35;
  // the profile from the waist down for an opening s (0 hanging, 1 fully open): at each ring, how far out from the
  // waist, how far down, and the cloth's angle from straight down there
  const profile = (s) => {
    const ang = (u) => thR + (thO - thR) * s * (0.3 + 0.7 * u),
      out = [[0, 0, thR]];
    let rr = 0,
      yy = 0;
    for (let r = 1; r <= RINGS; r++) {
      for (let k = 0; k < SUB; k++) {
        const th = ang((r - 1 + (k + 0.5) / SUB) / RINGS);
        rr += (L / RINGS / SUB) * Math.sin(th);
        yy -= (L / RINGS / SUB) * Math.cos(th);
      }
      const t = r / RINGS;
      out.push([rr * Math.pow(t, (bell - 1) * (1 - s)), yy + liftH * s * t * t * t, ang(t)]);
    }
    return out;
  };
  const prof = [profile(0), profile(0.5), profile(1)];
  // half the opening at the front, at height t and opening s
  const gap = (t, s) => ((sp[0] + (sp[1] + ((sp[2] ?? sp[1]) - sp[1]) * s - sp[0]) * Math.pow(t, 0.7)) / 2) * D;
  // a point of the cloth: fu across it (0..1, from one front edge round to the other), ring r, opening si (0 rest, 1
  // half, 2 full), da (turned this far round, for the trail), dn (pushed this far out along the cloth)
  const at = (fu, r, si, da, dn, out) => {
    const t = r / RINGS,
      s = si / 2,
      [rr, yy, th] = prof[si][r],
      a0 = gap(t, s),
      a = a0 + fu * (Math.PI * 2 - 2 * a0) + da,
      // soft folds while it hangs; deep ones as it opens, as deep as the hem has swung out
      fold =
        0.011 * t * Math.sin(a * 16) * (1 - s) + godet * (rr - prof[0][r][0]) * Math.sin(fu * lobes * Math.PI * 2) + dn,
      fx = Math.cos(th) * fold;
    return out.set(
      P.x + Math.sin(a) * (rx0 + rr + fx),
      waistY + yy + Math.sin(th) * fold,
      P.z + 0.01 + Math.cos(a) * (rz0 + rr + fx),
    );
  };
  const pos = [],
    morphs = [[], [], [], [], []],
    col = [],
    fuv = [],
    si = [],
    sw = [],
    idx = [];
  const invRot = new THREE.Matrix3().setFromMatrix4(toBind),
    v = new THREE.Vector3(),
    q = new THREE.Vector3(),
    q2 = new THREE.Vector3();
  const top = new THREE.Color(o.colours[0]),
    hem = new THREE.Color(o.colours[1]),
    c = new THREE.Color();
  const rel = (arr, d) => {
    d.applyMatrix3(invRot);
    arr.push(d.x, d.y, d.z);
  };
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    c.copy(top).lerp(hem, Math.pow(t, 1.3));
    for (let sg = 0; sg <= SEG; sg++) {
      const fu = sg / SEG,
        rip = flute * t * t;
      at(fu, r, 0, 0, 0, v);
      const w = v.clone().applyMatrix4(toBind);
      pos.push(w.x, w.y, w.z);
      rel(morphs[0], at(fu, r, 1, 0, 0, q).sub(v));
      rel(morphs[1], at(fu, r, 2, 0, 0, q).sub(v));
      // ripples, out of the half-open cloth
      at(fu, r, 1, 0, 0, q2);
      rel(morphs[2], at(fu, r, 1, 0, rip * Math.sin(fu * 7 * Math.PI * 2), q).sub(q2));
      rel(morphs[3], at(fu, r, 1, 0, rip * Math.cos(fu * 7 * Math.PI * 2), q).sub(q2));
      // the trail: the fully open cloth turned round, more so towards the hem
      at(fu, r, 2, 0, 0, q2);
      rel(morphs[4], at(fu, r, 2, trail * Math.pow(t, 1.5), 0, q).sub(q2));
      col.push(c.r, c.g, c.b);
      fuv.push(fu, t);
      // the half of the skirt over each leg follows that leg, more so towards the hem
      const side = Math.sin(gap(t, 0) + fu * (Math.PI * 2 - 2 * gap(t, 0))),
        wl = follow * t * THREE.MathUtils.smoothstep(side, 0.05, 0.7),
        wr = follow * t * THREE.MathUtils.smoothstep(-side, 0.05, 0.7);
      si.push(ix(pelvis), ix(thighL), ix(thighR), 0);
      sw.push(1 - wl - wr, wl, wr, 0);
    }
  }
  for (let r = 0; r < RINGS; r++)
    for (let sg = 0; sg < SEG; sg++) {
      const a = r * (SEG + 1) + sg,
        b = a + SEG + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  // the normals of each morph's shape, as changes from the shape it is added to
  const normalsOf = (arr) => {
    const t = new THREE.BufferGeometry();
    t.setIndex(idx);
    t.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    t.computeVertexNormals();
    return t.attributes.normal.array;
  };
  const plus = (a, b) => a.map((x, i) => x + b[i]),
    minus = (a, b) => Array.from(a, (x, i) => x - b[i]);
  const nBase = normalsOf(pos),
    pHalf = plus(pos, morphs[0]),
    pFull = plus(pos, morphs[1]),
    nHalf = normalsOf(pHalf),
    nFull = normalsOf(pFull);
  const nMorphs = [
    minus(nHalf, nBase),
    minus(nFull, nBase),
    minus(normalsOf(plus(pHalf, morphs[2])), nHalf),
    minus(normalsOf(plus(pHalf, morphs[3])), nHalf),
    minus(normalsOf(plus(pFull, morphs[4])), nFull),
  ];
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nBase, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('furUv', new THREE.Float32BufferAttribute(fuv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.morphAttributes.position = morphs.map((a) => new THREE.Float32BufferAttribute(a, 3));
  g.morphAttributes.normal = nMorphs.map((a) => new THREE.Float32BufferAttribute(a, 3));
  g.morphTargetsRelative = true;
  const sheer = o.opacity < 1;
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: o.rough ?? (sheer ? 0.5 : 0.32),
    iridescence: o.iridescence ?? 0.6,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [260, 620],
    sheen: o.sheen ?? 0.7,
    sheenColor: new THREE.Color(o.sheenColor ?? 0xf2ecff),
    sheenRoughness: 0.35,
    side: THREE.DoubleSide,
    transparent: sheer,
    opacity: o.opacity,
    depthWrite: !sheer,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uSparkle = U.uSparkle;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 furUv;\nvarying vec3 vSk;\nvarying vec2 vFu;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSk = position * 160.0;\nvFu = furUv;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>' + ABOVE_ICE);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSk; varying vec2 vFu; uniform float uTime, uSparkle;\nfloat sh31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\nfloat sh21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
{ vec3 cell = floor(vSk); float r = sh31(cell); if (r > ${(1 - 0.1 * (o.sparkle ?? 1)).toFixed(3)}) { vec3 Hh = normalize(directionalLights[0].direction + normalize(vViewPosition));
  vec3 n2 = normalize(normal + (vec3(sh31(cell + 1.3), sh31(cell + 2.7), sh31(cell + 4.1)) - 0.5) * 1.1);
  totalEmissiveRadiance += directionalLights[0].color * pow(max(dot(n2, Hh), 0.0), 90.0) * (0.55 + 0.45 * sin(uTime * 5.0 + r * 60.0)) * 0.5 * uSparkle; } }
#endif` +
          (o.crystals
            ? `
{ vec3 cq = vSk * 0.3, cc = floor(cq); float cr = sh31(cc + 9.1);
  if (cr > ${(1 - 0.32 * o.crystals).toFixed(3)} && length(fract(cq) - 0.5) < 0.4) {
    vec3 n3 = normalize(normal + (vec3(sh31(cc + 1.7), sh31(cc + 5.3), sh31(cc + 8.9)) - 0.5) * 1.4);
    totalEmissiveRadiance += crystal(n3, normalize(vViewPosition), cr) * uSparkle; } }`
            : '') +
          (o.embroider
            ? `
{ vec2 q = vFu * vec2(${EMB_GRID[0].toFixed(1)}, ${EMB_GRID[1].toFixed(1)}), cc = floor(q);
  float cr = sh21(cc + 4.7);
  if ((emb((cc + 0.5) / vec2(${EMB_GRID[0].toFixed(1)}, ${EMB_GRID[1].toFixed(1)})) > 0.5 || cr > 0.978) && length(fract(q) - 0.5) < 0.42) {
    vec3 n3 = normalize(normal + (vec3(sh21(cc + 1.7), sh21(cc + 5.3), sh21(cc + 8.9)) - 0.5) * 1.6);
    diffuseColor.rgb = vec3(0.82, 0.88, 0.98);
    totalEmissiveRadiance += crystal(n3, normalize(vViewPosition), cr) * uSparkle * 1.3; } }`
            : ''),
      );
    if (o.crystals || o.embroider)
      sh.fragmentShader = sh.fragmentShader.replace(
        'void main() {',
        CRYSTAL + '\n' + (o.embroider ? EMBROIDERY[o.embroider] : '') + '\nvoid main() {',
      );
  };
  const mesh = new THREE.SkinnedMesh(g, m);
  mesh.castShadow = !sheer;
  mesh.frustumCulled = false;
  mesh.morphTargetInfluences = [0, 0, 0, 0, 0];
  // its own spring: f how far open, v how fast it is opening
  mesh.userData.cloth = { o, f: 0, v: 0 };
  if (sheer) mesh.renderOrder = 2;
  return mesh;
}

// A fur cuff round a wrist (Tesa's coat sleeves): a short tube that widens towards the hand, skinned to the forearm and
// built in the rest pose, like the skirt. side: 'L' or 'R'. o: { length, radius (metres, at the elbow end), colour }
function buildCuff(skeleton, toBind, bone, side, o) {
  const fore = bone('Bip01 ' + side + ' Forearm'),
    hand = bone('Bip01 ' + side + ' Hand'),
    fi = skeleton.bones.indexOf(fore);
  const A = fore.getWorldPosition(new THREE.Vector3()),
    B = hand.getWorldPosition(new THREE.Vector3()),
    d = B.clone().sub(A).normalize(),
    e1 = new THREE.Vector3(0, 1, 0).cross(d);
  if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0).cross(d);
  e1.normalize();
  const e2 = d.clone().cross(e1);
  const SEG = 28,
    RINGS = 3,
    len = o.length ?? 0.07,
    r0 = o.radius ?? 0.04;
  const pos = [],
    fuv = [],
    si = [],
    sw = [],
    idx = [];
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS,
      c = B.clone().addScaledVector(d, -0.012 - len * (1 - t)),
      rad = r0 * (1 + 0.3 * t);
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2,
        p = c
          .clone()
          .addScaledVector(e1, Math.cos(a) * rad)
          .addScaledVector(e2, Math.sin(a) * rad)
          .applyMatrix4(toBind);
      pos.push(p.x, p.y, p.z);
      fuv.push(s / SEG, t);
      si.push(fi, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
  }
  for (let r = 0; r < RINGS; r++)
    for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s,
        b = a + SEG + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('furUv', new THREE.Float32BufferAttribute(fuv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeVertexNormals();
  // the fur grows along the normals, so they must point out of the tube
  const n = g.attributes.normal,
    p0 = new THREE.Vector3().fromBufferAttribute(g.attributes.position, 0),
    p1 = new THREE.Vector3().fromBufferAttribute(g.attributes.position, SEG / 2);
  if (new THREE.Vector3().fromBufferAttribute(n, 0).dot(p0.sub(p1)) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  const mesh = new THREE.SkinnedMesh(
    g,
    new THREE.MeshStandardMaterial({ color: o.colour ?? 0xe8e4f0, roughness: 1, side: THREE.DoubleSide }),
  );
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// A fur mantle over the shoulders (for the viking), shaped to sit on the body: a thick ring of fur from the base of
// the neck out over the shoulders, rolled under at its ragged outer edge. Built standing in the rest pose, where each
// point is dropped onto the (already bulked) body, then skinned to the neck, upper back and collarbones.
function furTexture(light) {
  const W = 128,
    H = 128,
    cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  let s = 77;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  g.fillStyle = light ? '#e4e0ea' : '#5e4e3e';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * W,
      y = rnd() * H,
      l = 4 + rnd() * 10,
      a = Math.PI / 2 + (rnd() - 0.5) * 0.7,
      v = rnd();
    g.strokeStyle = light
      ? v < 0.4
        ? `rgba(196,190,210,${0.35 + rnd() * 0.3})`
        : `rgba(255,255,255,${0.4 + rnd() * 0.4})`
      : v < 0.4
        ? `rgba(52,40,30,${0.35 + rnd() * 0.3})`
        : v < 0.9
          ? `rgba(120,102,82,${0.35 + rnd() * 0.3})`
          : `rgba(180,165,145,${0.4 + rnd() * 0.3})`;
    g.lineWidth = 1 + rnd() * 1.4;
    for (const dx of [-W, 0, W])
      for (const dy of [-H, 0, H]) {
        g.beginPath();
        g.moveTo(x + dx, y + dy);
        g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
        g.stroke();
      }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// mo: { size (1 = Ivor's broad shoulders), light (white fur instead of brown) }
function buildMantle(skeleton, toBind, bone, body, mo) {
  const sz = mo.size || 1;
  const N = bone('Bip01 Neck').getWorldPosition(new THREE.Vector3()),
    ix = (n) => skeleton.bones.indexOf(bone(n));
  const RINGS = 7,
    SEG = 56,
    rc = new THREE.Raycaster(),
    down = new THREE.Vector3(0, -1, 0),
    o = new THREE.Vector3(),
    nrm = new THREE.Vector3();
  const hash = (k) => {
    const x = Math.sin(k * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const rag = (a) => {
    const k = (a / (Math.PI * 2)) * 22,
      i = Math.floor(k),
      f = k - i;
    return hash(i) * (1 - f) + hash(i + 1) * f;
  };
  const pos = [],
    uv = [],
    si = [],
    sw = [],
    idx = [];
  const cols = SEG + 1;
  let rows = 0;
  const ring = (t, extraR, dy) => {
    rows++;
    for (let sg = 0; sg <= SEG; sg++) {
      const a = (sg / SEG) * Math.PI * 2,
        sa = Math.sin(a),
        ca = Math.cos(a);
      const back = ca < 0 ? -ca : 0,
        front = ca > 0 ? ca : 0;
      const rx = (0.1 + t * (0.19 + 0.03 * rag(a))) * sz,
        rz = (0.092 - 0.01 * front + t * (0.06 + 0.05 * back - 0.01 * front + 0.025 * rag(a + 1))) * sz;
      const x = sa * (rx + extraR),
        z = ca * (rz + extraR);
      o.set(N.x + x, N.y + 0.45, N.z + z);
      rc.set(o, down);
      const hit = rc.intersectObject(body, false)[0];
      // It lies off the body along the body's own surface, not just above it. Lifted straight up (v3-look42 and
      // before), it had almost no room where the upper back is steep, and her shoulder blades (and his, with his
      // arms up) showed through it. More room at the back and over the shoulders, which move most with the arms.
      const room = 0.03 + 0.02 * t + 0.02 * back * t;
      if (hit && hit.point.y > N.y - 0.3) {
        nrm.copy(hit.face.normal).transformDirection(body.matrixWorld);
        if (nrm.x * x + nrm.z * z + nrm.y * 0.05 < 0) nrm.negate();
        o.copy(hit.point).addScaledVector(nrm, room);
      } else o.set(N.x + x, N.y - 0.1 - 0.15 * t + room, N.z + z);
      // more room over the shoulders, which swell when the arms move
      o.y += 0.035 * Math.abs(sa) * t * t + dy;
      pos.push(o.x, o.y, o.z);
      uv.push((a / (Math.PI * 2)) * 5, t * 1.6 + dy * 4);
      // skin: neck at the collar, upper back in the middle, collarbones and a little of the upper arms at the sides
      // (the upper arms since v3-look43: the outer edge over each shoulder rises with the arm, so the shoulder does
      // not come up through it)
      const side = Math.abs(sa),
        sd = sa > 0 ? 'L' : 'R',
        wN = Math.max(0, 0.5 - t) * 0.9,
        wC = side * t * 0.5,
        wU = side * side * t * t * 0.3;
      si.push(ix('Bip01 Neck'), ix('Bip01 Spine2'), ix('Bip01 ' + sd + ' Clavicle'), ix('Bip01 ' + sd + ' UpperArm'));
      sw.push(wN, Math.max(0, 1 - wN - wC - wU), wC, wU);
    }
  };
  ring(0, -0.01, -0.035); // tucked in round the neck
  for (let r = 0; r <= RINGS; r++) ring(r / RINGS, 0, 0);
  ring(1, 0.008, -0.03);
  ring(1, -0.012, -0.045); // the rolled outer edge
  for (let r = 0; r < rows - 1; r++)
    for (let sg = 0; sg < SEG; sg++) {
      const a = r * cols + sg,
        b = a + cols;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const pts = [];
  for (let i = 0; i < pos.length; i += 3)
    pts.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(toBind));
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      pts.flatMap((p) => [p.x, p.y, p.z]),
      3,
    ),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('furUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({
    map: furTexture(mo.light),
    roughness: 1,
    side: THREE.DoubleSide,
    envMapIntensity: 0.5,
  });
  const mesh = new THREE.SkinnedMesh(g, m);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// A figure-skating blade: a thin steel runner with a curved toe and picks, on a short holder under the boot.
function buildBlade() {
  const s = new THREE.Shape(),
    L = 0.3;
  s.moveTo(-L / 2, 0.0);
  s.lineTo(L / 2 - 0.05, 0.0);
  s.quadraticCurveTo(L / 2 + 0.012, 0.004, L / 2, 0.034);
  s.lineTo(L / 2 - 0.012, 0.03);
  s.lineTo(L / 2 - 0.02, 0.04);
  s.lineTo(-L / 2 + 0.02, 0.04);
  s.quadraticCurveTo(-L / 2, 0.035, -L / 2, 0.0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0045, bevelEnabled: false });
  g.translate(0, 0, -0.00225);
  g.rotateY(-Math.PI / 2); // length along z (toe at +z)
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.18 });
  const grp = new THREE.Group(),
    runner = new THREE.Mesh(g, steel);
  grp.add(runner);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.24), steel);
  plate.position.y = 0.043;
  grp.add(plate);
  grp.traverse((o) => {
    o.castShadow = true;
  });
  return grp;
}

// A hockey blade: a lower, flat-bottomed steel runner rounded at both ends, in a tall white holder.
function buildHockeyBlade() {
  const s = new THREE.Shape(),
    L = 0.27,
    h = 0.024;
  s.moveTo(-L / 2 + 0.03, 0);
  s.lineTo(L / 2 - 0.04, 0);
  s.quadraticCurveTo(L / 2, 0.002, L / 2, h);
  s.lineTo(-L / 2, h);
  s.quadraticCurveTo(-L / 2, 0.002, -L / 2 + 0.03, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
  g.translate(0, 0, -0.002);
  g.rotateY(-Math.PI / 2);
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.2 }),
    plastic = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.35 });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g, steel));
  const holder = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), plastic);
  holder.position.y = 0.038;
  grp.add(holder);
  for (const z of [-0.085, 0.085]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.07), plastic);
    post.position.set(0, 0.057, z);
    grp.add(post);
  }
  grp.traverse((o) => {
    o.castShadow = true;
  });
  return grp;
}

// Rook's helmet, built in the world at the model's rest pose round the top of his head (top: the crown; c: the centre
// of the cranium; r: its half-widths) and then pinned to the head bone.
function buildHelmet(top, c, r) {
  const shell = new THREE.MeshStandardMaterial({ color: 0x10172c, roughness: 0.3, metalness: 0.1 }),
    trim = new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.5 }),
    visorM = new THREE.MeshStandardMaterial({
      color: 0xbfe6ff,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
  const grp = new THREE.Group();
  grp.position.set(c.x, top - 0.115, c.z - 0.006);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), shell);
  cap.scale.set(r.x * 1.22, 0.16, r.z * 1.2);
  cap.rotation.x = -0.32;
  grp.add(cap);
  // a ridge down the middle and a white band round the rim
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 32, Math.PI * 0.9), trim);
  ridge.scale.set(r.z * 1.21, 0.16, r.x * 0.2);
  ridge.rotation.set(-0.32, Math.PI / 2, 0);
  ridge.position.y = 0.002;
  grp.add(ridge);
  // the band round the rim: a slice of the same dome, a hair larger, so it follows the shell's edge exactly
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 3, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.1), trim);
  rim.scale.set(r.x * 1.235, 0.162, r.z * 1.215);
  rim.rotation.x = -0.32;
  grp.add(rim);
  // ear guards
  for (const sd of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), shell);
    ear.scale.set(0.45, 1, 1.15);
    ear.position.set(sd * r.x * 1.12, -0.065, -0.005);
    grp.add(ear);
  }
  // a clear half visor over the eyes
  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(r.z * 1.25, r.z * 1.22, 0.065, 28, 1, true, -1.05, 2.1),
    visorM,
  );
  visor.scale.x = (r.x / r.z) * 1.02;
  visor.position.set(0, -0.06, 0.004);
  grp.add(visor);
  grp.traverse((o) => {
    if (o.isMesh && o.material !== visorM) o.castShadow = true;
  });
  return grp;
}

// A hockey glove at the wrist (at: the wrist, dir: towards the fingers, both in the world at rest): a padded mitt and
// a wide cuff with a white stripe.
function buildGlove(at, dir) {
  const navy = new THREE.MeshStandardMaterial({ color: 0x1d2b53, roughness: 0.55 }),
    white = new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.6 }),
    palm = new THREE.MeshStandardMaterial({ color: 0x3a4258, roughness: 0.9 });
  const grp = new THREE.Group();
  grp.position.copy(at);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mitt = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.09, 4, 10), navy);
  mitt.scale.set(1.4, 1, 1.15);
  mitt.position.y = 0.09;
  grp.add(mitt);
  const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.07, 4, 8), palm);
  pad.scale.set(1, 1, 0.5);
  pad.position.set(0, 0.09, -0.032);
  grp.add(pad);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.085, 14), navy);
  cuff.position.y = -0.01;
  grp.add(cuff);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0645, 0.0655, 0.016, 14), white);
  band.position.y = -0.02;
  grp.add(band);
  grp.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return grp;
}

// Tesa's kokoshnik: a crescent of silver standing up over her forehead, edged with pearls, built in the world at the rest
// pose (top: the crown, c: the centre of the cranium, r: its half-widths) and then pinned to the head bone.
function buildTiara(top, c, r) {
  const silver = new THREE.MeshStandardMaterial({ color: 0xe6eeff, metalness: 1, roughness: 0.18 }),
    pearl = new THREE.MeshStandardMaterial({ color: 0xfbf8ff, roughness: 0.25, envMapIntensity: 1.2 }),
    W = r.x * 0.95,
    H = 0.075;
  const sh = new THREE.Shape();
  sh.absellipse(0, 0, W, H, 0, Math.PI, false);
  const hole = new THREE.Path();
  hole.absellipse(0, -0.012, W * 0.62, H * 0.45, Math.PI, 0, true);
  sh.holes.push(hole);
  const grp = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: false, curveSegments: 24 }),
    silver,
  );
  plate.castShadow = true;
  grp.add(plate);
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI,
      p = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), pearl);
    p.position.set(Math.cos(a) * W, Math.sin(a) * H, 0.004);
    grp.add(p);
  }
  // the centre stone
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.012), silver);
  stone.position.set(0, H * 0.72, 0.006);
  grp.add(stone);
  grp.position.set(c.x, top - 0.055, c.z + r.z * 0.45);
  grp.rotation.x = -0.45;
  return grp;
}

// models: the stand-in figures (model.js); ix: which of them this body belongs to.
// opts: { url, tex: { body, bodyN, mask, head, headN, hair }, height (metres), skirt (bool), look: { iridescence, sheen, sparkle } }
// bulk up a body: push each vertex out along its normal by an amount (metres) set per bone and blended by
// the skin weights, so muscle follows the limbs and the seams between body and head stay closed
// bumps: round swellings (metres) centred near a joint, for muscles that sit around one, like boulder shoulders:
// [{ bone, a: height, r: radius, out: push the centre out to the side, up: and up }]
function inflate(mesh, amounts, bumps) {
  const g = mesh.geometry,
    P = g.attributes.position,
    Nn = g.attributes.normal,
    I = g.attributes.skinIndex,
    W = g.attributes.skinWeight;
  if (!Nn || !I || !W) return;
  const per = mesh.skeleton.bones.map((b) => {
    const n = b.name
      .replace(/_/g, ' ')
      .replace(/^Bip01 /, '')
      .replace(/^[LR] /, '');
    return amounts[n] || 0;
  });
  const toMesh = mesh.bindMatrix.clone().invert(),
    bones = mesh.skeleton.bones;
  const at = (name) => {
    const k = bones.findIndex((b) => b.name.replace(/_/g, ' ') === name);
    return k < 0
      ? null
      : new THREE.Vector3().applyMatrix4(mesh.skeleton.boneInverses[k].clone().invert()).applyMatrix4(toMesh);
  };
  const bs = (bumps || [])
    .map((b) => {
      const c = b.mid ? at(b.bone).lerp(at(b.mid), 0.5) : at(b.bone);
      if (!c) return null;
      c.x += Math.sign(c.x) * (b.out || 0);
      c.z += b.up || 0;
      return { c, a: b.a, r2: b.r * b.r };
    })
    .filter(Boolean);
  // vertices split along a seam share a position but may not share a normal: push them all along the average
  const key = (i) =>
      Math.round(P.getX(i) * 2000) + ',' + Math.round(P.getY(i) * 2000) + ',' + Math.round(P.getZ(i) * 2000),
    sum = new Map();
  for (let i = 0; i < P.count; i++) {
    const k = key(i),
      n = sum.get(k) || [0, 0, 0];
    n[0] += Nn.getX(i);
    n[1] += Nn.getY(i);
    n[2] += Nn.getZ(i);
    sum.set(k, n);
  }
  const NA = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const n = sum.get(key(i)),
      l = Math.hypot(n[0], n[1], n[2]) || 1;
    NA[i * 3] = n[0] / l;
    NA[i * 3 + 1] = n[1] / l;
    NA[i * 3 + 2] = n[2] / l;
  }
  // the neck is shared by the head and the body, which are separate pieces: push it straight out from the neck's
  // axis rather than along each piece's own normals, so the two stay joined however much it grows
  const neckIx = bones.findIndex((b) => /Neck$/.test(b.name.replace(/_/g, ' ')));
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    let d = 0,
      wn = 0;
    for (let k = 0; k < 4; k++) {
      const bi = I.getComponent(i, k),
        w = W.getComponent(i, k);
      d += w * per[bi];
      if (bi === neckIx) wn += w;
    }
    if (wn > 0) {
      const rx = P.getX(i),
        ry = P.getY(i) - 0.012,
        rl = Math.hypot(rx, ry) || 1,
        f = Math.min(1, wn * 1.5);
      NA[i * 3] = NA[i * 3] * (1 - f) + (rx / rl) * f;
      NA[i * 3 + 1] = NA[i * 3 + 1] * (1 - f) + (ry / rl) * f;
      NA[i * 3 + 2] *= 1 - f;
      const l = Math.hypot(NA[i * 3], NA[i * 3 + 1], NA[i * 3 + 2]) || 1;
      NA[i * 3] /= l;
      NA[i * 3 + 1] /= l;
      NA[i * 3 + 2] /= l;
    }
    if (bs.length) {
      v.fromBufferAttribute(P, i);
      for (const b of bs) d += b.a * Math.exp(-v.distanceToSquared(b.c) / b.r2);
    }
    if (d) P.setXYZ(i, P.getX(i) + NA[i * 3] * d, P.getY(i) + NA[i * 3 + 1] * d, P.getZ(i) + NA[i * 3 + 2] * d);
  }
  // fresh normals for the new shape, smoothed across the seams so no crease shows where the clothing was cut
  g.computeVertexNormals();
  const N2 = g.attributes.normal,
    acc = new Map();
  for (let i = 0; i < P.count; i++) {
    const k = key(i),
      n = acc.get(k) || [0, 0, 0];
    n[0] += N2.getX(i);
    n[1] += N2.getY(i);
    n[2] += N2.getZ(i);
    acc.set(k, n);
  }
  for (let i = 0; i < P.count; i++) {
    const n = acc.get(key(i)),
      l = Math.hypot(n[0], n[1], n[2]) || 1;
    N2.setXYZ(i, n[0] / l, n[1] / l, n[2] / l);
  }
  P.needsUpdate = true;
  N2.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

export function loadAvatar(models, ix, opts, U, onReady) {
  const url = opts.url,
    assets = opts.tex,
    proxy = { hero: models.hero, body: models.body, rig: models.chars[ix] };
  const loader = new GLTFLoader(),
    tl = new THREE.TextureLoader();
  // the model comes as a script holding the .glb as base64 (the host serves scripts and images, not .glb files)
  const parse = (buf) => new Promise((ok, fail) => loader.parse(buf, '', ok, fail));
  import(new URL(url, document.baseURI).href)
    .then((m) => {
      // relative to the page, like the textures
      const bin = atob(m.default),
        a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return parse(a.buffer);
    })
    .then((gltf) => {
      const root = gltf.scene,
        skinned = [];
      root.traverse((o) => {
        if (o.isSkinnedMesh) skinned.push(o);
      });
      const bones = {};
      root.traverse((o) => {
        if (o.isBone) bones[o.name] = o;
      });
      const bone = (n) => bones[n] || bones[n.replace(/ /g, '_')]; // the loader turns spaces in names into underscores
      const bodyMesh = skinned.find((m) => /body/.test(m.material.name)) || skinned[0],
        skeleton = bodyMesh.skeleton;
      // materials
      const mask = tex(tl, assets.mask),
        body = costumeMaterial(tex(tl, assets.body, true), tex(tl, assets.bodyN), mask, U, opts.look);
      const head = new THREE.MeshStandardMaterial({
        map: tex(tl, assets.head, true),
        normalMap: tex(tl, assets.headN),
        roughness: 0.55,
        envMapIntensity: 0.8,
      });
      const hair = new THREE.MeshStandardMaterial({
        map: assets.hair ? tex(tl, assets.hair, true) : null,
        roughness: 0.42,
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        envMapIntensity: 0.9,
      });
      skinned.forEach((m) => {
        m.material = /head/.test(m.material.name) ? head : /opacity|hair/.test(m.material.name) ? hair : body;
        m.castShadow = true;
        m.frustumCulled = false;
      });
      // Rook is clean-shaven: take back the beard volume that is baked into the shared head (see tools/assets/ivor_head.py)
      if (opts.shave)
        for (const m of skinned) {
          const H = m.geometry.attributes._hair,
            P = m.geometry.attributes.position,
            Nn = m.geometry.attributes.normal;
          if (!H || !Nn) continue;
          for (let i = 0; i < P.count; i++) {
            const d = H.getX(i) * H.getX(i) * 0.012;
            if (d) P.setXYZ(i, P.getX(i) - Nn.getX(i) * d, P.getY(i) - Nn.getY(i) * d, P.getZ(i) - Nn.getZ(i) * d);
          }
          P.needsUpdate = true;
        }
      // A slimmer face (v3-look43; the base model's is round): the cheeks and jaw drawn in across by opts.slimFace (a
      // share), most at the jaw, fading out by the eyes and above the seam with the body (moving the seam would open a
      // gap), and only on the face side of the head. In the head's own space: x across, -y forward, z up (metres).
      if (opts.slimFace)
        for (const m of skinned.filter((k) => k.material === head)) {
          const P = m.geometry.attributes.position,
            ss = THREE.MathUtils.smoothstep;
          for (let i = 0; i < P.count; i++) {
            const zz = P.getZ(i),
              w = ss(zz, 1.53, 1.58) * (1 - ss(zz, 1.64, 1.71)) * ss(-P.getY(i), -0.03, 0.03);
            if (w > 0) P.setX(i, P.getX(i) * (1 - opts.slimFace * w));
          }
          P.needsUpdate = true;
        }
      if (opts.inflate)
        skinned.forEach((m) => {
          if (m.material === body) inflate(m, opts.inflate, opts.bumps);
          else if (m.material !== hair) inflate(m, opts.inflate);
        });
      // long hair, or a helmet, replaces the model's own short hair cards
      if (opts.longHair || opts.hockey)
        for (const m of skinned.filter((k) => k.material === hair)) {
          m.parent.remove(m);
          skinned.splice(skinned.indexOf(m), 1);
        }

      // stand her in the game's world: inside the stand-in's top node, raised onto her blades
      const wrap = new THREE.Group();
      wrap.add(root);
      proxy.hero.add(wrap);
      root.position.y = LIFT;
      // her (or his) height: the model's own, scaled to opts.height, and the stand-in's scale taken back out
      const box = new THREE.Box3().setFromObject(root),
        tall = box.max.y - box.min.y,
        charScale = proxy.rig.scale || 1;
      wrap.scale.setScalar((opts.height || tall) / tall / charScale);
      const saved = { p: proxy.hero.position.clone(), r: proxy.hero.rotation.clone(), s: proxy.hero.scale.clone() };
      proxy.hero.position.set(0, 0, 0);
      proxy.hero.rotation.set(0, 0, 0);
      proxy.hero.scale.setScalar(1);
      const rig = proxy.rig,
        zero = [
          rig.armL.g,
          rig.armR.g,
          rig.armL.lower,
          rig.armR.lower,
          rig.legL.g,
          rig.legR.g,
          rig.legL.lower,
          rig.legR.lower,
          rig.legL.foot,
          rig.legR.foot,
          proxy.body,
        ];
      const keepRot = zero.map((o) => o.rotation.clone()),
        keepY = proxy.body.position.y;
      zero.forEach((o) => o.rotation.set(0, 0, 0));
      proxy.body.position.y = HIP;
      proxy.hero.updateMatrixWorld(true);

      // skirt and blades are built in the model's own rest pose
      // at rest every bone carries the same transform from bind space to the world; undo it for the skirt's vertices
      root.updateMatrixWorld(true);
      skeleton.update();
      const pIx = skeleton.bones.indexOf(bone('Bip01 Pelvis'));
      const toBind = new THREE.Matrix4()
        .multiplyMatrices(bone('Bip01 Pelvis').matrixWorld, skeleton.boneInverses[pIx])
        .multiply(bodyMesh.bindMatrix)
        .invert();
      // a new skinned piece, sitting where the body does and bound to its skeleton
      const attach = (sk) => {
        bodyMesh.parent.add(sk);
        sk.position.copy(bodyMesh.position);
        sk.quaternion.copy(bodyMesh.quaternion);
        sk.scale.copy(bodyMesh.scale);
        sk.updateMatrixWorld(true);
        sk.bind(skeleton, bodyMesh.bindMatrix);
        skinned.push(sk);
        return sk;
      };
      const skirts = (opts.skirt ? [].concat(opts.skirt) : []).map((so) => {
        const sk = attach(buildSkirt(skeleton, toBind, bone, U, so));
        if (so.fur) furShells(sk, so.fur).forEach(attach);
        return sk;
      });
      if (opts.mantle) {
        const mo = opts.mantle === true ? {} : opts.mantle,
          mt = attach(buildMantle(skeleton, toBind, bone, bodyMesh, mo));
        if (mo.fur) furShells(mt, mo.fur).forEach(attach);
      }
      if (opts.cuffs)
        ['L', 'R'].forEach((sd) => {
          const cf = attach(buildCuff(skeleton, toBind, bone, sd, opts.cuffs));
          if (opts.cuffs.fur) furShells(cf, opts.cuffs.fur).forEach(attach);
        });
      // Rook's kit: helmet, gloves, and markers in his palms for the stick
      // the kit is built from positions in the world, so each piece is put into wrap (which is scaled to his height)
      // with wrap's own transform taken back out
      wrap.updateMatrixWorld(true);
      const unwrap = wrap.matrixWorld.clone().invert(),
        place = (o) => {
          wrap.add(o);
          o.applyMatrix4(unwrap);
          o.updateMatrixWorld(true);
        };
      // (Tesa's kokoshnik is placed the same way, from the same measurement of the head)
      const gear = [],
        palms = [];
      const headTop = () => {
        const headMesh = skinned.find((m) => m.material === head),
          v = new THREE.Vector3();
        if (!headMesh) return null;
        headMesh.updateMatrixWorld(true);
        const n = headMesh.geometry.attributes.position.count,
          at = (i) => headMesh.getVertexPosition(i, v).applyMatrix4(headMesh.matrixWorld);
        let top = -Infinity;
        for (let i = 0; i < n; i++) top = Math.max(top, at(i).y);
        const lo = new THREE.Vector3(Infinity, 0, Infinity),
          hi = new THREE.Vector3(-Infinity, 0, -Infinity);
        for (let i = 0; i < n; i++) {
          at(i);
          if (v.y < top - 0.12) continue;
          lo.min(v);
          hi.max(v);
        }
        return { top, c: lo.clone().add(hi).multiplyScalar(0.5), r: hi.clone().sub(lo).multiplyScalar(0.5) };
      };
      if (opts.tiara) {
        const h = headTop();
        if (h) {
          const t = buildTiara(h.top, h.c, h.r);
          place(t);
          bone('Bip01 Head').attach(t);
          gear.push(t);
        }
      }
      if (opts.hockey) {
        const headMesh = skinned.find((m) => m.material === head),
          v = new THREE.Vector3();
        if (headMesh) {
          // the head as it stands now, at rest, in the world (the head has its own bind space, not the body's: measured
          // through the body's, the helmet came out 15 cm low, round his mouth)
          headMesh.updateMatrixWorld(true);
          const n = headMesh.geometry.attributes.position.count,
            at = (i) => headMesh.getVertexPosition(i, v).applyMatrix4(headMesh.matrixWorld);
          let top = -Infinity;
          for (let i = 0; i < n; i++) top = Math.max(top, at(i).y);
          const lo = new THREE.Vector3(Infinity, 0, Infinity),
            hi = new THREE.Vector3(-Infinity, 0, -Infinity);
          for (let i = 0; i < n; i++) {
            at(i);
            if (v.y < top - 0.12) continue;
            lo.min(v);
            hi.max(v);
          }
          const helmet = buildHelmet(
            top,
            lo.clone().add(hi).multiplyScalar(0.5),
            hi.clone().sub(lo).multiplyScalar(0.5),
          );
          place(helmet);
          bone('Bip01 Head').attach(helmet);
          gear.push(helmet);
        }
        const finger = (sd) =>
          Object.keys(bones).find((n) => new RegExp(sd + '[ _]Finger2$').test(n)) ||
          Object.keys(bones).find((n) => new RegExp(sd + '[ _]Finger\\d$').test(n));
        for (const sd of ['R', 'L']) {
          const hand = bone('Bip01 ' + sd + ' Hand'),
            fn = finger(sd),
            H = hand.getWorldPosition(new THREE.Vector3()),
            F = fn ? bones[fn].getWorldPosition(new THREE.Vector3()) : H.clone().add(new THREE.Vector3(0, -0.08, 0)),
            dir = F.clone().sub(H).normalize();
          const glove = buildGlove(H, dir);
          place(glove);
          hand.attach(glove);
          gear.push(glove);
          const palm = new THREE.Object3D();
          palm.position.copy(H).addScaledVector(dir, 0.075);
          place(palm);
          hand.attach(palm);
          palms.push(palm);
        }
      }
      const blades = [];
      for (const sd of ['L', 'R']) {
        const foot = bone('Bip01 ' + sd + ' Foot'),
          toe = bone('Bip01 ' + sd + ' Toe0'),
          F = foot.getWorldPosition(new THREE.Vector3()),
          T = toe.getWorldPosition(new THREE.Vector3());
        const b = opts.hockey ? buildHockeyBlade() : buildBlade();
        wrap.add(b);
        b.position.set((F.x + T.x) / 2, 0, (F.z - 0.07 + T.z + 0.05) / 2 - 0.01);
        b.updateMatrixWorld(true);
        foot.attach(b);
        blades.push(b);
      }

      // pair each stand-in joint with the bone on the same side of the body
      const side = (o) => Math.sign(o.getWorldPosition(_v).x);
      const B = (sd, part) => bone('Bip01 ' + (sd > 0 ? 'L' : 'R') + ' ' + part);
      const pairs = [];
      for (const [arm, leg] of [
        [rig.armL, rig.legL],
        [rig.armR, rig.legR],
      ]) {
        const sa = side(arm.g),
          sl = side(leg.g);
        pairs.push(
          [leg.g, B(sl, 'Thigh'), B(sl, 'Calf')],
          [leg.lower, B(sl, 'Calf'), B(sl, 'Foot')],
          [leg.foot, B(sl, 'Foot'), null],
          [arm.g, B(sa, 'UpperArm'), B(sa, 'Forearm')],
          [arm.lower, B(sa, 'Forearm'), B(sa, 'Hand')],
        );
      }
      // straighten the model's limbs to hang the way the stand-in's do at rest (A-pose arms come down to her sides)
      const order = ['Thigh', 'Calf', 'UpperArm', 'Forearm'];
      for (const part of order)
        for (const [, b, aim] of pairs) {
          if (!b.name.endsWith(part) || !aim) continue;
          const from = aim
            .getWorldPosition(new THREE.Vector3())
            .sub(b.getWorldPosition(new THREE.Vector3()))
            .normalize();
          _q.setFromUnitVectors(from, DOWN);
          const w = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q);
          b.parent.getWorldQuaternion(_q2).invert();
          b.quaternion.copy(_q2.multiply(w));
          b.updateMatrixWorld(true);
        }
      const pelvis = bone('Bip01 Pelvis');
      const map = [[proxy.body, pelvis], ...pairs.map(([p, b]) => [p, b])].map(([p, b]) => ({
        p,
        b,
        restP: p.getWorldQuaternion(new THREE.Quaternion()).invert(),
        restB: b.getWorldQuaternion(new THREE.Quaternion()),
      }));
      const pelvisInBody = proxy.body.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
      const heroInv = new THREE.Matrix4().copy(proxy.hero.matrixWorld).invert();
      const bladeTips = blades.map(() => [new THREE.Vector3(0, 0, -0.13), new THREE.Vector3(0, 0, 0.12)]); // the runner's heel and toe ends, in each blade's own space

      // put the stand-in and its top node back as they were
      zero.forEach((o, i) => o.rotation.copy(keepRot[i]));
      proxy.body.position.y = keepY;
      proxy.hero.position.copy(saved.p);
      proxy.hero.rotation.copy(saved.r);
      proxy.hero.scale.copy(saved.s);
      proxy.hero.updateMatrixWorld(true);

      // mirror image for the reflection in the ice: the same skinned meshes drawn flipped below the surface
      const R = new THREE.Matrix4().makeScale(1, -1, 1),
        mirrorMats = new Map(),
        mirrors = [];
      const mm = (mat) => {
        if (!mirrorMats.has(mat)) {
          const c = mat.clone();
          c.transparent = true;
          c.opacity = 0.3;
          c.depthWrite = true;
          c.onBeforeCompile = mat.onBeforeCompile;
          mirrorMats.set(mat, c);
        }
        return mirrorMats.get(mat);
      };
      for (const m of skinned) {
        const r = new THREE.SkinnedMesh(m.geometry, mm(m.material));
        r.bindMode = THREE.DetachedBindMode;
        r.bind(skeleton, m.bindMatrix);
        r.matrixAutoUpdate = false;
        r.frustumCulled = false;
        r.renderOrder = -1;
        if (m.morphTargetInfluences) r.morphTargetInfluences = m.morphTargetInfluences;
        proxy.hero.parent.add(r);
        mirrors.push(r);
      }
      // the blades too, and Rook's helmet and gloves
      const props = blades.concat(gear);
      const bladeMirrors = props.map((b) => {
        const g = b.clone(true);
        g.matrixAutoUpdate = false;
        g.traverse((o) => {
          o.matrixAutoUpdate = false;
          if (o.material) {
            o.material = o.material.clone();
            o.material.transparent = true;
            o.material.opacity = 0.3;
          }
        });
        proxy.hero.parent.add(g);
        return g;
      });

      // strands of long hair and beard, simulated in the world and drawn there
      let strands = null;
      if (opts.longHair) {
        const headMesh = skinned.find((m) => m.material === head && m.geometry.attributes._hair);
        if (headMesh) {
          strands = createHair(headMesh, bone, opts.longHair);
          strands.parts.forEach((s) => {
            proxy.hero.parent.add(s.mesh);
            proxy.hero.parent.add(s.mirror);
          });
        }
      }
      const strandsShow = () => {
        if (strands)
          strands.parts.forEach((s) => {
            s.mesh.visible = visible;
            s.mirror.visible = visible && reflect;
          });
      };

      // Glints (v3-look41, at night): small stars of light winking on and off over her coat, skirt and kokoshnik. Each
      // sits on a point of the cloth, found every frame through its morphs and skinning so it moves with the cloth, and
      // moves to a new point after each flash. Hidden where the cloth is behind her (depth tested).
      // opts.glints: { count, size (metres), bright (peak, 1 white; above it the bloom catches it), rate: [slowest,
      //   fastest] flashes a second, coat (share on the outer layer),
      //   tiara (share on the kokoshnik), day (how much shows by day; at night all of it) }
      let glints = null;
      if (opts.glints && skirts.length) {
        const G = opts.glints,
          n = G.count,
          gPos = new Float32Array(n * 3),
          gCol = new Float32Array(n * 3),
          gAt = [],
          gPh = new Float32Array(n),
          gRate = new Float32Array(n),
          tiaraMeshes = [];
        gear.forEach((g) => g.traverse((o) => o.isMesh && !o.isSkinnedMesh && tiaraMeshes.push(o)));
        const pick = (i) => {
          const u = Math.random(),
            m =
              tiaraMeshes.length && u < (G.tiara || 0)
                ? tiaraMeshes[Math.floor(Math.random() * tiaraMeshes.length)]
                : skirts[u < (G.tiara || 0) + (1 - (G.tiara || 0)) * (G.coat ?? 0.75) ? skirts.length - 1 : 0];
          gAt[i] = [m, Math.floor(Math.random() * m.geometry.attributes.position.count)];
        };
        for (let i = 0; i < n; i++) {
          pick(i);
          gPh[i] = Math.random();
          gRate[i] = G.rate[0] + Math.random() * (G.rate[1] - G.rate[0]);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
        const pts = new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            alphaMap: starDot(64),
            vertexColors: true,
            size: G.size,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        pts.frustumCulled = false;
        pts.renderOrder = 7;
        proxy.hero.parent.add(pts);
        const gv = new THREE.Vector3(),
          toCam = new THREE.Vector3();
        glints = {
          pts,
          amt: G.day || 0,
          update(dt) {
            pts.visible = visible && glints.amt > 0.01;
            if (!pts.visible) return;
            // seen from further off (skating, not the front page) they shrink less than she does, so they still show
            const far = opts.camera ? opts.camera.position.distanceTo(proxy.hero.position) : 5;
            pts.material.size = G.size * Math.max(1, Math.pow(far / 5, 0.6));
            for (let i = 0; i < n; i++) {
              const k = i * 3;
              gPh[i] += dt * gRate[i];
              if (gPh[i] >= 1) {
                gPh[i] -= 1;
                pick(i);
              }
              // a quick flash in the middle of each cycle, bright enough that the night's faint bloom catches it
              const b = Math.pow(1 - Math.abs(gPh[i] * 2 - 1), 6) * glints.amt * (G.bright || 1);
              if (b < 0.01) {
                gCol[k] = gCol[k + 1] = gCol[k + 2] = 0;
                continue;
              }
              const [m, vi] = gAt[i];
              m.getVertexPosition(vi, gv);
              m.localToWorld(gv);
              // a little toward the camera, so the cloth it sits on does not cut it
              if (opts.camera) gv.addScaledVector(toCam.subVectors(opts.camera.position, gv).normalize(), 0.03);
              gPos[k] = gv.x;
              gPos[k + 1] = gv.y;
              gPos[k + 2] = gv.z;
              gCol[k] = 0.9 * b;
              gCol[k + 1] = 0.95 * b;
              gCol[k + 2] = b;
            }
            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
          },
        };
      }

      let ground = 0,
        visible = true,
        reflect = true,
        skirtT = 0,
        flare = 0,
        flareV = 0,
        spin = 0,
        spinV = 0,
        lastYaw = 0,
        yawRate = 0;
      const api = {
        root: wrap,
        get hair() {
          return strands;
        },
        // Rook's stick grips: the right palm (bottom hand), the left palm (top hand) and the right elbow, in the world
        hands(bottom, top, elbow) {
          if (!palms.length) return false;
          palms[0].getWorldPosition(bottom);
          palms[1].getWorldPosition(top);
          bone('Bip01 R Forearm').getWorldPosition(elbow);
          return true;
        },
        // k: 0 by day, 1 at night
        night(k) {
          if (strands) strands.glow(k);
          if (glints) glints.amt = k + (1 - k) * (opts.glints.day || 0);
        },
        set visible(v) {
          if (v && !visible && strands) strands.reset();
          visible = v;
          wrap.visible = v;
          if (glints) glints.pts.visible = v && glints.amt > 0.01;
          strandsShow();
          mirrors.forEach((m) => {
            m.visible = v && reflect;
          });
          bladeMirrors.forEach((m) => {
            m.visible = v && reflect;
          });
        },
        get visible() {
          return visible;
        },
        reflection(on, opacity) {
          reflect = on;
          strandsShow();
          if (strands)
            strands.parts.forEach((s) => {
              s.mirror.material.opacity = opacity;
            });
          mirrors.forEach((m) => {
            m.visible = visible && on;
          });
          bladeMirrors.forEach((m) => {
            m.visible = visible && on;
          });
          mirrorMats.forEach((m) => {
            m.opacity = opacity;
          });
          bladeMirrors.forEach((g) =>
            g.traverse((o) => {
              if (o.material) o.material.opacity = opacity;
            }),
          );
        },
        // after the stand-in has been posed this frame
        update(dt, S, spinFlare, spinOnly) {
          if (!visible) return;
          proxy.hero.updateMatrixWorld(true);
          for (const e of map) {
            // the stand-in joint's turn away from its rest, applied to the bone's rest
            e.p.getWorldQuaternion(_q).multiply(e.restP).multiply(e.restB);
            if (e.b === pelvis) {
              proxy.body.localToWorld(_v.copy(pelvisInBody));
              _v.y += ground;
              e.b.parent.worldToLocal(_v);
              e.b.position.copy(_v);
            }
            e.b.parent.getWorldQuaternion(_q2).invert();
            e.b.quaternion.copy(_q2.multiply(_q));
            e.b.updateMatrixWorld(true);
          }
          // keep the blades on the ice: the stand-in's legs are not quite the same length as hers
          if (S.grounded && S.visY < 0.02) {
            let low = Infinity;
            blades.forEach((b, i) =>
              bladeTips[i].forEach((t) => {
                low = Math.min(low, _v2.copy(t).applyMatrix4(b.matrixWorld).y);
              }),
            );
            // move her so the lowest blade point sits on the ice
            if (isFinite(low)) ground -= low * (1 - Math.exp(-14 * dt));
          }
          // the spin's pull on cloth and hair, given weight: it builds and eases off over a second or so instead of
          // snapping to the spin rate (a critically damped spring), so the skirt and locks open in step with the spin
          const sd = Math.min(dt, 0.05),
            k = 5,
            kc = 2 * Math.sqrt(k);
          flareV += (k * (Math.min(1, spinFlare * (opts.flareGain || 1)) - flare) - kc * flareV) * sd;
          flare = THREE.MathUtils.clamp(flare + flareV * sd, 0, 1);
          spinV += (k * ((spinOnly ?? spinFlare) - spin) - kc * spinV) * sd;
          spin = THREE.MathUtils.clamp(spin + spinV * sd, 0, 1);
          // which way and how fast she turns (radians a second), for the cloth's trail
          const yaw = proxy.hero.rotation.y,
            dYaw = Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw));
          lastYaw = yaw;
          if (dt > 0) yawRate += (dYaw / dt - yawRate) * (1 - Math.exp(-4 * dt));
          if (skirts.length) {
            skirtT += dt * (1.5 + 3.5 * flare);
            skirts.forEach((sk, i) => {
              // each layer on its own spring, a little underdamped so the cloth swings past and settles: a light skirt
              // answers quickly, a heavy coat slowly
              const c = sk.userData.cloth,
                kk = c.o.k || k,
                cc = 1.3 * Math.sqrt(kk);
              c.v += (kk * (Math.min(1, spinFlare * (c.o.gain || opts.flareGain || 1)) - c.f) - cc * c.v) * sd;
              c.f = THREE.MathUtils.clamp(c.f + c.v * sd, 0, 1);
              const f = c.f,
                mi = sk.morphTargetInfluences,
                ph = skirtT + i * 0.9,
                w = 0.15 + 0.85 * f;
              mi[0] = f < 0.5 ? 2 * f : 2 - 2 * f;
              mi[1] = f < 0.5 ? 0 : 2 * f - 1;
              mi[2] = w * Math.cos(ph);
              mi[3] = w * Math.sin(ph);
              mi[4] = THREE.MathUtils.clamp(-yawRate / 9, -1, 1) * f;
            });
          }
          if (strands && opts.camera) strands.update(dt, opts.camera, opts.wind || WIND, spin);
          if (glints) {
            wrap.updateMatrixWorld(true);
            glints.update(dt);
          }
          if (reflect) {
            mirrors.forEach((r, i) => {
              r.matrix.multiplyMatrices(R, skinned[i].bindMatrix);
              r.matrixWorld.copy(r.matrix);
            });
            props.forEach((b, i) => {
              const g = bladeMirrors[i];
              g.matrixWorld.multiplyMatrices(R, b.matrixWorld);
              g.children.forEach((c) => c.matrixWorld.multiplyMatrices(g.matrixWorld, c.matrix));
            });
          }
        },
      };
      onReady(api);
    })
    .catch((e) => console.warn('avatar did not load', e));
}
