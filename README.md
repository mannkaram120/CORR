# CORR Backend

FastAPI + yfinance backend for the CORR correlation terminal.

## Setup (one time)

```bash
cd corr-backend
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs at http://localhost:8000

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Cache status and uptime |
| `GET /prices` | All 27 instruments |
| `GET /prices?tickers=EURUSD,SPX,US10Y` | Specific tickers |
| `GET /prices/EURUSD` | Single ticker |
| `GET /prices?period=3mo` | Custom period (1mo/3mo/6mo/1y/2y) |

## Response format

```json
{
  "EURUSD": {
    "dates":  ["2024-01-02", "2024-01-03", ...],
    "closes": [1.0943, 1.0981, ...],
    "source": "yfinance"
  },
  "US10Y": {
    "dates":  ["2024-01-02", ...],
    "closes": [3.97, 4.01, ...],
    "source": "fred"
  }
}
```

## Cold start time

~8-12 seconds on first startup (yfinance fetches all 27 instruments).
After that, all requests are served from in-memory cache instantly.
Cache TTL is 15 minutes — matches the frontend refresh interval.
