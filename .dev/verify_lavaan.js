// Randomised comparison of the JS engine with lavaan.
// 1) node .dev/verify_lavaan.js [nPerModel]   -> writes .dev/out/lav_cases.json + lav_case_*.R
// 2) Rscript .dev/verify_lavaan.R               -> compares, prints max differences
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
['linalg.js', 'sem.js', 'bank.js'].forEach(f => require(path.join(root, f)));
const FF = globalThis.FF;
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const per = +process.argv[2] || 3;
const rnd = FF.la.rng(20261105);

function randomSpec(p) {
  const m = [1, 1, 2, 2, 2, 3, 3][rnd.int(7)];
  const assign = [...Array(p)].map(() => (rnd() < 0.08 ? -1 : rnd.int(m)));
  let facs = [...Array(m).keys()].filter(j => assign.filter(a => a === j).length >= 2);
  const remap = {}; facs.forEach((j, k) => { remap[j] = k; });
  const M = facs.length;
  const loadings = [];
  assign.forEach((a, i) => { if (a >= 0 && remap[a] !== undefined) loadings.push([i, remap[a]]); });
  const nCross = M > 1 ? rnd.int(3) : 0;
  for (let k = 0; k < nCross; k++) {
    const i = rnd.int(p), j = rnd.int(M);
    if (!loadings.some(([a, b]) => a === i && b === j)) loadings.push([i, j]);
  }
  const factorCovs = [], regressions = [];
  for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) {
    const u = rnd();
    if (u < 0.65) factorCovs.push([a, b]);
    else if (u < 0.75 && !regressions.some(([t]) => t === b)) regressions.push([b, a]);
  }
  const residCovs = [];
  for (let k = rnd.int(3); k > 0; k--) {
    const a = rnd.int(p), b = rnd.int(p);
    if (a !== b && !residCovs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) residCovs.push([a, b]);
  }
  return { p, m: M, loadings, regressions, factorCovs, residCovs };
}

function lavName(spec, q) {
  const y = i => 'y' + (i + 1), F = j => 'F' + (j + 1);
  const hasItems = new Array(spec.m).fill(false); spec.loadings.forEach(([, j]) => { hasItems[j] = true; });
  if (q.mat === 'L') return F(q.c) + '=~' + y(q.r);
  if (q.mat === 'B') return hasItems[q.c] ? F(q.r) + '~' + F(q.c) : F(q.c) + '=~' + F(q.r);
  if (q.mat === 'P') return F(Math.min(q.r, q.c)) + '~~' + F(Math.max(q.r, q.c));
  return y(Math.min(q.r, q.c)) + '~~' + y(Math.max(q.r, q.c));
}

const Ns = [150, 200, 250, 300, 400, 500];
const cases = [];
let k = 0, notId = 0, noConv = 0;
for (const tpl of FF.bank.TEMPLATES) {
  for (let r = 0; r < per; r++) {
    const N = Ns[rnd.int(Ns.length)];
    const d = FF.bank.makeRound(tpl, N, 5000 + 31 * k + r);
    const spec = r === 0 ? d.spec : randomSpec(d.S.length);
    const res = FF.sem.fit(spec, d.S, N);
    if (!res.ok) { notId++; continue; }
    if (!res.converged) { noConv++; continue; }
    fs.writeFileSync(path.join(out, `lav_case_${k}.R`), FF.sem.rCode(spec, d.S, N, res) + '\n');
    const std = {};
    res.est.forEach(e => { std[lavName(spec, e)] = e.std; });
    cases.push({ k, model: tpl.id, N, chisq: res.chisq, df: res.df, rmsea: res.rmsea, cfi: res.cfi, tli: res.tli, srmr: res.srmr, bic: res.bic, improper: res.improper, std });
    k++;
  }
}
fs.writeFileSync(path.join(out, 'lav_cases.json'), JSON.stringify(cases));
console.log(`${cases.length} cases written (${notId} not identified, ${noConv} not converged in JS, skipped)`);
