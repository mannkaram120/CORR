import { useEffect, useState } from 'react';
import { useNexusStore } from '../../store/nexusStore';
import type { FlashAlert } from '../../store/nexusStore';

function timeAgo(ts: Date): string {
  const secs = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function AlertItem({ alert, onDismiss }: { alert: FlashAlert; onDismiss: () => void }) {
  const [age, setAge] = useState(() => timeAgo(alert.ts));

  useEffect(() => {
    const id = setInterval(() => setAge(timeAgo(alert.ts)), 1000);
    return () => clearInterval(id);
  }, [alert.ts]);

  const sign = alert.delta >= 0;
  return (
    <div className="flash-alert">
      <span className="flash-alert__icon">⚡</span>
      <div className="flash-alert__body">
        <span className="flash-alert__pair">{alert.row} / {alert.col}</span>
        <span
          className="flash-alert__delta"
          style={{ color: sign ? '#5a8a00' : '#cc2200' }}
        >
          r {sign ? 'jumped' : 'dropped'} {sign ? '+' : ''}{alert.delta.toFixed(2)}
        </span>
      </div>
      <div className="flash-alert__right">
        <span className="flash-alert__time">{age}</span>
        <button
          className="flash-alert__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss alert"
        >✕</button>
      </div>
    </div>
  );
}

export function FlashAlertStack() {
  const flashAlerts  = useNexusStore(s => s.flashAlerts);
  const dismissAlert = useNexusStore(s => s.dismissAlert);

  // Auto-dismiss alerts older than 30 seconds
  useEffect(() => {
    if (flashAlerts.length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      flashAlerts.forEach(a => {
        if (now - a.ts.getTime() > 30_000) dismissAlert(a.key);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [flashAlerts, dismissAlert]);

  if (flashAlerts.length === 0) return null;

  return (
    <div className="flash-alert-stack" role="log" aria-label="Correlation change alerts">
      {flashAlerts.map(a => (
        <AlertItem
          key={a.key}
          alert={a}
          onDismiss={() => dismissAlert(a.key)}
        />
      ))}
    </div>
  );
}
