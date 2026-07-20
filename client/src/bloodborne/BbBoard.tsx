// Bloodborne TV board: the 3D table (BbScene) under the universal ig-* HUD —
// hunt track strip, enemy roster chips, mission banner, seat chips with HP and
// echoes, event narration, and music. The TV is the shared table; all
// moves happen on the devices.

import { useState } from 'react';
import type { BbView } from '@bge/shared';
import { BB_HUNT_TRACK, BB_HUNTERS, BB_ENEMIES, BB_BOSSES, BB_ITEMS } from '@bge/shared';
import { BbScene } from './BbScene';
import { BB_SEAT_HEX, bbHunterName, bbEnemyName, useBbManifest, bbCellCss } from './bb-assets';
import { bloodborneMusicMuted, useBbAudio } from './useBbAudio';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import './bb.css';

export function BbBoard({ view }: { view: BbView }) {
  const manifest = useBbManifest();
  const [muted, setMuted] = useState(() => bloodborneMusicMuted());
  useBbAudio(view, muted);

  const trackLen = view.huntTrackLength || BB_HUNT_TRACK.length;
  const activeMissions = Object.values(view.missions).filter((m) => m.revealed && !m.completed).slice(0, 4);
  const chapterDreamPending = view.pending.some((choice) => choice.kind === 'dream-upgrades' || choice.kind === 'dream-incorporate');

  return (
    <div className={'bb-board' + (view.combat ? ' in-combat' : '')} data-phase={view.phase} aria-label="Bloodborne shared hunt board">
      <BbScene view={view} />

      {/* combat face-off: the attack playing out, mirrored on the big screen */}
      {view.combat && <BbBoardCombat view={view} manifest={manifest} />}

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

      {/* camera note: who the table is focused on */}
      {view.activeSeat != null && view.hunters[view.activeSeat] && (
        <div className="bb-follow ig-glass" role="status" aria-live="polite"
          style={{ borderColor: BB_SEAT_HEX[String(view.seats[view.activeSeat]?.color)] }}>
          <span>FOLLOWING</span>
          <strong>{bbHunterName(view.hunters[view.activeSeat].hunterId).toUpperCase()}</strong>
          <small>
            {view.hunters[view.activeSeat].space === null
              ? 'IN THE HUNTER\'S DREAM'
              : `HP ${view.hunters[view.activeSeat].hp}/6 · ECHOES ${view.hunters[view.activeSeat].echoes}`}
          </small>
        </div>
      )}

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

      <button className="bb-mute ig-glass" aria-label={muted ? 'Turn Bloodborne music on' : 'Turn Bloodborne music off'}
        onClick={() => setMuted(!muted)}>
        {muted ? 'MUSIC OFF' : 'MUSIC ON'}
      </button>
    </div>
  );
}

// weapon dashboard cell per hunter id (sheet-2 art)
const huntersCell = (id: string): number => (BB_HUNTERS[id]?.art as { weaponCell?: number })?.weaponCell ?? 0;

// ---------- shared-screen combat face-off ----------
// The attack the active hunter is resolving on their device, mirrored large on
// the TV so the whole table watches the same clash: who is striking, what the
// enemy revealed, and both healths. Display-only — every choice stays on device.
const BB_BC_RANK: Record<string, number> = { fast: 3, medium: 2, slow: 1 };
const bbSpeedArrows = (speed: string | null | undefined): string => (speed ? '›'.repeat(BB_BC_RANK[speed] ?? 1) : '');

