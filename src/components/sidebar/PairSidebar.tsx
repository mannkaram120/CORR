import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useNexusStore } from '../../store/nexusStore';

function fmtR(r: number, dec = 4) {
  return `${r >= 0 ? '+' : ''}${r.toFixed(dec)}`;
}

function interpLabel(r: number): { text: string; color: string } {
  const a = Math.abs(r);
  const sign = r >= 0 ? 'positive' : 'negative';
  if (a >= 0.9) return { text: `Near-perfect ${sign}`, color: r > 0 ? '#00D084' : '#FF3B30' };
  if (a >= 0.7) return { text: `Strong ${sign}`,       color: r > 0 ? '#00D084' : '#FF3B30' };
  if (a >= 0.4) return { text: `Moderate ${sign}`,     color: r > 0 ? '#5a8a00' : '#cc2200' };
  if (a >= 0.15) return { text: `Weak ${sign}`,        color: '#888' };
  return { text: 'Negligible', color: '#555' };
}

function trendArrow(delta: number) {
  if (Math.abs(delta) < 0.02) return { symbol: '→', color: '#888', label: 'stable' };
  if (delta > 0)               return { symbol: '↑', color: '#00D084', label: `+${delta.toFixed(2)}` };
  return                              { symbol: '↓', color: '#FF3B30', label: delta.toFixed(2) };
}

const TT_STYLE = {
  backgroundColor: '#0D1017', border: '1px solid #1E2330', borderRadius: 2,
  fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#E8E3D5',
};

