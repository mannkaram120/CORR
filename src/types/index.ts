export type AssetClass = 'FX' | 'Indices' | 'Rates' | 'Commodities';
export type LookbackWindow = '1D' | '1W' | '1M' | '3M' | '1Y';
export type CorrelationMethod = 'Pearson' | 'Spearman' | 'Kendall';
export type RefreshInterval = number | 'Manual';
export type MatrixViewMode = 'corr' | 'beta';
export type ScenarioId = 'LIVE' | 'GFC_2008' | 'COVID_2020' | 'RATES_2022' | 'CNY_2015';

export interface Instrument {
  ticker: string;
  name: string;
  assetClass: AssetClass;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][];
  pValues: number[][];
  nObs: number;
  lookback: LookbackWindow;
  method: CorrelationMethod;
  timestamp: Date;
}

export interface BetaMatrix {
  tickers: string[];
  beta: number[][];
  r: number[][];
  sigmaRatio: number[][];
  nObs: number;
  timestamp: Date;
  lookback: LookbackWindow;
  method: CorrelationMethod;
}

export interface PairData {
  instrument1: Instrument;
  instrument2: Instrument;
  rollingCorr: Array<{ date: string; r: number }>;
  rollingBeta: Array<{ date: string; beta: number }>;
  prices1: PricePoint[];
  prices2: PricePoint[];
  scatter: Array<{ x: number; y: number; date: string }>;
  stats: { currentR: number; avg30dR: number; avg1yR: number; maxR: number; minR: number };
  betaStats: { currentBeta: number; avg30dBeta: number; avg1yBeta: number; maxBeta: number; minBeta: number; r: number; sigmaRatio: number };
  pValue: number;
  nObs: number;
}

export interface PCAResult {
  eigenvalues: number[];
  eigenvectors: number[][];
  absorptionRatios: { ar1: number; ar3: number; arHalf: number };
  ar1Percentile: number;
  ar1History: Array<{ date: string; ar1: number }>;
  pc1Loadings: Array<{ ticker: string; loading: number; assetClass: AssetClass; name: string }>;
}

export interface GrangerMatrix {
  tickers: string[];
  /** pValue[i][j] = p-value for "i Granger-causes j" */
  pValue: number[][];
  alpha: number;
  [key: string]: unknown;
}

export interface PortfolioWeights {
  [ticker: string]: number;
}

export interface MarginalDiversification {
  ticker: string;
  md: number;
}

export interface PortfolioMetrics {
  weightedCorr: number;
  effectiveN: number;
  portfolioVaR: number;
  correlationVaRContribution: number;
  marginalDiversification: MarginalDiversification[];
}
