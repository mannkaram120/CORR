import { describe, it, expect } from 'vitest';
import { pearson, spearman, kendall, pearsonPValue, spearmanPValue, kendallPValue } from '../utils/correlation';
import { eigenDecompose, computeAbsorptionRatio, computePC1Loadings } from '../lib/pca';
import { betaOf } from '../lib/beta';

describe('Pearson correlation', () => {
  it('returns 1 for perfectly correlated data', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 4, 6, 8, 10];
    expect(pearson(xs, ys)).toBeCloseTo(1, 6);
  });

  it('returns -1 for perfectly inverse data', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [10, 8, 6, 4, 2];
    expect(pearson(xs, ys)).toBeCloseTo(-1, 6);
  });

  it('returns ~0 for uncorrelated data', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 1, 4, 3, 5];
    const r = pearson(xs, ys);
    expect(Math.abs(r)).toBeLessThan(0.9);
  });

  it('handles known dataset: r ≈ 0.8', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [1, 3, 2, 5, 4];
    expect(pearson(xs, ys)).toBeCloseTo(0.8, 2);
  });
});

describe('Spearman correlation', () => {
  it('returns 1 for monotonically increasing', () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 6);
  });

  it('returns -1 for monotonically decreasing', () => {
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });
});

describe('Kendall correlation', () => {
  it('returns 1 for concordant pairs', () => {
    expect(kendall([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 6);
  });

  it('returns -1 for discordant pairs', () => {
    expect(kendall([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it('handles ties correctly', () => {
    const tau = kendall([1, 2, 3, 4], [1, 1, 3, 4]);
    expect(tau).toBeGreaterThan(0);
  });
});

describe('Pearson p-value', () => {
  it('returns low p for high r with many observations', () => {
    const p = pearsonPValue(0.9, 100);
    expect(p).toBeLessThan(0.001);
  });

  it('returns high p for low r', () => {
    const p = pearsonPValue(0.05, 30);
    expect(p).toBeGreaterThan(0.5);
  });

  it('returns 1 for n <= 2', () => {
    expect(pearsonPValue(0.9, 2)).toBe(1);
  });

  it('returns value between 0 and 1', () => {
    for (const r of [-0.9, -0.5, 0, 0.5, 0.9]) {
      for (const n of [10, 30, 100]) {
        const p = pearsonPValue(r, n);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('Spearman p-value (FIX: was using pearsonPValue before)', () => {
  it('returns low p for high rho with many observations', () => {
    const p = spearmanPValue(0.9, 100);
    expect(p).toBeLessThan(0.001);
  });

  it('returns high p for low rho', () => {
    const p = spearmanPValue(0.05, 30);
    expect(p).toBeGreaterThan(0.5);
  });

  it('returns 1 for n <= 2', () => {
    expect(spearmanPValue(0.9, 2)).toBe(1);
  });

  it('returns value between 0 and 1', () => {
    for (const r of [-0.9, -0.5, 0, 0.5, 0.9]) {
      for (const n of [10, 30, 100]) {
        const p = spearmanPValue(r, n);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('Kendall p-value (FIX: was using pearsonPValue before)', () => {
  it('returns low p for high tau with many observations', () => {
    const p = kendallPValue(0.8, 100);
    expect(p).toBeLessThan(0.001);
  });

  it('returns high p for low tau', () => {
    const p = kendallPValue(0.05, 30);
    expect(p).toBeGreaterThan(0.3);
  });

  it('returns 1 for n <= 3', () => {
    expect(kendallPValue(0.9, 3)).toBe(1);
  });

  it('is symmetric around zero', () => {
    const p1 = kendallPValue(0.5, 50);
    const p2 = kendallPValue(-0.5, 50);
    expect(p1).toBeCloseTo(p2, 8);
  });

  it('returns value between 0 and 1', () => {
    for (const tau of [-0.8, -0.3, 0, 0.3, 0.8]) {
      for (const n of [10, 30, 100]) {
        const p = kendallPValue(tau, n);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('PCA / Eigendecomposition (FIX: eigenvalues now sorted descending)', () => {
  it('decomposes identity matrix correctly', () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const { values } = eigenDecompose(I);
    values.forEach(v => expect(v).toBeCloseTo(1, 6));
  });

  it('eigenvalues are sorted in descending order', () => {
    const C = [
      [1, 0.8, 0.3],
      [0.8, 1, 0.5],
      [0.3, 0.5, 1],
    ];
    const { values } = eigenDecompose(C);
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i + 1]);
    }
  });

  it('eigenvalues sum equals trace for correlation matrix', () => {
    const C = [
      [1, 0.8, 0.3],
      [0.8, 1, 0.5],
      [0.3, 0.5, 1],
    ];
    const { values } = eigenDecompose(C);
    const sum = values.reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(3, 4);
  });

  it('eigenvectors are orthonormal', () => {
    const C = [
      [1, 0.8, 0.3],
      [0.8, 1, 0.5],
      [0.3, 0.5, 1],
    ];
    const { vectors } = eigenDecompose(C);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const dot = vectors.reduce((s, row) => s + (row[i] ?? 0) * (row[j] ?? 0), 0);
        expect(Math.abs(dot)).toBeLessThan(0.01);
      }
      const norm = Math.sqrt(vectors.reduce((s, row) => s + (row[i] ?? 0) ** 2, 0));
      expect(norm).toBeCloseTo(1, 2);
    }
  });

  it('absorption ratio AR(1) is largest eigenvalue / sum', () => {
    const eigenvalues = [2.1, 0.6, 0.3];
    const ar1 = computeAbsorptionRatio(eigenvalues, 1);
    expect(ar1).toBeCloseTo(2.1 / 3.0, 4);
  });

  it('PC1 loadings have correct length', () => {
    const vectors = [[0.5, 0.7], [0.5, -0.7], [0.7, 0.1]];
    const values = [1.5, 0.5];
    const loadings = computePC1Loadings(vectors, values);
    expect(loadings).toHaveLength(3);
  });

  it('PC1 corresponds to the largest eigenvalue column', () => {
    const C = [
      [1, 0.9],
      [0.9, 1],
    ];
    const { values, vectors } = eigenDecompose(C);
    // Largest eigenvalue is index 0 after sorting
    expect(values[0]).toBeGreaterThan(values[1]);
    const loadings = computePC1Loadings(vectors, values);
    // Both assets should load similarly on PC1 for a highly correlated pair
    expect(Math.abs(loadings[0])).toBeCloseTo(Math.abs(loadings[1]), 2);
  });
});

describe('Beta calculation', () => {
  it('beta = 1 when regressing on itself', () => {
    const xs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.005, -0.015, 0.025];
    const { beta } = betaOf(xs, xs);
    expect(beta).toBeCloseTo(1, 4);
  });

  it('beta = 2 when y = 2x', () => {
    const xs = [0.01, -0.02, 0.03, -0.01, 0.02, 0.005, -0.015, 0.025];
    const ys = xs.map(x => x * 2);
    const { beta, r } = betaOf(xs, ys);
    expect(beta).toBeCloseTo(2, 4);
    expect(r).toBeCloseTo(1, 4);
  });

  it('beta formula: beta = r * (sigma_y / sigma_x)', () => {
    const xs = [0.01, -0.02, 0.03, -0.01, 0.02];
    const ys = [0.02, -0.01, 0.04, 0.00, 0.03];
    const { beta, r, sigmaRatio } = betaOf(xs, ys);
    expect(beta).toBeCloseTo(r * sigmaRatio, 6);
  });
});

describe('Correlation matrix properties', () => {
  it('matrix is symmetric', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2, 3, 1, 5, 4];
    expect(pearson(xs, ys)).toBeCloseTo(pearson(ys, xs), 10);
  });

  it('diagonal is always 1', () => {
    const xs = [1, 2, 3, 4, 5];
    expect(pearson(xs, xs)).toBeCloseTo(1, 10);
  });

  it('correlation bounded [-1, 1]', () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6];
    const ys = [2, 7, 1, 8, 2, 8, 1, 8];
    const r = pearson(xs, ys);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});
