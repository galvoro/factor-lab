# Companion of verify_lavaan.js: fit every exported case in lavaan and compare.
suppressMessages(library(lavaan)); library(jsonlite)
cases <- fromJSON(".dev/out/lav_cases.json", simplifyVector = FALSE)
worst <- c(chisq = 0, rmsea = 0, cfi = 0, tli = 0, srmr = 0, bic = 0, std = 0)
bad <- 0; lavNoConv <- 0; rows <- list()
for (e in cases) {
  env <- new.env()
  code <- readLines(sprintf(".dev/out/lav_case_%d.R", e$k), warn = FALSE)
  code <- code[!grepl("^fitMeasures|^standardizedSolution", code)]
  ok <- tryCatch({ suppressWarnings(eval(parse(text = code), envir = env)); TRUE }, error = function(err) FALSE)
  if (!ok || !lavInspect(env$fit, "converged")) { lavNoConv <- lavNoConv + 1; next }
  fit <- env$fit
  fm <- fitMeasures(fit, c("chisq", "rmsea", "cfi", "tli", "srmr", "bic"))
  js <- unlist(e[c("chisq", "rmsea", "cfi", "tli", "srmr", "bic")])
  d <- abs(fm - js)
  ss <- suppressWarnings(standardizedSolution(fit))
  nm <- paste0(ss$lhs, ss$op, ss$rhs)
  jsStd <- unlist(e$std)
  m <- match(names(jsStd), nm)
  rev <- sub("^(.*)~~(.*)$", "\\2~~\\1", names(jsStd))
  m[is.na(m)] <- match(rev[is.na(m)], nm)
  dstd <- if (any(is.na(m))) NA else max(abs(ss$est.std[m] - jsStd))
  d <- c(d, std = dstd)
  if (any(is.na(d))) { cat("case", e$k, "name mismatch:", names(jsStd)[is.na(m)], "\n"); next }
  worst <- pmax(worst, d)
  if (d["chisq"] > 0.01 || d["std"] > 0.005) { bad <- bad + 1; cat(sprintf("case %d (%s): dchisq %.4f dstd %.4f improper=%s\n", e$k, e$model, d["chisq"], d["std"], e$improper)) }
}
cat(sprintf("\n%d cases compared, %d not converged in lavaan, %d with differences beyond 0.01 (chisq) / 0.005 (std)\n", length(cases) - lavNoConv, lavNoConv, bad))
cat("max abs differences:\n"); print(signif(worst, 3))
