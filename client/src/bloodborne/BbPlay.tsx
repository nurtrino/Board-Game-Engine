// Bloodborne player device — the hunter's hands. Left: the live map (the
// movement + targeting surface). Right: the trick-weapon dashboard rebuilt
// from the mod's art with slot state, firearm, consumables, rewards, and the
// stat-card hand. Every branching decision arrives as an explicit prompt;
// illegal actions are greyed out with the reason, never bounced.

import { useMemo, useState } from 'react';
import {
  BB_HUNTERS, BB_ENEMIES, BB_BOSSES, BB_TILES, BB_STAT_CARDS, BB_ITEMS, BB_MISSIONS,
  type BbView, type BbAction, type BbPending,
} from '@bge/shared';
import {
  BB_SEAT_HEX, BB_TILE_W, useBbManifest, bbCellCss, bbIconText, bbHunterName, bbEnemyName, bbBossName,
  bbTileArt, bbSpaceWorld, bbTileSpacesWorld, bbOpenExits, bbNeighbors, type BbEdgeT,
} from './bb-assets';
import './bb.css';

const RANK: Record<string, number> = { fast: 3, medium: 2, slow: 1 };

interface Props {
  view: BbView;
  act: (a: BbAction) => void;
  seat: number;
  error: string | null;
}

