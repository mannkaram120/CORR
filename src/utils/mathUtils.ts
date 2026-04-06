/**
 * Shared statistical math utilities.
 * Centralised here to avoid duplication across correlation.ts and grangerWorker.ts.
 */

/** Lanczos approximation to the log-gamma function (Numerical Recipes coefficients).
 *  Accurate to ~15 significant figures for x > 0. */
export function lgamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const ci of c) {
    y += 1;
    ser += ci / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Regularised incomplete beta function I_x(a,b) via Lentz continued fraction.
 *  Used for t-, F-, and beta-distribution CDFs. */
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaInc(b, a, 1 - x);
  const maxIter = 200, eps = 1e-10;
  let C = 1,
    D = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(D) < 1e-30) D = 1e-30;
  D = 1 / D;
  let h = D;
  for (let m = 1; m <= maxIter; m++) {
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    D = 1 + num * D;
    if (Math.abs(D) < 1e-30) D = 1e-30;
    D = 1 / D;
    C = 1 + num / C;
    if (Math.abs(C) < 1e-30) C = 1e-30;
    h *= D * C;
    num = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    D = 1 + num * D;
    if (Math.abs(D) < 1e-30) D = 1e-30;
    D = 1 / D;
    C = 1 + num / C;
    if (Math.abs(C) < 1e-30) C = 1e-30;
    const delta = D * C;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return front * h;
}

/** Two-tailed p-value using the t-distribution with df degrees of freedom.
 *  Valid for Pearson r: t = r * sqrt((n-2) / (1 - r^2)), df = n - 2. */
export function tDistPValue(t: number, df: number): number {
  if (df <= 0) return 1;
  const x = df / (df + t * t);
  const p = betaInc(df / 2, 0.5, x);
  return Math.min(1, Math.max(0, p));
}

/** F-distribution p-value P(F > f) with df1 numerator and df2 denominator df. */
export function fDistPValue(F: number, df1: number, df2: number): number {
  if (!isFinite(F) || F <= 0) return 1;
  const x = df2 / (df2 + df1 * F);
  return betaInc(df2 / 2, df1 / 2, x);
}

/** Sample standard deviation (divides by n-1). Returns 0 for n < 2. */
export function sampleStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = xs.reduce((s, v) => s + v, 0) / n;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
}

/** Sample mean. Returns 0 for empty array. */
export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}
