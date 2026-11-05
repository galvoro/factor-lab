// FACTOR LAB — bank of true (data-generating) factor-model structures.
//
// Each round picks a structure template and draws fresh parameter values
// from RANGES, so no two datasets are alike. Everything is in the
// standardized metric: items have unit variance in the population, `L`
// holds standardized loadings (rows = items, cols = factors), `phi` lists
// factor correlations [a, b, r] (absent pairs are uncorrelated), and
// `resid` lists residual covariances [i, j, cov, r] (r = the correlation
// between the two residuals). Residual variances are 1 - communality.
//
// Template notation (items are numbered from 0, consecutively per factor):
//   sizes : number of items per factor
//   rev   : items whose primary loading is negative (reverse-keyed)
//   cross : [item, factor, sign]  secondary (cross-) loadings
//   resid : [i, j]                residual correlations (positive)
//   neg   : [a, b]                negatively correlated factor pairs
//   orth  : [a, b]                uncorrelated factor pairs
//
// level 1 = clean structure (incl. no factors at all), 2 = one twist,
// 3 = several twists, 4 = "Psychometrika": 10-15 items, 3-5 factors and
// several twists at once.
//   p     : [min, max] number of items for the no-factor template
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const la = FF.la;

  const RANGES = {
    load: [0.50, 0.90],    // primary loadings (absolute value)
    cross: [0.30, 0.50],   // cross-loadings (absolute value)
    phi: [0.20, 0.60],     // factor correlations (absolute value)
    resid: [0.25, 0.45],   // correlations between residuals
    minTheta: 0.15,        // smallest residual variance allowed
  };

  const T = (id, level, name, sizes, extra) =>
    Object.assign({ id, level, name, sizes, rev: [], cross: [], resid: [], neg: [], orth: [] }, extra || {});

  const TEMPLATES = [
    // ---------------- level 1: clean structure ----------------
    T('E00', 1, 'Nothing to find', [], { p: [5, 8] }),
    T('E01', 1, 'One factor, four items', [4]),
    T('E02', 1, 'One factor, five items', [5]),
    T('E03', 1, 'One factor, six items', [6]),
    T('E04', 1, 'One factor, seven items', [7]),
    T('E05', 1, 'One factor, eight items', [8]),
    T('E06', 1, 'One factor, nine items', [9]),
    T('E07', 1, 'One reversed item', [5], { rev: [4] }),
    T('E08', 1, 'Two reversed items', [6], { rev: [2, 5] }),
    T('E09', 1, 'Reversed item in a long scale', [8], { rev: [3] }),
    T('E10', 1, 'Two by three', [3, 3]),
    T('E11', 1, 'Four and three', [4, 3]),
    T('E12', 1, 'Two by four', [4, 4]),
    T('E13', 1, 'Five and four', [5, 4]),
    T('E14', 1, 'Opposites', [3, 3], { neg: [[0, 1]] }),
    T('E15', 1, 'Opposites, longer', [4, 4], { neg: [[0, 1]] }),
    T('E16', 1, 'Two factors, one reversed item', [4, 3], { rev: [1] }),

    // ---------------- level 2: one twist ----------------
    T('M01', 2, 'Method effect', [6], { resid: [[4, 5]] }),
    T('M02', 2, 'Method effect, short scale', [5], { resid: [[0, 1]] }),
    T('M03', 2, 'Method effect, long scale', [8], { resid: [[2, 6]] }),
    T('M04', 2, 'Reversed item and a twin pair', [7], { rev: [6], resid: [[1, 2]] }),
    T('M05', 2, 'Cross-loader', [3, 3], { cross: [[2, 1, 1]] }),
    T('M06', 2, 'Cross-loader, four and three', [4, 3], { cross: [[3, 1, 1]] }),
    T('M07', 2, 'Cross-loader, two by four', [4, 4], { cross: [[1, 1, 1]] }),
    T('M08', 2, 'Negative cross-loading', [4, 3], { cross: [[2, 1, -1]] }),
    T('M09', 2, 'Twin items', [4, 4], { resid: [[2, 3]] }),
    T('M10', 2, 'Bridge', [3, 4], { resid: [[2, 3]] }),
    T('M11', 2, 'Twins in the second factor', [5, 4], { resid: [[6, 7]] }),
    T('M12', 2, 'Orthogonal', [4, 4], { orth: [[0, 1]] }),
    T('M13', 2, 'Orthogonal, five and three', [5, 3], { orth: [[0, 1]] }),
    T('M14', 2, 'Three by three', [3, 3, 3]),
    T('M15', 2, 'Three factors, one short', [3, 3, 2]),
    T('M16', 2, 'Three factors from seven items', [3, 2, 2]),

    // ---------------- level 3: several twists ----------------
    T('H01', 3, 'Double trouble', [4, 4], { cross: [[3, 1, 1]], resid: [[0, 1]] }),
    T('H02', 3, 'Cross-loader and a bridge', [5, 4], { cross: [[1, 1, 1]], resid: [[4, 5]] }),
    T('H03', 3, 'Two cross-loaders', [4, 4], { cross: [[3, 1, 1], [4, 0, 1]] }),
    T('H04', 3, 'Two pairs of twins', [4, 5], { resid: [[0, 1], [6, 7]] }),
    T('H05', 3, 'Opposites with a cross-loader', [3, 4], { neg: [[0, 1]], cross: [[2, 1, 1]] }),
    T('H06', 3, 'Orthogonal with a cross-loader', [4, 4], { orth: [[0, 1]], cross: [[3, 1, 1]] }),
    T('H07', 3, 'Two method effects', [8], { resid: [[0, 1], [5, 6]] }),
    T('H08', 3, 'Negative wording', [7], { rev: [5, 6], resid: [[5, 6]] }),
    T('H09', 3, 'Three with a cross-loader', [3, 3, 3], { cross: [[2, 1, 1]] }),
    T('H10', 3, 'Three and a bridge', [3, 3, 3], { resid: [[2, 6]] }),
    T('H11', 3, 'Three, one opposed', [3, 3, 3], { neg: [[0, 2]] }),
    T('H12', 3, 'Short scale with a cross-loader', [3, 3, 2], { cross: [[5, 2, 1]] }),
    T('H13', 3, 'Three with twins', [3, 3, 3], { resid: [[3, 4]] }),
    T('H14', 3, 'Seven items, three factors and a bridge', [3, 2, 2], { resid: [[0, 5]] }),
    T('H15', 3, 'Odd one out', [3, 3, 3], { orth: [[0, 2], [1, 2]] }),
    T('H16', 3, 'Final boss', [3, 3, 3], { cross: [[3, 0, 1]], neg: [[0, 2]], resid: [[7, 8]] }),

    // ---------------- level 4: Psychometrika ----------------
    T('P01', 4, 'Four by three', [3, 3, 3, 3], { cross: [[2, 1, 1]], resid: [[6, 7]] }),
    T('P02', 4, 'Three by four', [4, 4, 4], { cross: [[3, 1, 1], [7, 2, 1]], resid: [[0, 1]] }),
    T('P03', 4, 'Four factors, two opposed', [4, 3, 3, 3], { neg: [[0, 3]], resid: [[1, 2], [8, 9]] }),
    T('P04', 4, 'Five by three', [3, 3, 3, 3, 3], { cross: [[5, 2, 1]], resid: [[9, 12]] }),
    T('P05', 4, 'Reversed and cross-loaded', [5, 4, 4], { rev: [4], cross: [[3, 1, 1], [8, 2, -1]], resid: [[10, 11]] }),
    T('P06', 4, 'An outsider factor', [3, 3, 3, 3], { orth: [[0, 3], [1, 3], [2, 3]], cross: [[1, 1, 1]], resid: [[4, 5]] }),
    T('P07', 4, 'Method pairs', [4, 4, 3], { resid: [[0, 1], [4, 5], [8, 9]], cross: [[3, 1, -1]] }),
    T('P08', 4, 'Short scale in a big model', [4, 3, 3, 2], { cross: [[6, 2, 1]], neg: [[1, 3]], resid: [[0, 7]] }),
    T('P09', 4, 'Five factors, fourteen items', [3, 3, 3, 3, 2], { cross: [[2, 1, 1]], resid: [[5, 8]] }),
    T('P10', 4, 'Three cross-loaders', [5, 5, 5], { cross: [[4, 1, 1], [9, 2, 1], [14, 0, 1]] }),
    T('P11', 4, 'Negative wording, four factors', [3, 3, 3, 3], { rev: [2, 5], resid: [[2, 5]], neg: [[0, 2]] }),
    T('P12', 4, 'Two big factors', [6, 6], { rev: [5, 11], resid: [[0, 1], [6, 7], [5, 11]] }),
  ];

  const hasPair = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  function dims(model) { return { p: model.L.length, m: model.L.length ? model.L[0].length : 0 }; }

  function phiMatrix(model) {
    const m = dims(model).m;
    const Phi = la.eye(m);
    for (const [a, b, r] of model.phi || []) { Phi[a][b] = r; Phi[b][a] = r; }
    return Phi;
  }

  // Population covariance (= correlation) matrix of a model.
  function populationSigma(model) {
    const { p, m } = dims(model);
    if (m === 0) return la.eye(p);                    // no factors: independent items
    const Sig = la.mul(la.mul(model.L, phiMatrix(model)), la.transpose(model.L));
    for (let i = 0; i < p; i++) Sig[i][i] = 1;
    for (const [i, j, c] of model.resid || []) { Sig[i][j] += c; Sig[j][i] += c; }
    return Sig;
  }

  // Draw parameter values for a template.
  function drawModel(t, rnd) {
    const U = (r) => r[0] + (r[1] - r[0]) * rnd();
    if (!t.sizes.length) {                             // the baseline (no-factor) model
      const p = t.p[0] + rnd.int(t.p[1] - t.p[0] + 1);
      return { template: t, id: t.id, level: t.level, name: t.name, L: [...Array(p)].map(() => []), phi: [], resid: [],
        primary: new Array(p).fill(-1), theta: new Array(p).fill(1) };
    }
    const p = t.sizes.reduce((s, v) => s + v, 0), m = t.sizes.length;
    for (let attempt = 0; attempt < 500; attempt++) {
      const L = la.zeros(p, m);
      const primary = [];
      let k = 0;
      t.sizes.forEach((s, f) => {
        for (let q = 0; q < s; q++, k++) { L[k][f] = U(RANGES.load) * (t.rev.includes(k) ? -1 : 1); primary.push(f); }
      });
      for (const [i, f, s] of t.cross) L[i][f] = s * U(RANGES.cross);
      const phi = [];
      for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
        if (hasPair(t.orth, a, b)) continue;
        phi.push([a, b, (hasPair(t.neg, a, b) ? -1 : 1) * U(RANGES.phi)]);
      }
      const model = { template: t, id: t.id, level: t.level, name: t.name, L, phi, resid: [], primary };
      const Phi = phiMatrix(model);
      const comm = la.mul(la.mul(L, Phi), la.transpose(L)).map((r, i) => r[i]);
      const theta = comm.map(c => 1 - c);
      if (theta.some(v => v < RANGES.minTheta)) continue;
      model.theta = theta;
      model.resid = t.resid.map(([i, j]) => {
        const r = U(RANGES.resid);
        return [i, j, r * Math.sqrt(theta[i] * theta[j]), r];
      });
      if (!la.chol(populationSigma(model))) continue;
      return model;
    }
    throw new Error('Could not draw parameters for template ' + t.id);
  }

  // Spec (for FF.sem.fit) of the true structure, in original item order.
  function trueSpec(model) {
    const { p, m } = dims(model);
    const loadings = [];
    for (let i = 0; i < p; i++) for (let j = 0; j < m; j++) if (model.L[i][j] !== 0) loadings.push([i, j]);
    const factorCovs = (model.phi || []).filter(([, , r]) => r !== 0).map(([a, b]) => [a, b]);
    const residCovs = (model.resid || []).map(([i, j]) => [i, j]);
    return { p, m, loadings, regressions: [], factorCovs, residCovs };
  }

  // Map a spec through an item permutation: displayed item k = original item perm[k].
  function permuteSpec(spec, perm) {
    const pos = new Array(perm.length);
    perm.forEach((orig, k) => { pos[orig] = k; });
    return {
      p: spec.p, m: spec.m,
      loadings: spec.loadings.map(([i, j]) => [pos[i], j]),
      regressions: (spec.regressions || []).slice(),
      factorCovs: (spec.factorCovs || []).slice(),
      residCovs: (spec.residCovs || []).map(([a, b]) => [pos[a], pos[b]]),
    };
  }

  // Merge factor b into factor a (used to check that every factor is needed).
  function mergeSpec(spec, a, b) {
    const map = (f) => (f === b ? a : f > b ? f - 1 : f);
    const seenL = new Set(), loadings = [];
    for (const [i, j] of spec.loadings) {
      const k = i + ',' + map(j);
      if (!seenL.has(k)) { seenL.add(k); loadings.push([i, map(j)]); }
    }
    const seenF = new Set(), factorCovs = [];
    for (const [x, y] of spec.factorCovs) {
      const u = map(x), v = map(y);
      if (u === v) continue;
      const k = Math.min(u, v) + ',' + Math.max(u, v);
      if (!seenF.has(k)) { seenF.add(k); factorCovs.push([u, v]); }
    }
    return { p: spec.p, m: spec.m - 1, loadings, regressions: [], factorCovs, residCovs: spec.residCovs.slice() };
  }

  // Simpler versions of the true structure, each missing one feature.
  function reducedSpecs(model) {
    const base = trueSpec(model);
    const t = model.template;
    const out = [];
    for (const [i, f] of t.cross) {
      out.push({ kind: 'cross', item: i, factor: f,
        spec: Object.assign({}, base, { loadings: base.loadings.filter(([x, y]) => !(x === i && y === f)) }) });
    }
    for (const [i, j] of t.resid) {
      out.push({ kind: 'resid', a: i, b: j,
        spec: Object.assign({}, base, { residCovs: base.residCovs.filter(([x, y]) => !((x === i && y === j) || (x === j && y === i))) }) });
    }
    for (const [a, b] of base.factorCovs) {
      out.push({ kind: 'phi', a, b,
        spec: Object.assign({}, base, { factorCovs: base.factorCovs.filter(([x, y]) => !(x === a && y === b)) }) });
    }
    for (let a = 0; a < base.m; a++) for (let b = a + 1; b < base.m; b++) {
      out.push({ kind: 'merge', a, b, spec: mergeSpec(base, a, b) });
    }
    return out;
  }

  // Simulate N multivariate-normal observations; return the ML covariance
  // matrix (denominator N) in displayed (permuted) order, plus bookkeeping.
  function generate(model, N, seed, shuffle) {
    const rnd = la.rng(seed);
    const { p } = dims(model);
    const perm = shuffle === false ? [...Array(p).keys()] : rnd.shuffle([...Array(p).keys()]);
    const SigPop = populationSigma(model);
    const Sp = perm.map(a => perm.map(b => SigPop[a][b]));
    const C = la.chol(Sp);
    const mean = new Array(p).fill(0);
    const X = [];
    for (let n = 0; n < N; n++) {
      const z = [];
      for (let i = 0; i < p; i++) z.push(rnd.normal());
      const x = new Array(p).fill(0);
      for (let i = 0; i < p; i++) for (let k = 0; k <= i; k++) x[i] += C[i][k] * z[k];
      X.push(x);
      for (let i = 0; i < p; i++) mean[i] += x[i] / N;
    }
    const S = la.zeros(p, p);
    for (const x of X) for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++)
      S[i][j] += (x[i] - mean[i]) * (x[j] - mean[j]) / N;
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) S[j][i] = S[i][j];
    return {
      model, N, seed, perm, S, R: la.cov2cor(S),
      spec: permuteSpec(trueSpec(model), perm),
    };
  }

  const usable = (f) => f && f.ok && f.converged && !f.improper;

  // How much worse (in BIC) each one-feature-simpler model is on this sample.
  function supportOf(d, opts) {
    const minGap = opts.support;
    const out = [];
    for (const r of reducedSpecs(d.model)) {
      const f = FF.sem.fit(permuteSpec(r.spec, d.perm), d.S, d.N);
      const dBIC = usable(f) ? f.bic - d.trueFit.bic : Infinity;
      out.push({ kind: r.kind, dBIC });
      if (opts.early && dBIC < minGap) break;
    }
    return out;
  }

  // Draw a round: parameters + dataset. Draws are repeated until (1) the
  // true structure fits this sample by every criterion in `opts.accept`
  // and gives a proper solution, and (2) the sample supports every feature
  // of the truth: dropping any cross-loading, residual correlation or factor
  // correlation, or merging two factors, raises BIC by at least
  // `opts.support`. So the truth is always the best-scoring answer, and
  // nothing in it is undetectable noise.
  function makeRound(template, N, seed, opts) {
    opts = Object.assign({ support: 2, maxTries: 80, accept: (f) => f.rmsea < 0.05, shuffle: true, early: true }, opts || {});
    const rnd = la.rng(seed);
    let fallback = null;
    for (let k = 0; k < opts.maxTries; k++) {
      const model = drawModel(template, rnd);
      const d = generate(model, N, Math.floor(rnd() * 4294967296) >>> 0, opts.shuffle);
      d.trueFit = FF.sem.fit(d.spec, d.S, N);
      d.tries = k + 1;
      if (!usable(d.trueFit) || !opts.accept(d.trueFit)) { if (!fallback) fallback = d; continue; }
      d.support = supportOf(d, opts);
      fallback = d;
      if (d.support.every(s => s.dBIC >= opts.support)) { d.accepted = true; return d; }
    }
    fallback.accepted = false;
    return fallback;
  }

  // True population values in the format of FF.sem.fit()'s `est`, in
  // displayed item order (used to colour the true-model diagram).
  function trueEst(model, perm) {
    const { p, m } = dims(model);
    const pos = new Array(p);
    perm.forEach((orig, k) => { pos[orig] = k; });
    const theta = model.theta;
    const est = [];
    for (let i = 0; i < p; i++) for (let j = 0; j < m; j++)
      if (model.L[i][j] !== 0) est.push({ mat: 'L', r: pos[i], c: j, std: model.L[i][j] });
    for (const [a, b, r] of model.phi || []) if (r !== 0) est.push({ mat: 'P', r: Math.max(a, b), c: Math.min(a, b), std: r });
    for (const [i, j, c] of model.resid || []) {
      est.push({ mat: 'T', r: Math.max(pos[i], pos[j]), c: Math.min(pos[i], pos[j]), std: c / Math.sqrt(theta[i] * theta[j]) });
    }
    for (let i = 0; i < p; i++) est.push({ mat: 'T', r: pos[i], c: pos[i], std: theta[i] });
    return { est };
  }

  // ------------------------------------------------------------------
  // Plain-language description of the true model (displayed numbering).
  // ------------------------------------------------------------------
  const LETTERS = 'ABCDEFGHI';
  const NOTES = {
    rev: '<b>Reverse-keyed</b> items load negatively.',
    cross: 'A <b>cross-loading</b> item measures two factors.',
    resid: 'A <b>residual correlation</b>: two items share something beyond their factor, such as similar wording.',
    neg: '<b>Negatively correlated factors</b> give a block of negative correlations.',
    orth: '<b>Uncorrelated factors</b> give separate blocks; a factor correlation is an unneeded parameter.',
    short: 'A <b>two-item factor</b> is identified only through its correlations with other factors.',
    none: 'The <b>baseline model</b>: no factors, so the items are independent. The best answer was to fit the model without any factors.',
  };

  const f2 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace(/^0/, '');
  const list = (xs) => xs.length <= 1 ? String(xs[0]) : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];

  function describe(model, perm) {
    const t = model.template;
    const { p, m } = dims(model);
    const pos = new Array(p);
    perm.forEach((orig, k) => { pos[orig] = k; });
    const num = (i) => pos[i] + 1;
    const lines = [];
    const groups = [];
    if (m === 0) return { name: t.name, level: t.level, lines: ['No factors: all ' + p + ' items are uncorrelated, apart from sampling noise'], notes: [NOTES.none] };
    for (let f = 0; f < m; f++) {
      const its = [];
      for (let i = 0; i < p; i++) if (model.primary[i] === f) its.push(i);
      groups.push(its);
      const shown = its.map(num).sort((a, b) => a - b);
      const rev = its.filter(i => t.rev.includes(i)).map(num).sort((a, b) => a - b);
      let s = (m === 1 ? 'One factor' : 'Factor ' + LETTERS[f]) + ': items ' + list(shown);
      if (rev.length) s += rev.length === 1 ? ` (item ${rev[0]} reverse-keyed)` : ` (items ${list(rev)} reverse-keyed)`;
      lines.push(s);
    }
    for (const [i, f] of t.cross) lines.push(`Item ${num(i)} also loads on factor ${LETTERS[f]} (${f2(model.L[i][f])})`);
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
      const e = model.phi.find(([x, y]) => x === a && y === b);
      lines.push(e ? `Factors ${LETTERS[a]} and ${LETTERS[b]} correlate ${f2(e[2])}` : `Factors ${LETTERS[a]} and ${LETTERS[b]} are uncorrelated`);
    }
    for (const [i, j, , r] of model.resid) {
      const [x, y] = [num(i), num(j)].sort((a, b) => a - b);
      lines.push(`Items ${x} and ${y} share a residual correlation (${f2(r)})`);
    }
    const notes = [];
    if (t.rev.length) notes.push(NOTES.rev);
    if (t.cross.length) notes.push(NOTES.cross);
    if (t.resid.length) notes.push(NOTES.resid);
    if (t.neg.length) notes.push(NOTES.neg);
    if (t.orth.length) notes.push(NOTES.orth);
    if (t.sizes.some(s => s === 2)) notes.push(NOTES.short);
    return { name: t.name, level: t.level, lines, notes };
  }

  // ------------------------------------------------------------------
  // Compare the player's structure with the truth (both in displayed item
  // order). Player factors are matched to true factors by their shared
  // items. Returns found / missed / extra features.
  // ------------------------------------------------------------------
  function compareStructure(ts, ps) {
    const mt = ts.m, mp = ps.m;
    const setsT = [...Array(mt)].map((_, j) => new Set(ts.loadings.filter(l => l[1] === j).map(l => l[0])));
    const setsP = [...Array(mp)].map((_, k) => new Set(ps.loadings.filter(l => l[1] === k).map(l => l[0])));
    let best = new Array(mt).fill(-1), bestScore = -1;
    const assign = new Array(mt).fill(-1), used = new Set();
    (function rec(j, score) {
      if (j === mt) { if (score > bestScore) { bestScore = score; best = assign.slice(); } return; }
      assign[j] = -1; rec(j + 1, score);
      for (let k = 0; k < mp; k++) {
        if (used.has(k)) continue;
        let ov = 0; for (const i of setsT[j]) if (setsP[k].has(i)) ov++;
        if (!ov) continue;
        used.add(k); assign[j] = k; rec(j + 1, score + ov); used.delete(k); assign[j] = -1;
      }
    })(0, 0);
    const inv = new Array(mp).fill(-1);
    best.forEach((k, j) => { if (k >= 0) inv[k] = j; });
    const L = (j) => LETTERS[j];
    const items = (set) => [...set].map(i => i + 1).sort((a, b) => a - b);
    const out = { found: [], missed: [], extra: [], counts: {} };
    const pairKey = (a, b) => Math.min(a, b) + ',' + Math.max(a, b);

    // factors
    for (let j = 0; j < mt; j++) {
      if (best[j] < 0) out.missed.push({ kind: 'factor', text: (mt === 1 ? 'The factor' : 'Factor ' + L(j)) + ' (items ' + list(items(setsT[j])) + ')' });
    }
    for (let k = 0; k < mp; k++) {
      if (inv[k] < 0) out.extra.push({ kind: 'factor', text: setsP[k].size ? 'An extra factor (items ' + list(items(setsP[k])) + ')' : 'An extra factor without items' });
    }
    // loadings
    const pl = new Set(ps.loadings.map(([i, k]) => i + ',' + k));
    let nf = 0;
    for (const [i, j] of ts.loadings) {
      const k = best[j];
      if (k >= 0 && pl.has(i + ',' + k)) nf++;
      else if (k >= 0) out.missed.push({ kind: 'load', text: `Loading of item ${i + 1} on ${mt === 1 ? 'the factor' : 'factor ' + L(j)}` });
    }
    out.counts.load = [nf, ts.loadings.length];
    const tl = new Set(ts.loadings.map(([i, j]) => i + ',' + j));
    for (const [i, k] of ps.loadings) {
      const j = inv[k];
      if (j >= 0 && !tl.has(i + ',' + j)) out.extra.push({ kind: 'load', text: `Loading of item ${i + 1} on ${mt === 1 ? 'the factor' : 'factor ' + L(j)}` });
    }
    // factor correlations (a regression between two factors counts as an association)
    const pf = new Set(ps.factorCovs.map(([a, b]) => pairKey(a, b)).concat((ps.regressions || []).map(([a, b]) => pairKey(a, b))));
    const tf = new Set(ts.factorCovs.map(([a, b]) => pairKey(a, b)));
    let ff = 0;
    for (let a = 0; a < mt; a++) for (let b = a + 1; b < mt; b++) {
      const inTruth = tf.has(pairKey(a, b));
      const ka = best[a], kb = best[b];
      if (ka < 0 || kb < 0) continue;
      const inPlayer = pf.has(pairKey(ka, kb));
      if (inTruth && inPlayer) ff++;
      else if (inTruth) out.missed.push({ kind: 'phi', text: `Correlation between factors ${L(a)} and ${L(b)}` });
      else if (inPlayer) out.extra.push({ kind: 'phi', text: `Correlation between factors ${L(a)} and ${L(b)} (they are uncorrelated)` });
    }
    out.counts.phi = [ff, ts.factorCovs.length];
    // residual correlations
    const pr = new Set(ps.residCovs.map(([a, b]) => pairKey(a, b)));
    const tr = new Set(ts.residCovs.map(([a, b]) => pairKey(a, b)));
    let rf = 0;
    for (const k of tr) {
      const [a, b] = k.split(',').map(Number);
      if (pr.has(k)) rf++; else out.missed.push({ kind: 'resid', text: `Residual correlation between items ${a + 1} and ${b + 1}` });
    }
    for (const k of pr) {
      if (tr.has(k)) continue;
      const [a, b] = k.split(',').map(Number);
      out.extra.push({ kind: 'resid', text: `Residual correlation between items ${a + 1} and ${b + 1}` });
    }
    out.counts.resid = [rf, ts.residCovs.length];
    out.exact = !out.missed.length && !out.extra.length;
    out.map = best;
    return out;
  }

  FF.bank = {
    TEMPLATES, RANGES, LETTERS, dims, populationSigma, drawModel, trueSpec, permuteSpec, mergeSpec,
    reducedSpecs, generate, makeRound, trueEst, describe, compareStructure,
  };
})(typeof window !== 'undefined' ? window : globalThis);
