import MetaTrader5 as mt5
import datetime

mt5.initialize()

symbols = [
    'EURUSD','GBPUSD','USDJPY','AUDUSD','USDCHF','USDCAD','EURJPY',
    'XAUUSD','XAGUSD','USOIL','UKOIL','NATGAS',
    'SPX500','NAS100','DJ30','DAX40','FTSE100','JP225','HK50',
    'US10Y','US30Y','US05Y','US02Y'
]

crisis_ranges = {
    'GFC_2008':  (datetime.datetime(2008, 9, 1),  datetime.datetime(2009, 3, 31)),
    'COVID_2020': (datetime.datetime(2020, 2, 1), datetime.datetime(2020, 5, 31)),
    'RATES_2022': (datetime.datetime(2022, 1, 1), datetime.datetime(2022, 12, 31)),
    'CNY_2015':  (datetime.datetime(2015, 6, 1),  datetime.datetime(2015, 12, 31)),
}

print(f"{'Symbol':<12} {'Found':<8} {'GFC_2008':<12} {'COVID_2020':<12} {'RATES_2022':<12} {'CNY_2015'}")
print("-" * 75)

for sym in symbols:
    info = mt5.symbol_info(sym)
    if info is None:
        print(f"{sym:<12} NOT FOUND")
        continue

    results = []
    for crisis, (start, end) in crisis_ranges.items():
        rates = mt5.copy_rates_range(sym, mt5.TIMEFRAME_D1, start, end)
        if rates is not None and len(rates) > 5:
            results.append(f"OK({len(rates)}d)")
        else:
            results.append("MISSING")

    print(f"{sym:<12} {'YES':<8} {results[0]:<12} {results[1]:<12} {results[2]:<12} {results[3]}")

mt5.shutdown()
