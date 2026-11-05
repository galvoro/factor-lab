// Smoke test: plays a full 5-round game in headless Chrome with real mouse
// input. Serve the capsule first:  python3 -m http.server 8765  (in factor-find/)
// then:  node .dev/smoke_full_game.js
// Play a full game: each round draw the true structure (rounds 1,3,5),
// a deliberately simple 1-factor model (round 2) and an overfitted one (round 4).
const { launch, sleep } = require('./cdp.js');
require('fs').mkdirSync(require('path').join(__dirname, 'out'), { recursive: true });
(async () => {
  const b = await launch({ width: 1366, height: 768, port: 9335 });
  const sel = async (ids) => { for (const i of ids) await b.clickSel(`.d-node[data-id="o${i}"] .d-shape`); };
  try {
    await b.goto('http://127.0.0.1:8765/index.html?seed=2024');
    await b.clickSel('#btn-play'); await sleep(400);
    await b.clickSel('#tut-continue'); await sleep(500);
    for (let r = 0; r < 5; r++) {
      const info = JSON.parse(await b.eval(`JSON.stringify({id: FF.game.cur.model.id, spec: FF.game.cur.data.spec})`));
      const spec = info.spec;
      if (r === 1) {
        await sel([...Array(spec.p).keys()]); await b.clickSel('#btn-factor'); await sleep(150);
      } else {
        const groups = {}; for (const [i, j] of spec.loadings) (groups[j] = groups[j] || []).push(i);
        const seen = new Set(), extra = [];
        for (const j of Object.keys(groups)) {
          const items = groups[j].filter(i => { if (seen.has(i)) { extra.push([j, i]); return false; } seen.add(i); return true; });
          await sel(items); await b.clickSel('#btn-factor'); await sleep(150);
        }
        await b.clickSel('#btn-tidy'); await sleep(450);
        // cross-loadings with the Loading tool
        if (extra.length) {
          await b.clickSel('.tool[data-tool="arrow"]');
          for (const [j, i] of extra) {
            const f = await b.center(`.d-node[data-id="f${+j + 1}"] .d-shape`), o = await b.center(`.d-node[data-id="o${i}"] .d-shape`);
            await b.drag(f[0], f[1], o[0], o[1]);
          }
        }
        // residual covariances (+ two junk ones in round 4)
        const rc = spec.residCovs.slice();
        if (r === 3) { rc.push([0, 1]); rc.push([2, 3]); }
        if (rc.length) {
          await b.clickSel('.tool[data-tool="cov"]');
          for (const [a, c] of rc) {
            const A = await b.center(`.d-node[data-id="o${a}"] .d-shape`), C = await b.center(`.d-node[data-id="o${c}"] .d-shape`);
            await b.drag(A[0], A[1], C[0], C[1]);
          }
        }
        await b.clickSel('.tool[data-tool="select"]');
      }
      await b.clickSel('#btn-fit'); await sleep(1300);
      if (r === 2) await b.shot(`.dev/out/30_round${r + 1}_fit.png`);
      const res = await b.eval(`(() => { const c = FF.game.cur; return c.last ? JSON.stringify({rmsea: +c.last.rmsea.toFixed(3), df: c.last.df, dBIC: +(c.last.bic - c.data.trueFit.bic).toFixed(2), improper: c.last.improper}) : 'no fit: ' + document.getElementById('toast').textContent; })()`);
      await b.clickSel('#res-lock'); await sleep(700);
      const rr = await b.eval('JSON.stringify(FF.game.rounds[FF.game.rounds.length-1] && {m: FF.game.rounds[FF.game.rounds.length-1].model.id, total: FF.game.rounds[FF.game.rounds.length-1].total})');
      console.log('round', r + 1, info.id, res, rr);
      if (r === 3) await b.shot(`.dev/out/31_round4_reveal.png`);
      await b.clickSel('#res-next'); await sleep(700);
    }
    await b.shot('.dev/out/32_final.png');
    console.log('final score', await b.eval('FF.game.score'));
  } finally { console.log(b.logs.filter(l => !l.includes('404') && !l.includes('AudioContext')).join('\n')); await b.close(); }
})();
