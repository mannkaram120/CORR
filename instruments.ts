import type { Instrument } from '../types';

export const INSTRUMENTS: Instrument[] = [
  // FX (7)
  { ticker: 'EURUSD', name: 'EUR/USD',    assetClass: 'FX' },
  { ticker: 'GBPUSD', name: 'GBP/USD',   assetClass: 'FX' },
  { ticker: 'USDJPY', name: 'USD/JPY',   assetClass: 'FX' },
  { ticker: 'AUDUSD', name: 'AUD/USD',   assetClass: 'FX' },
  { ticker: 'USDCHF', name: 'USD/CHF',   assetClass: 'FX' },
  { ticker: 'USDCAD', name: 'USD/CAD',   assetClass: 'FX' },
  { ticker: 'USDCNH', name: 'USD/CNH',   assetClass: 'FX' },
  // Indices (7)
  { ticker: 'SPX',    name: 'S&P 500',    assetClass: 'Indices' },
  { ticker: 'NDX',    name: 'NASDAQ 100', assetClass: 'Indices' },
  { ticker: 'DAX',    name: 'DAX 40',     assetClass: 'Indices' },
  { ticker: 'FTSE',   name: 'FTSE 100',   assetClass: 'Indices' },
  { ticker: 'NKY',    name: 'Nikkei 225', assetClass: 'Indices' },
  { ticker: 'HSI',    name: 'Hang Seng',  assetClass: 'Indices' },
  { ticker: 'VIX',    name: 'VIX',        assetClass: 'Indices' },
  { ticker: 'DJI',    name: 'Dow Jones',  assetClass: 'Indices' },
  // Rates (5)
  { ticker: 'US2Y',   name: 'US 2Y Yield',   assetClass: 'Rates' },
  { ticker: 'US5Y',   name: 'US 5Y Yield',   assetClass: 'Rates' },
  { ticker: 'US10Y',  name: 'US 10Y Yield',  assetClass: 'Rates' },
  { ticker: 'US30Y',  name: 'US 30Y Yield',  assetClass: 'Rates' },
  { ticker: 'BUND',   name: 'Bund 10Y',      assetClass: 'Rates' },
  { ticker: 'JGB',    name: 'JGB 10Y',       assetClass: 'Rates' },
  // Commodities (6)
  { ticker: 'XAU',    name: 'Gold',         assetClass: 'Commodities' },
  { ticker: 'XAG',    name: 'Silver',       assetClass: 'Commodities' },
  { ticker: 'WTI',    name: 'WTI Crude',    assetClass: 'Commodities' },
  { ticker: 'BRENT',  name: 'Brent Crude',  assetClass: 'Commodities' },
  { ticker: 'COPPER', name: 'Copper',       assetClass: 'Commodities' },
  { ticker: 'NATGAS', name: 'Natural Gas',  assetClass: 'Commodities' },
];

export const INSTRUMENT_MAP = new Map<string, Instrument>(
  INSTRUMENTS.map(i => [i.ticker, i])
);
