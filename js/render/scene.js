// Renderer, light, the frozen lake, the weather, and the camera (close drone view, or an overview you can pinch and pan).
// Times of day ("looks") and graphics levels are switched here.
import * as THREE from './three.js';
import { CFG } from '../config.js';
import { clamp } from '../core/math.js';
import { uCanyon, iceY } from '../core/terrain.js';
import { track, trackPoint, trackNear } from '../core/track.js';
import { createIce } from './ice.js';
import { createSlide } from './slide.js';
import { createSky } from './sky.js';
import { createAtmos } from './atmos.js';
import { EffectComposer } from '../vendor/EffectComposer.js';
import { RenderPass } from '../vendor/RenderPass.js';
import { UnrealBloomPass } from '../vendor/UnrealBloomPass.js';
import { OutputPass } from '../vendor/OutputPass.js';

const DEG = Math.PI / 180,
  wrapA = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)),
  DARK = new THREE.Color().setRGB(0.085, 0.12, 0.2, THREE.SRGBColorSpace),
  UP = new THREE.Vector3(0, 1, 0),
  FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  _n = new THREE.Vector3();

export function createScene(canvas) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps colours true while rolling off bright highlights (sun glints, snow)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbe9f6);
  const C = CFG.camera,
    camera = new THREE.PerspectiveCamera(C.fov, 1, 0.5, 20000);
  camera.up.set(0, 0, -1); // north (-z) is always up on screen
  let ratio = 1;
  // Glow: the scene is drawn into an off-screen image, its brightest parts (sun glints, sequins, lines at night) are blurred
  // and added back, then the film-like tone mapping is applied. The blur works at a quarter of the screen's resolution to stay cheap.
  // (v3-look46: 2x edge smoothing in it, not 4x; on a phone's dense screen the edges look the same, and it is a
  // full-screen image in half floats, so each sample costs)
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, rt),
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.8);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let glowOn = false;
  // sized from the canvas as it is laid out, which on a phone can be taller than the window reports
  // A Home Screen copy on iPhone can report a page height short of the screen by the status bar (797 of 844 pt), which
  // left a strip of bare page at the bottom. Measure that gap and let the ice and overlays reach down over it (--fill in
  // app.css). Only a small gap counts, so a phone whose screen size turns with it, or a split screen, is left alone.
  // The same copy held upright had the score and the front page under the status bar, so the safe area it reports at
  // the top is not trusted alone: on an iPhone Home Screen copy held upright the top keeps clear of the status bar's
  // height (that gap, and at least 50 pt), through --sbar. On its side the status bar is hidden.
  const fillScreen = (el) => {
    const root = document.documentElement,
      standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    root.style.setProperty('--fill', '0px');
    root.style.setProperty('--sbar', '0px');
    if (!standalone || !window.screen) return;
    const upright = window.innerHeight > window.innerWidth,
      full = upright ? screen.height : screen.width,
      gap = full - el.clientHeight;
    if (gap > 0 && gap < 120) root.style.setProperty('--fill', gap + 'px');
    // v3-look43: 12 pt more, since iOS also shades the page a little way below the status bar (Mark's screenshot: the
    // score sat in that shading and still read as overlapping the status bar)
    if (upright && window.navigator.standalone)
      root.style.setProperty('--sbar', Math.max(50, gap < 120 ? gap : 0) + 12 + 'px');
  };
  const resize = () => {
    fillScreen(renderer.domElement);
    const el = renderer.domElement,
      w = el.clientWidth || window.innerWidth,
      h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    bloom.setSize(Math.round((w * ratio) / 2), Math.round((h * ratio) / 2));
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  setTimeout(resize, 300);
  setTimeout(resize, 1200);

  const ice = createIce(renderer);
  scene.add(ice.mesh);
  scene.add(ice.rolling);
  // the Canyon's run (v3-look56)
  const slide = createSlide(scene, ice.trackMaterial);
  const paper = createPaper();
  scene.add(paper.mesh, paper.shade);
  const sky = createSky(renderer),
    atmos = createAtmos(scene);
  scene.add(sky.backdrop);
  // the Canyon: haze toward the horizon, in the sky's colour there, so the far hillside and the run fade into it
  const haze = new THREE.FogExp2(0xffffff, 0.0026);
  const hemi = new THREE.HemisphereLight(0xf2f8ff, 0xdde9f6, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 80 });
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  // a soft dark patch right under her, so she sits on the ice instead of floating over it
  const bc = document.createElement('canvas');
  bc.width = bc.height = 64;
  // opaque, used as an alpha map (see atmos.js)
  {
    const g = bc.getContext('2d'),
      gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 64);
    gr.addColorStop(0, 'rgb(97,97,97)');
    gr.addColorStop(1, 'rgb(0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const blobTex = new THREE.CanvasTexture(bc);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x14284f, alphaMap: blobTex, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  blob.renderOrder = 1;
  scene.add(blob);

  // ---- night: two big follow spots on the skater, a little out of step with each other like two operators
  // tracking her by hand: each lags behind by its own amount and drifts slightly, so the pools overlap around her
  // without ever lining up exactly
  const spots = [
    [0xfff0d8, 7, 23, 5, 0.12, 0.45, 0.3],
    [0xeef3ff, -6, 23, 7, 0.2, -0.4, -0.25],
  ].map(([c, x, y, z, lag, ox, oz]) => {
    const l = new THREE.SpotLight(c, 0, 0, 0.17, 0.4, 0);
    l.userData = { x, y, z, lag, ox, oz, tx: 0, tz: 0 };
    scene.add(l);
    scene.add(l.target);
    return l;
  });
  Object.assign(spots[0].shadow, { bias: -0.0008, normalBias: 0.02 });
  spots[0].shadow.mapSize.set(1024, 1024);
  spots[0].shadow.camera.near = 10;
  spots[0].shadow.camera.far = 40;
  let spotOn = 0,
    spotNow = 0;
  function moveSpots(S, dt, t) {
    spotNow += (spotOn - spotNow) * (1 - Math.exp(-3 * dt));
    spots.forEach((l, i) => {
      const u = l.userData,
        k = 1 - Math.exp(-dt / u.lag);
      u.tx += (S.x - u.tx) * k;
      u.tz += (S.z - u.tz) * k;
      if (Math.hypot(S.x - u.tx, S.z - u.tz) > 30) {
        u.tx = S.x;
        u.tz = S.z;
      }
      const wx = u.ox + 0.18 * Math.sin(t * (0.5 + i * 0.23) + i * 2),
        wz = u.oz + 0.18 * Math.cos(t * (0.41 + i * 0.17) + i);
      l.target.position.set(u.tx + wx, S.gy, u.tz + wz);
      l.position.set(u.tx + u.x, u.y + S.gy, u.tz + u.z);
      l.intensity = spotNow * 3.0;
      l.visible = spotNow > 0.01;
    });
    // with the follow spot casting her shadow, the dim night sun casts none (v3-look46): one shadow map less to draw
    // every frame, and one less for every lit pixel to look up
    sun.castShadow = !(spots[0].castShadow && spotNow > 0.5);
  }

  // ---- looks (time of day)
  const sunDir = new THREE.Vector3(0, 1, 0),
    iceCol = new THREE.Color();
  let look = CFG.looks[0];
  function setLook(l) {
    look = l;
    const el = l.sun[0] * DEG,
      az = l.sun[1] * DEG;
    sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    sun.color.setHex(l.sunColor);
    sun.intensity = l.sunPower;
    hemi.color.setHex(l.hemi[0]);
    hemi.groundColor.setHex(l.hemi[1]);
    hemi.intensity = l.hemi[2];
    renderer.toneMappingExposure = l.exposure;
    iceCol.setHex(l.ice);
    bloom.strength = l.glow[0];
    bloom.radius = l.glow[1];
    bloom.threshold = l.glow[2];
    const U = ice.uniforms;
    U.uDepthTint.value.setHex(l.deep);
    U.uSunDir.value.copy(sunDir);
    U.uSunCol.value.setHex(l.sunColor);
    U.uCloud.value = l.cloud;
    U.uAurora.value = l.aurora;
    U.uGlitter.value = l.glitter || 0;
    scene.environment = sky.set(l, sunDir);
    haze.color.setHex(l.sky[1]);
    atmos.look(l);
    spotOn = l.spot || 0;
    glowOn = !!q.glow && l.glow[0] > 0; // glow only at night, for the line: by day it only hazes the ice
    document.body.classList.add('night'); // light text over the ice, which is deep blue at every time of day
    if (sheet) setPaper(sheet);
  }
  // ---- paper: a blank sheet in place of the lake (c: a CFG.paper entry), or null for the ice
  let sheet = null;
  function setPaper(c) {
    sheet = c;
    ice.mesh.visible = !c;
    paper.mesh.visible = paper.shade.visible = !!c;
    blob.material.color.setHex(c ? 0x2a2a2e : 0x14284f);
    if (c) paper.set(c);
    // no diamond dust over a drawing on paper
    atmos.look(c ? Object.assign({}, look, { dust: 0 }) : look);
    // white light on the black sheet blooms more than the line on the ice does
    if (c && c.bloom) {
      bloom.strength = c.bloom[0];
      bloom.radius = c.bloom[1];
      bloom.threshold = c.bloom[2];
    } else if (!c) {
      bloom.strength = look.glow[0];
      bloom.radius = look.glow[1];
      bloom.threshold = look.glow[2];
    }
    // dark text on the white and the tan sheets, light text on the black one and on the ice
    document.body.classList.toggle('night', !c || c.night);
    document.body.classList.toggle('paper', !!c);
  }

  // ---- graphics levels
  const levels = Object.keys(CFG.quality);
  let qName = coarse ? 'Balanced' : 'High',
    auto = true,
    q = CFG.quality[qName];
  function setQuality(name, isAuto) {
    qName = name;
    q = CFG.quality[name];
    if (isAuto !== undefined) auto = isAuto;
    ratio = Math.min(window.devicePixelRatio || 1, q.dpr);
    renderer.setPixelRatio(ratio);
    ice.uniforms.uPx.value = ratio;
    resize();
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    atmos.quality(q);
    glowOn = !!q.glow && look.glow[0] > 0;
    spots[0].castShadow = q.shadow >= 1024;
  }
  setQuality(qName, true);
  setLook(look);

  // ---- camera
  // yaw: how far the view is swung round from looking toward -z (radians, toward +x), as drawn; only down the canyon.
  // still: paused on the scoreboard without the overview (the canyon, v3-look55: from high up it is only a patch of
  // rough ground in the dark), so the view stays where it was and nothing pans or pinches
  const view = { zoomed: false, zf: 1, px: 0, pz: 0, zMax: 4, ppm: 20, e: 0, yaw: 0, still: false };
  let noOverview = false;
  let tanHalf = Math.tan((C.fov * Math.PI) / 360),
    fovNow = C.fov;
  const far = { x: 0, z: 0, h: 60 },
    tgt = new THREE.Vector3(0, 0.9, 0);
  let zoomT = 0,
    camSp = 0,
    // the height of the ice under her, smoothed, for the view (rolling ice)
    camGy = 0,
    // her speed, smoothed more slowly, for the upright view's distance (so a push or a landing does not make it pump)
    pullSp = 0,
    dark = false,
    lookAhead = 1,
    // the view's swing round (radians), before zooming out takes it away
    swing = 0,
    // how far the view is lifted to stay clear of the canyon's sides (m)
    lift = 0,
    air = 0,
    time = 0;
  const DIST = Math.hypot(C.closeHeight, C.closeBack);
  // The front page: the view comes round low in front of her and frames her in the space left free by the status bar
  // and the choices (band: CSS pixels from the screen's top left). v3-look39 and before came in close from above and
  // set her a fixed share of the screen up, which on an iPhone put her face under the status bar.
  let showK = 0,
    showOn = false,
    offsetOn = false,
    band = null;
  const SC = C.showcase,
    shot = { d: 0, ox: 0, oy: 0 },
    camP = new THREE.Vector3(),
    camL = new THREE.Vector3(),
    shP = new THREE.Vector3(),
    shL = new THREE.Vector3();
  // where the showcase camera goes (shP, looking at shL) and how far the view is shifted (shot.ox, shot.oy, pixels)
  function frameShowcase(S, dt, w, hh) {
    const b = band || { top: hh * 0.08, bottom: hh * 0.5, left: 0, right: w },
      el = SC.elev * DEG,
      sinE = Math.sin(el),
      cosE = Math.cos(el),
      mid = (SC.low + SC.high) / 2,
      hT = SC.high - mid,
      hB = SC.low - mid,
      // a point hgt metres above or below the middle of her, in the view's -1..1 from bottom to top, from d metres away
      ny = (hgt, d) => (hgt * cosE) / ((d - hgt * sinE) * tanHalf),
      want = Math.max(0.2, (2 * (b.bottom - b.top)) / hh);
    // as close as lets her whole height fill the space, and her width fit across it
    let d = ((hT - hB) * cosE) / (tanHalf * want);
    for (let i = 0; i < 3; i++) d *= (ny(hT, d) - ny(hB, d)) / want;
    d = Math.max(d, (SC.half * w) / (tanHalf * camera.aspect * Math.max(40, b.right - b.left)));
    const ox = w / 2 - (b.left + b.right) / 2,
      k = shot.d ? 1 - Math.exp(-SC.ease * dt) : 1;
    shot.d += (d - shot.d) * k;
    // the top of her at the top of the space
    const oy = ((1 - (2 * b.top) / hh - ny(hT, shot.d)) * hh) / 2;
    shot.ox += (ox - shot.ox) * k;
    shot.oy += (oy - shot.oy) * k;
    shL.set(S.x, S.gy + mid, S.z);
    shP.set(S.x, S.gy + mid + shot.d * sinE, S.z + shot.d * cosE);
  }
  let distK = 1,
    distGoal = 1, // some places are seen from a little further back
    // and some a little more side-on (degrees)
    tiltK = 0,
    tiltGoal = 0;
  // Down the Canyon's run (v3-look56, Mark: "the camera can be more zoomed in and lower tilted up to look more at the
  // horizon, parallel to the track") the view chases her: from `back` metres behind her along the run itself (so in a
  // bend or a spiral it is still over the trough), `side` of the way out toward where she is across it, `high` metres
  // over the ice under her, looking at a point a metre over the ice `ahead` metres beyond her the way the run heads. Each
  // [slow, fast]. Then it rises, if it must, to stay `clear` above the ice under it, less and less of that along the way
  // to her middle; at once, settling back slowly.
  const TP = { x: 0, y: 0, z: 0, th: 0, bank: 0 },
    NR = { s: 0, th: 0, y: 0, bank: 0, d: 0, dist: 0 },
    aim = new THREE.Vector3();
  let sideNow = 0;
  function chase(S, dt) {
    const V = CFG.canyon.view,
      f = clamp((camSp - 3) / 14, 0, 1),
      mix = (r) => r[0] + (r[1] - r[0]) * f,
      back = mix(V.back) * (camera.aspect < 1 ? 1 : V.wide),
      high = mix(V.high) + V.air * air;
    trackNear(S.x, S.z, NR);
    sideNow += (NR.d * V.side - sideNow) * (1 - Math.exp(-4 * dt));
    trackPoint(NR.s - back, TP);
    camP.set(TP.x - Math.cos(TP.th) * sideNow, camGy + high, TP.z + Math.sin(TP.th) * sideNow);
    // ahead of her the way the run heads where she is (so in a bend she stays in the middle of the view)
    const ah = mix(V.ahead);
    aim.x = S.x + Math.sin(NR.th) * ah;
    aim.z = S.z + Math.cos(NR.th) * ah;
    aim.y = iceY(aim.x, aim.z) + 1 + (S.gy + S.y - camGy) * 0.5;
    let need = 0;
    for (let i = 0; i < 6; i++) {
      const t = i * 0.15,
        x = camP.x + (S.x - camP.x) * t,
        z = camP.z + (S.z - camP.z) * t,
        y = camP.y + (S.gy + 1 - camP.y) * t;
      need = Math.max(need, (iceY(x, z) + V.clear * (1 - t) + 0.3 * t - y) / (1 - t));
    }
    lift = need > lift ? need : lift + (need - lift) * (1 - Math.exp(-2 * dt));
    camP.y += lift;
  }
  function toggleZoom() {
    view.zf = 1;
    view.px = 0;
    view.pz = 0;
    view.zoomed = !view.zoomed;
    view.still = view.zoomed && noOverview;
    return view.zoomed;
  }
  function update(game, dt, bounds, uScale) {
    const S = game.S,
      sp = game.speed();
    time += dt;
    moveSpots(S, dt, time);
    sun.target.position.set(S.x, S.gy, S.z);
    sun.position.set(S.x + sunDir.x * 30, S.gy + Math.max(sunDir.y, 0.07) * 30, S.z + sunDir.z * 30);
    const up = Math.max(S.y, S.visY);
    // her shadow lies on the ice under her, tilted with it on rolling ice
    blob.position.set(S.x, S.gy + 0.012, S.z);
    blob.quaternion.setFromUnitVectors(UP, _n.set(-S.gx, 1, -S.gz).normalize()).multiply(FLAT);
    blob.scale.setScalar(1 + up * 0.5);
    blob.material.opacity = 1 / (1 + up * 2.5);
    zoomT += ((view.zoomed && !view.still ? 1 : 0) - zoomT) * (1 - Math.exp(-4.5 * dt));
    let minX = S.x,
      maxX = S.x,
      minZ = S.z,
      maxZ = S.z;
    if (bounds.any) {
      minX = Math.min(minX, bounds.minX);
      maxX = Math.max(maxX, bounds.maxX);
      minZ = Math.min(minZ, bounds.minZ);
      maxZ = Math.max(maxZ, bounds.maxZ);
    }
    const needH =
      Math.max(((maxZ - minZ) / 2 + 5) / tanHalf, ((maxX - minX) / 2 + 5) / (tanHalf * camera.aspect), C.minOverview) *
      1.1; // fit the drawing snugly
    const kf = 1 - Math.exp(-5 * dt);
    far.x += ((minX + maxX) / 2 - far.x) * kf;
    far.z += ((minZ + maxZ) / 2 - far.z) * kf;
    far.h += (needH - far.h) * kf;
    camSp += (sp - camSp) * (1 - Math.exp(-2 * dt));
    // the height of the ice under her, smoothed; snapped when she arrives somewhere new (a new place, the top of the run)
    if (Math.abs(S.gy - camGy) > 8) {
      camGy = S.gy;
      lift = 0;
    } else camGy += (S.gy - camGy) * (1 - Math.exp(-3 * dt));
    pullSp += (sp - pullSp) * (1 - Math.exp(-C.portraitEase * dt));
    const fast = clamp((camSp - 5) / 8, 0, 1),
      CV = CFG.canyon.view,
      fov = uCanyon.value
        ? CV.fov[camera.aspect < 1 ? 0 : 1] + CV.fovFast * fast
        : C.fov + C.fovFast * fast * (1 - zoomT);
    if (Math.abs(fov - fovNow) > 0.02) {
      fovNow = fov;
      camera.fov = fov;
      camera.updateProjectionMatrix();
      tanHalf = Math.tan((fov * Math.PI) / 360);
    }
    // tilt: a little more side-on at speed and in the air, so height and pace read; back to the drawing view when slow
    air += ((S.grounded && S.visY < 0.05 ? 0 : 1) - air) * (1 - Math.exp(-(S.grounded ? 2.5 : 6) * dt));
    distK += (distGoal - distK) * (1 - Math.exp(-2 * dt));
    tiltK += (tiltGoal - tiltK) * (1 - Math.exp(-2 * dt));
    // upright: close when she is slow, further back the faster she goes, easing back in as she slows; sideways: closer
    const pullT = clamp((pullSp - C.portraitFrom) / C.portraitSpan, 0, 1),
      portrait =
        camera.aspect < 1
          ? C.portraitNear + (C.portraitFar - C.portraitNear) * pullT * pullT * (3 - 2 * pullT)
          : C.landscape;
    showK += ((showOn ? 1 : 0) - showK) * (1 - Math.exp(-4 * dt));
    const tilt = (C.tilt + tiltK + C.tiltSpeed * clamp((camSp - 4) / 8, 0, 1) + C.tiltAir * air) * DEG,
      dist = (DIST + camSp * C.speedLift) * distK * portrait;
    const closeH = dist * Math.cos(tilt),
      back = dist * Math.sin(tilt);
    view.zMax = Math.max(1.5, far.h / closeH);
    const fh = far.h / Math.min(view.zf, view.zMax);
    const e = zoomT * zoomT * (3 - 2 * zoomT),
      h = closeH * Math.pow(fh / closeH, e);
    view.e = e;
    // the view leads her a little, never by more than lookMax metres, and settles back onto her during a jump so the ring stays whole
    lookAhead += ((S.grounded ? 1 : 0.25) - lookAhead) * (1 - Math.exp(-5 * dt));
    const la = sp > 0.1 ? (Math.min(sp * C.lookAhead, C.lookMax) * lookAhead) / sp : 0;
    const lx = S.x + S.vx * la,
      lz = S.z + S.vz * la,
      tx = lx + (far.x + view.px - lx) * e,
      tz = lz + (far.z + view.pz - lz) * e,
      kc = 1 - Math.exp(-8 * dt);
    tgt.x += (tx - tgt.x) * kc;
    tgt.z += (tz - tgt.z) * kc;
    tgt.y = (camGy + 0.9) * (1 - e);
    // zoomed out the view faces -z (north up), as the overview and its panning expect; down the Canyon's run it faces
    // the way the chase view looks (view.yaw turns the left thumb with it)
    swing = wrapA(swing * Math.exp(-2 * dt));
    view.yaw = swing * (1 - e);
    const bk = back * (1 - e) + 0.001;
    camP.set(tgt.x + bk * Math.sin(view.yaw), h + camGy * (1 - e), tgt.z + bk * Math.cos(view.yaw));
    camL.copy(tgt);
    if (uCanyon.value) {
      chase(S, dt);
      camL.copy(aim);
      swing = view.yaw = Math.atan2(camP.x - camL.x, camP.z - camL.z);
    }
    // the screen's up: the way the view faces (camera.up, which is north, -z, when not swung)
    let upYaw = view.yaw;
    if (showK > 0.002) {
      // the front page: from the play view round to the showcase view
      const el = renderer.domElement,
        w = el.clientWidth || window.innerWidth,
        hh = el.clientHeight || window.innerHeight,
        k = showK * showK * (3 - 2 * showK);
      frameShowcase(S, dt, w, hh);
      camP.lerp(shP, k);
      camL.lerp(shL, k);
      upYaw *= 1 - k;
      camera.setViewOffset(w, hh, shot.ox * k, shot.oy * k, w, hh);
      offsetOn = true;
    } else if (offsetOn) {
      camera.clearViewOffset();
      offsetOn = false;
      shot.d = 0;
    }
    camera.position.copy(camP);
    sky.backdrop.visible = !!uCanyon.value && !sheet;
    scene.fog = sky.backdrop.visible ? haze : null;
    sky.backdrop.position.copy(camP);
    // the screen's up: the way the view faces; down the Canyon's run, where the view looks out nearly level, straight up
    if (uCanyon.value) camera.up.set(0, 1, 0);
    else camera.up.set(-Math.sin(upYaw), 0, -Math.cos(upYaw));
    camera.lookAt(camL);
    view.ppm = window.innerHeight / (2 * h * tanHalf);
    uScale.value = Math.max(1, (4 - 0.8 * e) / (CFG.trace.width * view.ppm)); // from high up the line stays a hairline, about a pixel and a half
    ice.material.color.copy(iceCol).lerp(DARK, e);
    // the sheet stays the colour it is from any height: the lines on it are already dark (or glowing on black)
    scene.background.copy(sheet ? paper.mesh.material.color : ice.material.color);
    if (sheet) {
      paper.mesh.position.set(tgt.x, 0, tgt.z);
      paper.shade.position.set(S.x, 0.003, S.z);
    }
    ice.envMapIntensity = 0.35 * (1 - e); // dark ice makes the lines stand out
    ice.follow(tgt.x, tgt.z, !sheet);
    slide.update(track.hint, !!uCanyon.value && !sheet);
    const U = ice.uniforms;
    U.uTime.value = time;
    U.uOverview.value = e;
    U.uFocus.value.set(S.x, S.z);
    atmos.update(dt, time, camL.x, camL.z, e, camera.position.distanceTo(camL));
    if (e > 0.5 !== dark) {
      dark = e > 0.5;
      document.body.classList.toggle('dark', dark);
    }
    return h;
  }
  // The colour of the view along a row of the screen (cssY: CSS pixels from the top), as last drawn: five pixels
  // read back, the middle value of each channel, so a line or the skater under one of them does not count. Call
  // straight after render(), in the same frame. Reading back waits for the GPU, so call it rarely.
  const px = new Uint8Array(4),
    edge = [0, 0, 0],
    chan = [[], [], []];
  function edgeColour(cssY) {
    const gl = renderer.getContext(),
      el = renderer.domElement,
      W = gl.drawingBufferWidth,
      H = gl.drawingBufferHeight,
      y = Math.max(0, Math.min(H - 1, Math.round(H - 1 - cssY * (H / (el.clientHeight || window.innerHeight)))));
    renderer.setRenderTarget(null);
    chan.forEach((c) => (c.length = 0));
    for (const f of [0.08, 0.27, 0.5, 0.73, 0.92]) {
      gl.readPixels(Math.round((W - 1) * f), y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let k = 0; k < 3; k++) chan[k].push(px[k]);
    }
    for (let k = 0; k < 3; k++) edge[k] = chan[k].sort((a, b) => a - b)[2];
    return edge;
  }
  // on: the front page is open; b: the space left free for her (see frameShowcase), when it is known
  const showcase = (on, b) => {
    showOn = on;
    if (b) band = b;
  };
  const snapTo = (x, z) => {
    tgt.set(x, 0.9, z);
  };
  const setPlace = (p) => {
    distGoal = p.camera || 1;
    tiltGoal = p.tilt || 0;
    noOverview = !!p.canyon;
    view.still = view.zoomed && noOverview;
  };
  // called every few seconds with the measured frame rate: in Auto, step down a level when the phone cannot keep up
  const adapt = (fps) => {
    if (auto && fps < 22) {
      const i = levels.indexOf(qName);
      if (i < levels.length - 1) setQuality(levels[i + 1]);
    }
    return ratio;
  };
  return {
    renderer,
    scene,
    camera,
    view,
    slide,
    sky,
    toggleZoom,
    update,
    snapTo,
    showcase,
    edgeColour,
    // how far the view has come round to the front page's (0..1)
    get showing() {
      return showK;
    },
    setPlace,
    setLook,
    setPaper,
    get paper() {
      return sheet;
    },
    setQuality,
    coarse,
    adapt,
    ice,
    sunDir,
    get look() {
      return look;
    },
    get quality() {
      return q;
    },
    get qualityName() {
      return auto ? 'Auto (' + qName + ')' : qName;
    },
    get auto() {
      return auto;
    },
    levels,
    get ratio() {
      return ratio;
    },
    render: () => {
      if (glowOn) composer.render();
      else renderer.render(scene, camera);
    },
  };
}

