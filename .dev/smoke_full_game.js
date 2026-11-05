// Smoke test: plays one five-round Easy game in headless Chrome with real
// mouse input and checks the diploma. Serve the capsule first:
//   python3 -m http.server 8765   (in factor-find/)   then
//   node .dev/smoke_full_game.js [baseURL]
//   round 1: the truth, first factor via the indicator picker      -> 100
//   round 2: an unidentified model first (error card, not counted), then one factor for all items
//   round 3: the truth plus two junk residual correlations           -> BIC penalty
//   rounds 4-5: the truth (or the baseline model when there are no factors)
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
  const residCenters = () => b.eval(`[...document.querySelectorAll('#canvas .d-resid-dot')].map(c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })`);
  const waitRound = async () => { for (let i = 0; i < 200 && !(await b.eval('!!FF.game.cur && !FF.game.cur.fit')); i++) await sleep(50); await sleep(300); };

  async function drawTruth(spec, junk) {
    const groups = {};
    for (const [i, j] of spec.loadings) (groups[j] = groups[j] || []).push(i);
    const seen = new Set(), extra = [];
    const keys = Object.keys(groups);
    for (let k = 0; k < keys.length; k++) {
      const items = groups[keys[k]].filter(i => { if (seen.has(i)) { extra.push([k, i]); return false; } seen.add(i); return true; });
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
    const fid = (k) => 'f' + (k + 1);
    const tcov = new Set((spec.factorCovs || []).map(([a, c]) => Math.min(a, c) + ',' + Math.max(a, c)));
    const order = keys.map(Number), drop = [];
    for (let x = 0; x < order.length; x++) for (let y = x + 1; y < order.length; y++) {
      const a = order[x], c = order[y];
      if (!tcov.has(Math.min(a, c) + ',' + Math.max(a, c))) drop.push([fid(x), fid(y)]);
    }
    if (drop.length) {
      await b.clickSel('.tool[data-tool="erase"]');
      for (const [fa, fb] of drop) {
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
    if (keys.length) { await b.clickSel('#btn-tidy'); await sleep(450); }
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
        const R = await residCenters();
        await b.drag(R[a][0], R[a][1], R[c][0], R[c][1]);
      }
    }
    await b.clickSel('.tool[data-tool="select"]');
  }
  async function fitAndScore(spec) {
    await b.clickSel('#btn-fit');
    if (spec && spec.m === 0 && !spec.residCovs.length) { await sleep(300); await b.clickSel('#btn-fit'); }   // confirm the baseline model
    await sleep(2400);
    await b.eval('FF.game.debug.skipSeq()'); await sleep(300);
    return b.eval(`(() => { const c = FF.game.cur; if (!c.fit) return 'no fit'; const s = c.fit.score; return JSON.stringify({ tpl: c.tpl.id, N: c.N, fit: s.fitPts, bic: s.bicPts, dBIC: +s.dBIC.toFixed(2), total: s.total, exact: s.cmp.exact }); })()`);
  }
  const spec = async () => JSON.parse(await b.eval('JSON.stringify(FF.game.cur.data.spec)'));

  try {
    await b.goto(BASE + 'index.html?seed=2024');
    await b.clickSel('#btn-play'); await sleep(400);
    await b.clickSel('.level-card[data-level="1"]'); await sleep(400);
    await b.clickSel('#tut-continue'); await waitRound();

    let s = await spec();                                      // round 1
    await drawTruth(s);
    console.log('round 1', await fitAndScore(s));
    await b.clickSel('#btn-truth'); await sleep(600);
    await b.shot(path.join(OUT, '41_truth.png'));
    await b.clickSel('#truth-close'); await sleep(200);
    await b.clickSel('#btn-next'); await waitRound();

    s = await spec();                                          // round 2
    await sel([0]); await dbl(0.2, 0.15);
    await sel([1, 2, 3]); await dbl(0.6, 0.15);
    await b.clickSel('#btn-fit'); await sleep(900);
    const err = await b.eval(`document.querySelector('#card.error .err-what') ? document.querySelector('#card.error .err-what').textContent : 'NO ERROR CARD'`);
    console.log('round 2 error card:', err, '| fit stored:', await b.eval('!!FF.game.cur.fit'));
    await b.shot(path.join(OUT, '42_error.png'));
    await b.clickSel('#err-back'); await sleep(200);
    await b.clickSel('#btn-clear'); await b.clickSel('#btn-clear'); await sleep(200);
    await sel([...Array(s.p).keys()]); await dbl(0.5, 0.15);
    console.log('round 2', await fitAndScore(s));
    await b.clickSel('#btn-next'); await waitRound();

    s = await spec();                                          // round 3
    const taken = new Set((s.residCovs || []).map(([a, c]) => Math.min(a, c) + ',' + Math.max(a, c)));
    const junk = [];
    for (let a = 0; a < s.p && junk.length < 2; a++) for (let c = a + 1; c < s.p && junk.length < 2; c++) {
      if (!taken.has(a + ',' + c) && !junk.some(([x, y]) => x === a || y === c || x === c || y === a)) junk.push([a, c]);
    }
    await drawTruth(s, junk);
    console.log('round 3', await fitAndScore(s));
    await b.clickSel('#btn-compare'); await sleep(500);
    await b.shot(path.join(OUT, '43_compare.png'));
    await b.clickSel('#btn-score'); await sleep(300);
    await b.clickSel('#btn-next'); await waitRound();

    for (const r of [4, 5]) {                                  // rounds 4-5
      s = await spec();
      await drawTruth(s);
      console.log('round ' + r, await fitAndScore(s));
      await b.clickSel('#btn-next');
      if (r < 5) await waitRound();
    }
    await sleep(2000);
    await b.shot(path.join(OUT, '44_diploma.png'));
    console.log('diploma:', await b.eval(`[document.getElementById('screen-final').classList.contains('show'), document.getElementById('dip-num').textContent, document.getElementById('final-rank').textContent, document.querySelectorAll('#dip-stars svg.on').length + ' stars'].join(' | ')`));
  } finally {
    console.log(b.logs.filter(l => !l.includes('404') && !l.includes('AudioContext')).join('\n'));
    await b.close();
  }
})();
