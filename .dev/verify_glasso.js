// Compare the JS EBICglasso with qgraph::EBICglasso.
// 1) node .dev/verify_glasso.js [perTemplate]   -> .dev/out/glasso_cases.json
// 2) Rscript .dev/verify_glasso.R
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
['linalg.js', 'sem.js', 'bank.js', 'glasso.js'].forEach(f => require(path.join(root, f)));
const FF = globalThis.FF;
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const per = +process.argv[2] || 3;
const Ns = [150, 200, 250, 300, 400, 500];
const rnd = FF.la.rng(424242);
const cases = [];
let ms = 0, n = 0, worstMs = 0;
for (const tpl of FF.bank.TEMPLATES) {
  for (let r = 0; r < per; r++) {
    const N = Ns[rnd.int(Ns.length)];
    const d = FF.bank.makeRound(tpl, N, 777 + cases.length * 13);
    const t0 = process.hrtime.bigint();
    const g = FF.glasso.ebicGlasso(d.R, N);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    ms += dt; n++; worstMs = Math.max(worstMs, dt);
    // also the model-implied matrix of the true structure (smooth, population-like)
    const gi = FF.glasso.ebicGlasso(d.trueFit.impliedCor, N);
    cases.push({ id: tpl.id, N, R: d.R, net: g.net, lambda: g.lambda, Ri: d.trueFit.impliedCor, neti: gi.net, lambdai: gi.lambda });
  }
}
fs.writeFileSync(path.join(out, 'glasso_cases.json'), JSON.stringify(cases));
console.log(`${cases.length} data + ${cases.length} model-implied cases written; JS time per EBICglasso: mean ${(ms / n).toFixed(1)} ms, max ${worstMs.toFixed(1)} ms`);
