/**
 * Beta coefficient utilities.
 *
 * FIX 1: Rolling beta date anchor is now dynamic (new Date()) instead of hardcoded.
 * FIX 2: Added comment clarifying that Spearman/Kendall beta is a non-standard
 *         rank-based proxy, not a classical regression beta.
 */

import type { CorrelationMethod } from '../types';
import { pearson, spearman, kendall } from '../utils/correlation';

export function betaOf(
  xs: number[],
  ys: number[],
  method: CorrelationMethod = 'Pearson'
): { beta: number; r: number; sigmaRatio: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { beta: 0, r: 0, sigmaRatio: 1 };
  const meanX = xs.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanY = ys.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    varX += (xs[i]! - meanX) ** 2;
    varY += (ys[i]! - meanY) ** 2;
  }
  const sigX = Math.sqrt(varX / (n - 1));
  const sigY = Math.sqrt(varY / (n - 1));
  if (sigX < 1e-12) return { beta: 0, r: 0, sigmaRatio: 0 };

  const corFn = method === 'Spearman' ? spearman : method === 'Kendall' ? kendall : pearson;
  const r = corFn(xs.slice(0, n), ys.slice(0, n));
  const sigmaRatio = sigY / sigX;

  /**
   * NOTE: For Pearson, beta = r * (sigY / sigX) is the standard OLS slope.
   * For Spearman/Kendall, this formula produces a rank-based beta proxy.
   * It is NOT a classical regression beta — the sigma ratio applies to the
   * original series, not the ranked series. Treat as an approximation only.
   */
  return { beta: r * sigmaRatio, r, sigmaRatio };
}

export function computeBetaMatrix(
  returnSeries: Map<string, number[]>,
  tickers: string[],
  method: CorrelationMethod
): { beta: number[][]; r: number[][]; sigmaRatio: number[][] } {
  const n = tickers.length;
  const beta       = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  const r          = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const sigmaRatio = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  for (let i = 0; i < n; i++) {
    const xi = returnSeries.get(tickers[i]!) ?? [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const xj = returnSeries.get(tickers[j]!) ?? [];
      const res = betaOf(xi, xj, method);
      beta[i]![j] = res.beta;
      r[i]![j] = res.r;
      sigmaRatio[i]![j] = res.sigmaRatio;
    }
  }
  return { beta, r, sigmaRatio };
}

/**
 * Rolling beta between xs (benchmark) and ys (instrument).
 * FIX: date anchor is now dynamic instead of hardcoded to '2026-03-19'.
 * Pass anchorDate explicitly in tests; production uses new Date().
 */
export function rollingBeta(
  xs: number[],
  ys: number[],
  method: CorrelationMethod = 'Pearson',
  window = 30,
  anchorDate?: Date
): Array<{ date: string; beta: number }> {
  const n = Math.min(xs.length, ys.length);
  const result: Array<{ date: string; beta: number }> = [];
  const today = anchorDate ?? new Date();
  for (let t = window; t <= n; t++) {
    const { beta } = betaOf(xs.slice(t - window, t), ys.slice(t - window, t), method);
    const d = new Date(today);
    d.setDate(d.getDate() - (n - t));
    result.push({ date: d.toISOString().slice(0, 10), beta: +beta.toFixed(4) });
  }
  return result;
}
