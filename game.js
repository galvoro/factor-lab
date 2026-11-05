// FACTOR LAB — game orchestrator: datasets, dashboards, the single fit,
// scoring card, true-model reveal. Exposes FF.game (state) for debugging.
(function (global) {
  'use strict';
  const FF = global.FF;
  const la = FF.la, P = FF.plots;
  const SFX = (n) => { const a = global.GaltonAudio; if (a && a.SFX && a.SFX[n]) a.SFX[n](); };

  // ------------------------------------------------------------------
  // Configuration (all scoring rules live here)
  // ------------------------------------------------------------------
  const f3 = (v) => v.toFixed(3).replace(/^0/, '').replace(/^-0/, '−');
  const fmtP = (p) => !isFinite(p) ? '—' : p < 0.001 ? '< .001' : '= ' + p.toFixed(3).replace(/^0/, '');

  // Fit criteria, scored in order on the results card. A tier is the first
  // whose test passes; otherwise the criterion earns 0.
  const CRITERIA = [
    { key: 'chisq', name: 'χ² test', sub: 'exact fit', value: (r) => r.pvalue,
      main: (r) => 'p ' + fmtP(r.pvalue), small: (r) => `χ²(${r.df}) = ${r.chisq.toFixed(1)}`,
      tiers: [{ test: (v) => v >= 0.05, cls: 'good', pts: 2, label: 'Not rejected' },
              { test: (v) => v >= 0.01, cls: 'ok', pts: 1, label: 'Borderline' }],
      fail: 'Rejected',
      axis: { log: true, min: 0.001, max: 1, ticks: [[0.001, '.001'], [0.01, '.01'], [0.05, '.05'], [1, '1']],
              zones: [['bad', 0.001, 0.01], ['ok', 0.01, 0.05], ['good', 0.05, 1]] } },
    { key: 'rmsea', name: 'RMSEA', sub: 'approximation error', value: (r) => r.rmsea,
      main: (r) => f3(r.rmsea), small: () => '',
      tiers: [{ test: (v) => v < 0.05, cls: 'good', pts: 2, label: 'Close fit' },
              { test: (v) => v < 0.08, cls: 'ok', pts: 1, label: 'Acceptable' }],
      fail: 'Poor fit',
      axis: { min: 0, max: 0.15, ticks: [[0, '0'], [0.05, '.05'], [0.08, '.08'], [0.15, '.15']],
              zones: [['good', 0, 0.05], ['ok', 0.05, 0.08], ['bad', 0.08, 0.15]] } },
    { key: 'cfi', name: 'CFI', sub: 'vs. no correlations', value: (r) => Math.min(1, r.cfi),
      main: (r) => f3(Math.min(1, r.cfi)), small: () => '',
      tiers: [{ test: (v) => v >= 0.95, cls: 'good', pts: 2, label: 'Good' },
              { test: (v) => v >= 0.90, cls: 'ok', pts: 1, label: 'Acceptable' }],
      fail: 'Poor',
      axis: { min: 0.8, max: 1, ticks: [[0.8, '.80'], [0.9, '.90'], [0.95, '.95'], [1, '1']],
              zones: [['bad', 0.8, 0.9], ['ok', 0.9, 0.95], ['good', 0.95, 1]] } },
    { key: 'tli', name: 'TLI', sub: 'penalizes complexity',
      // for the baseline (independence) model itself TLI is 0 by construction; use CFI there
      value: (r) => Math.min(1, r.df === r.dfBaseline ? r.cfi : r.tli),
      main: (r) => f3(r.df === r.dfBaseline ? Math.min(1, r.cfi) : r.tli), small: (r) => (r.df === r.dfBaseline ? 'as CFI (baseline model)' : ''),
      tiers: [{ test: (v) => v >= 0.95, cls: 'good', pts: 2, label: 'Good' },
              { test: (v) => v >= 0.90, cls: 'ok', pts: 1, label: 'Acceptable' }],
      fail: 'Poor',
      axis: { min: 0.8, max: 1, ticks: [[0.8, '.80'], [0.9, '.90'], [0.95, '.95'], [1, '1']],
              zones: [['bad', 0.8, 0.9], ['ok', 0.9, 0.95], ['good', 0.95, 1]] } },
    { key: 'srmr', name: 'SRMR', sub: 'residual correlations', value: (r) => r.srmr,
      main: (r) => f3(r.srmr), small: () => '',
      tiers: [{ test: (v) => v < 0.08, cls: 'good', pts: 2, label: 'Good' },
              { test: (v) => v < 0.10, cls: 'ok', pts: 1, label: 'Acceptable' }],
      fail: 'Poor',
      axis: { min: 0, max: 0.15, ticks: [[0, '0'], [0.08, '.08'], [0.10, '.10'], [0.15, '.15']],
              zones: [['good', 0, 0.08], ['ok', 0.08, 0.10], ['bad', 0.10, 0.15]] } },
  ];

  const CONFIG = {
    ROUNDS: 5,                                // datasets per game, then the diploma
    BIC_MAX: 10,                              // parsimony points, lost linearly with the BIC above the true model;
                                              // all gone at LEVELS[l].bicZero (more lenient at harder levels)
    DIPLOMA: { pass: 60, stars: [70, 80, 90] },   // % of the game maximum (5 x 20 = 100)
    SUPPORT_BIC: 2,                           // every feature of the truth must be worth >= 2 BIC
    RESID_MAX: 0.25,                          // colour scale for residual correlations
    RESID_MAX_P: 0.35,                        // ... and residual partial correlations
    LEVELS: {                                 // name, medal on the diploma, sample sizes drawn per round
      1: { name: 'Easy', medal: 'bronze', N: [150, 200, 250, 300, 400, 500], bicZero: 20 },
      2: { name: 'Medium', medal: 'silver', N: [150, 200, 250, 300, 400, 500], bicZero: 25 },
      3: { name: 'Hard', medal: 'gold', N: [150, 200, 250, 300, 400, 500], bicZero: 35 },
      4: { name: 'Psychometrika', medal: 'platinum', N: [300, 400, 500, 750, 1000], bicZero: 60 },
    },
    CRITERIA,
  };
  const FIT_MAX = CRITERIA.reduce((s, c) => s + c.tiers[0].pts, 0);
  const MAX_ROUND = FIT_MAX + CONFIG.BIC_MAX;           // 10 + 10 = 20 per dataset
  const round1 = (v) => Math.round(v * 10) / 10;
  const fmtPts = (v) => round1(v).toFixed(1);
  // the true model must reach the top tier of every criterion on its sample
  const acceptTrue = (f) => CRITERIA.every(c => c.tiers[0].test(c.value(f)));

  const G = {
    screen: 'title', mode: 'play', phase: 'build', tab: 'data', rview: 'implied',
    level: 1, seedBase: null, gameNo: 0, recent: [], played: [],
    round: 0, rounds: [], cur: null, tutorialSeen: false,
  };
  FF.game = G;

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  function dashOf(root) {
    const pan = (k) => root.querySelector(`.panel[data-p="${k}"]`);
    const o = { root, readout: root.querySelector('.readout'), panels: {} };
    for (const k of ['scree', 'heat', 'net', 'pcor']) o.panels[k] = pan(k);
    o.svg = (k) => o.panels[k].querySelector('svg');
    o.cap = (k, main, sub) => { o.panels[k].querySelector('figcaption').innerHTML = main + (sub ? ` <span class="cap-sub">${sub}</span>` : ''); };
    return o;
  }
  const DD = dashOf($('dash'));
  const MD = dashOf($('model-dash'));
  const canvasWrap = document.querySelector('.canvas-wrap');
  const pane = $('canvas-pane');
  const fitBtn = $('btn-fit');
  const layer = $('card-layer');
  const card = $('card');
  const toastEl = $('toast');
  const visible = (el) => !!(el && el.getClientRects().length);

  // ------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------
  let toastTimer = null;
  function toast(text, kind) {
    toastEl.textContent = text;
    toastEl.className = 'show' + (kind === 'warn' ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.className = ''; }, kind === 'warn' ? 4200 : 2600);
  }

  // ------------------------------------------------------------------
  // Editor
  // ------------------------------------------------------------------
  const editor = FF.editor.create($('canvas'), {
    onChange: ({ structural }) => { if (structural) onModelChanged(); },
    onMessage: (t, k) => toast(t, k),
    onSelect: () => updateFactorButton(),
    onTool: (t) => {
      document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
      updateFactorButton();
    },
    onHoverNode: (idx, ev) => highlight(idx === null ? null : [idx], 'canvas', ev),
    onPick: (info) => placePicker(info),
    onParam: (t, ev) => openParam(t, ev),
    onRender: () => syncSelectionHL(),
  });
  const truthView = FF.editor.create($('truth-canvas'), { static: true });

  function onModelChanged() {
    if (!G.cur) return;
    if (G.mode === 'learn') learnUpdate(true);
    else updateConsole(true);
    updateModelInfo();
    updateFactorButton();
    $('canvas-hint').classList.toggle('gone', editor.counts.factors > 0 || editor.counts.edges > 0);
  }

  // ---- status bar (bottom): what the "program" is doing ----
  function setStatus(label, cls, info, right) {
    const st = $('status');
    st.className = 'status' + (cls ? ' ' + cls : '');
    $('st-label').textContent = label;
    $('st-info').innerHTML = info || '';
    $('st-right').textContent = right || '';
  }
  function updateModelInfo() {
    const c = G.cur;
    if (!c) return;
    const { spec } = editor.getSpec();
    const npar = FF.sem.buildParams(spec).length;
    const df = spec.p * (spec.p + 1) / 2 - npar;
    const fac = spec.m === 1 ? '1 factor' : spec.m + ' factors';
    if (G.mode === 'learn') {
      const ok = !c.ev || (c.ev.ok && c.ev.pd);
      setStatus(ok ? 'learn' : 'impossible values', ok ? 'idle' : 'error',
        `<b>${spec.p} items</b> · ${fac} · ${npar} parameters │ model-implied correlations`, 'population values');
      return;
    }
    const ds = `<b>Dataset ${G.round + 1}/${CONFIG.ROUNDS}</b> · ${CONFIG.LEVELS[G.level].name} · N = ${c.N} · ${c.p} items`;
    if (G.phase === 'results' && c.fit) {
      const r = c.fit.res;
      setStatus('converged', '', `${ds} │ ${r.iterations} iterations · χ²(${r.df}) = ${r.chisq.toFixed(1)}, p ${fmtP(r.pvalue)} · RMSEA ${f3(r.rmsea)} · BIC ${r.bic.toFixed(1)}`, 'ML · std.lv');
      return;
    }
    let m = `${fac} · ${npar} parameters · df ${df}`;
    if (spec.m === 0 && !spec.residCovs.length) m = 'baseline model (no factors) · df ' + df;
    setStatus('ready', '', `${ds} │ ${m}`, 'ML · std.lv');
  }

  // ---- console: the model as lavaan syntax, typed as you draw ----
  const conBody = $('con-body');
  let conLines = [];               // [{ text, cls }]
  let typing = null;
  function playSyntax() {
    const { spec } = editor.getSpec();
    const lines = FF.sem.lavaanSyntax(spec).split('\n').filter(l => l && !/^(y\d+) ~~ \1$/.test(l));
    return lines.length ? lines.map(t => ({ text: t })) : [{ text: '# no factors yet: the baseline model (items uncorrelated)', cls: 'cmt' }];
  }
  function learnSyntax() {
    const { spec, theta } = editor.getSpec();
    const params = FF.sem.buildParams(spec);
    const v = (x) => String(+x.toFixed(2));
    const F = (j) => 'F' + (j + 1), Y = (i) => 'y' + (i + 1);
    const out = [{ text: '# population model; factor variances fixed to 1', cls: 'cmt' }];
    for (let j = 0; j < spec.m; j++) {
      const t = params.map((q, k) => (q.mat === 'L' && q.c === j ? v(theta[k]) + '*' + Y(q.r) : null)).filter(Boolean);
      if (t.length) out.push({ text: `${F(j)} =~ ${t.join(' + ')}` });
    }
    params.forEach((q, k) => {
      if (q.mat === 'B') out.push({ text: `${F(q.r)} ~ ${v(theta[k])}*${F(q.c)}` });
      else if (q.mat === 'P') out.push({ text: `${F(q.c)} ~~ ${v(theta[k])}*${F(q.r)}` });
      else if (q.mat === 'T' && q.r !== q.c) out.push({ text: `${Y(q.c)} ~~ ${v(theta[k])}*${Y(q.r)}` });
      else if (q.mat === 'T' && Math.abs(theta[k] - 1) > 1e-9) out.push({ text: `${Y(q.r)} ~~ ${v(theta[k])}*${Y(q.r)}` });
    });
    if (out.length === 1) out.push({ text: '# no factors: all items uncorrelated', cls: 'cmt' });
    return out;
  }
  function renderConsole(fresh) {
    conBody.innerHTML = '';
    for (const L of conLines) {
      const d = document.createElement('div');
      d.className = 'con-line' + (L.cls ? ' ' + L.cls : '') + (fresh && fresh.has(L) ? ' new' : '');
      d.textContent = L.shown === undefined ? L.text : L.text.slice(0, L.shown);
      if (L.shown !== undefined && L.shown < L.text.length) { const caret = document.createElement('span'); caret.className = 'con-caret'; d.appendChild(caret); }
      conBody.appendChild(d);
    }
  }
  // replace the console with `lines`; new / changed lines are typed out
  function setConsole(lines, animate) {
    const before = new Set(conLines.filter(l => !l.extra).map(l => l.text));
    const fresh = new Set();
    conLines = lines.map(l => {
      const L = Object.assign({}, l);
      if (!before.has(L.text)) { fresh.add(L); if (animate) L.shown = 0; }
      return L;
    });
    typeOut(fresh);
  }
  function appendConsole(line, animate) {
    const L = Object.assign({ extra: true }, line);
    if (animate) L.shown = 0;
    conLines.push(L);
    typeOut(new Set([L]));
  }
  function typeOut(fresh) {
    if (typing) cancelAnimationFrame(typing);
    const firstNew = conLines.findIndex(l => fresh.has(l));
    const step = () => {
      const L = conLines.find(l => l.shown !== undefined && l.shown < l.text.length);
      if (L) L.shown = Math.min(L.text.length, L.shown + 3);
      renderConsole(fresh);
      const target = conBody.children[firstNew >= 0 ? firstNew : conLines.length - 1];
      if (target) target.scrollIntoView({ block: 'nearest' });
      if (L) typing = requestAnimationFrame(step);
      else { typing = null; conLines.forEach(l => { delete l.shown; }); setTimeout(() => renderConsole(null), 1400); }
    };
    typing = requestAnimationFrame(step);
  }
  function updateConsole(animate) {
    if (!G.cur) return;
    setConsole(G.mode === 'learn' ? learnSyntax() : playSyntax(), animate);
    $('con-sub').textContent = G.mode === 'learn' ? 'population model (lavaan syntax)' : 'lavaan model syntax';
  }
  $('con-toggle').addEventListener('click', () => {
    const c = $('console');
    c.classList.toggle('collapsed');
    $('con-toggle').innerHTML = c.classList.contains('collapsed') ? '+' : '&#8211;';
    requestAnimationFrame(renderAll);
  });

  // ---- light / dark / auto ----
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_ICON = {
    auto: '<svg viewBox="0 0 24 24" class="th-icon"><circle cx="12" cy="12" r="7.5" fill="none"/><path class="th-half" d="M12 4.5 A7.5 7.5 0 0 1 12 19.5 Z"/></svg>',
    light: '<svg viewBox="0 0 24 24" class="th-icon"><circle cx="12" cy="12" r="4.2" fill="none"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" fill="none"/></svg>',
    dark: '<svg viewBox="0 0 24 24" class="th-icon"><path class="th-half" d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></svg>',
  };
  let theme = 'auto';
  try { const s = global.localStorage.getItem('factorlab-theme'); if (THEMES.includes(s)) theme = s; } catch (e) { /* storage unavailable */ }
  function applyTheme(t) {
    theme = t;
    document.documentElement.dataset.theme = t;
    $('btn-theme').innerHTML = THEME_ICON[t];
    $('btn-theme').title = 'Theme: ' + t + ' (click to change)';
    try { global.localStorage.setItem('factorlab-theme', t); } catch (e) { /* ignore */ }
  }
  applyTheme(theme);
  $('btn-theme').addEventListener('click', () => {
    applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
    toast('Theme: ' + theme + (theme === 'auto' ? ' (follows your system)' : ''));
  });

  function updateFactorButton() {
    const n = editor.selection().items.length;
    $('factor-label').textContent = n ? `Factor (${n})` : 'Factor';
    $('btn-factor').classList.toggle('ready', n > 0);
  }

  // ------------------------------------------------------------------
  // Indicator picker (after adding a factor, or double-clicking one)
  // ------------------------------------------------------------------
  const pickPop = $('pick-pop');
  // The popup must never sit on the items (they are what you click), so the
  // whole canvas is searched for a spot that covers none, as close to the
  // factor as possible. Short canvases (small laptop windows, phones on their
  // side) get a slimmer popup; and it can always be dragged out of the way.
  const PICK_LAYOUTS = ['', 'compact', 'bar'];
  const pickDrag = { fid: null, moved: false };
  function pickSpot(info, pw, ph) {
    const m = 8, gap = 14, pad = 6, W = info.W, H = info.H;
    const hi = info.half + pad, rf = info.R + pad;
    const maxL = Math.max(m, W - pw - m), maxT = Math.max(m, H - ph - m);
    const xs = [], ys = [];
    for (let v = m; v < maxL; v += 8) xs.push(v);
    for (let v = m; v < maxT; v += 8) ys.push(v);
    xs.push(maxL); ys.push(maxT);
    // the classic spots: right of, left of, below and above the factor
    const pref = [[info.x + info.R + gap, info.y - ph / 2], [info.x - info.R - gap - pw, info.y - ph / 2],
      [info.x - pw / 2, info.y + info.R + gap], [info.x - pw / 2, info.y - info.R - gap - ph]]
      .map(([l, t]) => [Math.max(m, Math.min(maxL, l)), Math.max(m, Math.min(maxT, t))]);
    const hitsCircle = (l, t, [x, y], r) => {
      const dx = x - Math.max(l, Math.min(l + pw, x)), dy = y - Math.max(t, Math.min(t + ph, y));
      return dx * dx + dy * dy < r * r;
    };
    const score = (l, t) => {
      const covered = info.items.filter(([x, y]) => x + hi > l && x - hi < l + pw && y + hi > t && y - hi < t + ph).length;
      let cost = covered * 1e5;
      if (hitsCircle(l, t, [info.x, info.y], info.R + gap - 2)) cost += 2000;   // hides the factor being edited
      cost += 800 * info.factors.filter(f => hitsCircle(l, t, f, rf)).length;
      const nx = Math.max(l, Math.min(l + pw, info.x)), ny = Math.max(t, Math.min(t + ph, info.y));
      cost += Math.hypot(info.x - nx, info.y - ny) + 0.1 * Math.hypot(info.x - l - pw / 2, info.y - t - ph / 2);
      if (pw > W - 2 * m || ph > H - 2 * m) cost += 5e4;                        // does not even fit
      return { l, t, covered, cost };
    };
    let best = null;
    pref.forEach(([l, t], k) => { const s = score(l, t); s.cost -= 4 - k; if (!best || s.cost < best.cost) best = s; });
    for (const t of ys) for (const l of xs) { const s = score(l, t); if (s.cost < best.cost) best = s; }
    return best;
  }
  function placePicker(info) {
    if (!info) { pickPop.classList.add('hidden'); pickDrag.fid = null; return; }
    hideTip();
    pickPop.classList.remove('hidden');
    pickPop.querySelector('.pp-title').textContent = info.isNew ? 'Select its indicators' : 'Edit its indicators';
    $('pp-count').textContent = info.n === 1 ? '1 item selected' : info.n + ' items selected';
    $('pp-ok').disabled = false;
    if (pickDrag.fid !== info.fid) { pickDrag.fid = info.fid; pickDrag.moved = false; }
    if (pickDrag.moved) { clampPicker(); return; }                              // the user put it somewhere
    let best = null;
    for (const lay of PICK_LAYOUTS) {
      pickPop.className = 'pick-pop' + (lay ? ' ' + lay : '');
      const s = pickSpot(info, pickPop.offsetWidth, pickPop.offsetHeight);
      if (!best || s.cost < best.cost - 1e4) best = Object.assign(s, { lay });
      if (!s.covered && s.cost < 5e4) break;
    }
    pickPop.className = 'pick-pop' + (best.lay ? ' ' + best.lay : '');
    pickPop.style.left = best.l + 'px';
    pickPop.style.top = best.t + 'px';
  }
  function clampPicker() {
    const wrap = pickPop.parentElement, m = 4;
    const l = Math.max(m, Math.min(wrap.clientWidth - pickPop.offsetWidth - m, pickPop.offsetLeft));
    const t = Math.max(m, Math.min(wrap.clientHeight - pickPop.offsetHeight - m, pickPop.offsetTop));
    pickPop.style.left = l + 'px'; pickPop.style.top = t + 'px';
  }
  // drag the popup by anything that is not a button
  pickPop.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0 || ev.target.closest('button')) return;
    ev.preventDefault();
    const x0 = ev.clientX - pickPop.offsetLeft, y0 = ev.clientY - pickPop.offsetTop;
    pickPop.setPointerCapture(ev.pointerId);
    pickPop.classList.add('dragging');
    const move = (e) => {
      pickPop.style.left = (e.clientX - x0) + 'px'; pickPop.style.top = (e.clientY - y0) + 'px';
      clampPicker(); pickDrag.moved = true;
    };
    const up = () => {
      pickPop.classList.remove('dragging');
      pickPop.removeEventListener('pointermove', move);
      pickPop.removeEventListener('pointerup', up);
      pickPop.removeEventListener('pointercancel', up);
    };
    pickPop.addEventListener('pointermove', move);
    pickPop.addEventListener('pointerup', up);
    pickPop.addEventListener('pointercancel', up);
  });
  $('pp-ok').addEventListener('click', () => { SFX('click'); editor.commitPick(); });
  $('pp-cancel').addEventListener('click', () => { SFX('click'); editor.cancelPick(); });
  $('pp-all').addEventListener('click', () => { SFX('click'); editor.pickAll(true); });
  $('pp-none').addEventListener('click', () => { SFX('click'); editor.pickAll(false); });

  // ------------------------------------------------------------------
  // Dashboards: data (left) and the fitted model (right, after FIT)
  // ------------------------------------------------------------------
  function offMax(M) {
    let m = 0;
    for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) if (i !== j) m = Math.max(m, Math.abs(M[i][j]));
    return m || 1;
  }
  const subM = (A, B) => A.map((r, i) => r.map((v, j) => v - B[i][j]));
  const hover = (kind) => (h) => onPlotHover(kind, h);

  function modelDash() {
    const c = G.cur;
    if (!c || !c.fit) return null;
    if (!c.fit.dash) {
      const Rm = c.fit.res.impliedCor;
      // the same EBICglasso on the model-implied correlations, so data and
      // model networks go through the same filter
      c.fit.dash = { R: Rm, P: la.partialCor(Rm), G: FF.glasso.ebicGlasso(Rm, c.N).net, ev: la.eigSym(Rm).values };
    }
    return c.fit.dash;
  }

  function renderData() {
    const c = G.cur;
    if (!c || !visible(DD.root)) return;
    const d = c.dash;
    const learn = G.mode === 'learn';
    DD.cap('scree', 'Scree plot', learn ? '· implied' : '');
    DD.cap('heat', learn ? 'Implied correlations' : 'Correlations', '· drag a number to reorder');
    DD.cap('net', learn ? 'Implied correlation network' : 'Correlation network');
    DD.cap('pcor', learn ? 'Implied partial correlation network' : 'Regularized partial correlation network');
    P.scree(DD.svg('scree'), [{ values: d.ev, color: '#20252C', label: learn ? 'implied' : 'data' }], { onHover: hover('scree') });
    drawDataHeat();
    P.network(DD.svg('net'), d.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
    P.network(DD.svg('pcor'), d.G, d.layout, { maximum: d.maxG, onHover: hover(learn ? 'pcor' : 'gpcor') });
    applyHighlight(hlSet(), HL.pair);
  }

  // ---- heatmap order: drag a row/column number to move that item; all
  // heatmaps (data, model-implied, residuals) share one order per dataset ----
  function hmOrder() {
    const c = G.cur, n = c.dash.R.length;
    let o = c.hmOrder;
    if (!o || o.length !== n) {
      // keep the order when an item is appended (LEARN), otherwise start fresh
      o = o && o.length === n - 1 ? o.concat(n - 1) : [...Array(n).keys()];
      c.hmOrder = o;
    }
    return o;
  }
  function onReorder(o) {
    G.cur.hmOrder = o;
    drawDataHeat();
    if (G.phase === 'results' && G.rview !== 'diagram') drawModelHeat();
    applyHighlight(hlSet(), HL.pair);
  }
  function syncHmReset() {
    const o = G.cur && G.cur.hmOrder;
    const moved = !!o && o.some((v, k) => v !== k);
    document.querySelectorAll('.hm-reset').forEach(b => {
      b.classList.toggle('hidden', !moved);
      b.parentNode.classList.toggle('reordered', moved);      // hides the "drag a number" hint
    });
  }
  function drawDataHeat() {
    const d = G.cur.dash;
    if (!visible(DD.root)) return;
    P.heatmap(DD.svg('heat'), d.R, { maximum: 1, onHover: hover('cor'), order: hmOrder(), onReorder });
    syncHmReset();
  }
  function drawModelHeat() {
    const c = G.cur, m = modelDash();
    if (!m || !visible(MD.root)) return;
    const opt = { onHover: hover('cor'), order: hmOrder(), onReorder };
    if (G.rview === 'implied') P.heatmap(MD.svg('heat'), m.R, Object.assign({ maximum: 1 }, opt));
    else P.heatmap(MD.svg('heat'), subM(c.dash.R, m.R), Object.assign({ maximum: CONFIG.RESID_MAX }, opt));
    syncHmReset();
  }
  document.querySelectorAll('.hm-reset').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    SFX('click');
    if (!G.cur) return;
    G.cur.hmOrder = [...Array(G.cur.dash.R.length).keys()];
    onReorder(G.cur.hmOrder);
  }));

  function renderModel() {
    const c = G.cur, m = modelDash();
    if (!m || !visible(MD.root)) return;
    const d = c.dash;
    MD.cap('scree', 'Scree plot', '· data vs. model');
    P.scree(MD.svg('scree'), [
      { values: d.ev, color: '#A9A396', dash: '5 4', r: 3.2, label: 'data' },
      { values: m.ev, color: '#E39B2D', width: 2.4, fill: '#E39B2D', label: 'model' },
    ], { onHover: hover('scree') });
    if (G.rview === 'implied') {
      MD.cap('heat', 'Model-implied correlations');
      drawModelHeat();
      MD.cap('net', 'Model-implied network');
      P.network(MD.svg('net'), m.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
      MD.cap('pcor', 'Model-implied regularized network');
      P.network(MD.svg('pcor'), m.G, d.layout, { maximum: d.maxG, onHover: hover('gpcor') });
    } else {
      const RM = CONFIG.RESID_MAX, RP = CONFIG.RESID_MAX_P;
      const sc = (v) => '· scale ±' + v.toFixed(2).replace(/^0/, '');
      MD.cap('heat', 'Residual correlations', '(data − model)');
      drawModelHeat();
      MD.cap('net', 'Residual network', sc(RM));
      P.network(MD.svg('net'), subM(d.R, m.R), d.layout, { maximum: RM, onHover: hover('cor') });
      MD.cap('pcor', 'Residual partial network', sc(RP));
      P.network(MD.svg('pcor'), subM(d.P, m.P), d.layout, { maximum: RP, onHover: hover('pcor') });
    }
    applyHighlight(hlSet(), HL.pair);
  }

  function renderAll() {
    if (!G.cur) return;
    renderData();
    if (G.phase === 'results' && G.rview !== 'diagram') renderModel();
    if (visible(canvasWrap)) editor.render();
  }

  function setRview(v) {
    G.rview = v;
    pane.dataset.rview = v;
    document.querySelectorAll('#rview-seg button').forEach(b => b.classList.toggle('on', b.dataset.rview === v));
    requestAnimationFrame(renderAll);
  }

  // touch: a tapped value stays in the readout until the next tap elsewhere
  for (const D of [DD, MD]) {
    D.root.querySelector('.dash-grid').addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!e.target.closest('.hm-cell, .net-edge, .scree-series circle')) onPlotHover(null, null);
    });
  }

  // ---- hover readouts + cross-highlighting ----
  const f2 = (v) => P.fmt2(v);
  const sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace(/^0/, '');
  const cls = (v) => (v >= 0 ? 'pos' : 'neg');
  function setReadout(html) { DD.readout.innerHTML = html; MD.readout.innerHTML = html; }
  const touchOnly = global.matchMedia && global.matchMedia('(hover: none)').matches;
  function defaultReadout() {
    const verb = touchOnly ? 'Tap' : 'Hover';
    return G.phase === 'results' ? `${verb} a cell, line or point to compare data and model.` : `${verb} a cell, line or point to see its value.`;
  }

  // tooltip at the pointer
  const tip = $('tip');
  function moveTip(ev) {
    if (!ev || !isFinite(ev.clientX)) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > global.innerWidth - 6) x = ev.clientX - pad - w;
    if (y + h > global.innerHeight - 6) y = ev.clientY - pad - h;
    tip.style.left = Math.max(6, x) + 'px';
    tip.style.top = Math.max(6, y) + 'px';
  }
  function showTip(html, ev) { tip.innerHTML = html; tip.classList.add('show'); moveTip(ev); }
  function hideTip() { tip.classList.remove('show'); }
  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && tip.classList.contains('show')) moveTip(e); });
  const tipRow = (k, v, c) => `<div class="tt-r"><span>${k}</span><b class="${c || ''}">${v}</b></div>`;

  function onPlotHover(kind, h, ev) {
    const c = G.cur;
    if (!c) return;
    if (!h) { hideTip(); highlight(null, 'plot'); return; }
    const m = G.phase === 'results' ? modelDash() : null;
    if (kind === 'scree') {
      let s = `<div class="tt-h">Eigenvalue ${h.k + 1}</div>` + tipRow(G.mode === 'learn' ? 'implied' : 'data', c.dash.ev[h.k].toFixed(2));
      if (m) s += tipRow('model', m.ev[h.k].toFixed(2));
      showTip(s, ev);
      return;
    }
    const i = Math.min(h.i, h.j), j = Math.max(h.i, h.j);
    const name = kind === 'gpcor' ? 'Regularized partial correlation' : kind === 'pcor' ? 'Partial correlation' : 'Correlation';
    const pick = (o) => (kind === 'gpcor' ? o.G : kind === 'pcor' ? o.P : o.R);
    const D = pick(c.dash);
    const v = D[i][j];
    let s = `<div class="tt-h">${name} ${i + 1}–${j + 1}</div>` + tipRow(G.mode === 'learn' ? 'implied' : 'data', f2(v), cls(v));
    if (m) {
      const M = pick(m);
      s += tipRow('model', f2(M[i][j]), cls(M[i][j])) + tipRow('residual', sgn(v - M[i][j]), 'resid');
    }
    showTip(s, ev);
    highlight([i, j], 'plot');
  }

  // ---- cross-highlighting between the canvas and the dashboards ----
  // sel   : items selected on the canvas (or being picked for a factor)
  // hover : item under the pointer on the canvas
  // pair  : the two items of a hovered heatmap cell / network edge
  const HL = { sel: [], hover: null, pair: null, key: '' };
  function hlSet() {
    const s = new Set(HL.sel);
    if (HL.hover !== null) s.add(HL.hover);
    return s;
  }
  function refreshHL() {
    applyHighlight(hlSet(), HL.pair);
    editor.setHighlight(HL.pair || []);
  }
  function highlight(idxs, source, ev) {
    if (source === 'canvas') {
      HL.hover = idxs && idxs.length ? idxs[0] : null;
      if (HL.hover !== null && !editor.picking) {
        const i = HL.hover, R = G.cur.dash.R;
        const top = R[i].map((v, j) => [j, v]).filter(([j]) => j !== i).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
        showTip(`<div class="tt-h">Item ${i + 1}: strongest correlations</div>` + top.map(([j, v]) => tipRow('with ' + (j + 1), f2(v), cls(v))).join(''), ev);
      } else hideTip();
    } else HL.pair = idxs && idxs.length ? idxs : null;
    refreshHL();
  }
  // called after every editor render: follow the canvas selection
  function syncSelectionHL() {
    const pickIdx = editor.pickItems;
    const sel = pickIdx || editor.selection().items.map(id => +id.slice(1));
    const key = sel.slice().sort((a, b) => a - b).join(',');
    if (key === HL.key) return;
    HL.key = key; HL.sel = sel;
    refreshHL();
  }
  function applyHighlight(set, pair) {
    const any = set.size > 0;
    const inPair = (k) => !!pair && (pair[0] === k || pair[1] === k);
    for (const D of [DD, MD]) {
      for (const k of ['net', 'pcor']) {
        const svg = D.svg(k);
        svg.classList.toggle('has-hl', any);
        svg.querySelectorAll('.net-node').forEach((g2, n) => {
          g2.classList.toggle('hl', set.has(n));
          g2.classList.toggle('hl-pair', inPair(n));
        });
        svg.querySelectorAll('.net-edge').forEach(l => {
          const i = +l.dataset.i, j = +l.dataset.j;
          const c = (set.has(i) ? 1 : 0) + (set.has(j) ? 1 : 0);
          // within the highlighted group: full; touching it: half; else dimmed
          l.classList.toggle('e-in', c === 2 || (c === 1 && set.size === 1));
          l.classList.toggle('e-touch', c === 1 && set.size > 1);
          l.classList.toggle('e-pair', !!pair && ((pair[0] === i && pair[1] === j) || (pair[0] === j && pair[1] === i)));
        });
      }
      const heat = D.svg('heat');
      heat.classList.toggle('has-hl', any);
      heat.querySelectorAll('.hm-cell, .hm-val').forEach(r => {
        const i = +r.dataset.i, j = +r.dataset.j;
        const ri = set.has(i), cj = set.has(j);
        r.classList.toggle('hl-line', ri || cj);
        r.classList.toggle('hl-both', ri && cj && i !== j);
        r.classList.toggle('hl', !!pair && i !== j && ((pair[0] === i && pair[1] === j) || (pair[0] === j && pair[1] === i)));
      });
      heat.querySelectorAll('.hm-labels text').forEach(t => {
        const k = +t.dataset.k;
        t.classList.toggle('hl', set.has(k) || inPair(k));
      });
    }
  }

  // ------------------------------------------------------------------
  // LEARN mode: draw a model, set its values, see what it implies
  // ------------------------------------------------------------------
  const PARAM = {
    load: { title: 'Factor loading', min: -2, max: 2 },
    reg: { title: 'Regression between factors', min: -2, max: 2 },
    fcov: { title: 'Factor correlation', min: -0.95, max: 0.95 },
    rcov: { title: 'Residual covariance', min: -1.5, max: 1.5 },
    rvar: { title: 'Residual variance', min: 0.05, max: 3 },
  };
  const itemNo = (id) => +id.slice(1) + 1;

  function setMode(mode) {
    G.mode = mode;
    const learn = mode === 'learn';
    document.body.classList.toggle('mode-learn', learn);
    editor.setLearn(learn);
    closeParam();
    $('dash-title').textContent = learn ? 'IMPLIED BY YOUR MODEL' : 'DATA';
    $('tab-data-label').textContent = learn ? 'Implied' : 'Data';
    $('canvas-hint').innerHTML = learn
      ? '<b>Double-click</b> to add a factor, then click its items.<br><b>Click a path</b> or a residual to change its value.'
      : '<b>Double-click</b> the canvas to add a factor,<br>then click the items it measures.';
  }

  function startLearn() {
    showOverlay(null);
    G.screen = 'game';
    hideCard(true);
    closeModal('modal-truth');
    Object.assign(HL, { sel: [], hover: null, pair: null, key: '' });
    setMode('learn');
    setPhase('build');
    G.cur = { learn: true, p: 6, dash: null };
    G.learnLayout = null; G.learnRaw = null;
    editor.reset(6);
    editor.setTool('select');
    $('canvas-hint').classList.remove('gone');
    fitBtn.disabled = false;
    setTab('model');
    learnUpdate(true);
    updateModelInfo();
    updateFactorButton();
    requestAnimationFrame(renderAll);
  }

  // recompute the implied correlations from the drawn model and its values
  function learnUpdate(relayout) {
    if (G.mode !== 'learn' || !G.cur) return;
    const { spec, theta } = editor.getSpec();
    const ev = FF.sem.evaluate(spec, theta);
    const ok = ev.ok && ev.pd;
    $('learn-warn').classList.toggle('hidden', ok);
    DD.root.classList.toggle('impossible', !ok);
    let target = null;
    if (ok) {
      const R = ev.impliedCor, Pc = la.partialCor(R);
      const same = G.learnLayout && G.learnLayout.length === R.length;
      if (relayout || !same) {
        const next = learnLayout(R);
        if (same) target = next.layout;
        else { G.learnLayout = next.from; target = next.layout; }
      }
      G.cur.dash = { R, P: Pc, G: Pc, ev: la.eigSym(R).values, layout: G.learnLayout, maxR: 1, maxP: 1, maxG: 1 };
    } else if (!G.cur.dash || G.cur.dash.R.length !== spec.p) {
      const I = la.eye(spec.p);
      G.cur.dash = { R: I, P: la.zeros(spec.p, spec.p), G: la.zeros(spec.p, spec.p), ev: new Array(spec.p).fill(1), layout: P.springLayout(I), maxR: 1, maxP: 1, maxG: 1 };
    }
    G.cur.p = spec.p;
    G.cur.ev = ev;
    $('dash-note').textContent = `${spec.p} items · population values`;
    editor.setFitResult(ev.ok ? { est: ev.est } : null);
    renderData();
    refreshParam();
    updateConsole(!!relayout);
    updateModelInfo();
    if (target) glideLayout(target);
  }

  // Network layout in LEARN: the same force layout as qgraph, but continued
  // from the current node positions (warm start), so nodes only move as far
  // as the new correlations push them. Items keep their place when another
  // item is removed; a new item starts at the rim. Returns the new layout and
  // the layout to glide from (same length).
  function learnLayout(R) {
    const n = R.length, prevRaw = G.learnRaw, prev = G.learnLayout;
    const remap = editor.takeRemap();
    let init = null, from = null, pinned = null, keep = false;
    if (prevRaw && remap && remap.length === n) {                 // items removed: the rest stay put
      init = remap.map(k => prevRaw[k]); from = remap.map(k => prev[k]); keep = true;
    } else if (prevRaw && prevRaw.length === n) {                  // same items
      init = prevRaw; from = prev;
    } else if (prevRaw && prevRaw.length < n) {                    // items added
      // put each new item in the emptiest spot inside the current picture
      init = prevRaw.slice();
      const xs = init.map(p => p[0]), ys = init.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      for (let i = prevRaw.length; i < n; i++) {
        let best = null, bd = -1;
        for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) {
          const px = x0 + (x1 - x0) * a / 12, py = y0 + (y1 - y0) * b / 12;
          const d = Math.min(...init.map(([x, y]) => Math.hypot(x - px, y - py)));
          if (d > bd) { bd = d; best = [px, py]; }
        }
        init.push(best || [x0, y0]);
      }
      pinned = init.map((_, i) => i < prevRaw.length);                // only the new items move
    }
    let res;
    if (init && keep) res = { raw: init, layout: P.rescale(init) };
    else if (init) res = P.springLayoutWarm(R, init, G.learnNref, pinned);
    else { const raw = P.springRaw(R); res = { raw, layout: P.rescale(raw) }; G.learnNref = n; }
    G.learnRaw = res.raw;
    if (!from) from = res.layout;
    else if (from.length < n) from = from.concat(res.layout.slice(from.length));
    return { layout: res.layout, from };
  }
  // nodes glide from the current to the new layout
  let glide = null;
  function glideLayout(target) {
    const from = G.learnLayout.map(p => p.slice());
    if (glide) cancelAnimationFrame(glide);
    const t0 = performance.now(), dur = 700;
    const step = (now) => {
      if (G.mode !== 'learn' || !G.cur || !G.cur.dash) { glide = null; return; }
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      G.learnLayout = from.map((p, i) => [p[0] + (target[i][0] - p[0]) * e, p[1] + (target[i][1] - p[1]) * e]);
      G.cur.dash.layout = G.learnLayout;
      renderNetworks();
      glide = t < 1 ? requestAnimationFrame(step) : null;
    };
    glide = requestAnimationFrame(step);
  }
  function renderNetworks() {
    const d = G.cur.dash;
    if (!visible(DD.root)) return;
    P.network(DD.svg('net'), d.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
    P.network(DD.svg('pcor'), d.G, d.layout, { maximum: d.maxG, onHover: hover('pcor') });
    applyHighlight(hlSet(), HL.pair);
  }

  // ---- value popup ----
  const paramPop = $('param-pop');
  let paramT = null;
  function openParam(t, ev) {
    if (!t) { closeParam(); return; }
    const info = editor.getValue(t);
    if (!info) { closeParam(); return; }
    paramT = t;
    const P2 = PARAM[info.kind];
    $('pr-title').textContent = P2.title;
    $('pr-sub').textContent = info.kind === 'load' ? `item ${itemNo(info.b)} on its factor`
      : info.kind === 'rcov' ? `between the residuals of items ${itemNo(info.a)} and ${itemNo(info.b)}`
      : info.kind === 'rvar' ? `item ${itemNo(info.a)}` : info.kind === 'fcov' ? 'factor variances are fixed to 1' : '';
    for (const el of [$('pr-range'), $('pr-num')]) { el.min = P2.min; el.max = P2.max; el.step = 0.05; }
    $('pr-range').value = info.v; $('pr-num').value = info.v.toFixed(2);
    paramPop.classList.remove('hidden');
    hideTip();
    // place next to the click, inside the canvas (docked at the bottom on narrow screens)
    const wrap = canvasWrap.getBoundingClientRect();
    const pw = paramPop.offsetWidth, ph = paramPop.offsetHeight;
    let left, top;
    if (wrap.width < 520 || !ev || !isFinite(ev.clientX)) { left = (wrap.width - pw) / 2; top = wrap.height - ph - 10; }
    else {
      left = ev.clientX - wrap.left + 18; top = ev.clientY - wrap.top - ph / 2;
      if (left + pw > wrap.width - 8) left = ev.clientX - wrap.left - pw - 18;
    }
    paramPop.style.left = Math.max(8, Math.min(wrap.width - pw - 8, left)) + 'px';
    paramPop.style.top = Math.max(8, Math.min(wrap.height - ph - 8, top)) + 'px';
    refreshParam();
  }
  function closeParam() {
    paramT = null;
    paramPop.classList.add('hidden');
  }
  function refreshParam() {
    if (!paramT) return;
    const info = editor.getValue(paramT);
    if (!info) { closeParam(); return; }
    const ev = G.cur && G.cur.ev;
    let std = null;
    if (ev && ev.ok) {
      const { edgeParam } = editor.getSpec();
      const q = paramT.type === 'edge' ? edgeParam[paramT.id] : { mat: 'T', r: itemNo(paramT.id) - 1, c: itemNo(paramT.id) - 1 };
      const e = q && ev.est.find(x => x.mat === q.mat && x.r === q.r && x.c === q.c);
      if (e) std = e.std;
    }
    const what = info.kind === 'rvar' ? 'standardized (share of the item\'s variance)' : 'standardized';
    $('pr-std').innerHTML = std === null ? '' : `${what}: <b>${f2(std)}</b>`;
    paintSlider(info, std);
  }
  // the bar runs from 0 to the value, in the colour the path gets
  function paintSlider(info, std) {
    const P2 = PARAM[info.kind], r = $('pr-range');
    const pos = (v) => 100 * (Math.max(P2.min, Math.min(P2.max, v)) - P2.min) / (P2.max - P2.min);
    const v = +r.value, z = pos(0), p = pos(v);
    const s = std === null || !isFinite(std) ? Math.sign(v) * 0.6 : std;
    const col = P.fade(v >= 0 ? P.POS : P.NEG, Math.max(0.22, Math.min(1, Math.abs(s))));
    const a = Math.min(z, p), b = Math.max(z, p), base = '#E2DDD2';
    r.style.setProperty('--pr-track', `linear-gradient(to right, ${base} 0%, ${base} ${a}%, ${col} ${a}%, ${col} ${b}%, ${base} ${b}%, ${base} 100%)`);
    r.style.setProperty('--pr-col', col);
    // tick at zero (only when 0 lies inside the range)
    const zero = $('pr-zero');
    zero.hidden = !(P2.min < 0 && P2.max > 0);
    if (!zero.hidden) {
      const w = r.offsetWidth, thumb = 20;
      zero.style.left = (r.offsetLeft + thumb / 2 + (w - thumb) * z / 100 - 1) + 'px';
    }
  }
  function applyParam(v, relayout) {
    if (!paramT) return;
    const info = editor.getValue(paramT);
    const P2 = PARAM[info.kind];
    v = Math.max(P2.min, Math.min(P2.max, Math.round(v * 100) / 100));
    editor.setValue(paramT, v);
    learnUpdate(relayout);
  }
  let paramRAF = null;
  $('pr-range').addEventListener('input', () => {
    $('pr-num').value = (+$('pr-range').value).toFixed(2);
    const info = paramT && editor.getValue(paramT);
    if (info) paintSlider(info, null);
    if (paramRAF) return;
    paramRAF = requestAnimationFrame(() => { paramRAF = null; applyParam(+$('pr-range').value, false); });
  });
  $('pr-range').addEventListener('change', () => applyParam(+$('pr-range').value, true));
  $('pr-num').addEventListener('change', () => {
    const v = parseFloat($('pr-num').value);
    if (!isFinite(v)) return;
    applyParam(v, true);
    const info = editor.getValue(paramT);
    if (info) { $('pr-range').value = info.v; $('pr-num').value = info.v.toFixed(2); }
  });
  $('pr-reset').addEventListener('click', () => {
    const info = paramT && editor.getValue(paramT);
    if (!info) return;
    SFX('click');
    const d = editor.DEFAULTS[info.kind];
    $('pr-range').value = d; $('pr-num').value = d.toFixed(2);
    applyParam(d, true);
  });
  $('pr-done').addEventListener('click', () => { SFX('click'); closeParam(); editor.clearSelection(); });
  document.querySelectorAll('#label-seg button').forEach(b => b.addEventListener('click', () => {
    SFX('click');
    document.querySelectorAll('#label-seg button').forEach(x => x.classList.toggle('on', x === b));
    editor.labelMode = b.dataset.labels;
  }));
  $('btn-add-item').addEventListener('click', () => { SFX('click'); editor.addObs(); });

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  function updateHUD() {
    $('hud-level').textContent = CONFIG.LEVELS[G.level].name;
    if (CONFIG.ROUNDS > 1) {
      $('hud-l2').textContent = 'ROUND'; $('hud-v2').textContent = `${G.round + 1}/${CONFIG.ROUNDS}`;
      $('hud-l3').textContent = 'SCORE'; $('hud-v3').textContent = fmtPts(G.rounds.reduce((s, r) => s + r.total, 0));
    } else {
      $('hud-l2').textContent = 'PLAYED'; $('hud-v2').textContent = String(G.played.length);
      $('hud-l3').textContent = 'AVERAGE';
      $('hud-v3').textContent = G.played.length ? String(Math.round(G.played.reduce((s, v) => s + v, 0) / G.played.length)) : '–';
    }
  }
  function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  function setPhase(ph) {
    G.phase = ph;
    hideTip();
    pane.dataset.phase = ph;
    document.body.classList.toggle('phase-results', ph === 'results');
    const label = fitBtn.querySelector('.fit-label');
    if (ph === 'build') label.textContent = 'FIT';
    else label.textContent = CONFIG.ROUNDS > 1 ? (G.round + 1 >= CONFIG.ROUNDS ? 'DIPLOMA ▸' : 'NEXT ▸') : 'NEW DATA ▸';
    fitBtn.classList.toggle('next', ph === 'results');
    $('tab-model-label').textContent = ph === 'results' ? 'Your model' : 'Model';
    setReadout(defaultReadout());
    updateModelInfo();
  }

  // ------------------------------------------------------------------
  // Game / round lifecycle
  // ------------------------------------------------------------------
  function seedFromURL() {
    try {
      const q = new URLSearchParams(global.location.search);
      if (q.has('seed')) return (parseInt(q.get('seed'), 10) >>> 0) || 1;
    } catch (e) { /* ignore */ }
    return null;
  }

  function startGame() {
    if (G.mode !== 'play') setMode('play');
    if (G.seedBase === null) {
      const urlSeed = seedFromURL();
      G.seedBase = urlSeed !== null ? urlSeed : (Math.floor(Math.random() * 4294967295) >>> 0);
    }
    G.round = 0; G.rounds = [];
    showOverlay(null);
    G.screen = 'game';
    global.GaltonAudio && global.GaltonAudio.bgm && global.GaltonAudio.bgm.start();
    startRound();
  }

  let generating = false;
  function startRound() {
    const k = G.gameNo++;
    const seed = (G.seedBase + 7919 * (k + 1)) >>> 0;
    const rnd = la.rng(seed);
    let pool = FF.bank.TEMPLATES.filter(t => t.level === G.level && !G.recent.includes(t.id));
    if (!pool.length) pool = FF.bank.TEMPLATES.filter(t => t.level === G.level);
    const tpl = pool[rnd.int(pool.length)];
    G.recent = G.recent.concat(tpl.id).slice(-5);
    const Ns = CONFIG.LEVELS[G.level].N;
    const N = Ns[rnd.int(Ns.length)];

    hideCard(true);
    closeModal('modal-truth');
    pane.classList.remove('revealing');
    fitBtn.classList.remove('busy');
    busy = false;
    Object.assign(HL, { sel: [], hover: null, pair: null, key: '' });
    setPhase('build');
    G.cur = null;
    generating = true;
    setStatus('simulating…', 'busy', `<b>Dataset ${G.round + 1}/${CONFIG.ROUNDS}</b> · ${CONFIG.LEVELS[G.level].name} · N = ${N}`, 'ML · std.lv');
    fitBtn.disabled = true;
    $('dash-note').textContent = `Simulating ${N} respondents…`;
    for (const k2 of ['scree', 'heat', 'net', 'pcor']) P.clear(DD.svg(k2));
    updateHUD();
    // let the browser paint the empty board, then simulate
    setTimeout(() => {
      const data = FF.bank.makeRound(tpl, N, (seed ^ 0x5bd1e995) >>> 0, {
        accept: acceptTrue, support: CONFIG.SUPPORT_BIC, maxTries: 200,
      });
      generating = false;
      fitBtn.disabled = false;
      const R = data.R, Pc = la.partialCor(R);
      const Gc = FF.glasso.ebicGlasso(R, N).net;     // regularized partial correlations
      G.cur = {
        k, seed, tpl, N, data, model: data.model, p: data.model.L.length,
        dash: { R, P: Pc, G: Gc, ev: la.eigSym(R).values, layout: P.springLayout(R), maxR: offMax(R), maxP: offMax(Pc), maxG: offMax(Gc) },
        fit: null, attempts: 0,
      };
      $('dash-note').textContent = `N = ${N} · ${G.cur.p} items`;
      editor.reset(G.cur.p);
      editor.setTool('select');
      setRview('implied');
      $('canvas-hint').classList.remove('gone');
      setTab('data');
      updateModelInfo();
      updateFactorButton();
      updateConsole(false);
      requestAnimationFrame(renderAll);
    }, 30);
  }

  // ------------------------------------------------------------------
  // Fitting
  // ------------------------------------------------------------------
  function scoreFit(res, spec) {
    const c = G.cur;
    const rows = CRITERIA.map(cr => {
      const v = cr.value(res);
      const t = cr.tiers.find(t => t.test(v)) || { cls: 'bad', pts: 0, label: cr.fail };
      return { cr, v, cls: t.cls, pts: t.pts, label: t.label };
    });
    const saturated = res.df === 0;
    if (saturated) rows.forEach(r => { r.pts = 0; });
    const fitPts = rows.reduce((s, r) => s + r.pts, 0);
    const cmp = FF.bank.compareStructure(c.data.spec, spec);
    let dBIC = res.bic - c.data.trueFit.bic;
    if (cmp.exact) dBIC = 0;
    const zero = CONFIG.LEVELS[G.level].bicZero;
    const bicPts = Math.max(0, round1(CONFIG.BIC_MAX * (1 - Math.max(0, dBIC) / zero)));
    const bicCls = Math.max(0, dBIC) <= 2 ? 'good' : bicPts >= CONFIG.BIC_MAX / 2 ? 'ok' : 'bad';
    return { rows, saturated, fitPts, dBIC, bicPts, bicCls, total: round1(fitPts + bicPts), cmp };
  }

  let busy = false, emptyArmed = 0;
  function onFitButton() {
    if (busy || generating || !G.cur) return;
    if (G.phase === 'results') { afterRound(); return; }
    SFX('click');
    const c = G.cur;
    if (editor.picking) editor.commitPick();
    const { spec, key } = editor.getSpec();
    if (spec.m === 0 && !spec.residCovs.length) {
      // fitting the baseline model is allowed, but ask once to avoid accidents
      if (performance.now() - emptyArmed > 3500) {
        emptyArmed = performance.now();
        toast('Fit the baseline model, with no factors at all? Press FIT again to confirm.');
        return;
      }
    }
    emptyArmed = 0;
    editor.cancelPending();
    busy = true;
    fitBtn.classList.add('busy');
    canvasWrap.classList.add('estimating');
    setStatus('estimating…', 'busy', `<b>Dataset ${G.round + 1}/${CONFIG.ROUNDS}</b> · maximum likelihood`, 'ML · std.lv');
    appendConsole({ text: `> fit <- cfa(model, sample.cov = S, sample.nobs = ${c.N}, std.lv = TRUE)`, cls: 'cmd' }, true);
    SFX('fit');
    const res = FF.sem.fit(spec, c.data.S, c.N, { facLabel: () => 'One of your factors' });
    setTimeout(() => {
      busy = false;
      fitBtn.classList.remove('busy');
      canvasWrap.classList.remove('estimating');
      c.attempts++;
      if (!res.ok) { showError(res.identified === false ? 'ident' : 'conv', res); return; }
      if (!res.converged) { showError('conv', res); return; }
      if (res.improper) { showError('improper', res); return; }
      acceptFit(spec, key, res);
    }, 650);
  }

  function acceptFit(spec, key, res) {
    const c = G.cur;
    c.fit = { spec, key, res, rcode: FF.sem.rCode(spec, c.data.S, c.N, res), score: scoreFit(res, spec) };
    editor.setTool('select');
    setPhase('results');
    // first watch the paths grow into their estimates, then the scores. Until
    // the score card is up, the button stays a busy "FIT" (no early NEXT) and
    // the SCORE button is hidden.
    G.rview = 'diagram'; pane.dataset.rview = 'diagram';
    document.querySelectorAll('#rview-seg button').forEach(b => b.classList.toggle('on', b.dataset.rview === 'diagram'));
    busy = true;
    pane.classList.add('revealing');
    fitBtn.querySelector('.fit-label').textContent = 'FIT';
    fitBtn.classList.remove('next');
    fitBtn.classList.add('busy');
    fitBtn.disabled = true;
    editor.setFitResult(res, {
      animate: true, duration: 1000,
      onDone: () => setTimeout(() => {
        if (G.cur !== c) return;                      // left the game meanwhile
        busy = false;
        setRview('implied');
        showScoreCard(true);
        // the card now covers the board; the real NEXT button waits underneath
        pane.classList.remove('revealing');
        fitBtn.classList.remove('busy');
        fitBtn.disabled = false;
        setPhase('results');
      }, 450),
    });
  }

  // ---------------- error card ----------------
  function improperText(res) {
    const out = [];
    for (const p of res.problems) {
      if (p.kind === 'negvar') out.push(`Item ${p.obs + 1} gets a <b>negative residual variance</b>: the factors would explain more than 100% of its variance.`);
      else if (p.kind === 'rescor') out.push(`The residual correlation between items ${p.a + 1} and ${p.b + 1} goes <b>beyond ±1</b>.`);
      else if (p.kind === 'faccor') out.push('Two factors correlate <b>beyond ±1</b>.');
      else out.push('The factor correlations form an <b>impossible</b> (not positive definite) matrix.');
    }
    return [...new Set(out)];
  }
  function showError(kind, res) {
    let what, why;
    if (kind === 'ident') {
      what = 'The model is not identified.';
      why = '<ul>' +
        [...new Set(res.reasons || [])].map(r => `<li>${r}</li>`).join('') + '</ul>';
    } else if (kind === 'conv') {
      what = 'The estimation did not converge.';
      why = 'An estimate runs off towards infinity. Often a factor has too few items, or two factors measure the same thing.';
    } else {
      what = 'Improper solution (a Heywood case).';
      why = '<ul>' + improperText(res).map(t => `<li>${t}</li>`).join('') + '</ul>' +
        'The model is probably misspecified around these items.';
    }
    card.className = 'card error shake';
    card.innerHTML = `
      <div class="err-head"><span class="err-icon">✕</span><div class="err-title">MODEL COULD NOT BE ESTIMATED</div></div>
      <div class="err-body">
        <div class="err-what">${what}</div>
        <div class="err-why">${why}</div>
        <div class="err-free">This attempt does not count.</div>
        <button class="pill-btn" id="err-back">Back to my model</button>
      </div>`;
    layer.classList.add('show');
    SFX('error');
    setStatus('error', 'error', what.replace(/\.$/, ''), 'ML · std.lv');
    appendConsole({ text: '# ' + (kind === 'ident' ? 'error: model not identified' : kind === 'conv' ? 'error: no convergence' : 'warning: improper solution (Heywood case)'), cls: 'err' }, true);
    $('err-back').onclick = () => { SFX('click'); hideCard(); };
  }

  // ---------------- scoring card ----------------
  const seq = { steps: [], i: 0, timer: null, fast: false, done: true };
  function playSeq(steps) {
    clearTimeout(seq.timer);
    Object.assign(seq, { steps, i: 0, fast: false, done: false });
    nextStep();
  }
  function nextStep() {
    if (seq.i >= seq.steps.length) { seq.done = true; return; }
    const st = seq.steps[seq.i];
    seq.timer = setTimeout(() => {
      seq.i++; st.fn(seq.fast);
      // keep the newest revealed part in view (phones: the card scrolls)
      const shown = card.querySelectorAll('.fit-row.in, .subtotal.in, .bic-block.in, .total-block.in, .card-btns.in');
      const last = shown[shown.length - 1];
      if (last && card.scrollHeight > card.clientHeight + 4) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      nextStep();
    }, seq.fast ? 0 : st.wait);
  }
  function skipSeq() {
    if (seq.done) return;
    clearTimeout(seq.timer);
    seq.fast = true;
    while (seq.i < seq.steps.length) { const st = seq.steps[seq.i++]; st.fn(true); }
    seq.done = true;
    const btns = $('card-btns');
    if (btns && card.scrollHeight > card.clientHeight + 4) btns.scrollIntoView({ block: 'nearest' });
  }

  function gaugePos(ax, v) {
    let t;
    if (ax.log) t = (Math.log10(Math.max(ax.min, Math.min(ax.max, v))) - Math.log10(ax.min)) / (Math.log10(ax.max) - Math.log10(ax.min));
    else t = (v - ax.min) / (ax.max - ax.min);
    return Math.max(0, Math.min(1, isFinite(t) ? t : 0));
  }
  // Gauge for one criterion. Values beyond the axis land in a striped
  // off-scale zone at that end, labelled "< min" or "> max".
  const OFF = 0.1;
  function gaugeGeom(ax, v) {
    const lo = isFinite(v) && v < ax.min, hi = isFinite(v) && v > ax.max;
    const s0 = lo ? OFF : 0, s1 = hi ? 1 - OFF : 1;
    const P2 = (x) => s0 + (s1 - s0) * gaugePos(ax, x);
    const pct = (f) => (f * 100).toFixed(2) + '%';
    let zones = ax.zones.map(([c, a, b]) => `<span class="g-zone ${c}" style="width:${pct((s1 - s0) * (gaugePos(ax, b) - gaugePos(ax, a)))}"></span>`).join('');
    if (lo) zones = `<span class="g-zone over" style="width:${pct(OFF)}"></span>` + zones;
    if (hi) zones += `<span class="g-zone over" style="width:${pct(OFF)}"></span>`;
    const nT = ax.ticks.length;
    const ticks = ax.ticks.map(([x, l], k) => {
      const first = k === 0, last = k === nT - 1;
      if ((first && lo) || (last && hi)) return '';
      return `<span class="g-tick${first ? ' first' : last ? ' last' : ''}" style="left:${pct(P2(x))}">${l}</span>`;
    }).join('');
    const off = lo ? `<span class="g-tick first off" style="left:0">&lt; ${ax.ticks[0][1]}</span>`
      : hi ? `<span class="g-tick last off" style="left:100%">&gt; ${ax.ticks[nT - 1][1]}</span>` : '';
    return {
      off: lo || hi,
      mark: lo ? OFF / 2 : hi ? 1 - OFF / 2 : P2(v),
      html: `<div class="gauge${lo || hi ? ' offscale' : ''}"><div class="g-track">${zones}</div>${ticks}${off}<span class="g-mark"></span></div>`,
    };
  }
  const ICON = { good: '✓', ok: '~', bad: '✕' };

  function rankFor(score, exact) {
    if (exact) return 'Perfect find!';
    const f = score / MAX_ROUND;
    if (f >= 0.95) return 'Thurstone would be proud';
    if (f >= 0.8) return 'Factor whisperer';
    if (f >= 0.6) return 'Solid modeler';
    if (f >= 0.4) return 'Promising apprentice';
    return 'Back to the scree plot';
  }
  function totalSub(sc, res) {
    const tf = G.cur.data.trueFit;
    if (sc.cmp.exact) return 'You recovered the exact structure of the true model.';
    if (sc.saturated) return 'A saturated model (df = 0) reproduces any data perfectly, so its fit cannot be tested.';
    const dp = res.npar - tf.npar;
    if (sc.dBIC <= 0) return 'Your model fits these data at least as well as the true model, BIC-wise.';
    if (sc.fitPts === FIT_MAX && dp > 0) return `Good fit, but your model has ${dp} more parameter${dp === 1 ? '' : 's'} than the true model.`;
    if (sc.fitPts < FIT_MAX && dp < 0) return 'Your model is too simple: it misses structure that is in the data. Check the residuals.';
    if (sc.fitPts < FIT_MAX) return 'Some structure in the data is not captured. Check the residuals.';
    if (dp < 0) return 'Good fit, but the data support a bit more structure than your model has (the true model has a lower BIC).';
    if (dp === 0) return 'As many parameters as the true model, but a slightly different structure.';
    return 'Close, but not the most parsimonious description of these data.';
  }

  function showScoreCard(animate) {
    const c = G.cur, fit = c.fit, sc = fit.score, r = fit.res;
    sc.rows.forEach(row => { row.g = gaugeGeom(row.cr.axis, row.v); });
    hideTip();
    const nextLevelSeg = CONFIG.ROUNDS > 1 ? '' :
      `<div class="next-level"><span>Next:</span><div class="seg small" id="next-seg">${[1, 2, 3, 4].map(l => `<button data-level="${l}" class="${l === G.level ? 'on' : ''}">${CONFIG.LEVELS[l].name}</button>`).join('')}</div></div>`;
    const nextLabel = CONFIG.ROUNDS > 1 ? (G.round + 1 >= CONFIG.ROUNDS ? 'See your diploma ▸' : 'Next round ▸') : 'New dataset ▸';
    const sign = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
    card.className = 'card';
    card.innerHTML = `
      <div class="card-head">
        <span class="card-title">FIT RESULTS</span>
        <span class="card-sub">${r.npar} parameters &middot; df ${r.df} &middot; N = ${c.N}</span>
        <button class="card-x" id="card-x" aria-label="Close">✕</button>
      </div>
      <div class="fit-rows">
        ${sc.rows.map((row, k) => `
          <div class="fit-row ${row.cls}" data-k="${k}">
            <div class="fr-name">${row.cr.name}<small>${row.cr.sub}</small></div>
            <div class="fr-val">${row.cr.main(r)}${row.cr.small(r) ? `<small>${row.cr.small(r)}</small>` : ''}${row.g.off && row.cr.key !== 'chisq' ? '<small class="off-note">beyond the scale</small>' : ''}</div>
            ${row.g.html}
            <div class="chip ${row.cls}">${ICON[row.cls]} <span class="chip-label">${row.label}</span> <b>+${row.pts}</b></div>
          </div>`).join('')}
      </div>
      ${sc.saturated ? '<div class="card-note">Saturated model (df = 0): it reproduces any data perfectly, so the fit cannot be tested. No fit points.</div>' : ''}
      <div class="subtotal" id="sub-fit"><span>FIT</span><b>${sc.fitPts} / ${FIT_MAX}</b></div>
      <div class="bic-block ${sc.bicCls}" id="bic-block">
        <div class="bic-top">
          <span class="fr-name">Parsimony</span>
          <span class="bic-cmp">BIC yours <b>${r.bic.toFixed(1)}</b> &middot; true model <b>${c.data.trueFit.bic.toFixed(1)}</b> &middot; Δ <b>${sign(sc.dBIC)}</b></span>
        </div>
        <div class="bic-bar"><span class="bic-fill" id="bic-fill"></span></div>
        <div class="bic-foot"><span>&minus;1 point per ${+(CONFIG.LEVELS[G.level].bicZero / CONFIG.BIC_MAX).toFixed(1)} BIC points above the true model</span><b><span id="bic-pts">${fmtPts(CONFIG.BIC_MAX)}</span> / ${CONFIG.BIC_MAX}</b></div>
      </div>
      <div class="total-block" id="total-block">
        <div class="total-num"><span id="total-num">0</span><small> / ${MAX_ROUND}</small></div>
        <div><div class="total-rank">${rankFor(sc.total, sc.cmp.exact)}</div><div class="total-sub">${totalSub(sc, r)}</div></div>
      </div>
      <div class="card-btns" id="card-btns">
        <button class="pill-btn ghost" id="btn-truth">What was the true model?</button>
        <button class="pill-btn ghost" id="btn-compare">Compare with the data</button>
        <button class="pill-btn" id="btn-next">${nextLabel}</button>
      </div>
      <div class="card-foot" id="card-foot">
        <button class="link-btn" id="btn-rcode">Check this fit in R</button>
        ${nextLevelSeg}
      </div>
      ${animate ? '<div class="skip-hint" id="skip-hint">Click to skip</div>' : ''}`;
    layer.classList.add('show');
    $('card-x').onclick = (e) => { e.stopPropagation(); SFX('click'); hideCard(); };
    $('btn-truth').onclick = (e) => { e.stopPropagation(); SFX('click'); openTruth(); };
    $('btn-compare').onclick = (e) => {
      e.stopPropagation(); SFX('click'); hideCard(); if (!isWide()) setTab('model');
      if (!G.scoreHint) { G.scoreHint = true; setTimeout(() => toast('Press SCORE (bottom right) to see your score again.'), 400); }
    };
    $('btn-next').onclick = (e) => { e.stopPropagation(); afterRound(); };
    $('btn-rcode').onclick = (e) => { e.stopPropagation(); openRCode(fit.rcode); };
    document.querySelectorAll('#next-seg button').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation(); SFX('click');
      G.level = +b.dataset.level;
      document.querySelectorAll('#next-seg button').forEach(x => x.classList.toggle('on', x === b));
      syncLevelSeg();
    }));

    const rowsEl = [...card.querySelectorAll('.fit-row')];
    const steps = [];
    sc.rows.forEach((row, k) => {
      const el = rowsEl[k];
      steps.push({ wait: k === 0 ? 300 : 220, fn: () => {
        el.classList.add('in');
        requestAnimationFrame(() => { el.querySelector('.g-mark').style.left = (row.g.mark * 100).toFixed(2) + '%'; });
      } });
      steps.push({ wait: 560, fn: (fast) => {
        el.classList.add('done');
        if (!fast) SFX(row.cls === 'good' ? 'close' : row.cls === 'ok' ? 'fair' : 'poor');
      } });
    });
    steps.push({ wait: 300, fn: () => $('sub-fit').classList.add('in') });
    steps.push({ wait: 400, fn: () => {
      $('bic-block').classList.add('in');
      requestAnimationFrame(() => {
        const f = $('bic-fill');
        f.style.width = (sc.bicPts / CONFIG.BIC_MAX * 100).toFixed(1) + '%';
        f.classList.add(sc.bicCls);
      });
      countUp($('bic-pts'), CONFIG.BIC_MAX, sc.bicPts, 900, 1);
    } });
    steps.push({ wait: 950, fn: (fast) => {
      $('bic-block').classList.add('done');
      $('bic-pts').textContent = fmtPts(sc.bicPts);
      if (!fast) SFX(sc.bicCls === 'good' ? 'close' : sc.bicCls === 'ok' ? 'fair' : 'poor');
    } });
    steps.push({ wait: 400, fn: (fast) => {
      $('total-block').classList.add('in');
      if (fast) $('total-num').textContent = fmtPts(sc.total);
      else countUp($('total-num'), 0, sc.total, 700, 1);
    } });
    steps.push({ wait: 700, fn: (fast) => {
      $('total-num').textContent = fmtPts(sc.total);
      $('card-btns').classList.add('in');
      $('card-foot').classList.add('in');
      const sh = $('skip-hint'); if (sh) sh.remove();
      $('score-chip-val').textContent = fmtPts(sc.total);
      if (!fit.recorded) {
        fit.recorded = true;
        recordRound();
        if (!fast) {
          if (sc.cmp.exact) SFX('levelup'); else if (sc.total >= 0.8 * MAX_ROUND) SFX('coin');
        }
      }
    } });
    playSeq(steps);
    if (!animate) skipSeq();
  }
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    skipSeq();
  });

  let countTimer = null;
  function countUp(el, from, to, dur, dec) {
    cancelAnimationFrame(countTimer);
    const t0 = performance.now(), d = dec || 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = (from + (to - from) * (1 - Math.pow(1 - t, 2))).toFixed(d);
      if (t < 1 && !seq.fast) countTimer = requestAnimationFrame(step); else el.textContent = to.toFixed(d);
    };
    countTimer = requestAnimationFrame(step);
  }

  function hideCard(force) {
    if (!force && !seq.done) skipSeq();
    layer.classList.remove('show');
  }

  function recordRound() {
    const c = G.cur, sc = c.fit.score, r = c.fit.res;
    const rec = { tpl: c.tpl, level: G.level, N: c.N, rmsea: r.rmsea, fitPts: sc.fitPts, bicPts: sc.bicPts, dBIC: sc.dBIC, total: sc.total, exact: sc.cmp.exact };
    if (CONFIG.ROUNDS > 1) G.rounds.push(rec); else G.played.push(sc.total);
    updateHUD();
    bump('hud-v3');
  }

  function afterRound() {
    SFX('click');
    if (!G.cur || !G.cur.fit) return;
    if (!G.cur.fit.recorded) { skipSeq(); }
    if (CONFIG.ROUNDS > 1) {
      if (G.round + 1 >= CONFIG.ROUNDS) { showFinal(); return; }
      G.round++;
    }
    startRound();
  }

  // ------------------------------------------------------------------
  // True model
  // ------------------------------------------------------------------
  function openTruth() {
    const c = G.cur;
    if (!c || !c.fit) return;
    const dsc = FF.bank.describe(c.model, c.data.perm);
    const cmp = c.fit.score.cmp;
    const r = c.fit.res, tf = c.data.trueFit;
    const cnt = (k, name) => {
      const [a, b] = cmp.counts[k];
      return b ? `<li class="${a === b ? 'found' : 'missed'}"><span class="ic">${a === b ? '✓' : '✕'}</span>${name}: ${a} of ${b} found</li>` : '';
    };
    const diffs = cmp.exact ? '<div class="exact-banner">✓ Your model has exactly the true structure.</div>' :
      `<ul class="cmp-list">${cnt('load', 'Loadings')}${cnt('phi', 'Factor correlations')}${cnt('resid', 'Residual correlations')}
        ${cmp.missed.map(x => `<li class="missed"><span class="ic">−</span>Missing: ${x.text}</li>`).join('')}
        ${cmp.extra.map(x => `<li class="extra"><span class="ic">+</span>Extra: ${x.text}</li>`).join('')}
      </ul>`;
    $('truth-text').innerHTML = `
      <div class="truth-level">LEVEL ${CONFIG.LEVELS[dsc.level].name.toUpperCase()} &middot; ${c.model.id}</div>
      <div class="truth-name">“${dsc.name}”</div>
      <ul class="truth-lines">${dsc.lines.map(l => `<li>${l}</li>`).join('')}</ul>
      <div class="truth-notes">${dsc.notes.map(n => `<p>${n}</p>`).join('')}</div>
      <div class="truth-sec">YOUR MODEL VS. THE TRUTH</div>
      ${diffs}
      <table class="cmp">
        <tr><th></th><th>YOU</th><th>TRUTH</th></tr>
        <tr><td>Parameters</td><td>${r.npar}</td><td>${tf.npar}</td></tr>
        <tr><td>χ² (df)</td><td>${r.chisq.toFixed(1)} (${r.df})</td><td>${tf.chisq.toFixed(1)} (${tf.df})</td></tr>
        <tr><td>RMSEA</td><td>${f3(r.rmsea)}</td><td>${f3(tf.rmsea)}</td></tr>
        <tr><td>BIC</td><td>${r.bic.toFixed(1)}</td><td>${tf.bic.toFixed(1)}</td></tr>
      </table>`;
    $('modal-truth').classList.add('show');
    SFX('reveal');
    requestAnimationFrame(() => {
      truthView.loadSpec(c.data.spec, c.p, { labels: c.model.L[0].length > 1 ? FF.bank.LETTERS : null });
      truthView.setFitResult(FF.bank.trueEst(c.model, c.data.perm));
    });
  }

  // ------------------------------------------------------------------
  // Medals and the diploma (end of a multi-round game)
  // ------------------------------------------------------------------
  const METALS = {
    bronze: { name: 'Bronze', hi: '#F6D2AE', mid: '#C27C3E', lo: '#76461C' },
    silver: { name: 'Silver', hi: '#FFFFFF', mid: '#BCC3CB', lo: '#6B7480' },
    gold: { name: 'Gold', hi: '#FFF2B0', mid: '#D9A520', lo: '#85600A' },
    platinum: { name: 'Platinum', hi: '#FFFFFF', mid: '#A7CAD8', lo: '#4A7080' },
  };
  let medalSeq = 0;
  function starPoints(cx, cy, ro, ri, n) {
    const pts = [];
    for (let k = 0; k < 2 * n; k++) {
      const a = Math.PI * k / n - Math.PI / 2, r = k % 2 ? ri : ro;
      pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function medalSVG(metal, size, ribbons) {
    const m = METALS[metal], id = 'medal-g' + (++medalSeq);
    const rib = ribbons ? `<polygon points="30,62 18,98 30,90 38,100 46,66" fill="${m.lo}"/><polygon points="70,62 82,98 70,90 62,100 54,66" fill="${m.mid}"/>` : '';
    return `<svg class="medal ${metal}" viewBox="0 0 100 ${ribbons ? 102 : 100}" width="${size}" height="${ribbons ? size * 1.02 : size}" role="img" aria-label="${m.name} medal">
      <defs><radialGradient id="${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${m.hi}"/><stop offset="0.55" stop-color="${m.mid}"/><stop offset="1" stop-color="${m.lo}"/></radialGradient></defs>
      ${rib}
      <polygon points="${starPoints(50, 46, 44, 38, 24)}" fill="url(#${id})" stroke="${m.lo}" stroke-width="1.4"/>
      <circle cx="50" cy="46" r="30" fill="none" stroke="${m.hi}" stroke-width="2.2" opacity="0.85"/>
      <circle cx="50" cy="46" r="27" fill="url(#${id})" stroke="${m.lo}" stroke-width="1"/>
      <polygon points="${starPoints(50, 47, 19, 8, 5)}" fill="${m.hi}" stroke="${m.lo}" stroke-width="1.2"/>
    </svg>`;
  }
  const smallStar = (on) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}"><polygon points="${starPoints(12, 12.5, 11, 4.6, 5)}"/></svg>`;

  function showFinal() {
    const lv = CONFIG.LEVELS[G.level];
    const max = CONFIG.ROUNDS * MAX_ROUND;
    const total = round1(G.rounds.reduce((s, r) => s + r.total, 0));
    const pct = 100 * total / max;
    const D = CONFIG.DIPLOMA;
    const passed = pct >= D.pass - 1e-9;
    const nStars = D.stars.filter(s => pct >= s - 1e-9).length;
    const d = $('diploma');
    d.classList.toggle('failed', !passed);
    $('dip-title').textContent = passed ? 'Diploma' : 'No diploma this time';
    $('dip-line1').textContent = passed ? 'This certifies that' : 'Almost there';
    $('dip-line2').innerHTML = (passed ? 'completed the' : 'You played the') + ` <b>${lv.name}</b> track of five datasets with a score of`;
    $('final-score').innerHTML = `<span id="dip-num">0.0</span><small> / ${max}</small>`;
    $('dip-stars').innerHTML = passed ? [0, 1, 2].map(k => smallStar(k < nStars)).join('') : '';
    $('final-rank').textContent = passed ? rankFor(total / CONFIG.ROUNDS, false) : `A diploma needs ${round1(D.pass * max / 100)} points.`;
    $('dip-seal').innerHTML = medalSVG(lv.medal, 118, true) +
      (passed ? `<div class="seal-label">${METALS[lv.medal].name.toUpperCase()}</div>` : '<div class="seal-label">&nbsp;</div><div class="seal-stamp">NOT<br>AWARDED</div>');
    const rows = G.rounds.map((r, k) => `<tr><td>${k + 1}</td><td>${r.tpl.name}${r.exact ? ' <span class="dip-exact" title="exact structure">✓</span>' : ''}</td><td>${r.N}</td><td>${r.fitPts}</td><td>${fmtPts(r.bicPts)}</td><td>${fmtPts(r.total)}</td></tr>`).join('');
    $('final-table').innerHTML = `<tr><th>#</th><th>True model</th><th>N</th><th>Fit</th><th>Parsimony</th><th>Points</th></tr>${rows}`;
    $('dip-date').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    $('btn-again').textContent = passed ? 'PLAY AGAIN' : 'TRY AGAIN';
    $('final-extra').classList.toggle('hidden', !passed);
    G.final = passed ? {
      name: '', level: lv.name, metal: METALS[lv.medal], score: fmtPts(total), max, stars: nStars,
      rank: rankFor(total / CONFIG.ROUNDS, false), date: $('dip-date').textContent,
      rounds: G.rounds.map((r, k) => ({ k: k + 1, name: r.tpl.name, N: r.N, fit: r.fitPts, pars: fmtPts(r.bicPts), total: fmtPts(r.total), exact: r.exact })),
    } : null;
    hideCard(true);
    closeModal('modal-truth');
    showOverlay('screen-final');
    G.screen = 'final';
    d.classList.remove('in'); void d.offsetWidth; d.classList.add('in');
    seq.fast = false;
    setTimeout(() => countUp($('dip-num'), 0, total, 1100, 1), 450);
    setTimeout(() => SFX(!passed ? 'poor' : nStars >= 2 ? 'levelup' : 'close'), 500);
  }

  // ------------------------------------------------------------------
  // Overlays, tabs, R code, level picker
  // ------------------------------------------------------------------
  function showOverlay(id) {
    for (const o of ['screen-title', 'screen-level', 'screen-final']) $(o).classList.toggle('show', o === id);
  }
  function closeModal(id) { $(id).classList.remove('show'); }
  function isWide() { return !global.matchMedia('(max-width: 860px), (max-aspect-ratio: 4/5)').matches; }
  function setTab(t) {
    G.tab = t;
    document.body.classList.toggle('tab-data', t === 'data');
    document.body.classList.toggle('tab-model', t === 'model');
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    requestAnimationFrame(renderAll);
  }
  function openRCode(code) {
    $('r-code').value = code;
    $('modal-r').classList.add('show');
  }
  function syncLevelSeg() {
    document.querySelectorAll('.level-card').forEach(b => b.classList.toggle('on', +b.dataset.level === G.level));
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------
  document.querySelectorAll('.lc-medal').forEach(el => {
    const metal = CONFIG.LEVELS[+el.dataset.medal].medal;
    el.innerHTML = medalSVG(metal, 30) + `<span>${METALS[metal].name}</span>`;
  });
  $('btn-play').addEventListener('click', () => {
    SFX('click');
    global.GaltonAudio && global.GaltonAudio.ensure();
    syncLevelSeg();
    showOverlay('screen-level');
    G.screen = 'level';
  });
  document.querySelectorAll('.level-card').forEach(b => b.addEventListener('click', () => {
    SFX('click');
    G.level = +b.dataset.level;
    syncLevelSeg();
    if (!G.tutorialSeen) {
      FF.tutorial.show({ onDismiss: () => { G.tutorialSeen = true; startGame(); } });
    } else startGame();
  }));
  $('level-back').addEventListener('click', () => { SFX('click'); showOverlay('screen-title'); G.screen = 'title'; });
  $('btn-help').addEventListener('click', () => { SFX('click'); FF.tutorial.show({ popup: true, learn: G.mode === 'learn' }); });
  $('btn-home').addEventListener('click', () => {
    SFX('click');
    if (G.screen !== 'game') return;
    if (G.mode === 'learn') { closeParam(); G.screen = 'title'; showOverlay('screen-title'); return; }
    $('modal-quit').classList.add('show');
  });
  $('btn-learn').addEventListener('click', () => {
    SFX('click');
    global.GaltonAudio && global.GaltonAudio.ensure();
    if (!G.learnSeen) FF.tutorial.show({ learn: true, onDismiss: () => { G.learnSeen = true; startLearn(); } });
    else startLearn();
  });
  $('quit-stay').addEventListener('click', () => closeModal('modal-quit'));
  $('quit-leave').addEventListener('click', () => {
    closeModal('modal-quit');
    hideCard(true);
    G.screen = 'title'; showOverlay('screen-title');
  });
  $('btn-again').addEventListener('click', () => { SFX('click'); startGame(); });
  $('btn-final-home').addEventListener('click', () => { SFX('click'); G.screen = 'title'; showOverlay('screen-title'); });
  // ---- diploma: save as image (works everywhere, also inside the Galvoro
  // iframe via right-click / long-press) and print (only outside an iframe:
  // the platform sandbox has no allow-modals, so print() would be ignored)
  const embedded = (() => { try { return global.self !== global.top; } catch (e) { return true; } })();
  if (embedded) $('btn-print').classList.add('hidden');
  let saveURL = null;
  function triggerDownload() {
    if (!saveURL) return;
    const a = document.createElement('a');
    a.href = saveURL; a.download = 'factor-lab-diploma.png';
    document.body.appendChild(a); a.click(); a.remove();
  }
  $('btn-save-img').addEventListener('click', () => {
    if (!G.final) return;
    SFX('click');
    const btn = $('btn-save-img');
    btn.disabled = true; btn.textContent = 'Drawing…';
    FF.diploma.render(Object.assign({}, G.final, { name: $('dip-name').value })).then(cv => new Promise(res => cv.toBlob(res, 'image/png'))).then(blob => {
      if (saveURL) URL.revokeObjectURL(saveURL);
      saveURL = URL.createObjectURL(blob);
      $('save-img').src = saveURL;
      $('save-note').innerHTML = embedded
        ? 'Right-click the image (or press and hold it on a phone) and choose <b>Save image</b>. You can print the saved image.'
        : 'If the download does not start, right-click the image (or press and hold it on a phone) and choose <b>Save image</b>.';
      $('modal-save').classList.add('show');
      if (!embedded) triggerDownload();
    }).catch(() => toast('Could not draw the image.', 'warn')).finally(() => { btn.disabled = false; btn.textContent = 'Save as image'; });
  });
  $('save-dl').addEventListener('click', () => { SFX('click'); triggerDownload(); });
  $('save-close').addEventListener('click', () => closeModal('modal-save'));
  $('modal-save').addEventListener('click', (e) => { if (e.target.id === 'modal-save') closeModal('modal-save'); });
  $('btn-print').addEventListener('click', () => { SFX('click'); global.print(); });
  $('btn-other-level').addEventListener('click', () => { SFX('click'); syncLevelSeg(); showOverlay('screen-level'); G.screen = 'level'; });
  $('r-close').addEventListener('click', () => closeModal('modal-r'));
  $('truth-close').addEventListener('click', () => { SFX('click'); closeModal('modal-truth'); });
  for (const id of ['modal-r', 'modal-truth']) $(id).addEventListener('click', (e) => { if (e.target.id === id) closeModal(id); });
  $('r-copy').addEventListener('click', () => {
    const ta = $('r-code');
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => toast('Copied.'), () => {});
    $('r-copy').textContent = ok ? 'Copied' : 'Selected — press ⌘/Ctrl C';
    setTimeout(() => { $('r-copy').textContent = 'Copy'; }, 2200);
  });

  const mute = $('btn-mute');
  mute.addEventListener('click', () => {
    const a = global.GaltonAudio; if (!a) return;
    const m = !a.isMuted(); a.setMuted(m);
    mute.classList.toggle('is-muted', m);
  });

  document.querySelectorAll('#rview-seg button').forEach(b => b.addEventListener('click', () => { SFX('click'); setRview(b.dataset.rview); }));
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { SFX('click'); setTab(b.dataset.tab); }));
  $('btn-score').addEventListener('click', () => { SFX('click'); if (G.cur && G.cur.fit) showScoreCard(false); });

  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
    SFX('click');
    if (b.dataset.tool === 'factor' && editor.selection().items.length) { editor.factorFromSelection(); editor.setTool('select'); return; }
    editor.setTool(b.dataset.tool);
  }));
  $('btn-undo').addEventListener('click', () => { SFX('click'); editor.undo(); });
  $('btn-tidy').addEventListener('click', () => { SFX('click'); editor.tidy(); });
  let clearArmed = null;
  $('btn-clear').addEventListener('click', () => {
    const b = $('btn-clear');
    if (clearArmed) {
      clearTimeout(clearArmed); clearArmed = null;
      b.classList.remove('armed'); b.querySelector('span').textContent = 'Clear';
      editor.clear(); SFX('erase');
    } else {
      b.classList.add('armed'); b.querySelector('span').textContent = 'Sure?';
      toast('Press Clear again to remove all factors and paths.');
      clearArmed = setTimeout(() => { clearArmed = null; b.classList.remove('armed'); b.querySelector('span').textContent = 'Clear'; }, 2500);
    }
  });
  fitBtn.addEventListener('click', onFitButton);

  const anyModal = () => FF.tutorial.isOpen() || ['modal-r', 'modal-quit', 'modal-truth'].some(id => $(id).classList.contains('show'));
  document.addEventListener('keydown', (e) => {
    if (G.screen !== 'game') return;
    if (e.key === 'Escape') {
      for (const id of ['modal-r', 'modal-truth']) if ($(id).classList.contains('show')) { closeModal(id); return; }
      if (layer.classList.contains('show')) { hideCard(); return; }
    }
    if (anyModal()) return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    if (layer.classList.contains('show')) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); skipSeq(); } return; }
    if (G.phase !== 'build') return;
    const k = e.key.toLowerCase();
    if (G.mode === 'learn') {
      if (k === 'escape' && paramT) { closeParam(); editor.clearSelection(); return; }
      if (k === 'enter') return;
      if (k === 'i' && !e.metaKey && !e.ctrlKey) { editor.addObs(); return; }
    }
    if (editor.picking) {
      if (k === 'enter') { e.preventDefault(); editor.commitPick(); }
      else if (k === 'escape') editor.cancelPick();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); editor.undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'enter') { e.preventDefault(); onFitButton(); return; }
    const tools = { v: 'select', f: 'factor', a: 'arrow', c: 'cov', e: 'erase' };
    if (tools[k]) {
      if (k === 'f' && editor.selection().items.length) { editor.factorFromSelection(); editor.setTool('select'); }
      else editor.setTool(tools[k]);
    } else if (k === 'delete' || k === 'backspace') { e.preventDefault(); editor.deleteSelection(); }
    else if (k === 't') editor.tidy();
    else if (k === 'escape') { editor.cancelPending(); editor.setTool('select'); }
  });

  // re-render on resize
  let rz = null;
  const onResize = () => {
    if (rz) return;
    rz = requestAnimationFrame(() => {
      rz = null;
      renderAll();
      if ($('modal-truth').classList.contains('show')) truthView.render();
    });
  };
  if (global.ResizeObserver) {
    const ro = new ResizeObserver(onResize);
    ro.observe(DD.root); ro.observe(pane); ro.observe($('truth-canvas'));
  }
  global.addEventListener('resize', onResize);

  // BGM on first gesture
  function firstGesture() {
    const a = global.GaltonAudio;
    if (a) { a.ensure(); a.bgm.start(); }
    document.removeEventListener('pointerdown', firstGesture);
    document.removeEventListener('keydown', firstGesture);
  }
  document.addEventListener('pointerdown', firstGesture);
  document.addEventListener('keydown', firstGesture);

  updateHUD();
  FF.game.CONFIG = CONFIG;
  FF.game.debug = { startGame, startRound, editor, truthView, scoreFit, skipSeq, showScoreCard, showError, openTruth, acceptTrue, afterRound, showFinal, learnUpdate };
})(window);
