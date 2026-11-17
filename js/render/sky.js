// The sky. The camera looks down at the ice, so the sky itself is rarely seen; what matters is what it lends everything else:
// the light reflected in the ice and on the skater (an environment map made from this dome), and its colour in the overview.
// Rebuilt only when the time of day changes.
import * as THREE from './three.js';

export function createSky(renderer) {
  const dome = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 48, 24);
  const U = {
    uZen: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uGnd: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() },
    uStars: { value: 0 },
    uAurora: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader:
      'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 uZen, uHor, uGnd, uSun, uSunCol; uniform float uStars, uAurora;
      float h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() { vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y >= 0.0 ? mix(uHor, uZen, pow(y, 0.6)) : mix(uHor, uGnd, min(1.0, -y * 4.0));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35) * step(-0.05, uSun.y);
        if (uStars > 0.0 && y > 0.0) { vec3 g = floor(d * 160.0); float st = step(0.996, h(g)); c += vec3(0.9, 0.95, 1.0) * st * uStars * y; }
        if (uAurora > 0.0 && y > 0.05) { float b = sin(d.x * 9.0 + sin(d.z * 5.0) * 2.0); c += mix(vec3(0.2, 1.0, 0.65), vec3(0.55, 0.35, 1.0), d.z * 0.5 + 0.5) * smoothstep(0.6, 1.0, b) * smoothstep(0.05, 0.4, y) * 0.6 * uAurora; }
        gl_FragColor = vec4(c, 1.0); }`,
  });
  dome.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(renderer);
  let env = null;
  return {
    // look: an entry of CFG.looks; sunDir: unit vector towards the sun
    set(look, sunDir) {
      U.uZen.value.setHex(look.sky[0]);
      U.uHor.value.setHex(look.sky[1]);
      U.uGnd.value.setHex(look.sky[2]);
      U.uSun.value.copy(sunDir);
      U.uSunCol.value.setHex(look.sunColor);
      U.uStars.value = look.stars;
      U.uAurora.value = look.aurora;
      if (env) env.dispose();
      env = pm.fromScene(dome, 0.02).texture;
      return env;
    },
  };
}
