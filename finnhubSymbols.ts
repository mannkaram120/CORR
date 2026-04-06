/**
 * Maps NEXUS internal tickers to their data sources.
 *
 * Three-source architecture (optimised for free tiers):
 *
 *   FX (6)          → Yahoo Finance  (free, no key, no rate limits)
 *   Indices (5)     → Yahoo Finance  (free, no key, no rate limits)
 *   Commodities (4) → Twelve Data    (4 credits/fetch — fits in 1 chunk, no wait)
 *   Rates (4+)      → FRED API       (free, no key, no rate limits)
 *
 * Why Yahoo for FX + Indices:
 *   - Covers all major pairs and indices natively
 *   - No API key, no daily limit, no per-minute limit
 *   - Routed via Vite proxy to avoid CORS
 *   - Frees up all 8 Twelve Data credits/min for commodities only
 *
 * Twelve Data daily budget at 15min refresh, 8hrs:
 *   4 symbols × 4 refreshes/hr × 8hrs = 128 credits/day ✅ (limit: 800)
 */

export type DataSource = 'twelvedata' | 'yahoo' | 'fred' | 'simulator';

export interface SymbolConfig {
  tdSymbol:    string;   // Twelve Data symbol (empty if not TD source)
  yahooSymbol: string;   // Yahoo Finance symbol (empty if not Yahoo source)
  source:      DataSource;
  fredSeries?: string;   // FRED series ID (only for fred source)
}

export const SYMBOL_MAP: Record<string, SymbolConfig> = {
  // ── FX → Yahoo Finance ────────────────────────────────────────────────────
  EURUSD: { tdSymbol: '', yahooSymbol: 'EURUSD=X',  source: 'yahoo' },
  GBPUSD: { tdSymbol: '', yahooSymbol: 'GBPUSD=X',  source: 'yahoo' },
  USDJPY: { tdSymbol: '', yahooSymbol: 'USDJPY=X',  source: 'yahoo' },
  AUDUSD: { tdSymbol: '', yahooSymbol: 'AUDUSD=X',  source: 'yahoo' },
  USDCHF: { tdSymbol: '', yahooSymbol: 'USDCHF=X',  source: 'yahoo' },
  USDCAD: { tdSymbol: '', yahooSymbol: 'USDCAD=X',  source: 'yahoo' },
  USDCNH: { tdSymbol: '', yahooSymbol: 'USDCNH=X',  source: 'yahoo' },

  // ── Indices → Yahoo Finance ───────────────────────────────────────────────
  SPX:    { tdSymbol: '', yahooSymbol: '%5EGSPC',   source: 'yahoo' },  // ^GSPC
  NDX:    { tdSymbol: '', yahooSymbol: '%5ENDX',    source: 'yahoo' },  // ^NDX
  DJI:    { tdSymbol: '', yahooSymbol: '%5EDJI',    source: 'yahoo' },  // ^DJI
  VIX:    { tdSymbol: '', yahooSymbol: '%5EVIX',    source: 'yahoo' },  // ^VIX
  DAX:    { tdSymbol: '', yahooSymbol: '%5EGDAXI',  source: 'yahoo' },  // ^GDAXI
  FTSE:   { tdSymbol: '', yahooSymbol: '%5EFTSE',   source: 'yahoo' },  // ^FTSE
  NKY:    { tdSymbol: '', yahooSymbol: '%5EN225',   source: 'yahoo' },  // ^N225
  HSI:    { tdSymbol: '', yahooSymbol: '%5EHSI',    source: 'yahoo' },  // ^HSI

  // ── Commodities → Twelve Data (only 4 symbols — fits in 1 chunk) ──────────
  XAU:    { tdSymbol: 'XAU/USD',  yahooSymbol: '', source: 'twelvedata' },
  XAG:    { tdSymbol: 'XAG/USD',  yahooSymbol: '', source: 'twelvedata' },
  WTI:    { tdSymbol: 'WTI/USD',  yahooSymbol: '', source: 'twelvedata' },
  COPPER: { tdSymbol: 'COPPER',   yahooSymbol: '', source: 'twelvedata' },
  BRENT:  { tdSymbol: 'BRENT/USD',yahooSymbol: '', source: 'twelvedata' },
  NATGAS: { tdSymbol: 'NATGAS',   yahooSymbol: '', source: 'twelvedata' },

  // ── Rates → FRED (free, no key) ───────────────────────────────────────────
  US2Y:   { tdSymbol: '', yahooSymbol: '', source: 'fred', fredSeries: 'DGS2'  },
  US5Y:   { tdSymbol: '', yahooSymbol: '', source: 'fred', fredSeries: 'DGS5'  },
  US10Y:  { tdSymbol: '', yahooSymbol: '', source: 'fred', fredSeries: 'DGS10' },
  US30Y:  { tdSymbol: '', yahooSymbol: '', source: 'fred', fredSeries: 'DGS30' },
  BUND:   { tdSymbol: '', yahooSymbol: '', source: 'fred', fredSeries: 'IRLTLT01DEM156N' },
  JGB:    { tdSymbol: '', yahooSymbol: '', source: 'fred', fredSeries: 'IRLTLT01JPM156N' },
};
