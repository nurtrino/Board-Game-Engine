// Bloodborne TV board: the 3D table (BbScene) under the universal ig-* HUD —
// hunt track strip, enemy roster chips, mission banner, seat chips with HP and
// echoes, event narration with TV-voiced sfx. The TV is the shared table; all
// moves happen on the devices.

import { useEffect, useRef, useState } from 'react';
import type { BbView } from '@bge/shared';
import { BB_HUNT_TRACK } from '@bge/shared';
import { BbScene } from './BbScene';
import { BB_SEAT_HEX, bbHunterName, bbEnemyName, useBbManifest, bbCellCss } from './bb-assets';
import { bloodborneMusicMuted, useBbAudio } from './useBbAudio';
import { playSfx, sfxEnabled, setSfxEnabled } from '../sfx';
import './bb.css';

import type { SfxName } from '../sfx';
const SFX_FOR_KIND: Record<string, SfxName> = {
  kill: 'build', 'boss-kill': 'win', death: 'error', dream: 'coins',
  reveal: 'shuffle', 'reveal-mission': 'link', turn: 'turn', reset: 'shuffle',
  victory: 'win', defeat: 'error', 'boss-phase': 'error', fog: 'link',
  transform: 'click', firearm: 'build', arena: 'link', boss: 'link',
};

