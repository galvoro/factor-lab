// FACTOR FIND — small dense linear-algebra helpers (matrices are arrays of rows).
// Sizes in this capsule are tiny (≤ 9 observed, ≤ ~45 parameters), so clarity
// beats speed. Exposed as FF.la.
(function (global) {
  'use strict';

  function zeros(r, c) {
    const M = new Array(r);
    for (let i = 0; i < r; i++) M[i] = new Array(c).fill(0);
    return M;
  }
  function eye(n) {
    const M = zeros(n, n);
    for (let i = 0; i < n; i++) M[i][i] = 1;
    return M;
  }
  function clone(A) { return A.map(r => r.slice()); }
  function transpose(A) {
    const r = A.length, c = r ? A[0].length : 0;
    const T = zeros(c, r);
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j];
    return T;
  }
  function mul(A, B) {
    const n = A.length, k = B.length, m = k ? B[0].length : 0;
    const C = zeros(n, m);
    for (let i = 0; i < n; i++) {
      const Ai = A[i], Ci = C[i];
      for (let t = 0; t < k; t++) {
        const a = Ai[t];
        if (a === 0) continue;
        const Bt = B[t];
        for (let j = 0; j < m; j++) Ci[j] += a * Bt[j];
      }
    }
    return C;
  }
  function add(A, B) { return A.map((r, i) => r.map((v, j) => v + B[i][j])); }
  function sub(A, B) { return A.map((r, i) => r.map((v, j) => v - B[i][j])); }
  function scale(A, s) { return A.map(r => r.map(v => v * s)); }

  // Cholesky: returns lower-triangular L with A = L L', or null if A is not PD.
  function chol(A) {
    const n = A.length;
    const L = zeros(n, n);
    for (let j = 0; j < n; j++) {
      let s = A[j][j];
      for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
      if (!(s > 1e-300) || !isFinite(s)) return null;
      const d = Math.sqrt(s);
      L[j][j] = d;
      for (let i = j + 1; i < n; i++) {
        let v = A[i][j];
        for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
        L[i][j] = v / d;
      }
    }
    return L;
  }
  function logdetChol(L) {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]);
    return 2 * s;
  }
  // Inverse of an SPD matrix from its Cholesky factor.
  function cholInv(L) {
    const n = L.length;
    // invert L (lower triangular)
    const Li = zeros(n, n);
    for (let i = 0; i < n; i++) {
      Li[i][i] = 1 / L[i][i];
      for (let j = 0; j < i; j++) {
        let s = 0;
        for (let k = j; k < i; k++) s -= L[i][k] * Li[k][j];
        Li[i][j] = s / L[i][i];
      }
    }
    // A^-1 = Li' Li
    const Ai = zeros(n, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = 0;
        for (let k = i; k < n; k++) s += Li[k][i] * Li[k][j];
        Ai[i][j] = s; Ai[j][i] = s;
      }
    }
    return Ai;
  }
  // General inverse (Gauss-Jordan, partial pivoting). Returns null if singular.
  function inv(A) {
    const n = A.length;
    const M = A.map((r, i) => r.concat(eye(n)[i]));
    for (let c = 0; c < n; c++) {
      let piv = c, best = Math.abs(M[c][c]);
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > best) { best = Math.abs(M[r][c]); piv = r; }
      if (best < 1e-14) return null;
      if (piv !== c) { const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp; }
      const d = M[c][c];
      for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (f === 0) continue;
        for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(r => r.slice(n));
  }
  // Solve A x = b (Gaussian elimination, partial pivoting). Returns null if singular.
  function solve(A, b) {
    const n = A.length;
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c, best = Math.abs(M[c][c]);
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > best) { best = Math.abs(M[r][c]); piv = r; }
      if (best < 1e-300) return null;
      if (piv !== c) { const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp; }
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        if (f === 0) continue;
        for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x.every(isFinite) ? x : null;
  }

  // Symmetric eigen-decomposition (cyclic Jacobi). Returns values sorted
  // descending and the matching eigenvectors as columns of `vectors`.
  function eigSym(A) {
    const n = A.length;
    const a = clone(A);
    const V = eye(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-22) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-300) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk;
            a[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const idx = [...Array(n).keys()].sort((i, j) => a[j][j] - a[i][i]);
    return {
      values: idx.map(i => a[i][i]),
      vectors: V.map(row => idx.map(i => row[i])),
    };
  }

  function cov2cor(S) {
    const n = S.length;
    const d = S.map((r, i) => 1 / Math.sqrt(r[i]));
    const R = zeros(n, n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) R[i][j] = S[i][j] * d[i] * d[j];
    for (let i = 0; i < n; i++) R[i][i] = 1;
    return R;
  }
  // Partial correlations: -cov2cor(inverse), zero diagonal.
  function partialCor(S) {
    const L = chol(S);
    const K = L ? cholInv(L) : inv(S);
    if (!K) return null;
    const n = S.length;
    const P = zeros(n, n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i !== j) P[i][j] = -K[i][j] / Math.sqrt(K[i][i] * K[j][j]);
    }
    return P;
  }

  // ---- special functions: chi-square upper tail ----
  function gammln(x) {
    const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  // Regularized lower incomplete gamma P(a, x).
  function gammaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - gammln(a));
    }
    // continued fraction for Q, then P = 1 - Q
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gammln(a)) * h;
  }
  function pchisqUpper(x, df) {
    if (!(df > 0)) return NaN;
    return Math.max(0, 1 - gammaP(df / 2, x / 2));
  }

  // ---- seeded RNG (mulberry32) + standard normal ----
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    const next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let spare = null;
    next.normal = function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u = 0, v = 0;
      while (u <= 1e-300) u = next();
      v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    };
    next.int = function (n) { return Math.floor(next() * n); };
    next.shuffle = function (arr) {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t2 = a2[i]; a2[i] = a2[j]; a2[j] = t2;
      }
      return a2;
    };
    return next;
  }

  const FF = global.FF = global.FF || {};
  FF.la = {
    zeros, eye, clone, transpose, mul, add, sub, scale,
    chol, logdetChol, cholInv, inv, solve, eigSym,
    cov2cor, partialCor, pchisqUpper, rng,
  };
})(typeof window !== 'undefined' ? window : globalThis);
