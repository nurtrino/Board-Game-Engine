// Axis & Allies — player device. PLACEHOLDER shell: shows the seat's power,
// IPCs and phase with an end-phase control while the full board-first UI
// (assets lineup, reference card, interactive map, turn portal) is built out.

import type { AxisView, AxisAction } from '@bge/shared';
import { POWERS, UNITS, type UnitKey } from '@bge/shared';

export default function AxisPlay({ view, act, error }: {
  view: AxisView;
  act: (a: AxisAction) => void;
  error: string | null;
}) {
  const power = POWERS[view.active];
  const p = view.powers[view.active];
  const staged = Object.entries(p.staging) as [UnitKey, number][];
  return (
    <div style={{ minHeight: '100vh', background: '#0b0e12', color: '#e8e4da', padding: 20, fontFamily: 'inherit' }}>
      <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }}>Axis & Allies — {view.options.scenario}</div>
      <h2 style={{ color: power.color, margin: '8px 0 2px' }}>{power.name}</h2>
      <div style={{ opacity: 0.8 }}>{p.ipcs} IPCs — production {p.production}</div>
      <div style={{ marginTop: 8, textTransform: 'uppercase', letterSpacing: 2, fontSize: 13 }}>{view.phase}</div>
      {staged.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          Staged: {staged.map(([k, n]) => `${n} ${UNITS[k].name}`).join(', ')}
        </div>
      )}
      {error && <div style={{ marginTop: 10, color: '#e05555' }}>{error}</div>}
      <button
        onClick={() => act({ type: 'endPhase' })}
        style={{ marginTop: 18, padding: '10px 22px', background: '#1c2330', color: '#e8e4da', border: '1px solid #2c3644', borderRadius: 6 }}
      >
        End phase
      </button>
      <div style={{ fontSize: 12, marginTop: 24, opacity: 0.5 }}>Full turn portal under construction.</div>
    </div>
  );
}
