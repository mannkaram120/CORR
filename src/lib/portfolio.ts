/**
 * Portfolio metrics derived from a correlation/covariance matrix and weights.
 *
 * FIX: Portfolio VaR now documents clearly that it assumes unit volatility per
 * asset (i.e. uses the correlation matrix as if it were a covariance matrix).
 * If raw returns are provided without vol-normalisation, the VaR figure will
 * not reflect actual dollar risk — it is a relative / structural measure only.
 * To get true VaR, pre-normalise returns by each asset's historical volatility
 * before computing the correlation matrix, or pass a true covariance matrix.
 */

import type { PortfolioMetrics, PortfolioWeights, CorrelationMatrix } from '../types';

export function computePortfolioMetrics(
  weights: PortfolioWeights,
  corrMatrix: CorrelationMatrix
): PortfolioMetrics {
  const tickers = corrMatrix.tickers;
  const matrix  = corrMatrix.matrix;
  const n = tickers.length;
  const w = tickers.map(t => weights[t] ?? 0);
  const sumW = w.reduce((s, v) => s + v, 0);
  if (sumW < 1e-12) {
    return {
      weightedCorr: 0,
      effectiveN: n,
      portfolioVaR: 0,
      correlationVaRContribution: 0,
      marginalDiversification: tickers.map(ticker => ({ ticker, md: 0 })),
    };
  }
  const wNorm = w.map(v => v / sumW);

  // Weighted average correlation (off-diagonal only)
  let weightedCorr = 0, totalPairWeight = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pw = wNorm[i]! * wNorm[j]!;
      weightedCorr += pw * matrix[i]![j]!;
      totalPairWeight += pw;
    }
  }
  weightedCorr = totalPairWeight > 0 ? weightedCorr / totalPairWeight : 0;

  // Effective N (Herfindahl-based): 1 / sum(wi^2)
  const hhi = wNorm.reduce((s, v) => s + v * v, 0);
  const effectiveN = hhi > 1e-12 ? 1 / hhi : n;

  /**
   * Portfolio variance using the correlation matrix.
   * ASSUMPTION: each asset has unit volatility (sigma_i = 1).
   * This treats the correlation matrix as the covariance matrix.
   * The resulting VaR is a structural/relative measure, not an absolute
   * dollar-risk figure, unless returns have been vol-normalised beforehand.
   */
  let portfolioVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portfolioVar += wNorm[i]! * wNorm[j]! * (matrix[i]?.[j] ?? (i === j ? 1 : 0));
    }
  }
  const portfolioStd = Math.sqrt(Math.max(0, portfolioVar));

  // Z-score for 99% one-tailed VaR
  const Z_99 = 2.326;
  const portfolioVaR = portfolioStd * Z_99 * 10000; // expressed in basis points

  // Uncorrelated baseline (all rho_ij = 0 for i != j): sigma_p = sqrt(sum wi^2)
  const uncorrStd = Math.sqrt(wNorm.reduce((s, v) => s + v * v, 0));
  const uncorrVaR = uncorrStd * Z_99 * 10000;
  const correlationVaRContribution = portfolioVaR - uncorrVaR;

  const marginalDiversification = tickers.map((ticker, i) => {
    let contrib = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) contrib += wNorm[j]! * (matrix[i]?.[j] ?? 0);
    }
    return { ticker, md: contrib * wNorm[i]! };
  });

  return { weightedCorr, effectiveN, portfolioVaR, correlationVaRContribution, marginalDiversification };
}
