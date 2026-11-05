// Indicator picker: for a grid of double-click spots at several screen sizes,
// count how often the popup covers an item (should be 0 everywhere).
//   node .dev/check_picker.js [baseURL] [screenshotPrefix]
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const SHOT = process.argv[3];
const VPS = [
  ['desktop 1440x900', 1440, 900, false], ['laptop 1280x720', 1280, 720, false],
  ['iPad landscape 1180x820', 1180, 820, true], ['iPad portrait 820x1180', 820, 1180, true],
  ['phone portrait 390x844', 390, 844, true], ['phone landscape 844x390', 844, 390, true],
];
(async () => {
  let port = 9341;
  for (const [name, w, h, mobile] of VPS) {
    const b = await launch({ width: w, height: h, port: port++, mobile });
    try {
      await b.goto(BASE + 'index.html?seed=2024');
      await b.clickSel('#btn-play'); await sleep(400);
      await b.clickSel('.level-card[data-level="1"]'); await sleep(400);
      await b.clickSel('#tut-continue');
      for (let i = 0; i < 200 && !(await b.eval('!!FF.game.cur && !FF.game.cur.fit')); i++) await sleep(50);
      await sleep(400);
      await b.eval("(() => { const t = document.querySelector('button[data-tab=model]'); if (t && t.offsetParent) t.click(); })()"); await sleep(400);
      const cv = await b.eval(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
      const p = await b.eval('FF.game.debug.editor.itemCount');
      let tried = 0, covered = 0, worst = 0; const bad = []; const lays = {};
      for (const fy of [0.08, 0.2, 0.32, 0.44]) for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const x = cv[0] + cv[2] * fx, y = cv[1] + cv[3] * fy;
        await b.click(x, y); await sleep(90); await b.click(x, y); await sleep(300);
        if (!(await b.eval('FF.game.debug.editor.picking'))) { await b.eval('FF.game.debug.editor.clear()'); continue; }
        tried++;
        const n = await b.eval(`(() => {
          const pr = document.getElementById('pick-pop').getBoundingClientRect();
          return [...document.querySelectorAll('#canvas .d-node.obs .d-shape')].filter(s => { const r = s.getBoundingClientRect();
            return r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom; }).length; })()`);
        const lay = await b.eval("document.getElementById('pick-pop').className.replace('pick-pop','').trim() || 'card'");
        lays[lay] = (lays[lay] || 0) + 1;
        if (n) { covered++; worst = Math.max(worst, n); bad.push(fx + ',' + fy + ':' + n); }
        if (SHOT && fx === 0.5 && fy === 0.32) await b.shot(SHOT + '_' + name.split(' ')[0] + name.split(' ')[1] + '.png');
        await b.eval('FF.game.debug.editor.cancelPick(); FF.game.debug.editor.clear()'); await sleep(100);
      }
      const pp = await b.eval(`(() => { const e = document.getElementById('pick-pop'); e.classList.remove('hidden'); const r = e.getBoundingClientRect(); e.classList.add('hidden'); return [Math.round(r.width), Math.round(r.height)]; })()`);
      console.log(`${name.padEnd(26)} canvas ${Math.round(cv[2])}x${Math.round(cv[3])}  popup ${pp[0]}x${pp[1]}  items ${p}  covered in ${covered}/${tried} spots (max ${worst} items)  ${JSON.stringify(lays)} ${bad.slice(0, 6).join(' ')}`);
    } catch (e) { console.log(name, 'ERROR', e.message); }
    await b.close();
  }
})();
