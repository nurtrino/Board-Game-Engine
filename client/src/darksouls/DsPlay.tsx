// Dark Souls: The Board Game — player device (iPad landscape, no scrolling).
// Class pick at setup, then the character screen: YOUR class board rendered
// with the mod's real art, the endurance bar as live cubes (black stamina from
// the top, red damage from the bottom on the mod's healthbar tile), equipment
// as sheet-cell card crops, stamina-costed action buttons greyed with inline
// reasons, and the pending-decision queue as explicit centered prompts.
// Bonfire phase is the party-management screen (Andre / Firekeeper / stash /
// travel / rest). House pattern: AxisPlay (sheets, chips, billStyle cards).

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DS_CLASSES, DS_CLASS_IDS, DS_TREASURE_BY_ID, DS_BOSSES, DS_ENCOUNTER_BY_ID, DS_SUMMONS,
  dsDefenceDice, dsDodgeDiceCount,
  type DsView, type DsAction, type DsPending, type DsStat, type DsArc,
  type DsTreasureCard,
} from '@bge/shared';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { playSfx } from '../sfx';
import {
  useDsManifest, dsCardStyle, dsCardArt, DS_CLASS_BOARD, DS_MAT_RECTS, DS_SEAT_HEX, DS_DIE_HEX,
  type DsManifest,
} from './dsAssets';
import { DsNodeMap, type MapPick } from './DsNodeMap';
import { DS_BONFIRE_TOKEN, DS_FACE_ART, DS_FOG_WALL } from './ds-assets';
import { dsNodeIdForOption, dsPieceIdForOption } from './dsEncounterPresentation';
import {
  activationGate, atBonfire, attackChoices, buyReason, buySparkReason, canSpend, cleanCopy,
  dashPlan, dodgeStamina, endReason, enemyAlive, enemyDef, equipMoveReason, equipWindowOpen,
  estusReason, fogGateReason, freeBoxes, globalGate, heroicReason, levelInfo, movePlan,
  openableChests, removeUpgradeReason, restReason, restoreLuckReason, sellReason, swapOptions,
  swapReason, travelTargets, upgradeTargets,
  ENDURANCE_BOXES, LUCK_RESTORE_COST, SELLBACK_SOULS, SPARK_COST, TREASURE_COST,
  type AttackChoice, type DsVChar, type EquipSlotKey, type MovePlan,
} from './dsPlayRules';
import './ds-play.css';
import './ds-modern.css';

type Act = (a: DsAction) => void;

export const DS_INTRO: Intro = {
  title: 'Dark Souls: The Board Game',
  tagline: 'A cooperative dungeon crawl: explore, die, rest, try again.',
  goal: 'Win together. Fight through the encounters to the fog gate, defeat the mini boss, then survive the main boss. Every character death costs the party a spark and resets the road; a death with no sparks left loses the game.',
  points: [
    { label: 'Your activation', detail: 'Gain 2 stamina and the Aggro token, then move and attack. Movement groups entirely before or after your attacks. Walk once free; run costs 1 stamina per node. Press END ACTIVATION when done.' },
    { label: 'One bar for everything', detail: 'Stamina (black, from the top) and damage (red, from the bottom) share your 10 endurance boxes. A full bar kills you. Estus clears the whole bar once per rest.' },
    { label: 'Getting hit', detail: 'When an enemy attacks you, choose: block or resist with your equipment dice, or dodge for 1 stamina, all or nothing. Dodging lets you slip one node first. Luck rerolls one die.' },
    { label: 'Souls and the bonfire', detail: 'Encounters pay souls to the party cache. At the bonfire, Blacksmith Andre sells treasure and fits upgrades; the Firekeeper levels your stats. Resting refreshes everyone but spends a spark and resets cleared tiles.' },
    { label: 'Aggro and threat', detail: 'Enemies hunt the Aggro token holder or the nearest character, printed on their data card. The party decides ties: those choices land on your device as prompts.' },
  ],
  rulebook: '/dark-souls/rulebook.pdf',
  walkthrough: [
    { title: 'Pick your class', body: 'At the start everyone picks one of the ten class boards. Your board carries your heroic action, your equipment slots, your stat tiers and your endurance bar. No duplicates: first tap takes the class.' },
    { title: 'Travel the tiles', body: 'From the bonfire, tap the next tile on the TRAVEL strip to enter it. Entering an unexplored tile flips its encounter card and the fight starts immediately. Enemies always act first.' },
    { title: 'Fight on the board', body: 'When it is your activation, choose WALK or RUN and tap a glowing node on the room. Choose a weapon attack and tap the exact enemy miniature you want to strike. Stacked enemies remain separate targets.' },
    { title: 'Answer the prompts', body: 'Spatial choices stay docked while the board glows: tap nodes for dodges and pushes, or tap miniatures for targets and Aggro. Incoming attacks still open a focused BLOCK or DODGE decision with your live dice.' },
    { title: 'Spend souls at the bonfire', body: 'Back at the bonfire, ANDRE draws treasure cards for souls and installs upgrades, the FIREKEEPER raises a stat one tier, and REST (host confirms) refreshes the party at the cost of a spark.' },
    { title: 'Through the fog gate', body: 'Clear the farthest tile and ENTER FOG GATE to face the boss. Watch its behaviour cards on the TV, learn the pattern, and strike its weak arc. Kill the mini boss, re-gear, then the main boss awaits.' },
  ],
};

const STAT_LABEL: Record<DsStat, string> = { str: 'STR', dex: 'DEX', int: 'INT', fai: 'FAI' };

// ---------- atoms ----------

function DieChips({ dice, flat }: { dice: Partial<Record<string, number>>; flat?: number }) {
  const parts: ReactNode[] = [];
  for (const [color, n] of Object.entries(dice)) {
    for (let i = 0; i < Math.min(n ?? 0, 4); i++) {
      parts.push(<i key={`${color}${i}`} className={`ds-die ${color}`} style={{ backgroundColor: DS_DIE_HEX[color] ?? '#333' }} />);
    }
    if ((n ?? 0) > 4) parts.push(<em key={`${color}x`}>×{n}</em>);
  }
  if (flat) parts.push(<em key="flat">+{flat}</em>);
  return <span className="ds-dice">{parts}</span>;
}

function RolledDice({ rolled }: { rolled: { color: string; value: number }[] }) {
  return (
    <div className="ds-rolled">
      {rolled.map((d, i) => (
        <span key={i} className="ds-rolled-die" style={{ background: DS_DIE_HEX[d.color] ?? '#333' }}>
          {d.color === 'dodge' ? (d.value ? '✦' : '·') : d.value}
        </span>
      ))}
    </div>
  );
}

