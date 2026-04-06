import { create } from 'zustand';
import { INSTRUMENTS } from '../data/instruments';
import {
  fetchAllTickers, getReturnsLive, getAllReturnsLive, getPricesLive,
  invalidateCache, getDataSource, isInitInProgress,
} from '../data/marketDataService';
import { getReturns, getAllReturns, getPrices } from '../utils/dataSimulator';
import { computeMatrix, rollingCorrelation, pearson, pearsonPValue } from '../utils/correlation';
import { betaOf, computeBetaMatrix, rollingBeta } from '../lib/beta';
import { computeAbsorptionRatio, computePC1Loadings, eigenDecompose } from '../lib/pca';
import { hierarchicalCluster } from '../utils/clustering';
import { applyScenarioToLive } from '../data/scenarios';
import { computePortfolioMetrics } from '../lib/portfolio';
import type {
  AssetClass, LookbackWindow, CorrelationMethod, RefreshInterval,
  CorrelationMatrix, PairData, Instrument, BetaMatrix, MatrixViewMode, PCAResult, GrangerMatrix, ScenarioId,
  PortfolioMetrics, PortfolioWeights,
} from '../types';

export interface FlashAlert {
  key:   string;
  row:   string;
  col:   string;
  delta: number;
  ts:    Date;
}

// ── State shape ───────────────────────────────────────────────────────────────
interface NexusState {
  // Controls
  lookback: LookbackWindow;
  method: CorrelationMethod;
  viewMode: MatrixViewMode;
  refreshInterval: RefreshInterval;
  clusterMode: boolean;
  threshold: number;
  activeAssetClasses: AssetClass[];
  activeInstruments: string[];

  // Data
  matrix: CorrelationMatrix | null;
  betaMatrix: BetaMatrix | null;
  pcaResult: PCAResult | null;
  scenarioMatrix: CorrelationMatrix | null;
  /** Always computed at 1Y lookback — source of truth for anomaly detection & trend arrows */
  baselineMatrix: CorrelationMatrix | null;
  /** Snapshot of matrix before the last refresh — used to detect flash-worthy Δr */
  prevMatrix: CorrelationMatrix | null;
  clusteredOrder: number[];
  isLoading: boolean;
  /** True once the initial live data fetch has completed (or fallen back) */
  dataReady: boolean;
  /** Per-ticker data source status for the SIM badge */
  liveDataStatus: Record<string, 'live' | 'fallback' | 'pending'>;
  lastRefreshed: Date | null;

  // UI
  selectedPair: { row: string; col: string } | null;
  pairData: PairData | null;
  settingsOpen: boolean;
  anomalyMode: boolean;
  activeScenario: ScenarioId;
  portfolioMode: boolean;
  portfolioOpen: boolean;
  portfolioAutoNormalize: boolean;
  portfolioWeights: PortfolioWeights;
  portfolioMetrics: PortfolioMetrics | null;
  causalityMode: boolean;
  causalityMatrix: GrangerMatrix | null;
  causalityStatus: 'idle' | 'computing' | 'ready' | 'error';
  causalityError: string | null;
  flashAlerts: FlashAlert[];
  drawerOpen: boolean;
  aboutOpen: boolean;
  interpretOpen: boolean;

