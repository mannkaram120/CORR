/**
 * portfolio.ts — Portfolio metrics from correlation matrix + weights + realized vols.
 *
 * VaR now uses actual annualized volatility per instrument fetched from the backend.
 * Formula: sigma_p = sqrt(w^T * Sigma * w)
 * where Sigma[i][j] = r(i,j) * vol_i * vol_j  (covariance from correlation + vols)
 *
 * Falls back to unit vol (sigma_i = 1) if vols are unavailable — clearly labelled.
 */

import type { PortfolioMetrics, PortfolioWeights, CorrelationMatrix } from '../types';

// Portfolio value assumption for VaR display
const PORTFOLIO_VALUE = 10_000;
const Z_99 = 2.326; // 99% one-tailed

export function computePortfolioMetrics(
  weights: PortfolioWeights,
  corrMatrix: CorrelationMatrix,
  realizedVols?: Map<string, number>,   // annualized vol per ticker — optional
): PortfolioMetrics {
  const tickers = corrMatrix.tickers;
  const matrix  = corrMatrix.matrix;
  const n       = tickers.length;

  const w    = tickers.map(t => weights[t] ?? 0);
  const sumW = w.reduce((s, v) => s + v, 0);

  if (sumW < 1e-12) {
    return {
      weightedCorr:               0,
      effectiveN:                 n,
      portfolioVaR:               0,
      correlationVaRContribution: 0,
      marginalDiversification:    tickers.map(ticker => ({ ticker, md: 0 })),
      usingRealVols:              false,
    };
  }

  const wNorm = w.map(v => v / sumW);

  // ── Per-instrument daily volatility ──────────────────────────────────────
  // Use realized annualized vols if provided, else fall back to unit vol (1.0)
  const hasRealVols = realizedVols && realizedVols.size > 0;
  const vols: number[] = tickers.map(t => {
    if (hasRealVols) {
      const v = realizedVols!.get(t);
      // Convert annualized vol to daily: sigma_daily = sigma_annual / sqrt(252)
      return v ? v / Math.sqrt(252) : 1.0;
    }
    return 1.0; // unit vol fallback
  });

  // ── Weighted average correlation (off-diagonal) ───────────────────────────
  let weightedCorr = 0, totalPairWeight = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pw = wNorm[i]! * wNorm[j]!;
      weightedCorr   += pw * matrix[i]![j]!;
      totalPairWeight += pw;
    }
  }
  weightedCorr = totalPairWeight > 0 ? weightedCorr / totalPairWeight : 0;

  // ── Effective N ───────────────────────────────────────────────────────────
  const hhi       = wNorm.reduce((s, v) => s + v * v, 0);
  const effectiveN = hhi > 1e-12 ? 1 / hhi : n;

  // ── Portfolio variance using covariance = r(i,j) * vol_i * vol_j ─────────
  // Sigma[i][j] = corr[i][j] * vol_i * vol_j  (daily covariance matrix)
  let portfolioVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const corr_ij = i === j ? 1.0 : (matrix[i]?.[j] ?? 0);
      portfolioVar += wNorm[i]! * wNorm[j]! * corr_ij * vols[i]! * vols[j]!;
    }
  }
  const portfolioStd = Math.sqrt(Math.max(0, portfolioVar)); // daily std

  // ── 1-day VaR at 99% confidence ──────────────────────────────────────────
  const portfolioVaR = portfolioStd * Z_99 * PORTFOLIO_VALUE;

  // ── Uncorrelated baseline VaR (all off-diagonal r = 0) ───────────────────
  // sigma_uncorr = sqrt(sum(w_i^2 * vol_i^2))
  const uncorrVar = wNorm.reduce((s, wi, i) => s + wi * wi * vols[i]! * vols[i]!, 0);
  const uncorrVaR = Math.sqrt(uncorrVar) * Z_99 * PORTFOLIO_VALUE;
  const correlationVaRContribution = portfolioVaR - uncorrVaR;

  // ── Marginal diversification ──────────────────────────────────────────────
  // d(portfolio_var) / d(w_i) = 2 * sum_j [w_j * cov(i,j)]
  // Normalised by 2 * sigma_p for interpretability
  const marginalDiversification = tickers.map((ticker, i) => {
    let covContrib = 0;
    for (let j = 0; j < n; j++) {
      const corr_ij = i === j ? 1.0 : (matrix[i]?.[j] ?? 0);
      covContrib += wNorm[j]! * corr_ij * vols[i]! * vols[j]!;
    }
    // Marginal contribution to portfolio std
    const md = portfolioStd > 0
      ? (wNorm[i]! * covContrib) / portfolioStd
      : 0;
    return { ticker, md };
  });

  return {
    weightedCorr,
    effectiveN,
    portfolioVaR,
    correlationVaRContribution,
    marginalDiversification,
    usingRealVols: !!hasRealVols,
  };
}