/** Portrait card crop (sheet-cell CSS background, the AxisPlay billStyle way). */
function CardFace({ cardId, w, onClick, className }: { cardId: string; w: number; onClick?: () => void; className?: string }) {
  const style: CSSProperties = { ...dsCardStyle(cardId), width: w, height: w * 1.5 };
  return (
    <div
      className={`ds-card${className ? ` ${className}` : ''}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={DS_TREASURE_BY_ID[cardId]?.name ?? cardId}
    />
  );
}

function Reason({ text }: { text: string | null }) {
  if (!text) return null;
  return <small className="ds-reason">· {text}</small>;
}

function RailBtn({ label, detail, reason, onClick, primary, cost }: {
  label: string; detail?: ReactNode; reason: string | null; onClick: () => void;
  primary?: boolean; cost?: string;
}) {
  return (
    <button
      className={`ds-btn${primary ? ' primary' : ''}`}
      disabled={Boolean(reason)}
      onClick={onClick}
    >
      <span className="ds-btn-main">
        <b>{label}</b>
        {cost && <span className="ds-cost ig-num">{cost}</span>}
      </span>
      {detail && <span className="ds-btn-detail">{detail}</span>}
      <Reason text={reason} />
    </button>
  );
}

// ---------- the character mat ----------

const ENDUR_BOX0 = 0.1;      // healthbar tile: first cube box starts at 10% of the strip
const ENDUR_BOXSPAN = 0.0606; // each of the 10 boxes spans ~6.06%

function EnduranceBar({ ch }: { ch: DsVChar }) {
  const art = `/dark-souls/healthbar-${ch.classId}${['assassin', 'herald', 'knight', 'warrior'].includes(ch.classId) ? '.png' : '.jpg'}`;
  const cubes: ReactNode[] = [];
  for (let i = 0; i < ENDURANCE_BOXES; i++) {
    const black = i < ch.stamina;
    const red = i >= ENDURANCE_BOXES - ch.damage;
    if (!black && !red) continue;
    cubes.push(
      <span
        key={i}
        className={`ds-cube ${black ? 'black' : 'red'}`}
        style={{
          top: `${(ENDUR_BOX0 + (i + 0.14) * ENDUR_BOXSPAN) * 100}%`,
          height: `${ENDUR_BOXSPAN * 0.72 * 100}%`,
        }}
      />,
    );
  }
  return (
    <div className="ds-endur" aria-label={`Endurance: ${ch.stamina} stamina, ${ch.damage} damage`}>
      <div
        className="ds-endur-art"
        style={{ backgroundImage: `url(${art})` }}
      />
      {cubes}
      <div className="ds-endur-tags">
        <span className="ig-lab">STAM {ch.stamina}</span>
        <span className="ig-lab red">DMG {ch.damage}</span>
      </div>
    </div>
  );
}

// tier-table cube positions on the class board (fractions of the board image)
const TIER_COL0 = 0.664; const TIER_DCOL = 0.0955;
const TIER_ROW0 = 0.6505; const TIER_DROW = 0.0645;
const STAT_ROWS: DsStat[] = ['str', 'dex', 'int', 'fai'];

function Mat({ view, ch, mine, onSlot }: {
  view: DsView; ch: DsVChar; mine: boolean;
  onSlot?: (cardId: string) => void;
}) {
  const rectStyle = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({
    left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`,
  });
  const slots: { key: 'armour' | 'handL' | 'handR'; rect: { x: number; y: number; w: number; h: number } }[] = [
    { key: 'handL', rect: DS_MAT_RECTS.handL },
    { key: 'handR', rect: DS_MAT_RECTS.handR },
    { key: 'armour', rect: DS_MAT_RECTS.armour },
  ];
  return (
    <div
      className={`ds-mat${mine ? ' mine' : ''}`}
      style={{ backgroundImage: `url(${DS_CLASS_BOARD[ch.classId]})`, borderColor: DS_SEAT_HEX[ch.seat] }}
    >
      {slots.map(({ key, rect }) => {
        const eq = ch[key];
        return eq ? (
          <div key={key} className="ds-slot" style={{ ...rectStyle(rect), ...dsCardStyle(eq.cardId) }}
            onClick={onSlot ? () => onSlot(eq.cardId) : undefined} role={onSlot ? 'button' : undefined}
            title={DS_TREASURE_BY_ID[eq.cardId].name}>
            {eq.upgrades.length > 0 && <span className="ds-upg-pips">{eq.upgrades.map((_, i) => <i key={i} />)}</span>}
          </div>
        ) : null;
      })}
      {/* backup fan */}
      {ch.backup.map((eq, i) => (
        <div key={eq.cardId} className="ds-slot backup" style={{
          ...rectStyle({ ...DS_MAT_RECTS.backup, x: DS_MAT_RECTS.backup.x + i * 0.024, y: DS_MAT_RECTS.backup.y + i * 0.02 }),
          ...dsCardStyle(eq.cardId),
        }}
          onClick={onSlot ? () => onSlot(eq.cardId) : undefined} role={onSlot ? 'button' : undefined}
          title={DS_TREASURE_BY_ID[eq.cardId].name} />
      ))}
      {/* tokens: dim when spent, ring when active */}
      <span className={`ds-token${ch.estus ? '' : ' spent'}`} style={rectStyle(DS_MAT_RECTS.estus)} title={ch.estus ? 'Estus ready' : 'Estus spent'} />
      <span className={`ds-token${ch.luck ? '' : ' spent'}`} style={rectStyle(DS_MAT_RECTS.luck)} title={ch.luck ? 'Luck ready' : 'Luck spent'} />
      <span className={`ds-token${ch.heroic ? '' : ' spent'}`} style={rectStyle(DS_MAT_RECTS.heroic)} title={ch.heroic ? 'Heroic ready' : 'Heroic used'} />
      <span className={`ds-token ember${ch.ember ? ' lit' : ''}`} style={rectStyle(DS_MAT_RECTS.ember)} title={ch.ember ? 'Ember carried' : 'No ember'} />
      {/* level cubes on the printed tier table */}
      {STAT_ROWS.map((stat, row) => {
        const tier = Math.min(ch.tiers[stat], 3);
        return (
          <span key={stat} className="ds-tier-cube" title={`${STAT_LABEL[stat]} tier ${ch.tiers[stat]}`} style={{
            left: `${(TIER_COL0 + tier * TIER_DCOL) * 100}%`,
            top: `${(TIER_ROW0 + row * TIER_DROW) * 100}%`,
          }} />
        );
      })}
      {view.aggroSeat === ch.seat && (view.phase === 'encounter' || view.phase === 'bossEncounter') && (
        <span className="ds-aggro-flag">AGGRO</span>
      )}
    </div>
  );
}

function CharSummary({ view, ch }: { view: DsView; ch: DsVChar }) {
  return (
    <div className="ds-char-sum">
      {STAT_ROWS.map((st) => (
        <span key={st} className="ds-stat ig-num"><small>{STAT_LABEL[st]}</small>{ch.stats[st]}</span>
      ))}
      <span className="ds-stat ig-num"><small>TAUNT</small>{ch.taunt}</span>
      {ch.arc && <span className="ds-stat"><small>ARC</small>{ch.arc.toUpperCase()}</span>}
      {ch.conditions.map((c) => <span key={c} className="ds-cond">{c.toUpperCase()}</span>)}
      {view.aggroSeat === ch.seat && <span className="ds-cond aggro">AGGRO</span>}
    </div>
  );
}

function CharacterPanelHeader({ ch }: { ch: DsVChar }) {
  const free = Math.max(0, ENDURANCE_BOXES - ch.stamina - ch.damage);
  return (
    <header className="ds-character-head">
      <div>
        <span className="ig-lab">CHOSEN UNDEAD</span>
        <h3>{ch.className}</h3>
      </div>
      <div className="ds-character-vitals" aria-label={`${free} endurance spaces free`}>
        <span><small>STAMINA</small><b className="ig-num">{ch.stamina}</b></span>
        <i />
        <span><small>DAMAGE</small><b className="ig-num">{ch.damage}</b></span>
      </div>
    </header>
  );
}

