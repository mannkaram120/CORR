"""
mt5_connection.py — MT5 connection for IC Markets demo account.

All 22 symbols verified present on ICMarketsSC-Demo.
Rates (UST05Y, UST10Y, UST30Y) are available directly via MT5.
VIX and US2Y use fallback (simulator) — not available on IC Markets MT5.
"""

import MetaTrader5 as mt5
import logging
import time

log = logging.getLogger("corr.mt5")

# ── Verified symbol map (all tested on ICMarketsSC-Demo) ─────────────────────

SYMBOL_MAP: dict[str, str] = {
    # FX (7)
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
    "USDJPY": "USDJPY",
    "AUDUSD": "AUDUSD",
    "USDCHF": "USDCHF",
    "USDCAD": "USDCAD",
    "EURJPY": "EURJPY",   # EURJPY

    # Indices (8)
    "SPX":  "US500",
    "NDX":  "USTEC",
    "DJI":  "US30",
    "DAX":  "DE40",
    "FTSE": "UK100",
    "NKY":  "JP225",
    "HSI":  "HK50",
    "VIX":  None,         # Not available on IC Markets — will use simulator

    # Commodities (6)
    "XAU":    "XAUUSD",
    "XAG":    "XAGUSD",
    "WTI":    "XTIUSD",
    "BRENT":  "XBRUSD",
    "NATGAS": "XNGUSD",
    "COPPER": None,       # Not available on IC Markets — will use simulator

    # Rates (4) — available directly via MT5 bonds
    "US2Y":  None,          # Not on IC Markets — simulator fallback
    "US5Y":  "UST05Y_M6",
    "US10Y": "UST10Y_M6",
    "US30Y": "UST30Y_M6",
}

# Tickers that have valid MT5 symbols
MT5_TICKERS = [t for t, s in SYMBOL_MAP.items() if s is not None]

# Tickers that will use simulator (no MT5 symbol available)
SIMULATOR_TICKERS = [t for t, s in SYMBOL_MAP.items() if s is None]


def connect() -> bool:
    """Initialize MT5 connection. Returns True if successful."""
    if not mt5.initialize():
        log.error(f"MT5 initialize failed: {mt5.last_error()}")
        return False

    info = mt5.terminal_info()
    if info is None:
        log.error("MT5 terminal not running — open MetaTrader 5 and log in first")
        mt5.shutdown()
        return False

    account = mt5.account_info()
    if account is None:
        log.error("Not logged in to MT5 — log in to IC Markets in the terminal")
        mt5.shutdown()
        return False

    log.info(
        f"MT5 connected: account={account.login} "
        f"server={account.server} "
        f"balance={account.balance} {account.currency}"
    )
    return True


def ensure_connected() -> bool:
    """Check connection, reconnect if dropped."""
    if mt5.terminal_info() is not None:
        return True
    log.warning("MT5 disconnected — reconnecting...")
    for attempt in range(3):
        time.sleep(2 * (attempt + 1))
        if connect():
            log.info("MT5 reconnected")
            return True
    log.error("MT5 reconnect failed after 3 attempts")
    return False


def shutdown():
    mt5.shutdown()
    log.info("MT5 connection closed")
