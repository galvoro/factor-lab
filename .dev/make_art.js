// Generates the FACTOR LAB key art (square SVG): a round-bottom flask lit up
// like a white figure on a dark workstation background. Items (squares) sit
// in the liquid, linked by a qgraph-style correlation network; two latent
// factors rise as bubbles with loading arrows down into their items.
//
//   node .dev/make_art.js            -> writes the art into index.html (between
//                                       <!--ART--> markers) and .dev/out/cover.html
//   node .dev/render_cover.js        -> renders cover.png (1254 x 1254) from it
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const POS = '#0000D5';
const f = (v) => +v.toFixed(1);

function arrow(x1, y1, x2, y2, w, col, headLen) {
  const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const h = headLen || 16 + w * 1.6, hw = h * 0.5;
  const bx = x2 - ux * h, by = y2 - uy * h;
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(bx + ux * 2)}" y2="${f(by + uy * 2)}" stroke="${col}" stroke-width="${w}" />` +
    `<path d="M${f(x2)} ${f(y2)} L${f(bx - uy * hw)} ${f(by + ux * hw)} L${f(bx + uy * hw)} ${f(by - ux * hw)} Z" fill="${col}" />`;
}

function build(opts) {
  const id = (opts && opts.id) || 'fl';
  const S = 46, half = S / 2;
  const items = { A1: [330, 748], A2: [391, 797], A3: [452, 748], B1: [548, 748], B2: [609, 797], B3: [670, 748] };
  const F = { F1: [383, 548], F2: [617, 548] }, R = 41;
  const out = [];
  out.push(`<svg class="fl-art" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Factor Lab: a flask in which two latent factors rise as bubbles above correlated items">`);
  out.push(`<defs>
    <radialGradient id="${id}-bg" cx="50%" cy="60%" r="78%"><stop offset="0" stop-color="#26354A"/><stop offset="0.5" stop-color="#151C26"/><stop offset="1" stop-color="#0A0D12"/></radialGradient>
    <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#E39B2D" stop-opacity="0.42"/><stop offset="0.55" stop-color="#E39B2D" stop-opacity="0.12"/><stop offset="1" stop-color="#E39B2D" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4ECF3"/></linearGradient>
    <linearGradient id="${id}-liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8E8"/><stop offset="1" stop-color="#F2DFB5"/></linearGradient>
    <clipPath id="${id}-clip"><path d="M455 330 L455 469.5 A225 225 0 1 0 545 469.5 L545 330 Z"/></clipPath>
    <filter id="${id}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>`);
  // background, grid, data dust
  out.push(`<rect width="1000" height="1000" fill="url(#${id}-bg)"/>`);
  let grid = '';
  for (let x = 40; x < 1000; x += 40) grid += `M${x} 0V1000`;
  for (let y = 40; y < 1000; y += 40) grid += `M0 ${y}H1000`;
  out.push(`<path d="${grid}" stroke="#FFFFFF" stroke-opacity="0.035" stroke-width="1"/>`);
  const dust = [[92, 410, 's'], [150, 590, 'c'], [118, 802, 's'], [210, 470, 'c'], [868, 430, 's'], [905, 640, 'c'], [842, 815, 's'], [790, 520, 'c'], [70, 680, 'c'], [930, 760, 's'], [175, 905, 'c'], [835, 925, 'c'], [255, 345, 's'], [748, 352, 's']];
  out.push('<g class="fl-dust" fill="none" stroke="#9FB3C8" stroke-width="2" opacity="0.22">' + dust.map(([x, y, k], i) =>
    k === 's' ? `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" class="fl-dot d${i % 4}"/>` : `<circle cx="${x}" cy="${y}" r="8" class="fl-dot d${i % 4}"/>`).join('') + '</g>');
  // title
  out.push(`<text x="500" y="92" text-anchor="middle" font-family="'Space Grotesk', 'IBM Plex Sans', sans-serif" font-weight="600" font-size="23" letter-spacing="8" fill="#8EA0B5">STRUCTURAL EQUATION MODELING</text>`);
  out.push(`<text x="500" y="208" text-anchor="middle" font-family="'Space Grotesk', 'IBM Plex Sans', sans-serif" font-weight="700" font-size="128" letter-spacing="3"><tspan fill="#F2F4F7">FACTOR </tspan><tspan fill="#E8A33A">LAB</tspan></text>`);
  out.push(`<text x="500" y="256" text-anchor="middle" font-family="'IBM Plex Mono', ui-monospace, monospace" font-weight="500" font-size="25" fill="#7F93A8">&gt; F1 =~ y1 + y2 + y3<tspan class="fl-caret" fill="#E8A33A">&#9611;</tspan></text>`);
  // everything below the title sits a little lower
  out.push('<g transform="translate(0 18)">');
  // glow and shadow
  out.push(`<circle cx="500" cy="660" r="330" fill="url(#${id}-glow)" class="fl-glow"/>`);
  out.push(`<ellipse cx="500" cy="952" rx="215" ry="20" fill="#000" opacity="0.45" filter="url(#${id}-blur)"/>`);
  // cork ring (back half)
  out.push(`<ellipse cx="500" cy="916" rx="150" ry="26" fill="#6E451C"/>`);
  // flask body: glass, liquid, network, factors
  out.push(`<g clip-path="url(#${id}-clip)">`);
  out.push(`<rect x="250" y="300" width="500" height="650" fill="url(#${id}-glass)"/>`);
  out.push(`<path class="fl-liquid" d="M240 616 Q330 600 420 616 T600 616 T780 616 L780 960 L240 960 Z" fill="url(#${id}-liquid)"/>`);
  out.push(`<path d="M240 616 Q330 600 420 616 T600 616 T780 616" fill="none" stroke="#E4C98F" stroke-width="3"/>`);
  // tiny bubbles rising through the liquid
  out.push('<g class="fl-fizz" fill="#FFFFFF" stroke="#E2C78B" stroke-width="1.5">' +
    [[352, 880, 5], [420, 865, 3.5], [500, 890, 6], [575, 872, 4], [648, 884, 5], [500, 700, 3.5], [455, 655, 3], [548, 668, 4]]
      .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" class="fl-fz z${i % 4}"/>`).join('') + '</g>');
  // correlation network among the items
  const e = (a, b, w, col, cls) => `<line x1="${items[a][0]}" y1="${items[a][1]}" x2="${items[b][0]}" y2="${items[b][1]}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"${cls ? ` class="${cls}"` : ''}/>`;
  out.push('<g class="fl-net">' + [
    e('A3', 'B1', 3.5, '#B3B3F2'), e('A2', 'B2', 2.5, '#CFCFF7'), e('A1', 'B1', 2, '#EFC4C4'),
    e('A1', 'A2', 8, POS), e('A2', 'A3', 7, '#1E1ED9'), e('A1', 'A3', 5, '#4646E1'),
    e('B1', 'B2', 7.5, '#0A0AD6'), e('B2', 'B3', 6.5, '#2828DB'), e('B1', 'B3', 5, '#4646E1'),
  ].join('') + '</g>');
  // loadings: factor bubble -> item
  const load = (fk, ik, w) => {
    const [fx, fy] = F[fk], [ix, iy] = items[ik];
    const L = Math.hypot(ix - fx, iy - fy), ux = (ix - fx) / L, uy = (iy - fy) / L;
    const sx = fx + ux * (R + 4), sy = fy + uy * (R + 4);
    const k = half / Math.max(Math.abs(ux), Math.abs(uy));
    return arrow(sx, sy, ix - ux * (k + 3), iy - uy * (k + 3), w, POS);
  };
  out.push('<g class="fl-loads">' + [
    load('F1', 'A1', 6.5), load('F1', 'A2', 6), load('F1', 'A3', 5),
    load('F2', 'B1', 6.5), load('F2', 'B2', 5.5), load('F2', 'B3', 5),
  ].join('') + '</g>');
  // factor correlation (curved, double-headed)
  {
    const a = [F.F1[0] + 30, F.F1[1] - 30], b = [F.F2[0] - 30, F.F2[1] - 30], c = [500, 455];
    const col = '#5F5FE6', w = 4.5;
    const ua = [c[0] - a[0], c[1] - a[1]], la = Math.hypot(...ua), ub = [c[0] - b[0], c[1] - b[1]], lb = Math.hypot(...ub);
    const h = 18;
    const a2 = [a[0] + ua[0] / la * h, a[1] + ua[1] / la * h], b2 = [b[0] + ub[0] / lb * h, b[1] + ub[1] / lb * h];
    out.push(`<path d="M${f(a2[0])} ${f(a2[1])} Q${c[0]} ${c[1]} ${f(b2[0])} ${f(b2[1])}" fill="none" stroke="${col}" stroke-width="${w}"/>`);
    out.push(arrow(a2[0], a2[1], a[0], a[1], w, col, h));
    out.push(arrow(b2[0], b2[1], b[0], b[1], w, col, h));
  }
  // items
  out.push('<g class="fl-items">' + Object.values(items).map(([x, y], k) =>
    `<rect x="${x - half}" y="${y - half}" width="${S}" height="${S}" fill="#FFFFFF" stroke="#1F2328" stroke-width="3.5"/>` +
    `<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#1F2328">${k + 1}</text>`).join('') + '</g>');
  // factors (bubbles)
  out.push('<g class="fl-factors">' + Object.entries(F).map(([k, [x, y]]) =>
    `<g class="fl-factor ${k}"><circle cx="${x}" cy="${y}" r="${R}" fill="#FFFFFF" stroke="#1F2328" stroke-width="4"/>` +
    `<circle cx="${x - 14}" cy="${y - 15}" r="9" fill="#FFFFFF" opacity="0.9"/>` +
    `<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" font-family="'IBM Plex Mono', monospace" font-weight="600" font-size="19" fill="#9AA1AB">${k}</text></g>`).join('') + '</g>');
  // rising bubbles in the neck
  out.push('<g class="fl-bubbles" fill="#FFFFFF" stroke="#A9BBCC" stroke-width="2.5">' +
    [[493, 445, 11], [509, 400, 8], [497, 362, 6]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" class="fl-bub b${i}"/>`).join('') + '</g>');
  // glass highlights
  out.push(`<path d="M330 572 A212 212 0 0 0 292 676" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" opacity="0.9"/>`);
  out.push(`<path d="M466 345 L466 455" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity="0.8"/>`);
  out.push('</g>');
  // flask outline and rim
  out.push(`<path d="M455 330 L455 469.5 A225 225 0 1 0 545 469.5 L545 330" fill="none" stroke="#DDE6EE" stroke-width="7" stroke-linejoin="round"/>`);
  out.push(`<rect x="438" y="312" width="124" height="22" rx="8" fill="#EEF3F7" stroke="#C9D5E0" stroke-width="3"/>`);
  // bubbles escaping above the rim
  out.push('<g class="fl-bubbles out" fill="none" stroke="#C3D2DF" stroke-width="2.5">' +
    [[508, 296, 6.5], [497, 281, 4]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" class="fl-bub o${i}"/>`).join('') + '</g>');
  // cork ring (front half)
  out.push(`<path d="M350 916 A150 26 0 0 0 650 916" fill="none" stroke="#B17A40" stroke-width="16" stroke-linecap="round"/>`);
  out.push(`<path d="M362 921 A138 20 0 0 0 638 921" fill="none" stroke="#D39A57" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`);
  out.push('</g>');
  out.push('</svg>');
  return out.join('\n');
}

const svg = build({ id: 'fl' });
// title screen: inline the art in index.html
const idx = path.join(root, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const a = html.indexOf('<!--ART-->'), b = html.indexOf('<!--/ART-->');
if (a < 0 || b < 0) throw new Error('index.html has no <!--ART--> markers');
html = html.slice(0, a + '<!--ART-->'.length) + '\n' + svg + '\n' + html.slice(b);
fs.writeFileSync(idx, html);
// cover page for rendering
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'cover.html'), `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=IBM+Plex+Mono:wght@500;600&display=block" rel="stylesheet">
<style>html,body{margin:0;background:#0A0D12} svg{display:block;width:1254px;height:1254px}</style></head><body>${build({ id: 'cv' })}</body></html>`);
console.log('art written: index.html and .dev/out/cover.html');