// ---------- pending prompts (centered, explicit) ----------

const PENDING_KIND_LABEL: Partial<Record<DsPending['kind'], string>> = {
  leadCharacter: 'AGGRO', pushDest: 'PUSH PLACEMENT', nodeOverflow: 'NODE FULL',
  enemyTieOrder: 'ACTIVATION ORDER', enemyMoveTie: 'ENEMY MOVE', arcChoice: 'ARC CHOICE',
  spellTarget: 'CAST TARGET', entryPlace: 'ENTER THE ROOM', dodgeMove: 'DODGE',
};

const BOARD_PENDING_KINDS = new Set<DsPending['kind']>([
  'leadCharacter', 'pushDest', 'nodeOverflow', 'enemyTieOrder', 'enemyMoveTie',
  'spellTarget', 'entryPlace', 'dodgeMove',
]);

function PendingOverlay({ view, seat, act, mapPickHost }: {
  view: DsView; seat: number; act: Act;
  mapPickHost: (pick: MapPick | null) => void;
}) {
  const head = view.head;
  const usesBoard = Boolean(view.encounter && head && BOARD_PENDING_KINDS.has(head.kind));
  // publish node picks onto the shared map for spatial decisions
  useEffect(() => {
    if (!head || head.seat !== seat || !usesBoard) { mapPickHost(null); return; }
    const nodeOptions = head.options
      .map((option) => ({ option, nodeId: dsNodeIdForOption(option.key) }))
      .filter((entry): entry is { option: typeof head.options[number]; nodeId: string } => Boolean(entry.nodeId));
    const pieceOptions = head.options
      .map((option) => ({ option, pieceId: dsPieceIdForOption(option.key) }))
      .filter((entry): entry is { option: typeof head.options[number]; pieceId: string } => Boolean(entry.pieceId));
    if (nodeOptions.length > 0 || pieceOptions.length > 0) {
      const nodeById = new Map(nodeOptions.map((entry) => [entry.nodeId, entry.option.key]));
      const pieceById = new Map(pieceOptions.map((entry) => [entry.pieceId, entry.option.key]));
      mapPickHost({
        nodes: new Set(nodeById.keys()),
        pieces: new Set(pieceById.keys()),
        onPick: (nodeId) => {
          const optionKey = nodeById.get(nodeId);
          if (optionKey) act({ type: 'choose', pick: optionKey });
        },
        onPickPiece: (pieceId) => {
          const optionKey = pieceById.get(pieceId);
          if (optionKey) act({ type: 'choose', pick: optionKey });
        },
      });
    } else {
      mapPickHost(null);
    }
    return () => mapPickHost(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head?.id, seat, usesBoard]);

  if (!head) return null;
  if (head.seat !== seat) {
    return (
      <div className="ds-wait ig-glass" role="status">
        <span className="ig-lab">DECISION PENDING</span>
        <b>{(view.characters[head.seat]?.className ?? `SEAT ${head.seat + 1}`).toUpperCase()} DECIDES</b>
        <small>{cleanCopy(head.prompt)}</small>
      </div>
    );
  }

  const spatialOptions = head.options.filter((option) => dsNodeIdForOption(option.key) || dsPieceIdForOption(option.key));
  const auxiliaryOptions = head.options.filter((option) => !spatialOptions.includes(option));
  const dockOnBoard = usesBoard && spatialOptions.length > 0
    && auxiliaryOptions.every((option) => option.key === 'stay' || option.key === 'skip');
  if (dockOnBoard) {
    return (
      <div className="ds-spatial-prompt ig-glass" role="dialog" aria-label="Board decision">
        <span className="ig-prompt-ring" />
        <div className="ds-spatial-copy">
          <span className="ig-lab">{PENDING_KIND_LABEL[head.kind] ?? 'CHOOSE ON THE BOARD'}</span>
          <b>{cleanCopy(head.prompt)}</b>
          <small>{spatialOptions.some((option) => dsPieceIdForOption(option.key)) ? 'Tap a glowing miniature.' : 'Tap a glowing node.'}</small>
        </div>
        {auxiliaryOptions.map((option) => (
          <button key={option.key} className="ds-choice slim ghost" onClick={() => act({ type: 'choose', pick: option.key })}>
            <b>{cleanCopy(option.label).toUpperCase()}</b>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="ds-prompt-veil">
      <div className="ds-prompt ig-glass" role="dialog" aria-label="Decision">
        <PromptBody view={view} seat={seat} head={head} act={act} />
      </div>
    </div>
  );
}

function PromptBody({ view, seat, head, act }: { view: DsView; seat: number; head: DsPending; act: Act }) {
  const ch = view.characters[seat];
  const pick = (key: string) => act({ type: 'choose', pick: key });
  const d = head.data as Record<string, unknown>;

  if (head.kind === 'defence') {
    const magical = Boolean(d.magical);
    const blockDice = dsDefenceDice(ch, magical ? 'resist' : 'block');
    const dodgeDice = dsDodgeDiceCount(ch);
    const canDodge = head.options.some((o) => o.key === 'dodge');
    return (
      <>
        <div className="ig-lab">INCOMING ATTACK</div>
        <h3>{cleanCopy(head.prompt)}</h3>
        <div className="ds-prompt-row">
          <button className="ds-choice" onClick={() => pick('block')}>
            <b>{magical ? 'RESIST' : 'BLOCK'}</b>
            <DieChips dice={blockDice} />
            <small>Roll and subtract · pushes and conditions still land</small>
          </button>
          <button className="ds-choice" disabled={!canDodge} onClick={() => pick('dodge')}>
            <b>DODGE · {dodgeStamina(ch)} STAMINA</b>
            <span className="ds-dice">
              {Array.from({ length: dodgeDice }, (_, i) => <i key={i} className="ds-die" style={{ background: DS_DIE_HEX.dodge }} />)}
              {dodgeDice === 0 && <em>NO DODGE DICE</em>}
            </span>
            <small>Difficulty {String(d.dodge ?? '?')} · all or nothing{canDodge ? '' : ' · NOT ENOUGH STAMINA'}</small>
          </button>
        </div>
      </>
    );
  }

  if (head.kind === 'dodgeMove') {
    return (
      <>
        <div className="ig-lab">DODGE</div>
        <h3>MOVE ONE NODE FIRST?</h3>
        <p className="ds-prompt-note">Tap a glowing node on the map, or hold position. The move never changes the target.</p>
        <div className="ds-prompt-opts">
          {head.options.map((o) => (
            <button key={o.key} className="ds-choice slim" onClick={() => pick(o.key)}>
              {o.key === 'stay' ? <b>HOLD POSITION</b> : <b>{cleanCopy(o.label).toUpperCase()}</b>}
            </button>
          ))}
        </div>
      </>
    );
  }

  if (head.kind === 'postRoll') {
    const rolled = (d.rolled as { color: string; value: number }[] | undefined) ?? [];
    return (
      <>
        <div className="ig-lab">{String((d.rollKind as string | undefined) ?? 'ROLL').toUpperCase()} RESULT</div>
        <h3>{cleanCopy(head.prompt)}</h3>
        {rolled.length > 0 && <RolledDice rolled={rolled} />}
        <div className="ds-prompt-opts">
          {head.options.map((o) => (
            <button key={o.key} className={`ds-choice slim${o.key === 'accept' ? ' primary' : ''}`} onClick={() => pick(o.key)}>
              <b>{cleanCopy(o.label).toUpperCase()}</b>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (head.kind === 'treasureKeep' || head.kind === 'emberAssign') {
    const cardId = d.cardId as string | undefined;
    return (
      <>
        <div className="ig-lab">{head.kind === 'emberAssign' ? 'EMBER DRAWN' : 'TREASURE DRAWN'}</div>
        <h3>{cleanCopy(head.prompt)}</h3>
        <div className="ds-prompt-card-row">
          {cardId && dsCardArt(cardId) && <CardFace cardId={cardId} w={128} />}
          <div className="ds-prompt-opts">
            {head.options.map((o) => (
              <button key={o.key} className="ds-choice slim" onClick={() => pick(o.key)}>
                <b>{cleanCopy(o.label).toUpperCase()}</b>
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (head.kind === 'trap') {
    return (
      <>
        <div className="ig-lab">UNBLOCKABLE</div>
        <h3>{cleanCopy(head.prompt)}</h3>
        <div className="ds-prompt-row">
          {head.options.map((o) => (
            <button key={o.key} className="ds-choice" onClick={() => pick(o.key)}>
              <b>{cleanCopy(o.label).toUpperCase()}</b>
              {o.key === 'dodge' && (
                <span className="ds-dice">
                  {Array.from({ length: dsDodgeDiceCount(ch) }, (_, i) => <i key={i} className="ds-die" style={{ background: DS_DIE_HEX.dodge }} />)}
                </span>
              )}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="ig-lab">{PENDING_KIND_LABEL[head.kind] ?? 'DECISION'}</div>
      <h3>{cleanCopy(head.prompt)}</h3>
      {head.options.some((o) => o.key.startsWith('node:')) && (
        <p className="ds-prompt-note">Tap a glowing node on the map, or pick below.</p>
      )}
      <div className="ds-prompt-opts">
        {head.options.map((o) => (
          <button key={o.key} className="ds-choice slim" onClick={() => pick(o.key)}>
            <b>{cleanCopy(o.label).toUpperCase()}</b>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------- class pick (setup) ----------

function ClassPickScreen({ view, seat, act }: { view: DsView; seat: number; act: Act }) {
  const myPick = view.classPicks[seat];
  return (
    <div className="ds-pick">
      <header className="ds-pick-head">
        <div>
          <div className="ig-lab">DARK SOULS · SETUP</div>
          <h2>CHOOSE YOUR CLASS</h2>
        </div>
        <div className="ig-lab">
          {myPick ? `YOU ARE THE ${DS_CLASSES[myPick].name.toUpperCase()} · WAITING FOR THE PARTY` : 'TAP A BOARD TO CLAIM IT'}
        </div>
      </header>
      <div className="ds-pick-grid">
        {DS_CLASS_IDS.map((id) => {
          const cls = DS_CLASSES[id];
          const takenBy = view.classPicks.findIndex((p, i) => p === id && i !== seat);
          const mine = myPick === id;
          return (
            <button
              key={id}
              className={`ds-pick-card${mine ? ' mine' : ''}`}
              disabled={takenBy >= 0}
              style={mine ? { borderColor: DS_SEAT_HEX[seat] } : undefined}
              onClick={() => act({ type: 'pick_class', classId: id })}
            >
              <span className="ds-pick-art" style={{ backgroundImage: `url(${DS_CLASS_BOARD[id]})` }} />
              <span className="ds-pick-name">
                <b>{cls.name.toUpperCase()}</b>
                <small>TAUNT {cls.taunt} · {cls.heroicAction.name.toUpperCase()}</small>
                {takenBy >= 0 && <em>TAKEN · SEAT {takenBy + 1}</em>}
                {mine && <em style={{ color: DS_SEAT_HEX[seat] }}>YOUR CLASS</em>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- encounter rail ----------

type PickMode =
  | { kind: 'walk' | 'run'; plan: MovePlan }
  | { kind: 'attack'; choice: AttackChoice }
  | { kind: 'swap' }
  | null;

function EncounterRail({ view, seat, act, setPick, pickMode }: {
  view: DsView; seat: number; act: Act;
  pickMode: PickMode; setPick: (p: PickMode) => void;
}) {
  const ch = view.characters[seat];
  const gate = activationGate(view, seat);
  const walk = movePlan(view, seat, false);
  const run = movePlan(view, seat, true);
  const attacks = attackChoices(view, seat);
  const estus = estusReason(view, seat);
  const heroic = heroicReason(view, seat);
  const swap = swapReason(view, seat);
  const end = endReason(view, seat);
  const cls = DS_CLASSES[ch.classId];
  const onlyEndLeft = !gate && walk.reason != null && run.reason != null && estus != null && heroic != null
    && attacks.every((a) => a.reason != null);

  const startAttack = (choice: AttackChoice) => {
    if (choice.cast != null) {
      // spell DSL cast: the engine pends the target pick (spellTarget)
      act({ type: 'attack', hand: choice.hand, option: choice.option });
      return;
    }
    // Even one legal target is selected on the miniature. This keeps combat
    // spatial and avoids the old dropdown-like auto-target/list flow.
    setPick({ kind: 'attack', choice });
  };

  if (pickMode?.kind === 'swap') {
    return (
      <div className="ds-rail-body">
        <div className="ds-picking ig-glass">
          <span className="ig-lab">SWAP BACKUP</span>
          <b>PICK THE TRADE</b>
          {swapOptions(view, seat).map((o, i) => (
            <button key={i} className="ds-btn" disabled={Boolean(o.reason)} onClick={() => {
              act({ type: 'swap_backup', handCardId: o.handCardId, backupCardId: o.backupCardId });
              setPick(null);
            }}>
              <span className="ds-btn-main"><b>{o.label}</b></span>
              <Reason text={o.reason} />
            </button>
          ))}
          <button className="ds-btn ghost" onClick={() => setPick(null)}>
            <span className="ds-btn-main"><b>CANCEL</b></span>
          </button>
        </div>
      </div>
    );
  }

  if (pickMode) {
    return (
      <div className="ds-rail-body">
        <div className="ds-picking ig-glass">
          <span className="ig-lab">{pickMode.kind === 'attack' ? 'PICK A TARGET' : 'PICK A NODE'}</span>
          <b>{pickMode.kind === 'attack'
            ? `${pickMode.choice.name.toUpperCase()} · ${pickMode.choice.cost} STAMINA`
            : pickMode.kind === 'run' ? 'RUN · TAP A GLOWING NODE' : 'WALK · TAP A GLOWING NODE'}</b>
          {pickMode.kind === 'attack' && (
            <div className="ds-board-pick-hint">
              <span className="ig-prompt-ring" />
              <span><b>TARGETS ARE GLOWING ON THE BOARD</b><small>Tap the enemy miniature you want to strike.</small></span>
            </div>
          )}
          {pickMode.kind !== 'attack' && pickMode.plan.arcSteps.map((a) => (
            <button key={a} className="ds-btn" onClick={() => { act({ type: pickMode.kind as 'walk' | 'run', arcStep: a }); setPick(null); }}>
              <span className="ds-btn-main"><b>CIRCLE TO THE {a.toUpperCase()} ARC</b></span>
            </button>
          ))}
          <button className="ds-btn ghost" onClick={() => setPick(null)}>
            <span className="ds-btn-main"><b>CANCEL</b></span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-rail-body">
      {gate && <div className="ds-gate ig-glass" role="status">{gate}</div>}
      <div className="ig-lab ds-rail-lab">MOVE</div>
      <RailBtn label="WALK" cost={`${walk.cost} ST`} reason={walk.reason}
        detail="One node · once per activation"
        onClick={() => setPick({ kind: 'walk', plan: walk })} />
      <RailBtn label="RUN" cost={`${run.cost} ST`} reason={run.reason}
        detail="One node · repeatable"
        onClick={() => setPick({ kind: 'run', plan: run })} />
      <div className="ig-lab ds-rail-lab">ATTACK</div>
      {attacks.length === 0 && <div className="ds-empty ig-lab">NO WEAPON IN HAND</div>}
      {attacks.map((a) => (
        <RailBtn
          key={`${a.hand}${a.option}`}
          label={`${a.name.toUpperCase()} · ${a.hand === 'L' ? 'LEFT' : 'RIGHT'}`}
          cost={`${a.cost} ST`}
          reason={a.reason}
          detail={(
            <>
              {a.cast != null
                ? <span className="ds-cast-text">{cleanCopy(a.cast)}</span>
                : <DieChips dice={a.dice} flat={a.flat} />}
              <em className="ds-tag">R{a.range >= 9999 ? '∞' : a.range}</em>
              {a.icons.magic && <em className="ds-tag magic">MAGIC</em>}
              {a.icons.node && <em className="ds-tag">NODE</em>}
              {a.icons.shaft && <em className="ds-tag">SHAFT</em>}
              {a.icons.push && <em className="ds-tag">PUSH</em>}
              {a.icons.repeat > 1 && <em className="ds-tag">×{a.icons.repeat}</em>}
              {a.icons.conditions.map((c) => <em key={c} className="ds-tag cond">{c.toUpperCase()}</em>)}
            </>
          )}
          onClick={() => startAttack(a)}
        />
      ))}
      <div className="ig-lab ds-rail-lab">ACTIONS</div>
      <RailBtn label="ESTUS FLASK" reason={estus} detail="Clear every cube on your bar"
        onClick={() => act({ type: 'use_estus' })} />
      <RailBtn label={cls.heroicAction.name.toUpperCase()} reason={heroic}
        detail={cls.heroicAction.text.length > 96 ? `${cls.heroicAction.text.slice(0, 93)}…` : cls.heroicAction.text}
        onClick={() => act({ type: 'heroic_action' })} />
      <RailBtn label="SWAP BACKUP" reason={swap} detail="Trade a hand weapon with backup"
        onClick={() => setPick({ kind: 'swap' })} />
      {view.campaign && (() => {
        const dash = dashPlan(view, seat);
        if (dash.reason) {
          return <RailBtn label="DASH THROUGH" reason={dash.reason}
            detail="Flee the tile · it resets face down" onClick={() => {}} />;
        }
        return dash.targets.map((t) => (
          <RailBtn key={t.id} label={`DASH THROUGH · ${t.label}`} reason={null}
            detail="Flee the tile · it resets face down"
            onClick={() => act({ type: 'dash_through', tileId: t.id })} />
        ));
      })()}
      <RailBtn label="END ACTIVATION" reason={end} primary={onlyEndLeft}
        detail="Pass to the enemies"
        onClick={() => act({ type: 'end_activation' })} />
    </div>
  );
}

// ---------- bonfire panels ----------

function TravelStrip({ view, seat, act }: { view: DsView; seat: number; act: Act }) {
  const targets = travelTargets(view);
  const gate = globalGate(view, seat);
  const fog = fogGateReason(view, seat);
  const chests = openableChests(view);
  const nextBossName = bossAheadName(view);
  return (
    <div className="ds-travel ig-glass">
      <div className="ig-lab">THE ROAD{nextBossName ? ` · TOWARD ${nextBossName.toUpperCase()}` : ''}</div>
      <div className="ds-travel-row">
        <button
          className={`ds-tile${view.partyAt === 'bonfire' ? ' here' : ''}`}
          disabled={Boolean(gate) || !targets.includes('bonfire')}
          onClick={() => act({ type: 'travel', tileId: 'bonfire' })}
        >
          <span className="ds-tile-art bonfire" style={{ backgroundImage: `url(${DS_BONFIRE_TOKEN})` }} />
          <span className="ds-tile-copy"><b>BONFIRE</b><small>{atBonfire(view) ? 'THE PARTY RESTS HERE' : 'RETURN'}</small></span>
        </button>
        {view.tiles.map((t) => {
          const art = DS_FACE_ART[t.faceId];
          return (
            <button
              key={t.id}
              className={`ds-tile${view.partyAt === t.id ? ' here' : ''}${t.cleared || t.completed ? ' cleared' : ''}`}
              disabled={Boolean(gate) || !targets.includes(t.id)}
              onClick={() => act({ type: 'travel', tileId: t.id })}
            >
              <span className="ds-tile-art" style={art ? { backgroundImage: `url(${art.image})` } : undefined} />
              <span className="ds-tile-copy">
                <b>LEVEL {t.level}</b>
                <small>{t.completed ? 'DONE · NEVER RESETS' : t.cleared ? 'CLEARED' : t.faceUp ? 'REVEALED' : 'UNEXPLORED'}</small>
              </span>
              {view.fogGateTileId === t.id && <img className="ds-tile-fog" src={DS_FOG_WALL} alt="Fog gate" />}
              {t.invaderToken && <em className="warn">DARK SPIRIT?</em>}
            </button>
          );
        })}
      </div>
      <div className="ds-travel-actions">
        <RailBtn label="ENTER FOG GATE" reason={fog} primary={!fog}
          detail={nextBossName ? `Face ${nextBossName}` : 'Face the boss'}
          onClick={() => act({ type: 'enter_fog_gate' })} />
        {chests.map((c) => (
          <RailBtn key={c.nodeId} label={c.mimic ? 'RE-ENGAGE THE MIMIC' : `OPEN CHEST · ${c.nodeId.toUpperCase()}`}
            reason={gate} detail={c.mimic ? 'It waits where you left it' : 'Two treasure draws'}
            onClick={() => act({ type: 'open_chest', nodeId: c.nodeId })} />
        ))}
      </div>
    </div>
  );
}

function bossAheadName(view: DsView): string | null {
  const id = view.stage === 'preMini' ? view.miniBossId
    : view.stage === 'postMini' ? view.mainBossId
    : view.stage === 'megaBoss' || view.stage === 'megaL4' ? view.megaBossId
    : view.options.oneshot?.boss ?? null;
  return id ? DS_BOSSES[id]?.name ?? null : null;
}

function AndrePanel({ view, seat, act, onManage }: { view: DsView; seat: number; act: Act; onManage: (cardId: string) => void }) {
  const buy = buyReason(view, seat);
  const cost = TREASURE_COST(view);
  return (
    <>
      <RailBtn label="BUY TREASURE" cost={`${cost} SOUL${cost > 1 ? 'S' : ''}`} reason={buy}
        detail={`Draw the top card · ${view.treasureDeckCount} left in the deck`}
        onClick={() => act({ type: 'buy_treasure' })} />
      <div className="ig-lab ds-rail-lab">INVENTORY · TAP TO EQUIP{view.campaign ? ' OR SELL' : ''}</div>
      <div className="ds-inv">
        {view.inventory.length === 0 && <div className="ds-empty ig-lab">THE STASH IS EMPTY</div>}
        {view.inventory.map((id, i) => (
          <CardFace key={`${id}${i}`} cardId={id} w={64} onClick={() => onManage(id)} />
        ))}
      </div>
    </>
  );
}

function FirekeeperPanel({ view, seat, act }: { view: DsView; seat: number; act: Act }) {
  const ch = view.characters[seat];
  const cls = DS_CLASSES[ch.classId];
  const luck = restoreLuckReason(view, seat);
  const spark = buySparkReason(view, seat);
  return (
    <>
      <div className="ig-lab ds-rail-lab">LEVEL UP · {cls.name.toUpperCase()}</div>
      <table className="ds-tiers">
        <thead>
          <tr><th></th><th>BASE</th><th>T1</th><th>T2</th><th>T3</th>{view.campaign && <th>T4</th>}<th></th></tr>
        </thead>
        <tbody>
          {STAT_ROWS.map((st) => {
            const info = levelInfo(view, seat, st);
            return (
              <tr key={st}>
                <td className="ig-lab">{STAT_LABEL[st]}</td>
                {cls.statTiers[st].map((v, tier) => (
                  <td key={tier} className={`ig-num${ch.tiers[st] === tier ? ' now' : ''}`}>{v}</td>
                ))}
                {view.campaign && <td className={`ig-num${ch.tiers[st] === 4 ? ' now' : ''}`}>40</td>}
                <td>
                  <button className="ds-mini-btn" disabled={Boolean(info.reason)} onClick={() => act({ type: 'level_up', stat: st })}
                    title={info.reason ?? `Raise ${STAT_LABEL[st]} to ${info.next}`}>
                    {info.maxed ? 'MAX' : `${info.cost}S`}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <RailBtn label="RESTORE LUCK" cost={`${LUCK_RESTORE_COST} SOUL`} reason={luck}
        detail="Ready your reroll token" onClick={() => act({ type: 'restore_luck' })} />
      {view.campaign && (
        <RailBtn label="BUY SPARK" cost={`${SPARK_COST(view)} SOULS`} reason={spark}
          detail={`Sparks ${view.sparks} of ${view.sparksMax}`} onClick={() => act({ type: 'buy_spark' })} />
      )}
    </>
  );
}

function StashPanel({ view, onManage }: { view: DsView; onManage: (cardId: string) => void }) {
  return (
    <div className="ds-stash">
      {view.characters.map((c) => (
        <div key={c.seat} className="ds-stash-group">
          <div className="ig-lab" style={{ color: DS_SEAT_HEX[c.seat] }}>{c.className.toUpperCase()}</div>
          <div className="ds-inv">
            {[c.armour, c.handL, c.handR, ...c.backup].filter((e): e is NonNullable<typeof e> => e != null).map((eq) => (
              <CardFace key={eq.cardId} cardId={eq.cardId} w={56} onClick={() => onManage(eq.cardId)} />
            ))}
          </div>
        </div>
      ))}
      <div className="ds-stash-group">
        <div className="ig-lab">SHARED INVENTORY</div>
        <div className="ds-inv">
          {view.inventory.length === 0 && <div className="ds-empty ig-lab">EMPTY</div>}
          {view.inventory.map((id, i) => <CardFace key={`${id}${i}`} cardId={id} w={56} onClick={() => onManage(id)} />)}
        </div>
      </div>
    </div>
  );
}

// ---------- equipment manage overlay ----------

const SLOT_LABEL: Record<Exclude<EquipSlotKey, 'inventory'>, string> = {
  armour: 'ARMOUR SLOT', handL: 'LEFT HAND', handR: 'RIGHT HAND', backup: 'BACKUP',
};

function ManageOverlay({ view, seat, cardId, act, onClose }: {
  view: DsView; seat: number; cardId: string; act: Act; onClose: () => void;
}) {
  const ch = view.characters[seat];
  const card: DsTreasureCard | undefined = DS_TREASURE_BY_ID[cardId];
  if (!card) return null;
  const window = equipWindowOpen(view, seat);
  const isUpgrade = card.kind === 'upgrade';
  const targets = isUpgrade ? upgradeTargets(view, seat, cardId) : [];
  const inInventory = view.inventory.includes(cardId);
  const equippedHere = [ch.armour, ch.handL, ch.handR, ...ch.backup]
    .find((e) => e != null && e.cardId === cardId);
  const installed = equippedHere?.upgrades ?? [];
  const sell = sellReason(view, seat);
  const req = card.requirements ?? { str: 0, dex: 0, int: 0, fai: 0 };
  const reqText = STAT_ROWS.filter((st) => (req[st] ?? 0) > 0).map((st) => `${STAT_LABEL[st]} ${req[st]}`).join(' · ');
  return (
    <div className="ds-prompt-veil" onClick={onClose}>
      <div className="ds-prompt ig-glass wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={card.name}>
        <div className="ds-prompt-card-row">
          <CardFace cardId={cardId} w={150} />
          <div className="ds-manage-side">
            <div className="ig-lab">{card.kind.toUpperCase()}{card.twoHanded ? ' · TWO-HANDED' : ''}{reqText ? ` · NEEDS ${reqText}` : ''}</div>
            <h3>{card.name.toUpperCase()}</h3>
            {card.special && <p className="ds-prompt-note">{cleanCopy(card.special)}</p>}
            {!window && <div className="ds-gate ig-glass">EQUIPMENT CHANGES HAPPEN AT BLACKSMITH ANDRE</div>}
            <div className="ds-prompt-opts">
              {!isUpgrade && (['armour', 'handL', 'handR', 'backup'] as const).map((to) => {
                const reason = equipMoveReason(view, seat, cardId, to);
                return (
                  <button key={to} className="ds-choice slim" disabled={Boolean(reason)}
                    onClick={() => { act({ type: 'equip_move', cardId, to }); onClose(); }}>
                    <b>EQUIP · {SLOT_LABEL[to]}</b>
                    <Reason text={reason} />
                  </button>
                );
              })}
              {!isUpgrade && !inInventory && (
                <button className="ds-choice slim" disabled={Boolean(equipMoveReason(view, seat, cardId, 'inventory'))}
                  onClick={() => { act({ type: 'equip_move', cardId, to: 'inventory' }); onClose(); }}>
                  <b>SEND TO THE INVENTORY</b>
                  <Reason text={equipMoveReason(view, seat, cardId, 'inventory')} />
                </button>
              )}
              {isUpgrade && targets.map((t) => (
                <button key={t.targetCardId} className="ds-choice slim" disabled={Boolean(t.reason) || !inInventory}
                  onClick={() => { act({ type: 'install_upgrade', upgradeId: cardId, targetCardId: t.targetCardId }); onClose(); }}>
                  <b>INSTALL ON {t.targetName.toUpperCase()}</b>
                  <Reason text={!inInventory ? 'UPGRADE MUST BE IN THE INVENTORY' : t.reason} />
                </button>
              ))}
              {installed.map((upId) => {
                const reason = removeUpgradeReason(view, seat, upId);
                return (
                  <button key={upId} className="ds-choice slim" disabled={Boolean(reason)}
                    onClick={() => { act({ type: 'remove_upgrade', upgradeId: upId, targetCardId: cardId }); onClose(); }}>
                    <b>REMOVE {DS_TREASURE_BY_ID[upId].name.toUpperCase()} · BACK TO THE INVENTORY</b>
                    <Reason text={reason} />
                  </button>
                );
              })}
              {view.campaign && inInventory && (
                <button className="ds-choice slim" disabled={Boolean(sell)}
                  onClick={() => { act({ type: 'sell_treasure', cardId }); onClose(); }}>
                  <b>SELL · {SELLBACK_SOULS} SOUL · DISCARDED FOREVER</b>
                  <Reason text={sell} />
                </button>
              )}
              <button className="ds-choice slim ghost" onClick={onClose}><b>CLOSE</b></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- show-deck reference ----------

function DeckOverlay({ onClose }: { onClose: () => void }) {
  const manifest = useDsManifest();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    if (!manifest) return [];
    const wanted = manifest.decks.filter((d) =>
      d.id.includes('treasure') || d.id === 'transmuted' || d.id === 'darkroot'
      || d.id.includes('encounter') || d.id.includes('behaviour') || d.id.startsWith('boss-')
      || d.id.startsWith('start-') || d.id === 'reference');
    return wanted;
  }, [manifest]);
  const openDeck = open ? groups.find((d) => d.id === open) : null;
  return (
    <div className="ds-prompt-veil" onClick={onClose}>
      <div className="ds-prompt ig-glass wide tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Deck reference">
        <div className="ig-lab">DECK REFERENCE · THE MOD'S REAL SHEETS</div>
        {!openDeck ? (
          <div className="ds-deck-list">
            {groups.map((d) => (
              <button key={d.id} className="ds-mini-btn" onClick={() => setOpen(d.id)}>
                {(d.name ?? d.id).toUpperCase().replace(/-/g, ' ')}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="ds-deck-nav">
              <button className="ds-mini-btn" onClick={() => setOpen(null)}>BACK</button>
              <b>{(openDeck.name ?? openDeck.id).toUpperCase().replace(/-/g, ' ')}</b>
            </div>
            <div className="ds-deck-sheets">
              {Object.values(openDeck.sheets).map((s) => (
                <img key={s.image} src={s.image} alt="Card sheet" loading="lazy" />
              ))}
            </div>
          </>
        )}
        <button className="ds-choice slim ghost" onClick={onClose} style={{ marginTop: 8 }}><b>CLOSE</b></button>
      </div>
    </div>
  );
}

// ---------- header / chips ----------

function Header({ view, seat, onIntro, onDecks }: { view: DsView; seat: number; onIntro: () => void; onDecks: () => void }) {
  const enc = view.encounter;
  const turnText = view.winner !== null
    ? (view.winner ? 'THE PARTY PREVAILS' : 'THE DARK CONSUMES ALL')
    : view.phase === 'setup' ? 'SETUP'
    : view.phase === 'bonfire' ? (view.partyAt === 'bonfire' ? 'AT THE BONFIRE' : 'ON THE ROAD')
    : enc
      ? (view.busy || enc.turn === 'enemies' ? 'ENEMIES ACT'
        : enc.activeSeat === seat ? 'YOUR ACTIVATION'
        : `${view.characters[enc.activeSeat]?.className?.toUpperCase() ?? ''} ACTS`)
    : '';
  const mine = enc?.turn === 'characters' && enc.activeSeat === seat && !view.busy;
  return (
    <header className="ds-head">
      <div className="ds-head-brand">
        <span className="ds-head-flame" aria-hidden="true" />
        <span className="ig-lab">DARK SOULS</span>
        <b>{view.characters[seat] ? view.characters[seat].className.toUpperCase() : `SEAT ${seat + 1}`}</b>
      </div>
      <div className={`ds-head-turn ig-glass${mine ? ' mine' : ''}`} style={mine ? { borderColor: DS_SEAT_HEX[seat] } : undefined}>
        {turnText}
      </div>
      <div className="ds-head-right">
        <span className="ds-chip ds-resource souls ig-glass" title="Party soul cache"><small>SOULS</small><b className="ig-num">{view.soulCache}</b></span>
        <span className="ds-chip ds-resource sparks ig-glass" title="Sparks remaining"><small>SPARKS</small><b className="ig-num">{view.sparks}/{view.sparksMax}</b></span>
        <span className="ds-chip ds-resource deck ig-glass" title="Treasure deck"><small>DECK</small><b className="ig-num">{view.treasureDeckCount}</b></span>
        <button className="ds-chip ig-glass tool" onClick={onDecks}>DECKS</button>
        <button className="ds-chip ig-glass tool" onClick={onIntro}>GUIDE</button>
      </div>
    </header>
  );
}

function PartyChips({ view, seat }: { view: DsView; seat: number }) {
  if (view.characters.length === 0) return null;
  return (
    <div className="ds-party">
      {view.characters.map((c) => (
        <span key={c.seat} className={`ds-party-chip ig-glass${c.seat === seat ? ' me' : ''}`}
          style={{ borderColor: `color-mix(in srgb, ${DS_SEAT_HEX[c.seat]} ${c.seat === seat ? 90 : 45}%, transparent)` }}>
          <b>{c.className.toUpperCase()}</b>
          <small className="ig-num">ST {c.stamina} · DMG {c.damage}</small>
          {view.aggroSeat === c.seat && (view.phase === 'encounter' || view.phase === 'bossEncounter') && <em>AGGRO</em>}
          {!c.estus && <em className="dim">NO ESTUS</em>}
          {c.ember && <em className="ember">EMBER</em>}
          {c.conditions.map((cond) => <em key={cond} className="dim">{cond.toUpperCase()}</em>)}
          {(c.defBuffs ?? []).map((b, i) => <em key={`b${i}`}>{b.label.toUpperCase()}</em>)}
          {(c.act?.magicWeapon ?? 0) > 0 && <em>MAGIC WEAPON</em>}
        </span>
      ))}
      {view.summon && DS_SUMMONS[view.summon.id] && (
        <span className="ds-party-chip ig-glass">
          <b>{DS_SUMMONS[view.summon.id].name.toUpperCase()}</b>
          <small className="ig-num">HP {view.summon.health}/{view.summon.maxHealth}</small>
          <em>SUMMON</em>
        </span>
      )}
      {!view.summon && view.summonEarned && (
        <span className="ds-party-chip ig-glass">
          <b>SUMMON SIGN</b>
          <small className="ig-num">AN ALLY WAITS AT THE {view.summonEarned === 'mini' ? 'MINI' : 'MAIN'} BOSS</small>
        </span>
      )}
    </div>
  );
}

// ---------- screens ----------

function EncounterScreen({ view, seat, act, manifest }: { view: DsView; seat: number; act: Act; manifest: DsManifest }) {
  const ch = view.characters[seat];
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [pendingPick, setPendingPick] = useState<MapPick | null>(null);
  const [manage, setManage] = useState<string | null>(null);

  // drop stale pick modes when the turn moves on
  useEffect(() => {
    if (activationGate(view, seat)) setPickMode(null);
  }, [view, seat]);

  const mapPick: MapPick | null = pendingPick ?? (pickMode && pickMode.kind !== 'swap' ? {
    nodes: new Set(pickMode.kind === 'attack' ? [] : pickMode.plan.targets.map((target) => target.nodeId)),
    pieces: new Set(pickMode.kind === 'attack'
      ? pickMode.choice.targets.map((target) => target.kind === 'enemy' ? `enemy:${target.uid}` : `boss:${target.unitKey}`)
      : []),
    onPick: (nodeId) => {
      if (pickMode.kind === 'attack') return;
      act({ type: pickMode.kind, nodeId });
      setPickMode(null);
    },
    onPickPiece: (pieceId) => {
      if (pickMode.kind !== 'attack') return;
      const target = pickMode.choice.targets.find((candidate) =>
        candidate.kind === 'enemy' ? pieceId === `enemy:${candidate.uid}` : pieceId === `boss:${candidate.unitKey}`);
      if (!target) return;
      act(target.kind === 'enemy'
        ? { type: 'attack', hand: pickMode.choice.hand, option: pickMode.choice.option, targetUid: target.uid }
        : { type: 'attack', hand: pickMode.choice.hand, option: pickMode.choice.option, targetUnit: target.unitKey });
      setPickMode(null);
    },
  } : null);

  return (
    <div className="ds-main ds-main-encounter">
      <section className="ds-col mat">
        <CharacterPanelHeader ch={ch} />
        <div className="ds-mat-row">
          <EnduranceBar ch={ch} />
          <Mat view={view} ch={ch} mine
            onSlot={(cardId) => setManage(cardId)} />
        </div>
        <CharSummary view={view} ch={ch} />
      </section>
      <section className="ds-col map">
        <DsNodeMap view={view} seat={seat} manifest={manifest} pick={mapPick} />
      </section>
      <section className="ds-col rail ig-glass">
        <EncounterRail view={view} seat={seat} act={act} pickMode={pickMode} setPick={setPickMode} />
      </section>
      <PendingOverlay view={view} seat={seat} act={act} mapPickHost={setPendingPick} />
      {manage && <ManageOverlay view={view} seat={seat} cardId={manage} act={act} onClose={() => setManage(null)} />}
    </div>
  );
}

function BonfireScreen({ view, seat, act }: { view: DsView; seat: number; act: Act }) {
  const ch = view.characters[seat];
  const [tab, setTab] = useState<'andre' | 'fire' | 'stash'>('andre');
  const [manage, setManage] = useState<string | null>(null);
  const [, setPendingPick] = useState<MapPick | null>(null);
  const rest = restReason(view, seat);
  return (
    <div className="ds-main ds-main-bonfire">
      <section className="ds-col mat">
        <CharacterPanelHeader ch={ch} />
        <div className="ds-mat-row">
          <EnduranceBar ch={ch} />
          <Mat view={view} ch={ch} mine onSlot={(cardId) => setManage(cardId)} />
        </div>
        <CharSummary view={view} ch={ch} />
      </section>
      <section className="ds-col mid">
        <TravelStrip view={view} seat={seat} act={act} />
        <div className="ds-rest ig-glass">
          <div>
            <div className="ig-lab">REST · PARTY DECISION</div>
            <small>Refresh everyone · spend a spark · cleared tiles reset</small>
          </div>
          <RailBtn label="REST" cost="1 SPARK" reason={rest} onClick={() => act({ type: 'rest' })} />
        </div>
      </section>
      <section className="ds-col rail ig-glass">
        <div className="ds-tabs">
          <button className={tab === 'andre' ? 'on' : ''} onClick={() => setTab('andre')}>ANDRE</button>
          <button className={tab === 'fire' ? 'on' : ''} onClick={() => setTab('fire')}>FIREKEEPER</button>
          <button className={tab === 'stash' ? 'on' : ''} onClick={() => setTab('stash')}>STASH</button>
        </div>
        <div className="ds-rail-body">
          {tab === 'andre' && <AndrePanel view={view} seat={seat} act={act} onManage={setManage} />}
          {tab === 'fire' && <FirekeeperPanel view={view} seat={seat} act={act} />}
          {tab === 'stash' && <StashPanel view={view} onManage={setManage} />}
        </div>
      </section>
      <PendingOverlay view={view} seat={seat} act={act} mapPickHost={setPendingPick} />
      {manage && <ManageOverlay view={view} seat={seat} cardId={manage} act={act} onClose={() => setManage(null)} />}
    </div>
  );
}

function GameOverScreen({ view }: { view: DsView }) {
  return (
    <div className="ds-over">
      <div className="ig-lab">DARK SOULS</div>
      <h1>{view.winner ? 'THE PARTY PREVAILS' : 'THE DARK CONSUMES ALL'}</h1>
      <p>{view.winner
        ? 'The boss falls and the bonfire burns bright. Well fought.'
        : 'A hero fell with no sparks left to spend. The run is over.'}</p>
      <div className="ds-over-log">
        {view.log.slice(-6).map((l, i) => <div key={i}>{cleanCopy(l.text)}</div>)}
      </div>
    </div>
  );
}

// ---------- top level ----------

export default function DsPlay({ view, act, seat, error }: {
  view: DsView;
  act: (a: DsAction) => void;
  seat: number;
  error: string | null;
}) {
  const [showIntro, setShowIntro] = useState(() => {
    try { return window.localStorage.getItem('ds-guide-v1') !== 'seen'; } catch { return true; }
  });
  const [showDecks, setShowDecks] = useState(false);
  const manifest = useDsManifest();

  useEffect(() => { if (error) playSfx('error'); }, [error]);

  const send: Act = (a) => { playSfx('click'); act(a); };
  const dismissIntro = () => {
    setShowIntro(false);
    try { window.localStorage.setItem('ds-guide-v1', 'seen'); } catch { /* private browsing */ }
  };

  if (!manifest) {
    return <div className="ds-page center-load"><span className="ig-lab">READING THE MOD…</span></div>;
  }

  const inSetup = view.phase === 'setup';
  return (
    <div className="ds-page">
      {!inSetup && <Header view={view} seat={seat} onIntro={() => setShowIntro(true)} onDecks={() => setShowDecks(true)} />}
      {!inSetup && <PartyChips view={view} seat={seat} />}
      {inSetup && <ClassPickScreen view={view} seat={seat} act={send} />}
      {view.phase === 'bonfire' && <BonfireScreen view={view} seat={seat} act={send} />}
      {(view.phase === 'encounter' || view.phase === 'bossEncounter') && <EncounterScreen view={view} seat={seat} act={send} manifest={manifest} />}
      {view.phase === 'gameOver' && <GameOverScreen view={view} />}
      {inSetup && (
        <div className="ds-setup-tools">
          <button className="ds-chip ig-glass tool" onClick={() => setShowIntro(true)}>GUIDE</button>
        </div>
      )}
      {error && <div className="ds-error" role="alert">{cleanCopy(error)}</div>}
      {showDecks && <DeckOverlay onClose={() => setShowDecks(false)} />}
      {showIntro && <GameIntro intro={DS_INTRO} onClose={dismissIntro} />}
    </div>
  );
}
