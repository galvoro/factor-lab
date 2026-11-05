// Smoke test: plays three single-dataset games in headless Chrome with real
// mouse input. Serve the capsule first:  python3 -m http.server 8765  (in factor-find/)
// then:  node .dev/smoke_full_game.js [baseURL]
//   game 1 (Easy)   : the true structure, drawn with selection + double-click   -> expect 100
//   game 2 (Medium) : first an unidentified model (error card, not counted), then one factor for all items
//   game 3 (Hard)   : the true structure plus two junk residual correlations    -> expect a BIC penalty
const { launch, sleep } = require('./cdp.js');
const path = require('path');
const OUT = path.join(__dirname, 'out');
require('fs').mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';

(async () => {
  const b = await launch({ width: 1366, height: 768, port: 9335 });
  const node = (id) => `#canvas .d-node[data-id="${id}"] .d-shape`;
  const sel = async (ids) => { for (const i of ids) await b.clickSel(node('o' + i)); };
  const dbl = async (fx, fy) => {
    const r = await b.eval(`(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
    const x = r[0] + r[2] * fx, y = r[1] + r[3] * fy;
    await b.click(x, y); await sleep(90); await b.click(x, y); await sleep(250);
  };
  const residCenters = () => b.eval(`(() => { return [...document.querySelectorAll('#canvas .d-resid-dot')].map(c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); })()`);
  async function drawTruth(spec, junk) {
    const groups = {};
    for (const [i, j] of spec.loadings) (groups[j] = groups[j] || []).push(i);
    const seen = new Set(), extra = [];
    const keys = Object.keys(groups);
    for (let k = 0; k < keys.length; k++) {
      const j = keys[k];
      const items = groups[j].filter(i => { if (seen.has(i)) { extra.push([k, i]); return false; } seen.add(i); return true; });
      if (k === 0) {                                          // picker: double-click, click items, OK
        await dbl((k + 1) / (keys.length + 1), 0.12);
        if (!(await b.eval('FF.game.debug.editor.picking'))) throw new Error('picker did not open');
        await sel(items);
        await b.clickSel('#pp-ok'); await sleep(150);
      } else {                                                // shortcut: select items, then double-click
        await sel(items);
        await dbl((k + 1) / (keys.length + 1), 0.12);
      }
    }
    // the factor ids follow creation order
    const fid = (k) => 'f' + (k + 1);
    // orthogonal truth: erase auto-added factor correlations that the truth lacks
    const tcov = new Set((spec.factorCovs || []).map(([a, c]) => Math.min(a, c) + ',' + Math.max(a, c)));
    const order = keys.map(Number);
    const drop = [];
    for (let x = 0; x < order.length; x++) for (let y = x + 1; y < order.length; y++) {
      const a = order[x], c = order[y];
      if (!tcov.has(Math.min(a, c) + ',' + Math.max(a, c))) drop.push([fid(x), fid(y)]);
    }
    if (drop.length) {
      await b.clickSel('.tool[data-tool="erase"]');
      for (const [fa, fb] of drop) {
        // click the middle of that factor covariance's curve
        const pt = await b.eval(`(() => {
          const e = FF.game.debug.editor.edges.find(e => e.kind === 'cov' && ((e.a === '${fa}' && e.b === '${fb}') || (e.a === '${fb}' && e.b === '${fa}')));
          if (!e) return null;
          const svg = document.getElementById('canvas'), p = svg.querySelector('.d-edge[data-id="' + e.id + '"] path.d-hit');
          const m = p.getPointAtLength(p.getTotalLength() / 2), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
          return [r.left + m.x * r.width / vb.width, r.top + m.y * r.height / vb.height];
        })()`);
        if (pt) await b.click(pt[0], pt[1]);
      }
    }
    await b.clickSel('#btn-tidy'); await sleep(450);
    if (extra.length) {
      await b.clickSel('.tool[data-tool="arrow"]');
      for (const [k, i] of extra) {
        const f = await b.center(node(fid(k))), o = await b.center(node('o' + i));
        await b.drag(f[0], f[1], o[0], o[1]);
      }
    }
    const rc = (spec.residCovs || []).concat(junk || []);
    if (rc.length) {
      await b.clickSel('.tool[data-tool="cov"]');
      for (const [a, c] of rc) {
        const R = await residCenters();                         // drag between the residuals
        await b.drag(R[a][0], R[a][1], R[c][0], R[c][1]);
      }
    }
    await b.clickSel('.tool[data-tool="select"]');
  }
  async function fitAndScore(shot) {
    await b.clickSel('#btn-fit'); await sleep(2400);
    if (shot) await b.shot(path.join(OUT, shot));
    await b.eval('FF.game.debug.skipSeq()'); await sleep(300);
    return b.eval(`(() => { const c = FF.game.cur; if (!c.fit) return 'no fit'; const s = c.fit.score; return JSON.stringify({ tpl: c.tpl.id, N: c.N, fit: s.fitPts, bic: s.bicPts, dBIC: +s.dBIC.toFixed(2), total: s.total, exact: s.cmp.exact }); })()`);
  }

  try {
    await b.goto(BASE + 'index.html?seed=2024');
    // ---- game 1: Easy, the truth ----
    await b.clickSel('#btn-play'); await sleep(400);
    await b.clickSel('.level-card[data-level="1"]'); await sleep(400);
    await b.clickSel('#tut-continue'); await sleep(900);
    let spec = JSON.parse(await b.eval('JSON.stringify(FF.game.cur.data.spec)'));
    await drawTruth(spec);
    const drawn = await b.eval('JSON.stringify(FF.game.debug.editor.getSpec().spec)');
    console.log('game 1 truth', JSON.stringify(spec), '\n       drawn', drawn);
    console.log('game 1', await fitAndScore('40_game1_card.png'));
    await b.clickSel('#btn-truth'); await sleep(600);
    await b.shot(path.join(OUT, '41_game1_truth.png'));
    await b.clickSel('#truth-close'); await sleep(200);

    // ---- game 2: Medium; unidentified first, then one factor ----
    await b.clickSel('#next-seg button[data-level="2"]');
    await b.clickSel('#btn-next'); await sleep(1000);
    spec = JSON.parse(await b.eval('JSON.stringify(FF.game.cur.data.spec)'));
    await sel([0]); await dbl(0.2, 0.15);                      // one-indicator factor
    await sel([1, 2, 3]); await dbl(0.6, 0.15);
    await b.clickSel('#btn-fit'); await sleep(900);
    const err = await b.eval(`document.querySelector('#card.error .err-what') ? document.querySelector('#card.error .err-what').textContent : 'NO ERROR CARD'`);
    console.log('game 2 error card:', err, '| attempts', await b.eval('FF.game.cur.attempts'), '| fit stored:', await b.eval('!!FF.game.cur.fit'));
    await b.shot(path.join(OUT, '42_game2_error.png'));
    await b.clickSel('#err-back'); await sleep(200);
    await b.clickSel('#btn-clear'); await b.clickSel('#btn-clear'); await sleep(200);
    await sel([...Array(spec.p).keys()]); await dbl(0.5, 0.15);
    console.log('game 2', await fitAndScore());

    // ---- game 3: Hard; truth + two junk residual correlations ----
    await b.clickSel('#next-seg button[data-level="3"]');
    await b.clickSel('#btn-next'); await sleep(1000);
    spec = JSON.parse(await b.eval('JSON.stringify(FF.game.cur.data.spec)'));
    const taken = new Set((spec.residCovs || []).map(([a, c]) => Math.min(a, c) + ',' + Math.max(a, c)));
    const junk = [];
    for (let a = 0; a < spec.p && junk.length < 2; a++) for (let c = a + 1; c < spec.p && junk.length < 2; c++) {
      if (!taken.has(a + ',' + c) && !junk.some(([x, y]) => x === a || y === c || x === c || y === a)) junk.push([a, c]);
    }
    await drawTruth(spec, junk);
    console.log('game 3', await fitAndScore('43_game3_card.png'));
    await b.clickSel('#btn-compare'); await sleep(500);
    await b.shot(path.join(OUT, '44_game3_compare.png'));
    console.log('HUD', await b.eval(`[document.getElementById('hud-v2').textContent, document.getElementById('hud-v3').textContent].join(' played, avg ')`));
  } finally {
    console.log(b.logs.filter(l => !l.includes('404') && !l.includes('AudioContext')).join('\n'));
    await b.close();
  }
})();
