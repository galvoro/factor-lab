# FACTOR FIND (working title)

PLAY/LEARN Galvoro capsule for PL5225 Structural Equation Modeling. Each round,
N = 200 observations are simulated from a hidden factor model (4–9 items, 1–3
factors, possible cross-loadings and residual correlations). The player reads
the correlational structure on the left (scree plot, heatmap, correlation
network, partial-correlation network), draws a path diagram on the right and
presses FIT.

LEARN mode is not built yet (button shows "coming soon").

## Files

| File | Role |
|---|---|
| `linalg.js` | small matrix helpers, Jacobi eigen, chi-square tail, seeded RNG |
| `sem.js` | ML estimation (Fisher scoring, std.lv identification), fit indices, identification check, lavaan export |
| `bank.js` | the 20 true models (tiers 1–4), data simulation, true-model values |
| `plots.js` | qgraph-style scree / heatmap / networks; `springLayout` is a port of qgraph's Fruchterman–Reingold |
| `editor.js` | SVG path-diagram editor |
| `game.js` | rounds, dashboard views, scoring (`CONFIG` at the top), reveal, final screen |
| `tutorial.js`, `audio.js` | briefing cards; `GaltonAudio` SFX (+ optional `assets/bgm.mp3`) |

## Scoring (edit `CONFIG` in `game.js`)

* Fit: RMSEA < .05 → 10, < .08 → 5. df = 0 or an improper solution → 0.
* Parsimony (at lock-in): BIC(player) − BIC(true structure, same data) ≤ 2 → +10, ≤ 10 → +5.
* 3 fits per round; each fit after the first costs 2 points. 5 rounds, max 100.
* Datasets are redrawn until the true structure itself has RMSEA < .05 and a
  proper solution, so recovering the truth always earns full points.

## Verification (`.dev/`, never published)

* `node .dev/validate_bank.js 100` — Monte Carlo audit of the bank (does the
  true model fit; do simpler models fail).
* `node .dev/verify_lavaan.js 6 && Rscript .dev/verify_lavaan.R` — random
  player models vs lavaan (last run: 99 models, χ²/BIC within 4e-4,
  RMSEA/CFI/TLI/SRMR within 2e-6).
* `node .dev/verify_rcode.js` — the in-game "Check in R" code reproduces the fit.
* `node .dev/smoke_full_game.js` — plays a full game in headless Chrome
  (serve the folder on port 8765 first).

`index.html?seed=123` gives a reproducible game.
