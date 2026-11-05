# FACTOR LAB

PLAY/LEARN Galvoro capsule for PL5225 Structural Equation Modeling. A game is
five datasets at one level (Easy / Medium / Hard / Psychometrika), each
simulated from a hidden factor model: from no factors at all up to 15 items,
5 factors, cross-loadings, residual correlations, negative or zero factor
correlations. The player reads the correlational structure on the left (scree
plot, heatmap, correlation network, regularized partial correlation network),
draws a path diagram on the right and presses FIT once per dataset. The game
ends with a diploma (at least 60 / 100): medal by level (bronze / silver /
gold / platinum), stars by score.

LEARN mode has no data, fitting or score: start from six unconnected items,
draw any model, click a path (or the circle under an item) to set its value
with a slider, add items with "+ Item" and erase them with Erase. The left side
shows the exact correlations the model implies (scree plot, heatmap, correlation
and partial correlation networks), updated live; values that imply a
non-positive-definite matrix grey the panels out with a warning. Metric: factor
(residual) variances fixed to 1; defaults loading 1, factor correlation / regression
.5, residual variance 1, residual covariance .3 (`DEFAULTS` in `editor.js`).

## Files

| File | Role |
|---|---|
| `linalg.js` | small matrix helpers, Jacobi eigen, chi-square tail, seeded RNG |
| `glasso.js` | graphical lasso + EBIC model selection (as `qgraph::EBICglasso`, gamma 0.5), written from the published algorithm; used for the regularized partial correlation networks (data and model-implied) |
| `sem.js` | ML estimation (Fisher scoring, std.lv identification), fit indices, identification check, lavaan export |
| `bank.js` | 61 structure templates (levels 1–4, incl. the no-factor baseline in Easy), random parameter draws (`RANGES`), data simulation, plain-language description and structure comparison |
| `plots.js` | qgraph-style scree / heatmap / networks; `springLayout` is a port of qgraph's Fruchterman–Reingold |
| `editor.js` | SVG path-diagram editor: double-click adds a factor and opens the indicator picker (double-click a factor to edit its items); residual correlations are drawn between the items' hidden residuals |
| `game.js` | game flow, dashboards, fit card, scoring (`CONFIG` / `CRITERIA` at the top), true-model reveal |
| `diploma.js` | draws the diploma on a canvas for "Save as image" (Print uses the page itself, print CSS) |
| `tutorial.js`, `audio.js` | briefing cards; `GaltonAudio` SFX (+ optional `assets/bgm.mp3`) |

## Look

"Analysis workstation" frame: panes as windows, a status bar (what the program
is doing: simulating / ready / estimating / converged / error, plus model and
fit summary) and, on wider screens, a collapsible console that writes the drawn
model as lavaan syntax (LEARN: population syntax with values). Factors carry
subtle F1, F2 labels matching the console. Light / dark / auto theme (HUD button,
remembered in localStorage); plots, the canvas and the true-model diagram stay
on white in every theme (`.panel, .canvas-wrap, .truth-fig` reset the tokens).

## Key art

`node .dev/make_art.js && node .dev/render_cover.js` regenerates the flask
illustration (vector, drawn by the script) inline on the title screen and
renders `cover.png` (1254 x 1254, the Galvoro square cover; a copy goes to
`~/GitHub_galvoro/squareimg/` for the upload script).

## Datasets

`FF.bank.makeRound(template, N, seed)` draws parameters (primary loadings
.50–.90, cross-loadings .30–.50, factor correlations .20–.60, residual
correlations .25–.45, residual variances ≥ .15) and a sample, and redraws until

1. the true structure reaches the top tier of every fit criterion on that sample
   with a proper solution, and
2. every feature of the truth is supported by the sample: dropping any
   cross-loading, residual or factor correlation, or merging two factors, raises
   BIC by at least 2.

So the true structure always scores 100, and nothing in it is undetectable.

## Scoring (edit `CONFIG` / `CRITERIA` in `game.js`)

* One FIT per dataset. Not identified / not converged / improper (Heywood) →
  red error card, not counted.
* Each dataset is worth 20 points (one decimal), a game of five 100.
* Fit (8): χ² p ≥ .05 / ≥ .01, RMSEA < .05 / < .08, CFI ≥ .95 / ≥ .90,
  SRMR < .08 / < .10 → 2 / 1 points each. df = 0 → no fit points.
* Parsimony (12): 12 − 0.6 × max(0, BIC(player) − BIC(true structure)).
* `CONFIG.ROUNDS` = 5 datasets per game, then the diploma if the total is at
  least 60 / 100 (`CONFIG.DIPLOMA`): no stars at 60, one at 70, two at 80,
  three at 90. Below 60 a "No diploma this time" sheet with a NOT AWARDED stamp. `CONFIG.LEVELS` sets each level's medal and the sample
  sizes drawn (Psychometrika: N = 300–1000).
* Diploma: "Save as image" draws a PNG, tries a download (works standalone)
  and always shows the image so it can be saved with right-click / long-press
  (works inside the Galvoro iframe, whose sandbox blocks downloads). "Print"
  is hidden when embedded (no `allow-modals`, so `print()` would be ignored).
* An empty canvas fits the baseline (independence) model after a confirming
  second press of FIT.

## Verification (`.dev/`, never published)

* `node .dev/validate_bank.js 20 150 500` (Psychometrika: `... 300 1000`) — every template identified and
  generated within the try budget; draws needed and generation time.
* `node .dev/verify_lavaan.js 3 && Rscript .dev/verify_lavaan.R` — random
  player models vs lavaan (last run: 126 models, χ² within .0013, BIC within
  .0034, RMSEA/CFI/TLI/SRMR within 2e-6; standardized estimates differ only for
  improper solutions, which the game rejects).
* `node .dev/verify_glasso.js 4 && Rscript .dev/verify_glasso.R` — EBICglasso
  vs `qgraph::EBICglasso` (last run: 192 datasets, networks within .0013,
  one tiny edge differing in one case; model-implied matrices within .0001).
* `node .dev/verify_rcode.js` — the in-game "Check in R" code reproduces the fit.
* `node .dev/smoke_full_game.js [baseURL]` — plays a five-round Easy game in
  headless Chrome up to the diploma (serve the folder on port 8765 first, or
  pass a URL).

`index.html?seed=123` gives a reproducible sequence of datasets.
