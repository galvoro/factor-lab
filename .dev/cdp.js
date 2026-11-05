// Minimal Chrome DevTools Protocol driver (no dependencies; Node 22 WebSocket).
const { spawn } = require('child_process');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch({ width = 1440, height = 900, port = 9333, mobile = false } = {}) {
  const prof = fs.mkdtempSync(require('os').tmpdir() + '/ff-chrome-');
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', `--window-size=${width},${height}`, 'about:blank'],
    { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find(t => t.type === 'page')) break; } catch (e) {}
    await sleep(150);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded') logs.push('LOG ' + m.params.entry.level + ': ' + m.params.entry.text);
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const api = {
    logs, send,
    async goto(url) { await send('Page.navigate', { url }); await sleep(1500); },
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; },
    async shot(path) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path, Buffer.from(r.result.data, 'base64')); },
    async mouse(type, x, y, extra = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse', ...extra }); },
    async click(x, y) { await api.mouse('mouseMoved', x, y, { buttons: 0 }); await api.mouse('mousePressed', x, y); await api.mouse('mouseReleased', x, y); await sleep(60); },
    async drag(x1, y1, x2, y2, steps = 8) { await api.mouse('mouseMoved', x1, y1, { buttons: 0 }); await api.mouse('mousePressed', x1, y1); for (let k = 1; k <= steps; k++) { await api.mouse('mouseMoved', x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps); await sleep(10); } await api.mouse('mouseReleased', x2, y2); await sleep(80); },
    async tap(x, y) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(40); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120); },
    async tapSel(sel) { const c = await api.center(sel); if (!c) throw new Error('no element ' + sel); await api.tap(c[0], c[1]); },
    async key(key, code, mods = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers: mods }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers: mods }); await sleep(50); },
    async center(sel) { return api.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`); },
    async clickSel(sel) { const c = await api.center(sel); if (!c) throw new Error('no element ' + sel); await api.click(c[0], c[1]); },
    async close() { try { ws.close(); } catch (e) {} proc.kill(); },
    sleep,
  };
  return api;
}
module.exports = { launch, sleep };
