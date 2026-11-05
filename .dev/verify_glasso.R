# Companion of verify_glasso.js: qgraph::EBICglasso on the same matrices.
suppressMessages({ library(qgraph); library(jsonlite) })
cases <- fromJSON(".dev/out/glasso_cases.json", simplifyVector = TRUE, simplifyMatrix = TRUE)
cmp <- function(R, net, N) {
  q <- suppressWarnings(suppressMessages(EBICglasso(R, n = N)))
  js <- as.matrix(net)
  ut <- upper.tri(q)
  c(maxdiff = max(abs(q - js)), edgesQ = sum(q[ut] != 0), edgesJS = sum(abs(js[ut]) > 1e-12),
    mismatch = sum((q[ut] != 0) != (abs(js[ut]) > 1e-12)))
}
res <- t(sapply(seq_len(nrow(cases)), function(i) cmp(cases$R[[i]], cases$net[[i]], cases$N[i])))
resi <- t(sapply(seq_len(nrow(cases)), function(i) cmp(cases$Ri[[i]], cases$neti[[i]], cases$N[i])))
rep <- function(x, label) {
  cat(sprintf("%s: %d cases | max |diff| median %.4f, 95%% %.4f, max %.4f | cases > .005: %d | edge-set mismatches: %d cases (%d edges)\n",
    label, nrow(x), median(x[, "maxdiff"]), quantile(x[, "maxdiff"], .95), max(x[, "maxdiff"]),
    sum(x[, "maxdiff"] > .005), sum(x[, "mismatch"] > 0), sum(x[, "mismatch"])))
}
rep(res, "data         ")
rep(resi, "model-implied")
bad <- which(res[, "maxdiff"] > .005)
if (length(bad)) { cat("largest differences (data):\n"); print(head(cbind(id = cases$id[bad], N = cases$N[bad], round(res[bad, ], 4)), 10)) }
