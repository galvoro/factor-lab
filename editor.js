// FACTOR FIND — path-diagram editor (SVG).
//
// Items are squares labelled 1..p, factors are unlabelled circles.
//   load : factor -> item     (factor loading)
//   reg  : factor -> factor   (regression between factors)
//   cov  : item <-> item (residual covariance) or factor <-> factor
// Coordinates are stored normalised to the canvas (0..1) so the diagram
// survives resizes. After a fit, paths are coloured like semPlot /
// qgraph theme = "colorblind" (blue +, red -) with width ~ |standardized|.
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#2B2F36';

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const hyp = Math.hypot;

  function create(svg, opts) {
    opts = opts || {};
    const isStatic = !!opts.static;
    const S = {
      obs: [], lat: [], edges: [], nextLat: 1, nextEdge: 1,
      sel: new Set(),          // ids of selected nodes / edges
      tool: 'select',
      fit: null,               // map edge id -> { std, est }, plus resid
      stale: false,
      showValues: true,
      history: [],
      hl: new Set(),           // highlighted obs indices (from dashboard hover)
    };
    let W = 600, H = 400;
    let drag = null;           // current pointer interaction
    let pending = null;        // tap-tap connection source id
    let anim = null;

    // ---------------- geometry ----------------
    function dims() {
      const p = Math.max(S.obs.length, 1);
      const side = Math.max(26, Math.min(48, W / (p + 2.2), H / 7));
      return { side, half: side / 2, R: side * 0.66 };
    }
    function px(n) { return [n.x * W, n.y * H]; }
    function node(id) { return S.obs.find(o => o.id === id) || S.lat.find(l => l.id === id); }
    function isLat(id) { return id && id[0] === 'f'; }
    function boundary(n, ux, uy) {
      const d = dims();
      const [x, y] = px(n);
      if (n.kind === 'lat') return [x + ux * d.R, y + uy * d.R];
      const k = d.half / Math.max(Math.abs(ux), Math.abs(uy), 1e-9);
      return [x + ux * k, y + uy * k];
    }
    function centroid() {
      const all = S.obs.concat(S.lat);
      let x = 0, y = 0;
      for (const n of all) { x += n.x * W; y += n.y * H; }
      return [x / all.length, y / all.length];
    }

    // ---------------- state helpers ----------------
    function snapshot() {
      return JSON.stringify({ obs: S.obs, lat: S.lat, edges: S.edges, nextLat: S.nextLat, nextEdge: S.nextEdge });
    }
    function pushHistory() {
      S.history.push(snapshot());
      if (S.history.length > 80) S.history.shift();
    }
    function restore(js) {
      const o = JSON.parse(js);
      S.obs = o.obs; S.lat = o.lat; S.edges = o.edges; S.nextLat = o.nextLat; S.nextEdge = o.nextEdge;
      S.sel.clear();
    }
    function changed(structural) {
      if (structural) { S.stale = true; }
      render();
      if (opts.onChange) opts.onChange({ structural });
    }
    function msg(text, kind) { if (opts.onMessage) opts.onMessage(text, kind || 'info'); }

    function edgeExists(kind, a, b) {
      return S.edges.some(e => e.kind === kind && ((e.a === a && e.b === b) || (kind === 'cov' && e.a === b && e.b === a)));
    }
    function createsCycle(from, to) {
      // adding from -> to; cycle if `from` reachable from `to`
      const stack = [to], seen = new Set();
      while (stack.length) {
        const v = stack.pop();
        if (v === from) return true;
        if (seen.has(v)) continue;
        seen.add(v);
        for (const e of S.edges) if (e.kind === 'reg' && e.a === v) stack.push(e.b);
      }
      return false;
    }
    function isEndogenous(id) { return S.edges.some(e => e.kind === 'reg' && e.b === id); }

    function addEdge(kind, a, b, silent) {
      if (a === b) return false;
      if (kind === 'arrow') {
        if (!isLat(a) && !isLat(b)) { msg('Arrows between items are not part of a factor model. Use ↔ for a residual correlation.', 'warn'); return false; }
        if (!isLat(a) && isLat(b)) { const t = a; a = b; b = t; msg('Arrows point from a factor to its items — reversed for you.', 'info'); }
        kind = isLat(b) ? 'reg' : 'load';
        if (kind === 'reg') {
          if (edgeExists('reg', a, b)) return false;
          if (createsCycle(a, b)) { msg('That would create a feedback loop between factors.', 'warn'); return false; }
        } else if (edgeExists('load', a, b)) { msg('That loading already exists.', 'info'); return false; }
      } else {
        if (isLat(a) !== isLat(b)) { msg('A covariance connects two items (residual correlation) or two factors.', 'warn'); return false; }
        if (edgeExists('cov', a, b)) { msg('That covariance already exists.', 'info'); return false; }
      }
      if (!silent) pushHistory();
      S.edges.push({ id: 'e' + (S.nextEdge++), kind, a, b });
      if (!silent) { GA('connect'); changed(true); }
      return true;
    }
    function removeIds(ids) {
      if (!ids.length) return;
      pushHistory();
      const set = new Set(ids);
      S.lat = S.lat.filter(l => !set.has(l.id));
      const latIds = new Set(S.lat.map(l => l.id));
      S.edges = S.edges.filter(e => !set.has(e.id) && (!isLat(e.a) || latIds.has(e.a)) && (!isLat(e.b) || latIds.has(e.b)));
      S.sel.clear();
      GA('erase');
      changed(true);
    }
    function addFactor(x, y, items) {
      pushHistory();
      // keep the new factor clear of existing ones
      const d = dims();
      for (let tries = 0; tries < 12; tries++) {
        const clash = S.lat.some(l => hyp((l.x - x) * W, (l.y - y) * H) < d.R * 2.4);
        if (!clash) break;
        x = Math.min(0.94, x + (d.R * 2.6) / W);
        if (x >= 0.94) { x = 0.08; y = Math.max(0.08, y - (d.R * 2.6) / H); }
      }
      const id = 'f' + (S.nextLat++);
      // new factors correlate with existing exogenous factors (lavaan cfa() default)
      const others = S.lat.filter(l => !isEndogenous(l.id)).map(l => l.id);
      S.lat.push({ id, kind: 'lat', x, y });
      for (const o of others) S.edges.push({ id: 'e' + (S.nextEdge++), kind: 'cov', a: o, b: id });
      for (const it of items || []) S.edges.push({ id: 'e' + (S.nextEdge++), kind: 'load', a: id, b: it });
      S.sel.clear();
      GA('place');
      changed(true);
      return id;
    }

    function GA(name) { const a = global.GaltonAudio; if (a && a.SFX && a.SFX[name]) a.SFX[name](); }

    // ---------------- spec for the estimator ----------------
    function getSpec() {
      const facIdx = {}; S.lat.forEach((l, j) => { facIdx[l.id] = j; });
      const obsIdx = {}; S.obs.forEach(o => { obsIdx[o.id] = o.idx; });
      const spec = { p: S.obs.length, m: S.lat.length, loadings: [], regressions: [], factorCovs: [], residCovs: [] };
      const edgeParam = {};
      for (const e of S.edges) {
        if (e.kind === 'load') { spec.loadings.push([obsIdx[e.b], facIdx[e.a]]); edgeParam[e.id] = { mat: 'L', r: obsIdx[e.b], c: facIdx[e.a] }; }
        else if (e.kind === 'reg') { spec.regressions.push([facIdx[e.b], facIdx[e.a]]); edgeParam[e.id] = { mat: 'B', r: facIdx[e.b], c: facIdx[e.a] }; }
        else if (isLat(e.a)) {
          const a = facIdx[e.a], b = facIdx[e.b];
          spec.factorCovs.push([a, b]); edgeParam[e.id] = { mat: 'P', r: Math.max(a, b), c: Math.min(a, b) };
        } else {
          const a = obsIdx[e.a], b = obsIdx[e.b];
          spec.residCovs.push([a, b]); edgeParam[e.id] = { mat: 'T', r: Math.max(a, b), c: Math.min(a, b) };
        }
      }
      const key = JSON.stringify({
        m: spec.m,
        l: spec.loadings.map(String).sort(), r: spec.regressions.map(String).sort(),
        f: spec.factorCovs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join()).sort(),
        t: spec.residCovs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join()).sort(),
      });
      return { spec, edgeParam, key, factorIds: S.lat.map(l => l.id) };
    }

    function setFitResult(result) {
      if (!result) { S.fit = null; render(); return; }
      const { edgeParam } = getSpec();
      const map = {};
      const find = (q) => result.est.find(e => e.mat === q.mat && e.r === q.r && e.c === q.c);
      for (const id in edgeParam) { const e = find(edgeParam[id]); if (e) map[id] = e; }
      const resid = {};
      for (const o of S.obs) { const e = find({ mat: 'T', r: o.idx, c: o.idx }); if (e) resid[o.idx] = e; }
      S.fit = { map, resid };
      S.stale = false;
      render();
    }

    // ---------------- rendering ----------------
    const defs = el('defs', {}, svg);
    const gEdges = el('g', { class: 'd-edges' }, svg);
    const gLabels = el('g', { class: 'd-elabels' }, svg);
    const gNodes = el('g', { class: 'd-nodes' }, svg);
    const gOver = el('g', { class: 'd-overlay' }, svg);

    function measure() {
      const r = svg.getBoundingClientRect();
      W = Math.max(120, r.width); H = Math.max(120, r.height);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    }

    function arrowHead(parent, tip, ux, uy, size, color) {
      const [tx, ty] = tip;
      const bx = tx - ux * size, by = ty - uy * size;
      const w = size * 0.45;
      el('path', {
        d: `M${tx},${ty} L${bx - uy * w},${by + ux * w} L${bx + uy * w},${by - ux * w} Z`,
        fill: color, class: 'd-head',
      }, parent);
    }

    function edgeStyle(e) {
      const fe = S.fit && !S.stale ? S.fit.map[e.id] : null;
      if (!fe) return { color: INK, width: 2, std: null };
      const P = FF.plots;
      const a = Math.min(1, Math.abs(fe.std));
      const color = P.fade(fe.std >= 0 ? P.POS : P.NEG, Math.max(0.22, a));
      const esize = Math.max(6, dims().side * 0.2);
      return { color, width: 1.2 + a * (esize - 1.2), std: fe.std };
    }

    function covControl(A, B, e) {
      const [ax, ay] = px(A), [bx, by] = px(B);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay, L = hyp(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      // bend away from the nodes these two are attached to (or the centroid)
      let ref = null;
      const nbr = [];
      for (const f of S.edges) {
        if (f === e) continue;
        if (f.kind === 'load' && (f.b === A.id || f.b === B.id)) nbr.push(node(f.a));
        if ((f.kind === 'load' || f.kind === 'reg') && (f.a === A.id || f.a === B.id)) nbr.push(node(f.b));
      }
      const pts = nbr.filter(Boolean).filter(n => n.id !== A.id && n.id !== B.id);
      if (pts.length) {
        ref = [pts.reduce((s, n) => s + n.x * W, 0) / pts.length, pts.reduce((s, n) => s + n.y * H, 0) / pts.length];
      } else ref = centroid();
      if ((ref[0] - mx) * nx + (ref[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
      if (Math.abs(ref[0] - mx) < 1e-6 && Math.abs(ref[1] - my) < 1e-6) { nx = 0; ny = isLat(A.id) ? -1 : 1; }
      const bend = 0.28 * L + dims().side * 0.55;
      return [mx + nx * bend, my + ny * bend];
    }

    function drawEdge(e) {
      const A = node(e.a), B = node(e.b);
      if (!A || !B) return;
      const st = edgeStyle(e);
      const g = el('g', { class: 'd-edge' + (S.sel.has(e.id) ? ' sel' : ''), 'data-id': e.id }, gEdges);
      const head = Math.max(9, dims().side * 0.24) + st.width * 0.9;
      let pathD, labelPos;
      if (e.kind === 'cov') {
        const C = covControl(A, B, e);
        const [ax, ay] = px(A), [bx, by] = px(B);
        let u1 = [C[0] - ax, C[1] - ay]; let l1 = hyp(...u1) || 1; u1 = [u1[0] / l1, u1[1] / l1];
        let u2 = [C[0] - bx, C[1] - by]; let l2 = hyp(...u2) || 1; u2 = [u2[0] / l2, u2[1] / l2];
        const s = boundary(A, u1[0], u1[1]), t = boundary(B, u2[0], u2[1]);
        const s2 = [s[0] + u1[0] * head * 0.85, s[1] + u1[1] * head * 0.85];
        const t2 = [t[0] + u2[0] * head * 0.85, t[1] + u2[1] * head * 0.85];
        pathD = `M${s2[0]},${s2[1]} Q${C[0]},${C[1]} ${t2[0]},${t2[1]}`;
        el('path', { d: `M${s[0]},${s[1]} Q${C[0]},${C[1]} ${t[0]},${t[1]}`, class: 'd-hit' }, g);
        el('path', { d: pathD, fill: 'none', stroke: st.color, 'stroke-width': st.width, class: 'd-line' }, g);
        arrowHead(g, s, -u1[0], -u1[1], head, st.color);
        arrowHead(g, t, -u2[0], -u2[1], head, st.color);
        labelPos = [0.25 * s[0] + 0.5 * C[0] + 0.25 * t[0], 0.25 * s[1] + 0.5 * C[1] + 0.25 * t[1]];
      } else {
        const [ax, ay] = px(A), [bx, by] = px(B);
        const L = hyp(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / L, uy = (by - ay) / L;
        const s = boundary(A, ux, uy), t = boundary(B, -ux, -uy);
        const t2 = [t[0] - ux * head * 0.85, t[1] - uy * head * 0.85];
        el('line', { x1: s[0], y1: s[1], x2: t[0], y2: t[1], class: 'd-hit' }, g);
        el('line', { x1: s[0], y1: s[1], x2: t2[0], y2: t2[1], stroke: st.color, 'stroke-width': st.width, class: 'd-line' }, g);
        arrowHead(g, t, ux, uy, head, st.color);
        labelPos = [s[0] + (t[0] - s[0]) * 0.5, s[1] + (t[1] - s[1]) * 0.5];
      }
      if (st.std !== null && S.showValues) {
        const fs = Math.max(10, Math.min(13, dims().side * 0.3));
        const lg = el('g', { class: 'd-elabel' }, gLabels);
        const txt = FF.plots.fmt2(st.std);
        const w = txt.length * fs * 0.58 + 6;
        el('rect', { x: labelPos[0] - w / 2, y: labelPos[1] - fs * 0.7, width: w, height: fs * 1.4, rx: 3, class: 'd-elabel-bg' }, lg);
        const t = el('text', { x: labelPos[0], y: labelPos[1], 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, lg);
        t.textContent = txt;
      }
    }

    function drawResidual(o) {
      // short arrow into the item, from the side away from its factors
      const d = dims();
      const [x, y] = px(o);
      const facs = S.edges.filter(e => e.kind === 'load' && e.b === o.id).map(e => node(e.a)).filter(Boolean);
      let ux = 0, uy = 1;
      if (facs.length) {
        const fx = facs.reduce((s, f) => s + f.x * W, 0) / facs.length;
        const fy = facs.reduce((s, f) => s + f.y * H, 0) / facs.length;
        const L = hyp(x - fx, y - fy) || 1;
        ux = (x - fx) / L; uy = (y - fy) / L;
        // snap to the dominant axis (semPlot-style residuals below / beside)
        if (Math.abs(uy) >= 0.3) { ux = 0; uy = Math.sign(uy); } else { ux = Math.sign(ux) || 1; uy = 0; }
      }
      const tip = boundary(o, ux, uy);
      const len = d.side * 0.62;
      const start = [tip[0] + ux * len, tip[1] + uy * len];
      const fe = S.fit && !S.stale ? S.fit.resid[o.idx] : null;
      const g = el('g', { class: 'd-resid' }, gEdges);
      const head = Math.max(7, d.side * 0.18);
      el('line', { x1: start[0], y1: start[1], x2: tip[0] + ux * head * 0.8, y2: tip[1] + uy * head * 0.8, class: 'd-resid-line' }, g);
      arrowHead(g, tip, -ux, -uy, head, '#9AA0A8');
      if (fe && S.showValues) {
        const fs = Math.max(9, Math.min(11, d.side * 0.26));
        const t = el('text', { x: start[0] + ux * fs * 0.9, y: start[1] + uy * fs * 0.9, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'd-resid-val' }, g);
        t.textContent = FF.plots.fmt2(fe.std);
      }
    }

    function render() {
      measure();
      while (gEdges.firstChild) gEdges.removeChild(gEdges.firstChild);
      while (gLabels.firstChild) gLabels.removeChild(gLabels.firstChild);
      while (gNodes.firstChild) gNodes.removeChild(gNodes.firstChild);
      const d = dims();
      // draw edges sorted weakest first so strong paths sit on top
      const es = S.edges.slice();
      if (S.fit && !S.stale) es.sort((a, b) => Math.abs((S.fit.map[a.id] || {}).std || 0) - Math.abs((S.fit.map[b.id] || {}).std || 0));
      for (const o of S.obs) drawResidual(o);
      for (const e of es) drawEdge(e);
      for (const l of S.lat) {
        const [x, y] = px(l);
        const g = el('g', { class: 'd-node lat' + (S.sel.has(l.id) ? ' sel' : '') + (pending === l.id ? ' pending' : ''), 'data-id': l.id }, gNodes);
        el('circle', { cx: x, cy: y, r: d.R + 6, class: 'd-halo' }, g);
        el('circle', { cx: x, cy: y, r: d.R, class: 'd-shape' }, g);
      }
      for (const o of S.obs) {
        const [x, y] = px(o);
        const g = el('g', { class: 'd-node obs' + (S.sel.has(o.id) ? ' sel' : '') + (pending === o.id ? ' pending' : '') + (S.hl.has(o.idx) ? ' hl' : ''), 'data-id': o.id }, gNodes);
        el('rect', { x: x - d.half - 5, y: y - d.half - 5, width: d.side + 10, height: d.side + 10, rx: 6, class: 'd-halo' }, g);
        el('rect', { x: x - d.half, y: y - d.half, width: d.side, height: d.side, class: 'd-shape' }, g);
        const t = el('text', { x, y, 'font-size': d.side * 0.46, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'd-label' }, g);
        t.textContent = String(o.idx + 1);
      }
      svg.classList.toggle('fitted', !!(S.fit && !S.stale));
      if (opts.onRender) opts.onRender();
    }

    // ---------------- interaction ----------------
    function pt(ev) {
      const r = svg.getBoundingClientRect();
      return [(ev.clientX - r.left) * (W / r.width), (ev.clientY - r.top) * (H / r.height)];
    }
    function hitNode(x, y, slop) {
      const d = dims();
      slop = slop || 6;
      // factors on top
      for (let i = S.lat.length - 1; i >= 0; i--) {
        const l = S.lat[i], [lx, ly] = px(l);
        if (hyp(x - lx, y - ly) <= d.R + slop) return l;
      }
      for (let i = S.obs.length - 1; i >= 0; i--) {
        const o = S.obs[i], [ox, oy] = px(o);
        if (Math.abs(x - ox) <= d.half + slop && Math.abs(y - oy) <= d.half + slop) return o;
      }
      return null;
    }
    function hitEdge(target) {
      const g = target && target.closest ? target.closest('.d-edge') : null;
      return g ? g.getAttribute('data-id') : null;
    }

    function clampN(v) { return Math.max(0.04, Math.min(0.96, v)); }

    function onDown(ev) {
      if (isStatic) return;
      if (ev.button !== undefined && ev.button > 0) return;
      ev.preventDefault();
      svg.setPointerCapture(ev.pointerId);
      const [x, y] = pt(ev);
      const n = hitNode(x, y, ev.pointerType === 'touch' ? 12 : 5);
      const eid = n ? null : hitEdge(ev.target);
      const tool = S.tool;
      drag = { x0: x, y0: y, moved: false, node: n, edge: eid, tool, shift: ev.shiftKey || ev.metaKey || ev.ctrlKey };

      if (tool === 'erase') {
        if (n && n.kind === 'lat') removeIds([n.id]);
        else if (eid) removeIds([eid]);
        drag = null;
        return;
      }
      if (tool === 'factor') {
        if (!n && !eid) {
          addFactor(clampN(x / W), clampN(y / H), []);
          setTool('select');
          drag = null;
        }
        return;
      }
      if (tool === 'arrow' || tool === 'cov') {
        if (n) {
          drag.kind = 'connect';
          drag.from = pending ? null : n.id;
          if (pending && pending !== n.id) {
            addEdge(tool, pending, n.id);
            pending = null; drag = null; render();
            return;
          }
        } else { pending = null; render(); drag = null; }
        return;
      }
      // select tool
      if (n) {
        drag.kind = 'move';
        drag.start = {};
        const group = S.sel.has(n.id) ? [...S.sel] : [n.id];
        for (const id of group) { const m = node(id); if (m) drag.start[id] = [m.x, m.y]; }
      } else if (eid) {
        S.sel.clear(); S.sel.add(eid); render();
        drag = null;
      } else {
        drag.kind = 'band';
        if (!drag.shift) { S.sel.clear(); render(); }
      }
    }

    function onMove(ev) {
      if (isStatic) return;
      const [x, y] = pt(ev);
      if (!drag) {
        // hover feedback
        const n = hitNode(x, y, 4);
        svg.style.cursor = n ? (S.tool === 'select' ? 'grab' : (S.tool === 'erase' && n.kind !== 'lat' ? 'not-allowed' : 'crosshair'))
          : (S.tool === 'factor' ? 'copy' : S.tool === 'erase' ? 'pointer' : 'default');
        if (opts.onHoverNode) opts.onHoverNode(n && n.kind === 'obs' ? n.idx : null);
        return;
      }
      const dist = hyp(x - drag.x0, y - drag.y0);
      if (dist > 4) drag.moved = true;
      if (drag.kind === 'move' && drag.moved) {
        if (!drag.pushed) { pushHistory(); drag.pushed = true; }   // snapshot before the first move
        for (const id in drag.start) {
          const m = node(id); if (!m) continue;
          m.x = clampN(drag.start[id][0] + (x - drag.x0) / W);
          m.y = clampN(drag.start[id][1] + (y - drag.y0) / H);
        }
        render();
      } else if (drag.kind === 'connect' && drag.from) {
        while (gOver.firstChild) gOver.removeChild(gOver.firstChild);
        const A = node(drag.from);
        const [ax, ay] = px(A);
        const tgt = hitNode(x, y, 8);
        el('line', { x1: ax, y1: ay, x2: x, y2: y, class: 'd-temp' + (drag.tool === 'cov' ? ' cov' : '') }, gOver);
        if (tgt && tgt.id !== drag.from) {
          const d = dims();
          const [tx, ty] = px(tgt);
          if (tgt.kind === 'lat') el('circle', { cx: tx, cy: ty, r: d.R + 7, class: 'd-target' }, gOver);
          else el('rect', { x: tx - d.half - 6, y: ty - d.half - 6, width: d.side + 12, height: d.side + 12, rx: 6, class: 'd-target' }, gOver);
        }
      } else if (drag.kind === 'band') {
        while (gOver.firstChild) gOver.removeChild(gOver.firstChild);
        el('rect', { x: Math.min(x, drag.x0), y: Math.min(y, drag.y0), width: Math.abs(x - drag.x0), height: Math.abs(y - drag.y0), class: 'd-band' }, gOver);
      }
    }

    function onUp(ev) {
      if (isStatic || !drag) return;
      const [x, y] = pt(ev);
      while (gOver.firstChild) gOver.removeChild(gOver.firstChild);
      const d0 = drag; drag = null;
      if (d0.kind === 'move') {
        if (!d0.moved) {
          // click: items toggle in/out of a multi-selection; a factor is selected alone
          const n = d0.node;
          if (n.kind === 'obs') {
            if ([...S.sel].some(id => id[0] !== 'o')) S.sel.clear();
            if (S.sel.has(n.id)) S.sel.delete(n.id); else S.sel.add(n.id);
          } else {
            const only = S.sel.size === 1 && S.sel.has(n.id);
            S.sel.clear();
            if (!only) S.sel.add(n.id);
          }
          GA('click');
          render();
          if (opts.onSelect) opts.onSelect(selection());
        } else {
          render();
          if (opts.onChange) opts.onChange({ structural: false });
        }
      } else if (d0.kind === 'connect') {
        const tgt = hitNode(x, y, ev.pointerType === 'touch' ? 14 : 8);
        if (d0.moved && tgt && tgt.id !== d0.from) {
          addEdge(d0.tool, d0.from, tgt.id);
          pending = null;
        } else if (!d0.moved) {
          pending = d0.from; // tap-tap mode
          msg('Now tap the node to connect to.', 'info');
        } else pending = null;
        render();
      } else if (d0.kind === 'band') {
        if (d0.moved) {
          const x0 = Math.min(x, d0.x0), x1 = Math.max(x, d0.x0), y0 = Math.min(y, d0.y0), y1 = Math.max(y, d0.y0);
          for (const n of S.obs.concat(S.lat)) {
            const [nx, ny] = px(n);
            if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) S.sel.add(n.id);
          }
        }
        render();
        if (opts.onSelect) opts.onSelect(selection());
      }
    }

    function selection() {
      const items = [...S.sel].filter(id => id[0] === 'o');
      const facs = [...S.sel].filter(isLat);
      const edges = [...S.sel].filter(id => id[0] === 'e');
      return { items, factors: facs, edges, any: S.sel.size > 0, deletable: facs.length + edges.length };
    }

    if (!isStatic) {
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', () => { drag = null; while (gOver.firstChild) gOver.removeChild(gOver.firstChild); });
      svg.addEventListener('pointerleave', () => { if (!drag && opts.onHoverNode) opts.onHoverNode(null); });
    }

    // ---------------- public API ----------------
    function setTool(t) {
      S.tool = t;
      pending = null;
      svg.dataset.tool = t;
      render();
      if (opts.onTool) opts.onTool(t);
    }
    function reset(p) {
      S.obs = []; S.lat = []; S.edges = []; S.nextLat = 1; S.nextEdge = 1;
      S.sel.clear(); S.fit = null; S.stale = false; S.history = []; pending = null;
      for (let i = 0; i < p; i++) {
        S.obs.push({ id: 'o' + i, kind: 'obs', idx: i, x: p === 1 ? 0.5 : 0.08 + 0.84 * i / (p - 1), y: 0.74 });
      }
      measure();
      render();
    }
    function deleteSelection() {
      const ids = [...S.sel].filter(id => id[0] !== 'o');
      if (!ids.length) { msg('Items cannot be deleted — select a factor or a path.', 'info'); return; }
      removeIds(ids);
    }
    function factorFromSelection() {
      const items = [...S.sel].filter(id => id[0] === 'o');
      if (!items.length) { setTool('factor'); return null; }
      const ns = items.map(node);
      const x = ns.reduce((s, n) => s + n.x, 0) / ns.length;
      const yMin = Math.min(...ns.map(n => n.y));
      const y = Math.max(0.1, yMin - 0.42);
      return addFactor(x, y, items);
    }
    function undo() {
      if (!S.history.length) { msg('Nothing to undo.', 'info'); return; }
      restore(S.history.pop());
      pending = null;
      changed(true);
    }
    function clearModel() {
      if (!S.lat.length && !S.edges.length) return;
      pushHistory();
      S.lat = []; S.edges = []; S.sel.clear();
      changed(true);
    }
    // semPlot-like tidy layout: factors on top, their items below in groups.
    function tidy(animate) {
      const before = new Map(S.obs.concat(S.lat).map(n => [n.id, [n.x, n.y]]));
      const strength = (e) => (S.fit && !S.stale && S.fit.map[e.id]) ? Math.abs(S.fit.map[e.id].std) : 1;
      const primary = {};
      for (const o of S.obs) {
        let best = null, bs = -1;
        for (const e of S.edges) if (e.kind === 'load' && e.b === o.id) {
          const s = strength(e);
          if (s > bs) { bs = s; best = e.a; }
        }
        primary[o.id] = best;
      }
      // order factors by mean current x of their items; second-order factors on a top row
      const hasItems = new Set(Object.values(primary).filter(Boolean));
      const first = S.lat.filter(l => hasItems.has(l.id) || S.edges.some(e => e.kind === 'load' && e.a === l.id));
      const higher = S.lat.filter(l => !first.includes(l));
      const meanX = (l) => {
        const its = S.obs.filter(o => primary[o.id] === l.id);
        return its.length ? its.reduce((s, o) => s + o.x, 0) / its.length : l.x;
      };
      first.sort((a, b) => meanX(a) - meanX(b));
      const order = [];
      for (const l of first) S.obs.filter(o => primary[o.id] === l.id).sort((a, b) => a.x - b.x).forEach(o => order.push(o));
      S.obs.filter(o => !primary[o.id]).sort((a, b) => a.x - b.x).forEach(o => order.push(o));
      const p = order.length;
      const yObs = 0.74, yLat = higher.length ? 0.38 : 0.3, yHigh = 0.12;
      order.forEach((o, k) => { o.x = p === 1 ? 0.5 : 0.08 + 0.84 * k / (p - 1); o.y = yObs; });
      first.forEach((l, k) => {
        const its = S.obs.filter(o => primary[o.id] === l.id);
        l.x = its.length ? its.reduce((s, o) => s + o.x, 0) / its.length : (k + 1) / (first.length + 1);
        l.y = yLat;
      });
      // spread factors that ended up too close
      const d = dims();
      const minGap = (d.R * 2.6) / W;
      for (let k = 1; k < first.length; k++) if (first[k].x - first[k - 1].x < minGap) first[k].x = Math.min(0.95, first[k - 1].x + minGap);
      higher.forEach((l, k) => {
        const kids = S.edges.filter(e => e.kind === 'reg' && e.a === l.id).map(e => node(e.b)).filter(Boolean);
        l.x = kids.length ? kids.reduce((s, n) => s + n.x, 0) / kids.length : (k + 1) / (higher.length + 1);
        l.y = yHigh;
      });
      if (animate === false) { render(); return; }
      const after = new Map(S.obs.concat(S.lat).map(n => [n.id, [n.x, n.y]]));
      pushHistoryFrom(before);
      const t0 = performance.now(), dur = 380;
      if (anim) cancelAnimationFrame(anim);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        for (const n of S.obs.concat(S.lat)) {
          const a = before.get(n.id), b = after.get(n.id);
          n.x = a[0] + (b[0] - a[0]) * e; n.y = a[1] + (b[1] - a[1]) * e;
        }
        render();
        if (t < 1) anim = requestAnimationFrame(step); else { anim = null; if (opts.onChange) opts.onChange({ structural: false }); }
      };
      anim = requestAnimationFrame(step);
    }
    function pushHistoryFrom(before) {
      const o = JSON.parse(snapshot());
      for (const n of o.obs.concat(o.lat)) { const b = before.get(n.id); if (b) { n.x = b[0]; n.y = b[1]; } }
      S.history.push(JSON.stringify(o));
    }

    // Load a structure (used for the true-model reveal).
    function loadSpec(spec, p) {
      reset(p);
      const ids = [];
      for (let j = 0; j < spec.m; j++) { const id = 'f' + (S.nextLat++); S.lat.push({ id, kind: 'lat', x: (j + 1) / (spec.m + 1), y: 0.3 }); ids.push(id); }
      for (const [i, j] of spec.loadings) S.edges.push({ id: 'e' + (S.nextEdge++), kind: 'load', a: ids[j], b: 'o' + i });
      for (const [t, f] of spec.regressions || []) S.edges.push({ id: 'e' + (S.nextEdge++), kind: 'reg', a: ids[f], b: ids[t] });
      for (const [a, b] of spec.factorCovs || []) S.edges.push({ id: 'e' + (S.nextEdge++), kind: 'cov', a: ids[a], b: ids[b] });
      for (const [a, b] of spec.residCovs || []) S.edges.push({ id: 'e' + (S.nextEdge++), kind: 'cov', a: 'o' + a, b: 'o' + b });
      tidy(false);
    }

    function setHighlight(idxs) {
      S.hl = new Set(idxs || []);
      for (const g of gNodes.querySelectorAll('.d-node.obs')) {
        const id = g.getAttribute('data-id');
        const o = node(id);
        g.classList.toggle('hl', !!o && S.hl.has(o.idx));
      }
    }

    const api = {
      reset, render, setTool, getSpec, setFitResult, deleteSelection, factorFromSelection,
      undo, clear: clearModel, tidy, loadSpec, setHighlight, selection,
      get tool() { return S.tool; },
      get stale() { return S.stale; },
      get hasFit() { return !!S.fit && !S.stale; },
      set showValues(v) { S.showValues = !!v; render(); },
      get showValues() { return S.showValues; },
      get counts() { return { factors: S.lat.length, edges: S.edges.length }; },
      cancelPending() { pending = null; render(); },
    };
    return api;
  }

  FF.editor = { create };
})(window);
