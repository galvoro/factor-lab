// FACTOR FIND — regularized partial correlations (EBICglasso).
//
// Written from the published algorithms, not from the glasso Fortran:
//   * graphical lasso: block coordinate descent of Friedman, Hastie &
//     Tibshirani (2008, Biostatistics), with an unpenalized diagonal;
//   * model selection as in qgraph::EBICglasso: 100 log-spaced penalties
//     from 0.01 * max|r| to max|r|, EBIC with gamma = 0.5 computed the way
//     qgraph's ggmFit() does, lowest EBIC wins.
// The convergence tolerances are tighter than glasso's defaults, so results
// agree with qgraph to about two decimals (checked in .dev/verify_glasso.*).
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const la = FF.la;

  const soft = (a, t) => (a > t ? a - t : a < -t ? a + t : 0);

  // Graphical lasso for a correlation matrix S and penalty rho (off-diagonal
  // only). `warm` = { W, B } from a previous (larger) penalty speeds things up.
  // Returns { W, B, K } with K the (symmetrized) precision matrix.
  function glasso(S, rho, warm) {
    const p = S.length;
    const W = warm ? warm.W.map(r => r.slice()) : S.map((r, i) => r.map((v, j) => (i === j ? v : 0)));
    const B = warm ? warm.B.map(r => r.slice()) : la.zeros(p, p);    // B[j] = lasso coefficients of column j
    for (let it = 0; it < 500; it++) {
      let change = 0;
      for (let j = 0; j < p; j++) {
        const b = B[j];
        // lasso: min 1/2 b'W11 b - s12'b + rho |b|_1, by coordinate descent
        for (let inner = 0; inner < 2000; inner++) {
          let dmax = 0;
          for (let k = 0; k < p; k++) {
            if (k === j) continue;
            let a = S[k][j];
            const Wk = W[k];
            for (let l = 0; l < p; l++) if (l !== j && l !== k) a -= Wk[l] * b[l];
            const nb = soft(a, rho) / Wk[k];
            const d = Math.abs(nb - b[k]);
            if (d > dmax) dmax = d;
            b[k] = nb;
          }
          if (dmax < 1e-10) break;
        }
        // w12 = W11 b
        for (let k = 0; k < p; k++) {
          if (k === j) continue;
          let w = 0;
          const Wk = W[k];
          for (let l = 0; l < p; l++) if (l !== j) w += Wk[l] * b[l];
          change += Math.abs(w - W[k][j]);
          W[k][j] = w; W[j][k] = w;
        }
      }
      if (change / (p * (p - 1)) < 1e-11) break;
    }
    // precision matrix from W and the coefficients
    const K = la.zeros(p, p);
    for (let j = 0; j < p; j++) {
      let wb = 0;
      for (let k = 0; k < p; k++) if (k !== j) wb += W[k][j] * B[j][k];
      const kjj = 1 / (W[j][j] - wb);
      K[j][j] = kjj;
      for (let k = 0; k < p; k++) if (k !== j) K[k][j] = -B[j][k] * kjj;
    }
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
      // a zero stays a zero (sparsity pattern of the lasso), otherwise average
      const a = K[i][j], c = K[j][i];
      const v = a === 0 || c === 0 ? 0 : (a + c) / 2;
      K[i][j] = v; K[j][i] = v;
    }
    return { W, B, K };
  }

  // Partial correlations from a precision matrix (qgraph::wi2net).
  function wi2net(K) {
    const p = K.length;
    return K.map((r, i) => r.map((v, j) => (i === j ? 0 : -v / Math.sqrt(K[i][i] * K[j][j]))));
  }

  // qgraph::EBICglasso(S, n, gamma) -> regularized partial correlation matrix.
  function ebicGlasso(Sin, n, opts) {
    opts = opts || {};
    const gamma = opts.gamma === undefined ? 0.5 : opts.gamma;
    const nlambda = opts.nlambda || 100, ratio = opts.lambdaMinRatio || 0.01;
    const R = la.cov2cor(Sin);
    const p = R.length;
    let lmax = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) lmax = Math.max(lmax, Math.abs(R[i][j]));
    if (lmax === 0) return { net: la.zeros(p, p), lambda: 0, index: 0, ebic: [] };
    const lmin = ratio * lmax;
    const lambda = [];
    for (let k = 0; k < nlambda; k++) lambda.push(Math.exp(Math.log(lmin) + (Math.log(lmax) - Math.log(lmin)) * k / (nlambda - 1)));

    const logdetR = la.logdetChol(la.chol(R));
    const pen = Math.log(n) + 4 * gamma * Math.log(p);
    const ebic = new Array(nlambda), nets = new Array(nlambda);
    let warm = null;
    // fit from sparse (large penalty) to dense, warm-starting each fit
    for (let k = nlambda - 1; k >= 0; k--) {
      const fit = glasso(R, lambda[k], warm);
      warm = fit;
      const net = wi2net(fit.K);
      nets[k] = net;
      // ggmFit(): implied correlations from the network, -2LL up to a constant
      let E = 0;
      for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) if (Math.abs(net[i][j]) > 1e-12) E++;
      const Q = la.cov2cor(la.inv(fit.K));
      const Lq = la.chol(Q);
      if (!Lq) { ebic[k] = Infinity; continue; }
      const Qi = la.cholInv(Lq);
      let tr = 0;
      for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += R[i][j] * Qi[j][i];
      const f = tr - logdetR + la.logdetChol(Lq) - p;
      ebic[k] = n * f + E * pen;
    }
    let opt = 0;
    for (let k = 1; k < nlambda; k++) if (ebic[k] < ebic[opt]) opt = k;   // first minimum, like which.min
    return { net: nets[opt], lambda: lambda[opt], index: opt, ebic };
  }

  FF.glasso = { glasso, wi2net, ebicGlasso };
})(typeof window !== 'undefined' ? window : globalThis);
