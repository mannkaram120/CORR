"""
fetch_crisis_data.py — Run ONCE offline to pre-fetch all crisis correlation data.

Architecture (24 symbols, zero gaps):

  MT5 (IC Markets) — symbols with full history on IC Markets demo:
    FX:          EURUSD, GBPUSD, USDJPY, USDCHF, EURJPY
    Indices:     SPX, NDX, DJI, DAX, FTSE, NKY, HSI
    Commodities: XAU, XAG
    (AUDUSD, USDCAD, WTI, BRENT, NATGAS, US5Y/10Y/30Y have NO history on IC Markets)

  FRED — everything IC Markets can't provide historically:
    AUDUSD  → DEXUSAL  (U.S. Dollars to Australian Dollar, daily since 1971)
    USDCAD  → DEXCAUS  (CAD per USD)
    WTI     → DCOILWTICO
    BRENT   → DCOILBRENTEU
    NATGAS  → MHHNGSP  (monthly — forward-filled to daily)
    US2Y    → DGS2
    US5Y    → DGS5
    US10Y   → DGS10
    US30Y   → DGS30

  Stooq CSV — GFC_2008 indices only (IC Markets has no history pre-2020):
    SPX, NDX, DJI, DAX, FTSE, NKY, HSI → manually downloaded from stooq.com
    Files: _spx_d.csv, _ndx_d.csv, _dji_d.csv, _dax_d.csv, _ukx_d.csv, _nkx_d.csv, _hsi_d.csv
    Place all files in the same directory as this script.

  CBOE CSV — VIX (not on IC Markets at all):
    VIX     → VIX_History.csv

Usage:
  python fetch_crisis_data.py              # skips valid cached scenarios
  python fetch_crisis_data.py --force      # overwrites everything
  python fetch_crisis_data.py --vix-csv path/to/VIX_History.csv
"""

import argparse
import csv
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Optional

import MetaTrader5 as mt5
import numpy as np
import pandas as pd
import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("crisis_fetch")

os.makedirs("historical_cache", exist_ok=True)

# ── Cache validation threshold ────────────────────────────────────────────────
MIN_EXPECTED_TICKERS = 18

# ── MT5: only symbols IC Markets actually has historical data for ─────────────
MT5_SYMBOL_MAP: dict[str, str] = {
    # FX — 5 (AUDUSD and USDCAD fall back to FRED)
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
    "USDJPY": "USDJPY",
    "USDCHF": "USDCHF",
    "EURJPY": "EURJPY",
    # Indices — 7 (VIX falls back to CBOE CSV)
    "SPX":  "US500",
    "NDX":  "USTEC",
    "DJI":  "US30",
    "DAX":  "DE40",
    "FTSE": "UK100",
    "NKY":  "JP225",
    "HSI":  "HK50",
    # Commodities — 2 (WTI, BRENT, NATGAS fall back to FRED)
    "XAU": "XAUUSD",
    "XAG": "XAGUSD",
}
# NOTE: AUDUSD/USDCAD/WTI/BRENT/NATGAS/US5Y/10Y/30Y exist on IC Markets but
# have NO historical data before ~2020 on the demo account. FRED is used instead.

# ── FRED series map ───────────────────────────────────────────────────────────
# Each entry: corr_ticker → (fred_series_id, transform)
# transform field kept for future use; currently unused ('none' for all)
FRED_SERIES: dict[str, tuple[str, str]] = {
    # FX fallbacks
    "AUDUSD": ("DEXUSAL",       "none"),     # FRED: U.S. Dollars to Australian Dollar, daily since 1971
    "USDCAD": ("DEXCAUS",       "none"),     # FRED gives CAD per USD → correct direction
    # Energy fallbacks
    "WTI":    ("DCOILWTICO",    "none"),     # WTI spot, daily
    "BRENT":  ("DCOILBRENTEU",  "none"),     # Brent spot, daily
    "NATGAS": ("MHHNGSP",       "none"),     # Henry Hub, MONTHLY — will forward-fill
    # Rates (rolling futures on IC Markets have no history)
    "US2Y":   ("DGS2",          "none"),
    "US5Y":   ("DGS5",          "none"),
    "US10Y":  ("DGS10",         "none"),
    "US30Y":  ("DGS30",         "none"),
}

