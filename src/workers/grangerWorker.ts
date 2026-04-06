/**
 * Granger Causality Web Worker
 * Receives: { tickers: string[], returnSeries: [string, number[]][], lags: number }
 * Returns:  { ok: true, matrix: GrangerMatrix } | { ok: false, error: string }
 *
 * Tests H0: X does NOT Granger-cause Y
 * Uses F-test on restricted vs unrestricted VAR(p) model.
 *
 * FIX: betaInc and lgamma are now imported from shared mathUtils instead of
 *      being duplicated here. This eliminates the maintenance risk of two
 *      independent copies diverging over time.
 */

import { fDistPValue } from '../utils/mathUtils';

interface GrangerMatrix {
  tickers: string[];
  pValue: number[][];
  alpha: number;
}

/** Simple OLS: returns residual sum of squares for y ~ X */
function ols(y: number[], X: number[][]): number {
  const n = y.length;
  const k = X[0]!.length;
  if (n <= k) return Infinity;

  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      Xty[j] += X[i]![j]! * y[i]!;
      for (let l = 0; l < k; l++) {
        XtX[j]![l] += X[i]![j]! * X[i]![l]!;
      }
    }
  }

  // Invert XtX via Gaussian elimination with partial pivoting
  const aug: number[][] = XtX.map((row, i) => [
    ...row,
    ...new Array(k).fill(0).map((_, j) => (i === j ? 1 : 0)),
  ]);

  for (let i = 0; i < k; i++) {
    let maxRow = i;
    for (let r = i + 1; r < k; r++) {
      if (Math.abs(aug[r]![i]!) > Math.abs(aug[maxRow]![i]!)) maxRow = r;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow]!, aug[i]!];
    const pivot = aug[i]![i]!;
    if (Math.abs(pivot) < 1e-12) return Infinity;
    for (let j = 0; j < 2 * k; j++) aug[i]![j] /= pivot;
    for (let r = 0; r < k; r++) {
      if (r !== i) {
        const factor = aug[r]![i]!;
        for (let j = 0; j < 2 * k; j++) aug[r]![j] -= factor * aug[i]![j]!;
      }
    }
  }

  const inv: number[][] = aug.map(row => row.slice(k));
  const beta: number[] = inv.map(row => row.reduce((s, v, j) => s + v * Xty[j]!, 0));

  let rss = 0;
  for (let i = 0; i < n; i++) {
    const yhat = X[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    rss += (y[i]! - yhat) ** 2;
  }
  return rss;
}

/**
 * Granger causality test: does X Granger-cause Y?
 * Returns p-value of F-test with H0: X does not Granger-cause Y.
 */
function grangerTest(y: number[], x: number[], lags: number): number {
  const n = y.length;
  const minN = lags * 2 + 10;
  if (n < minN) return 1;

  const T = n - lags;

  // Restricted model: Y ~ Y_lags only (intercept + lags Y terms)
  const Yr: number[] = [];
  const Xr: number[][] = [];
  for (let t = lags; t < n; t++) {
    Yr.push(y[t]!);
    const row = [1];
    for (let l = 1; l <= lags; l++) row.push(y[t - l]!);
    Xr.push(row);
  }

  // Unrestricted model: Y ~ Y_lags + X_lags
  const Yu: number[] = [...Yr];
  const Xu: number[][] = Xr.map((row, i) => {
    const t = i + lags;
    const xLags = [];
    for (let l = 1; l <= lags; l++) xLags.push(x[t - l]!);
    return [...row, ...xLags];
  });

  const rssR = ols(Yr, Xr);
  const rssU = ols(Yu, Xu);

  if (!isFinite(rssR) || !isFinite(rssU) || rssU < 1e-12) return 1;

  const kR = lags + 1;
  const kU = lags * 2 + 1;
  const df1 = kU - kR;
  const df2 = T - kU;
  if (df1 <= 0 || df2 <= 0) return 1;

  const F = ((rssR - rssU) / df1) / (rssU / df2);
  return fDistPValue(F, df1, df2);
}

self.onmessage = (e: MessageEvent) => {
  try {
    const { tickers, returnSeries, lags } = e.data as {
      tickers: string[];
      returnSeries: Record<string, number[]>;
      lags: number;
    };

    const seriesMap = new Map<string, number[]>(Object.entries(returnSeries));
    const n = tickers.length;
    const pValue: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));

    for (let i = 0; i < n; i++) {
      const xi = seriesMap.get(tickers[i]!) ?? [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const yj = seriesMap.get(tickers[j]!) ?? [];
        pValue[i]![j] = grangerTest(yj, xi, lags);
      }
    }

    const matrix: GrangerMatrix = { tickers, pValue, alpha: 0.05 };
    self.postMessage({ ok: true, matrix });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
