/**
 * PCA utilities: Jacobi eigendecomposition, absorption ratios, PC1 loadings.
 *
 * FIX: computePCAResult previously used `values` (unsorted eigenvalues) to find
 * the PC1 index while `sorted` was used for absorption ratios. These were
 * consistent only by coincidence. Now the code explicitly finds maxIdx from
 * the sorted eigenvalues and maps back to the correct eigenvector column,
 * making the logic explicit and robust.
 */

import type { PCAResult, AssetClass } from '../types';
import { INSTRUMENT_MAP } from '../data/instruments';

/** Jacobi eigendecomposition for symmetric matrices.
 *  Returns { values, vectors } sorted in descending order of eigenvalue. */
export function eigenDecompose(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  let A = matrix.map(row => [...row]);
  let V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  const maxIter = 100;
  for (let iter = 0; iter < maxIter; iter++) {
    let maxVal = 0, p = 0, q = 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(A[i]![j]!) > maxVal) {
          maxVal = Math.abs(A[i]![j]!); p = i; q = j;
        }
      }
    }
    if (maxVal < 1e-10) break;

    const app = A[p]![p]!, aqq = A[q]![q]!, apq = A[p]![q]!;
    const theta = (aqq - app) / (2 * apq);
    const t = theta === 0 ? 1 : Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta)); // FIX: theta=0 (equal diagonals) must rotate 45° not 0°
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    const Anew = A.map(row => [...row]);
    Anew[p]![p] = app - t * apq;
    Anew[q]![q] = aqq + t * apq;
    Anew[p]![q] = 0; Anew[q]![p] = 0;
    for (let r = 0; r < n; r++) {
      if (r !== p && r !== q) {
        Anew[r]![p] = c * A[r]![p]! - s * A[r]![q]!;
        Anew[p]![r] = Anew[r]![p]!;
        Anew[r]![q] = s * A[r]![p]! + c * A[r]![q]!;
        Anew[q]![r] = Anew[r]![q]!;
      }
    }
    A = Anew;

    const Vnew: number[][] = V.map(row => [...row]);
    for (let r = 0; r < n; r++) {
      Vnew[r]![p] = c * V[r]![p]! - s * V[r]![q]!;
      Vnew[r]![q] = s * V[r]![p]! + c * V[r]![q]!;
    }
    V = Vnew;
  }

  // FIX: sort eigenvalues descending and reorder eigenvector columns to match
  const unsortedValues = A.map((row, i) => row[i]!);
  const order = unsortedValues
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v)
    .map(x => x.i);

  const sortedValues = order.map(i => unsortedValues[i]!);
  const sortedVectors: number[][] = V.map(row => order.map(i => row[i]!));

  return { values: sortedValues, vectors: sortedVectors };
}

/** computeAbsorptionRatio — takes pre-computed eigenvalues array (sorted descending) */
export function computeAbsorptionRatio(eigenvalues: number[], k: number): number {
  const total = eigenvalues.reduce((s, v) => s + Math.max(0, v), 0);
  if (total < 1e-12) return 0;
  return eigenvalues.slice(0, k).reduce((s, v) => s + Math.max(0, v), 0) / total;
}

/** computePC1Loadings — column 0 of sortedVectors is PC1 (largest eigenvalue) */
export function computePC1Loadings(eigenvectors: number[][], eigenvalues: number[]): number[] {
  // With sorted eigenvalues, the largest is always index 0
  const maxIdx = eigenvalues.indexOf(Math.max(...eigenvalues));
  return eigenvectors.map(row => row[maxIdx] ?? 0);
}

const AR1_HISTORICAL = [0.28, 0.31, 0.35, 0.38, 0.42, 0.46, 0.50, 0.55, 0.61, 0.68, 0.75];

export function ar1Percentile(ar1: number): number {
  return Math.round(AR1_HISTORICAL.filter(v => v <= ar1).length / AR1_HISTORICAL.length * 100);
}

/** Full PCA result — used by components that don't go through nexusStore */
export function computePCAResult(
  corrMatrix: number[][],
  tickers: string[],
  ar1History: Array<{ date: string; ar1: number }> = []
): PCAResult {
  // eigenDecompose now returns values and vectors already sorted descending
  const { values, vectors } = eigenDecompose(corrMatrix);
  const total = values.reduce((s, v) => s + Math.max(0, v), 0) || 1;

  // FIX: PC1 is always column 0 now that eigenvalues are sorted
  const ar1    = Math.max(0, values[0]!) / total;
  const ar3    = values.slice(0, 3).reduce((s, v) => s + Math.max(0, v), 0) / total;
  const arHalf = values
    .slice(0, Math.floor(tickers.length / 2))
    .reduce((s, v) => s + Math.max(0, v), 0) / total;

  const pc1Loadings = tickers.map((ticker, i) => {
    const instr = INSTRUMENT_MAP.get(ticker);
    return {
      ticker,
      loading: vectors[i]?.[0] ?? 0, // column 0 = PC1 (sorted)
      assetClass: (instr?.assetClass ?? 'FX') as AssetClass,
      name: instr?.name ?? ticker,
    };
  }).sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading));

  return {
    eigenvalues: values,
    eigenvectors: vectors,
    absorptionRatios: { ar1, ar3, arHalf },
    ar1Percentile: ar1Percentile(ar1),
    ar1History,
    pc1Loadings,
  };
}
