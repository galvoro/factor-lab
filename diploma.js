// FACTOR FIND — the diploma drawn on a canvas (for "Save as image").
// Drawn with the 2D canvas API (no DOM screenshot, no SVG images), so it
// works under the capsule CSP and never taints the canvas.
// FF.diploma.render(info) -> Promise<HTMLCanvasElement>
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};
  const W = 1600, H = 1131;               // A4 landscape proportions
  const SERIF = "'Cormorant Garamond', Georgia, serif";
  const HEAD = "'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif";
  const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";
  const SANS = "'IBM Plex Sans', system-ui, sans-serif";

  function starPath(ctx, cx, cy, ro, ri, n) {
    ctx.beginPath();
    for (let k = 0; k < 2 * n; k++) {
      const a = Math.PI * k / n - Math.PI / 2, r = k % 2 ? ri : ro;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function spaced(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

  // medal with ribbons, same geometry as the on-screen SVG (viewBox 100 x 102)
  function drawMedal(ctx, m, x0, y0, size) {
    const s = size / 100;
    ctx.save();
    ctx.translate(x0, y0); ctx.scale(s, s);
    const grad = () => {
      const g = ctx.createRadialGradient(35, 30, 0, 35, 30, 80);
      g.addColorStop(0, m.hi); g.addColorStop(0.55, m.mid); g.addColorStop(1, m.lo);
      return g;
    };
    const poly = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    poly([[30, 62], [18, 98], [30, 90], [38, 100], [46, 66]], m.lo);
    poly([[70, 62], [82, 98], [70, 90], [62, 100], [54, 66]], m.mid);
    starPath(ctx, 50, 46, 44, 38, 24); ctx.fillStyle = grad(); ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = m.lo; ctx.stroke();
    ctx.beginPath(); ctx.arc(50, 46, 30, 0, 2 * Math.PI); ctx.lineWidth = 2.2; ctx.globalAlpha = 0.85; ctx.strokeStyle = m.hi; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(50, 46, 27, 0, 2 * Math.PI); ctx.fillStyle = grad(); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = m.lo; ctx.stroke();
    starPath(ctx, 50, 47, 19, 8, 5); ctx.fillStyle = m.hi; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = m.lo; ctx.stroke();
    ctx.restore();
  }

  // centred line made of differently styled pieces: [[text, font, colour], ...]
  function richLine(ctx, parts, cx, y) {
    let total = 0;
    for (const [t, f] of parts) { ctx.font = f; total += ctx.measureText(t).width; }
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    for (const [t, f, c] of parts) { ctx.font = f; ctx.fillStyle = c; ctx.fillText(t, x, y); x += ctx.measureText(t).width; }
  }

  async function render(info) {
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.all([
          `700 120px ${SERIF}`, `italic 500 36px ${SERIF}`, `600 30px ${SERIF}`,
          `600 22px ${HEAD}`, `600 100px ${MONO}`, `400 22px ${SANS}`,
        ].map(f => document.fonts.load(f)));
      } catch (e) { /* fall back to system fonts */ }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.textBaseline = 'alphabetic';

    // paper, glow, frames, corners
    ctx.fillStyle = '#FFFDF5'; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.5);
    glow.addColorStop(0, 'rgba(255, 240, 200, 0.75)'); glow.addColorStop(1, 'rgba(255, 253, 245, 0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 8; ctx.strokeStyle = '#5B4626'; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#C9A453'; ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.lineWidth = 1.5; ctx.strokeRect(42, 42, W - 84, H - 84);
    ctx.lineWidth = 6;
    const c = 58, L = 52;
    for (const [x, y, dx, dy] of [[c, c, 1, 1], [W - c, c, -1, 1], [c, H - c, 1, -1], [W - c, H - c, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
    }

    const cx = W / 2;
    ctx.textAlign = 'center';
    ctx.font = `600 22px ${HEAD}`; ctx.fillStyle = '#8A6A2E'; spaced(ctx, 6);
    ctx.fillText('FACTOR FIND · STRUCTURAL EQUATION MODELING', cx, 112);
    spaced(ctx, 0);
    ctx.font = `700 132px ${SERIF}`; ctx.fillStyle = '#3E2F17';
    ctx.fillText('Diploma', cx, 232);
    ctx.font = `italic 500 38px ${SERIF}`; ctx.fillStyle = '#5B4626';
    ctx.fillText('This certifies that', cx, 292);
    const name = (info.name || '').trim();
    if (name) { ctx.font = `700 64px ${SERIF}`; ctx.fillStyle = '#2B2112'; ctx.fillText(name, cx, 370); }
    ctx.lineWidth = 2; ctx.strokeStyle = '#C9A453';
    ctx.beginPath(); ctx.moveTo(cx - 400, 392); ctx.lineTo(cx + 400, 392); ctx.stroke();
    richLine(ctx, [
      ['completed the ', `italic 500 38px ${SERIF}`, '#5B4626'],
      [info.level, `700 38px ${SERIF}`, '#3E2F17'],
      [' track of five datasets with a score of', `italic 500 38px ${SERIF}`, '#5B4626'],
    ], cx, 452);

    // medal + score
    drawMedal(ctx, info.metal, 442, 478, 236);
    ctx.textAlign = 'center'; ctx.font = `700 22px ${HEAD}`; ctx.fillStyle = '#6B5326'; spaced(ctx, 5);
    ctx.fillText(info.metal.name.toUpperCase(), 560, 748);
    spaced(ctx, 0);
    const sx = 1000;
    richLine(ctx, [[info.score, `600 120px ${MONO}`, '#2B2112'], [' / ' + info.max, `600 40px ${MONO}`, '#8A7A5A']], sx, 600);
    for (let k = 0; k < 3; k++) {
      starPath(ctx, sx - 52 + 52 * k, 650, 22, 9.2, 5);
      ctx.fillStyle = k < info.stars ? '#E3A72F' : '#EDE4CE'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = k < info.stars ? '#9C6C12' : '#C9B88C'; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.font = `italic 700 52px ${SERIF}`; ctx.fillStyle = '#8A5A10';
    ctx.fillText(info.rank, sx, 728);

    // rounds table
    const tx0 = 330, tx1 = W - 330;
    const cols = [[tx0 + 14, 'left'], [tx0 + 60, 'left'], [tx1 - 330, 'right'], [tx1 - 245, 'right'], [tx1 - 115, 'right'], [tx1 - 10, 'right']];
    const heads = ['#', 'TRUE MODEL', 'N', 'FIT', 'PARSIMONY', 'POINTS'];
    let y = 800;
    ctx.font = `600 18px ${HEAD}`; ctx.fillStyle = '#8A6A2E'; spaced(ctx, 2);
    heads.forEach((h, k) => { ctx.textAlign = cols[k][1]; ctx.fillText(h, cols[k][0], y); });
    spaced(ctx, 0);
    ctx.strokeStyle = '#D9C79B'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx0, y + 12); ctx.lineTo(tx1, y + 12); ctx.stroke();
    for (const r of info.rounds) {
      y += 35;
      const cells = [String(r.k), r.name + (r.exact ? '  ✓' : ''), String(r.N), String(r.fit), r.pars, r.total];
      cells.forEach((t, k) => {
        ctx.textAlign = cols[k][1];
        ctx.font = k === 1 ? `400 22px ${SANS}` : `${k === 5 ? 700 : 500} 21px ${MONO}`;
        ctx.fillStyle = '#3E2F17';
        ctx.fillText(t, cols[k][0], y);
      });
      ctx.strokeStyle = '#E8DFC8'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(tx0, y + 12); ctx.lineTo(tx1, y + 12); ctx.stroke();
      ctx.setLineDash([]);
    }

    // footer
    ctx.font = `italic 500 30px ${SERIF}`; ctx.fillStyle = '#6B5326';
    ctx.textAlign = 'left'; ctx.fillText(info.date, 110, H - 80);
    ctx.textAlign = 'right'; ctx.fillText('a Galvoro capsule', W - 110, H - 80);
    return cv;
  }

  FF.diploma = { render };
})(window);
