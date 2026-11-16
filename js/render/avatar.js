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

const LIFT = 0.045;
const WIND = { x: 1.8, y: 0.75 };                    // a breeze over the lake, metres per second (same way the snow drifts)                                   // how far the blades raise her above where her shoes were
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

function tex(loader, url, srgb) { const t = loader.load(url); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// Costume material: iridescent, with a soft sheen and sequins that flash when they catch the sun (mask red = costume).
function costumeMaterial(map, normalMap, mask, U, look) {
  const m = new THREE.MeshPhysicalMaterial({ map, normalMap, roughness: look.rough || 0.55, metalness: 0, iridescence: look.iridescence, iridescenceMap: mask, iridescenceIOR: 1.7, iridescenceThicknessRange: [260, 720],
    sheen: look.sheenAmt ?? 0.35, sheenColor: new THREE.Color(look.sheen), sheenRoughness: 0.45, envMapIntensity: 1.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask }; sh.uniforms.uTime = U.uTime; sh.uniforms.uSparkle = U.uSparkle;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uMask; uniform float uTime, uSparkle;\nfloat sh21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nvec4 mk = texture2D(uMask, vMapUv);' + (look.skinRough ? ' roughnessFactor = mix(' + look.skinRough.toFixed(2) + ', roughnessFactor, clamp(mk.r + mk.g + mk.b, 0.0, 1.0));' : '') + ' roughnessFactor = mix(roughnessFactor, 0.3, mk.r); roughnessFactor = mix(roughnessFactor, 0.42, mk.g); roughnessFactor = mix(roughnessFactor, 0.22, mk.b);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>' + (look.fabricSheen ? '\n#ifdef USE_SHEEN\nmaterial.sheenColor *= clamp(mk.r + mk.g + mk.b, 0.0, 1.0);\n#endif' : ''))      // sheen on the clothes only: on skin it rims thin edges white
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
{ vec2 cell = floor(vMapUv * 640.0); float r = sh21(cell);
  if (mk.r > 0.5 && r > 0.9) { vec3 Vv = normalize(vViewPosition); vec3 Hh = normalize(directionalLights[0].direction + Vv);
    vec3 n2 = normalize(normal + (vec3(sh21(cell + 1.3), sh21(cell + 2.7), sh21(cell + 4.1)) - 0.5) * 0.9);
    float s = pow(max(dot(n2, Hh), 0.0), 90.0) * (0.55 + 0.45 * sin(uTime * 5.0 + r * 60.0));
    totalEmissiveRadiance += directionalLights[0].color * s * 0.5 * uSparkle * ${look.sparkle.toFixed(2)}; } }
#endif`);
  };
  return m;
}

// A long layered skirt from the waist down (to the knee or to the ice), skinned to the hips and thighs so it moves with the legs.
// Four morphs: 0 half open, 1 fully open (the skirt swung out nearly flat, like a petal), 2 and 3 flutes round the
// hem. As she spins, update() swings it open along the arc between those shapes and sends the flutes travelling
// round, so it blooms instead of just stretching.
// toBind: from where she stands now back into the model's bind space (where its skinning weights were made)
// o: { length, waist: [rx, rz], rest, open (degrees), bell (below 1: fuller near the waist), follow (how much the hem
//      follows each leg), colours: [top, hem], opacity, sheen, sparkle }
function buildSkirt(skeleton, toBind, bone, U, o) {
  const pelvis = bone('Bip01 Pelvis'), thighL = bone('Bip01 L Thigh'), thighR = bone('Bip01 R Thigh');
  const ix = (b) => skeleton.bones.indexOf(b);
  const P = new THREE.Vector3(); pelvis.getWorldPosition(P);
  const RINGS = 14, SEG = 72, waistY = P.y + 0.07, L = o.length, [rx0, rz0] = o.waist, D = Math.PI / 180;
  const th0 = o.rest * D, thH = (o.rest + o.open) / 2 * D, th1 = o.open * D;
  const pos = [], half = [], full = [], w1 = [], w2 = [], col = [], si = [], sw = [], idx = [];
  const invRot = new THREE.Matrix3().setFromMatrix4(toBind), v = new THREE.Vector3(), q = new THREE.Vector3();
  const top = new THREE.Color(o.colours[0]), hem = new THREE.Color(o.colours[1]), c = new THREE.Color();
  const bell = o.bell || 1, follow = o.follow ?? 0.7;
  const at = (a, t, th, out) => { const fold = 0.011 * t * Math.sin(a * 16), lift = th === th1 ? 0.05 * t * t * t : 0, r = L * Math.pow(t, bell) * Math.sin(th) + fold;
    return out.set(P.x + Math.sin(a) * (rx0 + r), waistY - L * t * Math.cos(th) + lift, P.z + 0.01 + Math.cos(a) * (rz0 + r)); };
  const rel = (arr, d) => { d.applyMatrix3(invRot); arr.push(d.x, d.y, d.z); };
  for (let r = 0; r <= RINGS; r++) { const t = r / RINGS; c.copy(top).lerp(hem, Math.pow(t, 1.3));
    for (let sg = 0; sg <= SEG; sg++) { const a = sg / SEG * Math.PI * 2;
      at(a, t, th0, v); const w = v.clone().applyMatrix4(toBind); pos.push(w.x, w.y, w.z);
      rel(half, at(a, t, thH, q).sub(v)); rel(full, at(a, t, th1, q).sub(v));
      // flutes: the hem rising and falling in soft waves, and swelling out a little where it rises
      const k = t * t, ra = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      rel(w1, ra.clone().multiplyScalar(0.03 * k * Math.sin(a * 7)).add(new THREE.Vector3(0, 0.07 * k * Math.sin(a * 7), 0)));
      rel(w2, ra.clone().multiplyScalar(0.03 * k * Math.cos(a * 7)).add(new THREE.Vector3(0, 0.07 * k * Math.cos(a * 7), 0)));
      col.push(c.r, c.g, c.b);
      // the half of the skirt over each leg follows that leg, more so towards the hem
      const side = Math.sin(a), wl = follow * t * THREE.MathUtils.smoothstep(side, 0.05, 0.7), wr = follow * t * THREE.MathUtils.smoothstep(-side, 0.05, 0.7);
      si.push(ix(pelvis), ix(thighL), ix(thighR), 0); sw.push(1 - wl - wr, wl, wr, 0); } }
  for (let r = 0; r < RINGS; r++) for (let sg = 0; sg < SEG; sg++) { const a = r * (SEG + 1) + sg, b = a + SEG + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.morphAttributes.position = [half, full, w1, w2].map((a) => new THREE.Float32BufferAttribute(a, 3)); g.morphTargetsRelative = true; g.computeVertexNormals();
  const sheer = o.opacity < 1;
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: sheer ? 0.5 : 0.32, iridescence: o.iridescence ?? 0.6, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 620], sheen: o.sheen ?? 0.7,
    sheenColor: new THREE.Color(0xf2ecff), sheenRoughness: 0.35, side: THREE.DoubleSide, transparent: sheer, opacity: o.opacity, depthWrite: !sheer });
  m.onBeforeCompile = (sh) => { sh.uniforms.uTime = U.uTime; sh.uniforms.uSparkle = U.uSparkle;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSk;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSk = position * 160.0;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSk; uniform float uTime, uSparkle;\nfloat sh31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#if NUM_DIR_LIGHTS > 0
{ vec3 cell = floor(vSk); float r = sh31(cell); if (r > ${(1 - 0.1 * (o.sparkle ?? 1)).toFixed(3)}) { vec3 Hh = normalize(directionalLights[0].direction + normalize(vViewPosition));
  vec3 n2 = normalize(normal + (vec3(sh31(cell + 1.3), sh31(cell + 2.7), sh31(cell + 4.1)) - 0.5) * 1.1);
  totalEmissiveRadiance += directionalLights[0].color * pow(max(dot(n2, Hh), 0.0), 90.0) * (0.55 + 0.45 * sin(uTime * 5.0 + r * 60.0)) * 0.5 * uSparkle; } }
#endif`); };
  const mesh = new THREE.SkinnedMesh(g, m); mesh.castShadow = !sheer; mesh.frustumCulled = false; mesh.morphTargetInfluences = [0, 0, 0, 0]; if (sheer) mesh.renderOrder = 2;
  return mesh;
}

