/**
 * Statistical correlation utilities: Pearson, Spearman, Kendall.
 * Computes two-tailed p-values using the correct null distribution for each method.
 *
 * FIX 1: pearsonPValue was previously used for all three methods.
 *         Spearman and Kendall now use their own p-value approximations.
 * FIX 2: Rolling correlation date anchor is now dynamic (new Date()).
 */

import { tDistPValue, mean } from './mathUtils';

// ── Pearson ───────────────────────────────────────────────────────────────────

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n)), my = mean(ys.slice(0, n));
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom < 1e-10 ? 0 : Math.max(-1, Math.min(1, num / denom));
}

/**
 * Two-tailed p-value for Pearson r with n observations.
 * Uses t-distribution with df = n - 2.
 */
export function pearsonPValue(r: number, n: number): number {
  if (n <= 2) return 1;
  const t = r * Math.sqrt((n - 2) / Math.max(1 - r * r, 1e-10));
  return tDistPValue(t, n - 2);
}

// ── Spearman ─────────────────────────────────────────────────────────────────

function rankArray(xs: number[]): number[] {
  const indexed = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(xs.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length - 1 && indexed[j + 1].v === indexed[j].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  return pearson(rankArray(xs.slice(0, n)), rankArray(ys.slice(0, n)));
}

/**
 * Two-tailed p-value for Spearman rho.
 * Uses the t-approximation: t = rho * sqrt((n-2) / (1 - rho^2)), df = n - 2.
 * Standard large-sample approximation (Zar, 1972). Valid for n >= 10.
 */
export function spearmanPValue(rho: number, n: number): number {
  if (n <= 2) return 1;
  const t = rho * Math.sqrt((n - 2) / Math.max(1 - rho * rho, 1e-10));
  return tDistPValue(t, n - 2);
}

// ── Kendall ──────────────────────────────────────────────────────────────────

export function kendall(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  let concordant = 0, discordant = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const signX = Math.sign(xs[j] - xs[i]);
      const signY = Math.sign(ys[j] - ys[i]);
      if (signX === 0 || signY === 0) continue;
      if (signX === signY) concordant++; else discordant++;
    }
  }
  const total = concordant + discordant;
  return total === 0 ? 0 : (concordant - discordant) / total;
}

/**
 * Two-tailed p-value for Kendall tau-b.
 * Uses normal approximation: z = tau / sqrt(2(2n+5) / (9n(n-1))).
 * Valid for n >= 10 (Berry, Johnston & Mielke, 2011).
 */
export function kendallPValue(tau: number, n: number): number {
  if (n <= 3) return 1;
  const variance = (2 * (2 * n + 5)) / (9 * n * (n - 1));
  const z = tau / Math.sqrt(variance);
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return Math.min(1, Math.max(0, p));
}

/** Standard normal CDF via Abramowitz & Stegun approximation (error < 7.5e-8). */
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t * (0.31938153 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
}

// ── Full matrix computation ───────────────────────────────────────────────────

import type { CorrelationMethod } from '../types';

export interface MatrixResult {
  matrix: number[][];
  pValues: number[][];
}

export function computeMatrix(
  returnSeries: Map<string, number[]>,
  tickers: string[],
  method: CorrelationMethod
): MatrixResult {
  const n = tickers.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const pValues: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(1));

  const corFn = method === 'Pearson' ? pearson : method === 'Spearman' ? spearman : kendall;

  // FIX: use the correct p-value function for each method
  const pFn =
    method === 'Pearson'
      ? pearsonPValue
      : method === 'Spearman'
      ? spearmanPValue
      : kendallPValue;

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    pValues[i][i] = 0;
    const xi = returnSeries.get(tickers[i]) ?? [];
    for (let j = i + 1; j < n; j++) {
      const xj = returnSeries.get(tickers[j]) ?? [];
      const len = Math.min(xi.length, xj.length);
      const r = corFn(xi.slice(0, len), xj.slice(0, len));
      const p = pFn(r, len);
      matrix[i][j] = r;
      matrix[j][i] = r;
      pValues[i][j] = p;
      pValues[j][i] = p;
    }
  }

  return { matrix, pValues };
}

/**
 * Compute 30-day rolling Pearson correlation between two series.
 * FIX: date anchor is now dynamic instead of hardcoded.
 * Pass anchorDate explicitly in tests; production uses new Date().
 */
export function rollingCorrelation(
  xs: number[],
  ys: number[],
  window = 30,
  anchorDate?: Date
): Array<{ date: string; r: number }> {
  const n = Math.min(xs.length, ys.length);
  const result: Array<{ date: string; r: number }> = [];
  const today = anchorDate ?? new Date();

  for (let t = window; t <= n; t++) {
    const xSlice = xs.slice(t - window, t);
    const ySlice = ys.slice(t - window, t);
    const r = pearson(xSlice, ySlice);
    const d = new Date(today);
    d.setDate(d.getDate() - (n - t));
    result.push({ date: d.toISOString().slice(0, 10), r: +r.toFixed(4) });
  }

  return result;
}
