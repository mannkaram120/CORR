"""
data_engine.py — MT5 data fetching and in-memory cache.

Fetches daily OHLCV history from IC Markets via MT5.
Saves to price_cache.json for instant cold-start recovery.
"""

import MetaTrader5 as mt5
import pandas as pd
import logging
import json
import os
import time
from datetime import datetime, timedelta
from typing import Optional

from mt5_connection import SYMBOL_MAP, MT5_TICKERS, ensure_connected

log = logging.getLogger("corr.engine")

HISTORY_DAYS = 400
CACHE_FILE   = "price_cache.json"
CACHE_TTL    = 15 * 60  # 15 minutes

_price_store: dict[str, dict] = {}
_last_fetch:  dict[str, float] = {}


def _is_fresh(ticker: str) -> bool:
    return ticker in _price_store and (time.time() - _last_fetch.get(ticker, 0)) < CACHE_TTL


def get_cache_status() -> dict:
    now = time.time()
    return {
        t: {
            "age_seconds": round(now - _last_fetch.get(t, 0)),
            "points": len(_price_store.get(t, {}).get("closes", [])),
            "source": _price_store.get(t, {}).get("source", "?"),
        }
        for t in _price_store
    }


def _fetch_history(corr_ticker: str, mt5_symbol: str) -> Optional[dict]:
    """Fetch daily OHLCV bars from MT5 for one symbol."""
    if not ensure_connected():
        return None

    # Enable symbol in Market Watch
    mt5.symbol_select(mt5_symbol, True)

    from_date = datetime.now() - timedelta(days=HISTORY_DAYS)
    to_date   = datetime.now()

    rates = mt5.copy_rates_range(mt5_symbol, mt5.TIMEFRAME_D1, from_date, to_date)

    if rates is None or len(rates) == 0:
        log.warning(f"✗ {corr_ticker} ({mt5_symbol}): no data — {mt5.last_error()}")
        return None

    df = pd.DataFrame(rates)
    df['time'] = pd.to_datetime(df['time'], unit='s')
    df = df.sort_values('time')

    closes = df['close'].tolist()
    dates  = df['time'].dt.strftime('%Y-%m-%d').tolist()

    if len(closes) < 10:
        log.warning(f"✗ {corr_ticker}: only {len(closes)} bars")
        return None

    log.info(f"✓ {corr_ticker} ({mt5_symbol}): {len(closes)} bars")
    return {
        "dates":  dates,
        "closes": [round(float(c), 6) for c in closes],
        "source": "mt5",
    }


def save_cache() -> None:
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump(_price_store, f)
        log.info(f"Cache saved: {len(_price_store)} instruments → {CACHE_FILE}")
    except Exception as e:
        log.error(f"Cache save failed: {e}")


def load_cache() -> bool:
    if not os.path.exists(CACHE_FILE):
        log.info("No cache file — will fetch fresh from MT5")
        return False
    try:
        with open(CACHE_FILE, 'r') as f:
            data = json.load(f)
        _price_store.update(data)
        stale_ts = time.time() - CACHE_TTL + 60
        for t in data:
            _last_fetch[t] = stale_ts
        log.info(f"Cold start: loaded {len(data)} instruments from {CACHE_FILE}")
        return True
    except Exception as e:
        log.error(f"Cache load failed: {e}")
        return False


def fetch_all(tickers: Optional[list[str]] = None) -> dict[str, dict]:
    """Fetch prices for requested tickers. Serves from cache if fresh."""
    requested   = tickers or MT5_TICKERS
    now         = time.time()
    needs_fetch = [t for t in requested if not _is_fresh(t) and SYMBOL_MAP.get(t)]

    if needs_fetch:
        log.info(f"Fetching {len(needs_fetch)} symbols from MT5...")
        for ticker in needs_fetch:
            mt5_symbol = SYMBOL_MAP.get(ticker)
            if not mt5_symbol:
                continue
            data = _fetch_history(ticker, mt5_symbol)
            if data:
                _price_store[ticker] = data
                _last_fetch[ticker] = now
        save_cache()

    return {t: _price_store[t] for t in requested if t in _price_store}


def warm_cache_mt5() -> None:
    """Startup: load from file first, then refresh from MT5."""
    load_cache()
    log.info("Fetching all instruments from MT5...")
    fetch_all(tickers=MT5_TICKERS)
    log.info(f"Ready: {len(_price_store)}/{len(MT5_TICKERS)} instruments loaded")
