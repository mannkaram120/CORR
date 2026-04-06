import { useNexusStore } from '../../store/nexusStore';
import { INSTRUMENTS }   from '../../data/instruments';
import type { AssetClass } from '../../types';

const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  FX:          '#4A9EFF',
  Indices:     '#00D084',
  Rates:       '#FFB830',
  Commodities: '#FF6B35',
};

const ASSET_CLASSES: AssetClass[] = ['FX', 'Indices', 'Rates', 'Commodities'];

export function SettingsPanel() {
  const settingsOpen       = useNexusStore(s => s.settingsOpen);
  const activeInstruments  = useNexusStore(s => s.activeInstruments);
  const setSettingsOpen    = useNexusStore(s => s.setSettingsOpen);
  const toggleInstrument   = useNexusStore(s => s.toggleInstrument);

  if (!settingsOpen) return null;

  const activeCount = activeInstruments.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="settings-backdrop"
        onClick={() => setSettingsOpen(false)}
        aria-hidden="true"
      />

      <aside className="settings-panel" role="dialog" aria-label="Settings — Instrument selection">
        <div className="settings-panel__header">
          <span className="settings-panel__title">INSTRUMENTS</span>
          <span className="settings-panel__count">{activeCount} / {INSTRUMENTS.length} active</span>
          <button
            className="settings-panel__close"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
          >✕</button>
        </div>

        <div className="settings-panel__body">
          {ASSET_CLASSES.map(cls => {
            const group = INSTRUMENTS.filter(i => i.assetClass === cls);
            const color = ASSET_CLASS_COLORS[cls];
            const allOn  = group.every(i => activeInstruments.includes(i.ticker));
            const someOn = group.some(i => activeInstruments.includes(i.ticker));

            return (
              <div key={cls} className="instr-group">
                <div className="instr-group__header">
                  <span className="instr-group__name" style={{ color }}>{cls}</span>
                  <button
                    className="instr-group__toggle-all"
                    style={{ color }}
                    onClick={() => {
                      if (allOn) {
                        // Turn off all in this class (keep at least 2 total)
                        group.forEach(i => {
                          if (activeInstruments.filter(t => t !== i.ticker).length >= 2)
                            toggleInstrument(i.ticker);
                        });
                      } else {
                        // Turn on all in this class
                        group.filter(i => !activeInstruments.includes(i.ticker))
                             .forEach(i => toggleInstrument(i.ticker));
                      }
                    }}
                  >
                    {allOn ? 'Deselect all' : someOn ? 'Select all' : 'Select all'}
                  </button>
                </div>

                <div className="instr-group__list">
                  {group.map(instr => {
                    const isOn = activeInstruments.includes(instr.ticker);
                    return (
                      <label
                        key={instr.ticker}
                        className={`instr-item ${isOn ? 'instr-item--on' : ''}`}
                        style={{ '--instr-color': color } as React.CSSProperties}
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleInstrument(instr.ticker)}
                          aria-label={`${isOn ? 'Deactivate' : 'Activate'} ${instr.name}`}
                        />
                        <span className="instr-item__ticker">{instr.ticker}</span>
                        <span className="instr-item__name">{instr.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="settings-panel__footer">
          <button
            className="settings-reset-btn"
            onClick={() => {
              // Re-enable all instruments
              INSTRUMENTS.filter(i => !activeInstruments.includes(i.ticker))
                         .forEach(i => toggleInstrument(i.ticker));
            }}
          >
            Reset to all {INSTRUMENTS.length}
          </button>
        </div>
      </aside>
    </>
  );
}
