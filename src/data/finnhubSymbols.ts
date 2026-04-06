/**
 * finnhubSymbols.ts — instrument source map.
 *
 * Backend handles all fetching:
 *   MT5 (IC Markets) → FX, Indices, Commodities, Rates
 *   FRED             → VIX, COPPER, US2Y
 *
 * This file is kept for compatibility with nexusStore.ts type references.
 * marketDataService.ts no longer uses it directly.
 */

export type DataSource = 'mt5' | 'fred' | 'simulator';

export interface SymbolConfig {
  tdSymbol:    string;
  yahooSymbol: string;
  source:      DataSource;
  fredSeries?: string;
}

export const SYMBOL_MAP: Record<string, SymbolConfig> = {
  // FX
  EURUSD: { tdSymbol: 'EURUSD', yahooSymbol: '', source: 'mt5' },
  GBPUSD: { tdSymbol: 'GBPUSD', yahooSymbol: '', source: 'mt5' },
  USDJPY: { tdSymbol: 'USDJPY', yahooSymbol: '', source: 'mt5' },
  AUDUSD: { tdSymbol: 'AUDUSD', yahooSymbol: '', source: 'mt5' },
  USDCHF: { tdSymbol: 'USDCHF', yahooSymbol: '', source: 'mt5' },
  USDCAD: { tdSymbol: 'USDCAD', yahooSymbol: '', source: 'mt5' },
  EURJPY: { tdSymbol: 'EURJPY', yahooSymbol: '', source: 'mt5' },  // replaced USDCNH

  // Indices
  SPX:  { tdSymbol: 'US500', yahooSymbol: '', source: 'mt5' },
  NDX:  { tdSymbol: 'USTEC', yahooSymbol: '', source: 'mt5' },
  DJI:  { tdSymbol: 'US30',  yahooSymbol: '', source: 'mt5' },
  DAX:  { tdSymbol: 'DE40',  yahooSymbol: '', source: 'mt5' },
  FTSE: { tdSymbol: 'UK100', yahooSymbol: '', source: 'mt5' },
  NKY:  { tdSymbol: 'JP225', yahooSymbol: '', source: 'mt5' },
  HSI:  { tdSymbol: 'HK50',  yahooSymbol: '', source: 'mt5' },
  VIX:  { tdSymbol: '',      yahooSymbol: '^VIX', source: 'mt5' }, // served via Yahoo server-side

  // Commodities
  XAU:    { tdSymbol: 'XAUUSD', yahooSymbol: '', source: 'mt5' },
  XAG:    { tdSymbol: 'XAGUSD', yahooSymbol: '', source: 'mt5' },
  WTI:    { tdSymbol: 'XTIUSD', yahooSymbol: '', source: 'mt5' },
  BRENT:  { tdSymbol: 'XBRUSD', yahooSymbol: '', source: 'mt5' },
  NATGAS: { tdSymbol: 'XNGUSD', yahooSymbol: '', source: 'mt5' },
  // COPPER removed — not available on IC Markets or free APIs

  // Rates
  US2Y:  { tdSymbol: '', yahooSymbol: '', source: 'fred' }, // FRED:DGS2
  US5Y:  { tdSymbol: 'UST05Y_M6', yahooSymbol: '', source: 'mt5' },
  US10Y: { tdSymbol: 'UST10Y_M6', yahooSymbol: '', source: 'mt5' },
  US30Y: { tdSymbol: 'UST30Y_M6', yahooSymbol: '', source: 'mt5' },
};
