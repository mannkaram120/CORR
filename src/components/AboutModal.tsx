import { useNexusStore } from '../store/nexusStore';

export function AboutModal() {
  const aboutOpen = useNexusStore(s => s.aboutOpen);
  const setAboutOpen = useNexusStore(s => s.setAboutOpen);

  if (!aboutOpen) return null;

  const features = [
    { icon: '◉', title: 'Correlation Matrix', desc: 'Real-time cross-asset correlation heatmap with Pearson, Spearman & Kendall methods.' },
    { icon: '◈', title: 'Beta Analysis', desc: 'Switch to beta view to see directional sensitivity between instruments.' },
    { icon: '⚡', title: 'Anomaly Detection', desc: 'Highlight statistically significant correlation breaks vs 1Y baseline.' },
    { icon: '⇌', title: 'Granger Causality', desc: 'Discover lead-lag relationships between instruments via Granger tests.' },
    { icon: '▦', title: 'Hierarchical Clustering', desc: 'Group correlated instruments together using agglomerative clustering.' },
    { icon: '◰', title: 'Portfolio Analyzer', desc: 'Compute weighted correlation, VaR, and marginal diversification metrics.' },
    { icon: '◎', title: 'PCA / Absorption Ratio', desc: 'Eigenvalue decomposition, PC1 loadings, and systemic risk monitoring.' },
    { icon: '⇥', title: 'Stress Scenarios', desc: 'Apply historical stress overlays (2008, COVID, rate shocks) to the live matrix.' },
    { icon: '↓', title: 'Export', desc: 'Download as PNG, CSV, or full PDF report with analytics.' },
  ];

  return (
    <div className="about-overlay" onClick={e => { if (e.target === e.currentTarget) setAboutOpen(false); }}>
      <div className="about-panel">
        <div className="about-panel__header">
          <span className="about-panel__logo">KARAM.</span>
          <span className="about-panel__subtitle">Cross-Asset Correlation Terminal</span>
          <button className="about-panel__close" onClick={() => setAboutOpen(false)}>✕</button>
        </div>

        <div className="about-panel__body">
          <p className="about-panel__intro">
            A professional-grade terminal for monitoring real-time cross-asset correlations, detecting anomalies, and analyzing portfolio risk across FX, Indices, Rates, and Commodities.
          </p>

          <div className="about-panel__grid">
            {features.map(f => (
              <div key={f.title} className="about-feature">
                <span className="about-feature__icon">{f.icon}</span>
                <div>
                  <div className="about-feature__title">{f.title}</div>
                  <div className="about-feature__desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="about-panel__shortcuts">
            <span className="about-panel__shortcuts-title">KEYBOARD SHORTCUTS</span>
            <div className="about-panel__shortcut-grid">
              <div><kbd>R</kbd> Refresh data</div>
              <div><kbd>Esc</kbd> Close panels</div>
              <div><kbd>Ctrl+Shift+P</kbd> Export PDF</div>
              <div>Click cell → Deep-dive</div>
            </div>
          </div>
        </div>

        <div className="about-panel__footer">
          <span>KARAM v1.0 · karamfrm.com · Simulated Data</span>
        </div>
      </div>
    </div>
  );
}
