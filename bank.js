// FACTOR FIND — item bank of true (data-generating) factor models.
//
// Every model is in the standardized metric: items have unit variance in the
// population, `L` holds standardized loadings (rows = items, cols = factors),
// `phi` lists factor correlations [a, b, r] (absent pairs are orthogonal),
// and `resid` lists residual covariances between items [i, j, cov].
// Residual variances are 1 - communality.
//
// tier 1 = one clean factor, 2 = two clean factors / one twist,
// tier 3 = two factors with complications, 4 = three factors.
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const la = FF.la;

  const MODELS = [
    // ---------------- tier 1: one factor ----------------
    { id: 'B01', tier: 1, name: 'Warm-up',
      note: 'One factor, four strong items.',
      L: [[.80], [.75], [.70], [.60]] },
    { id: 'B02', tier: 1, name: 'Five of a kind',
      note: 'One factor, five items of decreasing quality.',
      L: [[.75], [.70], [.65], [.60], [.50]] },
    { id: 'B03', tier: 1, name: 'Reverse-keyed',
      note: 'One factor with two reverse-keyed (negatively loading) items.',
      L: [[.70], [.65], [-.60], [.65], [-.55], [.50]] },
    { id: 'B04', tier: 1, name: 'Long scale',
      note: 'One factor, seven items.',
      L: [[.70], [.65], [.60], [.60], [.55], [.50], [.45]] },

    // ---------------- tier 2: two factors / one twist ----------------
    { id: 'B05', tier: 2, name: 'Two by three',
      note: 'Two correlated factors, three items each.',
      L: [[.75, 0], [.70, 0], [.65, 0], [0, .70], [0, .65], [0, .60]],
      phi: [[0, 1, .35]] },
    { id: 'B06', tier: 2, name: 'Four and three',
      note: 'Two factors that correlate .50.',
      L: [[.70, 0], [.70, 0], [.60, 0], [.55, 0], [0, .75], [0, .65], [0, .60]],
      phi: [[0, 1, .50]] },
    { id: 'B07', tier: 2, name: 'Orthogonal',
      note: 'Two uncorrelated factors: the correlation matrix splits into two blocks.',
      L: [[.70, 0], [.65, 0], [.60, 0], [.60, 0], [0, .70], [0, .65], [0, .60], [0, .55]] },
    { id: 'B08', tier: 2, name: 'Opposites',
      note: 'Two factors that correlate negatively (−.40).',
      L: [[.75, 0], [.70, 0], [.60, 0], [0, .70], [0, .65], [0, .65]],
      phi: [[0, 1, -.40]] },
    { id: 'B09', tier: 2, name: 'Method effect',
      note: 'One factor; two items share extra variance (a residual correlation).',
      L: [[.70], [.65], [.60], [.60], [.55], [.50]],
      resid: [[4, 5, .28]] },

    // ---------------- tier 3: two factors with complications ----------------
    { id: 'B10', tier: 3, name: 'Cross-loader',
      note: 'Two factors; one item loads on both.',
      L: [[.70, 0], [.65, 0], [.60, 0], [.45, .45], [0, .70], [0, .65], [0, .60]],
      phi: [[0, 1, .30]] },
    { id: 'B11', tier: 3, name: 'Twin items',
      note: 'Two factors; two items of the same factor share a residual correlation.',
      L: [[.70, 0], [.65, 0], [.60, 0], [.55, 0], [0, .70], [0, .65], [0, .60], [0, .55]],
      phi: [[0, 1, .40]],
      resid: [[2, 3, .30]] },
    { id: 'B12', tier: 3, name: 'Negative cross-loading',
      note: 'Two factors; one item loads positively on one and negatively on the other.',
      L: [[.75, 0], [.70, 0], [.60, -.40], [0, .70], [0, .65], [0, .60]],
      phi: [[0, 1, .45]] },
    { id: 'B13', tier: 3, name: 'Double trouble',
      note: 'Two factors with a cross-loading and a residual correlation.',
      L: [[.70, 0], [.65, 0], [.60, 0], [.60, 0], [.45, .45], [0, .70], [0, .65], [0, .60], [0, .55]],
      phi: [[0, 1, .35]],
      resid: [[0, 1, .22]] },
    { id: 'B14', tier: 3, name: 'Bridge',
      note: 'Two factors connected by a residual correlation across factors.',
      L: [[.70, 0], [.65, 0], [.60, 0], [.60, 0], [0, .70], [0, .65], [0, .60], [0, .60]],
      phi: [[0, 1, .30]],
      resid: [[3, 4, .25]] },

    // ---------------- tier 4: three factors ----------------
    { id: 'B15', tier: 4, name: 'Three by three',
      note: 'Three correlated factors, three items each.',
      L: [[.75, 0, 0], [.70, 0, 0], [.65, 0, 0], [0, .70, 0], [0, .70, 0], [0, .60, 0],
          [0, 0, .75], [0, 0, .65], [0, 0, .60]],
      phi: [[0, 1, .30], [0, 2, .20], [1, 2, .40]] },
    { id: 'B16', tier: 4, name: 'Three with a cross-loader',
      note: 'Three factors; one item loads on two of them.',
      L: [[.75, 0, 0], [.70, 0, 0], [.45, .45, 0], [0, .70, 0], [0, .65, 0], [0, .60, 0],
          [0, 0, .75], [0, 0, .65], [0, 0, .60]],
      phi: [[0, 1, .25], [0, 2, .25], [1, 2, .35]] },
    { id: 'B17', tier: 4, name: 'Short scale',
      note: 'Three factors; the third has only two items (identified through its correlations).',
      L: [[.75, 0, 0], [.70, 0, 0], [.65, 0, 0], [0, .70, 0], [0, .70, 0], [0, .60, 0],
          [0, 0, .80], [0, 0, .70]],
      phi: [[0, 1, .30], [0, 2, .40], [1, 2, .30]] },
    { id: 'B18', tier: 4, name: 'Three and a bridge',
      note: 'Three factors and a residual correlation between items of different factors.',
      L: [[.75, 0, 0], [.70, 0, 0], [.65, 0, 0], [0, .70, 0], [0, .65, 0], [0, .65, 0],
          [0, 0, .75], [0, 0, .70], [0, 0, .60]],
      phi: [[0, 1, .30], [0, 2, .30], [1, 2, .30]],
      resid: [[2, 6, .25]] },
    { id: 'B19', tier: 4, name: 'Minimalist',
      note: 'Three factors from seven items: two factors have only two indicators.',
      L: [[.75, 0, 0], [.70, 0, 0], [.65, 0, 0], [0, .80, 0], [0, .70, 0], [0, 0, .80], [0, 0, .70]],
      phi: [[0, 1, .35], [0, 2, .25], [1, 2, .40]] },
    { id: 'B20', tier: 4, name: 'Final boss',
      note: 'Three factors, a cross-loading, a negative factor correlation and a residual correlation.',
      L: [[.75, 0, 0], [.70, 0, 0], [.60, 0, 0], [.45, .50, 0], [0, .70, 0], [0, .65, 0],
          [0, 0, .70], [0, 0, .65], [0, 0, .60]],
      phi: [[0, 1, .35], [0, 2, -.30], [1, 2, .25]],
      resid: [[7, 8, .25]] },
  ];

  function dims(model) { return { p: model.L.length, m: model.L[0].length }; }

  // Population covariance (= correlation) matrix of a bank model.
  function populationSigma(model) {
    const { p, m } = dims(model);
    const Phi = la.eye(m);
    for (const [a, b, r] of model.phi || []) { Phi[a][b] = r; Phi[b][a] = r; }
    const Sig = la.mul(la.mul(model.L, Phi), la.transpose(model.L));
    for (let i = 0; i < p; i++) Sig[i][i] = 1;
    for (const [i, j, c] of model.resid || []) { Sig[i][j] += c; Sig[j][i] += c; }
    return Sig;
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
      regressions: spec.regressions.slice(),
      factorCovs: spec.factorCovs.slice(),
      residCovs: spec.residCovs.map(([a, b]) => [pos[a], pos[b]]),
    };
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
    const X = [];
    for (let n = 0; n < N; n++) {
      const z = [];
      for (let i = 0; i < p; i++) z.push(rnd.normal());
      const x = new Array(p).fill(0);
      for (let i = 0; i < p; i++) for (let k = 0; k <= i; k++) x[i] += C[i][k] * z[k];
      X.push(x);
    }
    const mean = new Array(p).fill(0);
    for (const x of X) for (let i = 0; i < p; i++) mean[i] += x[i] / N;
    const S = la.zeros(p, p);
    for (const x of X) for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++)
      S[i][j] += (x[i] - mean[i]) * (x[j] - mean[j]) / N;
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) S[j][i] = S[i][j];
    return {
      model, N, seed, perm, S, R: la.cov2cor(S), X,
      spec: permuteSpec(trueSpec(model), perm),
    };
  }

  // Draw a round's dataset. Samples in which the true model itself does not
  // fit closely (RMSEA >= .05) or gives an improper solution are redrawn, so
  // that recovering the true structure always earns full fit points.
  function makeRound(model, N, seed, opts) {
    const maxTries = (opts && opts.maxTries) || 60;
    let last = null;
    for (let k = 0; k < maxTries; k++) {
      const d = generate(model, N, (seed + k * 104729) >>> 0, !(opts && opts.shuffle === false));
      const tf = FF.sem.fit(d.spec, d.S, N);
      d.trueFit = tf;
      d.tries = k + 1;
      last = d;
      if (tf.ok && tf.converged && !tf.improper && tf.rmsea < 0.05) return d;
    }
    return last;
  }

  FF.bank = { MODELS, dims, populationSigma, trueSpec, permuteSpec, generate, makeRound };
})(typeof window !== 'undefined' ? window : globalThis);
