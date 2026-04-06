import { useState } from 'react';
import { useNexusStore } from '../store/nexusStore';
import { INSTRUMENTS } from '../data/instruments';
import type { AssetClass } from '../types';

const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  FX:          '#4A9EFF',
  Indices:     '#00D084',
  Rates:       '#FFB830',
  Commodities: '#FF6B35',
};

function fmt2(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

export function PortfolioPanel() {
  const portfolioOpen          = useNexusStore(s => s.portfolioOpen);
  const setPortfolioOpen       = useNexusStore(s => s.setPortfolioOpen);
  const portfolioWeights       = useNexusStore(s => s.portfolioWeights);
  const setPortfolioWeightPct  = useNexusStore(s => s.setPortfolioWeightPct);
  const normalizePortfolioTo100 = useNexusStore(s => s.normalizePortfolioTo100);
  const portfolioMode          = useNexusStore(s => s.portfolioMode);
  const setPortfolioMode       = useNexusStore(s => s.setPortfolioMode);
  const portfolioMetrics       = useNexusStore(s => s.portfolioMetrics);
  const activeInstruments      = useNexusStore(s => s.activeInstruments);
  const [showInterpret, setShowInterpret] = useState(false);

  if (!portfolioOpen) return null;

  const activeInstrs = INSTRUMENTS.filter(i => activeInstruments.includes(i.ticker));
  const totalWeight  = Object.values(portfolioWeights).reduce((s, v) => s + v, 0);
  const totalPct     = +(totalWeight * 100).toFixed(1);

  const classes: AssetClass[] = ['FX', 'Indices', 'Rates', 'Commodities'];

  return (
    <div className="portfolio-overlay" onClick={e => { if (e.target === e.currentTarget) setPortfolioOpen(false); }}>
      <div className="portfolio-panel">
        {/* Header */}
        <div className="portfolio-panel__header">
          <span className="portfolio-panel__title">PORTFOLIO ANALYZER</span>
          <span style={{ fontSize: 10, color: '#555', marginRight: 16 }}>
            Total: <span style={{ color: totalPct > 101 ? '#FF3B30' : totalPct > 99 ? '#00D084' : '#888' }}>{totalPct}%</span>
          </span>
          <button
            style={{
              fontSize: 9, padding: '3px 12px', marginRight: 8,
              border: '1px solid #1E2330', color: '#888', background: 'transparent',
              borderRadius: 2, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            }}
            onClick={normalizePortfolioTo100}
          >
            Normalize to 100%
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 12, fontSize: 10, color: '#888', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={portfolioMode}
              onChange={e => setPortfolioMode(e.target.checked)}
              style={{ accentColor: '#4A9EFF', width: 12, height: 12 }}
            />
            Show in heatmap
          </label>
          <button className="portfolio-panel__close" onClick={() => setPortfolioOpen(false)}>✕</button>
        </div>

        <div className="portfolio-panel__body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Left: weight sliders */}
            <div>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: '1.5px', marginBottom: 12 }}>INSTRUMENT WEIGHTS</div>
              {classes.map(cls => {
                const group = activeInstrs.filter(i => i.assetClass === cls);
                if (group.length === 0) return null;
                return (
                  <div key={cls} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, color: ASSET_CLASS_COLORS[cls], letterSpacing: '1.5px', marginBottom: 6, fontWeight: 700 }}>{cls}</div>
                    {group.map(instr => {
                      const wPct = +((portfolioWeights[instr.ticker] ?? 0) * 100).toFixed(1);
                      return (
                        <div key={instr.ticker} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-primary)', minWidth: 56 }}>{instr.ticker}</span>
                          <input
                            type="range"
                            min={0} max={100} step={1}
                            value={wPct}
                            onChange={e => setPortfolioWeightPct(instr.ticker, parseFloat(e.target.value))}
                            style={{ flex: 1, accentColor: ASSET_CLASS_COLORS[cls] }}
                          />
                          <input
                            type="number"
                            min={0} max={100} step={1}
                            value={wPct}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) && v >= 0 && v <= 100) setPortfolioWeightPct(instr.ticker, v);
                            }}
                            style={{
                              width: 44, fontSize: 10, textAlign: 'right',
                              background: 'var(--bg-primary)', border: '1px solid var(--border)',
                              color: wPct > 0 ? ASSET_CLASS_COLORS[cls] : 'var(--text-muted)',
                              borderRadius: 2, padding: '2px 4px',
                              fontFamily: 'var(--font-mono)', outline: 'none',
                            }}
                          />
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Right: metrics */}
            <div>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: '1.5px', marginBottom: 12 }}>PORTFOLIO METRICS</div>

              {portfolioMetrics ? (
                <>
                  {/* Summary cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'Weighted Corr', value: fmt2(portfolioMetrics.weightedCorr), color: portfolioMetrics.weightedCorr > 0.5 ? '#FF3B30' : portfolioMetrics.weightedCorr > 0.2 ? '#FFB830' : '#00D084' },
                      { label: 'Effective N', value: portfolioMetrics.effectiveN.toFixed(1), color: '#888' },
                      { label: 'Portfolio VaR', value: `$${portfolioMetrics.portfolioVaR.toFixed(0)}`, color: '#FF3B30' },
                      { label: 'Corr VaR Contrib', value: `$${portfolioMetrics.correlationVaRContribution.toFixed(0)}`, color: '#FFB830' },
                    ].map(m => (
                      <div key={m.label} style={{ background: '#0A0C10', border: '1px solid #1E2330', borderRadius: 3, padding: '8px 10px' }}>
                        <div style={{ fontSize: 8, color: '#555', letterSpacing: '1px', marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Marginal diversification */}
                  <div style={{ fontSize: 9, color: '#555', letterSpacing: '1.5px', marginBottom: 8 }}>MARGINAL DIVERSIFICATION</div>
                  <div style={{ background: '#0A0C10', border: '1px solid #1E2330', borderRadius: 3, overflow: 'hidden' }}>
                    {portfolioMetrics.marginalDiversification
                      .filter(m => (portfolioWeights[m.ticker] ?? 0) > 0)
                      .sort((a, b) => Math.abs(b.md) - Math.abs(a.md))
                      .slice(0, 8)
                      .map((m, i) => (
                        <div key={m.ticker} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '5px 10px',
                          background: i % 2 === 0 ? 'transparent' : 'rgba(30,35,48,0.4)',
                          borderBottom: '1px solid rgba(30,35,48,0.5)',
                        }}>
                          <span style={{ fontSize: 10, color: '#888', minWidth: 60 }}>{m.ticker}</span>
                          <div style={{ flex: 1, height: 3, background: '#1E2330', borderRadius: 2 }}>
                            <div style={{
                              height: '100%', borderRadius: 2,
                              width: `${Math.min(100, Math.abs(m.md) * 500)}%`,
                              background: m.md > 0 ? '#FF3B30' : '#00D084',
                            }} />
                          </div>
                          <span style={{ fontSize: 10, color: m.md > 0 ? '#FF3B30' : '#00D084', minWidth: 48, textAlign: 'right' }}>
                            {m.md.toFixed(4)}
                          </span>
                        </div>
                      ))}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 9, color: '#333', lineHeight: 1.5 }}>
                    VaR estimates assume $10,000 portfolio, unit volatilities, 99% confidence.
                  </div>

                  {/* Interpretation button */}
                  <button
                    className="anomaly-toggle"
                    style={{ marginTop: 12, width: '100%' }}
                    onClick={() => setShowInterpret(!showInterpret)}
                  >
                    ◎ {showInterpret ? 'HIDE' : 'SHOW'} INTERPRETATION
                  </button>

                  {showInterpret && portfolioMetrics && (
                    <div style={{ marginTop: 10, padding: 10, background: '#0A0C10', border: '1px solid var(--border)', borderRadius: 3, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1.5px', marginBottom: 8 }}>PORTFOLIO INTERPRETATION</div>
                      <p>
                        <strong style={{ color: 'var(--text-primary)' }}>Weighted Correlation:</strong>{' '}
                        {portfolioMetrics.weightedCorr > 0.5
                          ? `At ${fmt2(portfolioMetrics.weightedCorr)}, your portfolio has high internal correlation — positions are moving together, reducing diversification benefit.`
                          : portfolioMetrics.weightedCorr > 0.2
                          ? `At ${fmt2(portfolioMetrics.weightedCorr)}, moderate correlation — some diversification is present but concentrated exposures remain.`
                          : `At ${fmt2(portfolioMetrics.weightedCorr)}, low weighted correlation — the portfolio is well-diversified across uncorrelated positions.`}
                      </p>
                      <p style={{ marginTop: 6 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Effective N:</strong>{' '}
                        {`${portfolioMetrics.effectiveN.toFixed(1)} out of ${Object.values(portfolioWeights).filter(w => w > 0).length} active instruments — `}
                        {portfolioMetrics.effectiveN < 3 ? 'low effective diversification, essentially a concentrated bet.' : 'reasonable independent risk sources.'}
                      </p>
                      <p style={{ marginTop: 6 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>VaR:</strong>{' '}
                        Portfolio VaR is ${portfolioMetrics.portfolioVaR.toFixed(0)}, of which ${portfolioMetrics.correlationVaRContribution.toFixed(0)} is attributable to correlation.
                        {portfolioMetrics.correlationVaRContribution / portfolioMetrics.portfolioVaR > 0.3
                          ? ' Correlation contributes significantly — hedging opportunities may exist.'
                          : ' Correlation contribution is moderate.'}
                      </p>
                      {portfolioMetrics.marginalDiversification.filter(m => (portfolioWeights[m.ticker] ?? 0) > 0 && m.md > 0.01).length > 0 && (
                        <p style={{ marginTop: 6 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>Action:</strong>{' '}
                          Consider reducing {portfolioMetrics.marginalDiversification.filter(m => (portfolioWeights[m.ticker] ?? 0) > 0 && m.md > 0.01).slice(0, 2).map(m => m.ticker).join(', ')} — they add the most marginal correlation risk.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: '#555', fontSize: 10, padding: '20px 0' }}>
                  Set instrument weights to compute portfolio metrics.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