FRED_API_KEY = "871fc1da21a94b810f34b7eccd9b2454"
FRED_BASE    = "https://api.stlouisfed.org/fred/series/observations"

# ── CBOE VIX CSV ──────────────────────────────────────────────────────────────
DEFAULT_VIX_CSV = "VIX_History.csv"

# ── Stooq local CSV map — used ONLY as fallback when MT5 has no history ─────────
# Download once from stooq.com and place in the same directory as this script.
# Format: Date,Open,High,Low,Close,Volume  (same as CBOE VIX CSV)
# FTSE symbol on Stooq is FTSE (no ^ prefix — ^FTSE and ^UKX both fail)
STOOQ_CSV_MAP: dict[str, str] = {
    "SPX":  "spx_d.csv",
    "NDX":  "ndx_d.csv",
    "DJI":  "dji_d.csv",
    "DAX":  "dax_d.csv",
    # FTSE: not available on Stooq (^FTSE, ^UKX, FTSE all fail)
    # IC Markets has FTSE from ~2020 onward — covered for COVID/RATES/CNY
    # GFC_2008 will be 23/24 tickers — acceptable
    "NKY":  "nkx_d.csv",
    "HSI":  "hsi_d.csv",
}

# ── Investing.com CSV for FTSE (different format from Stooq) ─────────────────
# Date: DD-MM-YYYY | Close column called "Price" | values have commas e.g. "6,416.70"
# Download from investing.com → FTSE 100 Historical Data → Export
INVESTING_CSV_MAP: dict[str, str] = {
    "FTSE": "FTSE_100_Historical_Data.csv",
}

