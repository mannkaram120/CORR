"""
data.py — FastAPI data layer.

Sources:
  MT5 (IC Markets) → 22 symbols
  FRED API         → US2Y only (requires free API key)
  Yahoo Finance    → VIX only (^VIX, server-side Python — no CORS)
  Simulator        → COPPER, BUND, JGB (removed from active coverage)
"""

import logging
import time
import requests
from datetime import datetime, timedelta
from typing import Optional

from data_engine import fetch_all, warm_cache_mt5, load_cache, _price_store, _last_fetch
from mt5_connection import SYMBOL_MAP, MT5_TICKERS, connect

log = logging.getLogger("corr.data")

# ── FRED config (US2Y only) ───────────────────────────────────────────────────
FRED_API_KEY = "871fc1da21a94b810f34b7eccd9b2454"  # your key
FRED_BASE    = "https://api.stlouisfed.org/fred/series/observations"

# ── Yahoo Finance config (VIX only) ──────────────────────────────────────────
YF_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

# ── Side-source cache ─────────────────────────────────────────────────────────
_side_cache: dict[str, dict] = {}
_side_ts:    dict[str, float] = {}
SIDE_TTL = 15 * 60

ALL_TICKERS = list(SYMBOL_MAP.keys()) + ["US2Y", "VIX"]


def _is_side_fresh(ticker: str) -> bool:
    return ticker in _side_cache and (time.time() - _side_ts.get(ticker, 0)) < SIDE_TTL


# ── FRED fetcher (US2Y) ───────────────────────────────────────────────────────

def _fetch_fred_us2y() -> Optional[dict]:
    """Fetch US 2-year Treasury yield from FRED with retry on failure."""
    import time as _time
    start = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
    url = (
        f"{FRED_BASE}?series_id=DGS2"
        f"&observation_start={start}"
        f"&sort_order=asc&file_type=json"
        f"&api_key={FRED_API_KEY}"
    )
    for attempt in range(3):
        try:
            res = requests.get(url, timeout=15)
            res.raise_for_status()
            break  # success
        except Exception as e:
            if attempt < 2:
                log.warning(f"FRED attempt {attempt+1} failed: {e} — retrying in 5s")
                _time.sleep(5)
                continue
            log.error(f"FRED US2Y failed after 3 attempts: {e}")
            return None
    else:
        return None

    try:
        closes, dates = [], []
        for obs in res.json().get("observations", []):
            if obs["value"] == ".":
                continue
            try:
                closes.append(round(float(obs["value"]), 6))
                dates.append(obs["date"])
            except ValueError:
                continue

        if len(closes) < 10:
            log.warning(f"FRED DGS2: only {len(closes)} points")
            return None

        log.info(f"✓ US2Y (FRED:DGS2): {len(closes)} points")
        return {"dates": dates, "closes": closes, "source": "fred"}

    except Exception as e:
        log.error(f"FRED US2Y parse failed: {e}")
        return None


# ── Yahoo Finance fetcher (VIX) ───────────────────────────────────────────────
# Called server-side from Python — no CORS restriction

def _fetch_yahoo_vix() -> Optional[dict]:
    """Fetch VIX from Yahoo Finance. Server-side Python bypasses CORS."""
    try:
        from_ts = int((datetime.now() - timedelta(days=400)).timestamp())
        to_ts   = int(datetime.now().timestamp())
        url     = f"{YF_BASE}/%5EVIX?interval=1d&period1={from_ts}&period2={to_ts}&events=history"

        headers = {"User-Agent": "Mozilla/5.0"}
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()

        result   = res.json()["chart"]["result"][0]
        tss      = result["timestamp"]
        closes_r = result["indicators"]["quote"][0]["close"]

        closes, dates = [], []
        for ts, c in zip(tss, closes_r):
            if c is None:
                continue
            closes.append(round(float(c), 6))
            dates.append(datetime.fromtimestamp(ts).strftime("%Y-%m-%d"))

        if len(closes) < 10:
            log.warning(f"Yahoo VIX: only {len(closes)} points")
            return None

        log.info(f"✓ VIX (Yahoo:^VIX): {len(closes)} points")
        return {"dates": dates, "closes": closes, "source": "yahoo"}

    except Exception as e:
        log.error(f"Yahoo VIX failed: {e}")
        return None


# ── Cache status ──────────────────────────────────────────────────────────────

def get_cache_status() -> dict:
    now = time.time()
    status = {}
    for t in _price_store:
        status[t] = {
            "age_seconds": round(now - _last_fetch.get(t, 0)),
            "points": len(_price_store[t].get("closes", [])),
            "source": _price_store[t].get("source", "mt5"),
        }
    for t in _side_cache:
        status[t] = {
            "age_seconds": round(now - _side_ts.get(t, 0)),
            "points": len(_side_cache[t].get("closes", [])),
            "source": _side_cache[t].get("source", "?"),
        }
    return status


# ── Main fetch API ────────────────────────────────────────────────────────────

def fetch_prices(
    tickers: Optional[list[str]] = None,
    period: str = "1y",
) -> dict[str, dict]:
    """Returns price data for all requested tickers."""
    requested    = tickers or ALL_TICKERS
    mt5_tickers  = [t for t in requested if SYMBOL_MAP.get(t) is not None]

    # MT5 fetch
    mt5_result = fetch_all(tickers=mt5_tickers)

    # US2Y — FRED
    if "US2Y" in requested and not _is_side_fresh("US2Y"):
        data = _fetch_fred_us2y()
        if data:
            _side_cache["US2Y"] = data
            _side_ts["US2Y"]    = time.time()

    # VIX — Yahoo Finance (server-side)
    if "VIX" in requested and not _is_side_fresh("VIX"):
        data = _fetch_yahoo_vix()
        if data:
            _side_cache["VIX"] = data
            _side_ts["VIX"]    = time.time()

    # Merge
    result = {**mt5_result}
    for t in ["US2Y", "VIX"]:
        if t in requested and t in _side_cache:
            result[t] = _side_cache[t]

    return result


def warm_cache() -> None:
    """Called by FastAPI lifespan on startup."""
    if not connect():
        log.error(
            "\nMT5 connection failed. Make sure:\n"
            "  1. MetaTrader 5 terminal is open\n"
            "  2. Logged into IC Markets (ICMarketsSC-Demo)\n"
        )
        load_cache()
    else:
        warm_cache_mt5()

    # Fetch side sources on startup
    log.info("Fetching US2Y from FRED...")
    data = _fetch_fred_us2y()
    if data:
        _side_cache["US2Y"] = data
        _side_ts["US2Y"]    = time.time()

    log.info("Fetching VIX from Yahoo Finance...")
    data = _fetch_yahoo_vix()
    if data:
        _side_cache["VIX"] = data
        _side_ts["VIX"]    = time.time()
