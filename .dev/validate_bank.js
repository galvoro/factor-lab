// Audit of the structure bank: identification of every template, how many
// draws makeRound() needs at the smallest and largest N, generation time, and
// fit of the accepted true models.
// Usage: node .dev/validate_bank.js [reps] [N ...]
const path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'linalg.js'));
require(path.join(root, 'sem.js'));
require(path.join(root, 'bank.js'));
const FF = globalThis.FF;
const reps = +process.argv[2] || 20;
const Ns = process.argv.slice(3).map(Number).filter(Boolean);
if (!Ns.length) Ns.push(150, 500);

// must match CONFIG.CRITERIA in game.js (top tier of every fit criterion)
const accept = (f) => f.pvalue >= 0.05 && f.rmsea < 0.05 && f.cfi >= 0.95 && Math.min(1, f.df === f.dfBaseline ? f.cfi : f.tli) >= 0.95 && f.srmr < 0.08;

const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
let bad = 0;
console.log('id   lvl  p m  df | N    accepted  tries(mean/max)  ms(mean/max)  srmr(med/max)');
for (const t of FF.bank.TEMPLATES) {
  const rnd = FF.la.rng(1);
  const model = FF.bank.drawModel(t, rnd);
  const spec = FF.bank.trueSpec(model);
  const id = FF.sem.checkIdentification(spec);
  if (!id.ok) { console.log(t.id, 'NOT IDENTIFIED', id.reasons.join(' ')); bad++; continue; }
  for (const N of Ns) {
    let acc = 0; const tries = [], ms = [], srmr = [];
    for (let r = 0; r < reps; r++) {
      const t0 = process.hrtime.bigint();
      const d = FF.bank.makeRound(t, N, 1000 + r * 7919, { accept, support: 2 });
      ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
      tries.push(d.tries);
      if (d.accepted) { acc++; srmr.push(d.trueFit.srmr); }
    }
    const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
    if (acc < reps) bad++;
    console.log(`${t.id}  ${t.level}   ${String(spec.p).padStart(1)} ${spec.m}  ${String(id.df).padStart(2)} | ${String(N).padEnd(4)} ${String(acc).padStart(3)}/${reps}    ${mean(tries).toFixed(1).padStart(5)} / ${String(Math.max(...tries)).padStart(2)}      ${mean(ms).toFixed(0).padStart(4)} / ${Math.max(...ms).toFixed(0).padStart(4)}   ${srmr.length ? q(srmr, .5).toFixed(3) + ' / ' + Math.max(...srmr).toFixed(3) : '-'}`);
  }
}
console.log(bad ? `\n${bad} template/N combinations need attention.` : '\nAll templates identified and generated within the try budget.');