  // Actions
  setLookback: (l: LookbackWindow) => void;
  setMethod: (m: CorrelationMethod) => void;
  setViewMode: (m: MatrixViewMode) => void;
  setScenario: (s: ScenarioId) => void;
  setPortfolioOpen: (open: boolean) => void;
  setPortfolioMode: (on: boolean) => void;
  setPortfolioAutoNormalize: (on: boolean) => void;
  setPortfolioWeightPct: (ticker: string, pct: number) => void;
  normalizePortfolioTo100: () => void;
  setRefreshInterval: (i: RefreshInterval) => void;
  setClusterMode: (c: boolean) => void;
  setThreshold: (t: number) => void;
  toggleAssetClass: (a: AssetClass) => void;
  toggleInstrument: (ticker: string) => void;
  selectPair: (row: string | null, col: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  initLiveData: () => Promise<void>;
  setDrawerOpen: (open: boolean) => void;
  toggleAnomalyMode: () => void;
  toggleCausalityMode: () => void;
  computeCausality: () => void;
  dismissAlert: (key: string) => void;
  refreshData: () => void;
  setAboutOpen: (open: boolean) => void;
  setInterpretOpen: (open: boolean) => void;
}

// ── Helper: build matrix ──────────────────────────────────────────────────────
function buildMatrix(
  activeAssetClasses: AssetClass[],
  activeInstruments: string[],
  lookback: LookbackWindow,
  method: CorrelationMethod
): CorrelationMatrix {
  const instruments = INSTRUMENTS.filter(i =>
    activeAssetClasses.includes(i.assetClass) && activeInstruments.includes(i.ticker)
  );
  const tickers = instruments.map(i => i.ticker);
  // Use live data if available for this ticker, otherwise fall back to simulator
  const returnSeries = new Map(tickers.map(t => {
    const live = getAllReturnsLive(t);
    const src  = getDataSource(t);
    if (src === 'live' && live.length > 0) {
      const n = lookbackDays(lookback);
      return [t, live.slice(-Math.min(n, live.length))];
    }
    return [t, getReturns(t, lookback)];
  }));
  const nObs = returnSeries.get(tickers[0])?.length ?? 0;
  const { matrix, pValues } = computeMatrix(returnSeries, tickers, method);
  return { tickers, matrix, pValues, nObs, timestamp: new Date(), method, lookback };
}

function lookbackDays(window: LookbackWindow): number {
  switch (window) {
    case '1D': return 1; case '1W': return 5; case '1M': return 21;
    case '3M': return 63; case '1Y': return 252;
  }
}

function buildBetaMatrix(
  activeAssetClasses: AssetClass[],
  activeInstruments: string[],
  lookback: LookbackWindow,
  method: CorrelationMethod
): BetaMatrix {
  const instruments = INSTRUMENTS.filter(i =>
    activeAssetClasses.includes(i.assetClass) && activeInstruments.includes(i.ticker)
  );
  const tickers = instruments.map(i => i.ticker);
  const returnSeries = new Map(tickers.map(t => {
    const live = getAllReturnsLive(t);
    const src  = getDataSource(t);
    if (src === 'live' && live.length > 0) {
      const n = lookbackDays(lookback);
      return [t, live.slice(-Math.min(n, live.length))];
    }
    return [t, getReturns(t, lookback)];
  }));
  const nObs = returnSeries.get(tickers[0])?.length ?? 0;
  const { beta, r, sigmaRatio } = computeBetaMatrix(returnSeries, tickers, method);
  return { tickers, beta, r, sigmaRatio, nObs, timestamp: new Date(), method, lookback };
}

function buildPCAResult(matrix: CorrelationMatrix): PCAResult {
  const { values: eigenvalues, vectors: eigenvectors } = eigenDecompose(matrix.matrix);
  const ar1 = computeAbsorptionRatio(eigenvalues, 1);
  const ar3 = computeAbsorptionRatio(eigenvalues, 3);
  const arHalf = computeAbsorptionRatio(eigenvalues, Math.ceil(eigenvalues.length / 2));

  const pc1 = computePC1Loadings(eigenvectors, eigenvalues);
  const pc1Loadings = matrix.tickers.map((ticker, i) => {
    const instr = INSTRUMENTS.find(x => x.ticker === ticker);
    return {
      ticker,
      loading: pc1[i] ?? 0,
      assetClass: (instr?.assetClass ?? 'FX') as AssetClass,
      name: instr?.name ?? ticker,
    };
  }).sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading));

  // Rolling AR1 over trailing 60 days using rolling 1M correlation (21 obs) windows
  const today = new Date('2026-03-08');
  const window = 21;
  const rollingDays = 60;
  const seriesByTicker = new Map(matrix.tickers.map(t => [t, getAllReturns(t)] as const));
  const minLen = Math.min(...matrix.tickers.map(t => (seriesByTicker.get(t)?.length ?? 0)));

  const ar1History: Array<{ date: string; ar1: number }> = [];
  for (let k = rollingDays; k >= 1; k--) {
    const end = minLen - (k - 1);
    const start = Math.max(0, end - window);
    const returnSeries = new Map<string, number[]>();
    for (const t of matrix.tickers) {
      const s = seriesByTicker.get(t) ?? [];
      returnSeries.set(t, s.slice(start, end));
    }
    const { matrix: corr } = computeMatrix(returnSeries, matrix.tickers, matrix.method);
    const er = eigenDecompose(corr);
    const ar1k = computeAbsorptionRatio(er.values, 1);
    const d = new Date(today);
    d.setDate(d.getDate() - (k - 1));
    ar1History.push({ date: d.toISOString().slice(0, 10), ar1: +ar1k.toFixed(4) });
  }

  const histVals = ar1History.map(x => x.ar1);
  const ar1Percentile = histVals.length > 0
    ? Math.round((histVals.filter(v => v <= ar1).length / histVals.length) * 100)
    : 50;

  return {
    eigenvalues: eigenvalues.map((v: number) => +v.toFixed(6)),
    eigenvectors,
    absorptionRatios: { ar1, ar3, arHalf },
    pc1Loadings,
    ar1History,
    ar1Percentile,
  };
}

