import { useState, useRef, useEffect } from 'react';
import { useNexusStore } from '../../store/nexusStore';
import { SCENARIOS } from '../../data/scenarios';
import type { LookbackWindow, CorrelationMethod, RefreshInterval, MatrixViewMode, ScenarioId } from '../../types';

const LOOKBACKS:  LookbackWindow[]    = ['1D', '1W', '1M', '3M', '1Y'];
const METHODS:    CorrelationMethod[] = ['Pearson', 'Spearman', 'Kendall'];
const INTERVALS:  Array<RefreshInterval | string> = [900, 1800, 3600, 'Manual'];
const VIEW_MODES: Array<{ key: MatrixViewMode; label: string }> = [
  { key: 'corr', label: 'CORR' },
  { key: 'beta', label: 'BETA' },
];

export function ControlsRibbon() {
  const lookback        = useNexusStore(s => s.lookback);
  const method          = useNexusStore(s => s.method);
  const activeScenario  = useNexusStore(s => s.activeScenario);
  const viewMode        = useNexusStore(s => s.viewMode);
  const refreshInterval = useNexusStore(s => s.refreshInterval);
  const clusterMode     = useNexusStore(s => s.clusterMode);
  const threshold       = useNexusStore(s => s.threshold);
  const anomalyMode     = useNexusStore(s => s.anomalyMode);
  const causalityMode   = useNexusStore(s => s.causalityMode);
  const causalityStatus = useNexusStore(s => s.causalityStatus);
  const causalityError  = useNexusStore(s => s.causalityError);
  const setPortfolioOpen = useNexusStore(s => s.setPortfolioOpen);
  const interpretOpen    = useNexusStore(s => s.interpretOpen);
  const setInterpretOpen = useNexusStore(s => s.setInterpretOpen);

  const setLookback        = useNexusStore(s => s.setLookback);
  const setMethod          = useNexusStore(s => s.setMethod);
  const setScenario        = useNexusStore(s => s.setScenario);
  const setViewMode        = useNexusStore(s => s.setViewMode);
  const setRefreshInterval = useNexusStore(s => s.setRefreshInterval);
  const setClusterMode     = useNexusStore(s => s.setClusterMode);
  const setThreshold       = useNexusStore(s => s.setThreshold);
  const toggleAnomalyMode  = useNexusStore(s => s.toggleAnomalyMode);
  const toggleCausalityMode = useNexusStore(s => s.toggleCausalityMode);
  const refreshData        = useNexusStore(s => s.refreshData);

  return (
    <div className="controls-ribbon">

      {/* Lookback */}
      <div className="control-group">
        <span className="control-label">LOOKBACK</span>
        <select
          className="ribbon-select"
          value={lookback}
          onChange={e => setLookback(e.target.value as LookbackWindow)}
        >
          {LOOKBACKS.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="controls-ribbon__divider" />

      {/* Method */}
      <div className="control-group">
        <span className="control-label">METHOD</span>
        <select
          className="ribbon-select"
          value={method}
          onChange={e => setMethod(e.target.value as CorrelationMethod)}
        >
          {METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="controls-ribbon__divider" />

      {/* Scenario */}
      <div className="control-group">
        <span className="control-label">SCENARIO</span>
        <select
          className="ribbon-select"
          value={activeScenario}
          onChange={e => setScenario(e.target.value as ScenarioId)}
          title="Stress correlation scenarios (LIVE pauses refresh)"
        >
          <option value="LIVE">LIVE</option>
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="controls-ribbon__divider" />

      {/* View mode */}
      <div className="control-group">
        <span className="control-label">VIEW</span>
        <select
          className="ribbon-select"
          value={viewMode}
          onChange={e => setViewMode(e.target.value as MatrixViewMode)}
        >
          {VIEW_MODES.map(v => (
            <option key={v.key} value={v.key}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="controls-ribbon__divider" />

      {/* Refresh */}
      <div className="control-group">
        <span className="control-label">REFRESH</span>
        <select
          className="ribbon-select"
          value={String(refreshInterval)}
          onChange={e => {
            const val = e.target.value === 'Manual' ? 'Manual' : Number(e.target.value);
            setRefreshInterval(val as RefreshInterval);
            if (val !== 'Manual') refreshData();
          }}
        >
          {INTERVALS.map(iv => (
            <option key={String(iv)} value={String(iv)}>
              {iv === 'Manual' ? 'Manual' : (
                iv >= 60
                  ? `${Math.round((iv as number) / 60)}m`
                  : `${iv}s`
              )}
            </option>
          ))}
        </select>
        {refreshInterval === 'Manual' && (
          <button className="pill pill--refresh" onClick={refreshData}>↻</button>
        )}
      </div>

      <div className="controls-ribbon__divider" />

      {/* More dropdown — Cluster, Anomaly, Causality */}
      <MoreDropdown
        clusterMode={clusterMode}
        setClusterMode={setClusterMode}
        anomalyMode={anomalyMode}
        toggleAnomalyMode={toggleAnomalyMode}
        causalityMode={causalityMode}
        toggleCausalityMode={toggleCausalityMode}
        causalityStatus={causalityStatus}
        causalityError={causalityError}
      />

      <div className="controls-ribbon__divider" />

      {/* Portfolio */}
      <div className="control-group">
        <span className="control-label">PORTFOLIO</span>
        <button
          className="anomaly-toggle"
          onClick={() => setPortfolioOpen(true)}
          title="Open portfolio analyzer"
        >
          ◼ OPEN
        </button>
      </div>

      <div className="controls-ribbon__divider" />

      {/* Threshold + Interpret (compact group) */}
      <div className="control-group control-group--threshold">
        <span className="control-label">MIN |r|</span>
        <input
          type="range"
          className="threshold-slider"
          min={0} max={0.9} step={0.05}
          value={threshold}
          onChange={e => setThreshold(parseFloat(e.target.value))}
        />
        <input
          type="number"
          className="threshold-input"
          min={0} max={0.9} step={0.05}
          value={threshold.toFixed(2)}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0 && v <= 0.9) setThreshold(v);
          }}
        />
        <button
          className={`anomaly-toggle ${interpretOpen ? 'anomaly-toggle--on' : ''}`}
          onClick={() => setInterpretOpen(!interpretOpen)}
          title="Interpret matrix, anomalies, causality & clusters"
          style={{ marginLeft: 4 }}
        >
          ◎ INTERPRET
        </button>
      </div>

    </div>
  );
}

/* ── More dropdown (Cluster / Anomaly / Causality) ──────── */
function MoreDropdown({
  clusterMode, setClusterMode,
  anomalyMode, toggleAnomalyMode,
  causalityMode, toggleCausalityMode,
  causalityStatus, causalityError,
}: {
  clusterMode: boolean; setClusterMode: (v: boolean) => void;
  anomalyMode: boolean; toggleAnomalyMode: () => void;
  causalityMode: boolean; toggleCausalityMode: () => void;
  causalityStatus: string; causalityError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  };

  const activeCount = [clusterMode, anomalyMode, causalityMode].filter(Boolean).length;

  return (
    <div className="control-group more-dropdown" ref={ref}>
      <button
        ref={btnRef}
        className={`anomaly-toggle ${open ? 'anomaly-toggle--on' : ''}`}
        onClick={handleToggle}
      >
        ⚙ MORE{activeCount > 0 && <span className="more-badge">{activeCount}</span>}
      </button>
      {open && (
        <div className="more-dropdown__menu" style={{ top: menuPos.top, left: menuPos.left }}>
          <button className="more-dropdown__item" onClick={() => setClusterMode(!clusterMode)}>
            <span className={`more-dropdown__dot ${clusterMode ? 'more-dropdown__dot--on' : ''}`} />
            CLUSTER
          </button>
          <button className="more-dropdown__item" onClick={toggleAnomalyMode}>
            <span className={`more-dropdown__dot ${anomalyMode ? 'more-dropdown__dot--on' : ''}`} />
            ANOMALY
          </button>
          <button className="more-dropdown__item" onClick={toggleCausalityMode}>
            <span className={`more-dropdown__dot ${causalityMode ? 'more-dropdown__dot--on' : ''}`} />
            CAUSALITY
            {causalityMode && causalityStatus === 'computing' && (
              <span className="more-dropdown__status">…</span>
            )}
            {causalityMode && causalityStatus === 'error' && (
              <span className="more-dropdown__status more-dropdown__status--err" title={causalityError || ''}>!</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