# ── Crisis periods ────────────────────────────────────────────────────────────
CRISIS_PERIODS = {
    "GFC_2008": {
        "start": "2008-09-01",
        "end":   "2009-03-31",
        "label": "Global Financial Crisis (Sep 2008 – Mar 2009)",
    },
    "COVID_2020": {
        "start": "2020-02-01",
        "end":   "2020-05-31",
        "label": "COVID Crash (Feb – May 2020)",
    },
    "RATES_2022": {
        "start": "2022-01-01",
        "end":   "2022-12-31",
        "label": "Fed Rate Shock (Full Year 2022)",
    },
    "CNY_2015": {
        "start": "2015-06-01",
        "end":   "2015-12-31",
        "label": "CNY Devaluation (Jun – Dec 2015)",
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 1: MT5
# ─────────────────────────────────────────────────────────────────────────────

def mt5_connect() -> bool:
    if not mt5.initialize():
        log.error(f"MT5 initialize failed: {mt5.last_error()}")
        return False
    account = mt5.account_info()
    if account is None:
        log.error("MT5: not logged in — open MetaTrader 5 and log into IC Markets")
        mt5.shutdown()
        return False
    log.info(f"MT5 connected: account={account.login} server={account.server}")
    return True


def fetch_mt5_period(start_str: str, end_str: str) -> pd.DataFrame:
    """Fetch all MT5 symbols for a period. Returns DataFrame of closes."""
    start = datetime.strptime(start_str, "%Y-%m-%d")
    end   = datetime.strptime(end_str,   "%Y-%m-%d") + timedelta(days=1)

    series_list = []
    for corr_ticker, mt5_symbol in MT5_SYMBOL_MAP.items():
        mt5.symbol_select(mt5_symbol, True)
        rates = mt5.copy_rates_range(mt5_symbol, mt5.TIMEFRAME_D1, start, end)

        if rates is None or len(rates) <= 1:
            log.warning(f"  ✗ {corr_ticker} ({mt5_symbol}): no history on IC Markets")
            continue

        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s")
        s = df.set_index("time")["close"].rename(corr_ticker).sort_index()
        log.info(f"  ✓ {corr_ticker} ({mt5_symbol}): {len(s)} bars")
        series_list.append(s)

    if not series_list:
        return pd.DataFrame()

    result = pd.concat(series_list, axis=1)
    log.info(f"  MT5 total: {len(result)} trading days, {len(result.columns)} symbols")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 2: FRED (US2Y, US5Y, US10Y, US30Y, AUDUSD, USDCAD, WTI, BRENT, NATGAS)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_fred_series(series_id: str, start_str: str, end_str: str) -> Optional[pd.Series]:
    """
    Fetch one FRED series for a date range.
    Returns pd.Series indexed by datetime, or None on failure.
    FRED uses "." for missing observations — these are dropped.
    """
    url = (
        f"{FRED_BASE}?series_id={series_id}"
        f"&observation_start={start_str}"
        f"&observation_end={end_str}"
        f"&sort_order=asc&file_type=json"
        f"&api_key={FRED_API_KEY}"
    )
    for attempt in range(3):
        try:
            res = requests.get(url, timeout=15)
            res.raise_for_status()
            data = {}
            for obs in res.json().get("observations", []):
                if obs["value"] == ".":
                    continue
                try:
                    data[obs["date"]] = float(obs["value"])
                except ValueError:
                    continue
            if len(data) < 3:
                log.warning(f"  FRED {series_id}: only {len(data)} points")
                return None
            s = pd.Series(data)
            s.index = pd.to_datetime(s.index)
            return s
        except Exception as e:
            log.warning(f"  FRED {series_id} attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(5)
    log.error(f"  ✗ FRED {series_id}: all attempts failed")
    return None


def fetch_all_fred(start_str: str, end_str: str,
                   master_index: pd.DatetimeIndex) -> dict[str, pd.Series]:
    """
    Fetch all FRED series and align them to the MT5 master trading-day index.

    Why forward-fill onto master_index?
      - FRED doesn't publish on all market holidays
      - NATGAS (MHHNGSP) is monthly — needs daily expansion
      - Rate series have weekend/holiday gaps
    Forward-fill is the standard approach for these series across calendar gaps.
    """
    results = {}
    for corr_ticker, (series_id, transform) in FRED_SERIES.items():
        raw = fetch_fred_series(series_id, start_str, end_str)
        if raw is None:
            log.warning(f"  ✗ {corr_ticker} (FRED:{series_id}): skipped")
            continue

        # No transforms needed — all FRED series used are in their correct direction

        # Align to master trading-day index via forward-fill
        aligned = raw.reindex(master_index, method="ffill")
        coverage = aligned.notna().sum()

        if coverage < len(master_index) * 0.5:
            log.warning(f"  ✗ {corr_ticker} (FRED:{series_id}): "
                        f"only {coverage}/{len(master_index)} days after alignment — dropping")
            continue

        results[corr_ticker] = aligned.rename(corr_ticker)
        log.info(f"  ✓ {corr_ticker} (FRED:{series_id}): {coverage}/{len(master_index)} days")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 3: CBOE CSV (VIX)
# ─────────────────────────────────────────────────────────────────────────────

def load_vix_csv(csv_path: str, start_str: str, end_str: str) -> Optional[pd.Series]:
    """
    Load VIX closes from CBOE VIX_History.csv.
    CSV format: DATE,OPEN,HIGH,LOW,CLOSE with dates as MM/DD/YYYY.
    Goes back to 1990. No API key, no rate limit.
    """
    if not os.path.exists(csv_path):
        log.error(f"  ✗ VIX CSV not found: {csv_path}")
        log.error("    Download: https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv")
        return None

    start = datetime.strptime(start_str, "%Y-%m-%d")
    end   = datetime.strptime(end_str,   "%Y-%m-%d")
    data  = {}

    try:
        with open(csv_path, newline="") as f:
            for row in csv.DictReader(f):
                try:
                    date = datetime.strptime(row["DATE"].strip(), "%m/%d/%Y")
                    if start <= date <= end:
                        data[date] = float(row["CLOSE"])
                except (ValueError, KeyError):
                    continue
    except Exception as e:
        log.error(f"  ✗ VIX CSV read failed: {e}")
        return None

    if len(data) < 5:
        log.warning(f"  VIX CSV: only {len(data)} rows in range")
        return None

    s = pd.Series(data, name="VIX").sort_index()
    log.info(f"  ✓ VIX (CBOE CSV): {len(s)} points")
    return s


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 4: STOOQ (GFC_2008 indices fallback only)
# ─────────────────────────────────────────────────────────────────────────────

def load_stooq_indices(start_str: str, end_str: str,
                       master_index: pd.DatetimeIndex) -> dict[str, pd.Series]:
    """
    Load equity index closes from locally downloaded Stooq CSVs.
    Only called for GFC_2008 — the 7 indices IC Markets doesn't carry pre-2020.

    CSV format (Stooq download): Date,Open,High,Low,Close,Volume
    Date format: YYYY-MM-DD

    Files must be in the same directory as this script.
    Download from stooq.com — one-time manual step.
    Note: FTSE 100 on Stooq is ^UKX, not ^FTSE.
    """
    start  = pd.Timestamp(start_str)
    end    = pd.Timestamp(end_str)
    results = {}

    for corr_ticker, filename in STOOQ_CSV_MAP.items():
        if not os.path.exists(filename):
            log.warning(f"  ✗ {corr_ticker}: file not found ({filename}) — skipping")
            continue
        try:
            df = pd.read_csv(filename)

            if "Close" not in df.columns or "Date" not in df.columns:
                log.warning(f"  ✗ {corr_ticker}: unexpected columns in {filename}: {df.columns.tolist()}")
                continue

            df["Date"] = pd.to_datetime(df["Date"])
            df = df.set_index("Date").sort_index()

            # Slice to crisis period
            s = df.loc[start:end, "Close"]
            s = s[s > 0]  # drop zero/negative (data errors)

            if len(s) < 5:
                log.warning(f"  ✗ {corr_ticker}: only {len(s)} rows in {start_str}→{end_str}")
                continue

            # Align to MT5 master trading-day index
            aligned  = s.reindex(master_index, method="ffill")
            coverage = aligned.notna().sum()

            if coverage < len(master_index) * 0.5:
                log.warning(f"  ✗ {corr_ticker}: only {coverage}/{len(master_index)} days after alignment")
                continue

            results[corr_ticker] = aligned.rename(corr_ticker)
            log.info(f"  ✓ {corr_ticker} (Stooq CSV:{filename}): {coverage}/{len(master_index)} days")

        except Exception as e:
            log.warning(f"  ✗ {corr_ticker}: failed to load {filename}: {e}")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# SOURCE 5: Investing.com CSV (FTSE only)
# ─────────────────────────────────────────────────────────────────────────────

def load_investing_indices(start_str: str, end_str: str,
                           master_index: pd.DatetimeIndex) -> dict[str, pd.Series]:
    """
    Load FTSE 100 from investing.com CSV export.

    Investing.com format (different from Stooq):
      Date: DD-MM-YYYY
      Close column: called "Price" (not "Close")
      Values: comma-formatted strings e.g. "6,416.70"

    Only called for GFC_2008 (same condition as Stooq indices).
    """
    start   = pd.Timestamp(start_str)
    end     = pd.Timestamp(end_str)
    results = {}

    for corr_ticker, filename in INVESTING_CSV_MAP.items():
        if not os.path.exists(filename):
            log.warning(f"  ✗ {corr_ticker}: file not found ({filename}) — skipping")
            continue
        try:
            df = pd.read_csv(filename)

            if "Price" not in df.columns or "Date" not in df.columns:
                log.warning(f"  ✗ {corr_ticker}: unexpected columns {df.columns.tolist()}")
                continue

            # Parse DD-MM-YYYY date format
            df["Date"] = pd.to_datetime(df["Date"], format="%d-%m-%Y")
            # Strip commas from price string and convert to float
            df["Close"] = df["Price"].str.replace(",", "").astype(float)
            df = df.set_index("Date").sort_index()

            s = df.loc[start:end, "Close"]
            s = s[s > 0]

            if len(s) < 5:
                log.warning(f"  ✗ {corr_ticker}: only {len(s)} rows in {start_str}→{end_str}")
                continue

            aligned  = s.reindex(master_index, method="ffill")
            coverage = aligned.notna().sum()

            if coverage < len(master_index) * 0.5:
                log.warning(f"  ✗ {corr_ticker}: only {coverage}/{len(master_index)} days after alignment")
                continue

            results[corr_ticker] = aligned.rename(corr_ticker)
            log.info(f"  ✓ {corr_ticker} (Investing.com:{filename}): {coverage}/{len(master_index)} days")

        except Exception as e:
            log.warning(f"  ✗ {corr_ticker}: failed to load {filename}: {e}")

    return results


# ─────────────────────────────────────────────────────────────────────────────
# MERGE
# ─────────────────────────────────────────────────────────────────────────────

def merge_all(mt5_df: pd.DataFrame,
              fred_series: dict[str, pd.Series],
              vix: Optional[pd.Series],
              stooq_series: Optional[dict[str, pd.Series]] = None) -> pd.DataFrame:
    """
    Merge MT5 (master index), FRED series, CBOE VIX, and optional Stooq
    index series into one DataFrame.
    MT5 defines the trading-day index. All other sources align to it.
    stooq_series is only passed for GFC_2008.
    """
    combined = mt5_df.copy()

    # Stooq indices first — fill the gaps MT5 couldn't cover
    if stooq_series:
        for ticker, s in stooq_series.items():
            combined[ticker] = s

    for ticker, s in fred_series.items():
        combined[ticker] = s

    if vix is not None:
        aligned = vix.reindex(combined.index, method="ffill")
        combined["VIX"] = aligned
        log.info(f"  VIX aligned: {aligned.notna().sum()}/{len(combined)} days")

    return combined


# ─────────────────────────────────────────────────────────────────────────────
# CORRELATION
# ─────────────────────────────────────────────────────────────────────────────

def compute_correlation(closes: pd.DataFrame) -> dict:
    """
    Pearson correlation on log returns.
    1. Drop columns with >20% NaN
    2. Forward-fill residual gaps
    3. Log returns: ln(P_t / P_{t-1})
    4. Pearson correlation
    """
    before    = set(closes.columns)
    threshold = len(closes) * 0.8
    closes    = closes.dropna(thresh=int(threshold), axis=1)
    dropped   = before - set(closes.columns)
    if dropped:
        log.warning(f"  Dropped (>20% NaN): {sorted(dropped)}")

    closes  = closes.ffill().bfill()
    returns = np.log(closes / closes.shift(1)).dropna()

    if len(returns) < 10:
        log.error(f"  Only {len(returns)} return obs — aborting")
        return {}

    corr    = returns.corr(method="pearson")
    tickers = list(corr.columns)
    matrix  = [
        [
            round(float(corr.loc[t1, t2]), 4) if not np.isnan(corr.loc[t1, t2]) else 0.0
            for t2 in tickers
        ]
        for t1 in tickers
    ]

    log.info(f"  ✓ Matrix: {len(tickers)}×{len(tickers)}, {len(returns)} obs")
    return {"tickers": tickers, "matrix": matrix, "nObs": len(returns)}


# ─────────────────────────────────────────────────────────────────────────────
# CACHE VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

def is_cache_valid(path: str) -> bool:
    if not os.path.exists(path):
        return False
    try:
        with open(path) as f:
            data = json.load(f)
        n = len(data.get("tickers", []))
        if n < MIN_EXPECTED_TICKERS:
            log.warning(f"  Cache has {n} tickers (min={MIN_EXPECTED_TICKERS}) — re-fetching")
            return False
        return True
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force",   action="store_true",
                        help="Re-fetch all scenarios, overwrite cache")
    parser.add_argument("--vix-csv", default=DEFAULT_VIX_CSV,
                        help=f"Path to CBOE VIX_History.csv (default: {DEFAULT_VIX_CSV})")
    args = parser.parse_args()

    print("=" * 60)
    print("CORR Crisis Data Fetcher")
    print(f"MT5: {len(MT5_SYMBOL_MAP)} symbols | FRED: {len(FRED_SERIES)} series | Stooq CSV: {len(STOOQ_CSV_MAP)} (GFC only) | CBOE: VIX")
    print("=" * 60)

    if not mt5_connect():
        print("\nERROR: MT5 failed. Check MetaTrader 5 is open and logged in.")
        return

    try:
        for scenario_id, period in CRISIS_PERIODS.items():
            cache_path = f"historical_cache/{scenario_id}.json"
            print(f"\n▶  {scenario_id}: {period['label']}")

            if not args.force and is_cache_valid(cache_path):
                with open(cache_path) as f:
                    ex = json.load(f)
                print(f"   Cached: {len(ex['tickers'])} tickers, {ex.get('nObs')} obs — skipping")
                print(f"   (--force to re-fetch)")
                continue

            # ── Step 1: MT5 ──────────────────────────────────────────────────
            print(f"   [1/3] MT5 ({len(MT5_SYMBOL_MAP)} symbols)...")
            mt5_df = fetch_mt5_period(period["start"], period["end"])
            if mt5_df.empty:
                print("   FAILED — MT5 returned no data at all")
                continue

            # ── Step 2: FRED ─────────────────────────────────────────────────
            print(f"   [2/3] FRED ({len(FRED_SERIES)} series)...")
            fred_data = fetch_all_fred(
                period["start"], period["end"], mt5_df.index
            )

            # ── Step 3: Stooq indices (GFC_2008 only) ────────────────────────
            stooq_data = {}
            if scenario_id == "GFC_2008":
                mt5_found = set(mt5_df.columns)
                missing_indices = [t for t in STOOQ_CSV_MAP if t not in mt5_found]
                if missing_indices:
                    print(f"   [3/4] Stooq + Investing.com ({len(missing_indices)} missing indices for GFC_2008)...")
                    stooq_data = load_stooq_indices(
                        period["start"], period["end"], mt5_df.index
                    )
                    # Merge in investing.com indices (FTSE) — different format, separate loader
                    investing_data = load_investing_indices(
                        period["start"], period["end"], mt5_df.index
                    )
                    stooq_data = {**stooq_data, **investing_data}
                else:
                    print(f"   [3/4] Stooq: skipped (MT5 has all indices)")

            # ── Step 4: VIX CSV ──────────────────────────────────────────────
            step_num = "4/4" if scenario_id == "GFC_2008" else "3/3"
            print(f"   [{step_num}] CBOE CSV (VIX)...")
            vix = load_vix_csv(args.vix_csv, period["start"], period["end"])

            # ── Merge ────────────────────────────────────────────────────────
            combined = merge_all(mt5_df, fred_data, vix, stooq_data or None)
            print(f"   Combined: {len(combined.columns)} columns × {len(combined)} rows")

            # ── Correlate ────────────────────────────────────────────────────
            result = compute_correlation(combined)
            if not result:
                print("   FAILED — correlation step failed")
                continue

            # ── Save ─────────────────────────────────────────────────────────
            output = {
                "scenario_id": scenario_id,
                "label":       period["label"],
                "start":       period["start"],
                "end":         period["end"],
                "tickers":     result["tickers"],
                "matrix":      result["matrix"],
                "nObs":        result["nObs"],
                "source":      "mt5+fred+cboe",
                "method":      "pearson_log_returns",
                "fetchedAt":   datetime.now().isoformat(),
            }

            with open(cache_path, "w") as f:
                json.dump(output, f, indent=2)

            print(f"   ✓ Saved → {cache_path}")
            print(f"     {len(result['tickers'])} tickers: {result['tickers']}")

    finally:
        mt5.shutdown()
        log.info("MT5 disconnected")

    print("\n" + "=" * 60)
    print("Done. Run with --force to overwrite any scenario.")
    print("=" * 60)


if __name__ == "__main__":
    main()
