// Round-trip check: the R code the game exports must reproduce the engine's
// fit in lavaan. Writes .dev/out/rcode_*.R plus expected values.
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
['linalg.js', 'sem.js', 'bank.js'].forEach(f => require(path.join(root, f)));
const FF = globalThis.FF;
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const cases = [
  { id: 'B13', spec: d => d.spec },   // true model, cross-loading + resid
  { id: 'B15', spec: d => ({ p: 9, m: 2, loadings: [[0,0],[1,0],[2,0],[3,0],[4,1],[5,1],[6,1]], regressions: [], factorCovs: [], residCovs: [[7,8]] }) }, // orthogonal, unconnected items 7,8 (only resid cov) 
  { id: 'B05', spec: d => ({ p: 6, m: 2, loadings: [[0,0],[1,0],[2,0],[3,1],[4,1]], regressions: [[1,0]], factorCovs: [], residCovs: [] }) }, // regression, item 6 alone
  { id: 'B15', spec: d => ({ p: 9, m: 4, loadings: [[0,0],[1,0],[2,0],[3,1],[4,1],[5,1],[6,2],[7,2],[8,2]], regressions: [[0,3],[1,3],[2,3]], factorCovs: [], residCovs: [] }) }, // higher-order
];
const expected = [];
cases.forEach((c, k) => {
  const model = FF.bank.MODELS.find(m => m.id === c.id);
  const d = FF.bank.makeRound(model, 200, 9000 + k);
  const spec = c.spec(d);
  const r = FF.sem.fit(spec, d.S, 200);
  if (!r.ok) { console.log('case', k, 'not ok', r.reasons); return; }
  const code = FF.sem.rCode(spec, d.S, 200);
  fs.writeFileSync(path.join(__dirname, 'out', `rcode_${k}.R`), code);
  expected.push({ k, chisq: r.chisq, df: r.df, rmsea: r.rmsea, cfi: r.cfi, tli: r.tli, srmr: r.srmr, bic: r.bic,
    std: r.est.filter(e => !(e.mat === 'T' && e.r === e.c)).map(e => +e.std.toFixed(4)).sort((a, b) => a - b) });
});
fs.writeFileSync(path.join(__dirname, 'out', 'expected.json'), JSON.stringify(expected));
console.log(fs.readFileSync(path.join(__dirname, 'out', 'rcode_1.R'), 'utf8').split('\n').slice(13, 26).join('\n'));
