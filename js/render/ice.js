// The frozen lake. One large plane with a standard (physically based) material, extended in its shader with:
//   depth    clear ice with no bottom: deep blue, darkest where you look straight into it, soft light far down that shifts
//            with the view, and cracks hanging at three depths
//   clouds   soft cloud shadows drifting across the ice
//   aurora   at night, bands of coloured light reflected in the ice
// The ice writes no depth, so the skater's mirror image (drawn just below the surface) shows through it as a reflection.
import * as THREE from './three.js';

function canvasTex(size, draw, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// seeded random so the ice is the same every visit
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
// draw something on a tiling canvas: repeat it across the edges
const tile = (n, f) => { for (let ox = -n; ox <= n; ox += n) for (let oy = -n; oy <= n; oy += n) f(ox, oy); };

export function createIce(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // surface: skate scratches and frost
  const surface = canvasTex(1024, (g) => { g.scale(2, 2); const rnd = rng(7); let i, x, y, r, a;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 512);
    g.lineCap = 'round';
    for (i = 0; i < 34; i++) { x = rnd() * 512; y = rnd() * 512; r = 60 + rnd() * 260; a = rnd() * 6.28; const len = 0.15 + rnd() * 0.5, al = 0.05 + rnd() * 0.07, w = 0.6 + rnd() * 0.7;
      tile(512, (ox, oy) => { g.strokeStyle = 'rgba(255,255,255,' + al + ')'; g.lineWidth = w; g.beginPath(); g.arc(x + ox + Math.cos(a) * r, y + oy + Math.sin(a) * r, r, a + Math.PI, a + Math.PI + len); g.stroke(); }); }
    for (i = 0; i < 46; i++) { x = rnd() * 512; y = rnd() * 512; r = 3 + rnd() * 9; a = 0.06 + rnd() * 0.08;
      tile(512, (ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); }); }
  }, true);
  surface.anisotropy = aniso;
  // roughness (green channel): polished ice, slightly duller patches, and scratches that are rougher still
  const rough = canvasTex(512, (g) => { const rnd = rng(11); let i, x, y, r, a;
    g.fillStyle = 'rgb(0,46,0)'; g.fillRect(0, 0, 512, 512); g.lineCap = 'round';
    for (i = 0; i < 40; i++) { x = rnd() * 512; y = rnd() * 512; r = 30 + rnd() * 80; const v = Math.round(40 + rnd() * 20), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,' + v + ',0,.5)'); gr.addColorStop(1, 'rgba(0,46,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (i = 0; i < 70; i++) { x = rnd() * 512; y = rnd() * 512; r = 50 + rnd() * 240; a = rnd() * 6.28; g.strokeStyle = 'rgba(0,' + Math.round(80 + rnd() * 40) + ',0,.35)'; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r, a + Math.PI, a + Math.PI + 0.15 + rnd() * 0.5); g.stroke(); }
  });
  rough.anisotropy = aniso;
  // the layer under the surface. red: pale fractures. blue: crack shadows. (No bubbles or dark patches: from above they read as sprinkles and haze)
  const deep = canvasTex(512, (g) => { const rnd = rng(23); let i, x, y, r, a;
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.globalCompositeOperation = 'lighter';
    for (i = 0; i < 9; i++) { x = rnd() * 512; y = rnd() * 512; a = rnd() * 6.28; const path = [[x, y]];
      for (let k = 0; k < 10; k++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * (12 + rnd() * 22); y += Math.sin(a) * (12 + rnd() * 22); path.push([x, y]); if (rnd() < 0.25) { const b = a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd()); path.push([x + Math.cos(b) * 18, y + Math.sin(b) * 18], [x, y]); } }
      tile(512, (ox, oy) => { for (const [col, w] of [['rgba(0,0,170,1)', 3.5], ['rgba(170,0,0,1)', 1.0]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); path.forEach((q, k) => (k ? g.lineTo(q[0] + ox, q[1] + oy) : g.moveTo(q[0] + ox, q[1] + oy))); g.stroke(); } }); }
  });
  deep.anisotropy = aniso;

  const U = { uTime: { value: 0 }, uDeep: { value: deep }, uDepthTint: { value: new THREE.Color(0x3d6fa8) }, uGlitter: { value: 1 }, uSunDir: { value: new THREE.Vector3(-0.6, 0.5, 0.4).normalize() },
    uSunCol: { value: new THREE.Color(0xffffff) }, uCloud: { value: 0.3 }, uWind: { value: new THREE.Vector2(0.6, 0.25) }, uAurora: { value: 0 }, uAur1: { value: new THREE.Color(0x3dffb0) }, uAur2: { value: new THREE.Color(0x8a5cff) },
    uOverview: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9e9f8, map: surface, roughness: 1, roughnessMap: rough, metalness: 0, envMapIntensity: 0.35, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform float uTime, uGlitter, uCloud, uAurora, uOverview;
uniform sampler2D uDeep; uniform vec3 uDepthTint, uSunDir, uSunCol, uAur1, uAur2; uniform vec2 uWind;
float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.15 * vnoise(p * 4.1 + 3.7); }`)
      // under the surface, seen through it: shifts against the surface as the camera moves
      .replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 V = normalize(cameraPosition - vWPos); float near = 1.0 - uOverview;
  vec2 par = V.xz / max(V.y, 0.25);
  float look = pow(clamp(V.y, 0.0, 1.0), 1.5);                                   // 1: straight down into the ice
  // the body of the ice: blue that deepens toward black-blue the more directly you look into it, with soft light far down
  vec3 body = mix(diffuseColor.rgb * uDepthTint * 1.25, uDepthTint * uDepthTint * 0.5, 0.55 + 0.4 * look);
  float l1 = fbm((vWPos.xz - par * 1.0) * 0.05), l2 = fbm((vWPos.xz - par * 3.0) * 0.03 + 4.3);
  body *= 1.0 + (l1 - 0.5) * 0.3 + (l2 - 0.5) * 0.7;
  // cracks hang at three depths; each deeper sheet is larger, dimmer and bluer, and slides further as the view moves
  vec3 c1 = texture2D(uDeep, (vWPos.xz - par * 0.3) / 9.0).rgb;
  float c2 = texture2D(uDeep, (vWPos.xz - par * 1.2) / 13.0 + 0.37).r, c3 = texture2D(uDeep, (vWPos.xz - par * 2.6) / 19.0 + 0.71).r;
  body *= 1.0 - c1.b * 0.12;
  body += vec3(0.86, 0.94, 1.0) * c1.r * 0.15 + mix(vec3(0.8, 0.9, 1.0), uDepthTint, 0.45) * c2 * 0.085 + mix(vec3(0.8, 0.9, 1.0), uDepthTint, 0.7) * c3 * 0.06;
  diffuseColor.rgb = mix(diffuseColor.rgb, body, (0.87 + 0.08 * look) * near);
  float cl = smoothstep(0.42, 0.75, fbm(vWPos.xz * 0.018 + uTime * uWind * 0.02));
  diffuseColor.rgb *= 1.0 - cl * uCloud; }`)
      // aurora reflected from the sky is light added on top
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 V = normalize(cameraPosition - vWPos); float near = 1.0 - uOverview;
  if (uAurora > 0.0) { vec2 q = vWPos.xz * 0.05; float t = uTime * 0.06;
    // ribbons of light reflected from the sky: thin, wavering, drifting
    float w1 = fbm(q * 0.7 + vec2(t, -t * 0.5)) * 5.0, w2 = fbm(q * 0.6 - vec2(t * 0.7, t)) * 5.0;
    float band = pow(1.0 - abs(sin(q.x * 0.9 + q.y * 0.35 + w1)), 6.0) * fbm(q * 2.5 + t);
    float band2 = pow(1.0 - abs(sin(q.y * 0.8 - q.x * 0.3 + w2)), 8.0) * fbm(q * 2.0 - t);
    totalEmissiveRadiance += (uAur1 * band + uAur2 * band2 * 0.8) * uAurora * 0.5 * (0.5 + 0.5 * near); } }`);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true; mesh.renderOrder = -2;
  surface.repeat.set(40000 / 16, 40000 / 16); rough.repeat.copy(surface.repeat);
  return { mesh, uniforms: U, material: mat };
}
