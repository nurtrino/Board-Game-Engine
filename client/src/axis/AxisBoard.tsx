// Axis & Allies — TV board. PLACEHOLDER shell: renders the turn/phase strip
// while the fullscreen 3D map (stitched board halves + unit meshes +
// FocusFly zooms + battle view + production screen) is built out.

import type { AxisView } from '@bge/shared';
import { POWERS, WIN_CONDITIONS } from '@bge/shared';

export default function AxisBoard({ view }: { view: AxisView }) {
  const active = POWERS[view.active];
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0e12', color: '#e8e4da', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }}>
          Axis & Allies Anniversary — {view.options.scenario} — {WIN_CONDITIONS[view.options.winCondition].label}
        </div>
        <div style={{ fontSize: 42, marginTop: 12, color: active.color }}>{active.name}</div>
        <div style={{ fontSize: 20, marginTop: 6, textTransform: 'uppercase', letterSpacing: 3 }}>{view.phase}</div>
        <div style={{ fontSize: 14, marginTop: 18, opacity: 0.7 }}>
          VC — Axis {view.vc.axis} / Allies {view.vc.allies} (goal {view.vc.goal})
        </div>
        <div style={{ fontSize: 13, marginTop: 20, opacity: 0.5 }}>Board rendering under construction.</div>
      </div>
    </div>
  );
}
