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
import './bb.css';

const RANK: Record<string, number> = { fast: 3, medium: 2, slow: 1 };
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
  const [zoomCard, setZoomCard] = useState<{ sheet: string; cell: number; back?: boolean; title?: string } | null>(null);

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
              <button key={h.id} data-testid={`bb-pick-${h.id}`}
                className={'bb-pick-card' + (taken ? ' taken' : '') + (mine ? ' mine' : '')}
                disabled={taken || !!me.hunterId}
                onClick={() => act({ type: 'pick_hunter', hunterId: h.id, side: startSide })}>
                <div className="bb-pick-art" style={bbCellCss(manifest, 'sheet-2', (h.art as { weaponCell?: number }).weaponCell ?? 0, startSide === 1)} />
                <span className="bb-pick-name">{h.name.toUpperCase()}</span>
                {h.set !== 'core' && <span className="bb-pick-tag">EXPANSION</span>}
                {taken && !mine && <span className="bb-pick-tag">TAKEN</span>}
                {mine && <span className="bb-pick-tag">YOURS</span>}
              </button>
            );
          })}
        </div>
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
          : `${bbHunterName(activeHunter?.hunterId ?? '').toUpperCase()} IS HUNTING`;
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
        {/* left: the map */}
        <section className="bb-map-wrap ig-glass" data-testid="bb-map" aria-labelledby="bb-map-title">
          <div className="bb-map-kicker">
            <span id="bb-map-title">HUNT MAP</span>
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
          {view.specialRules.length > 0 && (
            <div className="bb-special-chips rules">
              {view.specialRules.slice(0, 4).map((r) => (
                <button key={r} className="bb-chip" onClick={() => setShowMissions(true)}>RULE {r}</button>
              ))}
            </div>
          )}
        </section>

        {/* right: dashboard + hand */}
        <aside className="bb-rail" aria-label="Hunter dashboard">
          {!view.combat && (
            <Suspense fallback={
              <section className="bb-hunter-viewer bb-hunter-viewer--loading ig-glass"
                style={{ '--bb-hunter-accent': hunterAccent } as React.CSSProperties}
                aria-label={`${bbHunterName(me.hunterId)} miniature loading`} aria-busy="true">
                <div className="bb-hunter-viewer-head">
                  <span>HUNTER'S PRESENCE</span>
                  <span>SUMMONING MINIATURE</span>
                </div>
                <div className="bb-hunter-viewer-fallback" aria-hidden="true">
                  <span className="bb-hunter-viewer-silhouette" />
                </div>
                <span className="bb-hunter-viewer-name" aria-hidden="true">
                  {bbHunterName(me.hunterId).toUpperCase()}
                </span>
              </section>
            }>
              <BbHunterViewer hunterId={me.hunterId} hunterName={bbHunterName(me.hunterId)} accent={hunterAccent} />
            </Suspense>
          )}

          <section className="bb-weapon ig-glass" data-testid="bb-weapon" aria-labelledby="bb-weapon-title">
            <div className="bb-weapon-visual">
              <div className="bb-section-head">
                <span id="bb-weapon-title">TRICK WEAPON</span>
                <span>{weaponSide?.label?.toUpperCase()}</span>
              </div>
              <button className="bb-weapon-art" style={bbCellCss(manifest, 'sheet-2', weaponCell, me.weaponSide === 1)}
                aria-label={`Enlarge ${weaponSide?.label ?? 'weapon'} card`}
                onClick={() => setZoomCard({ sheet: 'sheet-2', cell: weaponCell, back: me.weaponSide === 1, title: weaponSide?.label })} />
            </div>
            <div className="bb-slots">
              {weaponSide?.slots.map((sl, i) => (
                <div key={i} className={'bb-slot bb-slot-visual' + (me.slots[i] ? ' filled' : '')} data-testid={`bb-slot-${i}`}>
                  <div className="bb-slot-rules">
                    <span className="bb-slot-name">{sl.name.toUpperCase()}</span>
                    <span className="bb-slot-meta">{'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦</span>
                  </div>
                  {me.slots[i]
                    ? <div className="bb-slot-card-art" role="img" aria-label={`${cardName(me.slots[i]!)} occupying ${sl.name}`}
                        style={cardArt(me.slots[i]!)}>
                        <span>{cardName(me.slots[i]!).toUpperCase()}</span>
                      </div>
                    : <div className="bb-slot-empty" aria-label={`${sl.name} is empty`}><span aria-hidden="true">◇</span></div>}
                </div>
              ))}
            </div>
          </section>

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
              <button key={`${id}${i}`} className={'bb-card' + (selCard?.index === i ? ' sel' : '')}
                data-testid={`bb-hand-${i}`}
                aria-pressed={selCard?.index === i}
                onClick={() => setSelCard(selCard?.index === i ? null : { id, index: i })}>
                <div className="bb-card-art" style={cardArt(id)} />
                <span className="bb-card-name">{cardName(id).toUpperCase()}</span>
              </button>
            ))}
            {me.hand.length === 0 && <span className="bb-empty-state">NO CARDS IN HAND</span>}
          </div>

          {/* action bar for the selected card */}
          {selCard && canAct && (
            <div className="bb-actions ig-glass" data-testid="bb-actions">
              {actionsFor(selCard.id).map((a) => (
                <button key={a.label} className="bb-btn" data-testid={a.testid} disabled={!!a.why}
                  onClick={a.run}>
                  {a.label}{a.why ? ` · ${a.why}` : ''}
                </button>
              ))}
            </div>
          )}
          {selCard && !canAct && !myPending && (
            <div className="bb-actions ig-glass"><span className="bb-head-note">
              {moving ? 'FINISH YOUR MOVE FIRST' : myTurn ? 'RESOLVE THE PROMPT FIRST' : 'NOT YOUR TURN'}
            </span></div>
          )}
        </aside>
      </div>

      {/* ---------- prompts ---------- */}
      {myPending && (
        <BbPrompt key={myPending.kind} view={view} seat={seat} act={act} pending={myPending} manifest={manifest}
          roundDiscard={roundDiscard} setRoundDiscard={setRoundDiscard} />
      )}

      {/* attack slot picker */}
      {attackPick && selCard && (
        <BbDialog label={`Pick an attack slot for ${cardName(selCard.id)}`} onClose={() => setAttackPick(null)}>
            <div className="ig-lab">PICK AN ATTACK SLOT · {cardName(selCard.id).toUpperCase()}</div>
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
            <div className="bb-zoom-art" style={bbCellCss(manifest, zoomCard.sheet, zoomCard.cell, zoomCard.back)} />
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

function BbItemVisual({ manifest, itemId, kindLabel, exhausted = false, stateLabel, disabled = false, onClick, testId }: {
  manifest: ReturnType<typeof useBbManifest>;
  itemId: string;
  kindLabel: string;
  exhausted?: boolean;
  stateLabel?: string;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const item = BB_ITEMS[itemId];
  if (!item) return null;
  return (
    <button className={'bb-item-visual' + (exhausted ? ' spent' : '')} data-testid={testId}
      disabled={disabled} onClick={onClick} title={bbIconText(item.text)}
      aria-label={`${item.name}, ${exhausted ? (disabled ? 'spent' : 'spent, activate to refresh') : stateLabel ?? 'ready'}`}>
      <span className="bb-item-art" style={bbCellCss(manifest, item.art.sheet, item.art.cell, exhausted)} aria-hidden="true" />
      <span className="bb-item-shade" aria-hidden="true" />
      <span className="bb-item-kind">{kindLabel}</span>
      <span className="bb-item-name">{item.name.toUpperCase()}</span>
      <span className={'bb-item-state' + (exhausted ? ' spent' : '')}>
        {exhausted ? (disabled ? 'SPENT' : 'SPENT · REFRESH') : stateLabel ?? 'READY'}
      </span>
    </button>
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

function BbBattleStatCard({ manifest, id, selected, onClick, testId }: {
  manifest: ReturnType<typeof useBbManifest>;
  id: string;
  selected: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const card = BB_STAT_CARDS[id];
  return (
    <button className={'bb-battle-stat-card' + (selected ? ' selected' : '')}
      aria-pressed={selected} onClick={onClick} data-testid={testId}
      title={`${card?.name ?? id}: ${bbIconText(card?.text)}`}>
      <span className="bb-battle-stat-art" style={bbCellCss(manifest, card?.art.sheet ?? '', card?.art.cell ?? 0)} aria-hidden="true" />
      <span className="bb-battle-card-gloss" aria-hidden="true" />
      <span className="bb-battle-stat-name">{(card?.name ?? id).toUpperCase()}</span>
      {card?.effects.dodge && <span className="bb-battle-card-tag">DODGE</span>}
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

function BbPrompt({ view, seat, act, pending, manifest, roundDiscard, setRoundDiscard }: {
  view: BbView; seat: number; act: (a: BbAction) => void; pending: BbPending;
  manifest: ReturnType<typeof useBbManifest>;
  roundDiscard: string[]; setRoundDiscard: (v: string[]) => void;
}) {
  const me = view.hunters[seat];
  const [pick, setPick] = useState<{ id: string; index: number } | null>(null);

  if (pending.kind === 'combat-attack' || pending.kind === 'combat-reaction'
    || pending.kind === 'combat-dodge' || pending.kind === 'combat-rider') {
    return <BbBattlePrompt view={view} seat={seat} act={act} pending={pending} manifest={manifest}
      pick={pick} setPick={setPick} />;
  }

  const title = pending.kind === 'discard-for-stun' ? 'STUNNED · DISCARD A CARD'
            : pending.kind === 'dream-upgrades' ? `THE HUNTER'S DREAM · CHOOSE AN UPGRADE (${pending.picks} LEFT)`
              : pending.kind === 'dream-incorporate' ? 'ADD THE UPGRADE TO YOUR DECK?'
                : pending.kind === 'return-placement' ? 'RETURN TO THE WAKING WORLD'
                  : pending.kind === 'tile-orientation' ? 'CHOOSE THE TILE ORIENTATION'
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
          <div className="bb-rot-pick">
            {pending.options.map((rot) => (
              <button key={rot} className="bb-rot" data-testid={`bb-rot-${rot}`} onClick={() => act({ type: 'choose', rot })}>
                <img src={bbTileArt(pending.tileId)} style={{ transform: `rotate(${rot * 90}deg)` }} alt={`rotation ${rot}`} />
              </button>
            ))}
          </div>
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

// ---------- the 2D map ----------

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
        return (
          <circle key={sp.ref} cx={sp.x} cy={sp.z} r={isNb ? 1.5 : 1.0}
            className={'bb-map-space' + (isNb ? ' step' : '')}
            data-testid={isNb ? 'bb-step-target' : undefined}
            role={isNb ? 'button' : undefined} tabIndex={isNb ? 0 : undefined}
            aria-label={isNb ? `Move to space ${sp.ref}` : undefined}
            onKeyDown={(event) => {
              if (isNb && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onSpace(sp.ref);
              }
            }}
            onClick={() => isNb && onSpace(sp.ref)} />
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
          <circle r={1.6} />
          <text textAnchor="middle" dy={0.6}>{e.edge}</text>
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
            <circle r={1.15} />
            <text textAnchor="middle" dy={0.45}>{bbEnemyName(e.type).slice(0, 2).toUpperCase()}</text>
            {e.damage > 0 && <text className="bb-map-dmg" textAnchor="middle" dy={-1.6}>{e.damage}</text>}
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
            <circle r={1.6} />
            <text textAnchor="middle" dy={0.5}>P{b.phase}</text>
            <text className="bb-map-dmg" textAnchor="middle" dy={-2.1}>{b.damage}</text>
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
          <g key={h.seat} transform={`translate(${w[0] + (h.seat - 1.5) * 0.75},${w[1] + 1.2})`}>
            <circle r={h.seat === seat ? 0.75 : 0.6} fill="#0d0d10" stroke={hex} strokeWidth={0.22} />
            <text textAnchor="middle" dy={0.3} fill="#e8e8ee" fontSize={0.85}>{h.seat + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}
