"""
validate_symbols.py — Run this ONCE after setup to check which
Exness symbols are available on your account.

Usage:
  python validate_symbols.py

Output shows which CORR tickers map correctly to your Exness MT5 account.
Fix any ✗ entries in mt5_connection.py SYMBOL_MAP.
"""

import MetaTrader5 as mt5
from mt5_connection import SYMBOL_MAP, connect, shutdown

def main():
    if not connect():
        print("ERROR: Could not connect to MT5")
        print("Make sure MT5 terminal is open and logged in to Exness")
        return

    print(f"\n{'Ticker':<10} {'MT5 Symbol':<15} {'Status':<8} {'Spread'}")
    print("-" * 55)

    available = []
    missing   = []

    for corr_ticker, mt5_symbol in SYMBOL_MAP.items():
        if mt5_symbol is None:
            print(f"{corr_ticker:<10} {'(rates/N/A)':<15} {'SKIP':<8}")
            continue

        info = mt5.symbol_info(mt5_symbol)
        if info is not None:
            spread = round(info.spread * info.point, 5)
            print(f"{corr_ticker:<10} {mt5_symbol:<15} {'✓ OK':<8} {spread}")
            available.append(corr_ticker)
        else:
            print(f"{corr_ticker:<10} {mt5_symbol:<15} {'✗ MISSING':<8}")
            missing.append(corr_ticker)

    print(f"\nAvailable: {len(available)}/{len(SYMBOL_MAP)} symbols")

    if missing:
        print(f"\nMissing symbols — update SYMBOL_MAP in mt5_connection.py:")
        for t in missing:
            print(f"  {t}: try searching '{SYMBOL_MAP[t]}' in MT5 Market Watch")

    shutdown()

if __name__ == "__main__":
    main()
