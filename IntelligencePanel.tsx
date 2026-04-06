import { useState } from 'react';
import { useNexusStore } from '../../store/nexusStore';
import { INSTRUMENT_MAP } from '../../data/instruments';
import { EigenvalueChart } from '../EigenvalueChart';
import { PC1LoadingsChart } from '../PC1LoadingsChart';

type Tab = 'top-pairs' | 'regime' | 'stats' | 'pca';

function fmt(r: number) {
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}`;
}
function rColor(r: number) {
  return r > 0 ? '#5a8a00' : r < 0 ? '#cc2200' : '#888888';
}
function RDot({ r }: { r: number }) {
  return <span className="intel-dot" style={{ background: rColor(r) }} aria-hidden="true" />;
}

export function IntelligencePanel() {
  const matrix         = useNexusStore(s => s.matrix);
  const baselineMatrix = useNexusStore(s => s.baselineMatrix);
  const pcaResult      = useNexusStore(s => s.pcaResult);
  const drawerOpen     = useNexusStore(s => s.drawerOpen);
  const setDrawerOpen  = useNexusStore(s => s.setDrawerOpen);
  const selectPair     = useNexusStore(s => s.selectPair);

  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  if (!matrix) return null;

  // ── Derive all unique pairs ─────────────────────────────────────────────────
  const pairs: { row: string; col: string; r: number; pVal: number; baseR: number }[] = [];
  for (let i = 0; i < matrix.tickers.length; i++) {
    for (let j = i + 1; j < matrix.tickers.length; j++) {
      const row  = matrix.tickers[i]!;
      const col  = matrix.tickers[j]!;
      const r    = matrix.matrix[i]![j]!;
      const pVal = matrix.pValues[i]![j]!;
      const bi   = baselineMatrix?.tickers.indexOf(row) ?? -1;
      const bj   = baselineMatrix?.tickers.indexOf(col) ?? -1;
      const baseR = (bi !== -1 && bj !== -1) ? baselineMatrix!.matrix[bi]![bj]! : r;
      pairs.push({ row, col, r, pVal, baseR });
    }
  }
  if (pairs.length === 0) return null;

  const sorted      = [...pairs].sort((a, b) => b.r - a.r);
  const topPos      = sorted.slice(0, 5);
  const topNeg      = sorted.slice(-5).reverse();
  const nPairs      = pairs.length;
  const avgAbsR     = pairs.reduce((s, p) => s + Math.abs(p.r), 0) / nPairs;
  const baseAvgR    = pairs.reduce((s, p) => s + Math.abs(p.baseR), 0) / nPairs;
  const regimeDelta = avgAbsR - baseAvgR;
  const maxR        = sorted[0]?.r ?? 0;
  const minR        = sorted[sorted.length - 1]?.r ?? 0;
  const sigPct      = Math.round(pairs.filter(p => p.pVal < 0.05).length / nPairs * 100);
  const anomalies   = [...pairs]
    .map(p => ({ ...p, delta: p.r - p.baseR }))
    .filter(p => Math.abs(p.delta) > 0.2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  function pairLabel(row: string, col: string) {
    return `${INSTRUMENT_MAP.get(row)?.ticker ?? row} / ${INSTRUMENT_MAP.get(col)?.ticker ?? col}`;
  }
  function toggle(tab: Tab) {
    const willExpand = activeTab !== tab;
    setActiveTab(willExpand ? tab : null);
    setDrawerOpen(willExpand);
    if (willExpand) {
      selectPair(null, null);  // Close sidebar when opening drawer
    }
  }

  const expanded = drawerOpen && activeTab !== null;

  return (
    <div className={`intel-panel ${expanded ? 'intel-panel--expanded' : 'intel-panel--collapsed'}`}>

      {/* ── Tab strip ── always 32 px ─────────────────────────────────── */}
      <div className="intel-tab-strip">

        <button
          className={`intel-tab ${activeTab === 'top-pairs' ? 'intel-tab--active' : ''}`}
          onClick={() => toggle('top-pairs')}
          title="Top positively and negatively correlated pairs"
        >
          ↑↓ TOP PAIRS
        </button>

        <button
          className={`intel-tab ${activeTab === 'regime' ? 'intel-tab--active' : ''}`}
          onClick={() => toggle('regime')}
          title="Regime monitor and anomaly detection"
        >
          ⚡ REGIME
          {anomalies.length > 0 && (
            <span className="intel-tab__badge">{anomalies.length}</span>
          )}
        </button>

        <button
          className={`intel-tab ${activeTab === 'stats' ? 'intel-tab--active' : ''}`}
          onClick={() => toggle('stats')}
          title="Matrix statistics summary"
        >
          Σ STATS
        </button>

        <button
          className={`intel-tab ${activeTab === 'pca' ? 'intel-tab--active' : ''}`}
          onClick={() => toggle('pca')}
          title="PCA / eigenvalue decomposition"
        >
          Φ PCA
          {pcaResult && pcaResult.ar1Percentile > 75 && (
            <span className="intel-tab__badge">!</span>
          )}
        </button>

        <button
          className="intel-tab-strip__arrow"
          onClick={() => {
            if (expanded) {
              setActiveTab(null);
              setDrawerOpen(false);
            } else {
              // If clicking arrow when collapsed, expand to first tab
              setActiveTab('top-pairs');
              setDrawerOpen(true);
              selectPair(null, null);
            }
          }}
          title={expanded ? 'Collapse drawer' : 'Expand drawer'}
          aria-label={expanded ? 'Collapse intelligence panel' : 'Expand intelligence panel'}
        >
          {expanded ? '▼' : '▲'}
        </button>
      </div>

      {/* ── Content area ── only rendered when a tab is active ──────────── */}
      {expanded && (
        <div className="intel-content">

          {activeTab === 'top-pairs' && (
            <>
              <div className="intel-col">
                <div className="intel-col__head">TOP POSITIVE</div>
                <div className="intel-section">
                  {topPos.map(p => (
                    <div key={`${p.row}_${p.col}`} className="intel-row">
                      <RDot r={p.r} />
                      <span className="intel-pair">{pairLabel(p.row, p.col)}</span>
                      <span className="intel-val" style={{ color: rColor(p.r) }}>{fmt(p.r)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="intel-divider" />
              <div className="intel-col">
                <div className="intel-col__head">TOP NEGATIVE</div>
                <div className="intel-section">
                  {topNeg.map(p => (
                    <div key={`${p.row}_${p.col}`} className="intel-row">
                      <RDot r={p.r} />
                      <span className="intel-pair">{pairLabel(p.row, p.col)}</span>
                      <span className="intel-val" style={{ color: rColor(p.r) }}>{fmt(p.r)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'regime' && (
            <>
              <div className="intel-col">
                <div className="intel-col__head">REGIME</div>
                <div className="intel-section">
                  <div className="intel-stat-row">
                    <span className="intel-stat-label">Avg |r|</span>
                    <span className="intel-stat-val">{avgAbsR.toFixed(3)}</span>
                  </div>
                  <div className="intel-stat-row">
                    <span className="intel-stat-label">vs 1Y avg</span>
                    <span className="intel-stat-val" style={{
                      color: regimeDelta > 0.01 ? '#5a8a00' : regimeDelta < -0.01 ? '#cc2200' : '#888888'
                    }}>
                      {regimeDelta > 0.005 ? '↑' : regimeDelta < -0.005 ? '↓' : '→'}{' '}
                      {regimeDelta >= 0 ? '+' : ''}{regimeDelta.toFixed(3)}
                    </span>
                  </div>
                  <div className="intel-stat-row">
                    <span className="intel-stat-label">Lookback</span>
                    <span className="intel-stat-val">{matrix.lookback}</span>
                  </div>
                  <div className="intel-stat-row">
                    <span className="intel-stat-label">Method</span>
                    <span className="intel-stat-val">{matrix.method}</span>
                  </div>
                </div>
              </div>
              <div className="intel-divider" />
              <div className="intel-col">
                <div className="intel-col__head">⚡ ANOMALIES (Δr &gt; 0.20 vs 1Y)</div>
                <div className="intel-section">
                  {anomalies.length === 0 ? (
                    <div className="intel-empty">No anomalies detected</div>
                  ) : anomalies.map(p => (
                    <div key={`${p.row}_${p.col}`} className="intel-row">
                      <span className="intel-pair">{pairLabel(p.row, p.col)}</span>
                      <span className="intel-val" style={{ color: '#b45309' }}>
                        {p.delta >= 0 ? '+' : ''}{p.delta.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'stats' && (
            <div className="intel-col">
              <div className="intel-col__head">MATRIX SUMMARY</div>
              <div className="intel-section intel-section--grid">
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Max r</span>
                  <span className="intel-stat-val" style={{ color: rColor(maxR) }}>{fmt(maxR)}</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Min r</span>
                  <span className="intel-stat-val" style={{ color: rColor(minR) }}>{fmt(minR)}</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Avg |r|</span>
                  <span className="intel-stat-val">{avgAbsR.toFixed(3)}</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Sig pairs (p&lt;0.05)</span>
                  <span className="intel-stat-val">{sigPct}%</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Instruments</span>
                  <span className="intel-stat-val">{matrix.tickers.length}</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Unique pairs</span>
                  <span className="intel-stat-val">{nPairs}</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">Anomaly count</span>
                  <span className="intel-stat-val" style={{ color: anomalies.length > 0 ? '#b45309' : '#888888' }}>
                    {anomalies.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pca' && pcaResult && (
            <div className="intel-col" style={{ width: '100%' }}>
              <div className="intel-col__head">PCA / SYSTEMIC RISK</div>

              <div className="intel-section intel-section--grid">
                <div className="intel-stat-row">
                  <span className="intel-stat-label">AR1</span>
                  <span className="intel-stat-val">{(pcaResult.absorptionRatios.ar1 * 100).toFixed(1)}%</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">AR3</span>
                  <span className="intel-stat-val">{(pcaResult.absorptionRatios.ar3 * 100).toFixed(1)}%</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">AR N/2</span>
                  <span className="intel-stat-val">{(pcaResult.absorptionRatios.arHalf * 100).toFixed(1)}%</span>
                </div>
                <div className="intel-stat-row">
                  <span className="intel-stat-label">AR1 percentile</span>
                  <span
                    className="intel-stat-val"
                    style={{ color: pcaResult.ar1Percentile > 75 ? '#b45309' : '#888888' }}
                  >
                    {pcaResult.ar1Percentile}%
                  </span>
                </div>
              </div>

              {pcaResult.ar1Percentile > 75 && (
                <div className="intel-empty" style={{ color: '#b45309', marginTop: 8 }}>
                  ELEVATED SYSTEMIC CORRELATION — market moving as one unit.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <EigenvalueChart eigenvalues={pcaResult.eigenvalues} />
                <PC1LoadingsChart data={pcaResult.pc1Loadings} />
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
