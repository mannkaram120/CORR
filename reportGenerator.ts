import type { CorrelationMatrix, PCAResult, PortfolioMetrics, ScenarioId } from '../types';

export interface ReportSnapshot {
  tickers: string[];
  corr: number[][];
  pValues: number[][];
  baselineCorr?: number[][];
  lookback: string;
  method: string;
  timestamp: Date;
  pca: PCAResult | null;
  scenario: ScenarioId;
  portfolioEnabled: boolean;
  portfolioMetrics: PortfolioMetrics | null;
}

export interface ReportData {
  title: string;
  generatedAt: string;
  lookback: string;
  method: string;
  scenario: string;
  nInstruments: number;
  nPairs: number;
  avgAbsCorr: number;
  maxCorr: { tickers: [string, string]; r: number };
  minCorr: { tickers: [string, string]; r: number };
  sigPairsPct: number;
  anomalies: Array<{ tickers: [string, string]; delta: number }>;
  pca: PCAResult | null;
  portfolioEnabled: boolean;
  portfolioMetrics: PortfolioMetrics | null;
  narrative: string;
}

export function snapshotFromStore(params: ReportSnapshot): ReportSnapshot {
  return params;
}

export function buildReportData(snap: ReportSnapshot): ReportData {
  const { tickers, corr, pValues, baselineCorr, lookback, method, timestamp, pca, scenario, portfolioEnabled, portfolioMetrics } = snap;
  const n = tickers.length;
  const pairs: Array<{ i: number; j: number; r: number; p: number }> = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ i, j, r: corr[i]![j]!, p: pValues[i]![j]! });
    }
  }

  const avgAbsCorr = pairs.reduce((s, p) => s + Math.abs(p.r), 0) / pairs.length;
  const sorted = [...pairs].sort((a, b) => b.r - a.r);
  const maxP = sorted[0]!;
  const minP = sorted[sorted.length - 1]!;
  const sigPairsPct = Math.round(pairs.filter(p => p.p < 0.05).length / pairs.length * 100);

  const anomalies = baselineCorr
    ? pairs.map(p => ({ tickers: [tickers[p.i]!, tickers[p.j]!] as [string, string], delta: p.r - baselineCorr[p.i]![p.j]! }))
        .filter(a => Math.abs(a.delta) > 0.2)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5)
    : [];

  const ar1Pct = pca?.ar1Percentile ?? 0;
  const narrative = [
    `As of ${timestamp.toLocaleDateString()}, the ${n}-instrument NEXUS matrix shows average |r| of ${avgAbsCorr.toFixed(3)} (${sigPairsPct}% of pairs statistically significant at p<0.05).`,
    pca ? `PCA absorption ratio AR1 = ${(pca.absorptionRatios.ar1 * 100).toFixed(1)}% (${ar1Pct}th percentile vs history)${ar1Pct > 75 ? ' — ELEVATED systemic correlation.' : '.'}` : '',
    anomalies.length > 0 ? `${anomalies.length} correlation anomaly(s) detected vs 1Y baseline.` : 'No significant anomalies vs 1Y baseline.',
    scenario !== 'LIVE' ? `Scenario mode active: ${scenario}.` : '',
  ].filter(Boolean).join(' ');

  return {
    title: 'NEXUS Cross-Asset Correlation Report',
    generatedAt: timestamp.toISOString(),
    lookback, method, scenario,
    nInstruments: n,
    nPairs: pairs.length,
    avgAbsCorr,
    maxCorr: { tickers: [tickers[maxP.i]!, tickers[maxP.j]!], r: maxP.r },
    minCorr: { tickers: [tickers[minP.i]!, tickers[minP.j]!], r: minP.r },
    sigPairsPct,
    anomalies,
    pca,
    portfolioEnabled,
    portfolioMetrics,
    narrative,
  };
}
