// FACTOR LAB — briefing cards (intro before the first round, and the
// "?" popup during play). Exposes FF.tutorial.
(function (global) {
  'use strict';
  const FF = global.FF = global.FF || {};

  const CARDS = [
    { title: 'THE DATA', c: '#B87613',
      body: 'A hidden factor model generated the answers of 150–500 people to 4–9 items. ' +
        'Left: their correlations as a scree plot, a heatmap (drag its numbers to reorder it) and two networks. ' +
        '<span class="pos">Blue</span> = positive, <span class="neg">red</span> = negative.' },
    { title: 'DRAW A MODEL', c: '#2B2F36',
      body: '<b>Double-click</b> the canvas to add a factor, then click its items. ' +
        '<b>Correlate</b> links two residuals (circles under the items) or two factors. ' +
        '<b>Erase</b> removes paths. Double-click a factor to change its items.' },
    { title: 'ONE FIT', c: '#2E8B57',
      body: 'Five datasets per game, <b>one FIT</b> each. If the model cannot be estimated, fix it and try again for free. ' +
        'Then compare the model with the data.' },
    { title: 'SCORING', c: '#79808C',
      body: 'Each dataset is worth 20 points. <b>Fit (10):</b> χ² test, RMSEA, CFI, TLI and SRMR give 2 points each if good, 1 if acceptable. ' +
        '<b>Parsimony (10):</b> you lose points for every BIC point above the true model (less at harder levels). A diploma needs 60 of 100.' },
  ];

  const LEARN_CARDS = [
    { title: 'YOUR MODEL', c: '#2B2F36',
      body: 'Draw any factor model on the right. <b>Double-click</b> to add a factor and click its items; ' +
        '<b>Correlate</b> links residuals or factors; <b>+ Item</b> adds an item, <b>Erase</b> removes one.' },
    { title: 'ITS CORRELATIONS', c: '#B87613',
      body: 'The left side shows the correlations your model <b>implies</b> in the population, updated as you draw: ' +
        'scree plot, heatmap and the correlation and partial correlation networks.' },
    { title: 'CHANGE A VALUE', c: '#2E8B57',
      body: '<b>Click a path</b>, or the small circle under an item (its residual variance), to set its value with a slider. ' +
        'Defaults: loadings 1, factor correlations .5, residual variances 1.' },
    { title: 'NO SCORE', c: '#79808C',
      body: 'Nothing to win here: just explore. Which models give a scree plot with two big eigenvalues? ' +
        'What does a cross-loading do to the network?' },
  ];

  let onDone = null;

  function show(opts) {
    opts = opts || {};
    const scr = document.getElementById('screen-tutorial');
    const grid = document.getElementById('tut-cards');
    const btn = document.getElementById('tut-continue');
    grid.innerHTML = '';
    (opts.learn ? LEARN_CARDS : CARDS).forEach((c, k) => {
      const d = document.createElement('div');
      d.className = 'tut-card';
      d.style.setProperty('--c', c.c);
      d.style.animationDelay = (opts.popup ? 0 : 0.12 * k) + 's';
      d.innerHTML = '<h3>' + c.title + '</h3><p>' + c.body + '</p>';
      grid.appendChild(d);
    });
    btn.textContent = opts.popup ? (opts.learn ? 'BACK' : 'BACK TO THE GAME') : 'START';
    scr.querySelector('.tut-header').textContent = opts.learn ? 'LEARN: WHAT DOES A MODEL IMPLY?' : 'HOW TO PLAY';
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
