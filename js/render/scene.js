// Renderer, light, the frozen lake, the weather, and the camera (close drone view, or an overview you can pinch and pan).
// Times of day ("looks") and graphics levels are switched here.
import * as THREE from './three.js';
import { CFG } from '../config.js';
import { clamp } from '../core/math.js';
import { createIce } from './ice.js';
import { createSky } from './sky.js';
import { createAtmos } from './atmos.js';
import { EffectComposer } from '../vendor/EffectComposer.js';
import { RenderPass } from '../vendor/RenderPass.js';
import { UnrealBloomPass } from '../vendor/UnrealBloomPass.js';
import { OutputPass } from '../vendor/OutputPass.js';

const DEG = Math.PI / 180, DARK = new THREE.Color().setRGB(0.085, 0.12, 0.2, THREE.SRGBColorSpace);

export function createScene(canvas) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;                // keeps colours true while rolling off bright highlights (sun glints, snow)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdbe9f6);
  const C = CFG.camera, camera = new THREE.PerspectiveCamera(C.fov, 1, 0.5, 20000); camera.up.set(0, 0, -1);      // north (-z) is always up on screen
  let ratio = 1;
  // Glow: the scene is drawn into an off-screen image, its brightest parts (sun glints, sequins, lines at night) are blurred
  // and added back, then the film-like tone mapping is applied. The blur works at a quarter of the screen's resolution to stay cheap.
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt), bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.8);
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());
  let glowOn = false;
  const resize = () => { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    composer.setPixelRatio(ratio); composer.setSize(w, h); bloom.setSize(Math.round(w * ratio / 2), Math.round(h * ratio / 2)); };
  window.addEventListener('resize', resize);

  const ice = createIce(renderer); scene.add(ice.mesh);
  const sky = createSky(renderer), atmos = createAtmos(scene);
  const hemi = new THREE.HemisphereLight(0xf2f8ff, 0xdde9f6, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 80 }); sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02; scene.add(sun); scene.add(sun.target);
  // a soft dark patch right under her, so she sits on the ice instead of floating over it
  const bc = document.createElement('canvas'); bc.width = bc.height = 64; { const g = bc.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); gr.addColorStop(0, 'rgb(97,97,97)'); gr.addColorStop(1, 'rgb(0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }      // opaque, used as an alpha map (see atmos.js)
  const blobTex = new THREE.CanvasTexture(bc);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0x14284f, alphaMap: blobTex, transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; blob.renderOrder = 1; scene.add(blob);

  // ---- night: two big follow spots on the skater, a little out of step with each other like two operators
  // tracking her by hand: each lags behind by its own amount and drifts slightly, so the pools overlap around her
  // without ever lining up exactly
  const spots = [[0xfff0d8, 7, 23, 5, 0.12, 0.45, 0.3], [0xeef3ff, -6, 23, 7, 0.2, -0.4, -0.25]].map(([c, x, y, z, lag, ox, oz]) => {
    const l = new THREE.SpotLight(c, 0, 0, 0.17, 0.4, 0); l.userData = { x, y, z, lag, ox, oz, tx: 0, tz: 0 }; scene.add(l); scene.add(l.target); return l; });
  Object.assign(spots[0].shadow, { bias: -0.0008, normalBias: 0.02 }); spots[0].shadow.mapSize.set(1024, 1024); spots[0].shadow.camera.near = 10; spots[0].shadow.camera.far = 40;
  let spotOn = 0, spotNow = 0;
  function moveSpots(S, dt, t) {
    spotNow += (spotOn - spotNow) * (1 - Math.exp(-3 * dt));
    spots.forEach((l, i) => { const u = l.userData, k = 1 - Math.exp(-dt / u.lag);
      u.tx += (S.x - u.tx) * k; u.tz += (S.z - u.tz) * k; if (Math.hypot(S.x - u.tx, S.z - u.tz) > 30) { u.tx = S.x; u.tz = S.z; }
      const wx = u.ox + 0.18 * Math.sin(t * (0.5 + i * 0.23) + i * 2), wz = u.oz + 0.18 * Math.cos(t * (0.41 + i * 0.17) + i);
      l.target.position.set(u.tx + wx, 0, u.tz + wz); l.position.set(u.tx + u.x, u.y, u.tz + u.z);
      l.intensity = spotNow * 3.0; l.visible = spotNow > 0.01; });
  }

  // ---- looks (time of day)
  const sunDir = new THREE.Vector3(0, 1, 0), iceCol = new THREE.Color();
  let look = CFG.looks[0];
  function setLook(l) {
    look = l; const el = l.sun[0] * DEG, az = l.sun[1] * DEG;
    sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    sun.color.setHex(l.sunColor); sun.intensity = l.sunPower; hemi.color.setHex(l.hemi[0]); hemi.groundColor.setHex(l.hemi[1]); hemi.intensity = l.hemi[2];
    renderer.toneMappingExposure = l.exposure; iceCol.setHex(l.ice); bloom.strength = l.glow[0]; bloom.radius = l.glow[1]; bloom.threshold = l.glow[2];
    const U = ice.uniforms; U.uDepthTint.value.setHex(l.deep); U.uSunDir.value.copy(sunDir); U.uSunCol.value.setHex(l.sunColor); U.uCloud.value = l.cloud; U.uAurora.value = l.aurora;
    scene.environment = sky.set(l, sunDir); atmos.look(l); spotOn = l.spot || 0;
    glowOn = !!q.glow && l.glow[0] > 0;      // glow only at night, for the line: by day it only hazes the ice
    document.body.classList.add('night');      // light text over the ice, which is deep blue at every time of day
  }

  // ---- graphics levels
  const levels = Object.keys(CFG.quality); let qName = coarse ? 'Balanced' : 'High', auto = true, q = CFG.quality[qName];
  function setQuality(name, isAuto) {
    qName = name; q = CFG.quality[name]; if (isAuto !== undefined) auto = isAuto;
    ratio = Math.min(window.devicePixelRatio || 1, q.dpr); renderer.setPixelRatio(ratio); resize();
    if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    atmos.quality(q); glowOn = !!q.glow && look.glow[0] > 0; spots[0].castShadow = q.shadow >= 1024;
  }
  setQuality(qName, true); setLook(look);

  // ---- camera
  const view = { zoomed: false, zf: 1, px: 0, pz: 0, zMax: 4, ppm: 20, e: 0 };
  let tanHalf = Math.tan(C.fov * Math.PI / 360), fovNow = C.fov; const far = { x: 0, z: 0, h: 60 }, tgt = new THREE.Vector3(0, 0.9, 0);
  let zoomT = 0, camSp = 0, dark = false, lookAhead = 1, air = 0, time = 0;
  const DIST = Math.hypot(C.closeHeight, C.closeBack);
  let distK = 1, distGoal = 1;                         // some places are seen from a little further back
  function toggleZoom() { view.zf = 1; view.px = 0; view.pz = 0; view.zoomed = !view.zoomed; return view.zoomed; }
  function update(game, dt, bounds, uScale) {
    const S = game.S, sp = game.speed(); time += dt;
    moveSpots(S, dt, time);
    sun.target.position.set(S.x, 0, S.z); sun.position.set(S.x + sunDir.x * 30, Math.max(sunDir.y, 0.07) * 30, S.z + sunDir.z * 30);
    const lift = Math.max(S.y, S.visY); blob.position.set(S.x, 0.012, S.z); blob.scale.setScalar(1 + lift * 0.5); blob.material.opacity = 1 / (1 + lift * 2.5);
    zoomT += ((view.zoomed ? 1 : 0) - zoomT) * (1 - Math.exp(-4.5 * dt));
    let minX = S.x, maxX = S.x, minZ = S.z, maxZ = S.z;
    if (bounds.any) { minX = Math.min(minX, bounds.minX); maxX = Math.max(maxX, bounds.maxX); minZ = Math.min(minZ, bounds.minZ); maxZ = Math.max(maxZ, bounds.maxZ); }
    const needH = Math.max(((maxZ - minZ) / 2 + 5) / tanHalf, ((maxX - minX) / 2 + 5) / (tanHalf * camera.aspect), C.minOverview) * 1.1;      // fit the drawing snugly
    const kf = 1 - Math.exp(-5 * dt); far.x += ((minX + maxX) / 2 - far.x) * kf; far.z += ((minZ + maxZ) / 2 - far.z) * kf; far.h += (needH - far.h) * kf;
    camSp += (sp - camSp) * (1 - Math.exp(-2 * dt));
    const fov = C.fov + C.fovFast * clamp((camSp - 5) / 8, 0, 1) * (1 - zoomT); if (Math.abs(fov - fovNow) > 0.02) { fovNow = fov; camera.fov = fov; camera.updateProjectionMatrix(); tanHalf = Math.tan(fov * Math.PI / 360); }
    // tilt: a little more side-on at speed and in the air, so height and pace read; back to the drawing view when slow
    air += ((S.grounded && S.visY < 0.05 ? 0 : 1) - air) * (1 - Math.exp(-(S.grounded ? 2.5 : 6) * dt));
    distK += (distGoal - distK) * (1 - Math.exp(-2 * dt));
    const tilt = (C.tilt + C.tiltSpeed * clamp((camSp - 4) / 8, 0, 1) + C.tiltAir * air) * DEG, dist = (DIST + camSp * C.speedLift) * distK * (camera.aspect < 1 ? C.portrait : 1);
    const closeH = dist * Math.cos(tilt), back = dist * Math.sin(tilt);
    view.zMax = Math.max(1.5, far.h / closeH); const fh = far.h / Math.min(view.zf, view.zMax);
    const e = zoomT * zoomT * (3 - 2 * zoomT), h = closeH * Math.pow(fh / closeH, e); view.e = e;
    // the view leads her a little, never by more than lookMax metres, and settles back onto her during a jump so the ring stays whole
    lookAhead += ((S.grounded ? 1 : 0.25) - lookAhead) * (1 - Math.exp(-5 * dt)); const la = sp > 0.1 ? Math.min(sp * C.lookAhead, C.lookMax) * lookAhead / sp : 0;
    const lx = S.x + S.vx * la, lz = S.z + S.vz * la, tx = lx + (far.x + view.px - lx) * e, tz = lz + (far.z + view.pz - lz) * e, kc = 1 - Math.exp(-8 * dt);
    tgt.x += (tx - tgt.x) * kc; tgt.z += (tz - tgt.z) * kc; tgt.y = 0.9 * (1 - e);
    camera.position.set(tgt.x, h, tgt.z + back * (1 - e) + 0.001); camera.lookAt(tgt);
    view.ppm = window.innerHeight / (2 * h * tanHalf); uScale.value = Math.max(1, (4 - 0.8 * e) / (CFG.trace.width * view.ppm));      // from high up the line stays a hairline, about a pixel and a half
    ice.material.color.copy(iceCol).lerp(DARK, e); scene.background.copy(ice.material.color); ice.material.envMapIntensity = 0.35 * (1 - e);      // dark ice makes the lines stand out
    const U = ice.uniforms; U.uTime.value = time; U.uOverview.value = e;
    atmos.update(dt, time, tgt.x, tgt.z, e);
    if ((e > 0.5) !== dark) { dark = e > 0.5; document.body.classList.toggle('dark', dark); }
    return h;
  }
  const snapTo = (x, z) => { tgt.set(x, 0.9, z); };
  const setPlace = (p) => { distGoal = p.camera || 1; };
  // called every few seconds with the measured frame rate: in Auto, step down a level when the phone cannot keep up
  const adapt = (fps) => { if (auto && fps < 22) { const i = levels.indexOf(qName); if (i < levels.length - 1) setQuality(levels[i + 1]); } return ratio; };
  return { renderer, scene, camera, view, toggleZoom, update, snapTo, setPlace, setLook, setQuality, coarse, adapt, ice, sunDir,
    get look() { return look; }, get quality() { return q; }, get qualityName() { return auto ? 'Auto (' + qName + ')' : qName; }, get auto() { return auto; }, levels,
    get ratio() { return ratio; }, render: () => { if (glowOn) composer.render(); else renderer.render(scene, camera); } };
}
