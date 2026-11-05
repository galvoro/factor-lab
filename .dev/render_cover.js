// Renders .dev/out/cover.html (from make_art.js) to cover.png (1254 x 1254)
// in headless Chrome. Usage: node .dev/make_art.js && node .dev/render_cover.js
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp.js');
(async () => {
  const b = await launch({ width: 1254, height: 1254, port: 9370 });
  try {
    await b.goto('file://' + path.join(__dirname, 'out', 'cover.html'));
    await b.eval('document.fonts.ready.then(() => document.fonts.size)');
    await sleep(800);
    const r = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1254, height: 1254, scale: 1 } });
    const out = path.join(__dirname, 'out', 'cover-vector.png');
    fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
    console.log('wrote', out, fs.statSync(out).size, 'bytes');
  } finally { await b.close(); }
})();
