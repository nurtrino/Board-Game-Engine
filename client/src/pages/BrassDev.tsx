// Dev proof page: the full TTS table (every group) + the extracted zone
// overlay from the golden board-layout.json. Route: /dev/brass

import { useState } from 'react';
import * as THREE from 'three';
import { TableScene, useBrassScene, pos3, rot3, type Zone } from '../brass/TableScene';

const ZONE_STYLE: Record<string, { color: string; label: string }> = {
  locationSquare: { color: '#ffd54a', label: 'location square' },
  linkZone: { color: '#4fc3f7', label: 'link zone' },
  coalMarket: { color: '#ff5252', label: 'coal market slot' },
  ironMarket: { color: '#ff9800', label: 'iron market slot' },
  track: { color: '#69f0ae', label: 'score track space' },
  merchantZone: { color: '#e040fb', label: 'merchant slot' },
  merchantBeer: { color: '#ffffff', label: 'merchant beer slot' },
  deckZone: { color: '#b39ddb', label: 'deck zone' },
  turnZone: { color: '#80cbc4', label: 'turn order slot' },
  incomeMarker: { color: '#f06292', label: 'income marker' },
  scoreMarker: { color: '#ba68c8', label: 'score marker' },
  turnToken: { color: '#a1887f', label: 'turn token' },
  walletBowl: { color: '#90a4ae', label: 'wallet bowl' },
  spentBowl: { color: '#78909c', label: 'spent bowl' },
  resourceBag: { color: '#8d6e63', label: 'resource bag' },
};

function ZoneMarker({ zone }: { zone: Zone }) {
  const style = ZONE_STYLE[zone.kind] ?? { color: '#ffffff', label: zone.kind };
  const isMarker = ['incomeMarker', 'scoreMarker', 'turnToken', 'walletBowl', 'spentBowl', 'resourceBag'].includes(zone.kind);
  const [sx, , sz] = zone.scale;
  return (
    <group position={pos3(zone.pos)} rotation={rot3(zone.rot)}>
      {isMarker ? (
        <mesh>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshBasicMaterial color={style.color} transparent opacity={0.9} />
        </mesh>
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[Math.max(sx, 0.3), Math.max(sz, 0.3), 1]}>
            <planeGeometry />
            <meshBasicMaterial color={style.color} transparent opacity={0.28} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} scale={[Math.max(sx, 0.3), Math.max(sz, 0.3), 1]}>
            <edgesGeometry args={[new THREE.PlaneGeometry()]} />
            <lineBasicMaterial color={style.color} transparent opacity={0.9} />
          </lineSegments>
        </>
      )}
    </group>
  );
}

export function BrassDev() {
  const scene = useBrassScene();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [showZones, setShowZones] = useState(false);

  if (!scene) return <div className="page center"><h2>Loading table</h2></div>;

  const kinds = [...new Set(scene.zones.map((z) => z.kind))];
  const counts = Object.fromEntries(kinds.map((k) => [k, scene.zones.filter((z) => z.kind === k).length]));

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#08090c' }}>
      <TableScene scene={scene} filter={() => true}>
        {showZones && scene.zones.filter((z) => visible[z.kind]).map((z, i) => <ZoneMarker key={i} zone={z} />)}
      </TableScene>

      <div style={{
        position: 'absolute', top: 12, left: 12, padding: '10px 14px', borderRadius: 10,
        background: 'rgba(10,12,15,0.82)', color: '#dfe3ea', font: '12px/1.7 Inter, sans-serif',
        maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>The TTS table, rebuilt ({scene.objects.length} pieces)</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={showZones} onChange={() => setShowZones((v) => !v)} />
          <b>zone overlay</b>
        </label>
        {showZones && kinds.map((k) => {
          const st = ZONE_STYLE[k] ?? { color: '#fff', label: k };
          return (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', opacity: visible[k] ? 1 : 0.4, marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={visible[k] ?? false}
                onChange={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              />
              <span style={{ width: 10, height: 10, borderRadius: 2, background: st.color, display: 'inline-block' }} />
              {st.label} ({counts[k]})
            </label>
          );
        })}
        <div style={{ marginTop: 6, opacity: 0.65 }}>
          Drag to orbit, wheel to zoom.<br />WASD to move, Q/E for height, Shift for speed.
        </div>
      </div>
    </div>
  );
}
