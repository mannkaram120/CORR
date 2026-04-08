"""
CORR Backend — FastAPI + MT5 + yfinance historical
Endpoints:
  GET /prices              → live prices (all instruments)
  GET /prices/{ticker}     → single instrument
  GET /historical/{id}     → historical crisis correlation matrix
  GET /historical/{id}/refresh → force re-fetch from MT5/yfinance
  GET /health              → cache status
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from data import fetch_prices, warm_cache, get_cache_status
from mt5_connection import MT5_TICKERS

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("corr")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Warming price cache on startup...")
    await asyncio.to_thread(warm_cache)
    log.info("Cache warm — server ready.")
    yield


app = FastAPI(title="CORR Market Data API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173",
                   "http://127.0.0.1:8080", "https://karamfrm.com", "*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "cache": get_cache_status()}


@app.get("/prices")
def get_all_prices(
    tickers: str = Query(default=None),
    period:  str = Query(default="1y"),
):
    requested = [t.strip().upper() for t in tickers.split(",")] if tickers else None
    try:
        return fetch_prices(tickers=requested, period=period)
    except Exception as e:
        log.error(f"fetch_prices failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/prices/{ticker}")
def get_single_price(ticker: str, period: str = Query(default="1y")):
    try:
        result = fetch_prices(tickers=[ticker.upper()], period=period)
        if ticker.upper() not in result:
            raise HTTPException(status_code=404, detail=f"No data for {ticker}")
        return result[ticker.upper()]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/historical/{scenario_id}")
def get_historical(
    scenario_id: str,
    tickers: str = Query(default=None),
):
    """
    Returns actual historical correlation matrix for a crisis period.
    First call fetches from MT5/yfinance and caches to disk.
    Subsequent calls serve from disk cache instantly.
    """
    from historical import get_historical_correlation, CRISIS_PERIODS

    if scenario_id not in CRISIS_PERIODS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario '{scenario_id}'. Valid: {list(CRISIS_PERIODS.keys())}"
        )

    requested_tickers = (
        [t.strip().upper() for t in tickers.split(",")]
        if tickers
        else MT5_TICKERS
    )

    try:
        result = get_historical_correlation(
            scenario_id=scenario_id,
            tickers=requested_tickers,
        )
        if not result:
            raise HTTPException(
                status_code=503,
                detail=f"Could not fetch historical data for {scenario_id}"
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Historical fetch failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/historical/{scenario_id}/refresh")
def refresh_historical(scenario_id: str, tickers: str = Query(default=None)):
    """Force re-fetch historical data (bypasses disk cache)."""
    from historical import get_historical_correlation, CRISIS_PERIODS

    if scenario_id not in CRISIS_PERIODS:
        raise HTTPException(status_code=404, detail=f"Unknown scenario: {scenario_id}")

    requested_tickers = (
        [t.strip().upper() for t in tickers.split(",")]
        if tickers else MT5_TICKERS
    )

    try:
        result = get_historical_correlation(
            scenario_id=scenario_id,
            tickers=requested_tickers,
            force_refresh=True,
        )
        if not result:
            raise HTTPException(status_code=503, detail="Historical fetch failed")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
