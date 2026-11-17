// Headless run of the real page with simulated touches.
const req = (m, alt) => { try { return require(m); } catch (e) { return require(alt); } };
const { chromium } = req('playwright', '/opt/npm-tools/node_modules/playwright');
const THREE_FILE = (() => { const local = require('path').join(__dirname, '..', 'node_modules', 'three', 'build', 'three.module.min.js'); return require('fs').existsSync(local) ? local : '/tmp/t/node_modules/three/build/three.module.min.js'; })();
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
exports.open = async (opts = {}) => {
  const b = await chromium.launch({ ...(fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-background-networking', '--disable-sync', '--disable-component-update'] });
  const ctx = await b.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: opts.dpr || 1 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js', (r) => r.fulfill({ body: fs.readFileSync(THREE_FILE), contentType: 'application/javascript' }));
  await p.route('http://game.test/**', (r) => { const f = path.join(ROOT, new URL(r.request().url()).pathname.replace(/^\/$/, '/index.html')); fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'text/plain' }) : r.fulfill({ status: 404, body: '' }); });
  await p.goto('http://game.test/'); await p.waitForTimeout(1500);
  const ev = (type, id, x, y) => p.evaluate(([type, id, x, y]) => document.getElementById('c').dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true })), [type, id, x, y]);
  const st = () => p.evaluate(() => { const g = window.__game, S = g.S; return { grounded: S.grounded, back: S.back, move: S.move ? S.move.id : null, jumps: S.jumps, kmh: +(g.game.speed() * 3.6).toFixed(0), pop: g.hudText(), prints: g.trace.count }; });
  return { b, p, errs, ev, st, sleep: (ms) => p.waitForTimeout(ms), tap: async (id, x, y) => { await ev('pointerdown', id, x, y); await p.waitForTimeout(50); await ev('pointerup', id, x, y); } };
};