// A fur mantle over the shoulders (for the viking), shaped to sit on the body: a thick ring of fur from the base of
// the neck out over the shoulders, rolled under at its ragged outer edge. Built standing in the rest pose, where each
// point is dropped onto the (already bulked) body, then skinned to the neck, upper back and collarbones.
function furTexture() {
  const W = 128, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  let s = 77; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#5e4e3e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) { const x = rnd() * W, y = rnd() * H, l = 4 + rnd() * 10, a = Math.PI / 2 + (rnd() - 0.5) * 0.7, v = rnd();
    g.strokeStyle = v < 0.4 ? `rgba(52,40,30,${0.35 + rnd() * 0.3})` : v < 0.9 ? `rgba(120,102,82,${0.35 + rnd() * 0.3})` : `rgba(180,165,145,${0.4 + rnd() * 0.3})`;
    g.lineWidth = 1 + rnd() * 1.4; for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); } }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function buildMantle(skeleton, toBind, bone, body) {
  const N = bone('Bip01 Neck').getWorldPosition(new THREE.Vector3()), ix = (n) => skeleton.bones.indexOf(bone(n));
  const RINGS = 7, SEG = 56, rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
  const hash = (k) => { const x = Math.sin(k * 127.1) * 43758.5453; return x - Math.floor(x); };
  const rag = (a) => { const k = a / (Math.PI * 2) * 22, i = Math.floor(k), f = k - i; return hash(i) * (1 - f) + hash(i + 1) * f; };
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const cols = SEG + 1; let rows = 0;
  const ring = (t, extraR, dy) => { rows++;
    for (let sg = 0; sg <= SEG; sg++) { const a = sg / SEG * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
      const back = ca < 0 ? -ca : 0, front = ca > 0 ? ca : 0;
      const rx = 0.1 + t * (0.19 + 0.03 * rag(a)), rz = (0.092 - 0.01 * front) + t * (0.06 + 0.05 * back - 0.01 * front + 0.025 * rag(a + 1));
      const x = sa * (rx + extraR), z = ca * (rz + extraR);
      o.set(N.x + x, N.y + 0.45, N.z + z); rc.set(o, down); const hit = rc.intersectObject(body, false)[0];
      let y = hit && hit.point.y > N.y - 0.3 ? hit.point.y : N.y - 0.1 - 0.15 * t;
      y += 0.03 + 0.02 * t + 0.035 * Math.abs(sa) * t * t + dy;          // more room over the shoulders, which swell when the arms move
      pos.push(N.x + x, y, N.z + z); uv.push(a / (Math.PI * 2) * 5, t * 1.6 + dy * 4);
      // skin: neck at the collar, upper back in the middle, collarbones and a little of the upper arms at the sides
      const side = Math.abs(sa), wN = Math.max(0, 0.5 - t) * 0.9, wC = side * t * 0.55;
      si.push(ix('Bip01 Neck'), ix('Bip01 Spine2'), ix('Bip01 ' + (sa > 0 ? 'L' : 'R') + ' Clavicle'), 0); sw.push(wN, Math.max(0, 1 - wN - wC), wC, 0); } };
  ring(0, -0.01, -0.035);                                    // tucked in round the neck
  for (let r = 0; r <= RINGS; r++) ring(r / RINGS, 0, 0);
  ring(1, 0.008, -0.03); ring(1, -0.012, -0.045);            // the rolled outer edge
  for (let r = 0; r < rows - 1; r++) for (let sg = 0; sg < SEG; sg++) { const a = r * cols + sg, b = a + cols; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const pts = []; for (let i = 0; i < pos.length; i += 3) pts.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(toBind));
  const g = new THREE.BufferGeometry(); g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ map: furTexture(), roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  const mesh = new THREE.SkinnedMesh(g, m); mesh.castShadow = true; mesh.frustumCulled = false; return mesh;
}