export default function BbPlay({ view, act, seat, error }: Props) {
  const manifest = useBbManifest();
  const me = view.hunters[seat];
  const [selCard, setSelCard] = useState<string | null>(null);
  const [attackPick, setAttackPick] = useState<{ enemyUid?: number; bossUid?: number } | null>(null);
  const [showMissions, setShowMissions] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [refreshPick, setRefreshPick] = useState(false);
  const [refreshSel, setRefreshSel] = useState<string[]>([]);
  const [roundDiscard, setRoundDiscard] = useState<string[]>([]);
  const [targeting, setTargeting] = useState<{ what: 'consumable' | 'firearm'; ix: number; label: string } | null>(null);
  const [offerPick, setOfferPick] = useState<string[] | null>(null);
  const [startSide, setStartSide] = useState<0 | 1>(0);
  const [zoomCard, setZoomCard] = useState<{ sheet: string; cell: number; back?: boolean; title?: string } | null>(null);

  const myTurn = view.activeSeat === seat;
  const moving = view.moving?.seat === seat ? view.moving : null;
  const pending = view.pending[0];
  const myPending = pending && pending.seat === seat ? pending : null;
  const hunterDef = me?.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const weaponSide = hunterDef?.sides[me.weaponSide];
  const weaponCell = (hunterDef?.art as { weaponCell?: number } | undefined)?.weaponCell ?? 0;

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
          <button className={'bb-btn' + (startSide === 0 ? ' primary' : '')} onClick={() => setStartSide(0)}>FIRST FORM</button>
          <button className={'bb-btn' + (startSide === 1 ? ' primary' : '')} onClick={() => setStartSide(1)}>TRANSFORMED FORM</button>
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
    return (
      <div className="bb-play bb-ended">
        <div className={'bb-end-title ' + (view.outcome === 'victory' ? 'win' : 'lose')}>
          {view.outcome === 'victory' ? 'THE HUNT IS COMPLETE' : 'YOU DIED'}
        </div>
        {view.outcome === 'victory' && view.chapter < 3 && (
          <button className="bb-btn primary" data-testid="bb-next-chapter" onClick={() => act({ type: 'next_chapter' })}>
            BEGIN CHAPTER {view.chapter + 1}
          </button>
        )}
        {view.outcome === 'victory' && view.chapter >= 3 && <div className="bb-head-note">THE CAMPAIGN IS WON</div>}
        {view.outcome === 'defeat' && <div className="bb-head-note">THE CAMPAIGN BEGINS ANEW · CREATE A NEW HUNT</div>}
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
      <div className="bb-head ig-glass">
        <span className="bb-head-id" style={{ borderColor: BB_SEAT_HEX[String(view.seats[seat]?.color)] }}>
          {bbHunterName(me.hunterId).toUpperCase()}
        </span>
        <span className="bb-stat" data-testid="bb-hp">HP {me.hp}/6</span>
        <span className="bb-stat">ECHOES {me.echoes}/3</span>
        <span className="bb-stat">INSIGHT {view.insightCollected}</span>
        <span className="bb-stat dim">TRACK {view.huntTrack + 1}/{view.huntTrackLength}</span>
        {me.poison && <span className="bb-stat bad">POISON</span>}
        {me.frenzy && <span className="bb-stat bad">FRENZY</span>}
        {view.finalRound && <span className="bb-stat bad">FINAL ROUND</span>}
        <span className="bb-head-spacer" />
        <button className="bb-btn ghost" onClick={() => setShowMissions(true)} data-testid="bb-open-missions">MISSIONS</button>
        <button className="bb-btn ghost" onClick={() => setShowDeck(true)} data-testid="bb-open-deck">SHOW DECK</button>
        <button className="bb-btn ghost" onClick={() => setShowIntro(true)}>HOW TO PLAY</button>
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
      </div>

      <div className="bb-main">
        {/* left: the map */}
        <div className="bb-map-wrap ig-glass" data-testid="bb-map">
          <BbMap view={view} seat={seat} moving={!!moving}
            onSpace={(ref) => {
              if (moving) act({ type: 'step', to: ref });
            }}
            onExit={(uid, edge) => {
              if (moving) act({ type: 'step_reveal', edge });
            }}
            onEnemy={(uid, isBoss) => {
              if (targeting) {
                if (targeting.what === 'firearm') act({ type: 'use_firearm', target: uid });
                else act({ type: 'use_consumable', itemIx: targeting.ix, target: uid });
                setTargeting(null);
                return;
              }
              if (canAct && selCard && emptySlots.length) setAttackPick(isBoss ? { bossUid: uid } : { enemyUid: uid });
            }}
          />
          {targeting && targeting.label !== 'teleport-lamp' && targeting.label !== 'summon-ally' && (
            <div className="bb-special-chips">
              <span className="bb-chip">{targeting.label}</span>
              <button className="bb-chip" onClick={() => setTargeting(null)}>CANCEL</button>
            </div>
          )}
          {view.specialRules.length > 0 && (
            <div className="bb-special-chips">
              {view.specialRules.slice(0, 4).map((r) => (
                <button key={r} className="bb-chip" onClick={() => setShowMissions(true)}>RULE {r}</button>
              ))}
            </div>
          )}
        </div>

        {/* right: dashboard + hand */}
        <div className="bb-rail">
          <div className="bb-weapon ig-glass" data-testid="bb-weapon">
            <div className="bb-weapon-art" style={bbCellCss(manifest, 'sheet-2', weaponCell, me.weaponSide === 1)}
              onClick={() => setZoomCard({ sheet: 'sheet-2', cell: weaponCell, back: me.weaponSide === 1, title: weaponSide?.label })} />
            <div className="bb-slots">
              {weaponSide?.slots.map((sl, i) => (
                <div key={i} className={'bb-slot' + (me.slots[i] ? ' filled' : '')} data-testid={`bb-slot-${i}`}>
                  <span className="bb-slot-name">{sl.name.toUpperCase()}</span>
                  <span className="bb-slot-meta">{'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦</span>
                  {me.slots[i] && <span className="bb-slot-card">{cardName(me.slots[i]!).toUpperCase()}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="bb-gear ig-glass">
            <div className="bb-gear-row">
              <button className={'bb-chip' + (me.firearmExhausted ? ' spent' : '')} data-testid="bb-firearm"
                onClick={() => {
                  if (me.firearmExhausted) { setRefreshPick(true); return; }
                  const gun = (BB_ITEMS[me.firearmId]?.effects ?? {}) as { custom?: string };
                  if (gun.custom === 'blunderbuss') setTargeting({ what: 'firearm', ix: 0, label: 'PICK AN ENEMY IN YOUR SPACE' });
                  else act({ type: 'use_firearm' });
                }}
                title={bbIconText(BB_ITEMS[me.firearmId]?.text)}>
                {BB_ITEMS[me.firearmId]?.name.toUpperCase() ?? 'FIREARM'} {me.firearmExhausted ? '· SPENT, TAP TO REFRESH' : '· READY'}
              </button>
              {me.rewards.map((r, i) => (
                <button key={i} className={'bb-chip' + (r.exhausted ? ' spent' : '')}
                  onClick={() => act({ type: 'use_reward', rewardIx: i })} disabled={r.exhausted}
                  title={bbIconText(BB_ITEMS[r.id]?.text)}>
                  {BB_ITEMS[r.id]?.name.toUpperCase()}{r.exhausted ? ' · SPENT' : ''}
                </button>
              ))}
            </div>
            {me.consumables.length > 0 && (
              <div className="bb-gear-row">
                {me.consumables.map((c, i) => (
                  <button key={i} className="bb-chip consumable" data-testid={`bb-consumable-${i}`}
                    title={bbIconText(BB_ITEMS[c]?.text)}
                    onClick={() => {
                      const fx = (BB_ITEMS[c]?.effects ?? {}) as { custom?: string };
                      if (fx.custom && ['damage-1-range-1', 'damage-2-same-space', 'move-enemy-2', 'suppress-activation'].includes(fx.custom)) {
                        setTargeting({ what: 'consumable', ix: i, label: 'PICK AN ENEMY ON THE MAP' });
                      } else if (fx.custom === 'teleport-lamp' || fx.custom === 'summon-ally') {
                        setTargeting({ what: 'consumable', ix: i, label: fx.custom });
                      } else {
                        act({ type: 'use_consumable', itemIx: i });
                      }
                    }}>
                    {BB_ITEMS[c]?.name.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
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
          </div>

          {/* hand */}
          <div className="bb-hand" data-testid="bb-hand">
            {me.hand.map((id, i) => (
              <button key={`${id}${i}`} className={'bb-card' + (selCard === id ? ' sel' : '')}
                data-testid={`bb-hand-${i}`}
                onClick={() => setSelCard(selCard === id ? null : id)}>
                <div className="bb-card-art" style={cardArt(id)} />
                <span className="bb-card-name">{cardName(id).toUpperCase()}</span>
              </button>
            ))}
            {me.hand.length === 0 && <span className="bb-head-note">NO CARDS IN HAND</span>}
          </div>

          {/* action bar for the selected card */}
          {selCard && canAct && (
            <div className="bb-actions ig-glass" data-testid="bb-actions">
              {actionsFor(selCard).map((a) => (
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
        </div>
      </div>

      {/* ---------- prompts ---------- */}
      {myPending && (
        <BbPrompt view={view} seat={seat} act={act} pending={myPending} manifest={manifest}
          roundDiscard={roundDiscard} setRoundDiscard={setRoundDiscard} />
      )}

      {/* attack slot picker */}
      {attackPick && selCard && (
        <div className="bb-modal" onClick={() => setAttackPick(null)}>
          <div className="ig-glass bb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">PICK AN ATTACK SLOT · {cardName(selCard).toUpperCase()}</div>
            <div className="bb-slot-pick">
              {weaponSide?.slots.map((sl, i) => (
                <button key={i} className="bb-btn" disabled={me.slots[i] !== null}
                  data-testid={`bb-attackslot-${i}`}
                  onClick={() => {
                    act({ type: 'attack', cardId: selCard, slot: i, ...attackPick });
                    setAttackPick(null);
                    setSelCard(null);
                  }}>
                  {sl.name.toUpperCase()} · {'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦{me.slots[i] ? ' · FILLED' : ''}
                </button>
              ))}
            </div>
            <button className="bb-btn ghost" onClick={() => setAttackPick(null)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* firearm refresh discard picker */}
      {refreshPick && (
        <div className="bb-modal" onClick={() => { setRefreshPick(false); setRefreshSel([]); }}>
          <div className="ig-glass bb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">DISCARD {BB_ITEMS[me.firearmId]?.effects?.refresh === 'discard2' ? 2 : 1} TO REFRESH</div>
            <div className="bb-hand small">
              {me.hand.map((id, i) => (
                <button key={i} className={'bb-card' + (refreshSel.includes(`${i}`) ? ' sel' : '')}
                  onClick={() => setRefreshSel(refreshSel.includes(`${i}`) ? refreshSel.filter((x) => x !== `${i}`) : [...refreshSel, `${i}`])}>
                  <div className="bb-card-art" style={cardArt(id)} />
                  <span className="bb-card-name">{cardName(id).toUpperCase()}</span>
                </button>
              ))}
            </div>
            <button className="bb-btn primary" onClick={() => {
              act({ type: 'refresh_firearm', discard: refreshSel.map((i) => me.hand[+i]) });
              setRefreshPick(false); setRefreshSel([]);
            }}>REFRESH</button>
            {(BB_ITEMS[me.firearmId]?.effects as { echoRefresh?: boolean } | undefined)?.echoRefresh && (
              <button className="bb-btn" disabled={me.echoes < 1} onClick={() => {
                act({ type: 'refresh_firearm', discard: [], echo: true });
                setRefreshPick(false); setRefreshSel([]);
              }}>SPEND 1 BLOOD ECHO{me.echoes < 1 ? ' · NONE HELD' : ''}</button>
            )}
          </div>
        </div>
      )}

      {/* missions log */}
      {showMissions && (
        <div className="bb-modal" onClick={() => setShowMissions(false)}>
          <div className="ig-glass bb-modal-card wide" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}

      {/* show deck: full sheets reference */}
      {showDeck && (
        <div className="bb-modal" onClick={() => setShowDeck(false)}>
          <div className="ig-glass bb-modal-card wide" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">CARD REFERENCE</div>
            <div className="bb-deck-list">
              {['basic-stat-deck', 'upgrade-stat-deck', 'consumable-deck', 'firearm-deck', 'reward-deck', 'enemies-2', 'sheet-3'].map((s) => (
                manifest?.sheets[s]?.face && <img key={s} src={manifest.sheets[s].face!.rel} alt={s} />
              ))}
            </div>
            <a className="bb-btn ghost" href="/bloodborne/rulebook.pdf" target="_blank" rel="noreferrer">OPEN RULEBOOK</a>
            <button className="bb-btn ghost" onClick={() => setShowDeck(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* intro */}
      {showIntro && (
        <div className="bb-modal" onClick={() => setShowIntro(false)}>
          <div className="ig-glass bb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">BLOODBORNE · THE HUNT</div>
            <div className="bb-intro-text">
              <p>Each action costs 1 stat card from your hand. MOVE up to 2 spaces. INTERACT to pick up consumables and work missions. ATTACK an enemy in your space: the card goes into an empty attack slot and powers that strike.</p>
              <p>Enemies act on their own after your turn. Faster attacks strike first. Keep a Dodge card and an empty fast slot to survive.</p>
              <p>Blood Echoes buy upgrades in the Hunter's Dream. Dying costs your echoes and time. Complete the Hunt Mission before the track runs out.</p>
            </div>
            <a className="bb-btn ghost" href="/bloodborne/rulebook.pdf" target="_blank" rel="noreferrer">FULL RULEBOOK</a>
            <button className="bb-btn ghost" onClick={() => setShowIntro(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {/* consumable lamp / ally target pickers */}
      {targeting && targeting.label === 'teleport-lamp' && (
        <div className="bb-modal" onClick={() => setTargeting(null)}>
          <div className="ig-glass bb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">TELEPORT TO A LAMP</div>
            {view.tiles.flatMap((t) => (BB_TILES[t.tileId]?.spaces ?? [])
              .filter((sp) => sp.icons.includes('lamp') && !view.brokenLamps.includes(`${t.uid}:${sp.id}`))
              .map((sp) => (
                <button key={`${t.uid}:${sp.id}`} className="bb-btn"
                  onClick={() => { act({ type: 'use_consumable', itemIx: targeting.ix, target: `${t.uid}:${sp.id}` }); setTargeting(null); }}>
                  {(sp.named ?? BB_TILES[t.tileId]?.name ?? 'LAMP').toUpperCase()}
                </button>
              )))}
            <button className="bb-btn ghost" onClick={() => setTargeting(null)}>CANCEL</button>
          </div>
        </div>
      )}
      {targeting && targeting.label === 'summon-ally' && (
        <div className="bb-modal" onClick={() => setTargeting(null)}>
          <div className="ig-glass bb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">CALL A HUNTER TO YOUR SIDE</div>
            {view.hunters.filter((h) => h.seat !== seat && h.space).map((h) => (
              <button key={h.seat} className="bb-btn"
                onClick={() => { act({ type: 'use_consumable', itemIx: targeting.ix, target: h.seat }); setTargeting(null); }}>
                {bbHunterName(h.hunterId).toUpperCase()}
              </button>
            ))}
            <button className="bb-btn ghost" onClick={() => setTargeting(null)}>CANCEL</button>
          </div>
        </div>
      )}

      {/* mission consumable offering */}
      {offerPick && (
        <div className="bb-modal" onClick={() => setOfferPick(null)}>
          <div className="ig-glass bb-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-lab">OFFER CONSUMABLES · PICK ANY</div>
            <div className="bb-gear-row">
              {me.consumables.map((c, i) => (
                <button key={i} className={'bb-chip consumable' + (offerPick.includes(`${i}`) ? ' sel' : '')}
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
          </div>
        </div>
      )}

      {/* card zoom */}
      {zoomCard && (
        <div className="bb-modal" onClick={() => setZoomCard(null)}>
          <div className="bb-zoom" data-testid="bb-zoom" onClick={(e) => e.stopPropagation()}>
            <div className="bb-zoom-art" style={bbCellCss(manifest, zoomCard.sheet, zoomCard.cell, zoomCard.back)} />
            {zoomCard.title && <span className="bb-zoom-title">{zoomCard.title.toUpperCase()}</span>}
            <button className="bb-btn ghost" onClick={() => setZoomCard(null)}>CLOSE</button>
          </div>
        </div>
      )}

      {error && <div className="bb-toast" data-testid="bb-error">{error}</div>}
    </div>
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

function BbPrompt({ view, seat, act, pending, manifest, roundDiscard, setRoundDiscard }: {
  view: BbView; seat: number; act: (a: BbAction) => void; pending: BbPending;
  manifest: ReturnType<typeof useBbManifest>;
  roundDiscard: string[]; setRoundDiscard: (v: string[]) => void;
}) {
  const me = view.hunters[seat];
  const hunterDef = me.hunterId ? BB_HUNTERS[me.hunterId] : null;
  const side = hunterDef?.sides[me.weaponSide];
  const combat = view.combat;
  const foe = combat?.enemyUid != null ? view.enemies.find((e) => e.uid === combat.enemyUid) : null;
  const boss = combat?.bossUid != null ? view.bosses.find((b) => b.uid === combat.bossUid) : null;
  const foeName = foe ? bbEnemyName(foe.type) : boss ? bbBossName(boss.type) : '';
  const enemyAct = combat?.enemyAction && foe
    ? BB_ENEMIES[foe.type].sides[view.enemySides[foe.type] ?? 0][combat.enemyAction.kind === 'basic' ? 'basic' : combat.enemyAction.kind === 'special' ? 'special' : 'ability']
    : combat?.enemyAction && boss
      ? BB_BOSSES[boss.type].phases[boss.phase - 1][combat.enemyAction.bossCardIx ?? 0]
      : null;

  const dodgeCards = me.hand.filter((c) => BB_STAT_CARDS[c]?.effects.dodge);
  const [pick, setPick] = useState<string | null>(null);

  const title =
    pending.kind === 'combat-attack' ? `${foeName.toUpperCase()} · ATTACK BACK?`
      : pending.kind === 'combat-dodge' ? `${foeName.toUpperCase()} · ${(enemyAct?.name ?? '').toUpperCase()} INCOMING · DODGE?`
        : pending.kind === 'combat-rider' ? 'DODGE OR SUFFER'
          : pending.kind === 'discard-for-stun' ? 'STUNNED · DISCARD A CARD'
            : pending.kind === 'dream-upgrades' ? `THE HUNTER'S DREAM · CHOOSE AN UPGRADE (${pending.picks} LEFT)`
              : pending.kind === 'dream-incorporate' ? 'ADD THE UPGRADE TO YOUR DECK?'
                : pending.kind === 'return-placement' ? 'RETURN TO THE WAKING WORLD'
                  : pending.kind === 'tile-orientation' ? 'CHOOSE THE TILE ORIENTATION'
                    : pending.kind === 'reward-overflow' ? 'YOU CARRY TOO MANY · GIVE ONE AWAY?'
                      : pending.kind === 'mission-choice' ? 'THE MISSION DEMANDS A CHOICE'
                        : pending.kind === 'round-refresh' ? 'NEW ROUND · DISCARD ANY, THEN DRAW TO 3'
                          : 'DECIDE';

  return (
    <div className="bb-modal">
      <div className="ig-glass bb-modal-card" data-testid={`bb-prompt-${pending.kind}`}>
        <div className="ig-lab">{title}</div>
        {enemyAct && (pending.kind === 'combat-attack' || pending.kind === 'combat-dodge') && (
          <div className="bb-foe-line">
            {combat?.enemyAction?.kind?.toUpperCase()} · {(enemyAct.name || '').toUpperCase()}
            {enemyAct.speed ? ` · ${'›'.repeat(RANK[enemyAct.speed] ?? 1)}` : ''} · {enemyAct.damage}♦
            {enemyAct.text ? <span className="bb-foe-text">{bbIconText(enemyAct.text)}</span> : null}
          </div>
        )}

        {pending.kind === 'combat-attack' && (
          <>
            <div className="bb-hand small">
              {me.hand.map((id, i) => (
                <button key={i} className={'bb-card' + (pick === id ? ' sel' : '')} onClick={() => setPick(pick === id ? null : id)}>
                  <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
                  <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
                </button>
              ))}
            </div>
            {pick && (
              <div className="bb-slot-pick">
                {side?.slots.map((sl, i) => (
                  <button key={i} className="bb-btn" disabled={me.slots[i] !== null}
                    onClick={() => { act({ type: 'choose', cardId: pick, slot: i }); setPick(null); }}>
                    {sl.name.toUpperCase()} · {'›'.repeat(RANK[sl.speed] ?? 1)} · {sl.damage}♦
                  </button>
                ))}
              </div>
            )}
            {!me.firearmExhausted && (BB_ITEMS[me.firearmId]?.effects as { custom?: string } | undefined)?.custom === 'firearm-attack' && (
              <button className="bb-btn" onClick={() => act({ type: 'choose', firearm: true })}>
                FIRE THE {BB_ITEMS[me.firearmId]?.name.toUpperCase()}
              </button>
            )}
            <button className="bb-btn ghost" data-testid="bb-combat-pass" onClick={() => act({ type: 'choose', pass: true })}>DO NOT ATTACK</button>
          </>
        )}

        {(pending.kind === 'combat-dodge' || pending.kind === 'combat-rider') && (
          <>
            {pending.kind === 'combat-dodge' && !me.firearmExhausted && combat?.bossUid == null && (() => {
              const gun = (BB_ITEMS[me.firearmId]?.effects ?? {}) as { custom?: string };
              const isBasic = combat?.enemyAction?.kind === 'basic';
              if (gun.custom === 'stagger-basic' && isBasic) {
                return <button className="bb-btn" onClick={() => act({ type: 'use_firearm' })}>
                  FIRE · STAGGER THE ATTACK
                </button>;
              }
              if (gun.custom === 'degrade-attack') {
                return <button className="bb-btn" onClick={() => act({ type: 'use_firearm' })}>
                  FIRE · -1 SPEED, NO EFFECTS
                </button>;
              }
              return null;
            })()}
            {dodgeCards.length > 0 ? (
              <>
                <div className="bb-hand small">
                  {dodgeCards.map((id, i) => (
                    <button key={i} className={'bb-card' + (pick === id ? ' sel' : '')} onClick={() => setPick(pick === id ? null : id)}>
                      <div className="bb-card-art" style={bbCellCss(manifest, BB_STAT_CARDS[id]?.art.sheet ?? '', BB_STAT_CARDS[id]?.art.cell ?? 0)} />
                      <span className="bb-card-name">{(BB_STAT_CARDS[id]?.name ?? id).toUpperCase()}</span>
                    </button>
                  ))}
                </div>
                {pick && (
                  <div className="bb-slot-pick">
                    {side?.slots.map((sl, i) => {
                      const need = 'speed' in pending && pending.speed != null
                        ? (typeof pending.speed === 'number' ? pending.speed : RANK[pending.speed])
                        : 1;
                      const ok = me.slots[i] === null && (RANK[sl.speed] ?? 0) >= need;
                      return (
                        <button key={i} className="bb-btn" disabled={!ok}
                          onClick={() => { act({ type: 'choose', cardId: pick, slot: i }); setPick(null); }}>
                          {sl.name.toUpperCase()} · {'›'.repeat(RANK[sl.speed] ?? 1)}{ok ? '' : me.slots[i] !== null ? ' · FILLED' : ' · TOO SLOW'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : <span className="bb-head-note">NO DODGE CARD IN HAND</span>}
            <button className="bb-btn ghost" data-testid="bb-dodge-pass" onClick={() => act({ type: 'choose', pass: true })}>TAKE THE HIT</button>
          </>
        )}

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

        {pending.kind === 'round-refresh' && (
          <>
            <div className="bb-hand small">
              {me.hand.map((id, i) => (
                <button key={i} className={'bb-card' + (roundDiscard.includes(`${i}`) ? ' sel' : '')}
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
      </div>
    </div>
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
          <button key={s} className={'bb-rot' + (side === s ? ' sel' : '')} onClick={() => setSide(s as 0 | 1)}>
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

function BbMap({ view, seat, moving, onSpace, onExit, onEnemy }: {
  view: BbView; seat: number; moving: boolean;
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
    <svg className="bb-map" viewBox={`${bounds.x0} ${bounds.z0} ${bounds.w} ${bounds.h}`} data-testid="bb-map-svg">
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
            onClick={() => isNb && onSpace(sp.ref)} />
        );
      })}
      {/* open exits from my space */}
      {myExitHere.map((e, i) => (
        <g key={i} className="bb-map-exit" data-testid="bb-reveal-exit" onClick={() => onExit(e.uid, e.edge)}
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
          <g key={e.uid} className="bb-map-enemy" onClick={() => onEnemy(e.uid, false)} transform={`translate(${w[0]},${w[1] - 1.2})`}>
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
          <g key={b.uid} className="bb-map-boss" onClick={() => onEnemy(b.uid, true)} transform={`translate(${w[0]},${w[1] - 1.2})`}>
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
