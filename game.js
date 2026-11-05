// FACTOR FIND — game orchestrator: datasets, dashboards, the single fit,
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
      tiers: [{ test: (v) => v >= 0.05, cls: 'good', pts: 10, label: 'Not rejected' },
              { test: (v) => v >= 0.01, cls: 'ok', pts: 5, label: 'Borderline' }],
      fail: 'Rejected',
      axis: { log: true, min: 0.001, max: 1, ticks: [[0.001, '.001'], [0.01, '.01'], [0.05, '.05'], [1, '1']],
              zones: [['bad', 0.001, 0.01], ['ok', 0.01, 0.05], ['good', 0.05, 1]] } },
    { key: 'rmsea', name: 'RMSEA', sub: 'approximation error', value: (r) => r.rmsea,
      main: (r) => f3(r.rmsea), small: () => '',
      tiers: [{ test: (v) => v < 0.05, cls: 'good', pts: 10, label: 'Close fit' },
              { test: (v) => v < 0.08, cls: 'ok', pts: 5, label: 'Acceptable' }],
      fail: 'Poor fit',
      axis: { min: 0, max: 0.15, ticks: [[0, '0'], [0.05, '.05'], [0.08, '.08'], [0.15, '.15']],
              zones: [['good', 0, 0.05], ['ok', 0.05, 0.08], ['bad', 0.08, 0.15]] } },
    { key: 'cfi', name: 'CFI', sub: 'vs. no correlations', value: (r) => Math.min(1, r.cfi),
      main: (r) => f3(Math.min(1, r.cfi)), small: () => '',
      tiers: [{ test: (v) => v >= 0.95, cls: 'good', pts: 10, label: 'Good' },
              { test: (v) => v >= 0.90, cls: 'ok', pts: 5, label: 'Acceptable' }],
      fail: 'Poor',
      axis: { min: 0.8, max: 1, ticks: [[0.8, '.80'], [0.9, '.90'], [0.95, '.95'], [1, '1']],
              zones: [['bad', 0.8, 0.9], ['ok', 0.9, 0.95], ['good', 0.95, 1]] } },
    { key: 'srmr', name: 'SRMR', sub: 'residual correlations', value: (r) => r.srmr,
      main: (r) => f3(r.srmr), small: () => '',
      tiers: [{ test: (v) => v < 0.08, cls: 'good', pts: 10, label: 'Good' },
              { test: (v) => v < 0.10, cls: 'ok', pts: 5, label: 'Acceptable' }],
      fail: 'Poor',
      axis: { min: 0, max: 0.15, ticks: [[0, '0'], [0.08, '.08'], [0.10, '.10'], [0.15, '.15']],
              zones: [['good', 0, 0.08], ['ok', 0.08, 0.10], ['bad', 0.10, 0.15]] } },
  ];

  const CONFIG = {
    ROUNDS: 1,                                // datasets per game (1 = single-shot games)
    N_CHOICES: [150, 200, 250, 300, 400, 500],
    BIC_MAX: 60,                              // parsimony points ...
    BIC_COST: 3,                              // ... minus this per BIC point above the true model
    SUPPORT_BIC: 2,                           // every feature of the truth must be worth >= 2 BIC
    RESID_MAX: 0.25,                          // colour scale for residual correlations
    RESID_MAX_P: 0.35,                        // ... and residual partial correlations
    LEVELS: {
      1: { name: 'Easy', blurb: 'Clean structure: one or two factors.' },
      2: { name: 'Medium', blurb: 'One twist: a cross-loading, a residual correlation, uncorrelated factors or a third factor.' },
      3: { name: 'Hard', blurb: 'Several twists and up to three factors.' },
    },
    CRITERIA,
  };
  const FIT_MAX = CRITERIA.reduce((s, c) => s + c.tiers[0].pts, 0);
  const MAX_ROUND = FIT_MAX + CONFIG.BIC_MAX;
  // the true model must reach the top tier of every criterion on its sample
  const acceptTrue = (f) => CRITERIA.every(c => c.tiers[0].test(c.value(f)));

  const G = {
    screen: 'title', phase: 'build', tab: 'data', rview: 'implied',
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
    onRender: () => syncSelectionHL(),
  });
  const truthView = FF.editor.create($('truth-canvas'), { static: true });

  function onModelChanged() {
    if (!G.cur) return;
    updateModelInfo();
    updateFactorButton();
    $('canvas-hint').classList.toggle('gone', editor.counts.factors > 0 || editor.counts.edges > 0);
  }

  function updateModelInfo() {
    const c = G.cur;
    if (G.phase === 'results' && c && c.fit) {
      const r = c.fit.res;
      $('model-info').innerHTML = `ML fit &middot; N = ${c.N} &middot; χ²(${r.df}) = ${r.chisq.toFixed(1)} &middot; BIC ${r.bic.toFixed(1)}`;
      return;
    }
    const { spec } = editor.getSpec();
    const npar = FF.sem.buildParams(spec).length;
    const df = spec.p * (spec.p + 1) / 2 - npar;
    const fac = spec.m === 1 ? '1 factor' : spec.m + ' factors';
    let s = `${fac} &middot; ${npar} parameters &middot; <span class="${df < 0 ? 'warn' : ''}">df ${df}</span>`;
    if (spec.m === 0 && !spec.residCovs.length) s += ' &middot; <span class="muted">no model yet</span>';
    $('model-info').innerHTML = s;
  }

  function updateFactorButton() {
    const n = editor.selection().items.length;
    $('factor-label').textContent = n ? `Factor (${n})` : 'Factor';
    $('btn-factor').classList.toggle('ready', n > 0);
  }

  // ------------------------------------------------------------------
  // Indicator picker (after adding a factor, or double-clicking one)
  // ------------------------------------------------------------------
  const pickPop = $('pick-pop');
  function placePicker(info) {
    if (!info) { pickPop.classList.add('hidden'); return; }
    hideTip();
    pickPop.classList.remove('hidden');
    pickPop.querySelector('.pp-title').textContent = info.isNew ? 'Select its indicators' : 'Edit its indicators';
    $('pp-count').textContent = info.n === 1 ? '1 item selected' : info.n + ' items selected';
    $('pp-ok').disabled = false;
    // try beside, then below / above the factor; take the first spot that
    // fits in the canvas and covers no other node
    const pw = pickPop.offsetWidth, ph = pickPop.offsetHeight, gap = 14, m = 8;
    const clampX = (v) => Math.max(m, Math.min(info.W - pw - m, v));
    const clampY = (v) => Math.max(m, Math.min(info.H - ph - m, v));
    const cands = [
      [info.x + info.R + gap, info.y - ph / 2],
      [info.x - info.R - gap - pw, info.y - ph / 2],
      [info.x - pw / 2, info.y + info.R + gap],
      [info.x - pw / 2, info.y - info.R - gap - ph],
    ];
    const r = info.side * 0.75;
    const free = ([l, t]) => l >= m && t >= m && l + pw <= info.W - m && t + ph <= info.H - m &&
      !info.avoid.some(([x, y]) => x > l - r && x < l + pw + r && y > t - r && y < t + ph + r);
    let pos = cands.find(free);
    if (!pos) pos = cands.find(([l, t]) => l >= m && l + pw <= info.W - m && t >= m && t + ph <= info.H - m) || cands[2];
    pickPop.style.left = clampX(pos[0]) + 'px';
    pickPop.style.top = clampY(pos[1]) + 'px';
  }
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
      c.fit.dash = { R: Rm, P: la.partialCor(Rm), ev: la.eigSym(Rm).values };
    }
    return c.fit.dash;
  }

  function renderData() {
    const c = G.cur;
    if (!c || !visible(DD.root)) return;
    const d = c.dash;
    P.scree(DD.svg('scree'), [{ values: d.ev, color: '#20252C', label: 'data' }], { onHover: hover('scree') });
    P.heatmap(DD.svg('heat'), d.R, { maximum: 1, onHover: hover('cor') });
    P.network(DD.svg('net'), d.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
    P.network(DD.svg('pcor'), d.P, d.layout, { maximum: d.maxP, onHover: hover('pcor') });
    applyHighlight(hlSet(), HL.pair);
  }

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
      P.heatmap(MD.svg('heat'), m.R, { maximum: 1, onHover: hover('cor') });
      MD.cap('net', 'Model-implied network');
      P.network(MD.svg('net'), m.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
      MD.cap('pcor', 'Model-implied partial correlations');
      P.network(MD.svg('pcor'), m.P, d.layout, { maximum: d.maxP, onHover: hover('pcor') });
    } else {
      const RM = CONFIG.RESID_MAX, RP = CONFIG.RESID_MAX_P;
      const sc = (v) => '· scale ±' + v.toFixed(2).replace(/^0/, '');
      MD.cap('heat', 'Residual correlations', '(data − model)');
      P.heatmap(MD.svg('heat'), subM(d.R, m.R), { maximum: RM, onHover: hover('cor') });
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
      let s = `<div class="tt-h">Eigenvalue ${h.k + 1}</div>` + tipRow('data', c.dash.ev[h.k].toFixed(2));
      if (m) s += tipRow('model', m.ev[h.k].toFixed(2));
      showTip(s, ev);
      return;
    }
    const i = Math.min(h.i, h.j), j = Math.max(h.i, h.j);
    const name = kind === 'pcor' ? 'Partial correlation' : 'Correlation';
    const D = kind === 'pcor' ? c.dash.P : c.dash.R;
    const v = D[i][j];
    let s = `<div class="tt-h">${name} ${i + 1}–${j + 1}</div>` + tipRow('data', f2(v), cls(v));
    if (m) {
      const M = kind === 'pcor' ? m.P : m.R;
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
  // HUD
  // ------------------------------------------------------------------
  function updateHUD() {
    $('hud-level').textContent = CONFIG.LEVELS[G.level].name;
    if (CONFIG.ROUNDS > 1) {
      $('hud-l2').textContent = 'ROUND'; $('hud-v2').textContent = `${G.round + 1}/${CONFIG.ROUNDS}`;
      $('hud-l3').textContent = 'SCORE'; $('hud-v3').textContent = String(G.rounds.reduce((s, r) => s + r.total, 0));
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
    else label.textContent = CONFIG.ROUNDS > 1 ? (G.round + 1 >= CONFIG.ROUNDS ? 'FINISH' : 'NEXT ▸') : 'NEW DATA ▸';
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
    const N = CONFIG.N_CHOICES[rnd.int(CONFIG.N_CHOICES.length)];

    hideCard(true);
    closeModal('modal-truth');
    Object.assign(HL, { sel: [], hover: null, pair: null, key: '' });
    setPhase('build');
    G.cur = null;
    generating = true;
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
      G.cur = {
        k, seed, tpl, N, data, model: data.model, p: data.model.L.length,
        dash: { R, P: Pc, ev: la.eigSym(R).values, layout: P.springLayout(R), maxR: offMax(R), maxP: offMax(Pc) },
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
    const bicPts = Math.max(0, Math.round(CONFIG.BIC_MAX - CONFIG.BIC_COST * Math.max(0, dBIC)));
    const bicCls = bicPts >= CONFIG.BIC_MAX - 6 ? 'good' : bicPts >= CONFIG.BIC_MAX / 2 ? 'ok' : 'bad';
    return { rows, saturated, fitPts, dBIC, bicPts, bicCls, total: fitPts + bicPts, cmp };
  }

  let busy = false;
  function onFitButton() {
    if (busy || generating || !G.cur) return;
    if (G.phase === 'results') { afterRound(); return; }
    SFX('click');
    const c = G.cur;
    if (editor.picking) editor.commitPick();
    const { spec, key } = editor.getSpec();
    if (spec.m === 0 && !spec.residCovs.length) {
      SFX('error');
      toast('Draw a model first: double-click the canvas to add a factor.', 'warn');
      return;
    }
    editor.cancelPending();
    busy = true;
    fitBtn.classList.add('busy');
    canvasWrap.classList.add('estimating');
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
    // first watch the paths grow into their estimates, then the scores
    G.rview = 'diagram'; pane.dataset.rview = 'diagram';
    document.querySelectorAll('#rview-seg button').forEach(b => b.classList.toggle('on', b.dataset.rview === 'diagram'));
    busy = true;
    editor.setFitResult(res, {
      animate: true, duration: 1000,
      onDone: () => setTimeout(() => {
        busy = false;
        setRview('implied');
        showScoreCard(true);
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
    return 'Close, but not the most parsimonious description of these data.';
  }

  function showScoreCard(animate) {
    const c = G.cur, fit = c.fit, sc = fit.score, r = fit.res;
    sc.rows.forEach(row => { row.g = gaugeGeom(row.cr.axis, row.v); });
    hideTip();
    const nextLevelSeg = CONFIG.ROUNDS > 1 ? '' :
      `<div class="next-level"><span>Next:</span><div class="seg small" id="next-seg">${[1, 2, 3].map(l => `<button data-level="${l}" class="${l === G.level ? 'on' : ''}">${CONFIG.LEVELS[l].name}</button>`).join('')}</div></div>`;
    const nextLabel = CONFIG.ROUNDS > 1 ? (G.round + 1 >= CONFIG.ROUNDS ? 'Final score' : 'Next round ▸') : 'New dataset ▸';
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
        <div class="bic-foot"><span>&minus;${CONFIG.BIC_COST} points per BIC point above the true model</span><b><span id="bic-pts">${CONFIG.BIC_MAX}</span> / ${CONFIG.BIC_MAX}</b></div>
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
      countUp($('bic-pts'), CONFIG.BIC_MAX, sc.bicPts, 900);
    } });
    steps.push({ wait: 950, fn: (fast) => {
      $('bic-block').classList.add('done');
      $('bic-pts').textContent = String(sc.bicPts);
      if (!fast) SFX(sc.bicCls === 'good' ? 'close' : sc.bicCls === 'ok' ? 'fair' : 'poor');
    } });
    steps.push({ wait: 400, fn: (fast) => {
      $('total-block').classList.add('in');
      if (fast) $('total-num').textContent = String(sc.total);
      else countUp($('total-num'), 0, sc.total, 700);
    } });
    steps.push({ wait: 700, fn: (fast) => {
      $('total-num').textContent = String(sc.total);
      $('card-btns').classList.add('in');
      $('card-foot').classList.add('in');
      const sh = $('skip-hint'); if (sh) sh.remove();
      $('score-chip-val').textContent = String(sc.total);
      if (!fit.recorded) {
        fit.recorded = true;
        recordRound();
        if (!fast) {
          if (sc.cmp.exact) SFX('levelup'); else if (sc.total >= 80) SFX('coin');
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
  function countUp(el, from, to, dur) {
    cancelAnimationFrame(countTimer);
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 2))));
      if (t < 1 && !seq.fast) countTimer = requestAnimationFrame(step); else el.textContent = String(to);
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
  // Final screen (multi-round games only)
  // ------------------------------------------------------------------
  function showFinal() {
    const max = CONFIG.ROUNDS * MAX_ROUND;
    const total = G.rounds.reduce((s, r) => s + r.total, 0);
    $('final-score').innerHTML = `${total}<small> / ${max}</small>`;
    $('final-rank').textContent = rankFor(total / CONFIG.ROUNDS, false);
    const rows = G.rounds.map((r, k) => `<tr><td>${k + 1}</td><td>${r.tpl.name}</td><td>${r.N}</td><td>${r.fitPts}</td><td>${r.bicPts}</td><td>${r.total}</td></tr>`).join('');
    $('final-table').innerHTML = `<tr><th>#</th><th>TRUE MODEL</th><th>N</th><th>FIT</th><th>PARSIMONY</th><th>POINTS</th></tr>${rows}<tr class="sum"><td></td><td>Total</td><td></td><td></td><td></td><td>${total}</td></tr>`;
    hideCard(true);
    showOverlay('screen-final');
    G.screen = 'final';
    SFX('close');
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
  document.querySelectorAll('.lc-blurb').forEach(el => { el.textContent = CONFIG.LEVELS[+el.dataset.blurb].blurb; });
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
  $('btn-help').addEventListener('click', () => { SFX('click'); FF.tutorial.show({ popup: true }); });
  $('btn-home').addEventListener('click', () => {
    SFX('click');
    if (G.screen === 'game') $('modal-quit').classList.add('show');
  });
  $('quit-stay').addEventListener('click', () => closeModal('modal-quit'));
  $('quit-leave').addEventListener('click', () => {
    closeModal('modal-quit');
    hideCard(true);
    G.screen = 'title'; showOverlay('screen-title');
  });
  $('btn-again').addEventListener('click', () => { SFX('click'); startGame(); });
  $('btn-final-home').addEventListener('click', () => { SFX('click'); G.screen = 'title'; showOverlay('screen-title'); });
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
  FF.game.debug = { startGame, startRound, editor, truthView, scoreFit, skipSeq, showScoreCard, showError, openTruth, acceptTrue, afterRound };
})(window);
