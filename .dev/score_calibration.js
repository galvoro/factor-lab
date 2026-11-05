// How much do typical near-miss models cost (in BIC) at each level?
// Usage: node .dev/score_calibration.js [repsPerLevel]
const path = require('path');
const root = path.join(__dirname, '..');
['linalg.js', 'sem.js', 'bank.js'].forEach(f => require(path.join(root, f)));
const FF = globalThis.FF;
const reps = +process.argv[2] || 40;
const LEVELS = { 1: [150, 200, 250, 300, 400, 500], 2: [150, 200, 250, 300, 400, 500], 3: [150, 200, 250, 300, 400, 500], 4: [300, 400, 500, 750, 1000] };
const accept = (f) => f.pvalue >= 0.05 && f.rmsea < 0.05 && f.cfi >= 0.95 && f.srmr < 0.08;
const rnd = FF.la.rng(99);
const q = (xs, p) => { const s = xs.filter(isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const usable = (f) => f && f.ok && f.converged && !f.improper;
for (const lv of [1, 2, 3, 4]) {
  const pool = FF.bank.TEMPLATES.filter(t => t.level === lv && t.sizes.length);
  const junk = [], miss = [], simple = [], fitTrue = [], fitSimple = [];
  for (let r = 0; r < reps; r++) {
    const t = pool[rnd.int(pool.length)], N = LEVELS[lv][rnd.int(LEVELS[lv].length)];
    const d = FF.bank.makeRound(t, N, 1000 + r * 31 + lv * 7, { accept, support: 2, maxTries: 200 });
    const tf = d.trueFit, spec = d.spec;
    // one junk residual covariance
    const taken = new Set(spec.residCovs.map(([a, b]) => Math.min(a, b) + ',' + Math.max(a, b)));
    let a, b; do { a = rnd.int(spec.p); b = rnd.int(spec.p); } while (a === b || taken.has(Math.min(a, b) + ',' + Math.max(a, b)));
    const fj = FF.sem.fit(Object.assign({}, spec, { residCovs: spec.residCovs.concat([[a, b]]) }), d.S, N);
    if (usable(fj)) junk.push(fj.bic - tf.bic);
    // smallest single-feature miss (from the support check)
    if (d.support && d.support.length) miss.push(Math.min(...d.support.map(s => s.dBIC)));
    // simple structure: every item on its primary factor, all twists dropped
    const model = d.model, pos = []; d.perm.forEach((o, k) => { pos[o] = k; });
    const loadings = model.primary.map((f, i) => [pos[i], f]).filter(([, f]) => f >= 0);
    const ss = { p: spec.p, m: spec.m, loadings, regressions: [], factorCovs: spec.factorCovs.slice(), residCovs: [] };
    const fs = FF.sem.fit(ss, d.S, N);
    if (usable(fs)) { simple.push(fs.bic - tf.bic); fitSimple.push(fs); }
  }
  const pts = (x) => Math.max(0, 12 - 0.6 * Math.max(0, x)).toFixed(1);
  const row = (name, xs) => `  ${name.padEnd(28)} median dBIC ${q(xs, 0.5).toFixed(1).padStart(6)}  (IQR ${q(xs, 0.25).toFixed(1)}-${q(xs, 0.75).toFixed(1)})  -> parsimony now ${pts(q(xs, 0.5))} / 12`;
  console.log(`LEVEL ${lv} (${reps} datasets)`);
  console.log(row('+1 junk residual corr.', junk));
  if (miss.length) console.log(row('-1 twist (weakest)', miss));
  if (lv > 1) console.log(row('simple structure (no twists)', simple));
}
