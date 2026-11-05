// FACTOR LAB — dashboard plots drawn as SVG, styled after qgraph
// (theme = "colorblind", cut = 0): scree plot, correlation heatmap,
// correlation network and partial-correlation network.
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const NS = 'http://www.w3.org/2000/svg';

  // qgraph theme = "colorblind" edge colours
  const POS = '#0000D5';
  const NEG = '#BF0000';

  // ------------------------------------------------------------------
  // colour helpers (qgraph's Fade(): mix colour with background)
  // ------------------------------------------------------------------
  function hexToRgb(h) {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  }
  function fade(col, alpha, bg) {
    const c = hexToRgb(col), b = hexToRgb(bg || '#FFFFFF');
    const a = Math.max(0, Math.min(1, alpha));
    return rgbToHex(c[0] * a + b[0] * (1 - a), c[1] * a + b[1] * (1 - a), c[2] * a + b[2] * (1 - a));
  }
  function weightColor(w, maximum, bg) {
    const a = maximum > 0 ? Math.abs(w) / maximum : 0;
    return fade(w >= 0 ? POS : NEG, a, bg);
  }

  // ------------------------------------------------------------------
  // qgraph spring layout: a direct port of qgraph_layout_Cpp
  // (Fruchterman-Reingold, qgraph defaults for layout = "spring").
  // ------------------------------------------------------------------
  function fround(x, d) { const f = Math.pow(10, d); return Math.round(x * f) / f; }

  // opts: { init: raw positions to start from (warm start), niter, maxdelta,
  //         nref: node count used for the force constants (default n),
  //         pinned: nodes that keep their position }
  // returns raw (unscaled) positions; springLayout() = qgraph defaults + rescale
  function springRaw(W, opts) {
    opts = opts || {};
    const n = W.length;
    const Ef = [], Et = [], Wt = [];
    let maxW = 0;
    // qgraph extracts the upper triangle in column-major order
    for (let j = 0; j < n; j++) for (let i = 0; i < j; i++) {
      if (W[i][j] !== 0) { Ef.push(i); Et.push(j); Wt.push(W[i][j]); maxW = Math.max(maxW, Math.abs(W[i][j])); }
    }
    const weights = Wt.map(w => fround(Math.pow(Math.abs(w / maxW), 2), 5));
    const nr = opts.nref || n;
    const niter = opts.niter || 500, area = nr * nr, coolexp = 1.5, repulserad = Math.pow(nr, 3);
    const maxdelta = opts.maxdelta || nr;
    const x = [], y = [];
    for (let i = 0; i < n; i++) {
      if (opts.init) { x.push(opts.init[i][0]); y.push(opts.init[i][1]); }
      else { x.push(fround(Math.sin(2 * Math.PI * i / n), 5)); y.push(fround(Math.cos(2 * Math.PI * i / n), 5)); }
    }
    const frk = Math.sqrt(area / nr);
    const dx = new Array(n), dy = new Array(n);
    const m = Ef.length;
    for (let it = niter; it >= 0; it--) {
      dx.fill(0); dy.fill(0);
      const t = maxdelta * Math.pow(it / niter, coolexp);
      for (let j = 0; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          let xd = x[j] - x[k], yd = y[j] - y[k];
          const ded = Math.sqrt(xd * xd + yd * yd) || 1e-6;
          xd /= ded; yd /= ded;
          const rf = frk * frk * (1 / ded - ded * ded / repulserad);
          dx[j] += xd * rf; dx[k] -= xd * rf;
          dy[j] += yd * rf; dy[k] -= yd * rf;
        }
      }
      for (let e = 0; e < m; e++) {
        const k = Ef[e], l = Et[e];
        let xd = x[k] - x[l], yd = y[k] - y[l];
        const ded = Math.sqrt(xd * xd + yd * yd);
        if (Math.abs(ded) > 0.000001) { xd /= ded; yd /= ded; }
        const af = ded * ded / frk * weights[e];
        dx[k] -= xd * af; dx[l] += xd * af;
        dy[k] -= yd * af; dy[l] += yd * af;
      }
      for (let j = 0; j < n; j++) {
        if (opts.pinned && opts.pinned[j]) continue;
        let ded = Math.sqrt(dx[j] * dx[j] + dy[j] * dy[j]);
        if (ded > t) { ded = t / ded; dx[j] *= ded; dy[j] *= ded; }
        x[j] += fround(dx[j], 5);
        y[j] += fround(dy[j], 5);
      }
    }
    return x.map((xi, i) => [xi, y[i]]);
  }
  function springLayout(W) { return rescale(springRaw(W)); }

  // LEARN: continue the same force layout from the current (raw) positions,
  // so nodes only move as far as the new weights push them. Not identical to
  // qgraph's from-scratch layout.
  // nref keeps the force constants fixed when items are added or removed.
  function springLayoutWarm(W, initRaw, nref, pinned) {
    const nr = nref || W.length;
    const raw = springRaw(W, { init: initRaw, niter: 300, maxdelta: 0.3 * nr, nref: nr, pinned });
    return { raw, layout: rescale(raw) };
  }
  function rescale(L) {
    const xs = L.map(p => p[0]), ys = L.map(p => p[1]);
    const rx = [Math.min(...xs), Math.max(...xs)], ry = [Math.min(...ys), Math.max(...ys)];
    const sx = v => (rx[1] - rx[0] > 1e-12 ? (v - rx[0]) / (rx[1] - rx[0]) * 2 - 1 : 0);
    const sy = v => (ry[1] - ry[0] > 1e-12 ? (v - ry[0]) / (ry[1] - ry[0]) * 2 - 1 : 0);
    return L.map(([a, b]) => [sx(a), sy(b)]);
  }

  // ------------------------------------------------------------------
  // SVG helpers
  // ------------------------------------------------------------------
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function size(svg) {
    const r = svg.getBoundingClientRect();
    return { w: Math.max(40, r.width), h: Math.max(40, r.height) };
  }
  function fmt2(v) {
    const s = Math.abs(v).toFixed(2).replace(/^0/, '');
    return (v < -0.005 ? '−' : '') + s;
  }

  // ------------------------------------------------------------------
  // Network (qgraph look). W: weights matrix, layout in [-1,1]^2.
  // opts: { maximum, labels, highlight: Set of node idx, onHover }
  // ------------------------------------------------------------------
  function network(svg, W, layout, opts) {
    opts = opts || {};
    clear(svg);
    const { w, h } = size(svg);
    const n = W.length;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const side = Math.min(w, h);
    const cx = w / 2, cy = h / 2;
    // qgraph: vsize = 8*exp(-n/80)+1 (percent of the plot width); r = half the node width
    const vsize = 8 * Math.exp(-n / 80) + 1;
    const r = side * vsize / 200;
    const half = side / 2 - r - side * 0.06;
    const P = layout.map(([x, y]) => [cx + x * half, cy - y * half]);
    // edges
    const edges = [];
    let maximum = opts.maximum;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const v = W[i][j];
      if (Math.abs(v) > 1e-12) edges.push([i, j, v]);
    }
    if (!(maximum > 0)) maximum = Math.max(1e-9, ...edges.map(e => Math.abs(e[2])));
    // esize = 15*exp(-n/90)+1 (lwd units); scale to panel size
    const esize = (15 * Math.exp(-n / 90) + 1) * 0.75 * side / 450;
    edges.sort((a, b) => Math.abs(a[2]) - Math.abs(b[2]));
    const gE = el('g', { class: 'net-edges' }, svg);
    for (const [i, j, v] of edges) {
      const a = Math.min(1, Math.abs(v) / maximum);
      const width = Math.max(1, a * (esize - 1) + 1);
      // centre to centre: the (opaque) nodes drawn afterwards hide the line ends
      const [x1, y1] = P[i], [x2, y2] = P[j];
      const line = el('line', {
        x1, y1, x2, y2,
        stroke: weightColor(v, maximum), 'stroke-width': width.toFixed(2),
        'stroke-linecap': 'butt', class: 'net-edge',
      }, gE);
      line.dataset.i = i; line.dataset.j = j; line.dataset.v = v;
      if (opts.onHover) {
        line.addEventListener('pointerenter', (e) => opts.onHover({ i, j, v }, e));
        line.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') opts.onHover(null); });
      }
    }
    const gN = el('g', { class: 'net-nodes' }, svg);
    const fs = Math.max(8, r * 0.72);
    P.forEach(([x, y], i) => {
      const g = el('g', { class: 'net-node' + (opts.highlight && opts.highlight.has(i) ? ' hl' : '') }, gN);
      // square nodes, like the items in the path diagram
      el('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, fill: '#FFFFFF', stroke: '#000000', 'stroke-width': Math.max(0.75, side / 600), class: 'net-shape' }, g);
      const t = el('text', { x, y, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'net-label' }, g);
      t.textContent = opts.labels ? opts.labels[i] : String(i + 1);
    });
    return { maximum };
  }

  // ------------------------------------------------------------------
  // Heatmap: blue positive / red negative, intensity |r| / maximum.
  // ------------------------------------------------------------------
  // opts: { maximum, values, labels, onHover,
  //         order: display order of the items (array of indices),
  //         onReorder(newOrder): makes the row / column labels draggable;
  //         dragging a label moves that item's row and column together }
  function heatmap(svg, M, opts) {
    opts = opts || {};
    clear(svg);
    const { w, h } = size(svg);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const n = M.length;
    const order = opts.order && opts.order.length === n ? opts.order : [...Array(n).keys()];
    const maximum = opts.maximum || 1;
    const padL = Math.max(14, Math.min(w, h) * 0.07), padT = padL;
    const avail = Math.min(w - padL - 6, h - padT - 6);
    const cell = avail / n;
    const ox = padL + (w - padL - 6 - avail) / 2, oy = padT + (h - padT - 6 - avail) / 2;
    const showVals = cell >= 26 && opts.values !== false;
    const drag = svg._hmDrag || null;                 // item being dragged (survives re-renders)
    const g = el('g', {}, svg);
    const lab = el('g', { class: 'hm-labels' }, svg);
    const lfs = Math.max(9, Math.min(14, cell * 0.42));
    const name = (it) => (opts.labels ? opts.labels[it] : String(it + 1));
    for (let r = 0; r < n; r++) {
      const it = order[r], dc = drag && drag.k === it ? ' dragging' : '';
      const tl = el('text', { x: ox + (r + 0.5) * cell, y: oy - 5, 'font-size': lfs, 'text-anchor': 'middle', 'data-k': it, class: dc.trim() }, lab);
      tl.textContent = name(it);
      const tr = el('text', { x: ox - 5, y: oy + (r + 0.5) * cell, 'font-size': lfs, 'text-anchor': 'end', 'dominant-baseline': 'central', 'data-k': it, class: dc.trim() }, lab);
      tr.textContent = name(it);
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = order[r], j = order[c];
      const x = ox + c * cell, y = oy + r * cell;
      const diag = i === j;
      const v = M[i][j];
      const rect = el('rect', {
        x: x + 0.5, y: y + 0.5, width: cell - 1, height: cell - 1, rx: Math.min(3, cell * 0.08),
        fill: diag ? '#EEEDE8' : weightColor(Math.max(-maximum, Math.min(maximum, v)), maximum),
        class: 'hm-cell' + (diag ? ' diag' : '') + (drag && (drag.k === i || drag.k === j) ? ' hm-drag-line' : ''),
      }, g);
      rect.dataset.i = i; rect.dataset.j = j;
      if (!diag && opts.onHover) {
        rect.addEventListener('pointerenter', (e) => { if (!svg._hmDrag) opts.onHover({ i, j, v }, e); });
        rect.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !svg._hmDrag) opts.onHover(null); });
      }
      if (showVals && !diag) {
        const a = Math.abs(v) / maximum;
        const t = el('text', {
          x: x + cell / 2, y: y + cell / 2, 'font-size': Math.min(13, cell * 0.34),
          'text-anchor': 'middle', 'dominant-baseline': 'central',
          fill: a > 0.55 ? '#FFFFFF' : '#2B2F36', class: 'hm-val', 'data-i': i, 'data-j': j,
        }, g);
        t.textContent = fmt2(v);
      }
    }
    svg._hm = { opts, order, ox, oy, cell, n, padL, band: lfs + 9 };
    svg.classList.toggle('hm-reorderable', !!opts.onReorder);
    placeStrips(svg);
  }

  // Row / column numbers are dragged through two invisible HTML strips laid
  // over them (HTML so that touch-action: none works on phones, and they
  // survive re-renders so the pointer stays captured). Dragging moves the
  // item to the slot under the pointer, live.
  function placeStrips(svg) {
    const st = svg._hm, host = svg.parentNode;
    if (!host) return;
    if (!svg._hmStrips) {
      svg._hmStrips = ['x', 'y'].map(axis => {
        const d = document.createElement('div');
        d.className = 'hm-strip ' + axis;
        d.title = 'Drag a number to move that item';
        host.appendChild(d);
        bindStrip(svg, d, axis);
        return d;
      });
    }
    const [sx, sy] = svg._hmStrips;
    const on = !!st.opts.onReorder;
    sx.hidden = sy.hidden = !on;
    if (!on) return;
    const r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const L = r.left - hr.left, T = r.top - hr.top;
    Object.assign(sx.style, { left: L + st.ox + 'px', top: T + st.oy - st.band + 'px', width: st.cell * st.n + 'px', height: st.band + 'px' });
    Object.assign(sy.style, { left: L + st.ox - st.padL + 'px', top: T + st.oy + 'px', width: st.padL + 'px', height: st.cell * st.n + 'px' });
  }
  function bindStrip(svg, strip, axis) {
    const slotAt = (e) => {
      const st = svg._hm, r = svg.getBoundingClientRect();
      const pos = axis === 'x' ? e.clientX - r.left - st.ox : e.clientY - r.top - st.oy;
      return Math.max(0, Math.min(st.n - 1, Math.floor(pos / st.cell)));
    };
    strip.addEventListener('pointerdown', (e) => {
      const st = svg._hm;
      if (!st || !st.opts.onReorder) return;
      e.preventDefault(); e.stopPropagation();
      try { strip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      svg._hmDrag = { k: st.order[slotAt(e)], id: e.pointerId };
      svg.classList.add('hm-dragging');
      if (st.opts.onHover) st.opts.onHover(null);
      st.opts.onReorder(st.order.slice(), true);         // re-render with the drag highlight
    });
    strip.addEventListener('pointermove', (e) => {
      const st = svg._hm, d = svg._hmDrag;
      if (!st || !d || e.pointerId !== d.id) return;
      const slot = slotAt(e), cur = st.order.indexOf(d.k);
      if (slot === cur) return;
      const o = st.order.slice();
      o.splice(cur, 1); o.splice(slot, 0, d.k);
      st.opts.onReorder(o, true);
    });
    const end = (e) => {
      const st = svg._hm, d = svg._hmDrag;
      if (!d || e.pointerId !== d.id) return;
      svg._hmDrag = null;
      svg.classList.remove('hm-dragging');
      if (st) st.opts.onReorder(st.order.slice(), false);
    };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------------
  // Scree plot. series: [{ values, color, dash, label }]
  // ------------------------------------------------------------------
  function scree(svg, series, opts) {
    opts = opts || {};
    clear(svg);
    const { w, h } = size(svg);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const n = series[0].values.length;
    const fs = Math.max(9, Math.min(12, w / 30));
    const padL = fs * 3.9, padB = fs * 3.1, padT = fs * 1.2, padR = fs * 1.2;
    const yMax = Math.max(1.5, Math.ceil(Math.max(...series.flatMap(s => s.values)) + 0.25));
    const X = k => padL + (n === 1 ? 0.5 : k / (n - 1)) * (w - padL - padR);
    const Y = v => padT + (1 - v / yMax) * (h - padT - padB);
    const ax = el('g', { class: 'scree-axes' }, svg);
    // y gridlines/ticks
    const step = yMax > 4 ? 1 : 0.5;
    for (let v = 0; v <= yMax + 1e-9; v += step) {
      el('line', { x1: padL, x2: w - padR, y1: Y(v), y2: Y(v), class: 'grid' }, ax);
      const t = el('text', { x: padL - 6, y: Y(v), 'font-size': fs, 'text-anchor': 'end', 'dominant-baseline': 'central' }, ax);
      t.textContent = Number.isInteger(v) ? String(v) : v.toFixed(1);
    }
    for (let k = 0; k < n; k++) {
      const t = el('text', { x: X(k), y: h - padB + fs * 1.3, 'font-size': fs, 'text-anchor': 'middle' }, ax);
      t.textContent = String(k + 1);
    }
    el('line', { x1: padL, x2: padL, y1: padT, y2: h - padB, class: 'axis' }, ax);
    el('line', { x1: padL, x2: w - padR, y1: h - padB, y2: h - padB, class: 'axis' }, ax);
    const xl = el('text', { x: (padL + w - padR) / 2, y: h - fs * 0.5, 'font-size': fs, 'text-anchor': 'middle', class: 'axis-title' }, ax);
    xl.textContent = 'Factor number';
    const yl = el('text', { x: fs * 0.95, y: (padT + h - padB) / 2, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'axis-title', transform: `rotate(-90 ${fs * 0.95} ${(padT + h - padB) / 2})` }, ax);
    yl.textContent = 'Eigenvalue';
    // Kaiser line
    el('line', { x1: padL, x2: w - padR, y1: Y(1), y2: Y(1), class: 'kaiser' }, ax);
    if (series.length > 1) {
      const lg = el('g', { class: 'scree-legend' }, svg);
      series.forEach((s, k) => {
        const ly = padT + fs * 0.6 + k * fs * 1.5, lx = w - padR - fs * 6.2;
        el('line', { x1: lx, x2: lx + fs * 1.8, y1: ly, y2: ly, stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || 'none' }, lg);
        el('circle', { cx: lx + fs * 0.9, cy: ly, r: (s.r || 4) * 0.8, fill: s.fill || '#FFFFFF', stroke: s.color, 'stroke-width': 1.6 }, lg);
        const t = el('text', { x: lx + fs * 2.3, y: ly, 'font-size': fs, 'dominant-baseline': 'central' }, lg);
        t.textContent = s.label;
      });
    }
    for (const s of series) {
      const g = el('g', { class: 'scree-series' }, svg);
      const d = s.values.map((v, k) => (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || 'none', 'stroke-linejoin': 'round' }, g);
      s.values.forEach((v, k) => {
        const c = el('circle', { cx: X(k), cy: Y(v), r: s.r || 4, fill: s.fill || '#FFFFFF', stroke: s.color, 'stroke-width': 2 }, g);
        if (opts.onHover) {
          c.addEventListener('pointerenter', (e) => opts.onHover({ k, v, label: s.label }, e));
          c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') opts.onHover(null); });
        }
      });
    }
  }

  FF.plots = { POS, NEG, fade, weightColor, springLayout, springRaw, springLayoutWarm, rescale, network, heatmap, scree, fmt2, el, clear };
})(typeof window !== 'undefined' ? window : globalThis);
