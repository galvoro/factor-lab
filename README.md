# FACTOR FIND (working title)

PLAY/LEARN Galvoro capsule for PL5225 Structural Equation Modeling. Each game,
N = 150–500 observations are simulated from a hidden factor model (4–9 items,
1–3 factors, possible cross-loadings, residual correlations, negative or zero
factor correlations). The player reads the correlational structure on the left
(scree plot, heatmap, correlation network, partial-correlation network), draws a
path diagram on the right and presses FIT once.

LEARN mode is not built yet (button shows "coming soon").

## Files

| File | Role |
|---|---|
| `linalg.js` | small matrix helpers, Jacobi eigen, chi-square tail, seeded RNG |
| `glasso.js` | graphical lasso + EBIC model selection (as `qgraph::EBICglasso`, gamma 0.5), written from the published algorithm; used for the regularized partial correlation networks (data and model-implied) |
| `sem.js` | ML estimation (Fisher scoring, std.lv identification), fit indices, identification check, lavaan export |
| `bank.js` | 48 structure templates (levels 1–3), random parameter draws (`RANGES`), data simulation, plain-language description and structure comparison |
| `plots.js` | qgraph-style scree / heatmap / networks; `springLayout` is a port of qgraph's Fruchterman–Reingold |
| `editor.js` | SVG path-diagram editor: double-click adds a factor and opens the indicator picker (double-click a factor to edit its items); residual correlations are drawn between the items' hidden residuals |
| `game.js` | game flow, dashboards, fit card, scoring (`CONFIG` / `CRITERIA` at the top), true-model reveal |
| `tutorial.js`, `audio.js` | briefing cards; `GaltonAudio` SFX (+ optional `assets/bgm.mp3`) |

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
* Fit (40): χ² p ≥ .05 / ≥ .01, RMSEA < .05 / < .08, CFI ≥ .95 / ≥ .90,
  SRMR < .08 / < .10 → 10 / 5 points each. df = 0 → no fit points.
* Parsimony (60): 60 − 3 × max(0, BIC(player) − BIC(true structure)).
* `CONFIG.ROUNDS` = 1 (single-dataset games with a session average). Set it
  to e.g. 5 for multi-round games with a final screen.

## Verification (`.dev/`, never published)

* `node .dev/validate_bank.js 20 150 500` — every template identified and
  generated within the try budget; draws needed and generation time.
* `node .dev/verify_lavaan.js 3 && Rscript .dev/verify_lavaan.R` — random
  player models vs lavaan (last run: 126 models, χ² within .0013, BIC within
  .0034, RMSEA/CFI/TLI/SRMR within 2e-6; standardized estimates differ only for
  improper solutions, which the game rejects).
* `node .dev/verify_glasso.js 4 && Rscript .dev/verify_glasso.R` — EBICglasso
  vs `qgraph::EBICglasso` (last run: 192 datasets, networks within .0013,
  one tiny edge differing in one case; model-implied matrices within .0001).
* `node .dev/verify_rcode.js` — the in-game "Check in R" code reproduces the fit.
* `node .dev/smoke_full_game.js [baseURL]` — plays three games in headless
  Chrome (serve the folder on port 8765 first, or pass a URL).

`index.html?seed=123` gives a reproducible sequence of datasets.
