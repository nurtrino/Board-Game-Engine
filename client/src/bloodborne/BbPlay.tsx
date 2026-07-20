// Bloodborne player device — the hunter's hands. Left: the live map (the
// movement + targeting surface). Right: the trick-weapon dashboard rebuilt
// from the mod's art with slot state, firearm, consumables, rewards, and the
// stat-card hand. Every branching decision arrives as an explicit prompt;
// illegal actions are greyed out with the reason, never bounced.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  BB_HUNTERS, BB_ENEMIES, BB_BOSSES, BB_TILES, BB_STAT_CARDS, BB_ITEMS, BB_MISSIONS,
  type BbView, type BbAction, type BbPending,
} from '@bge/shared';
import {
  BB_SEAT_HEX, BB_TILE_W, useBbManifest, bbCellCss, bbIconText, bbHunterName, bbEnemyName, bbBossName,
  bbTileArt, bbSpaceWorld, bbTileSpacesWorld, bbOpenExits, bbNeighbors,
  bbHunterMini, bbEnemyMini, bbBossMini, type BbEdgeT,
} from './bb-assets';
import { useBbMiniThumb } from './bb-mini-thumbs';
import { BB_HUNTER_NOTES } from './bb-hunter-notes';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import './bb.css';

const RANK: Record<string, number> = { fast: 3, medium: 2, slow: 1 };

// Stat-card footprints printed on the dashboard art, measured from the mod's
// 1024x579 sheet-2 cells (percent of the card). The layout depends on how
// many slots the weapon side has: 3 fill the right zone, 2 and 1 are centered.
const BB_SLOT_GEO: Record<number, { lefts: number[]; width: number; top: number; height: number }> = {
  3: { lefts: [30.8, 53.3, 75.7], width: 20.1, top: 34.2, height: 54.4 },
  2: { lefts: [42.2, 64.8], width: 19.8, top: 34.8, height: 53.5 },
  1: { lefts: [53.1], width: 20, top: 34.6, height: 53 },
};

const BbHunterViewer = lazy(() => import('./BbHunterViewer'));
const BbBattleStage = lazy(() => import('./BbBattleStage'));

interface Props {
  view: BbView;
  act: (a: BbAction) => void;
  seat: number;
  error: string | null;
}

