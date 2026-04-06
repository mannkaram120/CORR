import { useEffect } from 'react';
import '../nexus.css';
import { TopBar } from './layout/TopBar';
import { ControlsRibbon } from './layout/ControlsRibbon';
import { SettingsPanel } from './layout/SettingsPanel';
import { IntelligencePanel } from './layout/IntelligencePanel';
import { FlashAlertStack } from './layout/FlashAlertStack';
import { ScenarioBar } from './layout/ScenarioBar';
import { HeatmapD3 } from './heatmap/HeatmapD3';
import { PairSidebar } from './sidebar/PairSidebar';
import { PortfolioPanel } from './PortfolioPanel';
import { AboutModal } from './AboutModal';
import { InterpretationPanel } from './InterpretationPanel';
import { useNexusStore } from '../store/nexusStore';
import { exportPNG, exportCSV, exportPDF } from '../utils/exportUtils';

export default function NexusApp() {
  const refreshInterval  = useNexusStore(s => s.refreshInterval);
  const refreshData      = useNexusStore(s => s.refreshData);
  const matrix           = useNexusStore(s => s.matrix);
  const betaMatrix       = useNexusStore(s => s.betaMatrix);
  const viewMode         = useNexusStore(s => s.viewMode);
  const selectedPair     = useNexusStore(s => s.selectedPair);
  const activeScenario   = useNexusStore(s => s.activeScenario);
  const portfolioMode    = useNexusStore(s => s.portfolioMode);
  const portfolioWeights = useNexusStore(s => s.portfolioWeights);
  const portfolioMetrics = useNexusStore(s => s.portfolioMetrics);
  const baselineMatrix   = useNexusStore(s => s.baselineMatrix);
  const pcaResult        = useNexusStore(s => s.pcaResult);
  const selectPair       = useNexusStore(s => s.selectPair);
  const dataReady        = useNexusStore(s => s.dataReady);
  const isLoading        = useNexusStore(s => s.isLoading);
  const liveDataStatus   = useNexusStore(s => s.liveDataStatus);
  const initLiveData     = useNexusStore(s => s.initLiveData);
  const setSettingsOpen  = useNexusStore(s => s.setSettingsOpen);

  useEffect(() => {
    if (refreshInterval === 'Manual') return;
    if (activeScenario !== 'LIVE') return;
    const ms = (refreshInterval as number) * 1000;
    const id = setInterval(refreshData, ms);
    return () => clearInterval(id);
  }, [refreshInterval, refreshData, activeScenario]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'r' || e.key === 'R') refreshData();
      if (e.key === 'Escape') { selectPair(null, null); setSettingsOpen(false); }
      if (e.ctrlKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        const svg = document.querySelector<SVGSVGElement>('.heatmap-svg');
        if (svg && matrix) {
          exportPDF({ svgEl: svg, corrMatrix: matrix, baselineMatrix, pcaResult, activeScenario, portfolio: { enabled: portfolioMode, metrics: portfolioMetrics } });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [refreshData, selectPair, setSettingsOpen, matrix, baselineMatrix, pcaResult, activeScenario, portfolioMode, portfolioMetrics]);

  // ── Fetch live data once on mount — guarded to prevent multiple calls ──────
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) initLiveData();
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPNG = async () => {
    const svg = document.querySelector<SVGSVGElement>('.heatmap-svg');
    if (svg && matrix) await exportPNG(svg, { viewMode, corrMatrix: matrix, betaMatrix });
  };

  const handleExportCSV = () => {
    if (matrix) exportCSV({ viewMode, corrMatrix: matrix, betaMatrix, portfolio: { enabled: portfolioMode, weights: portfolioWeights, metrics: portfolioMetrics } });
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!dataReady) {
    const liveCount    = Object.values(liveDataStatus).filter(s => s === 'live').length;
    const totalTickers = Object.keys(liveDataStatus).length;
    const pct = totalTickers > 0 ? Math.round((liveCount / totalTickers) * 100) : 0;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: '#0A0C10',
        color: '#E8E3D5', fontFamily: "'JetBrains Mono', monospace", gap: 20,
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>CORR</div>
        <div style={{ fontSize: 11, color: '#555', letterSpacing: 2 }}>
          {isLoading ? 'FETCHING LIVE MARKET DATA...' : 'INITIALISING...'}
        </div>
        {totalTickers > 0 && (
          <>
            <div style={{
              width: 260, height: 3, background: '#1E2330', borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2, background: '#4A9EFF',
                width: `${pct}%`, transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#555' }}>
              {liveCount} / {totalTickers} instruments loaded
            </div>
          </>
        )}
        <div style={{ fontSize: 9, color: '#333', marginTop: 8 }}>
          Live: Twelve Data + FRED &nbsp;·&nbsp; Fallback: Simulator
        </div>
      </div>
    );
  }

  return (
    <div className={`nexus-shell${selectedPair ? ' nexus-shell--split' : ''}`}>
      <TopBar />
      <ScenarioBar />
      <ControlsRibbon />
      <main className="nexus-main">
        <div className="nexus-canvas">
          <div className="canvas-header">
            <span className="canvas-title">
              {matrix ? `${matrix.tickers.length} × ${matrix.tickers.length} Correlation Matrix` : 'Loading…'}
            </span>
            <div className="canvas-actions">
              <button className="action-btn" onClick={handleExportCSV} title="Export CSV">↓ CSV</button>
              <button className="action-btn" onClick={handleExportPNG} title="Export PNG">↓ PNG</button>
            </div>
          </div>
          <div className="heatmap-outer">
            <HeatmapD3 />
          </div>
        </div>
        {selectedPair && <PairSidebar />}
      </main>
      <IntelligencePanel />
      <footer className="nexus-footer">
        <span>CORR v1.0 · karamfrm.com · Live Data via Twelve Data + FRED</span>
        <span>Press <kbd>R</kbd> to refresh · Click cell to deep-dive · <kbd>Esc</kbd> to close</span>
      </footer>
      <FlashAlertStack />
      <SettingsPanel />
      <PortfolioPanel />
      <AboutModal />
      <InterpretationPanel />
    </div>
  );
}
