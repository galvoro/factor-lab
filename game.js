// FACTOR FIND — game orchestrator: rounds, dashboard, fitting, scoring,
// reveal and final screen. Exposes FF.game (state) for debugging.
(function (global) {
  'use strict';
  const FF = global.FF;
  const la = FF.la, P = FF.plots;
  const SFX = (n) => { const a = global.GaltonAudio; if (a && a.SFX && a.SFX[n]) a.SFX[n](); };

  // ------------------------------------------------------------------
  // Configuration (all scoring rules live here)
  // ------------------------------------------------------------------
  const CONFIG = {
    ROUNDS: 5,
    N: 200,
    TIERS: [1, 2, 3, 4, 4],         // bank tier used for each round
    MAX_FITS: 3,                    // fits per round
    REFIT_COST: 2,                  // points per revision (fit after the first)
    FIT_TIERS: [
      { max: 0.05, pts: 10, label: 'Close fit', cls: 'good', sfx: 'close' },
      { max: 0.08, pts: 5, label: 'Acceptable fit', cls: 'ok', sfx: 'fair' },
    ],
    POOR: { pts: 0, label: 'Poor fit', cls: 'bad', sfx: 'poor' },
    PARSIMONY: [                    // BIC(yours) - BIC(true model), same data
      { max: 2, pts: 10, label: 'as parsimonious as the truth' },
      { max: 10, pts: 5, label: 'close to the truth' },
    ],
    RESID_MAX: 0.25,                // colour scale for residual correlations
    RESID_MAX_P: 0.35,              // ... and residual partial correlations (noisier)
  };
  const MAX_ROUND = CONFIG.FIT_TIERS[0].pts + CONFIG.PARSIMONY[0].pts;

  const G = {
    screen: 'title', view: 'data', tab: 'data',
    round: 0, score: 0, rounds: [], picks: [], seedBase: 0,
    cur: null, tutorialSeen: false,
  };
  FF.game = G;

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const panels = {
    scree: $('p-scree'), heat: $('p-heat'), net: $('p-net'), pcor: $('p-pcor'),
  };
  const svgOf = (k) => panels[k].querySelector('svg');
  const capOf = (k) => panels[k].querySelector('figcaption');
  const dashGrid = document.querySelector('.dash-grid');
  const readout = $('readout');
  const canvasWrap = document.querySelector('.canvas-wrap');
  const canvasPane = $('canvas-pane');
  const fitBtn = $('btn-fit');
  const results = $('results');
  const resBody = $('res-body');
  const toastEl = $('toast');

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
    onHoverNode: (idx) => highlight(idx === null ? null : [idx], 'canvas'),
  });
  const truthView = FF.editor.create($('truth-canvas'), { static: true });

  function onModelChanged() {
    const c = G.cur;
    if (!c) return;
    updateModelInfo();
    updateFactorButton();
    $('canvas-hint').classList.toggle('gone', editor.counts.factors > 0 || editor.counts.edges > 0);
    if (c.last) {
      const { key } = editor.getSpec();
      const same = key === c.lastKey;
      if (same && editor.stale) editor.setFitResult(c.last);
      if (!same && !results.classList.contains('hidden') && !c.locked) results.classList.add('hidden');
      renderDash();
    }
    updateFitButton();
  }

  function updateModelInfo() {
    const { spec } = editor.getSpec();
    const npar = FF.sem.buildParams(spec).length;
    const df = spec.p * (spec.p + 1) / 2 - npar;
    const fac = spec.m === 1 ? '1 factor' : spec.m + ' factors';
    let s = `${fac} · ${npar} parameters · <span class="${df < 0 ? 'warn' : ''}">df ${df}</span>`;
    if (spec.m === 0 && !spec.residCovs.length) s += ' · <span class="muted">baseline model</span>';
    if (G.cur && G.cur.last && editor.stale && !G.cur.locked) s += ' · changed since last fit';
    $('model-info').innerHTML = s;
  }

  function updateFactorButton() {
    const sel = editor.selection();
    const btn = $('btn-factor');
    const n = sel.items.length;
    $('factor-label').textContent = n ? `Factor (${n})` : 'Factor';
    btn.classList.toggle('ready', n > 0);
  }

  // ------------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------------
  function offMax(M) {
    let m = 0;
    for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) if (i !== j) m = Math.max(m, Math.abs(M[i][j]));
    return m || 1;
  }
  function subM(A, B) { return A.map((r, i) => r.map((v, j) => v - B[i][j])); }

  function dashModel() {
    const c = G.cur;
    if (!c || !c.last) return null;
    if (!c.lastDash) {
      const Rm = c.last.impliedCor;
      c.lastDash = { R: Rm, P: la.partialCor(Rm), ev: la.eigSym(Rm).values };
    }
    return c.lastDash;
  }

  function setCaption(k, main, sub) {
    capOf(k).innerHTML = main + (sub ? ` <span class="cap-sub">${sub}</span>` : '');
  }

  function renderDash() {
    const c = G.cur;
    if (!c) return;
    const d = c.dash;
    const m = dashModel();
    const view = m ? G.view : 'data';
    const lastNote = m && editor.stale && !c.locked ? '· last fit' : '';
    const hover = (kind) => (h) => onPlotHover(kind, h);

    if (view === 'data') {
      setCaption('scree', 'Scree plot');
      P.scree(svgOf('scree'), [{ values: d.ev, color: '#20252C', label: 'data' }], { onHover: hover('scree') });
      setCaption('heat', 'Correlations');
      P.heatmap(svgOf('heat'), d.R, { maximum: 1, onHover: hover('cor') });
      setCaption('net', 'Correlation network');
      P.network(svgOf('net'), d.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
      setCaption('pcor', 'Partial correlation network');
      P.network(svgOf('pcor'), d.P, d.layout, { maximum: d.maxP, onHover: hover('pcor') });
    } else {
      const both = [
        { values: d.ev, color: '#A9A396', dash: '5 4', r: 3.2, label: 'data' },
        { values: m.ev, color: '#E39B2D', width: 2.4, fill: '#E39B2D', label: 'model' },
      ];
      setCaption('scree', 'Scree plot', '· data vs model ' + lastNote);
      P.scree(svgOf('scree'), both, { onHover: hover('scree') });
      if (view === 'model') {
        setCaption('heat', 'Model-implied correlations', lastNote);
        P.heatmap(svgOf('heat'), m.R, { maximum: 1, onHover: hover('cor') });
        setCaption('net', 'Model-implied network', lastNote);
        P.network(svgOf('net'), m.R, d.layout, { maximum: d.maxR, onHover: hover('cor') });
        setCaption('pcor', 'Model-implied partial correlations', lastNote);
        P.network(svgOf('pcor'), m.P, d.layout, { maximum: d.maxP, onHover: hover('pcor') });
      } else {
        const RM = CONFIG.RESID_MAX;
        setCaption('heat', 'Residual correlations', '(data − model) ' + lastNote);
        P.heatmap(svgOf('heat'), subM(d.R, m.R), { maximum: RM, onHover: hover('cor') });
        setCaption('net', 'Residual network', '· scale ±' + RM.toFixed(2).replace(/^0/, '') + ' ' + lastNote);
        P.network(svgOf('net'), subM(d.R, m.R), d.layout, { maximum: RM, onHover: hover('cor') });
        const RP = CONFIG.RESID_MAX_P;
        setCaption('pcor', 'Residual partial network', '· scale ±' + RP.toFixed(2).replace(/^0/, '') + ' ' + lastNote);
        P.network(svgOf('pcor'), subM(d.P, m.P), d.layout, { maximum: RP, onHover: hover('pcor') });
      }
    }
    // re-apply any active highlight
    if (hlState) applyHighlight(hlState);
  }

  function setView(v, flash) {
    if (v !== 'data' && !G.cur.last) return;
    G.view = v;
    document.querySelectorAll('#view-seg button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    dashGrid.classList.remove('swap'); void dashGrid.offsetWidth; dashGrid.classList.add('swap');
    renderDash();
    if (flash) {
      document.querySelectorAll('#view-seg button').forEach(b => { if (b.dataset.view !== 'data') { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); } });
    }
  }

  // touch: a tapped value stays in the readout until the next tap elsewhere
  dashGrid.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!e.target.closest('.hm-cell, .net-edge, .scree-series circle')) onPlotHover(null, null);
  });

  // ---- hover readouts + cross-highlighting ----
  const f2 = (v) => P.fmt2(v);
  const sgn = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace(/^0/, '');
  const cls = (v) => (v >= 0 ? 'pos' : 'neg');
  function onPlotHover(kind, h) {
    const c = G.cur;
    if (!h) { readout.innerHTML = defaultReadout(); highlight(null, 'plot'); return; }
    const m = dashModel();
    if (kind === 'scree') {
      let s = `Eigenvalue ${h.k + 1}: data <b>${c.dash.ev[h.k].toFixed(2)}</b>`;
      if (m && G.view !== 'data') s += ` · model <b>${m.ev[h.k].toFixed(2)}</b>`;
      readout.innerHTML = s;
      return;
    }
    const i = Math.min(h.i, h.j), j = Math.max(h.i, h.j);
    const name = kind === 'pcor' ? 'partial r' : 'r';
    const D = kind === 'pcor' ? c.dash.P : c.dash.R;
    const v = D[i][j];
    let s = `${name}(${i + 1}, ${j + 1}): data <b class="${cls(v)}">${f2(v)}</b>`;
    if (m) {
      const M = kind === 'pcor' ? m.P : m.R;
      s += ` · model <b class="${cls(M[i][j])}">${f2(M[i][j])}</b> · residual <b>${sgn(v - M[i][j])}</b>`;
    }
    readout.innerHTML = s;
    highlight([i, j], 'plot');
  }
  function defaultReadout() {
    return G.cur && G.cur.last ? 'Hover a cell, line or point: data vs. model values.' : 'Hover a cell, line or point to read its value.';
  }

  let hlState = null;
  function highlight(idxs, source) {
    hlState = idxs && idxs.length ? idxs : null;
    applyHighlight(hlState);
    if (source !== 'canvas') editor.setHighlight(hlState || []);
    if (source === 'canvas') {
      if (hlState) {
        const i = hlState[0], c = G.cur;
        const R = c.dash.R;
        const top = R[i].map((v, j) => [j, v]).filter(([j]) => j !== i).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
        readout.innerHTML = `Item ${i + 1} · strongest correlations: ` + top.map(([j, v]) => `${j + 1} <b class="${cls(v)}">${f2(v)}</b>`).join(', ');
      } else readout.innerHTML = defaultReadout();
    }
  }
  function applyHighlight(idxs) {
    const set = new Set(idxs || []);
    for (const k of ['net', 'pcor']) {
      svgOf(k).querySelectorAll('.net-node').forEach((g, n) => g.classList.toggle('hl', set.has(n)));
    }
    svgOf('heat').querySelectorAll('.hm-cell').forEach(r => {
      const i = +r.dataset.i, j = +r.dataset.j;
      const exact = set.size === 2 && set.has(i) && set.has(j) && i !== j;
      const soft = set.size === 1 && (set.has(i) || set.has(j));
      r.classList.toggle('hl', exact);
      r.classList.toggle('hl-soft', soft);
    });
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  function updateHUD() {
    $('hud-round').textContent = `${G.round + 1}/${CONFIG.ROUNDS}`;
    $('hud-score').textContent = String(G.score);
    const used = G.cur ? G.cur.fits.length : 0;
    const pips = $('hud-fits');
    pips.innerHTML = '';
    for (let k = 0; k < CONFIG.MAX_FITS; k++) {
      const s = document.createElement('span');
      s.className = 'pip' + (k < used ? ' used' : '');
      pips.appendChild(s);
    }
  }
  function bumpScore() {
    const el = $('hud-score');
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  function updateFitButton() {
    const c = G.cur;
    const label = fitBtn.querySelector('.fit-label');
    fitBtn.disabled = false;
    if (!c) return;
    if (c.locked) label.textContent = G.round + 1 >= CONFIG.ROUNDS ? 'FINISH' : 'NEXT ▸';
    else if (c.fits.length >= CONFIG.MAX_FITS) label.textContent = 'LOCK IN';
    else label.textContent = 'FIT';
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
  function pickModels(rnd) {
    const used = new Set();
    return CONFIG.TIERS.map(t => {
      const pool = FF.bank.MODELS.filter(m => m.tier === t && !used.has(m.id));
      const m = pool[rnd.int(pool.length)];
      used.add(m.id);
      return m;
    });
  }

  function startGame() {
    const urlSeed = seedFromURL();
    G.seedBase = urlSeed !== null ? urlSeed : (Math.floor(Math.random() * 4294967295) >>> 0);
    const rnd = la.rng(G.seedBase);
    G.picks = pickModels(rnd);
    G.round = 0; G.score = 0; G.rounds = [];
    showOverlay(null);
    G.screen = 'game';
    global.GaltonAudio && global.GaltonAudio.bgm && global.GaltonAudio.bgm.start();
    startRound(0);
  }

  function startRound(i) {
    G.round = i;
    const model = G.picks[i];
    const seed = (G.seedBase + 7919 * (i + 1)) >>> 0;
    const data = FF.bank.makeRound(model, CONFIG.N, seed);
    const R = data.R;
    const Pc = la.partialCor(R);
    G.cur = {
      idx: i, model, data,
      dash: { R, P: Pc, ev: la.eigSym(R).values, layout: P.springLayout(R), maxR: offMax(R), maxP: offMax(Pc) },
      fits: [], last: null, lastKey: null, lastDash: null, locked: false,
    };
    G.view = 'data';
    document.querySelectorAll('#view-seg button').forEach(b => {
      b.classList.toggle('on', b.dataset.view === 'data');
      b.classList.remove('flash');
      if (b.dataset.view !== 'data') b.disabled = true;
    });
    $('dash-p').textContent = String(data.model.L.length);
    results.classList.add('hidden');
    results.classList.remove('min');
    canvasPane.classList.remove('locked');
    $('truth-canvas').classList.add('hidden');
    $('truth-seg').classList.add('hidden');
    setToolbarEnabled(true);
    editor.reset(data.model.L.length);
    editor.setTool('select');
    $('canvas-hint').classList.remove('gone');
    readout.innerHTML = defaultReadout();
    setTab('data');
    updateHUD();
    updateModelInfo();
    updateFitButton();
    requestAnimationFrame(() => { renderDash(); editor.render(); });
  }

  function setToolbarEnabled(on) {
    document.querySelectorAll('.toolbar button').forEach(b => {
      if (b.id === 'btn-values') return;
      b.disabled = !on;
    });
  }

  // ------------------------------------------------------------------
  // Fitting
  // ------------------------------------------------------------------
  function fitPoints(res) {
    if (res.df === 0) return { pts: 0, label: 'Saturated model', cls: 'bad', sfx: 'poor',
      note: 'With df = 0 the model reproduces any data perfectly, so its fit cannot be tested. Remove some paths.' };
    if (res.improper) return { pts: 0, label: 'Improper solution', cls: 'bad', sfx: 'poor', note: improperNote(res) };
    for (const t of CONFIG.FIT_TIERS) if (res.rmsea < t.max) return t;
    return CONFIG.POOR;
  }
  function improperNote(res) {
    const p = res.problems[0];
    if (p.kind === 'negvar') return `Item ${p.obs + 1} has a negative residual variance (a Heywood case): the solution is not admissible.`;
    if (p.kind === 'rescor') return `The residual correlation between items ${p.a + 1} and ${p.b + 1} exceeds 1: the solution is not admissible.`;
    if (p.kind === 'faccor') return 'Two factors correlate beyond ±1: the solution is not admissible.';
    return 'The factor covariance matrix is not positive definite: the solution is not admissible.';
  }
  function parsimonyPoints(dBIC) {
    for (const t of CONFIG.PARSIMONY) if (dBIC <= t.max) return t;
    return { pts: 0, label: 'more complex or worse-fitting than the truth' };
  }

  let busy = false;
  function onFitButton() {
    const c = G.cur;
    if (!c || busy) return;
    SFX('click');
    if (c.locked) { nextRound(); return; }
    const { spec, key } = editor.getSpec();
    if (c.last && key === c.lastKey) {
      // nothing changed: just show the results again
      if (editor.stale) editor.setFitResult(c.last);
      showFitCard();
      return;
    }
    if (c.fits.length >= CONFIG.MAX_FITS) {
      if (c.last) { toast('No fits left this round — locking in your last fit.'); lockIn(); }
      return;
    }
    const res = FF.sem.fit(spec, c.data.S, CONFIG.N, { facLabel: () => 'One of your factors' });
    if (!res.ok) {
      SFX('error');
      const why = [...new Set(res.reasons)].join(' ');
      toast((res.identified === false ? 'Not identified: ' : '') + why, 'warn');
      return;
    }
    if (!res.converged) {
      SFX('error');
      toast('The estimation did not converge: an estimate ran off towards infinity. Try a simpler structure. (This fit was not counted.)', 'warn');
      return;
    }
    busy = true;
    fitBtn.classList.add('busy');
    canvasWrap.classList.add('estimating');
    SFX('fit');
    setTimeout(() => {
      busy = false;
      fitBtn.classList.remove('busy');
      canvasWrap.classList.remove('estimating');
      const fp = fitPoints(res);
      c.fits.push({ res, key, fp, spec, rcode: FF.sem.rCode(spec, c.data.S, CONFIG.N, res) });
      c.last = res; c.lastKey = key; c.lastDash = null;
      editor.setFitResult(res);
      document.querySelectorAll('#view-seg button').forEach(b => { b.disabled = false; });
      updateHUD();
      updateModelInfo();
      updateFitButton();
      if (G.tab === 'data' || isWide()) setView('model', true); else { G.view = 'model'; document.querySelectorAll('#view-seg button').forEach(b => b.classList.toggle('on', b.dataset.view === 'model')); renderDash(); markTabDot(true); }
      setTimeout(() => { showFitCard(); SFX(fp.sfx); }, 350);
    }, 650);
  }

  function verdictHint(r, fp) {
    if (fp.pts === 10) return 'Your model reproduces the correlations closely. Lock in, or simplify it first: the parsimony bonus rewards a lean model.';
    if (fp.pts === 5) return 'Not bad, but something is missing. Check the <b>Residuals</b> view for correlations your model does not explain.';
    return 'The model misses important structure. Look at the <b>Residuals</b> view: large residuals point to missing factors, loadings or correlations.';
  }
  function fmtP(p) { return !isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3).replace(/^0/, ''); }
  function f3(v) { return v.toFixed(3).replace(/^0/, '').replace(/^-0/, '−'); }

  function showFitCard() {
    const c = G.cur;
    const rec = c.fits[c.fits.length - 1];
    const r = rec.res, fp = rec.fp;
    const nFit = c.fits.length;
    const revisions = nFit - 1;
    $('res-title').textContent = `Fit ${nFit} of ${CONFIG.MAX_FITS} · Round ${c.idx + 1}`;
    const canRevise = nFit < CONFIG.MAX_FITS;
    resBody.innerHTML = `
      <div class="rb">
        <div class="verdict ${fp.cls}"><span>${fp.label}</span><span class="pts">+${fp.pts}</span></div>
        ${fp.note ? `<div class="verdict-note">${fp.note}</div>` : `<div class="verdict-note">${verdictHint(r, fp)}</div>`}
      </div>
      <div class="rb">
        <div class="fit-grid">
          <div class="fit-cell key"><div class="k">RMSEA</div><div class="v">${r.df > 0 ? f3(r.rmsea) : '\u2014'}</div></div>
          <div class="fit-cell"><div class="k">CFI</div><div class="v">${f3(Math.min(1, r.cfi))}</div></div>
          <div class="fit-cell"><div class="k">TLI</div><div class="v">${r.df > 0 ? f3(r.tli) : '\u2014'}</div></div>
          <div class="fit-cell"><div class="k">SRMR</div><div class="v">${f3(r.srmr)}</div></div>
        </div>
        <div class="fit-line">\u03c7\u00b2(${r.df}) = ${r.chisq.toFixed(2)}, p ${r.df > 0 ? (r.pvalue < 0.001 ? '< .001' : '= ' + fmtP(r.pvalue)) : '\u2014'}</div>
        <div class="fit-line">BIC = ${r.bic.toFixed(1)} \u00b7 ${r.npar} parameters</div>
      </div>
      <div class="rb">
        <div class="score-lines">
          <div class="score-line"><span>Fit${r.df > 0 && !fp.note ? ' (RMSEA ' + (fp.pts === 10 ? '< .05' : fp.pts === 5 ? '< .08' : '\u2265 .08') + ')' : ''}</span><b>+${fp.pts}</b></div>
          ${revisions ? `<div class="score-line"><span>Revisions (${revisions} \u00d7 \u2212${CONFIG.REFIT_COST})</span><b class="minus">\u2212${revisions * CONFIG.REFIT_COST}</b></div>` : ''}
          <div class="score-line"><span>Parsimony bonus</span><b>at lock-in</b></div>
        </div>
        <div class="res-btns">
          <button class="pill-btn ghost" id="res-revise" ${canRevise ? '' : 'disabled'}>${canRevise ? `Revise (\u2212${CONFIG.REFIT_COST})` : 'No fits left'}</button>
          <button class="pill-btn" id="res-lock">Lock in</button>
        </div>
        <div class="res-foot"><span>ML estimates \u00b7 N = ${CONFIG.N}</span><button class="link-btn" id="res-r">Check in R</button></div>
      </div>`;
    results.classList.remove('hidden', 'min');
    results.style.animation = 'none'; void results.offsetWidth; results.style.animation = '';
    $('res-revise').onclick = () => { SFX('click'); results.classList.add('min'); if (!isWide()) setTab('model'); };
    $('res-lock').onclick = () => { SFX('click'); lockIn(); };
    $('res-r').onclick = () => openRCode(rec.rcode);
  }

  // ------------------------------------------------------------------
  // Lock in + reveal
  // ------------------------------------------------------------------
  function lockIn() {
    const c = G.cur;
    if (!c.last || c.locked) return;
    c.locked = true;
    const rec = c.fits[c.fits.length - 1];
    const r = rec.res, tf = c.data.trueFit;
    const dBIC = r.bic - tf.bic;
    const pp = parsimonyPoints(dBIC);
    const revisions = c.fits.length - 1;
    const total = Math.max(0, rec.fp.pts + pp.pts - revisions * CONFIG.REFIT_COST);
    G.score += total;
    G.rounds.push({ model: c.model, rmsea: r.rmsea, df: r.df, fitPts: rec.fp.pts, parsPts: pp.pts, dBIC, revisions, total });
    canvasPane.classList.add('locked');
    setToolbarEnabled(false);
    updateHUD(); bumpScore();
    updateFitButton();
    updateModelInfo();

    // true model on the canvas
    const tv = $('truth-canvas');
    tv.classList.remove('hidden');
    $('truth-seg').classList.remove('hidden');
    setTruthShown(true);
    truthView.loadSpec(c.data.spec, c.data.model.L.length);
    truthView.setFitResult(FF.bank.trueEst(c.data.model, c.data.perm));
    if (!isWide()) setTab('model');

    const sign = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
    $('res-title').textContent = `Round ${c.idx + 1} · The true model`;
    resBody.innerHTML = `
      <div class="rb">
        <div class="truth-name">\u201c${c.model.name}\u201d</div>
        <div class="truth-note">${c.model.note} <span class="muted">The diagram shows the true population values.</span></div>
      </div>
      <div class="rb">
        <table class="cmp">
          <tr><th></th><th>YOU</th><th>TRUTH</th></tr>
          <tr><td>RMSEA</td><td>${r.df > 0 ? f3(r.rmsea) : '\u2014'}</td><td>${f3(tf.rmsea)}</td></tr>
          <tr><td>CFI</td><td>${f3(Math.min(1, r.cfi))}</td><td>${f3(Math.min(1, tf.cfi))}</td></tr>
          <tr><td>Parameters</td><td>${r.npar}</td><td>${tf.npar}</td></tr>
          <tr><td>BIC</td><td>${r.bic.toFixed(1)}</td><td>${tf.bic.toFixed(1)}</td></tr>
        </table>
      </div>
      <div class="rb">
        <div class="score-lines">
          <div class="score-line"><span>Fit: ${rec.fp.label.toLowerCase()}</span><b>+${rec.fp.pts}</b></div>
          <div class="score-line"><span>Parsimony (\u0394BIC ${sign(dBIC)})</span><b>+${pp.pts}</b></div>
          ${revisions ? `<div class="score-line"><span>Revisions</span><b class="minus">\u2212${revisions * CONFIG.REFIT_COST}</b></div>` : ''}
          <div class="score-line total"><span>Round score</span><b>${total} / ${MAX_ROUND}</b></div>
        </div>
        <div class="res-btns"><button class="pill-btn" id="res-next">${G.round + 1 >= CONFIG.ROUNDS ? 'See final score' : 'Next round \u25B8'}</button></div>
      </div>`;
    results.classList.remove('hidden', 'min');
    results.style.animation = 'none'; void results.offsetWidth; results.style.animation = '';
    $('res-next').onclick = () => { SFX('click'); nextRound(); };
    SFX('reveal');
    if (total >= MAX_ROUND - CONFIG.REFIT_COST) setTimeout(() => SFX('coin'), 450);
  }

  function setTruthShown(show) {
    $('truth-canvas').classList.toggle('hidden', !show);
    document.querySelectorAll('#truth-seg button').forEach(b => b.classList.toggle('on', (b.dataset.show === 'truth') === show));
    if (show) requestAnimationFrame(() => truthView.render());
  }

  function nextRound() {
    if (G.round + 1 >= CONFIG.ROUNDS) { showFinal(); return; }
    startRound(G.round + 1);
  }

  // ------------------------------------------------------------------
  // Final screen
  // ------------------------------------------------------------------
  function rankFor(score) {
    const max = CONFIG.ROUNDS * MAX_ROUND;
    const f = score / max;
    if (f >= 0.9) return 'Thurstone would be proud';
    if (f >= 0.75) return 'Factor whisperer';
    if (f >= 0.55) return 'Solid modeler';
    if (f >= 0.35) return 'Promising apprentice';
    return 'Back to the scree plot';
  }
  function showFinal() {
    const max = CONFIG.ROUNDS * MAX_ROUND;
    $('final-score').innerHTML = `${G.score}<small> / ${max}</small>`;
    $('final-rank').textContent = rankFor(G.score);
    const rows = G.rounds.map((r, k) => `<tr><td>${k + 1}</td><td>${r.model.name}</td><td>${r.df > 0 ? f3(r.rmsea) : '—'}</td><td>${r.fitPts}</td><td>${r.parsPts}</td><td>${r.revisions ? '−' + r.revisions * CONFIG.REFIT_COST : '0'}</td><td>${r.total}</td></tr>`).join('');
    $('final-table').innerHTML = `<tr><th>#</th><th>TRUE MODEL</th><th>RMSEA</th><th>FIT</th><th>PARSIMONY</th><th>REVISIONS</th><th>POINTS</th></tr>${rows}<tr class="sum"><td></td><td>Total</td><td></td><td></td><td></td><td></td><td>${G.score}</td></tr>`;
    showOverlay('screen-final');
    G.screen = 'final';
    SFX('close');
  }

  // ------------------------------------------------------------------
  // Overlays, tabs, R code
  // ------------------------------------------------------------------
  function showOverlay(id) {
    for (const o of ['screen-title', 'screen-final']) $(o).classList.toggle('show', o === id);
  }
  function isWide() { return !global.matchMedia('(max-width: 860px), (max-aspect-ratio: 4/5)').matches; }
  function setTab(t) {
    G.tab = t;
    document.body.classList.toggle('tab-data', t === 'data');
    document.body.classList.toggle('tab-model', t === 'model');
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'data') markTabDot(false);
    requestAnimationFrame(() => { if (G.cur) { renderDash(); editor.render(); if (!$('truth-canvas').classList.contains('hidden')) truthView.render(); } });
  }
  function markTabDot(on) {
    const b = document.querySelector('#tabs button[data-tab="data"]');
    const dot = b.querySelector('.dot');
    if (on && !dot) { const s = document.createElement('span'); s.className = 'dot'; b.appendChild(s); }
    if (!on && dot) dot.remove();
  }
  function openRCode(code) {
    $('r-code').value = code;
    $('modal-r').classList.add('show');
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------
  $('btn-play').addEventListener('click', () => {
    SFX('click');
    global.GaltonAudio && global.GaltonAudio.ensure();
    if (!G.tutorialSeen) {
      FF.tutorial.show({ onDismiss: () => { G.tutorialSeen = true; startGame(); } });
    } else startGame();
  });
  $('btn-help').addEventListener('click', () => { SFX('click'); FF.tutorial.show({ popup: true }); });
  $('btn-home').addEventListener('click', () => {
    SFX('click');
    if (G.screen === 'game') $('modal-quit').classList.add('show');
  });
  $('quit-stay').addEventListener('click', () => $('modal-quit').classList.remove('show'));
  $('quit-leave').addEventListener('click', () => {
    $('modal-quit').classList.remove('show');
    G.screen = 'title'; showOverlay('screen-title');
  });
  $('btn-again').addEventListener('click', () => { SFX('click'); startGame(); });
  $('btn-final-home').addEventListener('click', () => { SFX('click'); G.screen = 'title'; showOverlay('screen-title'); });
  $('r-close').addEventListener('click', () => $('modal-r').classList.remove('show'));
  $('modal-r').addEventListener('click', (e) => { if (e.target.id === 'modal-r') $('modal-r').classList.remove('show'); });
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

  document.querySelectorAll('#view-seg button').forEach(b => b.addEventListener('click', () => { SFX('click'); setView(b.dataset.view); }));
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { SFX('click'); setTab(b.dataset.tab); }));
  document.querySelectorAll('#truth-seg button').forEach(b => b.addEventListener('click', () => { SFX('click'); setTruthShown(b.dataset.show === 'truth'); }));

  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
    SFX('click');
    if (b.dataset.tool === 'factor' && editor.selection().items.length) { editor.factorFromSelection(); editor.setTool('select'); return; }
    editor.setTool(b.dataset.tool);
  }));
  $('btn-undo').addEventListener('click', () => { SFX('click'); editor.undo(); });
  $('btn-tidy').addEventListener('click', () => { SFX('click'); editor.tidy(); });
  $('btn-values').addEventListener('click', () => {
    editor.showValues = !editor.showValues;
    truthView.showValues = editor.showValues;
    $('btn-values').classList.toggle('on', editor.showValues);
  });
  $('btn-values').classList.add('on');
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
  $('res-min').addEventListener('click', () => { SFX('click'); results.classList.toggle('min'); });

  document.addEventListener('keydown', (e) => {
    if (G.screen !== 'game') return;
    if (FF.tutorial.isOpen() || $('modal-r').classList.contains('show') || $('modal-quit').classList.contains('show')) return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (!G.cur.locked) editor.undo(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'enter') { e.preventDefault(); onFitButton(); return; }
    if (G.cur && G.cur.locked) return;
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
      if (G.cur) { renderDash(); editor.render(); if (!$('truth-canvas').classList.contains('hidden')) truthView.render(); }
    });
  };
  if (global.ResizeObserver) {
    const ro = new ResizeObserver(onResize);
    ro.observe(dashGrid); ro.observe(canvasWrap);
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

  FF.game.CONFIG = CONFIG;
  FF.game.debug = { startGame, startRound, lockIn, editor, truthView, showFinal };
})(window);