// ── Helper: build pair data ───────────────────────────────────────────────────
function buildPairData(
  rowTicker: string,
  colTicker: string,
  method: CorrelationMethod
): PairData | null {
  const instr1 = INSTRUMENTS.find(i => i.ticker === rowTicker);
  const instr2 = INSTRUMENTS.find(i => i.ticker === colTicker);
  if (!instr1 || !instr2) return null;

  const _xs = getAllReturnsLive(rowTicker);
  const _ys = getAllReturnsLive(colTicker);
  const xs = _xs.length > 0 ? _xs : getAllReturns(rowTicker);
  const ys = _ys.length > 0 ? _ys : getAllReturns(colTicker);
  const n  = Math.min(xs.length, ys.length);

  const rollingCorr = rollingCorrelation(xs.slice(0, n), ys.slice(0, n), 30);
  const rollingBetaSeries = rollingBeta(xs.slice(0, n), ys.slice(0, n), method, 30);
  const prices1 = getPricesLive(rowTicker, '1Y').length > 0
    ? getPricesLive(rowTicker, '1Y')
    : getPrices(rowTicker, '1Y');
  const prices2 = getPricesLive(colTicker, '1Y').length > 0
    ? getPricesLive(colTicker, '1Y')
    : getPrices(colTicker, '1Y');

  const scatter = xs.slice(-n).map((x, i) => ({
    x: +x.toFixed(5),
    y: +(ys[i] ?? 0).toFixed(5),
    date: prices1[i]?.date ?? '',
  }));

  const rValues    = rollingCorr.map(d => d.r);
  const currentR   = pearson(xs.slice(-30), ys.slice(-30));
  const avg30dR    = rValues.length > 0 ? rValues.slice(-30).reduce((s, v) => s + v, 0) / Math.min(rValues.length, 30) : 0;
  const avg1yR     = rValues.length > 0 ? rValues.reduce((s, v) => s + v, 0) / rValues.length : 0;
  const maxR       = rValues.length > 0 ? Math.max(...rValues) : 0;
  const minR       = rValues.length > 0 ? Math.min(...rValues) : 0;
  const pValue     = pearsonPValue(currentR, 30);

  const betaValues = rollingBetaSeries.map(d => d.beta);
  const { beta: currentBeta, r: betaR, sigmaRatio } = betaOf(xs.slice(-30), ys.slice(-30), method);
  const avg30dBeta = betaValues.length > 0
    ? betaValues.slice(-30).reduce((s, v) => s + v, 0) / Math.min(betaValues.length, 30)
    : 0;
  const avg1yBeta = betaValues.length > 0 ? betaValues.reduce((s, v) => s + v, 0) / betaValues.length : 0;
  const maxBeta = betaValues.length > 0 ? Math.max(...betaValues) : 0;
  const minBeta = betaValues.length > 0 ? Math.min(...betaValues) : 0;

  return {
    instrument1: instr1 as Instrument,
    instrument2: instr2 as Instrument,
    rollingCorr,
    rollingBeta: rollingBetaSeries,
    prices1,
    prices2,
    scatter,
    stats: { currentR, avg30dR, avg1yR, maxR, minR },
    betaStats: { currentBeta, avg30dBeta, avg1yBeta, maxBeta, minBeta, r: betaR, sigmaRatio },
    pValue,
    nObs: n,
  };
}

