"""
CORR Backend — FastAPI + yfinance
Serves price history for all 27 CORR instruments.

Endpoints:
  GET /prices          → all active instruments, batch fetch
  GET /prices/{ticker} → single instrument
  GET /health          → uptime check

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

from data import fetch_prices, warm_cache, get_cache_status

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("corr")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm the cache on startup so first request is fast."""
    log.info("Warming price cache on startup...")
    await asyncio.to_thread(warm_cache)
    log.info("Cache warm — server ready.")
    yield


app = FastAPI(
    title="CORR Market Data API",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow requests from your Vite dev server and any deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "https://karamfrm.com",
        "*",  # remove in production, replace with exact domain
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "cache": get_cache_status()}


@app.get("/prices")
def get_all_prices(
    tickers: str = Query(
        default=None,
        description="Comma-separated tickers. Omit for all instruments."
    ),
    period: str = Query(default="1y", description="yfinance period: 1mo, 3mo, 6mo, 1y, 2y"),
):
    """
    Returns closing prices + dates for all requested tickers.
    Response shape:
    {
      "EURUSD": { "dates": [...], "closes": [...], "source": "yfinance" },
      "US10Y":  { "dates": [...], "closes": [...], "source": "fred" },
      ...
    }
    """
    requested = [t.strip().upper() for t in tickers.split(",")] if tickers else None
    try:
        result = fetch_prices(tickers=requested, period=period)
        return result
    except Exception as e:
        log.error(f"fetch_prices failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/prices/{ticker}")
def get_single_price(
    ticker: str,
    period: str = Query(default="1y"),
):
    """Single ticker endpoint — used when user adds instrument mid-session."""
    try:
        result = fetch_prices(tickers=[ticker.upper()], period=period)
        if ticker.upper() not in result:
            raise HTTPException(status_code=404, detail=f"No data for {ticker}")
        return result[ticker.upper()]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