export default function BbPlay({ view, act, seat, error }: Props) {
  const manifest = useBbManifest();
  const me = view.hunters[seat];
  const [selCard, setSelCard] = useState<{ id: string; index: number } | null>(null);
  const [attackPick, setAttackPick] = useState<{ enemyUid?: number; bossUid?: number } | null>(null);
  const [showMissions, setShowMissions] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [refreshPick, setRefreshPick] = useState(false);
  const [refreshSel, setRefreshSel] = useState<string[]>([]);
  const [roundDiscard, setRoundDiscard] = useState<string[]>([]);
  const [targeting, setTargeting] = useState<{ what: 'consumable' | 'firearm' | 'reward'; ix: number; label: string } | null>(null);
  const [offerPick, setOfferPick] = useState<string[] | null>(null);
  const [startSide, setStartSide] = useState<0 | 1>(0);
  const [zoomCard, setZoomCard] = useState<{ sheet: string; cell: number; back?: boolean; title?: string; wide?: boolean } | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [dreamExpanded, setDreamExpanded] = useState(false);
  const [dismissedCombatResult, setDismissedCombatResult] = useState(0);

  const myTurn = view.activeSeat === seat;
  const moving = view.moving?.seat === seat ? view.moving : null;
  const pending = view.pending[0];
  const myPending = pending && pending.seat === seat ? pending : null;
  const queuedRoundRefresh = view.pending.some((choice) => choice.seat === seat && choice.kind === 'round-refresh');
  const hunterDef = me?.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const hunterAccent = BB_SEAT_HEX[String(view.seats[seat]?.color)] ?? '#8b929d';
  const weaponSide = hunterDef?.sides[me.weaponSide];
  const weaponCell = (hunterDef?.art as { weaponCell?: number } | undefined)?.weaponCell ?? 0;
  const refreshNeed = me && BB_ITEMS[me.firearmId]?.effects?.refresh === 'discard2' ? 2 : 1;
  const combatResult = view.lastCombatResult?.seat === seat && view.lastCombatResult.seq > dismissedCombatResult
    ? view.lastCombatResult
    : null;

  // The map surfaces itself only while an action resolves on it (moving or
  // picking a target); otherwise the panel holds the Hunter's Dream board.
  const needsMap = !!moving || !!targeting;

  if (!me) return <div className="page center"><h2>Watching the Hunt</h2></div>;

  // ---------- setup: pick a hunter ----------
  if (view.phase === 'setup') {
    const core = Object.values(BB_HUNTERS).filter((h) => h.set === 'core');
    const expansion = Object.values(BB_HUNTERS).filter((h) => h.set !== 'core');
    return (
      <div className="bb-play bb-setup" data-testid="bb-setup">
        <div className="bb-head ig-glass">
          <span className="ig-lab">BLOODBORNE · {view.campaignId.replace(/-/g, ' ').toUpperCase()} · CHAPTER {view.chapter}</span>
          <span className="bb-head-note">{me.hunterId ? 'WAITING FOR THE OTHER HUNTERS' : 'CHOOSE YOUR HUNTER'}</span>
        </div>
        <div className="bb-actions ig-glass" style={{ margin: '8px 12px 0' }}>
          <span className="bb-head-note">TRICK WEAPON STARTS ON</span>
          <button className={'bb-btn' + (startSide === 0 ? ' primary' : '')} aria-pressed={startSide === 0}
            onClick={() => setStartSide(0)}>FIRST FORM</button>
          <button className={'bb-btn' + (startSide === 1 ? ' primary' : '')} aria-pressed={startSide === 1}
            onClick={() => setStartSide(1)}>TRANSFORMED FORM</button>
        </div>
        <div className="bb-picker">
          {[...core, ...expansion].map((h) => {
            const taken = view.pickedHunters.includes(h.id);
            const mine = me.hunterId === h.id;
            return (
              <button key={h.id} data-testid={`bb-inspect-${h.id}`}
                className={'bb-pick-card' + (taken ? ' taken' : '') + (mine ? ' mine' : '')}
                disabled={taken && !mine}
                onClick={() => setInspect(h.id)}>
                <div className="bb-pick-art" style={bbCellCss(manifest, 'sheet-2', (h.art as { weaponCell?: number }).weaponCell ?? 0, startSide === 1)} />
                <span className="bb-pick-name">{h.name.toUpperCase()}</span>
                {h.set !== 'core' && <span className="bb-pick-tag">EXPANSION</span>}
                {taken && !mine && <span className="bb-pick-tag">TAKEN</span>}
                {mine && <span className="bb-pick-tag">YOURS</span>}
              </button>
            );
          })}
        </div>
        {inspect && (() => {
          const h = BB_HUNTERS[inspect];
          if (!h) return null;
          const taken = view.pickedHunters.includes(inspect);
          const firearm = BB_ITEMS[h.firearmId];
          return (
            <BbDialog label={`${h.name} details`} wide onClose={() => setInspect(null)} testId="bb-inspect-dialog">
              <div className="ig-lab">{h.name.toUpperCase()}{h.set !== 'core' ? ' · EXPANSION' : ''}</div>
              <div className="bb-inspect">
                <div className="bb-inspect-stage">
                  <Suspense fallback={
                    <div className="bb-hunter-viewer-fallback" aria-hidden="true">
                      <span className="bb-hunter-viewer-silhouette" />
                    </div>
                  }>
                    <BbHunterViewer hunterId={inspect} hunterName={h.name} accent={hunterAccent} title="THE HUNTER" />
                  </Suspense>
                </div>
                <div className="bb-inspect-info">
                  <ul className="bb-inspect-notes" aria-label="Playstyle overview">
                    {(BB_HUNTER_NOTES[inspect] ?? []).map((note) => <li key={note}>{note}</li>)}
                  </ul>
                  {h.sides.map((s, i) => (
                    <div key={i} className="bb-inspect-side">
                      <span className="bb-inspect-side-name">{s.label.toUpperCase()}{i === 1 ? ' · TRANSFORMED' : ''}</span>
                      {s.ability && <span className="bb-inspect-ability">{bbIconText(s.ability)}</span>}
                      <div className="bb-inspect-slots">
                        {s.slots.map((sl, j) => (
                          <span key={j} className="bb-chip">{sl.name.toUpperCase()} · {'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="bb-inspect-legend">
                    <span>› IS ATTACK SPEED. MORE ARROWS STRIKE FIRST IN AN EXCHANGE.</span>
                    <span>♦ IS DAMAGE DEALT WHEN THE STRIKE RESOLVES.</span>
                    <span>A STAT CARD FILLS A SLOT TO POWER EACH ATTACK. CLEARED SLOTS RETURN CARDS.</span>
                    <span>EVERY HUNTER: 6 HP · HAND OF 3 STAT CARDS · {firearm?.name.toUpperCase() ?? 'FIREARM'}</span>
                  </div>
                </div>
              </div>
              <button className="bb-btn primary" data-testid={`bb-pick-${inspect}`}
                disabled={taken || !!me.hunterId}
                onClick={() => { act({ type: 'pick_hunter', hunterId: inspect, side: startSide }); setInspect(null); }}>
                {taken ? (me.hunterId === inspect ? 'THIS IS YOUR HUNTER' : 'ALREADY TAKEN')
                  : me.hunterId ? 'YOU ALREADY HAVE A HUNTER'
                    : `HUNT AS ${h.name.toUpperCase()} · START ${h.sides[startSide]?.label?.toUpperCase() ?? ''}`}
              </button>
              <button className="bb-btn ghost" onClick={() => setInspect(null)}>CLOSE</button>
            </BbDialog>
          );
        })()}
        {error && <div className="bb-toast">{error}</div>}
      </div>
    );
  }

  // ---------- ended ----------
  if (view.phase === 'ended') {
    const chapterReady = view.pending.length === 0;
    return (
      <div className="bb-play bb-ended">
        <div className={'bb-end-title ' + (view.outcome === 'victory' ? 'win' : 'lose')}>
          {view.outcome === 'victory' ? 'THE HUNT IS COMPLETE' : 'YOU DIED'}
        </div>
        {view.outcome === 'victory' && view.chapter < 3 && (
          <button className="bb-btn primary" data-testid="bb-next-chapter" disabled={!chapterReady}
            onClick={() => act({ type: 'next_chapter' })}>
            {chapterReady ? `BEGIN CHAPTER ${view.chapter + 1}` : 'RESOLVE THE HUNTER\'S DREAM'}
          </button>
        )}
        {view.outcome === 'victory' && view.chapter < 3 && !chapterReady && !myPending && (
          <div className="bb-head-note">WAITING FOR THE HUNTERS TO SPEND THEIR BLOOD ECHOES</div>
        )}
        {view.outcome === 'victory' && view.chapter >= 3 && <div className="bb-head-note">THE CAMPAIGN IS WON</div>}
        {view.outcome === 'defeat' && <div className="bb-head-note">THE CAMPAIGN BEGINS ANEW · CREATE A NEW HUNT</div>}
        {myPending && (
          <BbPrompt key={myPending.kind} view={view} seat={seat} act={act} pending={myPending} manifest={manifest}
            roundDiscard={roundDiscard} setRoundDiscard={setRoundDiscard} />
        )}
        {error && <div className="bb-toast">{error}</div>}
      </div>
    );
  }

  // ---------- helpers ----------
  const enemiesHere = view.enemies.filter((e) => e.space === me.space);
  const bossesHere = view.bosses.filter((b) => b.space === me.space);
  const consumableHere = me.space != null && view.consumableTokens.includes(me.space);
  const emptySlots = me.slots.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  const canAct = myTurn && !myPending && !view.combat && !moving;
  const reason = (ok: boolean, why: string): string | undefined => (ok ? undefined : why);

  const cardName = (id: string): string => BB_STAT_CARDS[id]?.name ?? id;
  const cardArt = (id: string): React.CSSProperties => {
    const c = BB_STAT_CARDS[id];
    return c ? bbCellCss(manifest, c.art.sheet, c.art.cell) : {};
  };

  const currentTile = me.space ? view.tiles.find((t) => t.uid === Number(me.space!.split(':')[0])) : null;
  const currentLocation = me.space === null
    ? 'HUNTER\'S DREAM'
    : (currentTile ? (BB_TILES[currentTile.tileId]?.name ?? 'YHARNAM') : 'YHARNAM').toUpperCase();
  const activeHunter = view.activeSeat == null ? null : view.hunters[view.activeSeat];
  const turnStatus = moving
    ? `MOVING · ${moving.left} STEP${moving.left === 1 ? '' : 'S'} REMAIN`
    : myPending
      ? 'DECISION REQUIRED'
      : myTurn
        ? (selCard ? `${cardName(selCard.id).toUpperCase()} READY · CHOOSE AN ACTION` : 'YOUR TURN · CHOOSE A STAT CARD')
        : view.activeSeat == null
          ? queuedRoundRefresh
            ? 'ROUND REFRESH QUEUED · WAITING FOR YOUR PROMPT'
            : (me.tookTurnThisRound || me.skipTurn ? 'WAITING FOR THE ROUND' : 'READY TO BEGIN')
          : activeHunter?.hunterId
            ? `${bbHunterName(activeHunter.hunterId).toUpperCase()} IS HUNTING`
            : 'WAITING FOR ANOTHER HUNTER';
  const mapHint = moving
    ? 'Choose a highlighted path or reveal an open gate.'
    : targeting
      ? targeting.label
      : selCard && canAct
        ? 'Choose an action from the command bar.'
        : 'Select a stat card to take an action.';

  const actionsFor = (cardId: string): { label: string; run?: () => void; why?: string; testid: string }[] => {
    const inDream = me.space === null;
    return [
      {
        label: 'MOVE', testid: 'bb-act-move',
        why: reason(!inDream, 'IN THE DREAM'),
        run: () => { act({ type: 'move', cardId }); setSelCard(null); },
      },
      {
        label: 'INTERACT', testid: 'bb-act-interact',
        why: inDream ? 'IN THE DREAM' : reason(consumableHere || hasMissionInteract(view, seat), 'NOTHING HERE'),
        run: () => { act({ type: 'interact', cardId }); setSelCard(null); },
      },
      {
        label: 'TRANSFORM', testid: 'bb-act-transform',
        run: () => { act({ type: 'transform', cardId }); setSelCard(null); },
      },
      {
        label: 'ATTACK', testid: 'bb-act-attack',
        why: inDream ? 'IN THE DREAM'
          : reason(enemiesHere.length + bossesHere.length > 0 || !!BB_STAT_CARDS[cardId]?.effects.leaping, 'NO ENEMY HERE')
          ?? reason(emptySlots.length > 0, 'ALL SLOTS FILLED'),
        run: () => {
          const target = enemiesHere[0] ?? bossesHere[0];
          if (target) setAttackPick('phase' in target ? { bossUid: target.uid } : { enemyUid: target.uid });
          else setAttackPick({});
        },
      },
      {
        label: 'HUNTER\'S DREAM', testid: 'bb-act-dream',
        why: reason(!inDream, 'ALREADY THERE'),
        run: () => { act({ type: 'dream', cardId }); setSelCard(null); },
      },
    ];
  };

  // ---------- render ----------
  return (
    <div className="bb-play" data-testid="bb-play">
      {/* header */}
      <header className="bb-head ig-glass">
        <div className="bb-head-identity">
          <span className="bb-head-id" style={{ borderColor: BB_SEAT_HEX[String(view.seats[seat]?.color)] }}>
            {bbHunterName(me.hunterId).toUpperCase()}
          </span>
          <div className="bb-vitals" aria-label="Hunter status">
            <span className="bb-stat vital" data-testid="bb-hp"><b>{me.hp}</b><small>/6 HP</small></span>
            <span className="bb-stat"><b>{me.echoes}</b><small>/3 ECHOES</small></span>
            <span className="bb-stat"><b>{view.insightCollected}</b><small>INSIGHT</small></span>
            <span className="bb-stat dim"><b>{view.huntTrack + 1}</b><small>/{view.huntTrackLength} HUNT</small></span>
            {(me.poison || me.frenzy || view.finalRound) && (
              <span className="bb-conditions" aria-label="Hunter conditions">
                {me.poison && <span className="bb-stat bad">POISON</span>}
                {me.frenzy && <span className="bb-stat bad">FRENZY</span>}
                {view.finalRound && <span className="bb-stat bad">FINAL ROUND</span>}
              </span>
            )}
          </div>
        </div>
        <div className={'bb-turn-status' + (myTurn ? ' active' : '') + (myPending ? ' urgent' : '')} aria-live="polite">
          <span className="bb-turn-status-mark" aria-hidden="true" />
          <span>{turnStatus}</span>
        </div>
        <span className="bb-head-spacer" />
        <nav className="bb-head-tools" aria-label="Hunt controls">
          <button className="bb-btn ghost" onClick={() => setShowMissions(true)} data-testid="bb-open-missions">MISSIONS</button>
          <button className="bb-btn ghost" onClick={() => setShowDeck(true)} data-testid="bb-open-deck">REFERENCE</button>
          <button className="bb-btn ghost" onClick={() => setShowIntro(true)}>GUIDE</button>
          {!myTurn && view.activeSeat === null && !me.tookTurnThisRound && !me.skipTurn && !pending && (
            <button className="bb-btn primary" data-testid="bb-begin-turn" onClick={() => act({ type: 'begin_turn' })}>BEGIN TURN</button>
          )}
          {myTurn && !moving && (
            <button className={'bb-btn' + (canAct && me.hand.length <= 1 ? ' primary' : '')} data-testid="bb-end-turn"
              onClick={() => act({ type: 'end_turn' })} disabled={!canAct}>END TURN</button>
          )}
          {moving && (
            <button className="bb-btn primary" data-testid="bb-end-move" onClick={() => act({ type: 'end_move' })}>
              END MOVE · {moving.left} LEFT
            </button>
          )}
        </nav>
      </header>

      <div className="bb-main">
        {/* left: the Hunter's Dream board; the hunt map takes over on its own
            while you move or pick a target, then hands back */}
        <section className={'bb-map-wrap ig-glass' + (needsMap ? '' : ' is-dream')} data-testid="bb-map"
          aria-label={needsMap ? 'Hunt map' : "Hunter's dream"}>
          {needsMap ? (
            <>
              <div className="bb-map-kicker">
                <span>HUNT MAP</span>
                <span>{currentLocation}</span>
              </div>
              <div className="bb-map-hint" aria-live="polite">{mapHint}</div>
              <BbMap view={view} seat={seat} moving={!!moving}
                enemyTargeting={!!targeting || (canAct && !!selCard && emptySlots.length > 0)}
                onSpace={(ref) => {
                  if (moving) act({ type: 'step', to: ref });
                }}
                onExit={(uid, edge) => {
                  if (moving) act({ type: 'step_reveal', edge });
                }}
                onEnemy={(uid, isBoss) => {
                  if (targeting) {
                    if (targeting.what === 'firearm') act({ type: 'use_firearm', target: uid });
                    else if (targeting.what === 'reward') act({ type: 'use_reward', rewardIx: targeting.ix, target: uid });
                    else act({ type: 'use_consumable', itemIx: targeting.ix, target: uid });
                    setTargeting(null);
                    return;
                  }
                  if (canAct && selCard && emptySlots.length) setAttackPick(isBoss ? { bossUid: uid } : { enemyUid: uid });
                }}
              />
              {targeting && targeting.label !== 'teleport-lamp' && targeting.label !== 'summon-ally' && (
                <div className="bb-special-chips targeting">
                  <span className="bb-chip bb-target-callout">{targeting.label}</span>
                  <button className="bb-chip" onClick={() => setTargeting(null)}>CANCEL</button>
                </div>
              )}
            </>
          ) : (
            <div className="bb-personal-board">
              <aside className="bb-dream-dock" aria-label="Hunter's Dream summary">
                <button className="bb-dream-dock-head" data-testid="bb-dream-expand" onClick={() => setDreamExpanded(true)}>
                  <span>THE HUNTER'S DREAM</span>
                  <strong>EXPAND</strong>
                </button>
                <BbHuntBoard view={view} manifest={manifest} onZoom={setZoomCard} compact />
              </aside>

              <section className="bb-weapon bb-weapon-hero ig-glass" data-testid="bb-weapon" aria-labelledby="bb-weapon-title">
                <div className="bb-section-head">
                  <span id="bb-weapon-title">TRICK WEAPON · {weaponSide?.label?.toUpperCase()}</span>
                  <button className="bb-expand" data-testid="bb-weapon-expand"
                    onClick={() => setZoomCard({ sheet: 'sheet-2', cell: weaponCell, back: me.weaponSide === 1, title: weaponSide?.label, wide: true })}>
                    EXPAND
                  </button>
                </div>
                <div className="bb-dashboard">
                  <button className="bb-weapon-art" style={bbCellCss(manifest, 'sheet-2', weaponCell, me.weaponSide === 1)}
                    aria-label={`Enlarge ${weaponSide?.label ?? 'weapon'} board`}
                    onClick={() => setZoomCard({ sheet: 'sheet-2', cell: weaponCell, back: me.weaponSide === 1, title: weaponSide?.label, wide: true })} />
                  {weaponSide?.slots.map((sl, i) => {
                    const geo = BB_SLOT_GEO[weaponSide.slots.length] ?? BB_SLOT_GEO[3];
                    const spot: React.CSSProperties = {
                      left: `${geo.lefts[i]}%`, top: `${geo.top}%`,
                      width: `${geo.width}%`, height: `${geo.height}%`,
                    };
                    const rules = `${sl.name} · ${'›'.repeat(RANK[sl.speed] ?? 1)} · ${sl.damage}♦`;
                    const card = me.slots[i] ? BB_STAT_CARDS[me.slots[i]!] : null;
                    return card ? (
                      <button key={i} className="bb-dash-slot filled" data-testid={`bb-slot-${i}`} style={spot}
                        aria-label={`${card.name} occupying ${sl.name}`} title={`${card.name} · ${rules}`}
                        onClick={() => setZoomCard({ sheet: card.art.sheet, cell: card.art.cell, title: card.name })}>
                        <span className="bb-dash-card" style={cardArt(me.slots[i]!)} aria-hidden="true" />
                        <span className="bb-dash-card-name">{card.name.toUpperCase()}</span>
                      </button>
                    ) : (
                      <div key={i} className="bb-dash-slot" data-testid={`bb-slot-${i}`} style={spot}
                        role="img" aria-label={`${sl.name} is empty`} title={rules} />
                    );
                  })}
                </div>
              </section>
            </div>
          )}
          {view.specialRules.length > 0 && (
            <div className="bb-special-chips rules">
              {view.specialRules.slice(0, 4).map((r) => (
                <button key={r} className="bb-chip" onClick={() => setShowMissions(true)}>RULE {r}</button>
              ))}
            </div>
          )}
        </section>

        {/* right: kit + hand + always-on actions */}
        <aside className="bb-rail" aria-label="Hunter dashboard">
          <section className="bb-gear ig-glass" aria-labelledby="bb-gear-title">
            <div className="bb-section-head">
              <span id="bb-gear-title">HUNTER'S KIT</span>
              <span>{me.consumables.length + me.rewards.length} CARRIED</span>
            </div>
            <div className="bb-gear-cards" data-testid="bb-gear-cards">
              <BbItemVisual manifest={manifest} itemId={me.firearmId} kindLabel="FIREARM"
                exhausted={me.firearmExhausted} testId="bb-firearm"
                onClick={() => {
                  if (me.firearmExhausted) { setRefreshPick(true); return; }
                  const gun = (BB_ITEMS[me.firearmId]?.effects ?? {}) as { custom?: string };
                  if (gun.custom === 'blunderbuss') setTargeting({ what: 'firearm', ix: 0, label: 'PICK AN ENEMY IN YOUR SPACE' });
                  else act({ type: 'use_firearm' });
                }} />
              {me.rewards.map((r, i) => {
                const rfx = (BB_ITEMS[r.id]?.effects ?? {}) as { custom?: string; onKill?: boolean };
                return (
                  <BbItemVisual key={i} manifest={manifest} itemId={r.id} kindLabel={BB_ITEMS[r.id]?.kind.toUpperCase() ?? 'REWARD'}
                    exhausted={r.exhausted} disabled={r.exhausted || !!rfx.onKill}
                    stateLabel={rfx.onKill ? 'ON KILL' : undefined}
                    onClick={() => {
                      if (rfx.custom && ['damage-2-push-2', 'execute-2hp-range-2', 'damage-2-suppress-within-1'].includes(rfx.custom)) {
                        setTargeting({ what: 'reward', ix: i, label: 'PICK AN ENEMY ON THE MAP' });
                      } else if (rfx.custom === 'gem-slot' || rfx.custom === 'swap-discard' || rfx.custom === 'echo-heal-2-more' || rfx.custom === 'teleport-lamp') {
                        setTargeting({ what: 'reward', ix: i, label: rfx.custom });
                      } else {
                        act({ type: 'use_reward', rewardIx: i });
                      }
                    }} />
                );
              })}
              {me.consumables.map((c, i) => (
                  <BbItemVisual key={`${c}:${i}`} manifest={manifest} itemId={c} kindLabel="CONSUMABLE"
                    testId={`bb-consumable-${i}`}
                    onClick={() => {
                      const fx = (BB_ITEMS[c]?.effects ?? {}) as { custom?: string };
                      if (fx.custom && ['damage-1-range-1', 'damage-2-same-space', 'move-enemy-2', 'suppress-activation'].includes(fx.custom)) {
                        setTargeting({ what: 'consumable', ix: i, label: 'PICK AN ENEMY ON THE MAP' });
                      } else if (fx.custom === 'teleport-lamp' || fx.custom === 'summon-ally') {
                        setTargeting({ what: 'consumable', ix: i, label: fx.custom });
                      } else {
                        act({ type: 'use_consumable', itemIx: i });
                      }
                    }} />
                ))}
            </div>
            {(() => {
              // mission hooks: bait spawns + consumable offerings (engine-legal only)
              const hooks = Object.entries(view.missionHooks ?? {});
              const bait = hooks.some(([card, hk]) => (hk as { discardConsumableSpawns?: string }).discardConsumableSpawns
                && view.missions[card]?.revealed && !view.missions[card]?.completed);
              const myTile = me.space ? view.tiles.find((t) => t.uid === Number(me.space!.split(':')[0])) : null;
              const myTileName = myTile ? (BB_TILES[myTile.tileId]?.name ?? '').toLowerCase() : '';
              const offer = hooks.find(([card, hk]) => {
                const t = (hk as { discardConsumablesOnTileDecrements?: string }).discardConsumablesOnTileDecrements;
                return t && t.toLowerCase() === myTileName && view.missions[card]?.revealed && !view.missions[card]?.completed;
              });
              if (!bait && !offer) return null;
              return (
                <div className="bb-gear-row">
                  {bait && canAct && me.consumables.length > 0 && (
                    <button className="bb-chip" data-testid="bb-mission-spawn" onClick={() => act({ type: 'mission_spawn' })}>
                      SET BAIT · DISCARD 1 CONSUMABLE
                    </button>
                  )}
                  {offer && canAct && me.consumables.length > 0 && (
                    <button className="bb-chip" data-testid="bb-mission-offer" onClick={() => setOfferPick([])}>
                      OFFER CONSUMABLES HERE
                    </button>
                  )}
                </div>
              );
            })()}
          </section>

          {/* hand */}
          <div className="bb-hand-head">
            <span>STAT HAND</span>
            <span>{selCard ? `${cardName(selCard.id).toUpperCase()} SELECTED` : `${me.hand.length} AVAILABLE`}</span>
          </div>
          <div className="bb-hand" data-testid="bb-hand">
            {me.hand.map((id, i) => (
              <div key={`${id}${i}`} className="bb-card-wrap">
                <button className={'bb-card' + (selCard?.index === i ? ' sel' : '')}
                  data-testid={`bb-hand-${i}`}
                  aria-pressed={selCard?.index === i}
                  onClick={() => setSelCard(selCard?.index === i ? null : { id, index: i })}>
                  <div className="bb-card-art" style={cardArt(id)} />
                  <span className="bb-card-name">{cardName(id).toUpperCase()}</span>
                </button>
                <button className="bb-card-zoom" aria-label={`Expand ${cardName(id)}`}
                  onClick={() => {
                    const c = BB_STAT_CARDS[id];
                    if (c) setZoomCard({ sheet: c.art.sheet, cell: c.art.cell, title: c.name });
                  }}>⤢</button>
              </div>
            ))}
            {me.hand.length === 0 && <span className="bb-empty-state">NO CARDS IN HAND</span>}
          </div>

          {/* action bar: always visible; buttons unlock once a card is selected */}
          <div className="bb-actions ig-glass" data-testid="bb-actions">
            {actionsFor(selCard?.id ?? '').map((a) => (
              <button key={a.label} className="bb-btn" data-testid={a.testid}
                disabled={!selCard || !canAct || !!a.why}
                onClick={a.run}>
                {a.label}{selCard && canAct && a.why ? ` · ${a.why}` : ''}
              </button>
            ))}
            <span className="bb-actions-note" aria-live="polite">
              {myPending ? 'RESOLVE THE PROMPT FIRST'
                : moving ? 'FINISH YOUR MOVE ON THE MAP'
                  : !myTurn ? 'ACTIONS UNLOCK ON YOUR TURN'
                    : !selCard ? 'SELECT A STAT CARD TO ACT'
                      : 'EACH ACTION SPENDS THE SELECTED CARD'}
            </span>
          </div>
        </aside>
      </div>

      {/* ---------- prompts ---------- */}
      {myPending && !combatResult && (
        <BbPrompt key={myPending.kind} view={view} seat={seat} act={act} pending={myPending} manifest={manifest}
          roundDiscard={roundDiscard} setRoundDiscard={setRoundDiscard} />
      )}

      {combatResult && (
        <BbCombatResultDialog result={combatResult}
          onContinue={() => setDismissedCombatResult(combatResult.seq)} />
      )}

      {dreamExpanded && (
        <BbDialog label="The Hunter's Dream" wide className="bb-dream-dialog" testId="bb-dream-dialog"
          onClose={() => setDreamExpanded(false)}>
          <div className="bb-dream-dialog-head">
            <div><span>THE HUNTER'S DREAM</span><strong>HUNT TRACK {view.huntTrack + 1}/{view.huntTrackLength}</strong></div>
            <button className="bb-btn ghost" onClick={() => setDreamExpanded(false)}>RETURN TO HUNTER</button>
          </div>
          <BbHuntBoard view={view} manifest={manifest} onZoom={setZoomCard} testId="bb-huntboard-expanded" />
        </BbDialog>
      )}

      {/* attack slot picker */}
      {attackPick && selCard && (
        <BbDialog label={`Pick an attack slot for ${cardName(selCard.id)}`} onClose={() => setAttackPick(null)}>
            <div className="ig-lab">PICK AN ATTACK SLOT · {cardName(selCard.id).toUpperCase()}</div>
            {enemiesHere.length + bossesHere.length > 1 && (
              <div className="bb-gear-row" aria-label="Choose a target">
                {enemiesHere.map((e) => (
                  <button key={`e${e.uid}`} className={'bb-chip' + (attackPick.enemyUid === e.uid ? ' sel' : '')}
                    aria-pressed={attackPick.enemyUid === e.uid}
                    onClick={() => setAttackPick({ enemyUid: e.uid })}>
                    {bbEnemyName(e.type).toUpperCase()}
                  </button>
                ))}
                {bossesHere.map((b) => (
                  <button key={`b${b.uid}`} className={'bb-chip' + (attackPick.bossUid === b.uid ? ' sel' : '')}
                    aria-pressed={attackPick.bossUid === b.uid}
                    onClick={() => setAttackPick({ bossUid: b.uid })}>
                    {bbBossName(b.type).toUpperCase()} · PHASE {b.phase}
                  </button>
                ))}
              </div>
            )}
            <div className="bb-slot-pick">
              {weaponSide?.slots.map((sl, i) => (
                <button key={i} className="bb-btn" disabled={me.slots[i] !== null}
                  data-testid={`bb-attackslot-${i}`}
                  onClick={() => {
                    act({ type: 'attack', cardId: selCard.id, slot: i, ...attackPick });
                    setAttackPick(null);
                    setSelCard(null);
                  }}>
                  {sl.name.toUpperCase()} · {'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦{me.slots[i] ? ' · FILLED' : ''}
                </button>
              ))}
            </div>
            <button className="bb-btn ghost" onClick={() => setAttackPick(null)}>CANCEL</button>
        </BbDialog>
      )}

      {/* firearm refresh discard picker */}
      {refreshPick && (
        <BbDialog label="Choose cards to discard and refresh your firearm" onClose={() => { setRefreshPick(false); setRefreshSel([]); }}>
            <div className="ig-lab">DISCARD {refreshNeed} TO REFRESH · {refreshSel.length}/{refreshNeed} SELECTED</div>
            <div className="bb-hand small">
              {me.hand.map((id, i) => (
                <button key={i} className={'bb-card' + (refreshSel.includes(`${i}`) ? ' sel' : '')}
                  aria-pressed={refreshSel.includes(`${i}`)}
                  onClick={() => setRefreshSel(refreshSel.includes(`${i}`) ? refreshSel.filter((x) => x !== `${i}`) : [...refreshSel, `${i}`])}>
                  <div className="bb-card-art" style={cardArt(id)} />
                  <span className="bb-card-name">{cardName(id).toUpperCase()}</span>
                </button>
              ))}
            </div>
            <button className="bb-btn primary" disabled={refreshSel.length !== refreshNeed} onClick={() => {
              act({ type: 'refresh_firearm', discard: refreshSel.map((i) => me.hand[+i]) });
              setRefreshPick(false); setRefreshSel([]);
            }}>REFRESH{refreshSel.length !== refreshNeed ? ` · PICK ${refreshNeed}` : ''}</button>
            {(BB_ITEMS[me.firearmId]?.effects as { echoRefresh?: boolean } | undefined)?.echoRefresh && (
              <button className="bb-btn" disabled={me.echoes < 1} onClick={() => {
                act({ type: 'refresh_firearm', discard: [], echo: true });
                setRefreshPick(false); setRefreshSel([]);
              }}>SPEND 1 BLOOD ECHO{me.echoes < 1 ? ' · NONE HELD' : ''}</button>
            )}
            <button className="bb-btn ghost" onClick={() => { setRefreshPick(false); setRefreshSel([]); }}>CANCEL</button>
        </BbDialog>
      )}

      {/* missions log */}
      {showMissions && (
        <BbDialog label="Mission log" wide onClose={() => setShowMissions(false)}>
            <div className="ig-lab">MISSIONS · INSIGHT {view.insightCollected}</div>
            <div className="bb-mission-list">
              {Object.values(view.missions).filter((m) => m.revealed).map((m) => {
                const def = BB_MISSIONS[view.campaignId]?.[m.number];
                const art = (def as unknown as { art?: { sheet: string; cell: number } })?.art;
                return (
                  <button key={m.number} className={'bb-mission-card' + (m.completed ? ' done' : '')}
                    onClick={() => art && setZoomCard({ sheet: art.sheet, cell: art.cell, back: true, title: def?.title })}>
                    {art
                      ? <div className="bb-mission-art" style={bbCellCss(manifest, art.sheet, art.cell, true)} />
                      : <div className="bb-mission-art empty" />}
                    <span className="bb-mission-title">{(def?.title ?? `CARD ${m.number}`).toUpperCase()}</span>
                    <span className="bb-mission-meta">
                      {def?.kind?.toUpperCase()}{m.tokens > 0 ? ` · ${m.tokens} TOKENS` : ''}{m.completed ? ' · COMPLETE' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="bb-btn ghost" onClick={() => setShowMissions(false)}>CLOSE</button>
        </BbDialog>
      )}

      {/* show deck: full sheets reference */}
      {showDeck && (
        <BbDialog label="Card reference" wide onClose={() => setShowDeck(false)}>
            <div className="ig-lab">CARD REFERENCE</div>
            <div className="bb-deck-list">
              {['basic-stat-deck', 'upgrade-stat-deck', 'consumable-deck', 'firearm-deck', 'reward-deck', 'enemies-2', 'sheet-3'].map((s) => (
                manifest?.sheets[s]?.face && <img key={s} src={manifest.sheets[s].face!.rel} alt={s} />
              ))}
            </div>
            <a className="bb-btn ghost" href="/bloodborne/rulebook.pdf" target="_blank" rel="noreferrer">OPEN RULEBOOK</a>
            <button className="bb-btn ghost" onClick={() => setShowDeck(false)}>CLOSE</button>
        </BbDialog>
      )}

      {/* intro */}
      {showIntro && (
        <BbDialog label="How to play Bloodborne" onClose={() => setShowIntro(false)}>
            <div className="ig-lab">BLOODBORNE · THE HUNT</div>
            <div className="bb-intro-text">
              <p>Each action costs 1 stat card from your hand. MOVE up to 2 spaces. INTERACT to pick up consumables and work missions. ATTACK an enemy in your space: the card goes into an empty attack slot and powers that strike.</p>
              <p>Enemies act on their own after your turn. Faster attacks strike first. Keep a Dodge card and an empty fast slot to survive.</p>
              <p><strong>Discarding cards normally is temporary:</strong> they go to your discard pile and return when your Hunter deck is reshuffled. When you incorporate an Upgrade in the Hunter&apos;s Dream, however, you remove one card from your deck permanently—usually a weaker Basic card—and replace it with that Upgrade. Your deck stays at 12 cards, but becomes stronger and more specialized.</p>
              <p>Blood Echoes buy upgrades in the Hunter's Dream. Dying costs your echoes and time. Complete the Hunt Mission before the track runs out.</p>
            </div>
            <a className="bb-btn ghost" href="/bloodborne/rulebook.pdf" target="_blank" rel="noreferrer">FULL RULEBOOK</a>
            <button className="bb-btn ghost" onClick={() => setShowIntro(false)}>CLOSE</button>
        </BbDialog>
      )}

      {/* consumable lamp / ally target pickers */}
      {targeting && targeting.label === 'teleport-lamp' && (
        <BbDialog label="Teleport to a lamp" onClose={() => setTargeting(null)}>
            <div className="ig-lab">TELEPORT TO A LAMP</div>
            {view.tiles.flatMap((t) => (BB_TILES[t.tileId]?.spaces ?? [])
              .filter((sp) => sp.icons.includes('lamp') && !view.brokenLamps.includes(`${t.uid}:${sp.id}`))
              .map((sp) => (
                <button key={`${t.uid}:${sp.id}`} className="bb-btn"
                  onClick={() => {
                    if (targeting.what === 'reward') act({ type: 'use_reward', rewardIx: targeting.ix, target: `${t.uid}:${sp.id}` });
                    else act({ type: 'use_consumable', itemIx: targeting.ix, target: `${t.uid}:${sp.id}` });
                    setTargeting(null);
                  }}>
                  {(sp.named ?? BB_TILES[t.tileId]?.name ?? 'LAMP').toUpperCase()}
                </button>
              )))}
            <button className="bb-btn ghost" onClick={() => setTargeting(null)}>CANCEL</button>
        </BbDialog>
      )}
      {targeting && targeting.label === 'gem-slot' && (
        <BbDialog label="Choose a weapon slot for the Blood Stone Shard" onClose={() => setTargeting(null)}>
            <div className="ig-lab">SEAT THE BLOOD STONE SHARD · +1 DAMAGE</div>
            {weaponSide?.slots.map((sl, i) => (
              <button key={i} className="bb-btn"
                onClick={() => { act({ type: 'use_reward', rewardIx: targeting.ix, target: i }); setTargeting(null); }}>
                {sl.name.toUpperCase()} · {'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦{me.gemSlot === i ? ' · GEM HERE' : ''}
              </button>
            ))}
            <button className="bb-btn ghost" onClick={() => setTargeting(null)}>CANCEL</button>
        </BbDialog>
      )}
      {targeting && targeting.label === 'echo-heal-2-more' && (
        <BbDialog label="Use Blood of Adella" onClose={() => setTargeting(null)}>
            <div className="ig-lab">BLOOD OF ADELLA</div>
            <button className="bb-btn" onClick={() => { act({ type: 'use_reward', rewardIx: targeting.ix }); setTargeting(null); }}>HEAL 1</button>
            <button className="bb-btn" disabled={me.echoes < 1}
              onClick={() => { act({ type: 'use_reward', rewardIx: targeting.ix, target: 'echo' as unknown as number }); setTargeting(null); }}>
              SPEND 1 ECHO · HEAL 3{me.echoes < 1 ? ' · NO ECHO' : ''}
            </button>
            <button className="bb-btn ghost" onClick={() => setTargeting(null)}>CANCEL</button>
        </BbDialog>
      )}
      {targeting && targeting.label === 'swap-discard' && (
        <SwapDiscardPicker me={me} manifest={manifest}
          onPick={(discardId, retrieveId) => {
            act({ type: 'use_reward', rewardIx: targeting.ix, target: `${discardId}|${retrieveId}` as unknown as number });
            setTargeting(null);
          }}
          onCancel={() => setTargeting(null)} />
      )}
      {targeting && targeting.label === 'summon-ally' && (
        <BbDialog label="Choose a hunter to summon" onClose={() => setTargeting(null)}>
            <div className="ig-lab">CALL A HUNTER TO YOUR SIDE</div>
            {view.hunters.filter((h) => h.seat !== seat && h.space).map((h) => (
              <button key={h.seat} className="bb-btn"
                onClick={() => { act({ type: 'use_consumable', itemIx: targeting.ix, target: h.seat }); setTargeting(null); }}>
                {bbHunterName(h.hunterId).toUpperCase()}
              </button>
            ))}
            <button className="bb-btn ghost" onClick={() => setTargeting(null)}>CANCEL</button>
        </BbDialog>
      )}

      {/* mission consumable offering */}
      {offerPick && (
        <BbDialog label="Choose consumables to offer" onClose={() => setOfferPick(null)}>
            <div className="ig-lab">OFFER CONSUMABLES · PICK ANY</div>
            <div className="bb-gear-row">
              {me.consumables.map((c, i) => (
                <button key={i} className={'bb-chip consumable' + (offerPick.includes(`${i}`) ? ' sel' : '')}
                  aria-pressed={offerPick.includes(`${i}`)}
                  onClick={() => setOfferPick(offerPick.includes(`${i}`) ? offerPick.filter((x) => x !== `${i}`) : [...offerPick, `${i}`])}>
                  {BB_ITEMS[c]?.name.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="bb-btn primary" disabled={offerPick.length === 0}
              onClick={() => { act({ type: 'mission_discard', cards: offerPick.map((i) => me.consumables[+i]) }); setOfferPick(null); }}>
              OFFER {offerPick.length}
            </button>
            <button className="bb-btn ghost" onClick={() => setOfferPick(null)}>CANCEL</button>
        </BbDialog>
      )}

      {/* card zoom */}
      {zoomCard && (
        <BbDialog label={zoomCard.title ? `${zoomCard.title} card` : 'Enlarged card'} onClose={() => setZoomCard(null)}
          className="bb-zoom-dialog" testId="bb-zoom">
          <div className="bb-zoom">
            <div className={'bb-zoom-art' + (zoomCard.wide ? ' wide' : '')}
              style={bbCellCss(manifest, zoomCard.sheet, zoomCard.cell, zoomCard.back)} />
            {zoomCard.title && <span className="bb-zoom-title">{zoomCard.title.toUpperCase()}</span>}
            <button className="bb-btn ghost" onClick={() => setZoomCard(null)}>CLOSE</button>
          </div>
        </BbDialog>
      )}

      {error && <div className="bb-toast" data-testid="bb-error">{error}</div>}
    </div>
  );
}

function BbDialog({ label, children, onClose, wide, className, testId, focusKey }: {
  label: string;
  children: React.ReactNode;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
  testId?: string;
  focusKey?: string | number;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => returnFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    (first ?? dialog)?.focus();
  }, [label, focusKey]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="bb-modal" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose?.();
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        data-testid={testId}
        className={'ig-glass bb-modal-card' + (wide ? ' wide' : '') + (className ? ` ${className}` : '')}
        onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  );
}

function BbItemVisual({ manifest, itemId, kindLabel, exhausted = false, stateLabel, disabled = false, reason, onClick, testId }: {
  manifest: ReturnType<typeof useBbManifest>;
  itemId: string;
  kindLabel: string;
  exhausted?: boolean;
  stateLabel?: string;
  disabled?: boolean;
  reason?: string;
  onClick: () => void;
  testId?: string;
}) {
  const item = BB_ITEMS[itemId];
  if (!item) return null;
  return (
    <button className={'bb-item-visual' + (exhausted ? ' spent' : '') + (disabled ? ' unavailable' : '')} data-testid={testId}
      disabled={disabled} onClick={onClick} title={`${bbIconText(item.text)}${reason ? ` — ${reason}` : ''}`}
      aria-label={`${item.name}, ${reason ?? (exhausted ? (disabled ? 'spent' : 'spent, activate to refresh') : stateLabel ?? 'ready')}`}>
      <span className="bb-item-art" style={bbCellCss(manifest, item.art.sheet, item.art.cell, exhausted)} aria-hidden="true" />
      <span className="bb-item-shade" aria-hidden="true" />
      <span className="bb-item-kind">{kindLabel}</span>
      <span className="bb-item-name">{item.name.toUpperCase()}</span>
      <span className={'bb-item-state' + (exhausted ? ' spent' : '')}>
        {exhausted ? (disabled ? 'SPENT' : 'SPENT · REFRESH') : reason ?? stateLabel ?? 'READY'}
      </span>
      {reason && <span className="bb-item-reason">{reason}</span>}
    </button>
  );
}

function BbCombatResultDialog({ result, onContinue }: {
  result: NonNullable<BbView['lastCombatResult']>;
  onContinue: () => void;
}) {
  const title = result.outcome === 'mutual' ? 'BOTH SLAIN'
    : result.outcome === 'hunter-slain' ? 'HUNTER SLAIN'
      : result.outcome === 'foe-slain' ? `${result.foeName.toUpperCase()} SLAIN`
        : result.outcome === 'phase-change' ? `BOSS PHASE ${result.bossPhaseBefore} BROKEN`
          : result.outcome === 'hunter-advantage' ? 'HUNTER WINS THE EXCHANGE'
            : result.outcome === 'foe-advantage' ? `${result.foeName.toUpperCase()} WINS THE EXCHANGE`
              : 'EXCHANGE COMPLETE — BOTH REMAIN';
  const hunterLine = !result.hunterAttack
    ? 'You made no attack.'
    : result.hunterAttack.cancelled
      ? `${result.hunterAttack.name} — cancelled.`
      : result.hunterAttack.resolved
        ? `${result.hunterAttack.name} — ${result.foeDamageTaken} damage.`
        : `${result.hunterAttack.name} — no hit.`;
  const enemyLine = result.dodged
    ? `${result.enemyAction?.name ?? 'Attack'} — Dodged.`
    : result.enemyAction?.cancelled
      ? `${result.enemyAction.name} — cancelled.`
      : result.enemyAction?.resolved
        ? `${result.enemyAction.name} — ${result.hunterDamageTaken} damage${result.blocked ? ` (${result.blocked} blocked)` : ''}.`
        : `${result.enemyAction?.name ?? 'Enemy action'} — no damage.`;
  const speedOrder = result.hunterAttack && result.enemyAction
    ? result.hunterAttack.speed === result.enemyAction.speed
      ? 'Equal speed — both resolve together.'
      : (result.hunterAttack.speed ?? -1) > (result.enemyAction.speed ?? -1)
        ? 'Your attack resolves first.'
        : `${result.foeName} resolves first.`
    : null;
  return (
    <BbDialog label={title} wide className="bb-combat-result-dialog" testId="bb-combat-result">
      <div className={`bb-combat-result outcome-${result.outcome}`}>
        <header>
          <span>EXCHANGE RESOLVED</span>
          <h2>{title}</h2>
          <p>{result.noResponse ? 'Ambush — no response allowed.'
            : result.foeSlain ? 'The foe is slain.'
            : result.phaseChanged ? `Phase ${result.bossPhaseAfter} begins at full health.`
              : result.hunterSlain ? 'You wake in the Dream. All carried Echoes are lost.'
                : 'The fight continues.'}</p>
        </header>
        <div className="bb-combat-result-score" aria-label="Combat health result">
          <div><span>YOU</span><strong>{result.hunterHpBefore} → {result.hunterHpAfter} HP</strong><small>−{result.hunterDamageTaken}</small></div>
          <b aria-hidden="true">◆</b>
          <div><span>{result.foeName.toUpperCase()}</span><strong>{result.foeHpBefore} → {result.foeHpAfter} HP</strong><small>−{result.foeDamageTaken}</small></div>
        </div>
        <ol className="bb-combat-transcript">
          {speedOrder && <li>{speedOrder}</li>}
          <li>{hunterLine}</li>
          <li>{enemyLine}</li>
        </ol>
        {result.enemyAction?.text && (
          <details className="bb-combat-result-rule"><summary>ACTION TEXT</summary><p>{bbIconText(result.enemyAction.text)}</p></details>
        )}
        <button className="bb-btn primary bb-combat-result-continue" data-testid="bb-combat-result-continue" onClick={onContinue}>
          CONTINUE
        </button>
      </div>
    </BbDialog>
  );
}

// ---------- mission interact availability (mirror of engine legality) ----------
function hasMissionInteract(view: BbView, seat: number): boolean {
  const me = view.hunters[seat];
  if (!me?.space) return false;
  if ((view.insightTokens[me.space] ?? 0) > 0) return true;
  if (view.survivorTokens.includes(me.space) || view.corpseTokens.includes(me.space)) return true;
  // revealed interact-goal missions are surfaced by the engine on attempt;
  // allow the tap when any active mission exists (engine gives the reason)
  return Object.values(view.missions).some((m) => m.revealed && !m.completed);
}

// ---------- prompts ----------

function BbBattleStatCard({ manifest, id, selected, disabled = false, reason, onClick, testId }: {
  manifest: ReturnType<typeof useBbManifest>;
  id: string;
  selected: boolean;
  disabled?: boolean;
  reason?: string | null;
  onClick: () => void;
  testId?: string;
}) {
  const card = BB_STAT_CARDS[id];
  return (
    <button className={'bb-battle-stat-card bb-card' + (selected ? ' selected' : '') + (disabled ? ' unavailable' : '')}
      aria-pressed={selected} disabled={disabled} onClick={onClick} data-testid={testId}
      aria-label={`${card?.name ?? id}${reason ? `, unavailable: ${reason}` : ''}`}
      title={`${card?.name ?? id}: ${bbIconText(card?.text)}${reason ? ` — ${reason}` : ''}`}>
      <span className="bb-battle-stat-art" style={bbCellCss(manifest, card?.art.sheet ?? '', card?.art.cell ?? 0)} aria-hidden="true" />
      <span className="bb-battle-card-gloss" aria-hidden="true" />
      <span className="bb-battle-stat-copy">
        <strong>{card?.name ?? id}</strong>
        <small>{bbIconText(card?.text) || (card?.effects.dodge ? 'Can be committed to Dodge.' : 'Commit to an open weapon slot.')}</small>
      </span>
      {card?.effects.dodge && <span className="bb-battle-card-tag">DODGE</span>}
      {reason && <span className="bb-battle-card-reason">{reason}</span>}
    </button>
  );
}

function BbBattlePrompt({ view, seat, act, pending, manifest, pick, setPick }: {
  view: BbView;
  seat: number;
  act: (action: BbAction) => void;
  pending: BbPending;
  manifest: ReturnType<typeof useBbManifest>;
  pick: { id: string; index: number } | null;
  setPick: (pick: { id: string; index: number } | null) => void;
}) {
  const focusRef = useRef<HTMLDivElement>(null);
  const resolveTimer = useRef<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const me = view.hunters[seat];
  const hunter = me.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const weaponSide = hunter?.sides[me.weaponSide];
  const combat = view.combat;
  const foe = combat?.enemyUid != null ? view.enemies.find((enemy) => enemy.uid === combat.enemyUid) : null;
  const boss = combat?.bossUid != null ? view.bosses.find((candidate) => candidate.uid === combat.bossUid) : null;
  const foeDef = foe ? BB_ENEMIES[foe.type] : null;
  const bossDef = boss ? BB_BOSSES[boss.type] : null;
  const foeName = foeDef?.name ?? bossDef?.name ?? 'Nightmare Hazard';
  const foeSide = foe && foeDef ? foeDef.sides[view.enemySides[foe.type] ?? 0] : null;
  const bossHpKey = String(Math.max(1, Math.min(4, view.seats.length))) as '1' | '2' | '3' | '4';
  const foeMaxHp = foeSide?.hp ?? (boss && bossDef ? bossDef.hp[boss.phase - 1][bossHpKey] : 1);
  const foeDamage = foe?.damage ?? boss?.damage ?? 0;
  const foeHp = Math.max(0, foeMaxHp - foeDamage);
  const foeArt = foeDef?.art
    ? { sheet: foeDef.art.sheet, cell: foeDef.art.cell }
    : bossDef?.art
      ? { sheet: bossDef.art.hpSheet, cell: bossDef.art.hpCell }
      : null;
  const enemyAct = combat?.enemyAction && foe && foeDef
    ? foeDef.sides[view.enemySides[foe.type] ?? 0][combat.enemyAction.kind === 'basic' ? 'basic' : combat.enemyAction.kind === 'special' ? 'special' : 'ability']
    : combat?.enemyAction && boss && bossDef
      ? bossDef.phases[boss.phase - 1][combat.enemyAction.bossCardIx ?? 0]
      : null;
  const firearm = BB_ITEMS[me.firearmId];
  const firearmFx = (firearm?.effects ?? {}) as { custom?: string; attack?: { speed: string; damage: number; stagger?: boolean } };
  const firearmAttack = (combat as unknown as { firearmAttack?: { speed: string; damage: number; stagger?: boolean } } | null)?.firearmAttack;
  const cardAttack = !!combat?.attack;
  const hunterAttacking = cardAttack || !!firearmAttack;
  const committedCard = combat?.attack ? BB_STAT_CARDS[combat.attack.cardId] : null;
  const committedSlot = combat?.attack ? weaponSide?.slots[combat.attack.slot] : null;
  const hunterAttackDamage = firearmAttack
    ? firearmAttack.damage + (combat?.hunterDmgBonus ?? 0)
    : committedSlot
      ? committedSlot.damage + (committedCard?.effects.dmgBonus ?? 0) + (combat?.hunterDmgBonus ?? 0)
      : 0;
  const hunterAttackSpeed = firearmAttack?.speed ?? committedSlot?.speed ?? null;
  const enemyDamage = Math.max(0, (enemyAct?.damage ?? 0) + (combat?.enemyDmgBonus ?? 0));
  const enemySpeed = enemyAct?.speed ?? null;
  const hunterAccent = BB_SEAT_HEX[String(view.seats[seat]?.color)] ?? '#8b929d';
  const dodgeCards = me.hand.filter((id) => BB_STAT_CARDS[id]?.effects.dodge);
  const reactionFirearmLegal = !me.firearmExhausted && combat?.bossUid == null && !!combat?.enemyAction
    && ((firearmFx.custom === 'stagger-basic' && combat.enemyAction.kind === 'basic') || firearmFx.custom === 'degrade-attack');
  const reactionConsumables = me.consumables.flatMap((id, index) => {
    const item = BB_ITEMS[id];
    return item?.timing === 'On Attack' && hunterAttacking ? [{ id, index, item }] : [];
  });
  const reactionRewards = me.rewards.flatMap((reward, index) => {
    const item = BB_ITEMS[reward.id];
    const effects = (item?.effects ?? {}) as { custom?: string; onKill?: boolean };
    const needsCardAttack = effects.custom === 'combat-dmg1-stagger' || effects.custom === 'combat-stagger-ties';
    if (!item || reward.exhausted || effects.onKill || item.timing !== 'On Attack' || !hunterAttacking || (needsCardAttack && !cardAttack)) return [];
    return [{ index, item }];
  });
  const reactionCount = (reactionFirearmLegal ? 1 : 0) + reactionConsumables.length + reactionRewards.length;

  const phaseTitle = pending.kind === 'combat-attack' ? 'COUNTERATTACK WINDOW'
    : pending.kind === 'combat-reaction' ? 'ENEMY ACTION REVEALED'
      : pending.kind === 'combat-dodge' ? 'INCOMING ATTACK'
        : 'AFTERMATH HAZARD';
  const phaseInstruction = pending.kind === 'combat-attack'
    ? 'Commit a stat card to an open weapon slot, fire an attack firearm, or brace for impact.'
    : pending.kind === 'combat-reaction'
      ? 'Use any On Attack gear now. Continue when your modifiers are locked in.'
      : pending.kind === 'combat-dodge'
        ? 'Commit a Dodge card to a fast-enough open slot, counter with your firearm, or take the hit.'
        : 'Commit a Dodge card to escape the secondary effect, or suffer it.';

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [pending.kind]);

  useEffect(() => () => {
    if (resolveTimer.current != null) window.clearTimeout(resolveTimer.current);
  }, []);

  const resolveExchange = (action: BbAction) => {
    if (resolving) return;
    setResolving(true);
    resolveTimer.current = window.setTimeout(() => {
      resolveTimer.current = null;
      act(action);
    }, 620);
  };

  return (
    <div className={`bb-battle-overlay phase-${pending.kind}${resolving ? ' resolving' : ''}`} role="dialog" aria-modal="true"
      aria-labelledby="bb-battle-title" data-testid={`bb-prompt-${pending.kind}`} tabIndex={-1} ref={focusRef}>
      <div className="bb-battle-backdrop" aria-hidden="true" />
      <header className="bb-battle-topbar">
        <div className="bb-battle-foe-portrait" style={foeArt ? bbCellCss(manifest, foeArt.sheet, foeArt.cell) : undefined} aria-hidden="true" />
        <div className="bb-battle-foe-hud">
          <span className="bb-battle-kicker">{boss ? `NIGHTMARE · PHASE ${boss.phase}` : 'ENEMY ENCOUNTER'}</span>
          <strong>{foeName.toUpperCase()}</strong>
          <div className="bb-battle-hpbar enemy" role="meter" aria-label={`${foeName} health`}
            aria-valuemin={0} aria-valuemax={foeMaxHp} aria-valuenow={foeHp}>
            <span style={{ width: `${Math.max(0, Math.min(100, foeHp / Math.max(1, foeMaxHp) * 100))}%` }} />
          </div>
          <small>{foeHp} / {foeMaxHp} HP</small>
        </div>
        <div className="bb-battle-phase-copy">
          <span id="bb-battle-title">{phaseTitle}</span>
          <strong>{pending.kind === 'combat-dodge' ? 'DEFEND' : pending.kind === 'combat-attack' ? 'CHOOSE YOUR STRIKE' : 'RESOLVE THE CLASH'}</strong>
        </div>
      </header>

      <main className="bb-battle-arena">
        <div className="bb-battle-stage-wrap" aria-hidden="true">
          <Suspense fallback={<div className="bb-battle-stage-fallback" />}>
            <BbBattleStage hunterSlug={bbHunterMini(me.hunterId)}
              foeSlug={foe ? bbEnemyMini(foe.type) : boss ? bbBossMini(boss.type) : null}
              foeIsBoss={!!boss} phase={resolving ? 'resolving' : pending.kind} hunterAttacking={hunterAttacking} accent={hunterAccent} />
          </Suspense>
        </div>

        <section className="bb-battle-exchange" aria-label="Attack exchange">
          <div className={'bb-battle-move hunter' + (hunterAttacking ? ' committed' : '')}>
            <div className="bb-battle-move-card" style={committedCard
              ? bbCellCss(manifest, committedCard.art.sheet, committedCard.art.cell)
              : bbCellCss(manifest, 'sheet-2', (hunter?.art as { weaponCell?: number } | undefined)?.weaponCell ?? 0, me.weaponSide === 1)} />
            <span>HUNTER</span>
            <strong>{firearmAttack ? firearm?.name.toUpperCase() : committedSlot?.name.toUpperCase() ?? 'AWAITING ATTACK'}</strong>
            <small>{hunterAttackSpeed ? `${'›'.repeat(RANK[hunterAttackSpeed] ?? 1)} · ${hunterAttackDamage}♦` : 'NO STRIKE COMMITTED'}</small>
          </div>
          <div className="bb-battle-versus" aria-hidden="true"><span>EXCHANGE</span><strong>VS</strong></div>
          <div className={'bb-battle-move enemy' + (enemyAct ? ' committed' : '')}>
            <div className="bb-battle-enemy-action-mark" aria-hidden="true">{combat?.enemyAction?.kind?.slice(0, 1).toUpperCase() ?? '?'}</div>
            <span>{combat?.enemyAction?.kind?.toUpperCase() ?? 'ENEMY DECK'}</span>
            <strong>{enemyAct?.name.toUpperCase() ?? 'ACTION HIDDEN'}</strong>
            <small>{enemyAct ? `${enemySpeed ? '›'.repeat(RANK[enemySpeed] ?? 1) : 'ABILITY'} · ${enemyDamage}♦` : 'REVEALS AFTER YOUR CHOICE'}</small>
          </div>
        </section>

        <section className="bb-battle-hunter-hud" aria-label="Hunter battle status">
          <div className="bb-battle-hunter-name">
            <span>HUNTER</span><strong>{bbHunterName(me.hunterId).toUpperCase()}</strong>
          </div>
          <div className="bb-battle-hpbar hunter" role="meter" aria-label="Hunter health"
            aria-valuemin={0} aria-valuemax={6} aria-valuenow={me.hp}>
            <span style={{ width: `${Math.max(0, Math.min(100, me.hp / 6 * 100))}%` }} />
          </div>
          <b>{me.hp}/6 HP</b>
          <div className="bb-battle-loadout-icons" aria-label="Readied loadout">
            <span className="weapon" style={bbCellCss(manifest, 'sheet-2', (hunter?.art as { weaponCell?: number } | undefined)?.weaponCell ?? 0, me.weaponSide === 1)} />
            <span className={'firearm' + (me.firearmExhausted ? ' spent' : '')}
              style={firearm ? bbCellCss(manifest, firearm.art.sheet, firearm.art.cell, me.firearmExhausted) : undefined} />
            {me.consumables.slice(0, 2).map((id, index) => {
              const item = BB_ITEMS[id];
              return item ? <span key={`${id}:${index}`} style={bbCellCss(manifest, item.art.sheet, item.art.cell)} /> : null;
            })}
          </div>
        </section>
      </main>

      <section className="bb-battle-command" aria-label="Battle commands">
        <div className="bb-battle-command-head">
          <div><span>COMMAND</span><strong>{phaseTitle}</strong></div>
          <p>{phaseInstruction}</p>
          {enemyAct?.text && <p className="bb-battle-effect-text">{bbIconText(enemyAct.text)}</p>}
        </div>

        {pending.kind === 'combat-attack' && (
          <div className="bb-battle-command-body">
            <div className="bb-battle-card-row" aria-label="Stat cards available to attack">
              {me.hand.map((id, index) => <BbBattleStatCard key={`${id}:${index}`} manifest={manifest} id={id}
                selected={pick?.index === index} onClick={() => setPick(pick?.index === index ? null : { id, index })} testId={`bb-battle-hand-${index}`} />)}
            </div>
            <div className="bb-battle-command-actions">
              {pick && weaponSide?.slots.map((slot, index) => (
                <button key={index} className="bb-battle-slot-command" disabled={me.slots[index] !== null}
                  onClick={() => { act({ type: 'choose', cardId: pick.id, slot: index }); setPick(null); }}>
                  <span>{slot.name.toUpperCase()}</span><strong>{'›'.repeat(RANK[slot.speed] ?? 1)} · {slot.damage}♦</strong>
                  <small>{me.slots[index] ? 'OCCUPIED' : 'COMMIT CARD'}</small>
                </button>
              ))}
              {!me.firearmExhausted && firearmFx.custom === 'firearm-attack' && firearm && (
                <BbItemVisual manifest={manifest} itemId={firearm.id} kindLabel="FIREARM ATTACK"
                  onClick={() => act({ type: 'choose', firearm: true })} />
              )}
              <button className="bb-btn ghost" data-testid="bb-combat-pass" onClick={() => act({ type: 'choose', pass: true })}>BRACE · DO NOT ATTACK</button>
            </div>
          </div>
        )}

        {pending.kind === 'combat-reaction' && (
          <div className="bb-battle-command-body reactions">
            <div className="bb-battle-item-grid" aria-label="Available combat reactions">
              {reactionFirearmLegal && firearm && <BbItemVisual manifest={manifest} itemId={firearm.id} kindLabel="FIREARM REACTION"
                testId="bb-reaction-firearm" onClick={() => act({ type: 'use_firearm' })} />}
              {reactionConsumables.map(({ id, index }) => <BbItemVisual key={`${id}:${index}`} manifest={manifest}
                itemId={id} kindLabel="ON ATTACK" testId={`bb-reaction-consumable-${index}`}
                onClick={() => act({ type: 'use_consumable', itemIx: index })} />)}
              {reactionRewards.map(({ index, item }) => <BbItemVisual key={`${item.id}:${index}`} manifest={manifest}
                itemId={item.id} kindLabel={item.kind.toUpperCase()} testId={`bb-reaction-reward-${index}`}
                onClick={() => act({ type: 'use_reward', rewardIx: index })} />)}
              {reactionCount === 0 && <span className="bb-battle-empty-command">NO REACTION GEAR IS READY</span>}
            </div>
            <button className="bb-btn primary bb-battle-continue" data-testid="bb-reaction-pass"
              onClick={() => resolveExchange({ type: 'choose', pass: true })}>LOCK IN · CONTINUE EXCHANGE</button>
          </div>
        )}

        {(pending.kind === 'combat-dodge' || pending.kind === 'combat-rider') && (
          <div className="bb-battle-command-body">
            <div className="bb-battle-card-row" aria-label="Dodge cards available">
              {dodgeCards.map((id, index) => <BbBattleStatCard key={`${id}:${index}`} manifest={manifest} id={id}
                selected={pick?.index === index} onClick={() => setPick(pick?.index === index ? null : { id, index })} testId={`bb-battle-dodge-${index}`} />)}
              {dodgeCards.length === 0 && <span className="bb-battle-empty-command">NO DODGE CARD IN HAND</span>}
            </div>
            <div className="bb-battle-command-actions">
              {pending.kind === 'combat-dodge' && reactionFirearmLegal && firearm && (
                <BbItemVisual manifest={manifest} itemId={firearm.id} kindLabel="PARRY FIREARM"
                  onClick={() => resolveExchange({ type: 'use_firearm' })} />
              )}
              {pick && weaponSide?.slots.map((slot, index) => {
                const required = 'speed' in pending && pending.speed != null
                  ? (typeof pending.speed === 'number' ? pending.speed : RANK[pending.speed])
                  : 1;
                const cardBonus = BB_STAT_CARDS[pick.id]?.effects.speedBonus ?? 0;
                const legal = me.slots[index] === null && (RANK[slot.speed] ?? 0) + cardBonus >= required;
                return (
                  <button key={index} className="bb-battle-slot-command dodge" disabled={!legal}
                    onClick={() => { resolveExchange({ type: 'choose', cardId: pick.id, slot: index }); setPick(null); }}>
                    <span>{slot.name.toUpperCase()}</span><strong>{'›'.repeat(RANK[slot.speed] ?? 1)} · EVADE</strong>
                    <small>{legal ? 'COMMIT DODGE' : me.slots[index] ? 'OCCUPIED' : 'TOO SLOW'}</small>
                  </button>
                );
              })}
              <button className="bb-btn ghost danger" data-testid="bb-dodge-pass"
                onClick={() => resolveExchange({ type: 'choose', pass: true })}>TAKE THE HIT</button>
            </div>
          </div>
        )}
      </section>
      <div className="bb-battle-resolve-flash" aria-live="assertive" aria-hidden={!resolving}>
        <span>RESOLVING EXCHANGE</span>
      </div>
      <div className="bb-battle-scanlines" aria-hidden="true" />
    </div>
  );
}

function BbBattlePromptBoard({ view, seat, act, pending, manifest, pick, setPick }: {
  view: BbView;
  seat: number;
  act: (action: BbAction) => void;
  pending: BbPending;
  manifest: ReturnType<typeof useBbManifest>;
  pick: { id: string; index: number } | null;
  setPick: (pick: { id: string; index: number } | null) => void;
}) {
  const focusRef = useRef<HTMLDivElement>(null);
  const resolveTimer = useRef<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [firstBattle, setFirstBattle] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem('bb-combat-tutorial-v2') !== 'complete'
  ));
  // A hunter-initiated attack may enter this component at modifiers or reveal
  // because its card and slot were committed by the action that started combat.
  // The encounter announcement still belongs at the start of every exchange.
  const [encounterOpen, setEncounterOpen] = useState(true);
  const me = view.hunters[seat];
  const hunter = me.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const weaponSide = hunter?.sides[me.weaponSide];
  const combat = view.combat;
  const isRider = pending.kind === 'combat-rider';
  const foe = combat?.enemyUid != null ? view.enemies.find((enemy) => enemy.uid === combat.enemyUid) : null;
  const boss = combat?.bossUid != null ? view.bosses.find((candidate) => candidate.uid === combat.bossUid) : null;
  const foeDef = foe ? BB_ENEMIES[foe.type] : null;
  const bossDef = boss ? BB_BOSSES[boss.type] : null;
  const foeName = foeDef?.name ?? bossDef?.name ?? (isRider ? 'Secondary Target' : 'Nightmare Hazard');
  const foeSide = foe && foeDef ? foeDef.sides[view.enemySides[foe.type] ?? 0] : null;
  const bossHpKey = String(Math.max(1, Math.min(4, view.seats.length))) as '1' | '2' | '3' | '4';
  const foeMaxHp = foeSide?.hp ?? (boss && bossDef ? bossDef.hp[boss.phase - 1][bossHpKey] : 1);
  const foeDamage = foe?.damage ?? boss?.damage ?? 0;
  const foeHp = Math.max(0, foeMaxHp - foeDamage);
  const foeArt = foeDef?.art
    ? { sheet: foeDef.art.sheet, cell: foeDef.art.cell }
    : bossDef?.art
      ? { sheet: bossDef.art.hpSheet, cell: bossDef.art.hpCell }
      : null;
  const snapshot = combat?.enemyAction?.action;
  const baseEnemyAct = combat?.enemyAction && foeSide
    ? foeSide[combat.enemyAction.kind === 'basic' ? 'basic' : combat.enemyAction.kind === 'special' ? 'special' : 'ability']
    : combat?.enemyAction && boss && bossDef
      ? bossDef.phases[boss.phase - 1][combat.enemyAction.bossCardIx ?? 0]
      : null;
  const enemyAct = snapshot ?? baseEnemyAct;
  const actionIsAbility = snapshot?.isAbility ?? (!!enemyAct && (enemyAct.speed == null || combat?.enemyAction?.kind === 'ability'));
  const firearm = BB_ITEMS[me.firearmId];
  const firearmFx = (firearm?.effects ?? {}) as { custom?: string; attack?: { speed: string; damage: number; stagger?: boolean; splash?: number } };
  const firearmAttack = (combat as unknown as { firearmAttack?: { speed: string; damage: number; stagger?: boolean; splash?: number } } | null)?.firearmAttack;
  const cardAttack = !!combat?.attack;
  const hunterAttacking = cardAttack || !!firearmAttack;
  const committedCard = combat?.attack ? BB_STAT_CARDS[combat.attack.cardId] : null;
  const committedSlot = combat?.attack ? weaponSide?.slots[combat.attack.slot] : null;
  const committedStagger = !!committedCard?.effects.stagger || !!committedSlot?.effects?.stagger
    || !!(combat as unknown as { hunterStagger?: boolean } | null)?.hunterStagger;
  const weaponBonusDamage = committedStagger ? weaponSide?.effects?.staggerBonusDmg ?? 0 : 0;
  const hunterAttackDamage = firearmAttack
    ? firearmAttack.damage + (combat?.hunterDmgBonus ?? 0)
    : committedSlot
      ? committedSlot.damage + (committedCard?.effects.dmgBonus ?? 0) + (combat?.hunterDmgBonus ?? 0)
        + (me.gemSlot === combat?.attack?.slot ? 1 : 0) + weaponBonusDamage
      : 0;
  const hunterAttackRank = firearmAttack
    ? (RANK[firearmAttack.speed] ?? 0) + (combat?.hunterSpeedBonus ?? 0)
    : committedSlot
      ? (RANK[committedSlot.speed] ?? 0) + (committedCard?.effects.speedBonus ?? 0) + (combat?.hunterSpeedBonus ?? 0)
      : null;
  const enemyDamage = Math.max(0, (enemyAct?.damage ?? 0) + (combat?.enemyDmgBonus ?? 0));
  const enemyRank = enemyAct?.speed ? (RANK[enemyAct.speed] ?? 0) + (combat?.enemySpeedBonus ?? 0) : null;
  const attackCancelled = !!(combat as unknown as { firearmCancel?: boolean } | null)?.firearmCancel;
  const effectsStripped = !!(combat as unknown as { stripEffects?: boolean } | null)?.stripEffects;
  const cannotDodge = !effectsStripped && !!snapshot?.cannotDodge;
  const exactDodgeSpeed = !effectsStripped ? snapshot?.exactDodgeSpeed ?? null : null;
  const hunterAccent = BB_SEAT_HEX[String(view.seats[seat]?.color)] ?? '#8b929d';
  const openSlots = me.slots.flatMap((value, index) => value == null ? [index] : []);
  const requiredRank = pending.kind === 'combat-dodge'
    ? (typeof pending.speed === 'number' ? pending.speed : RANK[pending.speed] ?? 1)
    : pending.kind === 'combat-rider' ? RANK[pending.speed ?? 'slow'] ?? 1 : 1;
  const speedName = (rank: number | null) => rank == null ? 'ABILITY'
    : rank >= 4 ? 'FAST+' : rank >= 3 ? 'FAST' : rank >= 2 ? 'MEDIUM' : rank >= 1 ? 'SLOW' : 'DELAYED';
  const speedMarks = (rank: number | null) => rank == null ? 'ABILITY' : `${'›'.repeat(Math.max(1, Math.round(rank)))} ${speedName(rank)}`;
  const effectiveSlotRank = (slot: number, cardId: string) => (
    (RANK[weaponSide?.slots[slot]?.speed ?? 'slow'] ?? 1) + (BB_STAT_CARDS[cardId]?.effects.speedBonus ?? 0)
  );
  const slotCanDodge = (slot: number, cardId: string) => {
    const rank = effectiveSlotRank(slot, cardId);
    return exactDodgeSpeed ? rank === (RANK[exactDodgeSpeed] ?? 0) : rank >= requiredRank;
  };
  const dodgeCardReason = (id: string): string | null => {
    if (!BB_STAT_CARDS[id]?.effects.dodge) return 'NO DODGE KEYWORD';
    if (attackCancelled) return 'ENEMY ATTACK CANCELLED';
    if (cannotDodge) return 'THIS ATTACK CANNOT BE DODGED';
    if (openSlots.length === 0) return 'NO OPEN ATTACK SLOT';
    if (!openSlots.some((slot) => slotCanDodge(slot, id))) {
      return exactDodgeSpeed ? `REQUIRES EXACTLY ${speedName(RANK[exactDodgeSpeed])}`
        : `NO SLOT REACHES ${speedName(requiredRank)} SPEED`;
    }
    return null;
  };
  const dodgeSlotReason = (slot: number): string | null => {
    if (me.slots[slot]) return `OCCUPIED BY ${BB_STAT_CARDS[me.slots[slot]!]?.name?.toUpperCase() ?? 'CARD'}`;
    if (!pick) return 'SELECT A DODGE CARD';
    if (attackCancelled) return 'ENEMY ATTACK CANCELLED';
    if (cannotDodge) return 'THIS ATTACK CANNOT BE DODGED';
    const rank = effectiveSlotRank(slot, pick.id);
    if (exactDodgeSpeed && rank !== (RANK[exactDodgeSpeed] ?? 0)) return `REQUIRES EXACTLY ${speedName(RANK[exactDodgeSpeed])}`;
    if (!exactDodgeSpeed && rank < requiredRank) return `${speedName(rank)} — NEEDS ${speedName(requiredRank)} OR FASTER`;
    return null;
  };
  const oldHunterBone = me.rewards.findIndex((reward) => (
    ((BB_ITEMS[reward.id]?.effects ?? {}) as { custom?: string }).custom === 'auto-dodge'
  ));
  const oldBoneReward = oldHunterBone >= 0 ? me.rewards[oldHunterBone] : null;
  const oldBoneReason = oldBoneReward?.exhausted ? 'EXHAUSTED' : cannotDodge ? 'THIS ATTACK CANNOT BE DODGED' : null;
  const reactionFirearmReason = (() => {
    if (!firearm) return 'NO FIREARM';
    if (me.firearmExhausted) return 'FIREARM EXHAUSTED';
    if (!combat?.enemyAction) return 'ENEMY ACTION NOT REVEALED';
    if (combat.bossUid != null) return 'BOSS ACTION';
    if (actionIsAbility) return 'REVEALED ACTION IS AN ABILITY';
    if (firearmFx.custom === 'stagger-basic') return combat.enemyAction.kind === 'basic' ? null : 'NOT A BASIC ATTACK';
    if (firearmFx.custom === 'degrade-attack') return null;
    return 'THIS FIREARM HAS NO REACTION';
  })();
  const modifierReason = (itemId: string, exhausted = false): string | null => {
    const item = BB_ITEMS[itemId];
    const fx = (item?.effects ?? {}) as { custom?: string; onKill?: boolean };
    if (exhausted) return 'EXHAUSTED';
    if (!hunterAttacking) return 'REQUIRES YOUR ATTACK';
    if (fx.onKill) return 'ON KILL ONLY';
    if (item?.timing !== 'On Attack') return 'WRONG TIMING';
    if ((fx.custom === 'combat-dmg1-stagger' || fx.custom === 'combat-stagger-ties') && !cardAttack) return 'REQUIRES A STAT-CARD ATTACK';
    return null;
  };
  const incomingDamage = pending.kind === 'combat-rider' ? pending.damage ?? 2
    : Math.max(0, enemyDamage + (me.frenzy ? 1 : 0) - (combat?.blockPending ?? 0));
  const incomingEffects = pending.kind === 'combat-rider'
    ? [pending.stun && 'STUN', pending.poison && 'POISON', pending.frenzy && 'FRENZY', pending.push && `PUSH ${pending.push}`].filter(Boolean).join(' + ')
    : [snapshot?.stagger && 'STAGGER', enemyAct?.text && bbIconText(enemyAct.text)].filter(Boolean).join(' · ');
  const phaseIndex = pending.kind === 'combat-attack' || pending.kind === 'combat-modifiers' ? 1
    : pending.kind === 'combat-reaction' ? 2
      : pending.kind === 'combat-dodge' ? 3 : 4;
  const phaseTitle = pending.kind === 'combat-attack' ? 'CHOOSE AN ATTACK'
    : pending.kind === 'combat-modifiers' ? 'BOOST YOUR ATTACK?'
      : pending.kind === 'combat-reaction' ? 'ENEMY ATTACK REVEALED'
        : pending.kind === 'combat-dodge' ? 'DODGE OR TAKE THE HIT'
          : 'DODGE THE SECONDARY HIT';
  const phaseInstruction = pending.kind === 'combat-attack'
    ? pick ? 'Now choose which open weapon slot performs the attack.' : 'Choose one card from your hand. You will pick its weapon slot next.'
    : pending.kind === 'combat-modifiers'
      ? 'Use one optional On Attack item, or reveal the enemy now.'
      : pending.kind === 'combat-reaction'
        ? 'Read what the enemy is doing. Use a legal firearm reaction, or continue.'
        : pending.kind === 'combat-dodge'
          ? pick ? 'Choose an open slot fast enough to Dodge.' : 'Choose a Dodge card, or accept the hit shown below.'
          : pick ? 'Choose an open slot fast enough to escape.' : 'Choose a Dodge card, or suffer this secondary effect.';
  const foeRows: { key: string; label: string; name: string; text: string; speed: string | null; damage: number; selected: boolean }[] = foeSide
    ? (['basic', 'special', 'ability'] as const).map((kind) => {
        const row = foeSide[kind];
        const selected = combat?.enemyAction?.kind === kind;
        return {
          key: kind, label: kind.toUpperCase(),
          name: selected && snapshot ? snapshot.name : row.name,
          text: selected && snapshot ? snapshot.text : row.text ?? '',
          speed: selected && snapshot ? snapshot.speed : row.speed,
          damage: selected && snapshot ? snapshot.damage : row.damage,
          selected,
        };
      })
    : boss && bossDef
      ? bossDef.phases[boss.phase - 1].map((row, index) => ({
          key: `boss-${index}`, label: `PHASE ${boss.phase} · CARD ${index + 1}`,
          name: combat?.enemyAction?.bossCardIx === index && snapshot ? snapshot.name : row.name,
          text: combat?.enemyAction?.bossCardIx === index && snapshot ? snapshot.text : row.text ?? '',
          speed: combat?.enemyAction?.bossCardIx === index && snapshot ? snapshot.speed : row.speed,
          damage: combat?.enemyAction?.bossCardIx === index && snapshot ? snapshot.damage : row.damage,
          selected: combat?.enemyAction?.bossCardIx === index,
        }))
      : [];

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, [pending.kind]);
  useEffect(() => () => {
    if (resolveTimer.current != null) window.clearTimeout(resolveTimer.current);
  }, []);
  const resolveExchange = (action: BbAction) => {
    if (resolving) return;
    setResolving(true);
    resolveTimer.current = window.setTimeout(() => {
      resolveTimer.current = null;
      act(action);
    }, 360);
  };
  const closeTutorial = () => {
    setTutorialOpen(false);
  };
  const beginExchange = () => {
    if (firstBattle && typeof window !== 'undefined') window.localStorage.setItem('bb-combat-tutorial-v2', 'complete');
    setFirstBattle(false);
    setEncounterOpen(false);
  };

  return (
    <div className={`bb-battle-overlay bb-battle-board-ui bb-battle-guided phase-${pending.kind}${resolving ? ' resolving' : ''}`}
      role="dialog" aria-modal="true" aria-labelledby="bb-battle-title" data-testid={`bb-prompt-${pending.kind}`}
      tabIndex={-1} ref={focusRef}>
      <div className="bb-battle-backdrop" aria-hidden="true" />

      <header className="bb-battle-topbar">
        <div className="bb-battle-foe-portrait" style={foeArt ? bbCellCss(manifest, foeArt.sheet, foeArt.cell) : undefined} aria-hidden="true" />
        <div className="bb-battle-foe-hud">
          <span className="bb-battle-kicker">{boss ? `NIGHTMARE · PHASE ${boss.phase}` : isRider ? 'SECONDARY TARGET' : 'ENEMY ATTACK'}</span>
          <strong>{foeName.toUpperCase()}</strong>
          {!isRider && <>
            <div className="bb-battle-hpbar enemy" role="meter" aria-label={`${foeName} health`}
              aria-valuemin={0} aria-valuemax={foeMaxHp} aria-valuenow={foeHp}>
              <span style={{ width: `${Math.max(0, Math.min(100, foeHp / Math.max(1, foeMaxHp) * 100))}%` }} />
            </div>
            <small>{foeHp} / {foeMaxHp} HP</small>
          </>}
        </div>
        <div className="bb-battle-phase-copy">
          <span>STEP {phaseIndex} OF 4</span>
          <strong id="bb-battle-title">{phaseTitle}</strong>
        </div>
        <button className="bb-btn ghost bb-battle-explain" data-testid="bb-explain-combat" onClick={() => setTutorialOpen(true)}>HOW COMBAT WORKS</button>
      </header>

      <main className="bb-battle-flow">
        <section className="bb-battle-scene" aria-label="Combatants">
          <div className="bb-battle-stage-wrap" aria-hidden="true">
            <Suspense fallback={<div className="bb-battle-stage-fallback" />}>
              <BbBattleStage hunterSlug={bbHunterMini(me.hunterId)}
                foeSlug={foe ? bbEnemyMini(foe.type) : boss ? bbBossMini(boss.type) : null}
                foeIsBoss={!!boss} phase={resolving ? 'resolving' : pending.kind} hunterAttacking={hunterAttacking} accent={hunterAccent} />
            </Suspense>
          </div>
          <div className="bb-battle-scene-message" aria-live="polite">
            <span>{pending.kind === 'combat-reaction' || pending.kind === 'combat-dodge' ? 'THE ENEMY REVEALS' : 'THE HUNT CLOSES IN'}</span>
            <strong>{enemyAct ? `${enemyAct.name} is coming.` : `${foeName} attacks you.`}</strong>
          </div>
          <div className="bb-battle-simple-exchange" aria-label="Current exchange">
            <div className="you" style={{ borderColor: hunterAccent }}>
              <span>YOU</span>
              <strong>{hunterAttacking ? (firearmAttack ? firearm?.name : committedSlot?.name) : 'No attack yet'}</strong>
              <small>{hunterAttacking
                ? `${speedMarks(hunterAttackRank)} · ${hunterAttackDamage}◆${committedStagger ? ' · Stagger' : ''}`
                : `${me.hp}/6 HP`}</small>
            </div>
            <b aria-hidden="true">VS</b>
            <div className="foe">
              <span>{foeName.toUpperCase()}</span>
              <strong>{enemyAct?.name ?? 'Hidden'}</strong>
              <small>{enemyAct
                ? (actionIsAbility ? 'Ability' : `${speedMarks(enemyRank)} · ${enemyDamage}◆`)
                : `${foeHp}/${foeMaxHp} HP`}</small>
            </div>
          </div>
        </section>

        <section className="bb-battle-decision" aria-label="Your current decision">
          <header>
            <span>STEP {phaseIndex} OF 4 · YOUR TURN</span>
            <h2>{phaseTitle}</h2>
            <p>{phaseInstruction}</p>
          </header>

          {pending.kind === 'combat-attack' && !pick && (
            <div className="bb-battle-decision-body">
              <h3>Choose one card</h3>
              <div className="bb-battle-card-row" aria-label="Stat cards available to attack">
                {me.hand.map((id, index) => {
                  const reason = openSlots.length ? null : 'No open weapon slot';
                  return <BbBattleStatCard key={`${id}:${index}`} manifest={manifest} id={id} selected={false}
                    disabled={!!reason} reason={reason} onClick={() => setPick({ id, index })}
                    testId={`bb-battle-hand-${index}`} />;
                })}
                {me.hand.length === 0 && <span className="bb-battle-empty-command">Your hand is empty.</span>}
              </div>
              <div className="bb-battle-alternatives">
                {firearm && <button className="bb-battle-text-choice" disabled={me.firearmExhausted || firearmFx.custom !== 'firearm-attack'}
                  onClick={() => act({ type: 'choose', firearm: true })}>
                  <strong>Fire {firearm.name}</strong>
                  <span>{me.firearmExhausted ? 'Unavailable — firearm exhausted' : firearmFx.custom !== 'firearm-attack' ? 'Unavailable — this firearm cannot attack' : 'Attack without committing a card'}</span>
                </button>}
                <button className="bb-battle-text-choice quiet" data-testid="bb-combat-pass" onClick={() => act({ type: 'choose', pass: true })}>
                  <strong>Brace instead</strong><span>Do not attack. Wait for the enemy reveal.</span>
                </button>
              </div>
            </div>
          )}

          {pending.kind === 'combat-attack' && pick && (
            <div className="bb-battle-decision-body">
              <div className="bb-battle-picked">
                <span>CHOSEN CARD</span><strong>{BB_STAT_CARDS[pick.id]?.name}</strong>
                <button onClick={() => setPick(null)}>CHANGE CARD</button>
              </div>
              <h3>Choose its attack slot</h3>
              <div className="bb-battle-slot-list">
                {weaponSide?.slots.map((slot, index) => {
                  const reason = me.slots[index] ? `Unavailable — occupied by ${BB_STAT_CARDS[me.slots[index]!]?.name ?? 'a card'}` : null;
                  return <button key={index} className="bb-battle-slot-command" disabled={!!reason}
                    onClick={() => { act({ type: 'choose', cardId: pick.id, slot: index }); setPick(null); }}>
                    <span>{slot.name}</span><strong>{speedMarks(RANK[slot.speed])} · {slot.damage} damage</strong>
                    <small>{reason ?? 'Use this attack'}</small>
                  </button>;
                })}
              </div>
            </div>
          )}

          {pending.kind === 'combat-modifiers' && (
            <div className="bb-battle-decision-body">
              <div className="bb-battle-current-action"><span>YOUR ATTACK</span><strong>{firearmAttack ? firearm?.name : committedSlot?.name ?? 'Brace'}</strong><p>The enemy action is still hidden.</p></div>
              {(me.consumables.length + me.rewards.length) > 0 && <>
                <h3>Optional gear</h3>
                <div className="bb-battle-item-grid" aria-label="On Attack gear">
                  {me.consumables.map((id, index) => {
                    const reason = modifierReason(id);
                    return <BbItemVisual key={`${id}:${index}`} manifest={manifest} itemId={id} kindLabel="CONSUMABLE"
                      disabled={!!reason} reason={reason ?? undefined} testId={`bb-modifier-consumable-${index}`}
                      onClick={() => act({ type: 'use_consumable', itemIx: index })} />;
                  })}
                  {me.rewards.map((reward, index) => {
                    const reason = modifierReason(reward.id, reward.exhausted);
                    return <BbItemVisual key={`${reward.id}:${index}`} manifest={manifest} itemId={reward.id}
                      kindLabel={BB_ITEMS[reward.id]?.kind.toUpperCase() ?? 'REWARD'} exhausted={reward.exhausted}
                      disabled={!!reason} reason={reason ?? undefined} testId={`bb-modifier-reward-${index}`}
                      onClick={() => act({ type: 'use_reward', rewardIx: index })} />;
                  })}
                </div>
              </>}
              <button className="bb-btn primary bb-battle-primary" data-testid="bb-modifiers-pass"
                onClick={() => act({ type: 'choose', pass: true })}>REVEAL THE ENEMY ATTACK</button>
            </div>
          )}

          {pending.kind === 'combat-reaction' && (
            <div className="bb-battle-decision-body">
              <div className="bb-battle-incoming">
                <span>{boss ? 'BOSS ACTION' : combat?.enemyAction?.kind?.toUpperCase()}</span>
                <strong>{enemyAct?.name ?? 'Unknown action'}</strong>
                <b>{actionIsAbility ? 'ABILITY' : `${speedMarks(enemyRank)} · ${enemyDamage} DAMAGE`}</b>
                <p>{bbIconText(enemyAct?.text ?? '') || 'No additional effect.'}</p>
              </div>
              {firearm && <button className="bb-battle-text-choice" disabled={!!reactionFirearmReason}
                data-testid="bb-reaction-firearm" onClick={() => act({ type: 'use_firearm' })}>
                <strong>React with {firearm.name}</strong><span>{reactionFirearmReason ? `Unavailable — ${reactionFirearmReason.toLowerCase()}` : 'Use the firearm before the Dodge step'}</span>
              </button>}
              <button className="bb-btn primary bb-battle-primary" data-testid="bb-reaction-pass"
                onClick={() => act({ type: 'choose', pass: true })}>{actionIsAbility ? 'RESOLVE THIS ABILITY' : 'CONTINUE TO DODGE'}</button>
            </div>
          )}

          {(pending.kind === 'combat-dodge' || pending.kind === 'combat-rider') && !pick && (
            <div className="bb-battle-decision-body">
              <div className="bb-battle-incoming compact">
                <span>INCOMING HIT</span>
                <strong>{attackCancelled ? 'The attack was cancelled' : `${incomingDamage} damage${incomingEffects ? ` + ${incomingEffects}` : ''}`}</strong>
                {!attackCancelled && <p>You need a Dodge card and an open slot at {speedName(requiredRank)} speed or faster.</p>}
              </div>
              <h3>Choose a Dodge card</h3>
              <div className="bb-battle-card-row" aria-label="Cards in hand and Dodge availability">
                {me.hand.map((id, index) => {
                  const reason = dodgeCardReason(id);
                  return <BbBattleStatCard key={`${id}:${index}`} manifest={manifest} id={id}
                    selected={false} disabled={!!reason} reason={reason}
                    onClick={() => setPick({ id, index })} testId={`bb-battle-dodge-${index}`} />;
                })}
                {me.hand.length === 0 && <span className="bb-battle-empty-command">Your hand is empty. You cannot Dodge.</span>}
              </div>
              {oldBoneReward && <button className="bb-battle-text-choice" disabled={!!oldBoneReason}
                data-testid="bb-dodge-old-hunter-bone" onClick={() => resolveExchange({ type: 'use_reward', rewardIx: oldHunterBone })}>
                <strong>Use Old Hunter Bone</strong><span>{oldBoneReason ? `Unavailable — ${oldBoneReason.toLowerCase()}` : 'Automatically Dodge this hit'}</span>
              </button>}
              <button className="bb-btn ghost danger bb-battle-take-hit" data-testid="bb-dodge-pass" onClick={() => resolveExchange({ type: 'choose', pass: true })}>
                {attackCancelled ? 'CONTINUE — NO DAMAGE' : `TAKE ${incomingDamage} DAMAGE${incomingEffects ? ` + ${incomingEffects}` : ''}`}
              </button>
            </div>
          )}

          {(pending.kind === 'combat-dodge' || pending.kind === 'combat-rider') && pick && (
            <div className="bb-battle-decision-body">
              <div className="bb-battle-picked"><span>CHOSEN DODGE CARD</span><strong>{BB_STAT_CARDS[pick.id]?.name}</strong><button onClick={() => setPick(null)}>CHANGE CARD</button></div>
              <h3>Choose a fast-enough slot</h3>
              <div className="bb-battle-slot-list">
                {weaponSide?.slots.map((slot, index) => {
                  const reason = dodgeSlotReason(index);
                  const rank = effectiveSlotRank(index, pick.id);
                  return <button key={index} className="bb-battle-slot-command dodge" disabled={!!reason}
                    onClick={() => { resolveExchange({ type: 'choose', cardId: pick.id, slot: index }); setPick(null); }}>
                    <span>{slot.name}</span><strong>{speedMarks(rank)} · Dodge</strong><small>{reason ? `Unavailable — ${reason.toLowerCase()}` : 'Dodge with this slot'}</small>
                  </button>;
                })}
              </div>
              <button className="bb-btn ghost danger bb-battle-take-hit" data-testid="bb-dodge-pass" onClick={() => resolveExchange({ type: 'choose', pass: true })}>
                {attackCancelled ? 'CONTINUE — NO DAMAGE' : `CANCEL DODGE · TAKE ${incomingDamage} DAMAGE`}
              </button>
            </div>
          )}
        </section>
      </main>

      <details className="bb-battle-details">
        <summary>SHOW COMBAT DETAILS</summary>
        <div className="bb-battle-details-grid">
          <section><h3>Hunter</h3><p>{bbHunterName(me.hunterId)} · {me.hp}/6 HP · {me.echoes}/3 Echoes</p><p>Firearm: {firearm?.name ?? 'None'} ({me.firearmExhausted ? 'spent' : 'ready'}) · Block: {combat?.blockPending ?? 0}</p><p>Hand / deck / discard: {me.hand.length} / {me.deckCount} / {me.discard.length}</p></section>
          <section><h3>Weapon slots</h3>{weaponSide?.slots.map((slot, index) => <p key={index}><b>{slot.name}</b> — {speedName(RANK[slot.speed])}, {slot.damage} damage · {me.slots[index] ? `occupied by ${BB_STAT_CARDS[me.slots[index]!]?.name}` : 'open'}</p>)}</section>
          <section><h3>Enemy deck</h3>{boss ? <p>{boss.actionsLeft} boss cards remain.</p> : <p>{view.enemyActionsLeft.basic} Basic · {view.enemyActionsLeft.special} Special · {view.enemyActionsLeft.ability} Ability remain.</p>}{foeRows.map((row) => <p key={row.key}><b>{row.label}: {row.name}</b> — {row.speed ? `${speedName(RANK[row.speed])}, ${row.damage} damage` : 'Ability'}. {bbIconText(row.text) || 'No extra effect.'}</p>)}</section>
          <section><h3>Resolution rules</h3><p>Fast resolves before Medium, then Slow. Equal speeds resolve together.</p><p>Stagger cancels only a slower opposing attack. Block reduces incoming damage.</p><p>Committed cards fill weapon slots until an effect clears them or you transform.</p></section>
        </div>
      </details>

      {encounterOpen && (
        <section className="bb-combat-intro" role="dialog" aria-modal="true" aria-labelledby="bb-combat-intro-title">
          <div className="bb-combat-intro-card">
            <span>{boss ? 'A NIGHTMARE STIRS' : 'ENEMY ATTACK'}</span>
            <h2 id="bb-combat-intro-title">{foeName} attacks!</h2>
            <p>One step at a time.</p>
            {firstBattle && <ol>
              <li><b>1</b><span>Choose your attack.</span></li>
              <li><b>2</b><span>See the enemy's move.</span></li>
              <li><b>3</b><span>Dodge — or take the hit.</span></li>
              <li><b>4</b><span>The faster attack lands first.</span></li>
            </ol>}
            <button className="bb-btn primary" data-testid="bb-combat-begin" onClick={beginExchange}>BEGIN</button>
          </div>
        </section>
      )}

      {tutorialOpen && (
        <section className="bb-combat-tutorial" role="dialog" aria-modal="true" aria-labelledby="bb-combat-tutorial-title">
          <div className="bb-combat-tutorial-card">
            <span>COMBAT · 4 STEPS</span>
            <h2 id="bb-combat-tutorial-title">One step at a time</h2>
            <ol>
              <li><b>1 · ATTACK</b><p>Pick a card, then a weapon slot. The slot sets speed and damage.</p></li>
              <li><b>2 · REVEAL</b><p>Add On Attack gear, then see the enemy's move.</p></li>
              <li><b>3 · DODGE</b><p>Needs an open slot as fast as the attack.</p></li>
              <li><b>4 · RESOLVE</b><p>The faster attack lands first. Equal speed lands together.</p></li>
            </ol>
            <p className="bb-combat-tutorial-note">Filled slots are locked. Stagger cancels a slower attack. Block cuts damage.</p>
            <button className="bb-btn primary" data-testid="bb-tutorial-continue" onClick={closeTutorial}>BACK</button>
          </div>
        </section>
      )}
      <div className="bb-battle-resolve-flash" aria-live="assertive" aria-hidden={!resolving}><span>RESOLVING EXCHANGE</span></div>
    </div>
  );
}

function BbPrompt({ view, seat, act, pending, manifest, roundDiscard, setRoundDiscard }: {
  view: BbView; seat: number; act: (a: BbAction) => void; pending: BbPending;
  manifest: ReturnType<typeof useBbManifest>;
  roundDiscard: string[]; setRoundDiscard: (v: string[]) => void;
}) {
  const me = view.hunters[seat];
  const [pick, setPick] = useState<{ id: string; index: number } | null>(null);

  if (pending.kind === 'combat-attack' || pending.kind === 'combat-modifiers' || pending.kind === 'combat-reaction'
    || pending.kind === 'combat-dodge' || pending.kind === 'combat-rider') {
    return <BbBattlePromptBoard view={view} seat={seat} act={act} pending={pending} manifest={manifest}
      pick={pick} setPick={setPick} />;
  }

  const title = pending.kind === 'discard-for-stun' ? 'STUNNED · DISCARD A CARD'
            : pending.kind === 'dream-upgrades' ? `THE HUNTER'S DREAM · CHOOSE AN UPGRADE (${pending.picks} LEFT)`
              : pending.kind === 'dream-incorporate' ? 'ADD THE UPGRADE TO YOUR DECK?'
                : pending.kind === 'return-placement' ? 'RETURN TO THE WAKING WORLD'
                  : pending.kind === 'tile-orientation' ? 'CHOOSE WHICH EXIT CONNECTS'
                    : pending.kind === 'reward-overflow' ? 'YOU CARRY TOO MANY · GIVE ONE AWAY?'
                      : pending.kind === 'mission-choice' ? 'THE MISSION DEMANDS A CHOICE'
                        : pending.kind === 'round-refresh' ? 'NEW ROUND · DISCARD ANY, THEN DRAW TO 3'
                          : pending.kind === 'onkill-reward' ? 'THE KILL FEEDS YOUR GEAR'
                            : 'DECIDE';

  return (
    <BbDialog key={pending.kind} label={title} testId={`bb-prompt-${pending.kind}`} focusKey={pending.kind}>
        <div className="ig-lab">{title}</div>

        {pending.kind === 'discard-for-stun' && (
          <div className="bb-hand small">
            {me.hand.map((id, i) => (
              <button key={i} className="bb-card" onClick={() => act({ type: 'choose', cardId: id })}>
                <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
                <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
              </button>
            ))}
          </div>
        )}

        {pending.kind === 'dream-upgrades' && (
          <div className="bb-hand small">
            {view.upgradeRow.map((id, i) => (
              <button key={i} className="bb-card big" data-testid={`bb-upgrade-${i}`}
                onClick={() => act({ type: 'choose', upgradeId: id })}
                title={bbIconText(BB_STAT_CARDS[id]?.text)}>
                <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
                <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
              </button>
            ))}
          </div>
        )}

        {pending.kind === 'dream-incorporate' && (
          <>
            <div className="bb-head-note">SWAP A CARD OUT FOR {(BB_STAT_CARDS[pending.upgradeId]?.name ?? '').toUpperCase()} · DECK STAYS 12</div>
            <div className="bb-hand small">
              {me.deckCount > 0 && deckList(view, seat).map((id, i) => (
                <button key={`${id}${i}`} className="bb-card" onClick={() => act({ type: 'choose', swapOut: id })}>
                  <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
                  <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
                </button>
              ))}
            </div>
            <button className="bb-btn ghost" onClick={() => act({ type: 'choose', discard: true })}>DISCARD THE UPGRADE</button>
          </>
        )}

        {pending.kind === 'return-placement' && (
          <ReturnPlacement view={view} seat={seat} act={act} manifest={manifest} />
        )}

        {pending.kind === 'tile-orientation' && (
          <>
            <p className="bb-orientation-rule">Pick which <strong>exit</strong> connects to the space you left.</p>
            <div className="bb-rot-pick">
              {pending.options.map((rot) => (
                <button key={rot} className="bb-rot" data-testid={`bb-rot-${rot}`} onClick={() => act({ type: 'choose', rot })}>
                  <img src={bbTileArt(pending.tileId)} style={{ transform: `rotate(${rot * 90}deg)` }} alt={`legal tile placement ${rot + 1}`} />
                  <span>CONNECT THIS EXIT</span>
                </button>
              ))}
            </div>
          </>
        )}

        {pending.kind === 'reward-overflow' && (
          <>
            {view.hunters.filter((h) => h.seat !== seat).map((h) => (
              <button key={h.seat} className="bb-btn" onClick={() => act({ type: 'choose', giveTo: h.seat })}>
                GIVE TO {bbHunterName(h.hunterId).toUpperCase()}
              </button>
            ))}
            <button className="bb-btn ghost" onClick={() => act({ type: 'choose', giveTo: null })}>SET IT ASIDE</button>
          </>
        )}

        {pending.kind === 'mission-choice' && (
          <>
            {pending.options.map((o) => (
              <button key={o} className="bb-btn" data-testid="bb-mission-option" onClick={() => act({ type: 'choose', option: o })}>{o}</button>
            ))}
          </>
        )}

        {pending.kind === 'onkill-reward' && (
          <>
            <div className="bb-head-note">
              USE {BB_ITEMS[me.rewards[pending.rewardIx]?.id]?.name.toUpperCase()}? {bbIconText(BB_ITEMS[me.rewards[pending.rewardIx]?.id]?.text)}
            </div>
            <button className="bb-btn primary" onClick={() => act({ type: 'choose', use: true })}>USE IT</button>
            <button className="bb-btn ghost" onClick={() => act({ type: 'choose', use: false })}>SAVE IT</button>
          </>
        )}

        {pending.kind === 'round-refresh' && (
          <>
            <div className="bb-hand small">
              {me.hand.map((id, i) => (
                <button key={i} className={'bb-card' + (roundDiscard.includes(`${i}`) ? ' sel' : '')}
                  aria-pressed={roundDiscard.includes(`${i}`)}
                  onClick={() => setRoundDiscard(roundDiscard.includes(`${i}`) ? roundDiscard.filter((x) => x !== `${i}`) : [...roundDiscard, `${i}`])}>
                  <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
                  <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
                </button>
              ))}
            </div>
            <button className="bb-btn primary" data-testid="bb-refresh-confirm" onClick={() => {
              act({ type: 'round_refresh', discard: roundDiscard.map((i) => me.hand[+i]) });
              setRoundDiscard([]);
            }}>KEEP {me.hand.length - roundDiscard.length} · DRAW TO 3</button>
          </>
        )}
    </BbDialog>
  );
}

/** deck contents are hidden order-wise but composition is co-op-public: show
 * unique ids so incorporate has real choices (the engine validates). */
function deckList(view: BbView, seat: number): string[] {
  // co-op game: the engine keeps order secret; composition arrives via hand +
  // discard + slots not being enough, so approximate with basic cards + known
  // upgrades. The reducer rejects anything not actually in the deck.
  const me = view.hunters[seat];
  const visible = [...me.hand, ...me.discard, ...me.slots.filter((x): x is string => !!x)];
  const all = ['basic-endurance', 'basic-skill', 'basic-strength', 'basic-vitality'];
  const counts = new Map<string, number>();
  for (const v of visible) counts.set(v, (counts.get(v) ?? 0) + 1);
  const out: string[] = [];
  for (const id of all) {
    const inDeck = 3 - (counts.get(id) ?? 0);
    for (let i = 0; i < Math.max(0, inDeck); i++) out.push(id);
  }
  return out.length ? out : all;
}

function SwapDiscardPicker({ me, manifest, onPick, onCancel }: {
  me: BbView['hunters'][number]; manifest: ReturnType<typeof useBbManifest>;
  onPick: (discardId: string, retrieveId: string) => void; onCancel: () => void;
}) {
  const [give, setGive] = useState<string | null>(null);
  return (
    <BbDialog label={give ? 'Return a card from your discard' : 'Discard a card from your hand'} onClose={onCancel}>
        <div className="ig-lab">{give ? 'RETURN A CARD FROM YOUR DISCARD' : 'DISCARD A CARD FROM YOUR HAND'}</div>
        <div className="bb-hand small">
          {(give ? me.discard : me.hand).map((id, i) => (
            <button key={`${id}${i}`} className="bb-card"
              onClick={() => (give ? onPick(give, id) : setGive(id))}>
              <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
              <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
            </button>
          ))}
        </div>
        <button className="bb-btn ghost" onClick={onCancel}>CANCEL</button>
    </BbDialog>
  );
}

function ReturnPlacement({ view, seat, act, manifest }: {
  view: BbView; seat: number; act: (a: BbAction) => void; manifest: ReturnType<typeof useBbManifest>;
}) {
  const me = view.hunters[seat];
  const [side, setSide] = useState<0 | 1>(0);
  const hunterDef = me.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const weaponCell = (hunterDef?.art as { weaponCell?: number } | undefined)?.weaponCell ?? 0;
  const lamps: { ref: string; label: string }[] = [];
  for (const t of view.tiles) {
    const def = BB_TILES[t.tileId];
    for (const sp of def?.spaces ?? []) {
      if (!sp.icons.includes('lamp')) continue;
      const ref = `${t.uid}:${sp.id}`;
      if (view.brokenLamps.includes(ref)) continue;
      lamps.push({ ref, label: (sp.named ?? def.name ?? 'LAMP').toUpperCase() });
    }
  }
  return (
    <>
      <div className="bb-side-toggle">
        {[0, 1].map((s) => (
          <button key={s} className={'bb-rot' + (side === s ? ' sel' : '')} aria-pressed={side === s}
            onClick={() => setSide(s as 0 | 1)}>
            <div className="bb-pick-art" style={bbCellCss(manifest, 'sheet-2', weaponCell, s === 1)} />
            <span className="bb-card-name">{hunterDef?.sides[s]?.label?.toUpperCase()}</span>
          </button>
        ))}
      </div>
      {lamps.map((l) => (
        <button key={l.ref} className="bb-btn" data-testid="bb-lamp" onClick={() => act({ type: 'choose', side, space: l.ref })}>
          WAKE AT {l.label}
        </button>
      ))}
    </>
  );
}

// ---------- the Hunter's Dream hunt board ----------

// Live-state footprints on the mod's hunt board art (percent of the 4000x4016
// sheet). Track dot positions were solved against the printed reset dots.
const HB_GEO = {
  enemies: { lefts: [4.0, 38.6, 72.5], top: 9.4, width: 22.0, height: 39.4 },
  upgrades: { lefts: [31.3, 48.2, 65.1, 82.0], top: 63.2, width: 13.9, height: 22.5 },
  chapter: { left: 3.4, top: 54.6, width: 24.4, height: 32.4 },
  track: { x0: 7.0, dx: 5.726, y: 93.6 },
};

function BbHuntBoard({ view, manifest, onZoom, compact = false, testId = 'bb-huntboard' }: {
  view: BbView;
  manifest: ReturnType<typeof useBbManifest>;
  onZoom: (zoom: { sheet: string; cell: number; back?: boolean; title?: string }) => void;
  compact?: boolean;
  testId?: string;
}) {
  const board = manifest?.huntBoard.face?.rel;
  return (
    <div className={'bb-huntboard' + (compact ? ' compact' : '')} data-testid={testId} aria-label="The Hunter's Dream hunt board"
      style={board ? { backgroundImage: `url(${board})` } : undefined}>
      {view.enemySlots.map((type, i) => {
        const def = type ? BB_ENEMIES[type] : null;
        const spot: React.CSSProperties = {
          left: `${HB_GEO.enemies.lefts[i]}%`, top: `${HB_GEO.enemies.top}%`,
          width: `${HB_GEO.enemies.width}%`, height: `${HB_GEO.enemies.height}%`,
        };
        if (!def?.art) return (
          <div key={i} className="bb-hb-slot" style={spot} role="img" aria-label={`Enemy slot ${i + 1} is empty`} />
        );
        const contents = <>
          <span className="bb-hb-art" style={bbCellCss(manifest, def.art.sheet, def.art.cell)} aria-hidden="true" />
          <span className="bb-hb-name">{def.name.toUpperCase()}</span>
        </>;
        return compact ? (
          <span key={i} className="bb-hb-slot filled" style={spot} aria-label={`Enemy slot ${i + 1}: ${def.name}`}>{contents}</span>
        ) : (
          <button key={i} className="bb-hb-slot filled" style={spot}
            aria-label={`Enemy slot ${i + 1}: ${def.name}`}
            onClick={() => onZoom({ sheet: def.art.sheet, cell: def.art.cell, title: def.name })}>{contents}</button>
        );
      })}
      {view.upgradeRow.map((id, i) => {
        const card = BB_STAT_CARDS[id];
        const spot: React.CSSProperties = {
          left: `${HB_GEO.upgrades.lefts[i]}%`, top: `${HB_GEO.upgrades.top}%`,
          width: `${HB_GEO.upgrades.width}%`, height: `${HB_GEO.upgrades.height}%`,
        };
        if (!card) return null;
        const contents = <>
          <span className="bb-hb-art" style={bbCellCss(manifest, card.art.sheet, card.art.cell)} aria-hidden="true" />
          <span className="bb-hb-name">{card.name.toUpperCase()}</span>
        </>;
        return compact ? (
          <span key={`${id}${i}`} className="bb-hb-slot filled" style={spot} aria-label={`Upgrade for sale: ${card.name}`}>{contents}</span>
        ) : (
          <button key={`${id}${i}`} className="bb-hb-slot filled" style={spot}
            aria-label={`Upgrade for sale: ${card.name}`}
            onClick={() => onZoom({ sheet: card.art.sheet, cell: card.art.cell, title: card.name })}>{contents}</button>
        );
      })}
      <span className="bb-hb-chapter"
        style={{ left: `${HB_GEO.chapter.left + HB_GEO.chapter.width / 2}%`, top: `${HB_GEO.chapter.top + HB_GEO.chapter.height - 3.2}%` }}>
        CHAPTER {view.chapter}
      </span>
      <span className="bb-hb-marker"
        style={{ left: `${HB_GEO.track.x0 + view.huntTrack * HB_GEO.track.dx}%`, top: `${HB_GEO.track.y}%` }}
        role="img" aria-label={`Hunt track at ${view.huntTrack + 1} of ${view.huntTrackLength}`} />
    </div>
  );
}

// ---------- the 2D map ----------

/** A miniature portrait standing on the map: rendered model when available,
 * the classic disc token while it loads or when WebGL is out. */
function BbMapMini({ slug, height, ring, ringR, fallbackR, fallbackText, me: isMe }: {
  slug: string | null;
  height: number;
  ring: string;
  ringR: number;
  fallbackR: number;
  fallbackText: string;
  me?: boolean;
}) {
  const thumb = useBbMiniThumb(slug);
  if (!thumb) {
    return (
      <>
        <circle r={fallbackR} fill="#0d0d10" stroke={ring} strokeWidth={0.22} />
        <text textAnchor="middle" dy={0.32} fill="#e8e8ee" fontSize={fallbackR * 1.1}>{fallbackText}</text>
      </>
    );
  }
  return (
    <>
      <ellipse cy={0.12} rx={ringR} ry={ringR * 0.42} className={'bb-map-base' + (isMe ? ' me' : '')}
        style={{ stroke: ring, fill: 'rgba(8, 9, 12, .55)' }} />
      <image href={thumb} x={-height / 2} y={-height + 0.2} width={height} height={height}
        preserveAspectRatio="xMidYMax meet" />
    </>
  );
}

function BbMap({ view, seat, moving, enemyTargeting, onSpace, onExit, onEnemy }: {
  view: BbView; seat: number; moving: boolean; enemyTargeting: boolean;
  onSpace: (ref: string) => void;
  onExit: (uid: number, edge: BbEdgeT) => void;
  onEnemy: (uid: number, isBoss: boolean) => void;
}) {
  const me = view.hunters[seat];
  const bounds = useMemo(() => {
    if (!view.tiles.length) return { x0: -6, z0: -6, w: 12, h: 12 };
    const xs = view.tiles.map((t) => t.x * BB_TILE_W);
    const zs = view.tiles.map((t) => t.y * BB_TILE_W);
    const x0 = Math.min(...xs) - BB_TILE_W * 0.75;
    const z0 = Math.min(...zs) - BB_TILE_W * 0.75;
    return { x0, z0, w: Math.max(...xs) - x0 + BB_TILE_W * 0.75, h: Math.max(...zs) - z0 + BB_TILE_W * 0.75 };
  }, [view.tiles]);
  const nbs = moving && me.space ? bbNeighbors(view, me.space) : [];
  const exits = moving ? bbOpenExits(view) : [];
  const myExitHere = me.space ? exits.filter((e) => `${e.uid}:${e.space}` === me.space) : [];
  const hunterWorld = me.space ? bbSpaceWorld(view, me.space) : null;
  const markerScale = Math.max(.9, Math.min(1.55, Math.max(bounds.w, bounds.h) / 34));
  const exitAngle: Record<BbEdgeT, number> = { N: -90, E: 0, S: 90, W: 180 };

  return (
    <svg className="bb-map" viewBox={`${bounds.x0} ${bounds.z0} ${bounds.w} ${bounds.h}`} data-testid="bb-map-svg"
      aria-label={moving ? 'Hunt map. Choose a highlighted destination.' : 'Hunt map showing tiles, hunters, and enemies.'}>
      {view.tiles.map((t) => (
        <g key={t.uid} transform={`translate(${t.x * BB_TILE_W},${t.y * BB_TILE_W}) rotate(${t.rot * 90})`}>
          <image href={bbTileArt(t.tileId)} x={-BB_TILE_W / 2} y={-BB_TILE_W / 2} width={BB_TILE_W} height={BB_TILE_W} />
          {view.fogGates.includes(t.uid) && (
            <rect x={-BB_TILE_W / 2} y={-BB_TILE_W / 2} width={BB_TILE_W} height={BB_TILE_W} fill="#7f95b8" opacity={0.3} />
          )}
        </g>
      ))}
      {/* spaces */}
      {view.tiles.flatMap((t) => bbTileSpacesWorld(view, t.uid)).map((sp) => {
        const isNb = nbs.includes(sp.ref);
        const angle = hunterWorld ? Math.atan2(sp.z - hunterWorld[1], sp.x - hunterWorld[0]) * 180 / Math.PI : 0;
        return (
          <g key={sp.ref} className={'bb-map-space' + (isNb ? ' step' : '')}
            role={isNb ? 'button' : undefined} tabIndex={isNb ? 0 : undefined}
            aria-label={isNb ? `Move to space ${sp.ref}` : undefined}
            onKeyDown={(event) => {
              if (isNb && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSpace(sp.ref);
              }
            }}
            onClick={() => isNb && onSpace(sp.ref)}>
            <circle cx={sp.x} cy={sp.z} r={isNb ? 1.38 * markerScale : 0.56}
              className="bb-map-space-hit" data-testid={isNb ? 'bb-step-target' : undefined} />
            {isNb && (
              <>
                <g className="bb-map-move-marker" transform={`translate(${sp.x},${sp.z}) scale(${markerScale})`}>
                  <circle r={0.72} className="bb-map-space-marker" />
                  <path className="bb-map-step-glyph" transform={`rotate(${angle})`}
                    d="M-.42 -.34 L.42 0 L-.42 .34 L-.19 0 Z" />
                </g>
                <text className="bb-map-step-label" x={sp.x} y={sp.z + 1.18 * markerScale} textAnchor="middle">MOVE HERE</text>
              </>
            )}
          </g>
        );
      })}
      {/* open exits from my space */}
      {myExitHere.map((e, i) => (
        <g key={i} className="bb-map-exit" data-testid="bb-reveal-exit" role="button" tabIndex={0}
          aria-label={`Reveal the ${e.edge} exit`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onExit(e.uid, e.edge);
            }
          }} onClick={() => onExit(e.uid, e.edge)}
          transform={`translate(${e.x},${e.z})`}>
          <circle className="bb-map-exit-hit" r={1.42 * markerScale} />
          <g transform={`scale(${markerScale})`}>
            <circle className="bb-map-exit-marker" r={0.76} />
            <path className="bb-map-reveal-glyph" transform={`rotate(${exitAngle[e.edge]})`}
              d="M-.34 -.42 L.42 0 L-.34 .42 M-.08 -.42 L.68 0 L-.08 .42" />
            <text className="bb-map-exit-edge" textAnchor="middle" y={-.92}>{e.edge}</text>
          </g>
          <text className="bb-map-exit-label" textAnchor="middle" y={1.28 * markerScale}>REVEAL TILE</text>
        </g>
      ))}
      {/* consumable tokens */}
      {view.consumableTokens.map((ref) => {
        const w = bbSpaceWorld(view, ref);
        return w ? <circle key={`c${ref}`} cx={w[0] + 1.6} cy={w[1] + 1.4} r={0.7} className="bb-map-consumable" /> : null;
      })}
      {/* enemies */}
      {view.enemies.map((e) => {
        const w = bbSpaceWorld(view, e.space);
        if (!w) return null;
        return (
          <g key={e.uid} className={'bb-map-enemy' + (enemyTargeting ? ' target' : '')}
            role={enemyTargeting ? 'button' : undefined} tabIndex={enemyTargeting ? 0 : undefined}
            aria-label={enemyTargeting ? `Target ${bbEnemyName(e.type)}, ${e.damage} damage` : undefined}
            onKeyDown={(event) => {
              if (enemyTargeting && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onEnemy(e.uid, false);
              }
            }} onClick={() => onEnemy(e.uid, false)} transform={`translate(${w[0]},${w[1] - 1.2})`}>
            <circle r={1.3} className="bb-map-hit" />
            <BbMapMini slug={bbEnemyMini(e.type)} height={2.5} ring="#bf626e" ringR={0.85}
              fallbackR={1.15} fallbackText={bbEnemyName(e.type).slice(0, 2).toUpperCase()} />
            {enemyTargeting && <>
              <circle r={1.52} className="bb-map-target-reticle" />
              <path className="bb-map-target-cross" d="M-1.8 0h.55 M1.25 0h.55 M0-1.8v.55 M0 1.25v.55" />
              <text className="bb-map-target-label" textAnchor="middle" y={2}>TARGET</text>
            </>}
            {e.damage > 0 && <text className="bb-map-dmg" textAnchor="middle" dy={-2.7}>{e.damage}</text>}
          </g>
        );
      })}
      {view.bosses.map((b) => {
        const w = bbSpaceWorld(view, b.space);
        if (!w) return null;
        return (
          <g key={b.uid} className={'bb-map-boss' + (enemyTargeting ? ' target' : '')}
            role={enemyTargeting ? 'button' : undefined} tabIndex={enemyTargeting ? 0 : undefined}
            aria-label={enemyTargeting ? `Target ${bbBossName(b.type)}, phase ${b.phase}, ${b.damage} damage` : undefined}
            onKeyDown={(event) => {
              if (enemyTargeting && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onEnemy(b.uid, true);
              }
            }} onClick={() => onEnemy(b.uid, true)} transform={`translate(${w[0]},${w[1] - 1.2})`}>
            <circle r={1.8} className="bb-map-hit" />
            <BbMapMini slug={bbBossMini(b.type)} height={3.4} ring="#e1564e" ringR={1.15}
              fallbackR={1.6} fallbackText={`P${b.phase}`} />
            {enemyTargeting && <>
              <circle r={2.02} className="bb-map-target-reticle boss" />
              <path className="bb-map-target-cross" d="M-2.35 0h.65 M1.7 0h.65 M0-2.35v.65 M0 1.7v.65" />
              <text className="bb-map-target-label" textAnchor="middle" y={2.55}>TARGET BOSS</text>
            </>}
            <text className="bb-map-dmg" textAnchor="middle" dy={-3.6}>{b.damage}</text>
          </g>
        );
      })}
      {/* hunters */}
      {view.hunters.map((h) => {
        if (!h.space) return null;
        const w = bbSpaceWorld(view, h.space);
        if (!w) return null;
        const hex = BB_SEAT_HEX[String(view.seats[h.seat]?.color)] ?? '#ccc';
        return (
          <g key={h.seat} transform={`translate(${w[0] + (h.seat - 1.5) * 0.9},${w[1] + 1.2})`}>
            <BbMapMini slug={bbHunterMini(h.hunterId)} height={h.seat === seat ? 2.8 : 2.4}
              ring={hex} ringR={h.seat === seat ? 0.85 : 0.7} me={h.seat === seat}
              fallbackR={h.seat === seat ? 0.75 : 0.6} fallbackText={`${h.seat + 1}`} />
          </g>
        );
      })}
    </svg>
  );
}
