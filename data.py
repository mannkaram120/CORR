"""
data.py — Price fetching and caching logic.

Sources:
  yfinance → FX, Indices, Commodities (no key, no rate limit, no CORS)
  FRED     → US rates (official Fed data, free, no key needed for basic series)

Cache:
  In-memory dict with TTL. Cache is warmed on startup.
  At 15min refresh from frontend, data is always fresh from cache.
"""

import yfinance as yf
import requests
import logging
import time
from datetime import datetime, timedelta
from typing import Optional

log = logging.getLogger("corr.data")

# ── Symbol maps ───────────────────────────────────────────────────────────────

# yfinance ticker for each CORR instrument
YF_SYMBOLS: dict[str, str] = {
    # FX
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCHF": "USDCHF=X",
    "USDCAD": "USDCAD=X",
    "USDCNH": "USDCNH=X",
    # Indices
    "SPX":   "^GSPC",
    "NDX":   "^NDX",
    "DJI":   "^DJI",
    "VIX":   "^VIX",
    "DAX":   "^GDAXI",
    "FTSE":  "^FTSE",
    "NKY":   "^N225",
    "HSI":   "^HSI",
    # Commodities
    "XAU":    "GC=F",    # Gold futures
    "XAG":    "SI=F",    # Silver futures
    "WTI":    "CL=F",    # WTI crude futures
    "BRENT":  "BZ=F",    # Brent crude futures
    "COPPER": "HG=F",    # Copper futures
    "NATGAS": "NG=F",    # Natural gas futures
}

# FRED series for rates
FRED_SERIES: dict[str, str] = {
    "US2Y":  "DGS2",
    "US5Y":  "DGS5",
    "US10Y": "DGS10",
    "US30Y": "DGS30",
    "BUND":  "IRLTLT01DEM156N",
    "JGB":   "IRLTLT01JPM156N",
}

ALL_TICKERS = list(YF_SYMBOLS.keys()) + list(FRED_SERIES.keys())

# ── In-memory cache ───────────────────────────────────────────────────────────

_cache: dict[str, dict] = {}
_cache_ts: dict[str, float] = {}
CACHE_TTL = 15 * 60  # 15 minutes


def _is_fresh(ticker: str) -> bool:
    return ticker in _cache and (time.time() - _cache_ts.get(ticker, 0)) < CACHE_TTL


def get_cache_status() -> dict:
    now = time.time()
    return {
        t: {
            "age_seconds": round(now - _cache_ts[t]),
            "points": len(_cache[t].get("closes", [])),
            "source": _cache[t].get("source", "?"),
        }
        for t in _cache
    }

# ── yfinance fetcher ──────────────────────────────────────────────────────────

def _fetch_yf_batch(tickers: list[str], period: str) -> dict[str, dict]:
    """
    Fetch multiple yfinance symbols in one call using yf.download().
    Much faster than individual Ticker calls.
    Returns {corr_ticker: {"dates": [...], "closes": [...], "source": "yfinance"}}
    """
    yf_map = {ticker: YF_SYMBOLS[ticker] for ticker in tickers if ticker in YF_SYMBOLS}
    if not yf_map:
        return {}

    yf_symbols = list(yf_map.values())
    corr_by_yf = {v: k for k, v in yf_map.items()}  # reverse map

    try:
        # Single batch download — yfinance handles all symbols at once
        df = yf.download(
            tickers=yf_symbols,
            period=period,
            interval="1d",
            auto_adjust=True,
            progress=False,
            threads=True,  # parallel downloads
        )

        if df.empty:
            log.warning(f"yfinance returned empty DataFrame for {yf_symbols}")
            return {}

        result = {}
        close_df = df["Close"] if len(yf_symbols) > 1 else df[["Close"]]

        # Rename columns back to CORR tickers
        if len(yf_symbols) > 1:
            close_df.columns = [corr_by_yf.get(col, col) for col in close_df.columns]
        else:
            close_df.columns = [corr_by_yf.get(yf_symbols[0], yf_symbols[0])]

        for corr_ticker in close_df.columns:
            series = close_df[corr_ticker].dropna()
            if len(series) < 5:
                log.warning(f"yfinance: insufficient data for {corr_ticker} ({len(series)} points)")
                continue
            result[corr_ticker] = {
                "dates":  [d.strftime("%Y-%m-%d") for d in series.index],
                "closes": [round(float(v), 6) for v in series.values],
                "source": "yfinance",
            }

        return result

    except Exception as e:
        log.error(f"yfinance batch failed: {e}")
        return {}


# ── FRED fetcher ──────────────────────────────────────────────────────────────

def _fetch_fred_single(corr_ticker: str, series_id: str, period: str) -> Optional[dict]:
    """Fetch a single FRED series. FRED is server-side so no CORS issues."""
    try:
        # Calculate start date from period
        period_days = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730}
        days = period_days.get(period, 365) + 30  # +30 buffer for weekends/holidays
        start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        url = (
            f"https://api.stlouisfed.org/fred/series/observations"
            f"?series_id={series_id}&observation_start={start}"
            f"&sort_order=asc&file_type=json"
        )
        res = requests.get(url, timeout=10)
        res.raise_for_status()
        data = res.json()

        obs = data.get("observations", [])
        closes, dates = [], []
        for o in obs:
            if o["value"] == ".":
                continue
            try:
                closes.append(round(float(o["value"]), 6))
                dates.append(o["date"])
            except ValueError:
                continue

        if len(closes) < 10:
            log.warning(f"FRED {series_id}: only {len(closes)} points")
            return None

        return {"dates": dates, "closes": closes, "source": "fred"}

    except Exception as e:
        log.error(f"FRED {series_id} failed: {e}")
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def fetch_prices(
    tickers: Optional[list[str]] = None,
    period: str = "1y",
) -> dict[str, dict]:
    """
    Main entry point. Returns price data for requested tickers.
    Serves from cache if fresh, fetches otherwise.
    """
    requested = tickers or ALL_TICKERS

    # Split into what needs fetching vs what's cached
    needs_yf   = [t for t in requested if t in YF_SYMBOLS   and not _is_fresh(t)]
    needs_fred = [t for t in requested if t in FRED_SERIES  and not _is_fresh(t)]
    cached     = [t for t in requested if _is_fresh(t)]

    log.info(f"fetch_prices: {len(cached)} cached, {len(needs_yf)} yf, {len(needs_fred)} fred")

    # Fetch yfinance in one batch
    if needs_yf:
        yf_results = _fetch_yf_batch(needs_yf, period)
        for ticker, data in yf_results.items():
            _cache[ticker] = data
            _cache_ts[ticker] = time.time()

    # Fetch FRED individually (they're fast and there are only 6)
    for ticker in needs_fred:
        series_id = FRED_SERIES[ticker]
        data = _fetch_fred_single(ticker, series_id, period)
        if data:
            _cache[ticker] = data
            _cache_ts[ticker] = time.time()

    # Build response from cache
    result = {}
    for ticker in requested:
        if ticker in _cache:
            result[ticker] = _cache[ticker]
        else:
            log.warning(f"No data available for {ticker} — not in cache after fetch")

    return result


def warm_cache() -> None:
    """
    Called on startup to pre-fetch all instruments.
    After this, all requests are served from cache instantly.
    """
    log.info("Warming cache for all 27 instruments...")
    fetch_prices(tickers=ALL_TICKERS, period="1y")
    loaded = len(_cache)
    log.info(f"Cache warm complete: {loaded}/27 instruments loaded")
