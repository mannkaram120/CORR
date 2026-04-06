import type { ScenarioId, CorrelationMatrix } from '../types';
import { INSTRUMENT_MAP } from './instruments';

export interface Scenario {
  id: ScenarioId;
  name: string;
  description: string;
  /** Correlation multipliers per asset-class pair — applied over the live matrix */
  shocks: Record<string, number>;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'GFC_2008',
    name: '2008 GFC',
    description: 'Global Financial Crisis — Sep–Dec 2008. All correlations spike toward +1.',
    shocks: { 'Indices-Indices': 0.98, 'FX-Indices': 0.75, 'Commodities-Indices': 0.80, 'Rates-Indices': -0.82 },
  },
  {
    id: 'COVID_2020',
    name: 'COVID 2020',
    description: 'COVID crash — Feb–Mar 2020. Risk-off across all classes.',
    shocks: { 'Indices-Indices': 0.97, 'FX-Indices': 0.68, 'Commodities-Indices': 0.72, 'Rates-Indices': -0.78 },
  },
  {
    id: 'RATES_2022',
    name: '2022 Rate Shock',
    description: 'Fed rate hike cycle — Jan–Jun 2022. Bonds and equities move together.',
    shocks: { 'Indices-Indices': 0.91, 'Rates-Indices': 0.65, 'FX-Rates': 0.60, 'Commodities-Rates': 0.55 },
  },
  {
    id: 'CNY_2015',
    name: 'CNY 2015',
    description: 'CNY devaluation — Aug 2015. EM and commodity pairs spike.',
    shocks: { 'FX-FX': 0.72, 'Commodities-FX': 0.68, 'Indices-Commodities': 0.74 },
  },
];

export function scenarioLabel(id: ScenarioId): string {
  const s = SCENARIOS.find(s => s.id === id);
  return s ? s.name : id;
}

/**
 * Apply a scenario's shocks to the live correlation matrix.
 * Returns a new matrix with adjusted correlation values.
 * Called as: applyScenarioToLive(liveMatrix, scenarioId)
 */
export function applyScenarioToLive(
  live: CorrelationMatrix,
  scenarioId: ScenarioId
): CorrelationMatrix {
  if (scenarioId === 'LIVE') return live;
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) return live;

  const n = live.tickers.length;
  const newMatrix = live.matrix.map(row => [...row]);

  /** Look up the shock for a given pair of asset classes.
   *  Tries both orderings (e.g. "FX-Indices" and "Indices-FX").
   *  Falls back to null if no shock is defined for this pair. */
  const getShock = (acI: string, acJ: string): number | null => {
    const k1 = `${acI}-${acJ}`;
    const k2 = `${acJ}-${acI}`;
    if (scenario.shocks[k1] !== undefined) return scenario.shocks[k1]!;
    if (scenario.shocks[k2] !== undefined) return scenario.shocks[k2]!;
    return null;
  };

  for (let i = 0; i < n; i++) {
    const acI = INSTRUMENT_MAP.get(live.tickers[i]!)?.assetClass ?? '';
    for (let j = i + 1; j < n; j++) {
      const acJ = INSTRUMENT_MAP.get(live.tickers[j]!)?.assetClass ?? '';
      const shock = getShock(acI, acJ);
      if (shock === null) continue; // no shock defined for this pair — leave as live

      const r = live.matrix[i]![j]!;
      // Blend: 60% toward scenario shock target, 40% retains live correlation
      const blended = Math.max(-1, Math.min(1, 0.6 * shock * Math.sign(r) + 0.4 * r));
      newMatrix[i]![j] = blended;
      newMatrix[j]![i] = blended;
    }
  }

  return { ...live, matrix: newMatrix, timestamp: new Date() };
}
