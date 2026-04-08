"""
historical.py — Loads pre-fetched crisis correlation data from JSON files.

Data is fetched once offline using fetch_crisis_data.py.
This module just reads the files — no API calls ever at runtime.
"""

import json
import os
import logging
from typing import Optional

log = logging.getLogger("corr.historical")

CACHE_DIR = "historical_cache"

CRISIS_PERIODS = {
    "GFC_2008":   "Global Financial Crisis (Sep 2008 - Mar 2009)",
    "COVID_2020": "COVID Crash (Feb - May 2020)",
    "RATES_2022": "Fed Rate Shock (Full Year 2022)",
    "CNY_2015":   "CNY Devaluation (Jun - Dec 2015)",
}


def get_historical_correlation(
    scenario_id: str,
    tickers: list[str],
    force_refresh: bool = False,
) -> Optional[dict]:
    """
    Load pre-fetched historical correlation from JSON file.
    Returns None if file not found (run fetch_crisis_data.py first).
    """
    path = os.path.join(CACHE_DIR, f"{scenario_id}.json")

    if not os.path.exists(path):
        log.error(
            f"No historical data for {scenario_id}. "
            f"Run: python fetch_crisis_data.py"
        )
        return None

    try:
        with open(path, 'r') as f:
            data = json.load(f)

        all_tickers = data["tickers"]
        all_matrix  = data["matrix"]

        # Filter to requested tickers if subset is provided
        if tickers:
            requested = [t for t in tickers if t in all_tickers]
            if len(requested) < 4:
                log.warning(f"Too few matching tickers ({len(requested)}) for {scenario_id}")
                return data  # return full dataset as fallback

            idx = {t: all_tickers.index(t) for t in requested}
            filtered_matrix = [
                [all_matrix[idx[t1]][idx[t2]] for t2 in requested]
                for t1 in requested
            ]
            return {**data, "tickers": requested, "matrix": filtered_matrix}

        log.info(
            f"Loaded {scenario_id}: {len(all_tickers)} tickers, "
            f"{data.get('nObs')} obs, source={data.get('source')}"
        )
        return data

    except Exception as e:
        log.error(f"Failed to load {path}: {e}")
        return None
