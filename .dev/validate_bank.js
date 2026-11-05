// Monte Carlo audit of the item bank: does the true model fit, and do the
// tempting simpler models fail (so the complications are detectable at N=200)?
// Usage: node .dev/validate_bank.js [reps]
const path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'linalg.js'));
require(path.join(root, 'sem.js'));
require(path.join(root, 'bank.js'));
const FF = globalThis.FF;
const reps = +process.argv[2] || 100, N = 200;

function simpleSpec(model) {           // each item on its strongest factor, true factor correlations, no resid covs
  const t = FF.bank.trueSpec(model);
  const loadings = model.L.map((row, i) => { let b = 0; row.forEach((v, j) => { if (Math.abs(v) > Math.abs(row[b])) b = j; }); return [i, b]; });
  const allCov = [];
  for (let a = 0; a < t.m; a++) for (let b = a + 1; b < t.m; b++) allCov.push([a, b]);
  return { p: t.p, m: t.m, loadings, regressions: [], factorCovs: allCov, residCovs: [] };
}
function oneFactor(model) { const p = model.L.length; return { p, m: 1, loadings: [...Array(p).keys()].map(i => [i, 0]), regressions: [], factorCovs: [], residCovs: [] }; }
function trueAllCov(model) { const t = FF.bank.trueSpec(model); const allCov = []; for (let a = 0; a < t.m; a++) for (let b = a + 1; b < t.m; b++) allCov.push([a, b]); return { ...t, factorCovs: allCov }; }

const pct = x => (100 * x).toFixed(0).padStart(3) + '%';
console.log('model tier  p m | TRUE: conv proper rm<.05 rm<.08 | SIMPLE: rm<.05 rm<.08 bic-bonus | 1F: rm<.05 rm<.08 bic-bonus | TRUE+allcov bic-bonus | eig>1 mode');
for (const model of FF.bank.MODELS) {
  const pop = FF.bank.populationSigma(model);
  if (!FF.la.chol(pop)) { console.log(model.id, 'POPULATION NOT PD'); continue; }
  const st = { conv: 0, proper: 0, t05: 0, t08: 0, s05: 0, s08: 0, sb: 0, o05: 0, o08: 0, ob: 0, ab: 0 };
  const eigCounts = {};
  const sameSimple = JSON.stringify(simpleSpec(model)) === JSON.stringify(trueAllCov(model));
  for (let r = 0; r < reps; r++) {
    const d = FF.bank.generate(model, N, 1000 + r * 7919, false);
    const tr = FF.sem.fit(d.spec, d.S, N);
    if (!tr.ok) { console.log(model.id, 'true fit failed', tr.reasons); continue; }
    if (tr.converged) st.conv++;
    if (!tr.improper) st.proper++;
    if (tr.rmsea < .05) st.t05++;
    if (tr.rmsea < .08) st.t08++;
    const ss = FF.sem.fit(simpleSpec(model), d.S, N);
    if (ss.ok) { if (ss.rmsea < .05) st.s05++; if (ss.rmsea < .08) st.s08++; if (ss.bic <= tr.bic + 2) st.sb++; }
    const of = FF.sem.fit(oneFactor(model), d.S, N);
    if (of.ok) { if (of.rmsea < .05) st.o05++; if (of.rmsea < .08) st.o08++; if (of.bic <= tr.bic + 2) st.ob++; }
    const ac = FF.sem.fit(trueAllCov(model), d.S, N);
    if (ac.ok && ac.bic <= tr.bic + 2) st.ab++;
    const ne = FF.la.eigSym(d.R).values.filter(v => v > 1).length;
    eigCounts[ne] = (eigCounts[ne] || 0) + 1;
  }
  const mode = Object.entries(eigCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(',');
  const { p, m } = FF.bank.dims(model);
  console.log(`${model.id} ${model.tier}  ${String(p).padStart(2)} ${m} | ${pct(st.conv / reps)} ${pct(st.proper / reps)} ${pct(st.t05 / reps)} ${pct(st.t08 / reps)} | ` +
    (sameSimple ? '   (same as true)         ' : `${pct(st.s05 / reps)} ${pct(st.s08 / reps)} ${pct(st.sb / reps)}     `) + `| ` +
    (m === 1 && !(model.resid || []).length ? '   (same as true)    ' : `${pct(st.o05 / reps)} ${pct(st.o08 / reps)} ${pct(st.ob / reps)}`) +
    ` | ${pct(st.ab / reps)} | ${mode}`);
}