// A figure-skating blade: a thin steel runner with a curved toe and picks, on a short holder under the boot.
function buildBlade() {
  const s = new THREE.Shape(), L = 0.3;
  s.moveTo(-L / 2, 0.0); s.lineTo(L / 2 - 0.05, 0.0); s.quadraticCurveTo(L / 2 + 0.012, 0.004, L / 2, 0.034);
  s.lineTo(L / 2 - 0.012, 0.03); s.lineTo(L / 2 - 0.02, 0.04); s.lineTo(-L / 2 + 0.02, 0.04); s.quadraticCurveTo(-L / 2, 0.035, -L / 2, 0.0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0045, bevelEnabled: false }); g.translate(0, 0, -0.00225); g.rotateY(-Math.PI / 2);      // length along z (toe at +z)
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.18 });
  const grp = new THREE.Group(), runner = new THREE.Mesh(g, steel); grp.add(runner);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.24), steel); plate.position.y = 0.043; grp.add(plate);
  grp.traverse((o) => { o.castShadow = true; }); return grp;
}

// models: the stand-in figures (model.js); ix: which of them this body belongs to.
// opts: { url, tex: { body, bodyN, mask, head, headN, hair }, height (metres), skirt (bool), look: { iridescence, sheen, sparkle } }
// bulk up a body: push each vertex out along its normal by an amount (metres) set per bone and blended by
// the skin weights, so muscle follows the limbs and the seams between body and head stay closed
// bumps: round swellings (metres) centred near a joint, for muscles that sit around one, like boulder shoulders:
// [{ bone, a: height, r: radius, out: push the centre out to the side, up: and up }]
function inflate(mesh, amounts, bumps) {
  const g = mesh.geometry, P = g.attributes.position, Nn = g.attributes.normal, I = g.attributes.skinIndex, W = g.attributes.skinWeight;
  if (!Nn || !I || !W) return;
  const per = mesh.skeleton.bones.map((b) => { const n = b.name.replace(/_/g, ' ').replace(/^Bip01 /, '').replace(/^[LR] /, ''); return amounts[n] || 0; });
  const toMesh = mesh.bindMatrix.clone().invert(), bones = mesh.skeleton.bones;
  const at = (name) => { const k = bones.findIndex((b) => b.name.replace(/_/g, ' ') === name); return k < 0 ? null : new THREE.Vector3().applyMatrix4(mesh.skeleton.boneInverses[k].clone().invert()).applyMatrix4(toMesh); };
  const bs = (bumps || []).map((b) => { const c = b.mid ? at(b.bone).lerp(at(b.mid), 0.5) : at(b.bone); if (!c) return null; c.x += Math.sign(c.x) * (b.out || 0); c.z += b.up || 0; return { c, a: b.a, r2: b.r * b.r }; }).filter(Boolean);
  // vertices split along a seam share a position but may not share a normal: push them all along the average
  const key = (i) => Math.round(P.getX(i) * 2000) + ',' + Math.round(P.getY(i) * 2000) + ',' + Math.round(P.getZ(i) * 2000), sum = new Map();
  for (let i = 0; i < P.count; i++) { const k = key(i), n = sum.get(k) || [0, 0, 0]; n[0] += Nn.getX(i); n[1] += Nn.getY(i); n[2] += Nn.getZ(i); sum.set(k, n); }
  const NA = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const n = sum.get(key(i)), l = Math.hypot(n[0], n[1], n[2]) || 1; NA[i * 3] = n[0] / l; NA[i * 3 + 1] = n[1] / l; NA[i * 3 + 2] = n[2] / l; }
  // the neck is shared by the head and the body, which are separate pieces: push it straight out from the neck's
  // axis rather than along each piece's own normals, so the two stay joined however much it grows
  const neckIx = bones.findIndex((b) => /Neck$/.test(b.name.replace(/_/g, ' ')));
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    let d = 0, wn = 0; for (let k = 0; k < 4; k++) { const bi = I.getComponent(i, k), w = W.getComponent(i, k); d += w * per[bi]; if (bi === neckIx) wn += w; }
    if (wn > 0) { const rx = P.getX(i), ry = P.getY(i) - 0.012, rl = Math.hypot(rx, ry) || 1, f = Math.min(1, wn * 1.5);
      NA[i * 3] = NA[i * 3] * (1 - f) + rx / rl * f; NA[i * 3 + 1] = NA[i * 3 + 1] * (1 - f) + ry / rl * f; NA[i * 3 + 2] *= 1 - f;
      const l = Math.hypot(NA[i * 3], NA[i * 3 + 1], NA[i * 3 + 2]) || 1; NA[i * 3] /= l; NA[i * 3 + 1] /= l; NA[i * 3 + 2] /= l; }
    if (bs.length) { v.fromBufferAttribute(P, i); for (const b of bs) d += b.a * Math.exp(-v.distanceToSquared(b.c) / b.r2); }
    if (d) P.setXYZ(i, P.getX(i) + NA[i * 3] * d, P.getY(i) + NA[i * 3 + 1] * d, P.getZ(i) + NA[i * 3 + 2] * d);
  }
  // fresh normals for the new shape, smoothed across the seams so no crease shows where the clothing was cut
  g.computeVertexNormals(); const N2 = g.attributes.normal, acc = new Map();
  for (let i = 0; i < P.count; i++) { const k = key(i), n = acc.get(k) || [0, 0, 0]; n[0] += N2.getX(i); n[1] += N2.getY(i); n[2] += N2.getZ(i); acc.set(k, n); }
  for (let i = 0; i < P.count; i++) { const n = acc.get(key(i)), l = Math.hypot(n[0], n[1], n[2]) || 1; N2.setXYZ(i, n[0] / l, n[1] / l, n[2] / l); }
  P.needsUpdate = true; N2.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere();
}