export function PairSidebar() {
  const selectedPair    = useNexusStore(s => s.selectedPair);
  const pairData        = useNexusStore(s => s.pairData);
  const baselineMatrix  = useNexusStore(s => s.baselineMatrix);
  const matrix          = useNexusStore(s => s.matrix);
  const selectPair      = useNexusStore(s => s.selectPair);

  if (!selectedPair || !pairData || !matrix) return null;

  const { row, col } = selectedPair;
  const { instrument1, instrument2, rollingCorr, prices1, prices2, scatter,
          stats, betaStats, pValue, nObs } = pairData;

  const { currentR, avg30dR, avg1yR, maxR, minR } = stats;

  // Percentile of currentR in rolling history
  const rVals     = rollingCorr.map(d => d.r);
  const sorted    = [...rVals].sort((a, b) => a - b);
  const pctIdx    = sorted.findIndex(v => v >= currentR);
  const percentile = sorted.length > 0 ? Math.round((pctIdx / sorted.length) * 100) : 50;

  // Baseline r (1Y avg from baselineMatrix)
  const bri = baselineMatrix?.tickers.indexOf(row) ?? -1;
  const bci = baselineMatrix?.tickers.indexOf(col) ?? -1;
  const baseR = (bri >= 0 && bci >= 0) ? baselineMatrix!.matrix[bri]![bci]! : avg1yR;

  // Rolling chart Y domain — auto-zoom
  const rMin = Math.min(...rVals, currentR) - 0.03;
  const rMax = Math.max(...rVals, currentR) + 0.03;

  // Regression line for scatter
  const regLine = useMemo(() => {
    if (scatter.length < 2) return null;
    const xs = scatter.map(d => d.x), ys = scatter.map(d => d.y);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) ** 2; }
    if (den < 1e-12) return null;
    const slope = num / den, intercept = my - slope * mx;
    const x1 = Math.min(...xs), x2 = Math.max(...xs);
    return [{ x: x1, y: slope * x1 + intercept }, { x: x2, y: slope * x2 + intercept }];
  }, [scatter]);

  const { text: interpText, color: interpColor } = interpLabel(currentR);
  const trend = trendArrow(currentR - avg30dR);
  const sigStars = pValue < 0.001 ? '★★★' : pValue < 0.01 ? '★★' : pValue < 0.05 ? '★' : '';

  const statCard = (label: string, val: number) => (
    <div className="stat-card" key={label}>
      <div className="stat-label">{label}</div>
      <span className={`stat-value ${val > 0.1 ? 'stat-value--pos' : val < -0.1 ? 'stat-value--neg' : 'stat-value--neu'}`}>
        {fmtR(val, 4)}
      </span>
    </div>
  );

  return (
    <aside className="pair-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-pair-title">
          <span className="inst-a">{instrument1.ticker}</span>
          <span className="inst-sep">/</span>
          <span className="inst-b">{instrument2.ticker}</span>
        </div>
        <div className="sidebar-subtitle">{instrument1.name} vs {instrument2.name}</div>
        <button className="sidebar-close" onClick={() => selectPair(null, null)} aria-label="Close sidebar">✕</button>
      </div>

      <div className="sidebar-body">

        {/* Stats grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">CURRENT R</div>
            <span className={`stat-value ${currentR > 0.1 ? 'stat-value--pos' : currentR < -0.1 ? 'stat-value--neg' : 'stat-value--neu'}`}>
              {fmtR(currentR, 4)}&nbsp;
              <span className="trend-arrow" style={{ color: trend.color }}>{trend.symbol}</span>
            </span>
          </div>
          {statCard('30D AVG R', avg30dR)}
          {statCard('1Y AVG R',  avg1yR)}
          {statCard('MAX R',     maxR)}
          {statCard('MIN R',     minR)}
          <div className="stat-card">
            <div className="stat-label">PERCENTILE</div>
            <span className="stat-value stat-value--neu">{percentile}th</span>
          </div>
        </div>

        {/* P-value */}
        <div className="sig-row">
          P = {pValue < 0.001 ? '<0.001' : pValue.toFixed(3)}
          <span className={sigStars ? 'sig-stars' : 'not-sig'}> {sigStars || '(not sig.)'}</span>
          <span style={{ color: '#555', marginLeft: 8 }}>· {nObs} days</span>
        </div>

        {/* Quick Insight */}
        <div className="quick-insight">
          <div className="quick-insight__label">QUICK INSIGHT</div>
          <div className="quick-insight__text">
            {(() => {
              const a = Math.abs(currentR);
              const sign = currentR >= 0 ? 'positively' : 'negatively';
              const delta = currentR - avg30dR;
              const deltaDir = delta > 0.02 ? 'strengthening' : delta < -0.02 ? 'weakening' : 'stable';
              const regime = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.15 ? 'weak' : 'negligible';

              let insight = `${instrument1.ticker} & ${instrument2.ticker} are ${regime}ly ${sign} correlated (r = ${fmtR(currentR, 3)}).`;

              if (deltaDir !== 'stable') {
                insight += ` Relationship ${deltaDir} — ${delta > 0 ? '+' : ''}${delta.toFixed(3)} vs 30D avg.`;
              }

              if (percentile > 90) {
                insight += ' Historically elevated (>90th pctl).';
              } else if (percentile < 10) {
                insight += ' Historically depressed (<10th pctl).';
              }

              if (pValue < 0.01) {
                insight += ' Significant at 1%.';
              } else if (pValue >= 0.05) {
                insight += ' Not significant — use caution.';
              }

              if (betaStats.currentBeta > 1.5) {
                insight += ` High β (${betaStats.currentBeta.toFixed(2)}).`;
              }

              return insight;
            })()}
          </div>
        </div>

        {/* Interpretation */}
        <div className="interpretation">
          <div className="interpretation-dot" style={{ background: interpColor }} />
          <span style={{ color: interpColor }}>{interpText}</span>
          <span className="trend-arrow" style={{ color: trend.color, marginLeft: 4 }}>
            {trend.symbol} {trend.label}
          </span>
          <span className="interpretation-r">r = {fmtR(currentR, 3)}</span>
        </div>

        {/* 30-day rolling correlation */}
        {rollingCorr.length > 0 && (
          <div className="chart-section">
            <div className="chart-section-label">30-DAY ROLLING CORRELATION</div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={rollingCorr} margin={{ top: 8, right: 12, bottom: 4, left: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[rMin, rMax]} tick={{ fontSize: 9, fill: '#555' }} tickCount={4} />
                  <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => [v.toFixed(4), 'r']} />
                  <ReferenceLine y={baseR} stroke="#FFB830" strokeDasharray="3 3" strokeWidth={0.8} />
                  <Line type="monotone" dataKey="r" stroke="#00D084" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Normalised price chart */}
        {prices1.length > 0 && (
          <div className="chart-section">
            <div className="chart-section-label">NORMALISED PRICE (BASE 100)</div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={90}>
                <LineChart margin={{ top: 8, right: 12, bottom: 4, left: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2330" />
                  <XAxis hide dataKey="date" />
                  <YAxis tick={{ fontSize: 9, fill: '#555' }} tickCount={4} />
                  <Tooltip contentStyle={TT_STYLE} />
                  <Line data={prices1} type="monotone" dataKey="price" stroke="#4A9EFF" dot={false} strokeWidth={1.5} name={instrument1.ticker} />
                  <Line data={prices2} type="monotone" dataKey="price" stroke="#FF9500" dot={false} strokeWidth={1.5} name={instrument2.ticker} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Scatter plot */}
        {scatter.length > 0 && (
          <div className="chart-section">
            <div className="chart-section-label">DAILY RETURNS SCATTER</div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={110}>
                <ScatterChart margin={{ top: 8, right: 12, bottom: 20, left: 28 }}>
                  <CartesianGrid stroke="#1E2330" />
                  <XAxis dataKey="x" type="number" name={instrument1.ticker}
                    tick={{ fontSize: 9, fill: '#555' }}
                    label={{ value: instrument1.ticker, position: 'insideBottom', offset: -8, fontSize: 9, fill: '#4A9EFF' }} />
                  <YAxis dataKey="y" type="number" name={instrument2.ticker}
                    tick={{ fontSize: 9, fill: '#555' }}
                    label={{ value: instrument2.ticker, angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: '#FF9500' }} />
                  <Tooltip contentStyle={TT_STYLE} cursor={{ strokeDasharray: '3 3', stroke: '#333' }}
                    formatter={(v: number) => [`${v.toFixed(2)}%`]} />
                  <Scatter data={scatter} fill="#00D084" fillOpacity={0.4} r={2.5} />
                  {regLine && (
                    <Line data={regLine} type="linear" dataKey="y" stroke="#4A9EFF"
                      dot={false} strokeWidth={1} strokeDasharray="4 2" legendType="none" />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Beta stats */}
        <div className="chart-section">
          <div className="chart-section-label">BETA STATS</div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">CURRENT β</div>
              <span className="stat-value stat-value--neu">{betaStats.currentBeta.toFixed(3)}</span>
            </div>
            <div className="stat-card">
              <div className="stat-label">30D AVG β</div>
              <span className="stat-value stat-value--neu">{betaStats.avg30dBeta.toFixed(3)}</span>
            </div>
            <div className="stat-card">
              <div className="stat-label">σ RATIO</div>
              <span className="stat-value stat-value--neu">{betaStats.sigmaRatio.toFixed(3)}</span>
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
}
