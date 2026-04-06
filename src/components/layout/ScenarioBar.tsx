import { useNexusStore } from '../../store/nexusStore';
import { scenarioLabel } from '../../data/scenarios';

export function ScenarioBar() {
  const activeScenario = useNexusStore(s => s.activeScenario);
  const setScenario    = useNexusStore(s => s.setScenario);

  if (!activeScenario || activeScenario === 'LIVE') return null;

  return (
    <div className="scenario-bar" role="status" aria-label="Scenario mode status">
      <span className="scenario-bar__text">
        ⚠ {scenarioLabel(activeScenario)} SCENARIO MODE — Live data paused.
      </span>
      <button className="scenario-bar__btn" onClick={() => setScenario('LIVE')}>
        Return to LIVE
      </button>
    </div>
  );
}