export function loadAvatar(models, ix, opts, U, onReady) {
  const url = opts.url, assets = opts.tex, proxy = { hero: models.hero, body: models.body, rig: models.chars[ix] };
  const loader = new GLTFLoader(), tl = new THREE.TextureLoader();
  // the model comes as a script holding the .glb as base64 (the host serves scripts and images, not .glb files)
  const parse = (buf) => new Promise((ok, fail) => loader.parse(buf, '', ok, fail));
  import(new URL(url, document.baseURI).href).then((m) =>      // relative to the page, like the textures
    { const bin = atob(m.default), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return parse(a.buffer); }).then((gltf) => {
    const root = gltf.scene, skinned = [];
    root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const bone = (n) => bones[n] || bones[n.replace(/ /g, '_')];      // the loader turns spaces in names into underscores
    const bodyMesh = skinned.find((m) => /body/.test(m.material.name)) || skinned[0], skeleton = bodyMesh.skeleton;
    // materials
    const mask = tex(tl, assets.mask), body = costumeMaterial(tex(tl, assets.body, true), tex(tl, assets.bodyN), mask, U, opts.look);
    const head = new THREE.MeshStandardMaterial({ map: tex(tl, assets.head, true), normalMap: tex(tl, assets.headN), roughness: 0.55, envMapIntensity: 0.8 });
    const hair = new THREE.MeshStandardMaterial({ map: tex(tl, assets.hair, true), roughness: 0.42, alphaTest: 0.35, side: THREE.DoubleSide, envMapIntensity: 0.9 });
    skinned.forEach((m) => { m.material = /head/.test(m.material.name) ? head : /opacity|hair/.test(m.material.name) ? hair : body; m.castShadow = true; m.frustumCulled = false; });
    if (opts.inflate) skinned.forEach((m) => { if (m.material === body) inflate(m, opts.inflate, opts.bumps); else if (m.material !== hair) inflate(m, opts.inflate); });
    // long hair replaces the model's own short hair cards
    if (opts.longHair) for (const m of skinned.filter((k) => k.material === hair)) { m.parent.remove(m); skinned.splice(skinned.indexOf(m), 1); }

    // stand her in the game's world: inside the stand-in's top node, raised onto her blades
    const wrap = new THREE.Group(); wrap.add(root); proxy.hero.add(wrap); root.position.y = LIFT;
    // her (or his) height: the model's own, scaled to opts.height, and the stand-in's scale taken back out
    const box = new THREE.Box3().setFromObject(root), tall = box.max.y - box.min.y, charScale = proxy.rig.scale || 1;
    wrap.scale.setScalar((opts.height || tall) / tall / charScale);
    const saved = { p: proxy.hero.position.clone(), r: proxy.hero.rotation.clone(), s: proxy.hero.scale.clone() };
    proxy.hero.position.set(0, 0, 0); proxy.hero.rotation.set(0, 0, 0); proxy.hero.scale.setScalar(1);
    const rig = proxy.rig, zero = [rig.armL.g, rig.armR.g, rig.armL.lower, rig.armR.lower, rig.legL.g, rig.legR.g, rig.legL.lower, rig.legR.lower, rig.legL.foot, rig.legR.foot, proxy.body];
    const keepRot = zero.map((o) => o.rotation.clone()), keepY = proxy.body.position.y;
    zero.forEach((o) => o.rotation.set(0, 0, 0)); proxy.body.position.y = HIP; proxy.hero.updateMatrixWorld(true);

    // skirt and blades are built in the model's own rest pose
    // at rest every bone carries the same transform from bind space to the world; undo it for the skirt's vertices
    root.updateMatrixWorld(true); skeleton.update();
    const pIx = skeleton.bones.indexOf(bone('Bip01 Pelvis'));
    const toBind = new THREE.Matrix4().multiplyMatrices(bone('Bip01 Pelvis').matrixWorld, skeleton.boneInverses[pIx]).multiply(bodyMesh.bindMatrix).invert();
    const skirts = (opts.skirt ? [].concat(opts.skirt) : []).map((so) => { const sk = buildSkirt(skeleton, toBind, bone, U, so); bodyMesh.parent.add(sk);
      sk.position.copy(bodyMesh.position); sk.quaternion.copy(bodyMesh.quaternion); sk.scale.copy(bodyMesh.scale); sk.updateMatrixWorld(true); sk.bind(skeleton, bodyMesh.bindMatrix); skinned.push(sk); return sk; });
    if (opts.mantle) { const mt = buildMantle(skeleton, toBind, bone, bodyMesh); bodyMesh.parent.add(mt); mt.position.copy(bodyMesh.position); mt.quaternion.copy(bodyMesh.quaternion); mt.scale.copy(bodyMesh.scale);
      mt.updateMatrixWorld(true); mt.bind(skeleton, bodyMesh.bindMatrix); skinned.push(mt); }
    const blades = [];
    for (const sd of ['L', 'R']) { const foot = bone('Bip01 ' + sd + ' Foot'), toe = bone('Bip01 ' + sd + ' Toe0'), F = foot.getWorldPosition(new THREE.Vector3()), T = toe.getWorldPosition(new THREE.Vector3());
      const b = buildBlade(); wrap.add(b); b.position.set((F.x + T.x) / 2, 0, (F.z - 0.07 + T.z + 0.05) / 2 - 0.01); b.updateMatrixWorld(true); foot.attach(b); blades.push(b); }

    // pair each stand-in joint with the bone on the same side of the body
    const side = (o) => Math.sign(o.getWorldPosition(_v).x);
    const B = (sd, part) => bone('Bip01 ' + (sd > 0 ? 'L' : 'R') + ' ' + part);
    const pairs = [];
    for (const [arm, leg] of [[rig.armL, rig.legL], [rig.armR, rig.legR]]) { const sa = side(arm.g), sl = side(leg.g);
      pairs.push([leg.g, B(sl, 'Thigh'), B(sl, 'Calf')], [leg.lower, B(sl, 'Calf'), B(sl, 'Foot')], [leg.foot, B(sl, 'Foot'), null],
        [arm.g, B(sa, 'UpperArm'), B(sa, 'Forearm')], [arm.lower, B(sa, 'Forearm'), B(sa, 'Hand')]); }
    // straighten the model's limbs to hang the way the stand-in's do at rest (A-pose arms come down to her sides)
    const order = ['Thigh', 'Calf', 'UpperArm', 'Forearm'];
    for (const part of order) for (const [, b, aim] of pairs) { if (!b.name.endsWith(part) || !aim) continue;
      const from = aim.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
      _q.setFromUnitVectors(from, DOWN); const w = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q);
      b.parent.getWorldQuaternion(_q2).invert(); b.quaternion.copy(_q2.multiply(w)); b.updateMatrixWorld(true); }
    const pelvis = bone('Bip01 Pelvis');
    const map = [[proxy.body, pelvis], ...pairs.map(([p, b]) => [p, b])].map(([p, b]) => ({ p, b, restP: p.getWorldQuaternion(new THREE.Quaternion()).invert(), restB: b.getWorldQuaternion(new THREE.Quaternion()) }));
    const pelvisInBody = proxy.body.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
    const heroInv = new THREE.Matrix4().copy(proxy.hero.matrixWorld).invert();
    const bladeTips = blades.map(() => [new THREE.Vector3(0, 0, -0.13), new THREE.Vector3(0, 0, 0.12)]);      // the runner's heel and toe ends, in each blade's own space

    // put the stand-in and its top node back as they were
    zero.forEach((o, i) => o.rotation.copy(keepRot[i])); proxy.body.position.y = keepY;
    proxy.hero.position.copy(saved.p); proxy.hero.rotation.copy(saved.r); proxy.hero.scale.copy(saved.s); proxy.hero.updateMatrixWorld(true);

    // mirror image for the reflection in the ice: the same skinned meshes drawn flipped below the surface
    const R = new THREE.Matrix4().makeScale(1, -1, 1), mirrorMats = new Map(), mirrors = [];
    const mm = (mat) => { if (!mirrorMats.has(mat)) { const c = mat.clone(); c.transparent = true; c.opacity = 0.3; c.depthWrite = true; c.onBeforeCompile = mat.onBeforeCompile; mirrorMats.set(mat, c); } return mirrorMats.get(mat); };
    for (const m of skinned) { const r = new THREE.SkinnedMesh(m.geometry, mm(m.material)); r.bindMode = THREE.DetachedBindMode; r.bind(skeleton, m.bindMatrix);
      r.matrixAutoUpdate = false; r.frustumCulled = false; r.renderOrder = -1; if (m.morphTargetInfluences) r.morphTargetInfluences = m.morphTargetInfluences; proxy.hero.parent.add(r); mirrors.push(r); }
    // the blades too
    const bladeMirrors = blades.map((b) => { const g = b.clone(true); g.matrixAutoUpdate = false; g.traverse((o) => { o.matrixAutoUpdate = false; if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.3; } }); proxy.hero.parent.add(g); return g; });

    // strands of long hair and beard, simulated in the world and drawn there
    let strands = null;
    if (opts.longHair) { const headMesh = skinned.find((m) => m.material === head && m.geometry.attributes._hair);
      if (headMesh) { strands = createHair(headMesh, bone, opts.longHair); strands.parts.forEach((s) => { proxy.hero.parent.add(s.mesh); proxy.hero.parent.add(s.mirror); }); } }
    const strandsShow = () => { if (strands) strands.parts.forEach((s) => { s.mesh.visible = visible; s.mirror.visible = visible && reflect; }); };

    let ground = 0, visible = true, reflect = true, skirtT = 0, flare = 0, flareV = 0, spin = 0, spinV = 0;
    const api = {
      root: wrap,
      get hair() { return strands; },
      // k: 0 by day, 1 at night
      night(k) { if (strands) strands.glow(k); },
      set visible(v) { if (v && !visible && strands) strands.reset(); visible = v; wrap.visible = v; strandsShow(); mirrors.forEach((m) => { m.visible = v && reflect; }); bladeMirrors.forEach((m) => { m.visible = v && reflect; }); },
      get visible() { return visible; },
      reflection(on, opacity) { reflect = on; strandsShow(); if (strands) strands.parts.forEach((s) => { s.mirror.material.opacity = opacity; }); mirrors.forEach((m) => { m.visible = visible && on; }); bladeMirrors.forEach((m) => { m.visible = visible && on; }); mirrorMats.forEach((m) => { m.opacity = opacity; }); bladeMirrors.forEach((g) => g.traverse((o) => { if (o.material) o.material.opacity = opacity; })); },
      // after the stand-in has been posed this frame
      update(dt, S, spinFlare, spinOnly) {
        if (!visible) return;
        proxy.hero.updateMatrixWorld(true);
        for (const e of map) {
          // the stand-in joint's turn away from its rest, applied to the bone's rest
          e.p.getWorldQuaternion(_q).multiply(e.restP).multiply(e.restB);
          if (e.b === pelvis) { proxy.body.localToWorld(_v.copy(pelvisInBody)); _v.y += ground; e.b.parent.worldToLocal(_v); e.b.position.copy(_v); }
          e.b.parent.getWorldQuaternion(_q2).invert(); e.b.quaternion.copy(_q2.multiply(_q)); e.b.updateMatrixWorld(true);
        }
        // keep the blades on the ice: the stand-in's legs are not quite the same length as hers
        if (S.grounded && S.visY < 0.02) { let low = Infinity; blades.forEach((b, i) => bladeTips[i].forEach((t) => { low = Math.min(low, _v2.copy(t).applyMatrix4(b.matrixWorld).y); }));
          if (isFinite(low)) ground -= low * (1 - Math.exp(-14 * dt)); }      // move her so the lowest blade point sits on the ice
        // the spin's pull on cloth and hair, given weight: it builds and eases off over a second or so instead of
        // snapping to the spin rate (a critically damped spring), so the skirt and locks open in step with the spin
        const sd = Math.min(dt, 0.05), k = 5, kc = 2 * Math.sqrt(k);
        flareV += (k * (spinFlare - flare) - kc * flareV) * sd; flare = THREE.MathUtils.clamp(flare + flareV * sd, 0, 1);
        spinV += (k * ((spinOnly ?? spinFlare) - spin) - kc * spinV) * sd; spin = THREE.MathUtils.clamp(spin + spinV * sd, 0, 1);
        if (skirts.length) { skirtT += dt * (1.5 + 3.5 * flare); const f = flare, A = f < 0.5 ? 2 * f : 2 - 2 * f, B = f < 0.5 ? 0 : 2 * f - 1, w = 0.1 + 0.6 * f;
          skirts.forEach((sk, i) => { const mi = sk.morphTargetInfluences, ph = skirtT + i * 0.9; mi[0] = A; mi[1] = B; mi[2] = w * Math.cos(ph); mi[3] = w * Math.sin(ph); }); }
        if (strands && opts.camera) strands.update(dt, opts.camera, opts.wind || WIND, spin);
        if (reflect) { mirrors.forEach((r, i) => { r.matrix.multiplyMatrices(R, skinned[i].bindMatrix); r.matrixWorld.copy(r.matrix); });
          blades.forEach((b, i) => { const g = bladeMirrors[i]; g.matrixWorld.multiplyMatrices(R, b.matrixWorld); g.children.forEach((c) => c.matrixWorld.multiplyMatrices(g.matrixWorld, c.matrix)); }); }
      } };
    onReady(api);
  }).catch((e) => console.warn('avatar did not load', e));
}