export function BbBoard({ view }: { view: BbView }) {
  const manifest = useBbManifest();
  const [muted, setMuted] = useState(() => !sfxEnabled() || bloodborneMusicMuted());
  const lastSeq = useRef(view.lastEvent.seq);
  useBbAudio(view, muted);

  useEffect(() => {
    if (view.lastEvent.seq === lastSeq.current) return;
    lastSeq.current = view.lastEvent.seq;
    const name = SFX_FOR_KIND[view.lastEvent.kind ?? ''];
    if (name) playSfx(name);
  }, [view.lastEvent.seq, view.lastEvent.kind]);

  const trackLen = view.huntTrackLength || BB_HUNT_TRACK.length;
  const activeMissions = Object.values(view.missions).filter((m) => m.revealed && !m.completed).slice(0, 4);
  const chapterDreamPending = view.pending.some((choice) => choice.kind === 'dream-upgrades' || choice.kind === 'dream-incorporate');

  return (
    <div className="bb-board" data-phase={view.phase} aria-label="Bloodborne shared hunt board">
      <BbScene view={view} />

      {/* top strip: campaign · chapter · hunt track · enemy roster */}
      <div className="bb-hud-top">
        <div className="ig-glass bb-chapter">
          <span className="ig-lab">CHAPTER {view.chapter}</span>
          <span className="bb-camp">{view.campaignId.replace(/-/g, ' ').toUpperCase()}</span>
          {view.finalRound && <span className="bb-final">FINAL ROUND</span>}
        </div>
        <div className="ig-glass bb-track" data-testid="bb-track" role="meter"
          aria-label="Hunt track" aria-valuemin={1} aria-valuemax={trackLen} aria-valuenow={view.huntTrack + 1}>
          <span className="bb-track-label">HUNT</span>
          <span className="bb-track-dots" aria-hidden="true">
            {Array.from({ length: trackLen }, (_, i) => (
              <span key={i} className={
                'bb-track-dot' + (view.huntTrackResets.includes(i) ? ' reset' : '') + (view.huntTrack === i ? ' here' : '') + (i === 0 ? ' start' : '')
              } />
            ))}
          </span>
          <span className="bb-track-count">{view.huntTrack + 1}/{trackLen}</span>
        </div>
        <div className="ig-glass bb-roster">
          <span className="bb-roster-label">ENEMIES</span>
          {view.enemySlots.map((type, i) => (
            <span key={i} className="bb-roster-chip">
              <span className="bb-roster-n">{i + 1}</span>
              {type ? bbEnemyName(type).toUpperCase() : '—'}
            </span>
          ))}
          <span className="bb-roster-chip dim">
            ACTIONS · B{view.enemyActionsLeft.basic} S{view.enemyActionsLeft.special} A{view.enemyActionsLeft.ability}
          </span>
        </div>
      </div>

      {/* event banner */}
      <div className={'bb-banner ig-glass kind-' + (view.lastEvent.kind ?? 'event')} key={view.lastEvent.seq}
        role="status" aria-live="polite" aria-atomic="true">
        <span className="ig-banner-head">{view.lastEvent.text}</span>
      </div>

      {/* seats: name + hunter + hp + echoes (outline = seat colour) */}
      <div className="bb-seats">
        {view.hunters.map((h) => {
          const seatColor = BB_SEAT_HEX[String(view.seats[h.seat]?.color)] ?? '#888';
          const active = view.activeSeat === h.seat;
          return (
            <div key={h.seat} className={'ig-glass bb-seat' + (active ? ' active' : '') + (h.hp <= 2 ? ' wounded' : '')}
              style={{ borderColor: seatColor }} aria-label={`${view.seats[h.seat]?.name ?? `Hunter ${h.seat + 1}`}, ${active ? 'active, ' : ''}${h.hp} health`}>
              {active && <span className="bb-seat-turn">ACTIVE HUNT</span>}
              <span className="bb-seat-name">{view.seats[h.seat]?.name ?? `HUNTER ${h.seat + 1}`}</span>
              <span className="bb-seat-hunter">{bbHunterName(h.hunterId).toUpperCase()}</span>
              <span className="bb-seat-stats">
                {h.space === null ? 'DREAM' : `HP ${h.hp}`} · ECHO {h.echoes}
                {h.poison ? ' · PSN' : ''}{h.frenzy ? ' · FRZ' : ''}
              </span>
            </div>
          );
        })}
      </div>

      {/* insight + missions summary (bottom-left) */}
      <div className="ig-glass bb-missions" data-testid="bb-missions">
        <span className="ig-lab">INSIGHT {view.insightCollected}</span>
        {activeMissions.map((m) => (
          <span key={m.number} className="bb-mission-line">CARD {m.number}{m.tokens > 0 ? ` · ${m.tokens} TOKENS` : ''}</span>
        ))}
        {activeMissions.length === 0 && <span className="bb-mission-line dim">NO ACTIVE MISSIONS</span>}
      </div>

      {/* end states */}
      {view.phase === 'ended' && (
        <div className="bb-end" role="alert">
          <div className={'bb-end-title ' + (view.outcome === 'victory' ? 'win' : 'lose')}>
            {view.outcome === 'victory' ? 'THE HUNT IS COMPLETE' : 'YOU DIED'}
          </div>
          <div className="bb-end-sub">
            {view.outcome === 'victory'
              ? (view.chapter < 3
                  ? chapterDreamPending
                    ? `CHAPTER ${view.chapter} CLEARED · SPEND BLOOD ECHOES ON YOUR DEVICES`
                    : `CHAPTER ${view.chapter} CLEARED · CONTINUE ON A DEVICE`
                  : 'THE CAMPAIGN IS WON')
              : 'THE NIGHT CONSUMED YHARNAM · THE CAMPAIGN BEGINS ANEW'}
          </div>
        </div>
      )}

      {/* hunter pick splash during setup */}
      {view.phase === 'setup' && manifest && (
        <div className="bb-setup-splash" role="status" aria-live="polite">
          <div className="bb-setup-title">CHOOSE YOUR HUNTERS ON YOUR DEVICES</div>
          <div className="bb-setup-cards">
            {view.pickedHunters.map((id) => (
              <div key={id} className="bb-setup-card" style={bbCellCss(manifest, 'sheet-2', huntersCell(id))} />
            ))}
          </div>
        </div>
      )}

      <button className="bb-mute ig-glass" aria-label={muted ? 'Turn music and sound effects on' : 'Turn music and sound effects off'}
        onClick={() => { setSfxEnabled(muted); setMuted(!muted); }}>
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>
    </div>
  );
}

// weapon dashboard cell per hunter id (sheet-2 art)
import { BB_HUNTERS } from '@bge/shared';
const huntersCell = (id: string): number => (BB_HUNTERS[id]?.art as { weaponCell?: number })?.weaponCell ?? 0;
