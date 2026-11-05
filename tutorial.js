// FACTOR FIND — briefing cards (intro before the first round, and the
// "?" popup during play). Exposes FF.tutorial.
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};

  const CARDS = [
    { title: 'THE DATA', c: '#B87613',
      body: 'A hidden factor model generated the answers of 150–500 people to 4–9 items. ' +
        'Left: their correlations as a scree plot, a heatmap and two networks. ' +
        '<span class="pos">Blue</span> = positive, <span class="neg">red</span> = negative.' },
    { title: 'DRAW A MODEL', c: '#2B2F36',
      body: '<b>Double-click</b> the canvas to add a factor, then click its items. ' +
        '<b>Correlate</b> links two residuals (circles under the items) or two factors. ' +
        '<b>Erase</b> removes paths. Double-click a factor to change its items.' },
    { title: 'ONE FIT', c: '#2E8B57',
      body: 'Five datasets per game, <b>one FIT</b> each. If the model cannot be estimated, fix it and try again for free. ' +
        'Then compare the model with the data.' },
    { title: 'SCORING', c: '#79808C',
      body: 'Each dataset is worth 20 points. <b>Fit (8):</b> χ² test, RMSEA, CFI and SRMR give 2 points each if good, 1 if acceptable. ' +
        '<b>Parsimony (12):</b> −0.6 per BIC point above the true model. A diploma needs 60 of 100.' },
  ];

  let onDone = null;

  function show(opts) {
    opts = opts || {};
    const scr = document.getElementById('screen-tutorial');
    const grid = document.getElementById('tut-cards');
    const btn = document.getElementById('tut-continue');
    grid.innerHTML = '';
    CARDS.forEach((c, k) => {
      const d = document.createElement('div');
      d.className = 'tut-card';
      d.style.setProperty('--c', c.c);
      d.style.animationDelay = (opts.popup ? 0 : 0.12 * k) + 's';
      d.innerHTML = '<h3>' + c.title + '</h3><p>' + c.body + '</p>';
      grid.appendChild(d);
    });
    btn.textContent = opts.popup ? 'BACK TO THE GAME' : 'START';
    scr.classList.toggle('popup', !!opts.popup);
    scr.classList.add('show');
    onDone = opts.onDismiss || null;
  }
  function hide() {
    document.getElementById('screen-tutorial').classList.remove('show', 'popup');
    const f = onDone; onDone = null;
    if (f) f();
  }
  function isOpen() { return document.getElementById('screen-tutorial').classList.contains('show'); }

  document.getElementById('tut-continue').addEventListener('click', () => {
    if (global.GaltonAudio) global.GaltonAudio.SFX.click();
    hide();
  });
  document.getElementById('tut-close').addEventListener('click', hide);

  FF.tutorial = { show, hide, isOpen };
})(window);
