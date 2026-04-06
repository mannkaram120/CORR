/**
 * marketDataService.ts
 *
 * Fetches price data from the CORR FastAPI backend (localhost:8000).
 * Backend uses yfinance + FRED — no CORS, no rate limits, no DNS issues.
 *
 * Backend must be running:
 *   cd corr-backend && uvicorn main:app --port 8000 --reload
 */

import type { LookbackWindow, PricePoint } from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND = 'http://localhost:8000';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — matches backend cache TTL

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackendPrice {
  dates:  string[];
  closes: number[];
  source: 'yfinance' | 'fred';
}

interface CacheEntry {
  returns:   number[];
  prices:    PricePoint[];
  fetchedAt: number;
  source:    'live' | 'fallback';
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

const _cache = new Map<string, CacheEntry>();
let _initInProgress = false;

export function invalidateCache(): void {
  _cache.clear();
}

export function isInitInProgress(): boolean {
  return _initInProgress;
}

export function getCacheStatus() {
  const now = Date.now();
  return [..._cache.entries()].map(([ticker, e]) => ({
    ticker,
    source: e.source,
    age: `${Math.round((now - e.fetchedAt) / 1000)}s ago`,
  }));
}

// ─── Return + price computation ───────────────────────────────────────────────

function pricesToReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const curr = closes[i]!;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return returns;
}

function pricesToPricePoints(closes: number[], dates: string[]): PricePoint[] {
  const base = closes[0] ?? 1;
  return closes.map((c, i) => ({
    date:  (dates[i] ?? '').slice(0, 10),
    price: +((c / base) * 100).toFixed(4),
  }));
}

// ─── Backend fetcher ──────────────────────────────────────────────────────────

async function fetchFromBackend(tickers: string[]): Promise<Map<string, BackendPrice>> {
  const params = tickers.length > 0 ? `?tickers=${tickers.join(',')}` : '';
  const res = await fetch(`${BACKEND}/prices${params}`);
  if (!res.ok) throw new Error(`Backend error: HTTP ${res.status}`);
  const data = await res.json() as Record<string, BackendPrice>;
  return new Map(Object.entries(data));
}

// ─── Simulator fallback ───────────────────────────────────────────────────────

let _simModule: typeof import('./dataSimulator') | null = null;

async function getSimulator() {
  if (!_simModule) _simModule = await import('./dataSimulator');
  return _simModule;
}

async function simulatorFallback(ticker: string, result: Map<string, CacheEntry>): Promise<void> {
  const sim = await getSimulator();
  const entry: CacheEntry = {
    returns:   sim.getAllReturns(ticker),
    prices:    sim.getPrices(ticker, '1Y'),
    fetchedAt: Date.now(),
    source:    'fallback',
  };
  _cache.set(ticker, entry);
  result.set(ticker, entry);
}

// ─── Main fetch orchestrator ──────────────────────────────────────────────────

export async function fetchAllTickers(
  tickers: string[]
): Promise<Map<string, CacheEntry>> {

  const result = new Map<string, CacheEntry>();
  const now    = Date.now();

  // Serve fresh cache entries immediately
  const needsFetch: string[] = [];
  for (const ticker of tickers) {
    const cached = _cache.get(ticker);
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
      result.set(ticker, cached);
    } else {
      needsFetch.push(ticker);
    }
  }

  if (needsFetch.length === 0) return result;

  // Single batch call to backend
  try {
    const backendData = await fetchFromBackend(needsFetch);

    for (const ticker of needsFetch) {
      const data = backendData.get(ticker);
      if (data && data.closes.length >= 5) {
        const entry: CacheEntry = {
          returns:   pricesToReturns(data.closes),
          prices:    pricesToPricePoints(data.closes, data.dates),
          fetchedAt: now,
          source:    'live',
        };
        _cache.set(ticker, entry);
        result.set(ticker, entry);
      } else {
        console.warn(`[CORR] Backend: no data for ${ticker} — using simulator`);
        await simulatorFallback(ticker, result);
      }
    }
  } catch (err) {
    console.error('[CORR] Backend unreachable:', err);
    console.error('[CORR] Make sure the backend is running: cd corr-backend && uvicorn main:app --port 8000 --reload');
    // Fall back to simulator for all tickers
    for (const ticker of needsFetch) {
      const stale = _cache.get(ticker);
      if (stale) result.set(ticker, stale);
      else await simulatorFallback(ticker, result);
    }
  }

  return result;
}

// ─── Public read API ──────────────────────────────────────────────────────────

export async function getReturnsLive(ticker: string, window: LookbackWindow): Promise<number[]> {
  const cached = _cache.get(ticker);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return sliceReturns(cached.returns, window);
  }
  await fetchAllTickers([ticker]);
  return sliceReturns(_cache.get(ticker)?.returns ?? [], window);
}

export function getAllReturnsLive(ticker: string): number[] {
  return _cache.get(ticker)?.returns ?? [];
}

export function getPricesLive(ticker: string, window: LookbackWindow): PricePoint[] {
  const entry = _cache.get(ticker);
  if (!entry) return [];
  const n = lookbackDays(window);
  return entry.prices.slice(-Math.min(n, entry.prices.length));
}

export function getDataSource(ticker: string): 'live' | 'fallback' | 'pending' {
  return _cache.get(ticker)?.source ?? 'pending';
}

export function allLive(tickers: string[]): boolean {
  return tickers.every(t => _cache.get(t)?.source === 'live');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lookbackDays(window: LookbackWindow): number {
  switch (window) {
    case '1D': return 1;
    case '1W': return 5;
    case '1M': return 21;
    case '3M': return 63;
    case '1Y': return 252;
  }
}

function sliceReturns(returns: number[], window: LookbackWindow): number[] {
  const n = lookbackDays(window);
  return returns.slice(-Math.min(n, returns.length));
}