function BbBoardCombat({ view, manifest }: { view: BbView; manifest: ReturnType<typeof useBbManifest> }) {
  const combat = view.combat!;
  const me = view.hunters[combat.seat];
  const seatColor = BB_SEAT_HEX[String(view.seats[combat.seat]?.color)] ?? '#8b929d';
  const hunter = me?.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const weaponSide = hunter?.sides[me.weaponSide];

  const foe = combat.enemyUid != null ? view.enemies.find((e) => e.uid === combat.enemyUid) : null;
  const boss = combat.bossUid != null ? view.bosses.find((b) => b.uid === combat.bossUid) : null;
  const foeDef = foe ? BB_ENEMIES[foe.type] : null;
  const bossDef = boss ? BB_BOSSES[boss.type] : null;
  const foeName = foeDef?.name ?? bossDef?.name ?? 'Nightmare';
  const foeSide = foe && foeDef ? foeDef.sides[view.enemySides[foe.type] ?? 0] : null;
  const bossHpKey = String(Math.max(1, Math.min(4, view.seats.length))) as '1' | '2' | '3' | '4';
  const foeMaxHp = foeSide?.hp ?? (boss && bossDef ? bossDef.hp[boss.phase - 1][bossHpKey] : 1);
  const foeHp = Math.max(0, foeMaxHp - (foe?.damage ?? boss?.damage ?? 0));
  const foeArt = foeDef?.art
    ? { sheet: foeDef.art.sheet, cell: foeDef.art.cell }
    : bossDef?.art
      ? { sheet: bossDef.art.hpSheet, cell: bossDef.art.hpCell }
      : null;

  const snapshot = combat.enemyAction?.action ?? null;
  const revealed = !!snapshot;
  const enemyDamage = Math.max(0, (snapshot?.damage ?? 0) + combat.enemyDmgBonus);

  const firearmAttack = (combat as unknown as { firearmAttack?: { speed: string; damage: number } } | null)?.firearmAttack;
  const committedSlot = combat.attack ? weaponSide?.slots[combat.attack.slot] : null;
  const firearm = BB_ITEMS[me?.firearmId ?? ''];
  const hunterAttacking = !!combat.attack || !!firearmAttack;
  const hunterAtkName = firearmAttack ? firearm?.name : committedSlot?.name;
  const hunterAtkSpeed = firearmAttack?.speed ?? committedSlot?.speed ?? null;
  const hunterAtkDamage = firearmAttack
    ? firearmAttack.damage + combat.hunterDmgBonus
    : committedSlot ? committedSlot.damage + combat.hunterDmgBonus : 0;

  const hunterName = bbHunterName(me?.hunterId).toUpperCase();
  const status = combat.noResponse ? 'AMBUSH — NO RESPONSE'
    : !hunterAttacking && !revealed ? `${hunterName} CHOOSES A STRIKE`
      : !revealed ? 'ENEMY ACTION HIDDEN'
        : 'THE CLASH RESOLVES';

  return (
    <div className="bb-board-combat" role="status" aria-live="polite"
      aria-label={`Combat: ${hunterName} versus ${foeName}`}>
      <div className="bb-board-combat-head">
        <span>{boss ? `NIGHTMARE · PHASE ${boss.phase}` : 'ATTACK'}</span>
        <strong>{status}</strong>
      </div>
      <div className="bb-board-combat-vs">
        <div className="bb-bc-side hunter" style={{ borderColor: seatColor }}>
          <div className="bb-bc-portrait"
            style={bbCellCss(manifest, 'sheet-2', (hunter?.art as { weaponCell?: number } | undefined)?.weaponCell ?? 0, me?.weaponSide === 1)}
            aria-hidden="true" />
          <span className="bb-bc-name">{hunterName}</span>
          <strong className="bb-bc-move">{hunterAttacking ? (hunterAtkName ?? 'STRIKE') : 'CHOOSING…'}</strong>
          <small className="bb-bc-stat">{hunterAttacking ? `${bbSpeedArrows(hunterAtkSpeed)} · ${hunterAtkDamage}◆` : `${me?.hp ?? 0}/6 HP`}</small>
          <div className="bb-bc-hp" role="meter" aria-hidden="true"><span style={{ width: `${(me?.hp ?? 0) / 6 * 100}%`, background: seatColor }} /></div>
        </div>
        <div className="bb-bc-clash" aria-hidden="true"><span>VS</span></div>
        <div className="bb-bc-side foe">
          <div className="bb-bc-portrait" style={foeArt ? bbCellCss(manifest, foeArt.sheet, foeArt.cell) : undefined} aria-hidden="true" />
          <span className="bb-bc-name">{foeName.toUpperCase()}</span>
          <strong className="bb-bc-move">{revealed ? snapshot!.name : '???'}</strong>
          <small className="bb-bc-stat">{revealed ? (snapshot!.isAbility ? 'ABILITY' : `${bbSpeedArrows(snapshot!.speed)} · ${enemyDamage}◆`) : `${foeHp}/${foeMaxHp} HP`}</small>
          <div className="bb-bc-hp foe" role="meter" aria-hidden="true"><span style={{ width: `${foeHp / Math.max(1, foeMaxHp) * 100}%` }} /></div>
        </div>
      </div>
    </div>
  );
}
