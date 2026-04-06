import { useEffect, useState } from 'react';
import { useNexusStore } from '../../store/nexusStore';
import type { AssetClass } from '../../types';
import { exportPDF } from '../../utils/exportUtils';

const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  FX:          '#4A9EFF',
  Indices:     '#00D084',
  Rates:       '#FFB830',
  Commodities: '#FF6B35',
};

/** Live counter: seconds elapsed since lastRefreshed, ticks every second */
function useElapsedSeconds(lastRefreshed: Date | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => {
      if (!lastRefreshed) { setElapsed(0); return; }
      setElapsed(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRefreshed]);
  return elapsed;
}

function DataSourceBadge() {
  const liveDataStatus = useNexusStore(s => s.liveDataStatus);
  const statuses = Object.values(liveDataStatus);
  if (statuses.length === 0) return <span className="sim-badge">SIM</span>;
  const liveCount = statuses.filter(s => s === 'live').length;
  const allLive = liveCount === statuses.length;
  const noneLive = liveCount === 0;
  const label = allLive ? 'LIVE DATA' : noneLive ? 'SIM' : `${liveCount}/${statuses.length} LIVE`;
  const color = allLive ? '#00D084' : noneLive ? '#555' : '#FFB830';
  const title = allLive
    ? 'All instruments using real market data (Finnhub + FRED)'
    : noneLive
    ? 'All instruments using simulated data — add VITE_FINNHUB_KEY to .env.local'
    : `${liveCount} of ${statuses.length} instruments using live data`;
  return (
    <span className="sim-badge" style={{ borderColor: color, color }} title={title}>
      {label}
    </span>
  );
}

export function TopBar() {
  const activeAssetClasses = useNexusStore(s => s.activeAssetClasses);
  const toggleAssetClass   = useNexusStore(s => s.toggleAssetClass);
  const lastRefreshed      = useNexusStore(s => s.lastRefreshed);
  const isLoading          = useNexusStore(s => s.isLoading);
  const refreshInterval    = useNexusStore(s => s.refreshInterval);
  const setSettingsOpen    = useNexusStore(s => s.setSettingsOpen);
  const settingsOpen       = useNexusStore(s => s.settingsOpen);
  const matrix             = useNexusStore(s => s.matrix);
  const baselineMatrix     = useNexusStore(s => s.baselineMatrix);
  const pcaResult          = useNexusStore(s => s.pcaResult);
  const activeScenario     = useNexusStore(s => s.activeScenario);
  const portfolioMode      = useNexusStore(s => s.portfolioMode);
  const portfolioMetrics   = useNexusStore(s => s.portfolioMetrics);
  const setAboutOpen       = useNexusStore(s => s.setAboutOpen);

  const classes: AssetClass[] = ['FX', 'Indices', 'Rates', 'Commodities'];
  const elapsed = useElapsedSeconds(lastRefreshed);

  // Mark stale if data is older than 1.5× the configured refresh interval
  const staleThreshold = refreshInterval === 'Manual' ? Infinity : (refreshInterval as number) * 1.5;
  const isStale = elapsed > staleThreshold;

  const timeStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  const ageLabel = elapsed < 5   ? 'just now'
                 : elapsed < 60  ? `${elapsed}s ago`
                 : `${Math.floor(elapsed / 60)}m ago`;

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__logo">KARAM.</span>
        <span className="top-bar__tagline">Cross-Asset Correlation Terminal</span>
      </div>

      <nav className="top-bar__filters" aria-label="Asset class filters">
        {classes.map(cls => (
          <button
            key={cls}
            className={`asset-toggle ${activeAssetClasses.includes(cls) ? 'asset-toggle--active' : ''}`}
            style={{ '--ac': ASSET_CLASS_COLORS[cls] } as React.CSSProperties}
            onClick={() => toggleAssetClass(cls)}
            aria-pressed={activeAssetClasses.includes(cls)}
            aria-label={`${activeAssetClasses.includes(cls) ? 'Hide' : 'Show'} ${cls}`}
          >
            {cls}
          </button>
        ))}
      </nav>

      <div className="top-bar__right">
        {/* Live/Stale status + staleness age */}
        <div
          className={`staleness-badge ${isStale ? 'staleness-badge--stale' : ''}`}
          title={`Data refreshed at ${timeStr}`}
          aria-label={`Data freshness: ${ageLabel}`}
        >
          <span
            className={`status-dot ${
              isLoading ? 'status-dot--loading'
              : isStale  ? 'status-dot--stale'
              : 'status-dot--live'
            }`}
          />
          <span className="status-label">
            {isLoading ? 'UPDATING' : isStale ? 'STALE' : 'LIVE'}
          </span>
          <span className="status-time">{timeStr}</span>
          {!isLoading && (
            <span className={`staleness-age ${isStale ? 'staleness-age--stale' : ''}`}>
              {ageLabel}
            </span>
          )}
        </div>

        {/* Live/Sim data badge */}
        <DataSourceBadge />

        {/* About */}
        <button
          className="topbar-icon-btn"
          onClick={() => setAboutOpen(true)}
          aria-label="About this terminal"
          title="About KARAM"
        >
          ?
        </button>

        {/* PDF export */}
        <button
          className="topbar-icon-btn"
          onClick={async () => {
            const svg = document.querySelector<SVGSVGElement>('.heatmap-svg');
            if (!svg || !matrix) return;
            await exportPDF({
              svgEl: svg,
              corrMatrix: matrix,
              baselineMatrix,
              pcaResult,
              activeScenario,
              portfolio: { enabled: portfolioMode, metrics: portfolioMetrics },
            });
          }}
          aria-label="Export PDF report"
          title="Export PDF report (Ctrl+Shift+P)"
        >
          PDF
        </button>

        {/* Settings gear — opens SettingsPanel */}
        <button
          className={`topbar-icon-btn ${settingsOpen ? 'topbar-icon-btn--active' : ''}`}
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-label="Open instrument settings"
          title="Instrument settings (FR-09)"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
