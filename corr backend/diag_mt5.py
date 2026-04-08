"""
diag_mt5.py — Quick diagnostic for missing symbols.
Run: python diag_mt5.py
"""
import MetaTrader5 as mt5
import datetime

mt5.initialize()

# ── 1. Check exact symbol names for problem tickers ──────────────────────────
suspects = [
    # AUDUSD variants
    'AUDUSD', 'AUDUSD.', 'AUDUSDm', 'AUDUSD+',
    # USDCAD variants
    'USDCAD', 'USDCAD.', 'USDCADm', 'USDCAD+',
    # Energy variants
    'XTIUSD', 'XTIUSD.', 'WTI', 'USOIL', 'OIL',
    'XBRUSD', 'XBRUSD.', 'BRENT', 'UKOIL',
    'XNGUSD', 'XNGUSD.', 'NATGAS', 'NG',
]

print("=" * 55)
print("SYMBOL EXISTENCE CHECK")
print("=" * 55)
for sym in suspects:
    info = mt5.symbol_info(sym)
    if info:
        print(f"  FOUND:   {sym:<15} visible={info.visible}")
    else:
        print(f"  missing: {sym}")

# ── 2. For found symbols, check historical depth ─────────────────────────────
print("\n" + "=" * 55)
print("HISTORICAL DATA DEPTH (how far back MT5 has data)")
print("=" * 55)

check_dates = {
    'GFC_2008':  datetime.datetime(2008, 9,  1),
    'CNY_2015':  datetime.datetime(2015, 6,  1),
    'COVID_2020': datetime.datetime(2020, 2, 1),
}

focus = ['AUDUSD', 'USDCAD', 'XTIUSD', 'XBRUSD', 'XNGUSD']
# also try dot variants if base not found
for sym in focus:
    info = mt5.symbol_info(sym)
    if info is None:
        dot = sym + '.'
        info = mt5.symbol_info(dot)
        if info:
            sym = dot

    if info is None:
        print(f"  {sym}: NOT FOUND — skipping")
        continue

    mt5.symbol_select(sym, True)
    print(f"\n  {sym}:")
    for label, start in check_dates.items():
        end = start + datetime.timedelta(days=30)
        rates = mt5.copy_rates_range(sym, mt5.TIMEFRAME_D1, start, end)
        if rates and len(rates) > 1:
            print(f"    {label}: OK ({len(rates)} bars)")
        else:
            print(f"    {label}: NO DATA")

mt5.shutdown()
print("\nDone.")
