import { INSTRUMENTS } from './instruments';
import type { LookbackWindow, PricePoint } from '../types';

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller normal from uniform rng
function boxMuller(rng: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * mul;
    return u * mul;
  };
}

// ── Factor model definition ───────────────────────────────────────────────────
// Factors: [USD, Risk, Rates, Energy, Metals]
// Factor daily vols (annualised / sqrt(252))
const FACTOR_VOLS = [0.006, 0.012, 0.004, 0.018, 0.010];

// [USD, Risk, Rates, Energy, Metals]  — loadings for each instrument
const FACTOR_LOADINGS: Record<string, number[]> = {
  EURUSD: [-0.72,  0.10,  0.05,  0.00,  0.05],
  GBPUSD: [-0.65,  0.12,  0.04,  0.00,  0.03],
  USDJPY: [ 0.60, -0.35,  0.25,  0.00,  0.00],
  AUDUSD: [-0.55,  0.40,  0.00,  0.10,  0.25],
  USDCHF: [ 0.55, -0.20, -0.10,  0.00,  0.00],
  USDCAD: [ 0.50, -0.20,  0.00,  0.40,  0.00],
  USDCNH: [ 0.45,  0.00,  0.00,  0.05,  0.00],
  SPX:    [ 0.00,  0.85,  0.00,  0.10,  0.00],
  NDX:    [ 0.00,  0.88,  0.00,  0.05,  0.00],
  DAX:    [-0.10,  0.78,  0.00,  0.05,  0.00],
  FTSE:   [-0.05,  0.72,  0.00,  0.12,  0.05],
  NKY:    [ 0.30,  0.65,  0.05,  0.00,  0.00],
  HSI:    [-0.20,  0.60,  0.00,  0.05,  0.10],
  VIX:    [ 0.00, -0.88,  0.00,  0.05,  0.05],
  DJI:    [ 0.00,  0.82,  0.00,  0.10,  0.00],
  US2Y:   [ 0.00,  0.20,  0.85,  0.00,  0.00],
  US5Y:   [ 0.00,  0.16,  0.84,  0.00,  0.00],
  US10Y:  [ 0.00,  0.12,  0.82,  0.00,  0.00],
  US30Y:  [ 0.00,  0.05,  0.78,  0.00,  0.00],
  BUND:   [-0.10,  0.08,  0.68,  0.00,  0.00],
  JGB:    [ 0.15,  0.00,  0.45,  0.00,  0.00],
  XAU:    [-0.35, -0.25, -0.15,  0.05,  0.80],
  XAG:    [-0.20, -0.10, -0.10,  0.05,  0.85],
  WTI:    [ 0.10,  0.25,  0.00,  0.88,  0.00],
  BRENT:  [ 0.10,  0.25,  0.00,  0.90,  0.00],
  COPPER: [-0.10,  0.45,  0.00,  0.15,  0.50],
  NATGAS: [ 0.00,  0.05,  0.00,  0.55,  0.00],
};

// Idiosyncratic vol (annualised)
const IDIO_VOLS: Record<string, number> = {
  EURUSD: 0.004, GBPUSD: 0.005, USDJPY: 0.004, AUDUSD: 0.005,
  USDCHF: 0.004, USDCAD: 0.004, USDCNH: 0.003,
  SPX:    0.006, NDX:    0.007, DAX:    0.007, FTSE:   0.006,
  NKY:    0.007, HSI:    0.008, VIX:    0.020, DJI:    0.005,
  US2Y:   0.002, US5Y:   0.002, US10Y:  0.003, US30Y:  0.004, BUND:   0.003, JGB: 0.002,
  XAU:    0.005, XAG:    0.008, WTI:    0.012, BRENT:  0.011,
  COPPER: 0.009, NATGAS: 0.020,
};

// ── Price history generation ─────────────────────────────────────────────────
const TOTAL_DAYS = 365;

let _cache: Map<string, number[]> | null = null;

function getReturnCache(): Map<string, number[]> {
  if (_cache) return _cache;

  const rng = mulberry32(42);
  const gaussian = boxMuller(rng);

  // Generate factor return series
  const factorReturns: number[][] = FACTOR_VOLS.map(vol =>
    Array.from({ length: TOTAL_DAYS }, () => gaussian() * vol)
  );

  const cache = new Map<string, number[]>();

  for (const instr of INSTRUMENTS) {
    const loadings = FACTOR_LOADINGS[instr.ticker] ?? Array(5).fill(0);
    const idioVol  = (IDIO_VOLS[instr.ticker] ?? 0.01) / Math.sqrt(252);

    const returns = Array.from({ length: TOTAL_DAYS }, (_, t) => {
      const systematic = loadings.reduce((sum, l, f) => sum + l * factorReturns[f][t], 0);
      const idio = gaussian() * idioVol;
      return systematic + idio;
    });

    cache.set(instr.ticker, returns);
  }

  _cache = cache;
  return cache;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Number of days for a given lookback window */
export function lookbackDays(window: LookbackWindow): number {
  switch (window) {
    case '1D':  return 1;
    case '1W':  return 5;
    case '1M':  return 21;
    case '3M':  return 63;
    case '1Y':  return 252;
  }
}

/**
 * Get daily return series for a ticker over the last N days.
 * Each call introduces a tiny random perturbation to simulate "live" data.
 */
export function getReturns(ticker: string, window: LookbackWindow): number[] {
  const cache = getReturnCache();
  const all = cache.get(ticker) ?? [];
  const n = lookbackDays(window);
  return all.slice(-Math.min(n, all.length));
}

/** Get normalised price series (base 100) for a ticker */
export function getPrices(ticker: string, window: LookbackWindow): PricePoint[] {
  const returns = getCache(ticker);
  const n = lookbackDays(window);
  const slice = returns.slice(-Math.min(n, returns.length));

  const today = new Date('2026-03-08');
  let price = 100;
  const points: PricePoint[] = [];

  slice.forEach((r, i) => {
    price *= (1 + r);
    const d = new Date(today);
    d.setDate(d.getDate() - (slice.length - 1 - i));
    points.push({ date: d.toISOString().slice(0, 10), price: +price.toFixed(4) });
  });

  return points;
}

function getCache(ticker: string): number[] {
  return getReturnCache().get(ticker) ?? [];
}

/** Get full 252-day return series for rolling correlation computations */
export function getAllReturns(ticker: string): number[] {
  return getCache(ticker);
}

/** Add small live perturbation to simulate a data refresh */
export function perturbCache(): void {
  _cache = null; // force regeneration with new seed not needed — just tiny noise
  const rng = mulberry32(Date.now() & 0xffffffff);
  const gaussian = boxMuller(rng);
  const cache = getReturnCache();
  cache.forEach((returns) => {
    // Shift the last observation slightly
    returns[returns.length - 1] += gaussian() * 0.0005;
  });
}