// The paper sheet: an unlit plane in the sheet's own colour (so white stays white), with an optional grain, and a
// shadow catcher above it that shows only the skater's shadow.
function createPaper() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  {
    const g = c.getContext('2d');
    let s = 31;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    g.fillStyle = 'rgb(236,236,236)';
    g.fillRect(0, 0, 512, 512);
    // soft cloudy unevenness first, the way pulp settles
    for (let i = 0; i < 90; i++) {
      const x = rnd() * 512,
        y = rnd() * 512,
        r = 20 + rnd() * 70,
        v = rnd() < 0.5 ? '255,255,255' : '200,200,200';
      for (const ox of [-512, 0, 512])
        for (const oy of [-512, 0, 512]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, 'rgba(' + v + ',0.07)');
          gr.addColorStop(1, 'rgba(' + v + ',0)');
          g.fillStyle = gr;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
    }
    // the tooth of the paper: fine speckle, then short pale and dark fibres lying every which way
    const img = g.getImageData(0, 0, 512, 512),
      d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + (rnd() - 0.5) * 26;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * 512,
        y = rnd() * 512,
        a = rnd() * Math.PI,
        l = 3 + rnd() * 14,
        light = rnd() < 0.5;
      g.strokeStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(170,170,170,0.22)';
      g.lineWidth = 0.6 + rnd() * 0.8;
      for (const ox of [-512, 0, 512])
        for (const oy of [-512, 0, 512]) {
          g.beginPath();
          g.moveTo(x + ox, y + oy);
          g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
          g.stroke();
        }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // one tile of grain every 3 metres; the plane follows the camera, so the grain is pinned to the world in the shader
  const uGrain = { value: 0 };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, toneMapped: false, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrain = uGrain;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vPW;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vPW = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vPW; uniform float uGrain;`,
      )
      .replace(
        '#include <map_fragment>',
        'vec3 gr = texture2D(map, vPW / 3.0).rgb / 0.84; diffuseColor.rgb *= mix(vec3(1.0), gr, uGrain);',
      );
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -2;
  mesh.visible = false;
  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ color: 0x1a1a22, opacity: 0.2, depthWrite: false }),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  shade.renderOrder = -1;
  shade.visible = false;
  return {
    mesh,
    shade,
    set(c) {
      mat.color.setHex(c.surface);
      uGrain.value = c.grain * 0.9;
      shade.material.opacity = c.night ? 0 : 0.2;
    },
  };
}
