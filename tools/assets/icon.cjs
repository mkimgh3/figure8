// Draws the Home Screen icon (pale ice with a skate line looping across it) and saves it at 180, 192 and 512 px.
// Run from the project folder: node tools/assets/icon.cjs
const { chromium } = require('playwright'), path = require('path');
const html = `<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
  <linearGradient id="ice" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#f4f9ff"/><stop offset="0.55" stop-color="#cfe3f6"/><stop offset="1" stop-color="#9cc4ea"/></linearGradient>
  <linearGradient id="line" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2b7fff"/><stop offset="1" stop-color="#7b5cff"/></linearGradient>
</defs>
<rect width="512" height="512" fill="url(#ice)"/>
<path d="M-20 380 C 120 300, 250 420, 300 300 C 345 190, 215 130, 190 220 C 165 315, 330 345, 400 240 C 440 180, 470 120, 540 90" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="40" stroke-linecap="round"/>
<path d="M-20 380 C 120 300, 250 420, 300 300 C 345 190, 215 130, 190 220 C 165 315, 330 345, 400 240 C 440 180, 470 120, 540 90" fill="none" stroke="url(#line)" stroke-width="18" stroke-linecap="round"/>
</svg></body>`;
(async () => {
  const b = await chromium.launch(), out = path.resolve(__dirname, '..', '..', 'assets');
  for (const s of [180, 192, 512]) { const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: s / 512 }); await p.setContent(html); await p.screenshot({ path: path.join(out, `icon-${s}.png`), clip: { x: 0, y: 0, width: 512, height: 512 } }); await p.close(); }
  await b.close(); console.log('icons written to', out);
})();
