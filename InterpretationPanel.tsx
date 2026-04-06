import { useMemo } from 'react';
import { useNexusStore } from '../store/nexusStore';
import { INSTRUMENT_MAP } from '../data/instruments';
import { getReturns } from '../data/dataSimulator';
import { pearson } from '../utils/correlation';
import { Sparkline } from './Sparkline';
import type { AssetClass } from '../types';

function fmt(r: number) {
  return `${r >= 0 ? '+' : ''}${r.toFixed(3)}`;
}

function pairLabel(t: string) {
  return INSTRUMENT_MAP.get(t)?.ticker ?? t;
}

export function InterpretationPanel() {
  const interpretOpen = useNexusStore(s => s.interpretOpen);
  const setInterpretOpen = useNexusStore(s => s.setInterpretOpen);
  const matrix = useNexusStore(s => s.matrix);
  const baselineMatrix = useNexusStore(s => s.baselineMatrix);
  const clusterMode = useNexusStore(s => s.clusterMode);
  const anomalyMode = useNexusStore(s => s.anomalyMode);
  const causalityMode = useNexusStore(s => s.causalityMode);
  const causalityMatrix = useNexusStore(s => s.causalityMatrix);
  const pcaResult = useNexusStore(s => s.pcaResult);
  const activeScenario = useNexusStore(s => s.activeScenario);
  const clusteredOrder = useNexusStore(s => s.clusteredOrder);

  // Sparkline data - must be before early return (hooks rule)
  const sparklineData = useMemo(() => {
    if (!matrix) return new Map<string, number[]>();
    const n = matrix.tickers.length;
    const pairs: { t1: string; t2: string; absR: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const r = matrix.matrix[i]?.[j];
        if (r !== undefined) pairs.push({ t1: matrix.tickers[i]!, t2: matrix.tickers[j]!, absR: Math.abs(r) });
      }
    }
    pairs.sort((a, b) => b.absR - a.absR);
    const top6 = pairs.slice(0, 6);
    const lookback = matrix.lookback ?? '1Y';
    const map = new Map<string, number[]>();
    const win = 30;
    for (const p of top6) {
      const xs = getReturns(p.t1, lookback);
      const ys = getReturns(p.t2, lookback);
      const len = Math.min(xs.length, ys.length);
      const pts: number[] = [];
      const step = Math.max(1, Math.floor((len - win) / 20));
      for (let t = win; t <= len; t += step) {
        pts.push(pearson(xs.slice(t - win, t), ys.slice(t - win, t)));
      }
      map.set(`${p.t1}-${p.t2}`, pts);
    }
    return map;
  }, [matrix]);

  if (!interpretOpen || !matrix) return null;

  const n = matrix.tickers.length;

  // ── Collect all pairs ──
  type Pair = { t1: string; t2: string; r: number; p: number; c1: AssetClass; c2: AssetClass; baseR: number };
  const allPairs: Pair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const row = matrix.matrix[i];
      const pRow = matrix.pValues?.[i];
      if (!row || row[j] === undefined) continue;
      const t1 = matrix.tickers[i]!;
      const t2 = matrix.tickers[j]!;
      const c1 = INSTRUMENT_MAP.get(t1)?.assetClass ?? 'FX';
      const c2 = INSTRUMENT_MAP.get(t2)?.assetClass ?? 'FX';
      const bi = baselineMatrix?.tickers.indexOf(t1) ?? -1;
      const bj = baselineMatrix?.tickers.indexOf(t2) ?? -1;
      const baseR = (bi !== -1 && bj !== -1 && baselineMatrix?.matrix[bi]?.[bj] !== undefined)
        ? baselineMatrix!.matrix[bi]![bj]! : row[j]!;
      allPairs.push({ t1, t2, r: row[j]!, p: pRow?.[j] ?? 1, c1, c2, baseR });
    }
  }

  const vals = allPairs.map(p => p.r);
  const avgCorr = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const sigPairs = allPairs.filter(p => p.p < 0.05).length;

  // PCA
  const ar1 = pcaResult?.absorptionRatios.ar1 ?? 0;
  const ar1Pct = pcaResult?.ar1Percentile ?? 50;

  // ── Diversification by class ──
  const classes: AssetClass[] = ['FX', 'Indices', 'Rates', 'Commodities'];
  const classDiversification: { cls: string; avgAbsR: number }[] = [];
  for (const cls of classes) {
    const intra = allPairs.filter(p => p.c1 === cls && p.c2 === cls);
    if (intra.length > 0) {
      const avg = intra.reduce((s, p) => s + Math.abs(p.r), 0) / intra.length;
      classDiversification.push({ cls: `${cls} internal`, avgAbsR: avg });
    }
  }
  const crossClass = allPairs.filter(p => p.c1 !== p.c2);
  if (crossClass.length > 0) {
    classDiversification.push({ cls: 'Cross-class', avgAbsR: crossClass.reduce((s, p) => s + Math.abs(p.r), 0) / crossClass.length });
  }
  const crossClassAvg = crossClass.length > 0 ? crossClass.reduce((s, p) => s + Math.abs(p.r), 0) / crossClass.length : 0;

  // ── Top correlations ──
  const sorted = [...allPairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const topPairs = sorted.slice(0, 6);

  // ── Anomalies ──
  const anomalies = allPairs
    .map(p => ({ ...p, delta: p.r - p.baseR }))
    .filter(p => Math.abs(p.delta) > 0.15)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  // ── Cluster groups ──
  let clusterGroups: { name: string; tickers: string[]; avgR: number }[] = [];
  if (clusterMode && clusteredOrder.length > 0) {
    // Simple grouping: split clustered order into groups by adjacency correlation
    const orderedTickers = clusteredOrder.map(i => matrix.tickers[i]!);
    let groups: string[][] = [[orderedTickers[0]!]];
    for (let k = 1; k < orderedTickers.length; k++) {
      const prev = orderedTickers[k - 1]!;
      const cur = orderedTickers[k]!;
      const pi = matrix.tickers.indexOf(prev);
      const ci = matrix.tickers.indexOf(cur);
      const r = matrix.matrix[pi]?.[ci] ?? 0;
      if (Math.abs(r) > 0.4 && groups[groups.length - 1]!.length < 6) {
        groups[groups.length - 1]!.push(cur);
      } else {
        groups.push([cur]);
      }
    }
    groups = groups.filter(g => g.length >= 2);
    const classLabels: Record<string, string> = {
      FX: 'Dollar pairs', Indices: 'Risk assets', Rates: 'Duration', Commodities: 'Materials',
    };
    clusterGroups = groups.map((g, idx) => {
      const dominant = g.map(t => INSTRUMENT_MAP.get(t)?.assetClass ?? 'FX');
      const mode = dominant.sort((a, b) => dominant.filter(v => v === b).length - dominant.filter(v => v === a).length)[0]!;
      // avg intra-group r
      let sum = 0, cnt = 0;
      for (let a = 0; a < g.length; a++) {
        for (let b = a + 1; b < g.length; b++) {
          const ai = matrix.tickers.indexOf(g[a]!);
          const bi = matrix.tickers.indexOf(g[b]!);
          const v = matrix.matrix[ai]?.[bi];
          if (v !== undefined) { sum += v; cnt++; }
        }
      }
      return { name: classLabels[mode] || `Group ${idx + 1}`, tickers: g, avgR: cnt > 0 ? sum / cnt : 0 };
    });
  }

  // ── Causality ──
  type CausalLink = { from: string; to: string; p: number; desc: string };
  const causalLinks: CausalLink[] = [];
  if (causalityMatrix) {
    const alpha = causalityMatrix.alpha ?? 0.05;
    const ct = causalityMatrix.tickers;
    for (let i = 0; i < ct.length; i++) {
      for (let j = 0; j < ct.length; j++) {
        if (i === j) continue;
        const pRow = causalityMatrix.pValue[i];
        if (!pRow || pRow[j] === undefined) continue;
        const p = pRow[j]!;
        if (p < alpha) {
          const from = ct[i]!;
          const to = ct[j]!;
          const fromName = INSTRUMENT_MAP.get(from)?.name ?? from;
          const toName = INSTRUMENT_MAP.get(to)?.name ?? to;
          causalLinks.push({ from, to, p, desc: `${fromName} predicts ${toName}` });
        }
      }
    }
    causalLinks.sort((a, b) => a.p - b.p);
  }

  // ── Overall assessment bullets ──
  type Bullet = { icon: string; cls: string; text: string };
  const bullets: Bullet[] = [];

  // 1. Average correlation
  if (avgCorr < 0.15)
    bullets.push({ icon: '✓', cls: 'green', text: `Low average correlation (${avgCorr.toFixed(3)}) — strong cross-asset diversification opportunity` });
  else if (avgCorr < 0.35)
    bullets.push({ icon: '⚠', cls: 'amber', text: `Moderate average correlation (${avgCorr.toFixed(3)}) — diversification adequate, monitor convergence` });
  else
    bullets.push({ icon: '✕', cls: 'red', text: `Elevated average correlation (${avgCorr.toFixed(3)}) — portfolio diversification may be compromised` });

  // 2. PCA AR(1)
  if (ar1 < 0.35)
    bullets.push({ icon: '✓', cls: 'green', text: `PCA AR(1) at ${ar1Pct}th percentile — market is NOT in a stress regime` });
  else
    bullets.push({ icon: '⚠', cls: 'amber', text: `PCA AR(1) at ${ar1Pct}th percentile — elevated systemic risk detected` });

  // 3. Anomalies
  if (anomalyMode && anomalies.length > 0) {
    const topA = anomalies.slice(0, 2).map(a => `${pairLabel(a.t1)}/${pairLabel(a.t2)}`).join(' and ');
    bullets.push({ icon: '⚠', cls: 'amber', text: `${anomalies.length} active anomalies detected — ${topA} breaking from historical norms` });
  } else if (anomalyMode) {
    bullets.push({ icon: '✓', cls: 'green', text: `No active anomalies — all correlations within historical norms` });
  }

  // 4. Within-class diversification
  const highIntraClasses = classDiversification.filter(d => d.avgAbsR > 0.6 && d.cls !== 'Cross-class');
  if (highIntraClasses.length > 0) {
    const details = highIntraClasses.map(d => `${d.cls.replace(' internal', '')} ${Math.round(d.avgAbsR * 100)}%`).join(', ');
    bullets.push({ icon: '✕', cls: 'red', text: `Within-class correlations very high (${details}) — little diversification within asset classes` });
  } else {
    bullets.push({ icon: '✓', cls: 'green', text: `Within-class correlations moderate — reasonable intra-class diversification` });
  }

  // 5. Causal links
  if (causalityMode && causalLinks.length > 0) {
    const top = causalLinks[0]!;
    bullets.push({ icon: 'i', cls: 'blue', text: `${causalLinks.length} Granger causal links detected — ${pairLabel(top.from)} leads ${pairLabel(top.to)} suggesting price discovery` });
  } else if (causalityMode) {
    bullets.push({ icon: '✓', cls: 'green', text: `No significant Granger-causal relationships at 5% level` });
  }

  // 6. Cluster concentration
  if (clusterMode && clusterGroups.length > 0) {
    const largest = clusterGroups.reduce((a, b) => a.tickers.length > b.tickers.length ? a : b);
    bullets.push({ icon: 'i', cls: 'blue', text: `${clusterGroups.length} structural clusters — largest group (${largest.name}) has ${largest.tickers.length} instruments` });
  }

  function barColor(avgAbsR: number) {
    if (avgAbsR > 0.6) return 'var(--red)';
    if (avgAbsR > 0.35) return 'var(--amber)';
    return 'var(--green)';
  }

  return (
    <div className="interpret-overlay" onClick={e => { if (e.target === e.currentTarget) setInterpretOpen(false); }}>
      <div className="interpret-panel">
        <div className="interpret-panel__header">
          <span className="interpret-panel__title">◎ INTERPRETATION</span>
          {activeScenario !== 'LIVE' && (
            <span className="interpret-scenario-badge">⚠ {activeScenario}</span>
          )}
          <button className="interpret-panel__close" onClick={() => setInterpretOpen(false)}>✕</button>
        </div>

        <div className="interpret-panel__body">

          {/* ── Market Health Snapshot ── */}
          <div className="interpret-section">
            <div className="interpret-section__label">■ MARKET HEALTH SNAPSHOT</div>
            <div className="interpret-health-cards">
              <div className="interpret-health-card">
                <div className="interpret-health-card__label">AVG |r|</div>
                <div className="interpret-health-card__value">{Math.abs(avgCorr).toFixed(3)}</div>
                <div className="interpret-health-card__sub">
                  {Math.abs(avgCorr) < 0.15 ? 'Low — good diversification' : Math.abs(avgCorr) < 0.35 ? 'Moderate correlation' : 'High — concentrated risk'}
                </div>
                <div className="interpret-health-card__bar" style={{ width: `${Math.min(Math.abs(avgCorr) * 100, 100)}%`, background: barColor(Math.abs(avgCorr)) }} />
              </div>
              <div className="interpret-health-card">
                <div className="interpret-health-card__label">SIG PAIRS</div>
                <div className="interpret-health-card__value">{allPairs.length > 0 ? Math.round(sigPairs / allPairs.length * 100) : 0}%</div>
                <div className="interpret-health-card__sub">{sigPairs} of {allPairs.length} (p &lt; 0.05)</div>
              </div>
              <div className="interpret-health-card">
                <div className="interpret-health-card__label">PCA AR(1)</div>
                <div className="interpret-health-card__value">{(ar1 * 100).toFixed(1)}%</div>
                <div className="interpret-health-card__sub">{ar1Pct}th pctl — {ar1 > 0.35 ? 'high systemic risk' : 'low systemic risk'}</div>
              </div>
            </div>
          </div>

          {/* ── Diversification Quality ── */}
          <div className="interpret-section">
            <div className="interpret-section__label">■ DIVERSIFICATION QUALITY</div>
            <div className="interpret-divbars">
              {classDiversification.map(d => (
                <div key={d.cls} className="interpret-divbar-row">
                  <span className="interpret-divbar-label">{d.cls}</span>
                  <div className="interpret-divbar-track">
                    <div className="interpret-divbar-fill" style={{ width: `${Math.min(d.avgAbsR * 100, 100)}%`, background: barColor(d.avgAbsR) }} />
                  </div>
                  <span className="interpret-divbar-val">{Math.round(d.avgAbsR * 100)}%</span>
                </div>
              ))}
            </div>
            <div className="interpret-section__footnote">
              {crossClassAvg < 0.25
                ? 'Cross-class diversification is strong — within-class instruments are highly correlated'
                : 'Cross-class diversification is moderate — some factor overlap across asset classes'}
            </div>
          </div>

          {/* ── Top Correlations ── */}
          <div className="interpret-section">
            <div className="interpret-section__label">■ TOP CORRELATIONS</div>
            <div className="interpret-top-table">
              {topPairs.map(p => {
                const delta = p.r - p.baseR;
                const isAnomaly = Math.abs(delta) > 0.15;
                const sameClass = p.c1 === p.c2;
                let desc = '';
                if (sameClass) desc = `${p.c1.toLowerCase()} co-move`;
                else if (p.r < -0.5) desc = 'fear vs risk';
                else desc = `cross-class`;
                if (isAnomaly) desc += delta > 0 ? ' ↑' : ' ↓';
                return (
                  <div key={`${p.t1}-${p.t2}`} className="interpret-top-row">
                    <span className="interpret-top-pair">{pairLabel(p.t1)} / {pairLabel(p.t2)}</span>
                    <Sparkline data={sparklineData.get(`${p.t1}-${p.t2}`) ?? []} width={56} height={14} />
                    <span className="interpret-top-val" style={{ color: p.r > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(p.r)}</span>
                    <span className="interpret-top-badges">
                      {p.p < 0.05 && <span className="interpret-badge interpret-badge--sig">sig</span>}
                      {isAnomaly && <span className="interpret-badge interpret-badge--anomaly">anomaly</span>}
                    </span>
                    <span className="interpret-top-desc">{desc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Anomaly Analysis ── */}
          {anomalyMode && (
            <div className="interpret-section">
              <div className="interpret-section__label">⚡ ANOMALY ANALYSIS (when anomaly mode ON)</div>
              {anomalies.length === 0 ? (
                <div className="interpret-section__footnote">No significant anomalies detected (Δr &gt; 0.15 vs 1Y avg).</div>
              ) : (
                <>
                  <div className="interpret-top-table">
                    {anomalies.map(a => (
                      <div key={`${a.t1}-${a.t2}`} className="interpret-top-row">
                        <span className="interpret-top-pair">{pairLabel(a.t1)} / {pairLabel(a.t2)}</span>
                        <span className="interpret-top-val" style={{ color: a.r > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(a.r)}</span>
                        <span className="interpret-anomaly-delta" style={{ color: a.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                          {a.delta > 0 ? '▲' : '▼'} {a.delta > 0 ? '+' : ''}{a.delta.toFixed(2)} vs 1Y avg
                        </span>
                        <span className="interpret-top-desc">{a.delta > 0 ? 'breaking out' : 'breaking down'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="interpret-section__footnote">
                    Direction arrows show whether the anomaly is strengthening or weakening vs 1Y baseline
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Cluster Groups ── */}
          {clusterMode && (
            <div className="interpret-section">
              <div className="interpret-section__label">○ CLUSTER GROUPS (when cluster mode ON)</div>
              {clusterGroups.length === 0 ? (
                <div className="interpret-section__footnote">Clustering active but no distinct groups identified.</div>
              ) : (
                <>
                  <div className="interpret-section__footnote" style={{ marginBottom: 8 }}>
                    Hierarchical clustering identified {clusterGroups.length} structural groups:
                  </div>
                  {clusterGroups.map((g, idx) => (
                    <div key={idx} className="interpret-cluster-group">
                      <div className="interpret-cluster-name">GROUP {idx + 1} — {g.name}</div>
                      <div className="interpret-cluster-tickers">
                        {g.tickers.map(t => (
                          <span key={t} className="interpret-cluster-badge">{pairLabel(t)}</span>
                        ))}
                        <span className="interpret-cluster-avgr">avg r = {g.avgR.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Granger Causality ── */}
          {causalityMode && (
            <div className="interpret-section">
              <div className="interpret-section__label">➜ GRANGER CAUSALITY (when causality mode ON)</div>
              {causalLinks.length === 0 ? (
                <div className="interpret-section__footnote">No statistically significant Granger-causal relationships at 5% level.</div>
              ) : (
                <div className="interpret-top-table">
                  {causalLinks.slice(0, 5).map((c, i) => (
                    <div key={i} className="interpret-top-row interpret-causal-row">
                      <span className="interpret-causal-pair">
                        <strong>{pairLabel(c.from)}</strong>
                        <span className="interpret-causal-arrow">→ leads →</span>
                        <strong style={{ color: 'var(--green)' }}>{pairLabel(c.to)}</strong>
                      </span>
                      <span className="interpret-top-desc">{c.desc}</span>
                      <span className="interpret-causal-p">p = {c.p.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Overall Assessment ── */}
          <div className="interpret-section interpret-section--summary">
            <div className="interpret-section__label">■ OVERALL ASSESSMENT</div>
            <div className="interpret-bullets">
              {bullets.map((b, i) => (
                <div key={i} className={`interpret-bullet interpret-bullet--${b.cls}`}>
                  <span className="interpret-bullet__icon">{b.icon}</span>
                  <span className="interpret-bullet__text">{b.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
