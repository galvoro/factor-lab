// FACTOR FIND — maximum-likelihood factor-model estimation.
//
// Model (LISREL all-y / psychonetrics lvm):
//   Sigma = Lambda (I - B)^-1 Psi (I - B)^-T Lambda' + Theta
// Identification follows lavaan's std.lv = TRUE: latent (residual) variances
// are fixed to 1 and all drawn loadings are free. Estimation minimises
//   F_ML = log|Sigma| + tr(S Sigma^-1) - log|S| - p
// (S with denominator N, as lavaan does for raw data) by Fisher scoring with
// Levenberg-Marquardt damping. chi-square = N * F_ML. Fit indices follow
// lavaan's definitions (RMSEA with N, CFI/TLI vs the independence model,
// Bentler's SRMR, BIC without a mean structure).
//
// spec = {
//   p, m,
//   loadings:    [[obs, fac], ...]
//   regressions: [[toFac, fromFac], ...]     // fromFac -> toFac
//   factorCovs:  [[facA, facB], ...]
//   residCovs:   [[obsA, obsB], ...]
// }
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const la = FF.la;

  // ------------------------------------------------------------------
  // Parameter table
  // ------------------------------------------------------------------
  function buildParams(spec) {
    const params = [];
    for (const [i, j] of spec.loadings) params.push({ mat: 'L', r: i, c: j });
    for (const [t, f] of spec.regressions || []) params.push({ mat: 'B', r: t, c: f });
    for (const [a, b] of spec.factorCovs || []) params.push({ mat: 'P', r: Math.max(a, b), c: Math.min(a, b) });
    for (let i = 0; i < spec.p; i++) params.push({ mat: 'T', r: i, c: i });
    for (const [a, b] of spec.residCovs || []) params.push({ mat: 'T', r: Math.max(a, b), c: Math.min(a, b) });
    return params;
  }

  function matricesFrom(spec, params, theta) {
    const { p, m } = spec;
    const L = la.zeros(p, m), B = la.zeros(m, m), P = la.eye(m), T = la.zeros(p, p);
    params.forEach((q, k) => {
      const v = theta[k];
      if (q.mat === 'L') L[q.r][q.c] = v;
      else if (q.mat === 'B') B[q.r][q.c] = v;
      else if (q.mat === 'P') { P[q.r][q.c] = v; P[q.c][q.r] = v; }
      else { T[q.r][q.c] = v; T[q.c][q.r] = v; }
    });
    return { L, B, P, T };
  }

  function implied(spec, mats) {
    const { m } = spec;
    let A;
    if (m === 0) A = [];
    else {
      const IB = la.eye(m);
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) IB[i][j] -= mats.B[i][j];
      A = la.inv(IB);
      if (!A) return null;
    }
    const M = m ? la.mul(la.mul(A, mats.P), la.transpose(A)) : [];     // latent covariance
    const LA = m ? la.mul(mats.L, A) : mats.L.map(() => []);           // p x m
    const G = m ? la.mul(mats.L, M) : mats.L.map(() => []);            // p x m  (Lambda M)
    const Sigma = m ? la.add(la.mul(G, la.transpose(mats.L)), mats.T) : la.clone(mats.T);
    return { A, M, LA, G, Sigma };
  }

  // dSigma/dtheta_k as dense p x p matrices.
  function derivatives(spec, params, imp) {
    const p = spec.p;
    const { LA, G } = imp;
    return params.map(q => {
      const D = la.zeros(p, p);
      if (q.mat === 'L') {
        const i = q.r, j = q.c;
        for (let c = 0; c < p; c++) { D[i][c] += G[c][j]; D[c][i] += G[c][j]; }
      } else if (q.mat === 'P') {
        const a = q.r, b = q.c;
        for (let r = 0; r < p; r++) for (let c = 0; c < p; c++)
          D[r][c] = LA[r][a] * LA[c][b] + LA[r][b] * LA[c][a];
      } else if (q.mat === 'B') {
        const t = q.r, f = q.c;
        for (let r = 0; r < p; r++) for (let c = 0; c < p; c++)
          D[r][c] = LA[r][t] * G[c][f] + LA[c][t] * G[r][f];
      } else {
        if (q.r === q.c) D[q.r][q.r] = 1;
        else { D[q.r][q.c] = 1; D[q.c][q.r] = 1; }
      }
      return D;
    });
  }

  function trProd(A, B) {
    let s = 0;
    const n = A.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += A[i][j] * B[j][i];
    return s;
  }

  // ------------------------------------------------------------------
  // Objective
  // ------------------------------------------------------------------
  function objective(spec, params, theta, S, logdetS) {
    const mats = matricesFrom(spec, params, theta);
    const imp = implied(spec, mats);
    if (!imp) return { F: Infinity };
    const Lc = la.chol(imp.Sigma);
    if (!Lc) return { F: Infinity };
    const Si = la.cholInv(Lc);
    const F = la.logdetChol(Lc) + trProd(S, Si) - logdetS - spec.p;
    return { F, mats, imp, Si, logdetSigma: la.logdetChol(Lc) };
  }

  function startValues(spec, params, S) {
    const p = spec.p;
    const R = la.cov2cor(S);
    const nload = new Array(p).fill(0);
    for (const [i] of spec.loadings) nload[i]++;
    const indicators = {};
    for (const [i, j] of spec.loadings) (indicators[j] = indicators[j] || []).push(i);
    return params.map(q => {
      if (q.mat === 'L') {
        const i = q.r, j = q.c;
        let s = 0;
        for (const k of indicators[j]) if (k !== i) s += R[i][k];
        const sign = s < 0 ? -1 : 1;
        return sign * 0.6 * Math.sqrt(S[i][i]) / Math.sqrt(nload[i]);
      }
      if (q.mat === 'T') return q.r === q.c ? (nload[q.r] ? 0.5 * S[q.r][q.r] : S[q.r][q.r]) : 0;
      return 0;
    });
  }

  // ------------------------------------------------------------------
  // Fisher scoring with LM damping
  // ------------------------------------------------------------------
  function optimise(spec, params, S, theta0, opts) {
    const maxIter = (opts && opts.maxIter) || 400;
    const logdetS = la.logdetChol(la.chol(S));
    let theta = theta0.slice();
    let cur = objective(spec, params, theta, S, logdetS);
    if (!isFinite(cur.F)) {
      // shrink towards a diagonal start until Sigma is PD
      for (let tries = 0; tries < 30 && !isFinite(cur.F); tries++) {
        theta = theta.map((v, k) => params[k].mat === 'T' && params[k].r === params[k].c ? v * 1.5 : v * 0.7);
        cur = objective(spec, params, theta, S, logdetS);
      }
      if (!isFinite(cur.F)) return { converged: false, theta, F: Infinity, iterations: 0 };
    }
    let mu = 1e-4;
    let iter = 0, converged = false, gradMax = Infinity;
    const np = params.length;
    for (iter = 1; iter <= maxIter; iter++) {
      const Dk = derivatives(spec, params, cur.imp);
      const Si = cur.Si;
      const Wres = la.mul(la.mul(Si, la.sub(cur.imp.Sigma, S)), Si);
      const Q = Dk.map(D => la.mul(Si, D));
      const g = Dk.map(D => trProd(Wres, D));
      const H = la.zeros(np, np);
      for (let a = 0; a < np; a++) for (let b = 0; b <= a; b++) {
        const v = trProd(Q[a], Q[b]);
        H[a][b] = v; H[b][a] = v;
      }
      gradMax = Math.max(...g.map(Math.abs));
      if (gradMax < 1e-9) { converged = true; break; }

      let accepted = false;
      for (let tries = 0; tries < 25; tries++) {
        const Hd = H.map((row, a) => row.map((v, b) => (a === b ? v + mu * (v + 1e-8) : v)));
        const step = la.solve(Hd, g.map(v => -v));
        if (!step) { mu = mu * 10 + 1e-6; continue; }
        const trial = theta.map((v, k) => v + step[k]);
        const nxt = objective(spec, params, trial, S, logdetS);
        if (isFinite(nxt.F) && nxt.F <= cur.F + 1e-15) {
          const dF = cur.F - nxt.F;
          theta = trial; cur = nxt;
          mu = Math.max(mu / 10, 1e-12);
          accepted = true;
          if (dF < 1e-15 && Math.max(...step.map(Math.abs)) < 1e-10) { converged = true; }
          break;
        }
        mu = mu * 10 + 1e-8;
      }
      if (!accepted) {
        // Cannot improve: converged if the gradient is already tiny.
        converged = gradMax < 1e-5;
        break;
      }
      if (converged) break;
    }
    return { converged, theta, F: cur.F, iterations: iter, gradMax, cur };
  }

  // ------------------------------------------------------------------
  // Identification
  // ------------------------------------------------------------------
  function jacobianRank(spec, params, rnd) {
    // Random, well-conditioned parameter values; check the rank of
    // d vech(Sigma) / d theta.
    const theta = params.map(q => {
      if (q.mat === 'L') return (0.4 + 0.5 * rnd()) * (rnd() < 0.2 ? -1 : 1);
      if (q.mat === 'B') return 0.2 + 0.3 * rnd();
      if (q.mat === 'P') return -0.15 + 0.4 * rnd();
      if (q.mat === 'T') return q.r === q.c ? 0.4 + 0.4 * rnd() : 0.05 + 0.1 * rnd();
      return 0;
    });
    const mats = matricesFrom(spec, params, theta);
    const imp = implied(spec, mats);
    if (!imp) return { rank: 0, np: params.length };
    const Dk = derivatives(spec, params, imp);
    const p = spec.p;
    const rows = [];
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) rows.push([i, j]);
    const J = rows.map(([i, j]) => Dk.map(D => D[i][j]));
    const JtJ = la.mul(la.transpose(J), J);
    const ev = la.eigSym(JtJ).values;
    const maxEv = Math.max(...ev, 1e-300);
    const rank = ev.filter(v => v > maxEv * 1e-10).length;
    return { rank, np: params.length, ev };
  }

  function checkIdentification(spec, facLabel) {
    const label = facLabel || (j => 'Factor ' + (j + 1));
    const reasons = [];
    const { p, m } = spec;
    const nInd = new Array(m).fill(0), nOut = new Array(m).fill(0), linked = new Array(m).fill(false);
    for (const [, j] of spec.loadings) { nInd[j]++; nOut[j]++; }
    for (const [t, f] of spec.regressions || []) { nOut[f]++; linked[t] = linked[f] = true; }
    for (const [a, b] of spec.factorCovs || []) { linked[a] = linked[b] = true; }
    for (let j = 0; j < m; j++) {
      if (nOut[j] === 0) reasons.push(label(j) + ' has no arrows to any indicator.');
    }
    const params = buildParams(spec);
    const nMoments = p * (p + 1) / 2;
    const df = nMoments - params.length;
    if (reasons.length) return { ok: false, df, npar: params.length, reasons };
    if (df < 0) {
      reasons.push('The model has ' + params.length + ' parameters but the data only have ' +
        nMoments + ' (co)variances (df = ' + df + ').');
      return { ok: false, df, npar: params.length, reasons };
    }
    const rnd = la.rng(12345);
    let best = 0;
    for (let k = 0; k < 3 && best < params.length; k++) {
      best = Math.max(best, jacobianRank(spec, params, rnd).rank);
    }
    if (best < params.length) {
      // Diagnose common culprits
      for (let j = 0; j < m; j++) {
        if (nInd[j] === 1 && !(spec.regressions || []).some(([, f]) => f === j))
          reasons.push(label(j) + ' has only one indicator: its loading and that item’s residual variance cannot be separated.');
        else if (nInd[j] === 2 && !linked[j])
          reasons.push(label(j) + ' has only two indicators and is not correlated with another factor.');
      }
      if (!reasons.length) reasons.push('Some parameters cannot be estimated separately (the model is not identified). Try removing a path.');
      return { ok: false, df, npar: params.length, reasons };
    }
    return { ok: true, df, npar: params.length, reasons };
  }

  // ------------------------------------------------------------------
  // Fit
  // ------------------------------------------------------------------
  function fit(spec, S, N, opts) {
    const p = spec.p;
    const params = buildParams(spec);
    const id = checkIdentification(spec, opts && opts.facLabel);
    if (!id.ok) return { ok: false, identified: false, reasons: id.reasons, df: id.df, npar: id.npar };

    let res = optimise(spec, params, S, startValues(spec, params, S));
    const rnd = la.rng(777);
    for (let k = 0; k < 6 && !res.converged; k++) {
      const st = startValues(spec, params, S).map((v, i) =>
        params[i].mat === 'T' && params[i].r === params[i].c ? v : v + (rnd() - 0.5) * 0.6);
      const r2 = optimise(spec, params, S, st);
      if (r2.converged || r2.F < res.F) res = r2;
    }
    if (!isFinite(res.F)) return { ok: false, identified: true, converged: false, reasons: ['The estimation failed to start.'] };

    let theta = res.theta.slice();
    // ---- sign normalisation: make each factor's loadings mostly positive ----
    const m = spec.m;
    let mats = matricesFrom(spec, params, theta);
    let imp = implied(spec, mats);
    const flip = new Array(m).fill(1);
    {
      const sdObs = imp.Sigma.map((r, i) => Math.sqrt(Math.abs(r[i])));
      const sdLat = imp.M.map((r, i) => Math.sqrt(Math.abs(r[i])));
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (const [i, jj] of spec.loadings) if (jj === j) s += mats.L[i][j] * sdLat[j] / sdObs[i];
        if (s === 0) for (const [t, f] of spec.regressions || []) if (f === j) s += mats.B[t][f];
        if (s < 0) flip[j] = -1;
      }
      theta = theta.map((v, k) => {
        const q = params[k];
        if (q.mat === 'L') return v * flip[q.c];
        if (q.mat === 'B' || q.mat === 'P') return v * flip[q.r] * flip[q.c];
        return v;
      });
      mats = matricesFrom(spec, params, theta);
      imp = implied(spec, mats);
    }

    const Sigma = imp.Sigma;
    const Fmin = res.F;
    const chisq = Math.max(0, N * Fmin);
    const df = id.df;
    const npar = params.length;
    const pvalue = df > 0 ? la.pchisqUpper(chisq, df) : NaN;

    // baseline (independence) model
    let logdiag = 0;
    for (let i = 0; i < p; i++) logdiag += Math.log(S[i][i]);
    const logdetS = la.logdetChol(la.chol(S));
    const chisqB = N * (logdiag - logdetS);
    const dfB = p * (p - 1) / 2;

    const rmsea = df > 0 ? Math.sqrt(Math.max(0, (chisq - df) / (df * N))) : 0;
    const dM = Math.max(chisq - df, 0), dB = Math.max(chisqB - dfB, 0);
    const cfi = Math.max(dM, dB) > 0 ? 1 - dM / Math.max(dM, dB) : 1;
    const tli = df > 0 ? ((chisqB / dfB) - (chisq / df)) / ((chisqB / dfB) - 1) : 1;

    let ss = 0, cnt = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) {
      const r = (S[i][j] - Sigma[i][j]) / Math.sqrt(S[i][i] * S[j][j]);
      ss += r * r; cnt++;
    }
    const srmr = Math.sqrt(ss / cnt);

    const Lc = la.chol(Sigma);
    const Si = la.cholInv(Lc);
    const logl = -N / 2 * (p * Math.log(2 * Math.PI) + la.logdetChol(Lc) + trProd(S, Si));
    const bic = -2 * logl + npar * Math.log(N);
    const aic = -2 * logl + 2 * npar;

    // ---- standardized solution (lavaan std.all) ----
    const sdObs = Sigma.map((r, i) => Math.sqrt(r[i]));
    const varLat = imp.M.map((r, i) => r[i]);
    const sdLat = varLat.map(v => Math.sqrt(Math.max(v, 0)));
    const est = params.map((q, k) => {
      const v = theta[k];
      let std;
      if (q.mat === 'L') std = v * sdLat[q.c] / sdObs[q.r];
      else if (q.mat === 'B') std = v * sdLat[q.c] / sdLat[q.r];
      else if (q.mat === 'P') std = v / Math.sqrt(Math.abs(mats.P[q.r][q.r] * mats.P[q.c][q.c]));
      else if (q.r === q.c) std = v / Sigma[q.r][q.r];
      else std = v / Math.sqrt(Math.abs(mats.T[q.r][q.r] * mats.T[q.c][q.c]));
      return { mat: q.mat, r: q.r, c: q.c, est: v, std };
    });

    // ---- admissibility ----
    const problems = [];
    for (let i = 0; i < p; i++) if (mats.T[i][i] < 0) problems.push({ kind: 'negvar', obs: i });
    if (m > 0 && !la.chol(mats.P)) problems.push({ kind: 'psi' });
    for (const e of est) {
      if (e.mat === 'T' && e.r !== e.c && Math.abs(e.std) > 1) problems.push({ kind: 'rescor', a: e.r, b: e.c });
      if (e.mat === 'P' && Math.abs(e.std) > 1) problems.push({ kind: 'faccor', a: e.r, b: e.c });
    }

    return {
      ok: true, identified: true, converged: res.converged, iterations: res.iterations,
      fmin: Fmin / 2, chisq, df, npar, pvalue, rmsea, cfi, tli, srmr, logl, bic, aic,
      chisqBaseline: chisqB, dfBaseline: dfB,
      Sigma, impliedCor: la.cov2cor(Sigma),
      mats, latentCov: imp.M, est, params, theta,
      improper: problems.length > 0, problems,
    };
  }

  // ------------------------------------------------------------------
  // lavaan export: syntax for the drawn model plus R code to fit it on the
  // round's covariance matrix (std.lv = TRUE, like this engine).
  // ------------------------------------------------------------------
  function lavaanSyntax(spec, itemName, facName) {
    itemName = itemName || (i => 'y' + (i + 1));
    facName = facName || (j => 'F' + (j + 1));
    const lines = [];
    const regs = spec.regressions || [];
    const hasItems = new Array(spec.m).fill(false);
    for (const [, j] of spec.loadings) hasItems[j] = true;
    for (let j = 0; j < spec.m; j++) {
      const ind = spec.loadings.filter(([, f]) => f === j).map(([i]) => itemName(i));
      // a factor without items is defined by the factors it points to (higher-order)
      if (!hasItems[j]) regs.filter(([, f]) => f === j).forEach(([t]) => ind.push(facName(t)));
      if (ind.length) lines.push(facName(j) + ' =~ ' + ind.join(' + '));
    }
    for (const [t, f] of regs) if (hasItems[f]) lines.push(facName(t) + ' ~ ' + facName(f));
    const endo = new Set(regs.map(([t]) => t));
    const drawn = new Set((spec.factorCovs || []).map(([a, b]) => Math.min(a, b) + ',' + Math.max(a, b)));
    for (const [a, b] of spec.factorCovs || []) lines.push(facName(Math.min(a, b)) + ' ~~ ' + facName(Math.max(a, b)));
    // lavaan's cfa() correlates exogenous factors by default: fix undrawn pairs to zero
    for (let a = 0; a < spec.m; a++) for (let b = a + 1; b < spec.m; b++) {
      if (!drawn.has(a + ',' + b) && !endo.has(a) && !endo.has(b) && hasItems[a] !== undefined) {
        const higherA = !hasItems[a], higherB = !hasItems[b];
        const kidsOf = (h) => regs.filter(([, f]) => f === h).map(([t]) => t);
        if ((higherA && kidsOf(a).includes(b)) || (higherB && kidsOf(b).includes(a))) continue;
        lines.push(facName(a) + ' ~~ 0*' + facName(b));
      }
    }
    for (const [a, b] of spec.residCovs || []) lines.push(itemName(Math.min(a, b)) + ' ~~ ' + itemName(Math.max(a, b)));
    const used = new Set(spec.loadings.map(([i]) => i));
    for (const [a, b] of spec.residCovs || []) { used.add(a); used.add(b); }
    for (let i = 0; i < spec.p; i++) if (!used.has(i)) lines.push(itemName(i) + ' ~~ ' + itemName(i));
    return lines.join('\n');
  }

  function rCode(spec, S, N) {
    const p = spec.p;
    const Su = S.map(r => r.map(v => v * N / (N - 1)));
    const rows = Su.map((r, i) => '  ' + r.map(v => v.toFixed(6).padStart(10)).join(',') + (i < p - 1 ? ',' : ''));
    return [
      'library(lavaan)',
      '',
      '# Sample covariance matrix (N - 1 denominator) of this round\'s data',
      'S <- matrix(c(',
      rows.join('\n'),
      '), ' + p + ', ' + p + ', byrow = TRUE)',
      'rownames(S) <- colnames(S) <- paste0("y", 1:' + p + ')',
      '',
      'model <- \'',
      lavaanSyntax(spec),
      '\'',
      '',
      'fit <- cfa(model, sample.cov = S, sample.nobs = ' + N + ', std.lv = TRUE)',
      'fitMeasures(fit, c("chisq", "df", "pvalue", "rmsea", "cfi", "tli", "srmr", "bic"))',
      'standardizedSolution(fit)',
      '',
      '# Path diagram in the style of this game:',
      '# library(semPlot)',
      '# semPaths(fit, "std", theme = "colorblind", style = "lisrel")',
    ].join('\n');
  }

  FF.sem = { buildParams, fit, checkIdentification, implied, matricesFrom, lavaanSyntax, rCode };
})(typeof window !== 'undefined' ? window : globalThis);