// ── Flash detection helper ────────────────────────────────────────────────────
function detectFlashes(
  prev: CorrelationMatrix,
  next: CorrelationMatrix
): FlashAlert[] {
  const alerts: FlashAlert[] = [];
  const tickers = next.tickers;
  for (let ri = 0; ri < tickers.length; ri++) {
    for (let ci = ri + 1; ci < tickers.length; ci++) {
      const row = tickers[ri]!;
      const col = tickers[ci]!;
      const pi = prev.tickers.indexOf(row);
      const pj = prev.tickers.indexOf(col);
      if (pi === -1 || pj === -1) continue;
      const prevR = prev.matrix[pi]![pj]!;
      const newR  = next.matrix[ri]![ci]!;
      const delta = newR - prevR;
      if (Math.abs(delta) >= 0.15) {
        alerts.push({ key: `${row}_${col}`, row, col, delta, ts: new Date() });
      }
    }
  }
  return alerts;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useNexusStore = create<NexusState>((set, get) => {
  const getBaseMatrix = (): CorrelationMatrix | null => {
    const s = get();
    return (s.activeScenario !== 'LIVE' && s.scenarioMatrix) ? s.scenarioMatrix : s.matrix;
  };

  const grangerWorker = new Worker(
    new URL('../workers/grangerWorker.ts', import.meta.url),
    { type: 'module' }
  );

  grangerWorker.onmessage = (e: MessageEvent) => {
    const data = e.data as any;
    if (data?.ok) {
      set({ causalityMatrix: data.matrix as GrangerMatrix, causalityStatus: 'ready', causalityError: null });
    } else {
      set({ causalityStatus: 'error', causalityError: data?.error ?? 'Unknown worker error' });
    }
  };

  const initialAssetClasses: AssetClass[] = ['FX', 'Indices', 'Rates', 'Commodities'];
  // Default subset — exclude USDCNH, NKY, HSI, BUND, JGB, BRENT, NATGAS, DAX, FTSE
  const EXCLUDED_DEFAULT = new Set(['USDCNH', 'NKY', 'HSI', 'BUND', 'JGB', 'BRENT', 'NATGAS', 'DAX', 'FTSE']);
  const initialInstruments: string[] = INSTRUMENTS.filter(i => !EXCLUDED_DEFAULT.has(i.ticker)).map(i => i.ticker);
  const initialLookback: LookbackWindow  = '1M';
  const initialMethod:   CorrelationMethod = 'Pearson';

  const initialMatrix   = buildMatrix(initialAssetClasses, initialInstruments, initialLookback, initialMethod);
  const initialBeta     = buildBetaMatrix(initialAssetClasses, initialInstruments, initialLookback, initialMethod);
  const initialPCA      = buildPCAResult(initialMatrix);
  const initialBaseline = buildMatrix(initialAssetClasses, initialInstruments, '1Y', initialMethod);
  const initialOrder    = hierarchicalCluster(initialMatrix.matrix);

  // Compute Granger once at init (async via worker)
  queueMicrotask(() => {
    try { get().computeCausality(); } catch { /* init timing */ }
  });

  return {
    // Controls
    lookback: initialLookback,
    method: initialMethod,
    viewMode: 'corr',
    refreshInterval: 900,
    clusterMode: false,
    threshold: 0,
    activeAssetClasses: initialAssetClasses,
    activeInstruments: initialInstruments,

    // Data
    matrix: initialMatrix,
    betaMatrix: initialBeta,
    pcaResult: initialPCA,
    scenarioMatrix: null,
    baselineMatrix: initialBaseline,
    prevMatrix: null,
    clusteredOrder: initialOrder,
    isLoading: false,
    dataReady: true,  // show app immediately with simulator data; live data updates silently
    liveDataStatus: {},
    lastRefreshed: new Date(),

    // UI
    selectedPair: null,
    pairData: null,
    settingsOpen: false,
    anomalyMode: false,
    activeScenario: 'LIVE',
    portfolioMode: false,
    portfolioOpen: false,
    portfolioAutoNormalize: true,
    portfolioWeights: {},
    portfolioMetrics: null,
    causalityMode: false,
    causalityMatrix: null,
    causalityStatus: 'idle',
    causalityError: null,
    flashAlerts: [],
    drawerOpen: false,
    aboutOpen: false,
    interpretOpen: false,

    // ── Actions ─────────────────────────────────────────────────────────────

    setLookback: (lookback) => {
      const { method, activeAssetClasses, activeInstruments } = get();
      const matrix        = buildMatrix(activeAssetClasses, activeInstruments, lookback, method);
      const betaMatrix    = buildBetaMatrix(activeAssetClasses, activeInstruments, lookback, method);
      const pcaResult     = buildPCAResult(matrix);
      const baselineMatrix = buildMatrix(activeAssetClasses, activeInstruments, '1Y', method);
      const clusteredOrder = hierarchicalCluster(matrix.matrix);
      const base = (get().activeScenario !== 'LIVE' && get().scenarioMatrix) ? get().scenarioMatrix : matrix;
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(get().portfolioWeights, base) : null;
      set({ lookback, matrix, betaMatrix, pcaResult, baselineMatrix, clusteredOrder, lastRefreshed: new Date(), portfolioMetrics: metrics });
      get().computeCausality();
    },

    setMethod: (method) => {
      const { lookback, activeAssetClasses, activeInstruments } = get();
      const matrix        = buildMatrix(activeAssetClasses, activeInstruments, lookback, method);
      const betaMatrix    = buildBetaMatrix(activeAssetClasses, activeInstruments, lookback, method);
      const pcaResult     = buildPCAResult(matrix);
      const baselineMatrix = buildMatrix(activeAssetClasses, activeInstruments, '1Y', method);
      const clusteredOrder = hierarchicalCluster(matrix.matrix);
      const base = (get().activeScenario !== 'LIVE' && get().scenarioMatrix) ? get().scenarioMatrix : matrix;
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(get().portfolioWeights, base) : null;
      set({ method, matrix, betaMatrix, pcaResult, baselineMatrix, clusteredOrder, lastRefreshed: new Date(), portfolioMetrics: metrics });
    },

    setViewMode: (viewMode) => set({ viewMode }),

    setScenario: (activeScenario) => {
      const live = get().matrix;
      if (!live) return;
      if (activeScenario === 'LIVE') {
        const base = live;
        const metrics = get().portfolioMode ? computePortfolioMetrics(get().portfolioWeights, base) : null;
        set({ activeScenario, scenarioMatrix: null, portfolioMetrics: metrics });
        return;
      }
      // Scenarios are correlation-only overlays; force CORR view
      const scenarioMatrix = applyScenarioToLive(live, activeScenario);
      const base = scenarioMatrix;
      const metrics = get().portfolioMode ? computePortfolioMetrics(get().portfolioWeights, base) : null;
      set({ activeScenario, scenarioMatrix, viewMode: 'corr', portfolioMetrics: metrics });
    },

    setPortfolioOpen: (portfolioOpen) => set({ portfolioOpen }),
    setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    setInterpretOpen: (interpretOpen) => set({ interpretOpen }),

    setPortfolioMode: (portfolioMode) => {
      const base = getBaseMatrix();
      const metrics = (portfolioMode && base) ? computePortfolioMetrics(get().portfolioWeights, base) : null;
      set({ portfolioMode, portfolioMetrics: metrics });
    },

    setPortfolioAutoNormalize: (portfolioAutoNormalize) => set({ portfolioAutoNormalize }),

    normalizePortfolioTo100: () => {
      const weights = { ...get().portfolioWeights };
      const sum = Object.values(weights).reduce((s, w) => s + w, 0);
      if (sum <= 1e-12) return;
      Object.keys(weights).forEach(k => { weights[k] = weights[k]! / sum; });
      const base = getBaseMatrix();
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(weights, base) : null;
      set({ portfolioWeights: weights, portfolioMetrics: metrics });
    },

    setPortfolioWeightPct: (ticker, pct) => {
      const clamped = Math.max(0, Math.min(100, pct));
      const next = { ...get().portfolioWeights, [ticker]: clamped / 100 };
      if (get().portfolioAutoNormalize) {
        const sum = Object.values(next).reduce((s, w) => s + w, 0);
        if (sum > 1e-12) Object.keys(next).forEach(k => { next[k] = next[k]! / sum; });
      }
      const base = getBaseMatrix();
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(next, base) : null;
      set({ portfolioWeights: next, portfolioMetrics: metrics });
    },

    setRefreshInterval: (refreshInterval) => set({ refreshInterval }),

    setClusterMode: (clusterMode) => set({ clusterMode }),

    setThreshold: (threshold) => set({ threshold }),

    toggleAssetClass: (assetClass) => {
      const { activeAssetClasses, activeInstruments, lookback, method } = get();
      const next = activeAssetClasses.includes(assetClass)
        ? activeAssetClasses.filter(a => a !== assetClass)
        : [...activeAssetClasses, assetClass];
      if (next.length === 0) return;
      const ordered: AssetClass[] = (['FX', 'Indices', 'Rates', 'Commodities'] as AssetClass[])
        .filter(a => next.includes(a));
      const matrix        = buildMatrix(ordered, activeInstruments, lookback, method);
      const betaMatrix    = buildBetaMatrix(ordered, activeInstruments, lookback, method);
      const pcaResult     = buildPCAResult(matrix);
      const baselineMatrix = buildMatrix(ordered, activeInstruments, '1Y', method);
      const clusteredOrder = hierarchicalCluster(matrix.matrix);
      const base = (get().activeScenario !== 'LIVE' && get().scenarioMatrix) ? get().scenarioMatrix : matrix;
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(get().portfolioWeights, base) : null;
      set({ activeAssetClasses: ordered, matrix, betaMatrix, pcaResult, baselineMatrix, clusteredOrder, lastRefreshed: new Date(), portfolioMetrics: metrics });
    },

    toggleInstrument: (ticker) => {
      const { activeInstruments, activeAssetClasses, lookback, method } = get();
      const isAdding = !activeInstruments.includes(ticker);
      const next = isAdding
        ? [...activeInstruments, ticker]
        : activeInstruments.filter(t => t !== ticker);
      if (next.length < 2) return;
      const matrix        = buildMatrix(activeAssetClasses, next, lookback, method);
      const betaMatrix    = buildBetaMatrix(activeAssetClasses, next, lookback, method);
      const pcaResult     = buildPCAResult(matrix);
      const baselineMatrix = buildMatrix(activeAssetClasses, next, '1Y', method);
      const clusteredOrder = hierarchicalCluster(matrix.matrix);
      const base = (get().activeScenario !== 'LIVE' && get().scenarioMatrix) ? get().scenarioMatrix : matrix;
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(get().portfolioWeights, base) : null;
      set({ activeInstruments: next, matrix, betaMatrix, pcaResult, baselineMatrix, clusteredOrder, lastRefreshed: new Date(), portfolioMetrics: metrics });

      // If adding a new ticker that has no live data yet, fetch it in the background
      // Uses a single-symbol call (1 credit) so it never triggers rate limits
      if (isAdding && getDataSource(ticker) !== 'live') {
        fetchAllTickers([ticker]).then(() => {
          // Rebuild matrix with fresh live data for the new ticker
          const { activeAssetClasses: ac, activeInstruments: ai, lookback: lb, method: m } = get();
          const updatedMatrix    = buildMatrix(ac, ai, lb, m);
          const updatedBeta      = buildBetaMatrix(ac, ai, lb, m);
          const updatedPCA       = buildPCAResult(updatedMatrix);
          const updatedBaseline  = buildMatrix(ac, ai, '1Y', m);
          const updatedOrder     = hierarchicalCluster(updatedMatrix.matrix);
          const updatedStatus    = { ...get().liveDataStatus, [ticker]: getDataSource(ticker) };
          const updatedBase      = (get().activeScenario !== 'LIVE' && get().scenarioMatrix) ? get().scenarioMatrix : updatedMatrix;
          const updatedMetrics   = (get().portfolioMode && updatedBase) ? computePortfolioMetrics(get().portfolioWeights, updatedBase) : null;
          set({
            matrix: updatedMatrix, betaMatrix: updatedBeta, pcaResult: updatedPCA,
            baselineMatrix: updatedBaseline, clusteredOrder: updatedOrder,
            liveDataStatus: updatedStatus, portfolioMetrics: updatedMetrics,
            lastRefreshed: new Date(),
          });
        }).catch(err => {
          console.warn(`[CORR] Failed to fetch live data for newly added ${ticker}:`, err);
        });
      }
    },

    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

    setDrawerOpen: (drawerOpen) => set({ drawerOpen }),

    toggleAnomalyMode: () => set(s => ({ anomalyMode: !s.anomalyMode })),

    toggleCausalityMode: () => set(s => ({ causalityMode: !s.causalityMode })),

    computeCausality: () => {
      const { activeAssetClasses, activeInstruments, lookback } = get();
      const instruments = INSTRUMENTS.filter(i =>
        activeAssetClasses.includes(i.assetClass) && activeInstruments.includes(i.ticker)
      );
      const tickers = instruments.map(i => i.ticker);
      const returnSeries: Record<string, number[]> = {};
      tickers.forEach(t => { returnSeries[t] = getReturns(t, lookback); });
      const nObs = returnSeries[tickers[0] ?? '']?.length ?? 0;

      const lags = 5;
      const minObs = 3 * lags + 1;
      if (nObs < minObs) {
        set({
          causalityMatrix: null,
          causalityStatus: 'error',
          causalityError: `Insufficient observations for ${lags}-lag Granger test (need ≥ ${minObs}, have ${nObs}).`,
        });
        return;
      }

      set({ causalityStatus: 'computing', causalityError: null });
      grangerWorker.postMessage({ tickers, returnSeries, lags });
    },

    dismissAlert: (key) => set(s => ({ flashAlerts: s.flashAlerts.filter(a => a.key !== key) })),

    initLiveData: async () => {
      // Guard: prevent concurrent init calls from hammering the API
      if (isInitInProgress()) {
        console.warn('[CORR] initLiveData already in progress — skipping duplicate call');
        return;
      }

      const { activeAssetClasses, activeInstruments, lookback, method } = get();
      const instruments = INSTRUMENTS.filter(i =>
        activeAssetClasses.includes(i.assetClass) && activeInstruments.includes(i.ticker)
      );
      const tickers = instruments.map(i => i.ticker);

      set({ isLoading: true });

      try {
        // Fetch all tickers — live where available, simulator fallback otherwise
        await fetchAllTickers(tickers);
      } catch (err) {
        console.warn('[CORR] fetchAllTickers failed, using simulator for all:', err);
      }

      // Always proceed — dataReady must be set regardless of API success/failure
      const liveDataStatus: Record<string, 'live' | 'fallback' | 'pending'> = {};
      tickers.forEach(t => { liveDataStatus[t] = getDataSource(t); });

      const matrix        = buildMatrix(activeAssetClasses, activeInstruments, lookback, method);
      const betaMatrix    = buildBetaMatrix(activeAssetClasses, activeInstruments, lookback, method);
      const pcaResult     = buildPCAResult(matrix);
      const baselineMatrix = buildMatrix(activeAssetClasses, activeInstruments, '1Y', method);
      const clusteredOrder = hierarchicalCluster(matrix.matrix);
      const base = (get().activeScenario !== 'LIVE' && get().scenarioMatrix) ? get().scenarioMatrix : matrix;
      const metrics = (get().portfolioMode && base) ? computePortfolioMetrics(get().portfolioWeights, base) : null;

      set({
        matrix, betaMatrix, pcaResult, baselineMatrix, clusteredOrder,
        isLoading: false, dataReady: true, liveDataStatus,
        lastRefreshed: new Date(), portfolioMetrics: metrics,
      });
    },

    selectPair: (row, col) => {
      if (row === null || col === null) {
        set({ selectedPair: null, pairData: null });
        return;
      }
      if (row === col) return;
      const { method } = get();
      const pairData = buildPairData(row, col, method);
      set({ selectedPair: { row, col }, pairData, drawerOpen: false });  // Close drawer when sidebar opens
    },

    refreshData: () => {
      // Paused during scenario mode or while a fetch is already running
      if (get().activeScenario !== 'LIVE') return;
      if (get().isLoading) return;

      const { lookback, method, activeAssetClasses, activeInstruments, matrix: currentMatrix } = get();
      const instruments = INSTRUMENTS.filter(i =>
        activeAssetClasses.includes(i.assetClass) && activeInstruments.includes(i.ticker)
      );
      const tickers = instruments.map(i => i.ticker);

      set({ isLoading: true });
      invalidateCache(); // clear stale cache so fetchAllTickers re-fetches

      // Fetch fresh data then rebuild matrix — async, non-blocking
      fetchAllTickers(tickers).then(() => {
        const { lookback: lb, method: m, activeAssetClasses: ac, activeInstruments: ai } = get();
        const newMatrix   = buildMatrix(ac, ai, lb, m);
        const newBeta     = buildBetaMatrix(ac, ai, lb, m);
        const newPCA      = buildPCAResult(newMatrix);
        const newBaseline = buildMatrix(ac, ai, '1Y', m);
        const newOrder    = hierarchicalCluster(newMatrix.matrix);

        const newAlerts = currentMatrix ? detectFlashes(currentMatrix, newMatrix) : [];
        const existing  = get().flashAlerts.filter(a => !newAlerts.find(n => n.key === a.key));
        const allAlerts = [...newAlerts, ...existing].slice(0, 10);

        const { selectedPair } = get();
        const pairData = selectedPair
          ? buildPairData(selectedPair.row, selectedPair.col, m)
          : get().pairData;

        const liveDataStatus: Record<string, 'live' | 'fallback' | 'pending'> = {};
        tickers.forEach(t => { liveDataStatus[t] = getDataSource(t); });

        set({
          matrix: newMatrix, betaMatrix: newBeta, pcaResult: newPCA,
          scenarioMatrix: null, activeScenario: 'LIVE',
          portfolioMetrics: get().portfolioMode
            ? computePortfolioMetrics(get().portfolioWeights, newMatrix) : null,
          baselineMatrix: newBaseline, prevMatrix: currentMatrix,
          clusteredOrder: newOrder, isLoading: false,
          lastRefreshed: new Date(), pairData, flashAlerts: allAlerts,
          liveDataStatus,
        });
      }).catch(err => {
        console.warn('[CORR] refreshData fetch failed:', err);
        set({ isLoading: false });
      });
    },
  };
});
