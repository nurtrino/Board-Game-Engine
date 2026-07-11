// Player device for Axis & Allies Anniversary · the expanded turn portal.
// Board-first: ONE persistent interactive map fills the screen; the active
// phase publishes its tap targets onto it. Menus live in a collapsible LEFT
// glass panel (list rows, price on the right). Purchases stage into the
// printed mobilization zone. The IPC bank sits bottom-right; tapping it
// shows the actual note pieces, and income makes the bills fly in.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  AXIS_MAP, AXIS_INDEX, POWERS, UNITS, TECHS, TECH_BY_KEY, RESEARCH_DIE_COST, CHINA_COLOR, WIN_CONDITIONS,
  airReachableDistances, airUnitRange, axisPieceSelectionSignature, enumerateAxisPhysicalPieces, sameAxisSide,
  chinaFighterAttackHasLanding, chinaReachableDistances, isChinaFriendlyLandingTerritory, isChinaOperatingTerritory,
  validateAirAttackLanding, validateAirNoncombatLanding,
  type AirUnitGroup, type AirUnitKey, type AxisPhysicalPiece, type CarrierMoveProjection,
  type AxisView, type AxisAction, type AxisUnitPick, type AxisCombatant, type AxisMovementUnit, type AxisSeaUnitKey,
  type PowerKey, type UnitKey, type UnitStack, type TechKey,
} from '@bge/shared';
import { AxisTable, useAxisManifest, useSceneReady, SPACE_CENTER, px2r, type FocusTarget, type SpacePick, type StagedStack, type AxisManifest, type OrderArrow } from './AxisScene';
import { AxisLoading } from './AxisLoading';
import UnitIcon from './UnitIcon';
import { powerTextColor } from './axisColors';
import { buildExactUnitPick, resizeOrdinalSelection, toggleOrdinalSelection } from './axisSelection';
import { strandedAircraft } from './axisAirLanding';
import { planCasualties, removeLastCasualtyPick } from './axisCasualtySelection';
import { axisForceInventory } from './axisInventory';
import {
  axisFirstLegalStagedPlacement,
  axisMobilizationDestinationPlans,
  buildPlaceBatchAction,
} from './axisMobilization';
import {
  axisCarrierLandingPlans,
  axisCarrierObligationCards,
  axisCarrierRequiredPlacements,
  axisCarrierSelectedFighters,
  type AxisCarrierLandingPlan,
} from './axisCarrierPresentation';
import {
  axisLandTwoStepTargets,
  axisSeaRouteTargets,
  axisSurfaceHostileSea,
  axisUniqueTargetForMapPick,
} from './axisMovementTargets';
import {
  buildAxisTransportLoadAction,
  buildAxisTransportOffloadAction,
  listAxisTransportHullCards,
  sameAxisTransportRef,
  setAxisTransportHullUnits,
  summarizeAxisTransportRoute,
  toggleAxisTransportHull,
  type AxisTransportCargoOrder,
  type AxisTransportHullCard,
  type AxisTransportRouteOrder,
} from './axisTransportOrders';
import {
  battleContinueAuthority,
  battleDecisionAuthority,
  battleRollAuthority,
  controlsAxisPower,
} from './axisAuthority';
import {
  axisAvailablePhaseKeys,
  axisCapitalTurnPresentation,
  axisPhasePresentation,
} from './axisCapitalPresentation';
import {
  axisCurrentUnitReference,
  axisFactoryRepairOffer,
  axisResearchChartPresentation,
  type AxisResearchChartPresentation,
} from './axisTechnologyPresentation';
import {
  axisRocketLauncherCards,
  axisRocketLauncherLabel,
  axisStrategicRaidTargetAvailable,
  buildAxisRocketStrikeAction,
} from './axisSpecialTechnologyPresentation';
import {
  axisParatrooperCommonTargets,
  axisParatrooperPairCards,
  buildAxisParatrooperGroups,
} from './axisParatrooperPresentation';
import {
  axisDefendingCarrierLandingCards,
  axisDefendingCarrierLandingOwner,
  axisUniqueDefendingCarrierOptionAtSpace,
} from './axisDefendingCarrierPresentation';
import {
  axisRetreatCopy,
  axisRetreatOutcomeText,
  axisRetreatSelectionKey,
  buildAxisRemainAction,
  buildAxisRetreatAction,
  initialAxisRetreatSelection,
  normalizeAxisRetreatSelection,
  type AxisRetreatSelection,
} from './axisRetreatPresentation';
import { GameIntro, type Intro } from '../ttr/GameIntro';

type Act = (a: AxisAction & { asPower?: PowerKey }) => void;

// what a phase sheet publishes onto the shared map
export interface MapCtl {
  picks: SpacePick[];
  onPick: (id: string) => void;
  focusSpace: string | null;
  arrows?: OrderArrow[];
  selectedPieces?: Record<string, Set<string>>;
  onUnitTap?: (spaceId: string, power: string, key: string, ordinal: number) => void;
  onRegionTap?: (id: string) => void;
}
type PublishMap = (ctl: MapCtl) => void;
const MAP_IDLE: MapCtl = { picks: [], onPick: () => {}, focusSpace: null };

const powerHex = (p: PowerKey | 'china') => (p === 'china' ? CHINA_COLOR : POWERS[p].color);
const combatantName = (p: AxisCombatant | null | undefined) => p === 'china' ? 'China' : p ? POWERS[p].name : 'Operations';

const TERR = Object.fromEntries(AXIS_MAP.territories.map((t) => [t.id, t]));
const ZONE = Object.fromEntries(AXIS_MAP.seaZones.map((z) => [z.id, z]));
const isSz = (id: string) => id.startsWith('sz-');
const spaceName = (id: string) => TERR[id]?.name ?? (ZONE[id] ? `Sea Zone ${ZONE[id].n}` : id);
const SEA_KEYS: UnitKey[] = ['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];
const AIR_KEYS: UnitKey[] = ['fighter', 'bomber'];
const isAirKey = (key: UnitKey): key is AirUnitKey => key === 'fighter' || key === 'bomber';
const BUYABLE: UnitKey[] = ['infantry', 'artillery', 'tank', 'aaGun', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport', 'factory'];
const REFERENCE: UnitKey[] = ['infantry', 'artillery', 'tank', 'aaGun', 'factory', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];

// A battle is an immediate substep of Combat Move, not a separate phase the
// rail later rewinds out of when the player declares another attack.
const PHASE_INFO: Record<string, { short: string; title: string; brief: string }> = {
  rnd: {
    short: 'Research',
    title: 'Research & development',
    brief: 'Optional: spend IPCs on researchers. Any 6 earns one breakthrough for this turn; failed researchers remain for later turns.',
  },
  purchase: {
    short: 'Purchase',
    title: 'Purchase units',
    brief: 'Build this turn\'s reinforcements. Purchases wait in the mobilization zone and deploy from your factories later this turn.',
  },
  combatMove: {
    short: 'Attack',
    title: 'Declare attacks',
    brief: 'Choose a starting territory, select the units that will fight, then choose a red destination. Each attack resolves immediately.',
  },
  battle: {
    short: 'Combat',
    title: 'Conduct combat',
    brief: 'Follow the battle order below. Roll, assign casualties, and decide whether to press the attack or retreat between rounds.',
  },
  noncombat: {
    short: 'Move',
    title: 'Noncombat movement',
    brief: 'Reposition units that did not fight, land aircraft safely, and load or unload transports in friendly territory.',
  },
  mobilize: {
    short: 'Deploy',
    title: 'Mobilize & collect income',
    brief: 'Place purchased units at eligible factories, then end the turn. Your income is collected automatically.',
  },
  gameOver: {
    short: 'Victory',
    title: 'Campaign complete',
    brief: 'The victory-city objective has been reached.',
  },
};

function PhaseRail({ view }: { view: AxisView }) {
  const phases = axisPhasePresentation(view);
  return (
    <ol className="ax-phase-rail" aria-label="Turn phases" style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}>
      {phases.map((node) => (
        <li
          key={node.key}
          className={`${node.progress} ${node.restriction}`}
          aria-current={node.progress === 'current' ? 'step' : undefined}
          aria-label={`${node.label}${node.reason ? `: ${node.reason}` : ''}`}
        >
          <span>{node.marker}</span>
          <small>{node.label}</small>
          {node.reason && <em>{node.reason}</em>}
        </li>
      ))}
    </ol>
  );
}

function PhaseBrief({ view }: { view: AxisView }) {
  const info = PHASE_INFO[view.phase] ?? PHASE_INFO.combatMove;
  const emergencyLanding = view.defendingCarrierLanding != null;
  const phases = axisAvailablePhaseKeys(view.options.rnd);
  const index = phases.indexOf((view.phase === 'battle' ? 'combatMove' : view.phase) as (typeof phases)[number]);
  const capital = axisCapitalTurnPresentation(view);
  return (
    <section className={`ax-phase-brief${capital.affected ? ` capital-${capital.banner?.tone}` : ''}`} aria-labelledby="ax-phase-title">
      <div className="ax-phase-kicker">{index >= 0 ? `Phase ${index + 1} of ${phases.length}${emergencyLanding ? ' - post-combat landing' : view.phase === 'battle' ? ' - battle in progress' : ''}` : 'Campaign status'}</div>
      <h2 id="ax-phase-title">{emergencyLanding ? 'Emergency carrier landings' : info.title}</h2>
      {capital.affected && (
        <div className="ax-phase-capital-context">
          <strong>{capital.occupiedNow ? 'Economic phases locked' : 'Income restored'}</strong>
          <span>{capital.occupiedNow ? 'Turn continues through operations only' : 'Earlier skips remain in force'}</span>
        </div>
      )}
      <p>{emergencyLanding
        ? 'Every battle is complete. Resolve each surviving defending carrier fighter before ordinary Noncombat Move begins.'
        : capital.brief ?? info.brief}</p>
    </section>
  );
}

function UsaChinaOperationProgress({ view }: { view: AxisView }) {
  if (view.defendingCarrierLanding
    || view.active !== 'usa'
    || (view.phase !== 'combatMove' && view.phase !== 'battle' && view.phase !== 'noncombat')) return null;
  if (!view.usaOperationFirst) {
    return <div className="ax-operation-progress choosing"><span>USA + China</span><b>Choose operation order</b></div>;
  }
  const order: AxisCombatant[] = view.usaOperationFirst === 'usa' ? ['usa', 'china'] : ['china', 'usa'];
  const section = view.phase === 'noncombat' ? 'Noncombat movement' : 'Combat operations';
  return (
    <div className="ax-operation-progress" aria-label={`${section}: ${combatantName(view.operatingPower)} active`}>
      <small>{section}</small>
      <div>
        {order.map((power, index) => (
          <span key={power} className={`${index < view.usaOperationIndex ? 'done ' : ''}${index === view.usaOperationIndex ? 'current' : ''}`}>
            <i>{index < view.usaOperationIndex ? '✓' : index + 1}</i>{combatantName(power)}
          </span>
        ))}
      </div>
    </div>
  );
}

function UsaChinaOrderChooser({ act, map }: { act: Act; map: PublishMap }) {
  useEffect(() => { map(MAP_IDLE); }, []);
  return (
    <div className="ax-sheet-body ax-operation-choice">
      <div className="ig-lab">United States turn · separate powers</div>
      <h3>Who conducts combat first?</h3>
      <p>Complete every Combat Move and battle for the first force before the second begins. The same order carries into two separate noncombat blocks.</p>
      <button className="ax-mega xl" onClick={() => act({ type: 'chooseUsOperationOrder', first: 'china' })}>
        <b>CHINA FIRST</b><span>Chinese infantry + Flying Tigers, then United States</span>
      </button>
      <button className="ax-mega xl" onClick={() => act({ type: 'chooseUsOperationOrder', first: 'usa' })}>
        <b>USA FIRST</b><span>United States forces, then China</span>
      </button>
    </div>
  );
}

function neighborsOf(id: string): string[] {
  const t = TERR[id];
  if (t) return [...t.adj, ...(t.coastTo ?? [])];
  const z = ZONE[id];
  if (z) return [...z.adj, ...(z.coastTo ?? [])];
  return [];
}

export const AXIS_INTRO: Intro = {
  title: 'Axis & Allies Anniversary',
  tagline: 'World War II across the whole map: 1941 or 1942, Axis against Allies.',
  goal: 'Win as a side. Capture and hold victory cities until your side holds the number chosen at game start (13, 15, or 18) at the end of a full round. Income from the territories you control buys new units every turn.',
  points: [
    { label: 'Your turn, one clear sequence', detail: 'Research (when enabled), purchase units, declare attacks, resolve combat, reposition, then mobilize and collect income. The device walks you through every stage.' },
    { label: 'Attacks resolve at once', detail: 'Declare one attack and it goes straight to the battle: dice on the TV, casualties picked by the defender, retreat is the attacker\'s call. Then declare your next attack.' },
    { label: 'Purchases stage first', detail: 'Bought units wait in the mobilization zone on the board and enter play at your industrial complexes during mobilize, limited by each territory\'s income value.' },
    { label: 'Transports and carriers', detail: 'Transports carry one land unit plus one infantry; offloading into a fight is an amphibious assault, with battleships and cruisers bombarding ahead of the landing. Carriers hold two fighters.' },
    { label: 'Income and objectives', detail: 'Collect your production at turn end (plus national objectives if enabled). Capture an enemy capital and their unspent money is yours.' },
  ],
  rulebook: '/axis/rulebook.pdf',
  walkthrough: [
    { title: 'The map is your controller', body: 'Your whole nation is on the board. Anything you can tap pulses gold on the map, and every tap is mirrored as a button in the left panel · use whichever is easier. The panel collapses if you want the whole map.' },
    { title: 'Buying units', body: 'In PURCHASE UNITS, tap the + beside a unit to buy it. Your purchases stand in the MOBILIZATION ZONE box printed on the board · everyone can see them · and they deploy to your factories at the end of your turn.' },
    { title: 'Declaring an attack', body: 'In COMBAT MOVE, tap the space your forces start in, set how many of each unit go, then tap a red target. The battle starts immediately · dice, casualties, the lot · and the TV flies in to watch.' },
    { title: 'Fighting a battle', body: 'Tap ROLL THE DICE to fire. When your side takes hits, you choose which units die. Between rounds the attacker chooses: press on or retreat. Submarines may slip away instead of fighting.' },
    { title: 'Bombing raids', body: 'Send only bombers at a territory with an enemy factory and you will be offered a STRATEGIC BOMBING RAID: their AA fires first, your survivors deal dice of damage that chokes what the factory can build.' },
    { title: 'Amphibious assaults', body: 'Load infantry onto transports in NONCOMBAT MOVE. Next turn, start an attack from the sea zone: pick the troops aboard plus any battleships and cruisers, and tap the shore. The big ships bombard before the landing.' },
    { title: 'Noncombat and mobilize', body: 'After combat, reposition anything that did not fight, land your aircraft somewhere friendly, and place your staged purchases at industrial complexes. Each factory places up to the territory\'s printed income number.' },
    { title: 'Income and the win', body: 'Your turn ends by collecting income · watch the notes fly into your bank at the bottom right. Tap the bank any time to count your bills. Hold enough victory cities at the end of a round and your side wins.' },
  ],
};

// ---------- shared bits ----------

function Chip({ label, onTap, tone, disabled, title }: {
  label: string; onTap?: () => void; tone?: 'gold' | 'plain' | 'danger' | 'future'; disabled?: boolean; title?: string;
}) {
  return (
    <button className="ax-chip" data-tone={tone ?? 'plain'} onClick={onTap} disabled={disabled} title={title}>{label}</button>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="ax-step">
      <button onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Decrease ${label}`}>−</button>
      <b className="ig-num" aria-live="polite">{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </span>
  );
}

// ---------- per-phase sheets (rendered inside the left panel) ----------

function ResearchChartDetails({ chart }: { chart: AxisResearchChartPresentation }) {
  return (
    <span className="ax-col" style={{ gap: 7, textAlign: 'left', width: '100%' }}>
      {chart.advances.map((advance) => (
        <span key={advance.key} style={{ opacity: advance.developed ? 0.58 : 1 }}>
          <b>{advance.developed ? '✓' : advance.roll}. {advance.name}</b>
          <small style={{ display: 'block', marginTop: 2 }}>{advance.text}</small>
        </span>
      ))}
    </span>
  );
}

function ResearchChartOverview({ charts }: { charts: AxisResearchChartPresentation[] }) {
  return (
    <div className="ax-col" style={{ gap: 6, marginTop: 10 }}>
      {charts.map((chart) => (
        <details key={chart.chart}>
          <summary>
            <b>Chart {chart.chart}</b> · {chart.complete ? 'complete' : `${chart.remaining} of 6 remaining`}
          </summary>
          <div style={{ marginTop: 7 }}><ResearchChartDetails chart={chart} /></div>
        </details>
      ))}
    </div>
  );
}

function ResearchSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const p = view.powers[view.active];
  const fullyDeveloped = TECHS.every((tech) => p.techs.includes(tech.key));
  const charts = axisResearchChartPresentation(p.techs);
  const maxNewDice = Math.floor(p.ipcs / RESEARCH_DIE_COST);
  const [dice, setDice] = useState(() => p.researchTokens > 0 ? 0 : Math.min(1, maxNewDice));
  useEffect(() => { map(MAP_IDLE); }, []);
  if (view.awaitingChart) {
    return (
      <div className="ax-sheet-body">
        <div className="ig-lab">Breakthrough · choose a chart</div>
        <p style={{ fontSize: 13, opacity: 0.78 }}>You receive one new advance this turn. Results you already developed are rerolled automatically.</p>
        <div className="ax-col">
          {charts.map((chart) => (
            <button
              key={chart.chart}
              className="ax-big"
              disabled={chart.complete}
              onClick={() => act({ type: 'chooseChart', chart: chart.chart })}
              aria-label={`Choose research chart ${chart.chart}. ${chart.complete ? 'Complete' : `${chart.remaining} advances remaining`}.`}
            >
              <b>Chart {chart.chart} · {chart.complete ? 'COMPLETE' : `${chart.remaining} REMAINING`}</b>
              <ResearchChartDetails chart={chart} />
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (fullyDeveloped) {
    return (
      <div className="ax-sheet-body">
        <div className="ig-lab">Research &amp; Development</div>
        <div className="ax-empty-hint">Every research advance is already developed. Your researchers stand down without spending IPCs or tokens.</div>
        <ResearchChartOverview charts={charts} />
        <div className="ax-row"><Chip label="Continue to purchase" tone="gold" onTap={() => act({ type: 'endPhase' })} /></div>
      </div>
    );
  }
  const cost = dice * RESEARCH_DIE_COST;
  const totalResearchers = p.researchTokens + dice;
  const rollLabel = dice === 0
    ? totalResearchers > 0
      ? `Roll ${totalResearchers} standing researcher${totalResearchers === 1 ? '' : 's'}`
      : 'No researchers ready'
    : `Buy ${dice} new · roll ${totalResearchers}`;
  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">Research & Development</div>
      <div className="ax-row" style={{ alignItems: 'center', gap: 14 }}>
        <Stepper value={dice} max={maxNewDice} onChange={setDice} label="new research dice" />
        <span style={{ opacity: 0.75, fontSize: 13 }}>
          {dice > 0 ? `${cost} IPCs for ${dice} new. ` : p.researchTokens > 0 ? 'No new spend. ' : ''}
          {totalResearchers > 0 ? `${totalResearchers} ${totalResearchers === 1 ? 'researcher rolls' : 'researchers roll'} now. ` : ''}
          Any 6 creates one breakthrough this turn; multiple 6s never grant extra advances. Failed researchers stay.
        </span>
      </div>
      <ResearchChartOverview charts={charts} />
      <div className="ax-row ax-wrap">
        <Chip label={rollLabel} tone="gold" disabled={cost > p.ipcs || totalResearchers < 1} onTap={() => act({ type: 'buyResearch', dice })} />
        <Chip label="Skip research" onTap={() => act({ type: 'endPhase' })} />
      </div>
    </div>
  );
}

// Purchasing lives in a refined center-screen popup over darker glass
// (owner directive): unit silhouette, name, combat line, price; buy on tap,
// return staged units with the small counter.
function PurchaseSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const p = view.powers[view.active];
  const [open, setOpen] = useState(true);
  const purchasedTotal = Object.values(p.purchasedThisTurn)
    .reduce((total, purchase) => total + (purchase?.count ?? 0), 0);
  useEffect(() => { map({ ...MAP_IDLE, focusSpace: 'mobilization' }); }, []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  // repairable factories
  const damaged = AXIS_MAP.territories.filter((t) =>
    view.control[t.id] === view.active && (view.factoryDamage[t.id] ?? 0) > 0
    && (view.board[t.id] ?? []).some((s) => s.key === 'factory'));
  return (
    <>
      <div className="ax-sheet-body">
        <div className="ig-lab">Purchase units · {p.ipcs} IPCs</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          {purchasedTotal > 0
            ? `${purchasedTotal} unit${purchasedTotal === 1 ? '' : 's'} bought this turn.`
            : 'Nothing bought this turn.'}
        </div>
        {view.active === 'usa' && (
          <div className="ax-china-grant-note">
            <b>China raises {view.chinaGrant} infantry</b>
            <span>Grant locked at the start of Purchase Units · deploy with U.S. mobilization.</span>
          </div>
        )}
        <div className="ax-row ax-wrap">
          <Chip label="Open the armory" tone="gold" onTap={() => setOpen(true)} />
          <Chip label="Done purchasing" onTap={() => act({ type: 'endPhase' })} />
        </div>
      </div>
      {open && createPortal(
        <div className="ax-modal dark" onClick={() => setOpen(false)} role="presentation">
          <div className="ax-buy ig-glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ax-buy-title">
            <header className="ax-buy-head">
              <div>
                <div className="ax-decision-kicker">Reinforcement command</div>
                <h2 id="ax-buy-title">Purchase units</h2>
                <p><b className="ig-num">{p.ipcs} IPCs</b> available · A attack · D defense · M movement</p>
              </div>
              <button className="ax-chip" onClick={() => setOpen(false)} aria-label="Close armory and return to the map">Map</button>
            </header>
            <div className="ax-buy-grid">
              {BUYABLE.map((k) => {
                const current = axisCurrentUnitReference(k, p.techs);
                const cost = current.cost;
                const afford = p.ipcs >= cost;
                const purchase = p.purchasedThisTurn[k];
                const queued = purchase?.count ?? 0;
                const u = UNITS[k];
                return (
                  <div key={k} className={`ax-buy-row${queued > 0 ? ' queued' : ''}`}>
                    <span className="ax-buy-icon"><UnitIcon unitKey={k} size={30} title={u.name} /></span>
                    <span className="ax-buy-name">
                      <b>{u.name}</b>
                      <em title="Current values include developed technology">
                        A {current.attack || '—'} · D {current.defense || '—'} · M {current.move || '—'}
                      </em>
                    </span>
                    <span className="ax-buy-ctl">
                      {queued > 0 && (
                        <>
                          <button
                            className="ax-buy-btn"
                            title={`Return one for ${purchase!.paidUnitCost} IPC${purchase!.paidUnitCost === 1 ? '' : 's'}`}
                            onClick={() => act({ type: 'unbuy', key: k, count: 1 })}
                            aria-label={`Return one ${u.name} bought this turn`}
                          >−</button>
                          <b className="ig-num" aria-label={`${queued} ${u.name} queued this turn`}>{queued}</b>
                        </>
                      )}
                        <button
                          className="ax-buy-btn buy"
                          autoFocus={k === BUYABLE[0]}
                          disabled={!afford}
                        title={afford ? undefined : `Costs ${cost} IPCs, you have ${p.ipcs}`}
                        onClick={() => act({ type: 'buy', key: k, count: 1 })}
                        aria-label={`Buy one ${u.name}`}
                      >+</button>
                      <span className="ax-buy-price ig-num"><b>{cost}</b><small>IPC</small></span>
                    </span>
                  </div>
                );
              })}
            </div>
            {damaged.length > 0 && (
              <div className="ax-buy-repairs">
                <div className="ig-lab">Factory repairs · {p.techs.includes('increasedFactory') ? 'up to 2 damage per 1 IPC' : '1 damage per 1 IPC'}</div>
                <div className="ax-row ax-wrap" style={{ marginTop: 6 }}>
                  {damaged.map((t) => {
                    const damage = view.factoryDamage[t.id] ?? 0;
                    const offer = axisFactoryRepairOffer(damage, p.techs);
                    if (!offer) return null;
                    return (
                      <Chip
                        key={t.id}
                        label={`Repair ${t.name} · ${offer.count} damage for ${offer.cost} IPC (${damage} marked)`}
                        disabled={p.ipcs < offer.cost}
                        onTap={() => act({ type: 'repair', territory: t.id, count: offer.count })}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            <footer className="ax-buy-foot">
              <span>Current purchases wait in Mobilization. Older carryover remains committed and is not part of this cart.</span>
              <button className="ax-order-go" onClick={() => act({ type: 'endPhase' })}>DONE PURCHASING</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// unit selection: keys are `${space}|${unit}` (or `${space}|cargo:${unit}`),
// so a force can be gathered from SEVERAL regions and sent as one order —
// the HOI4 arrows merge the origins into a single strike.
type TakeKey = string;
const keySpace = (k: TakeKey) => k.slice(0, k.indexOf('|'));
const keyUnitPart = (k: TakeKey) => k.slice(k.indexOf('|') + 1);
const isCargoPart = (part: string) => part.startsWith('cargo:');
const partUnit = (part: string): UnitKey => (isCargoPart(part) ? part.slice(6) : part) as UnitKey;

function MoveFlow({ view, act, mode, map }: { view: AxisView; act: Act; mode: 'combat' | 'noncombat'; map: PublishMap }) {
  const me = view.operatingPower ?? view.active;
  const techs = me === 'china' ? [] : view.powers[me].techs;
  const [origin, setOrigin] = useState<string | null>(null); // the focused region
  const [peek, setPeek] = useState<string | null>(null); // any tapped region zooms
  // Per-piece ordinals keep identical sculpts independently selectable and are
  // carried through the action so the reducer moves the exact tapped hull.
  const [take, setTake] = useState<Record<TakeKey, Set<number>>>({});
  const takeSignatures = useRef<Record<TakeKey, string>>({});
  const [transportOrders, setTransportOrders] = useState<Record<string, AxisTransportCargoOrder[]>>({});
  const [loadTarget, setLoadTarget] = useState<{ zone: string; territory: string } | null>(null);
  const [loadOrders, setLoadOrders] = useState<AxisTransportCargoOrder[]>([]);
  const [pending, setPending] = useState<Target | null>(null);
  const [carrierPlanKey, setCarrierPlanKey] = useState<string | null>(null);
  const [sbrAsk, setSbrAsk] = useState<string | null>(null);
  const [rocketLauncherKey, setRocketLauncherKey] = useState<string | null>(null);
  const [rocketTarget, setRocketTarget] = useState<string | null>(null);
  const [paratrooperPairKeys, setParatrooperPairKeys] = useState<string[]>([]);
  const [paratrooperTarget, setParatrooperTarget] = useState<string | null>(null);
  const [paratrooperSupportKeys, setParatrooperSupportKeys] = useState<string[]>([]);
  const [confirmStranded, setConfirmStranded] = useState(false);
  const airWarningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(null);
    setPeek(null);
    setTake({});
    setTransportOrders({});
    setLoadTarget(null);
    setLoadOrders([]);
    takeSignatures.current = {};
    setPending(null);
    setCarrierPlanKey(null);
    setSbrAsk(null);
    setRocketLauncherKey(null);
    setRocketTarget(null);
    setParatrooperPairKeys([]);
    setParatrooperTarget(null);
    setParatrooperSupportKeys([]);
    setConfirmStranded(false);
  }, [me, mode]);

  const side = (p: string) => (p === 'china' ? 'allies' : POWERS[p as PowerKey].coalition);
  const mySide = me === 'china' ? 'allies' : POWERS[me].coalition;

  const myStacksAt = (id: string): UnitStack[] =>
    (view.board[id] ?? []).filter((s) => s.power === me);

  const rocketLaunchers = useMemo(() => mode === 'combat' ? axisRocketLauncherCards({
    view,
    idx: AXIS_INDEX,
    power: me,
  }) : [], [mode, me, view]);
  const rocketKey = (launcher: (typeof rocketLaunchers)[number]) =>
    `${launcher.source}:${launcher.ordinal}:${launcher.selectionSig}`;
  const selectedRocketLauncher = rocketLaunchers.find((launcher) =>
    rocketKey(launcher) === rocketLauncherKey) ?? null;
  const selectedRocketTarget = selectedRocketLauncher?.targets.find((target) =>
    target.target === rocketTarget) ?? null;

  const paratrooperCards = useMemo(() => mode === 'combat' ? axisParatrooperPairCards({
    view,
    idx: AXIS_INDEX,
    power: me,
  }) : [], [mode, me, view]);
  const selectedParatrooperCards = useMemo(() => paratrooperPairKeys.flatMap((key) => {
    const card = paratrooperCards.find((candidate) => candidate.key === key);
    return card ? [card] : [];
  }), [paratrooperCards, paratrooperPairKeys.join('|')]);
  const paratrooperTargets = useMemo(
    () => axisParatrooperCommonTargets(selectedParatrooperCards),
    [selectedParatrooperCards],
  );
  const selectedParatrooperTarget = useMemo(() => paratrooperTargets.find((option) =>
    option.target === paratrooperTarget) ?? null, [paratrooperTarget, paratrooperTargets]);

  interface ParatrooperSupportCard {
    key: string;
    from: string;
    unit: UnitKey;
    ordinal: number;
    physicalOrdinal: number;
    selectionSig: string;
  }
  const paratrooperSupportCards = useMemo((): ParatrooperSupportCard[] => {
    if (!selectedParatrooperTarget || me === 'china') return [];
    const reserved = new Set(selectedParatrooperCards.map((card) =>
      `${card.from}:infantry:${card.infantry.ordinal}`));
    return AXIS_MAP.territories
      .filter((territory) => territory.adj.includes(selectedParatrooperTarget.target))
      .flatMap((territory) => {
        const stacks = view.board[territory.id] ?? [];
        const signatures = new Map<UnitKey, string>();
        return enumerateAxisPhysicalPieces(stacks).flatMap((piece) => {
          if (!piece.available || piece.power !== me || piece.ordinal == null) return [];
          const profile = UNITS[piece.key];
          if (profile.domain !== 'land' || profile.attack <= 0 || piece.key === 'aaGun') return [];
          if (reserved.has(`${territory.id}:${piece.key}:${piece.ordinal}`)) return [];
          const selectionSig = signatures.get(piece.key)
            ?? axisPieceSelectionSignature(stacks, me, piece.key);
          signatures.set(piece.key, selectionSig);
          return [{
            key: `${territory.id}:${piece.key}:${piece.ordinal}`,
            from: territory.id,
            unit: piece.key,
            ordinal: piece.ordinal,
            physicalOrdinal: piece.physicalOrdinal,
            selectionSig,
          }];
        });
      });
  }, [selectedParatrooperTarget, selectedParatrooperCards, me, view.board]);
  const selectedParatrooperSupport = useMemo(() => paratrooperSupportKeys.flatMap((key) => {
    const card = paratrooperSupportCards.find((candidate) => candidate.key === key);
    return card ? [card] : [];
  }), [paratrooperSupportCards, paratrooperSupportKeys.join('|')]);
  const paratrooperSupportForces = useMemo(() => {
    const groups = new Map<string, Map<UnitKey, ParatrooperSupportCard[]>>();
    for (const card of selectedParatrooperSupport) {
      const units = groups.get(card.from) ?? new Map<UnitKey, ParatrooperSupportCard[]>();
      const cards = units.get(card.unit) ?? [];
      cards.push(card);
      units.set(card.unit, cards);
      groups.set(card.from, units);
    }
    return [...groups].map(([from, units]) => ({
      from,
      units: [...units].map(([key, cards]) => ({
        key,
        count: cards.length,
        ordinals: cards.map((card) => card.ordinal).sort((a, b) => a - b),
        selectionSig: cards[0]!.selectionSig,
      })),
    }));
  }, [selectedParatrooperSupport]);

  useEffect(() => {
    if (rocketLauncherKey && !selectedRocketLauncher) {
      setRocketLauncherKey(null);
      setRocketTarget(null);
    } else if (rocketTarget && !selectedRocketTarget) {
      setRocketTarget(null);
    }
  }, [rocketLauncherKey, rocketTarget, selectedRocketLauncher, selectedRocketTarget]);

  useEffect(() => {
    const currentKeys = new Set(paratrooperCards.map((card) => card.key));
    if (paratrooperPairKeys.some((key) => !currentKeys.has(key))) {
      setParatrooperPairKeys((keys) => keys.filter((key) => currentKeys.has(key)));
    }
    if (paratrooperTarget && !selectedParatrooperTarget) {
      setParatrooperTarget(null);
      setParatrooperSupportKeys([]);
    } else {
      const supportKeys = new Set(paratrooperSupportCards.map((card) => card.key));
      if (paratrooperSupportKeys.some((key) => !supportKeys.has(key))) {
        setParatrooperSupportKeys((keys) => keys.filter((key) => supportKeys.has(key)));
      }
    }
  }, [
    paratrooperCards, paratrooperPairKeys, paratrooperTarget,
    selectedParatrooperTarget, paratrooperSupportCards, paratrooperSupportKeys,
  ]);

  // `moved` blocks another order in the current phase. At noncombat the engine
  // clears it only from aircraft; `movementSpent` still limits each survivor to
  // the exact range left after its combat flight.
  const availableInStack = (stack: UnitStack) => Math.max(0, stack.count - (stack.moved ?? 0));
  const selectableUnit = (stack: UnitStack) =>
    stack.key !== 'factory'
    && !(mode === 'combat' && stack.key === 'aaGun')
    && (me !== 'china' || stack.key === 'infantry' || stack.key === 'fighter');
  const availableUnitCount = (id: string, key: UnitKey) => myStacksAt(id)
    .filter((stack) => stack.key === key && selectableUnit(stack))
    .reduce((total, stack) => total + availableInStack(stack), 0);
  const availableUnitsAt = (id: string): { key: UnitKey; count: number }[] => {
    const counts = new Map<UnitKey, number>();
    for (const stack of myStacksAt(id)) {
      if (!selectableUnit(stack)) continue;
      const available = availableInStack(stack);
      if (available > 0) counts.set(stack.key, (counts.get(stack.key) ?? 0) + available);
    }
    return [...counts].map(([key, count]) => ({ key, count }));
  };

  const hullCardsAt = (id: string): AxisTransportHullCard[] => me === 'china'
    ? []
    : listAxisTransportHullCards(id, view.board[id] ?? [], me, mode);
  const hasMyCargoHull = (id: string): boolean => hullCardsAt(id)
    .some((card) => card.manifest.some((cargo) => cargo.power === me));

  const origins = useMemo(
    () => Object.keys(view.board).filter((id) =>
      availableUnitsAt(id).length > 0 || hasMyCargoHull(id)),
    [view.board, me, mode],
  );

  const enemyAt = (id: string) => (view.board[id] ?? []).some((s) => side(s.power) !== mySide);
  const hostileControl = (id: string) => {
    const h = view.control[id];
    return !isSz(id) && h != null && side(h) !== mySide;
  };
  const friendly = (id: string) => {
    if (isSz(id)) return !axisSurfaceHostileSea(view, me, id);
    const h = view.control[id];
    return h != null && side(h) === mySide;
  };
  const passable = (id: string) => !TERR[id]?.isImpassable && (isSz(id) || TERR[id]?.originalOwner != null || view.control[id] != null);

  const ordinaryPicked = Object.entries(take)
    .filter(([, ordinals]) => ordinals.size > 0)
    .map(([key, ordinals]) => [key, ordinals.size] as [TakeKey, number]);
  const cargoPicked: [TakeKey, number][] = Object.entries(transportOrders).flatMap(([space, orders]) => {
    const totals = new Map<UnitKey, number>();
    for (const order of orders) {
      for (const unit of order.units) totals.set(unit.key, (totals.get(unit.key) ?? 0) + unit.count);
    }
    return [...totals].map(([key, count]) => [`${space}|cargo:${key}`, count] as [TakeKey, number]);
  });
  const picked = [...ordinaryPicked, ...cargoPicked];
  const pickedSpaces = [...new Set(picked.map(([k]) => keySpace(k)))];
  const allUnitParts = picked.map(([k]) => keyUnitPart(k));
  const anyCargo = allUnitParts.some(isCargoPart);
  const ownUnits = allUnitParts.filter((p) => !isCargoPart(p)).map(partUnit);
  const onlyBombers = ownUnits.length > 0 && ownUnits.every((k) => k === 'bomber') && !anyCargo;
  const selectedPhysical = useMemo(() => {
    const result: (AxisPhysicalPiece & { space: string })[] = [];
    for (const [takeKey, ordinals] of Object.entries(take)) {
      const part = keyUnitPart(takeKey);
      if (isCargoPart(part)) continue;
      const space = keySpace(takeKey);
      const key = partUnit(part);
      for (const piece of enumerateAxisPhysicalPieces(view.board[space] ?? [])) {
        if (!piece.available || piece.power !== me || piece.key !== key || piece.ordinal == null) continue;
        if (ordinals.has(piece.ordinal)) result.push({ ...piece, space });
      }
    }
    return result;
  }, [take, view.board, me]);
  const selectedAir: AirUnitGroup[] = selectedPhysical
    .filter((piece) => isAirKey(piece.key))
    .map((piece) => ({
      from: piece.space,
      key: piece.key as AirUnitKey,
      count: 1,
      movementSpent: piece.movementSpent,
    }));
  const selectedCarrierFighters = me === 'china'
    ? []
    : axisCarrierSelectedFighters(selectedPhysical);
  const carrierPlansFor = (target: string) => me === 'china' ? [] : axisCarrierLandingPlans({
    view,
    idx: AXIS_INDEX,
    power: me,
    fighters: selectedCarrierFighters,
    mode,
    target,
  });
  const carrierMovesTo = (destination: string): CarrierMoveProjection[] => selectedPhysical
    .filter((piece) => piece.key === 'carrier')
    .map((piece) => ({
      from: piece.space,
      to: destination,
      count: 1,
      cargoFighters: (piece.cargo ?? [])
        .filter((cargo) => cargo.key === 'fighter' && sameAxisSide(cargo.power, me))
        .reduce((total, cargo) => total + cargo.count, 0),
    }));
  const stranded = useMemo(() => {
    if (mode !== 'noncombat') return [];
    if (me !== 'china') return strandedAircraft(view, me);
    return Object.entries(view.board).flatMap(([space, stacks]) => {
      const count = stacks.filter((stack) => stack.power === 'china' && stack.key === 'fighter')
        .reduce((total, stack) => total + stack.count, 0);
      return count > 0 && !isChinaFriendlyLandingTerritory(TERR[space], view.control, view.contested)
        ? [{ space, key: 'fighter' as const, count, reason: 'hostile-territory' as const }]
        : [];
    });
  }, [mode, view.board, view.control, view.contested, me]);
  const strandedTotal = stranded.reduce((total, group) => total + group.count, 0);
  useEffect(() => {
    if (!confirmStranded) return;
    const dialog = airWarningRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = () => [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    buttons()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmStranded(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = buttons();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [confirmStranded]);

  // If another controller changes a selected stack, clear that type instead of
  // silently transferring a glow to a different physical sculpt at the same
  // ordinal. The same signature is sent to the reducer as a final race guard.
  const selectionSignatures = useMemo(() => {
    const signatures: Record<TakeKey, string> = {};
    for (const [space, stacks] of Object.entries(view.board)) {
      const keys = new Set<UnitKey>();
      for (const stack of stacks) {
        if (stack.power !== me || !selectableUnit(stack)) continue;
        keys.add(stack.key);
      }
      for (const key of keys) {
        signatures[`${space}|${key}`] = axisPieceSelectionSignature(stacks, me, key);
      }
    }
    return signatures;
  }, [view.board, me, mode]);
  const previousSelectionSignatures = useRef(selectionSignatures);

  // A second controller can change the public board while this sheet is open.
  // Never leave a now-spent unit selected or strand the picker on an empty origin.
  useEffect(() => {
    const previous = previousSelectionSignatures.current;
    setTake((current) => {
      let changed = false;
      const next: Record<TakeKey, Set<number>> = {};
      for (const [key, ordinals] of Object.entries(current)) {
        if (previous[key] !== selectionSignatures[key]) {
          changed = true;
          delete takeSignatures.current[key];
          continue;
        }
        const space = keySpace(key);
        const part = keyUnitPart(key);
        if (isCargoPart(part)) {
          changed = true;
          delete takeSignatures.current[key];
          continue;
        }
        const max = availableUnitCount(space, partUnit(part));
        const valid = new Set([...ordinals].filter((ordinal) => ordinal >= 0 && ordinal < max));
        if (valid.size > 0) next[key] = valid;
        else delete takeSignatures.current[key];
        if (valid.size !== ordinals.size) changed = true;
      }
      return changed ? next : current;
    });
    previousSelectionSignatures.current = selectionSignatures;
  }, [selectionSignatures]);

  useEffect(() => {
    setTransportOrders((current) => {
      let changed = false;
      const next: Record<string, AxisTransportCargoOrder[]> = {};
      for (const [space, orders] of Object.entries(current)) {
        const cards = hullCardsAt(space);
        const valid = orders.filter((order) => {
          const card = cards.find((candidate) => sameAxisTransportRef(candidate, order));
          if (!card || !card.canOffload || card.selectionSig !== order.selectionSig) return false;
          return order.units.every((unit) =>
            unit.count <= (card.cargo.find((cargo) => cargo.key === unit.key)?.count ?? 0));
        });
        if (valid.length) next[space] = valid;
        if (valid.length !== orders.length) changed = true;
      }
      return changed ? next : current;
    });
  }, [view.board, me, mode]);

  useEffect(() => {
    if (origin && !origins.includes(origin)) {
      setOrigin(null);
      setPending(null);
    }
  }, [origin, origins.join(',')]);

  const surfaceHostileSea = (id: string) => axisSurfaceHostileSea(view, me, id);
  interface TransportRoute { zone: string; via?: string }
  const transportRoutesFrom = (space: string): TransportRoute[] => {
    const selected = transportOrders[space] ?? [];
    if (!isSz(space) || selected.length === 0) return [];
    const cards = hullCardsAt(space);
    const allMovable = selected.every((order) =>
      cards.find((card) => sameAxisTransportRef(card, order))?.movable === true);
    const routes = new Map<string, TransportRoute>();
    if (!surfaceHostileSea(space)) routes.set(space, { zone: space });
    if (!allMovable) return [...routes.values()];
    for (const route of axisSeaRouteTargets({
      snapshot: view,
      idx: AXIS_INDEX,
      power: me,
      from: space,
      units: ['transport'],
      phase: 'noncombat',
    })) {
      routes.set(`${route.id}|${route.via ?? ''}`, { zone: route.id, ...(route.via ? { via: route.via } : {}) });
    }
    return [...routes.values()];
  };

  interface Target {
    id: string;
    via?: string;
    /** Explicit ingress for each selected origin; null means a direct route. */
    routeByOrigin?: Record<string, string | null>;
    amphibious?: boolean;
    offloadZone?: string;
    sbr?: boolean;
    /** Factory already received its one strategic raid this turn. */
    raidUnavailable?: boolean;
    /** Amber purchased-carrier fallbacks when ordinary air landing fails. */
    carrierPlans?: AxisCarrierLandingPlan[];
  }

  // legal destinations for ONE origin's picked units
  const targetsFor = (space: string): Target[] => {
    const parts = picked.filter(([k]) => keySpace(k) === space).map(([k]) => keyUnitPart(k));
    if (parts.length === 0) return [];
    const cargoHere = parts.some(isCargoPart);
    const selectedHere: AxisMovementUnit[] = ordinaryPicked
      .filter(([key]) => keySpace(key) === space)
      .map(([key, count]) => ({ key: partUnit(keyUnitPart(key)), count }));
    const own = selectedHere.map((unit) => unit.key);
    const landUnits = selectedHere.filter((unit) => UNITS[unit.key].domain === 'land');
    const seaUnits = selectedHere
      .filter((unit) => UNITS[unit.key].domain === 'sea')
      .map((unit) => unit.key as AxisSeaUnitKey);
    const shipsOnly = own.length > 0 && own.every((k) => SEA_KEYS.includes(k)) && !cargoHere;
    const bombardmentGroup = seaUnits.length > 0
      && seaUnits.every((key) => key === 'battleship' || key === 'cruiser')
      && own.every((key) => SEA_KEYS.includes(key) || AIR_KEYS.includes(key))
      && !cargoHere;
    const airOnly = own.length > 0 && own.every((k) => AIR_KEYS.includes(k)) && !cargoHere;
    const landHere = own.some((k) => !SEA_KEYS.includes(k) && !AIR_KEYS.includes(k));
    const seaOrigin = isSz(space);
    const out: Target[] = [];
    const chinaAllowed = (id: string) => me !== 'china'
      || (!isSz(id) && Boolean(TERR[id]) && isChinaOperatingTerritory(TERR[id]));
    const enemyFactory = (id: string) => !isSz(id) && hostileControl(id) && (view.board[id] ?? []).some((s) => s.key === 'factory');
    const sbrTarget = (id: string) => me !== 'china'
      && enemyFactory(id)
      && axisStrategicRaidTargetAvailable(view, me, id);
    const selectedAirHere = selectedAir.filter((unit) => unit.from === space);
    const airRangeHere = selectedAirHere.length > 0
      ? Math.min(...selectedAirHere.map((unit) => Math.max(0,
          (me === 'china' ? UNITS.fighter.move : airUnitRange(unit.key, techs)) - (unit.movementSpent ?? 0))))
      : 0;
    const addAirTargets = (predicate: (id: string) => boolean) => {
      const reachable = me === 'china'
        ? chinaReachableDistances(AXIS_MAP.territories, space, airRangeHere)
        : airReachableDistances(AXIS_INDEX, space, airRangeHere);
      for (const [id] of reachable) {
        if (id === space || !chinaAllowed(id) || !predicate(id) || out.some((target) => target.id === id)) continue;
        const raidFactory = mode === 'combat' && onlyBombers && enemyFactory(id);
        out.push({
          id,
          sbr: raidFactory && sbrTarget(id),
          ...(raidFactory && !sbrTarget(id) ? { raidUnavailable: true } : {}),
        });
      }
    };

    if (mode === 'combat') {
      const want = (id: string) => (isSz(id) ? enemyAt(id) : enemyAt(id) || hostileControl(id));
      if (airOnly) {
        addAirTargets((id) => want(id) && (isSz(id) || passable(id)));
        return out;
      }
      if (seaOrigin) {
        if (cargoHere) {
          for (const route of transportRoutesFrom(space)) {
            for (const t of ZONE[route.zone]?.coastTo ?? []) {
              if (want(t) && passable(t) && !out.some((target) =>
                target.id === t && target.offloadZone === route.zone && target.via === route.via)) {
                out.push({ id: t, amphibious: true, offloadZone: route.zone, ...(route.via ? { via: route.via } : {}) });
              }
            }
          }
        }
        if (shipsOnly || (own.length > 0 && !cargoHere)) {
          for (const route of axisSeaRouteTargets({
            snapshot: view,
            idx: AXIS_INDEX,
            power: me,
            from: space,
            units: seaUnits,
            phase: 'combatMove',
          })) if (want(route.id)) out.push(route);
        }
        if (bombardmentGroup && Object.keys(transportOrders).some((transportOrigin) =>
          transportRoutesFrom(transportOrigin).some((route) => route.zone === space))) {
          for (const territory of ZONE[space]?.coastTo ?? []) {
            if (want(territory) && passable(territory)) out.push({ id: territory });
          }
        }
        return out;
      }
      for (const n of neighborsOf(space)) {
        if (isSz(n) && landHere) continue;
        if (!isSz(n) && !passable(n)) continue;
        if (chinaAllowed(n) && want(n)) out.push({ id: n, sbr: onlyBombers && sbrTarget(n) });
      }
      for (const route of axisLandTwoStepTargets({
        snapshot: view,
        idx: AXIS_INDEX,
        power: me,
        from: space,
        units: landUnits,
        techs,
        phase: 'combatMove',
      })) if (want(route.id) && passable(route.id)) out.push(route);
      return out;
    }

    // noncombat: never into or through hostile or neutral ground
    if (airOnly) {
      addAirTargets((id) => me === 'china'
        ? !isSz(id) && isChinaFriendlyLandingTerritory(TERR[id], view.control, view.contested) && !enemyAt(id)
        : isSz(id)
          ? friendly(id) || carrierPlansFor(id).length > 0
          : friendly(id) && !enemyAt(id) && passable(id));
      return out;
    }
    if (seaOrigin) {
      if (cargoHere && !surfaceHostileSea(space)) {
        for (const t of ZONE[space]?.coastTo ?? []) {
          if (!isSz(t) && friendly(t) && !enemyAt(t)) out.push({ id: t, offloadZone: space });
        }
      }
      if (shipsOnly || (own.length > 0 && !cargoHere)) {
        out.push(...axisSeaRouteTargets({
          snapshot: view,
          idx: AXIS_INDEX,
          power: me,
          from: space,
          units: seaUnits,
          phase: 'noncombat',
        }));
      }
      return out;
    }
    for (const n of neighborsOf(space)) {
      if (isSz(n)) continue;
      if (chinaAllowed(n) && friendly(n) && !enemyAt(n) && passable(n)) out.push({ id: n });
    }
    for (const route of axisLandTwoStepTargets({
      snapshot: view,
      idx: AXIS_INDEX,
      power: me,
      from: space,
      units: landUnits,
      techs,
      phase: 'noncombat',
    })) if (friendly(route.id) && !enemyAt(route.id) && passable(route.id)) out.push(route);
    return out;
  };

  // merged order: a target must be reachable by EVERY origin in the force
  const targets = useMemo((): Target[] => {
    if (pickedSpaces.length === 0) return [];
    let acc: Target[] | null = null;
    for (const space of pickedSpaces) {
      const ts = targetsFor(space);
      if (acc == null) {
        acc = ts.map((target) => ({
          ...target,
          routeByOrigin: { [space]: target.via ?? null },
        }));
        continue;
      }
      const combined: Target[] = [];
      for (const target of acc) {
        for (const other of ts) {
          if (target.id !== other.id
            || (target.offloadZone && other.offloadZone && target.offloadZone !== other.offloadZone)) continue;
          combined.push({
            ...target,
            amphibious: target.amphibious || other.amphibious,
            offloadZone: target.offloadZone ?? other.offloadZone,
            sbr: (target.sbr ?? false) && (other.sbr ?? false),
            raidUnavailable: target.raidUnavailable || other.raidUnavailable,
            routeByOrigin: {
              ...(target.routeByOrigin ?? {}),
              [space]: other.via ?? null,
            },
          });
        }
      }
      acc = combined;
    }
    const merged = acc ?? [];
    if (selectedAir.length === 0) return merged;
    return merged.flatMap((target) => {
      if (me === 'china') {
        if (mode === 'noncombat') {
          return isChinaFriendlyLandingTerritory(TERR[target.id], view.control, view.contested)
            ? [target] : [];
        }
        const contested = [...new Set([...view.contested, target.id])];
        return selectedAir.every((unit) => unit.key === 'fighter' && chinaFighterAttackHasLanding({
          territories: AXIS_MAP.territories,
          control: view.control,
          contested,
          from: unit.from,
          target: target.id,
          movementSpent: unit.movementSpent,
          range: UNITS.fighter.move,
        })) ? [target] : [];
      }
      const ordinaryAir = selectedPhysical
        .filter((piece) => isAirKey(piece.key))
        .map((piece) => ({
          from: piece.space,
          key: piece.key as AirUnitKey,
          count: 1,
          movementSpent: piece.movementSpent,
          ...((mode === 'combat' && piece.carrierLanding)
            || (mode === 'noncombat' && piece.carrierLanding?.seaZone === target.id)
            ? { futureCarrierZone: piece.carrierLanding!.seaZone }
            : {}),
        }));
      const args = {
        snapshot: view,
        idx: AXIS_INDEX,
        power: me,
        techs,
        air: ordinaryAir,
        carrierMoves: carrierMovesTo(target.id),
      };
      const ordinary = mode === 'combat'
        ? validateAirAttackLanding({ ...args, target: target.id }).ok
        : validateAirNoncombatLanding({ ...args, destination: target.id }).ok;
      if (ordinary) return [target];
      const carrierPlans = carrierPlansFor(target.id).filter((plan) => {
        const futureAir = selectedAir.map((unit) => unit.key === 'fighter'
          ? { ...unit, futureCarrierZone: plan.zone }
          : unit);
        const futureArgs = { ...args, air: futureAir };
        return mode === 'combat'
          ? validateAirAttackLanding({ ...futureArgs, target: target.id }).ok
          : validateAirNoncombatLanding({ ...futureArgs, destination: target.id }).ok;
      });
      return carrierPlans.length > 0 ? [{ ...target, carrierPlans }] : [];
    });
  }, [take, transportOrders, mode, view, techs.join(','), me]);

  const chooseTarget = (target: Target) => {
    setPending(target);
    setCarrierPlanKey(target.carrierPlans?.[0]?.key ?? null);
  };
  const selectedCarrierPlanFor = (target: Target): AxisCarrierLandingPlan | undefined =>
    target.carrierPlans?.find((plan) => plan.key === carrierPlanKey)
      ?? target.carrierPlans?.[0];

  const routeViaFor = (target: Target, space: string): string | undefined => {
    if (target.routeByOrigin && Object.prototype.hasOwnProperty.call(target.routeByOrigin, space)) {
      return target.routeByOrigin[space] ?? undefined;
    }
    return target.via;
  };
  const targetChoiceKey = (target: Target): string => {
    const routes = Object.entries(target.routeByOrigin ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([from, via]) => `${from}>${via ?? 'direct'}`)
      .join('|');
    return `${target.id}|${target.offloadZone ?? ''}|${routes}|${target.carrierPlans?.map((plan) => plan.key).join(',') ?? ''}`;
  };
  const targetRouteLabel = (target: Target): string => {
    const routes = Object.entries(target.routeByOrigin ?? {}).filter((entry): entry is [string, string] => entry[1] != null);
    if (routes.length === 0) return '';
    if (routes.length === 1 && pickedSpaces.length === 1) return ` via ${spaceName(routes[0][1])}`;
    return ` via ${routes.map(([from, via]) => `${spaceName(from)} → ${spaceName(via)}`).join(', ')}`;
  };

  const loadZones = useMemo(() => {
    if (!origin || isSz(origin) || me === 'china') return [];
    if (pickedSpaces.some((space) => space !== origin) || Object.keys(transportOrders).length > 0) return [];
    const selectedHere = ordinaryPicked
      .filter(([key]) => keySpace(key) === origin)
      .map(([key]) => partUnit(keyUnitPart(key)));
    if (selectedHere.length === 0 || selectedHere.some((key) => UNITS[key].domain !== 'land')) return [];
    return (TERR[origin]?.coastTo ?? []).filter((z) =>
      !surfaceHostileSea(z)
      && hullCardsAt(z).some((card) => card.canLoad && (mode === 'noncombat' || (card.owner === me && card.movable))));
  }, [origin, take, transportOrders, mode, view.board]);

  const reset = () => {
    setOrigin(null);
    setPeek(null);
    setTake({});
    setTransportOrders({});
    setLoadTarget(null);
    setLoadOrders([]);
    takeSignatures.current = {};
    setSbrAsk(null);
    setPending(null);
    setCarrierPlanKey(null);
    setRocketLauncherKey(null);
    setRocketTarget(null);
    setParatrooperPairKeys([]);
    setParatrooperTarget(null);
    setParatrooperSupportKeys([]);
  };
  const exactUnitPick = (takeKey: TakeKey): AxisUnitPick => {
    // Captured when the first sculpt was selected, never recomputed at submit
    // time; a board change therefore produces a server-side stale rejection
    // even if the user beats React's clearing effect.
    const signature = takeSignatures.current[takeKey] ?? previousSelectionSignatures.current[takeKey];
    return buildExactUnitPick(partUnit(keyUnitPart(takeKey)), take[takeKey] ?? new Set(), signature);
  };
  const exactOwnPicks = (space: string): AxisUnitPick[] => Object.keys(take)
    .filter((takeKey) => keySpace(takeKey) === space && !isCargoPart(keyUnitPart(takeKey)))
    .map(exactUnitPick)
    .filter((unit) => unit.count > 0);
  const finishMovement = () => {
    if (mode === 'noncombat' && strandedTotal > 0) {
      setConfirmStranded(true);
      return;
    }
    act({ type: 'endPhase' });
  };

  const commit = (t: Target, forceSbr?: boolean) => {
    const carrierPlan = selectedCarrierPlanFor(t);
    if (mode === 'combat') {
      if (t.sbr && forceSbr === undefined) { setSbrAsk(t.id); return; }
      if (forceSbr) {
        const forces = pickedSpaces.map((space) => {
          const bomber = exactOwnPicks(space).find((unit) => unit.key === 'bomber');
          return bomber ? {
            from: space,
            bombers: bomber.count,
            ordinals: bomber.ordinals,
            selectionSig: bomber.selectionSig,
          } : null;
        }).filter((force): force is NonNullable<typeof force> => force != null);
        act({ type: 'sbr', target: t.id, forces });
      } else {
        const forces: { from: string; via?: string; units: AxisUnitPick[] }[] = [];
        for (const space of pickedSpaces) {
          const own = exactOwnPicks(space);
          const via = routeViaFor(t, space);
          if (own.length) forces.push({ from: space, ...(via ? { via } : {}), units: own });
        }
        const routedHulls: AxisTransportRouteOrder[] = t.offloadZone
          ? Object.entries(transportOrders).flatMap(([space, orders]) => {
              if (!transportRoutesFrom(space).some((candidate) =>
                candidate.zone === t.offloadZone && candidate.via === routeViaFor(t, space))) return [];
              const via = routeViaFor(t, space);
              return orders.map((order) => ({
                ...order,
                from: space,
                ...(via ? { via } : {}),
              }));
            })
          : [];
        act({
          type: 'attack',
          target: t.id,
          forces,
          ...(carrierPlan ? { newCarrierLandings: [carrierPlan.declaration] } : {}),
          ...(t.offloadZone && routedHulls.length
            ? { amphibious: { zone: t.offloadZone, hulls: routedHulls } }
            : {}),
        });
      }
    } else {
      // Noncombat orders share one destination but are sent in a safe physical
      // order: cargo offloads, then carriers/other non-air units, then aircraft.
      // That lets carriers from any selected origin establish the deck capacity
      // already proven by the merged landing check before fighters arrive.
      for (const [space, orders] of Object.entries(transportOrders)) {
        if (!isSz(t.id) && t.offloadZone === space) {
          const offload = buildAxisTransportOffloadAction(space, t.id, orders);
          if (offload) act(offload);
        }
      }
      const orderedSpaces = [...pickedSpaces].sort((a, b) => {
        const hasCarrier = (space: string) => picked.some(([key]) =>
          keySpace(key) === space && !isCargoPart(keyUnitPart(key)) && partUnit(keyUnitPart(key)) === 'carrier');
        return Number(hasCarrier(b)) - Number(hasCarrier(a));
      });
      for (const space of orderedSpaces) {
        const nonAir = picked
          .filter(([key]) => keySpace(key) === space && !isCargoPart(keyUnitPart(key)))
          .map(([key]) => exactUnitPick(key))
          .filter((unit) => !isAirKey(unit.key));
        if (nonAir.length === 0) continue;
        const via = routeViaFor(t, space);
        act({ type: 'move', from: space, to: t.id, units: nonAir, ...(via ? { via } : {}) });
      }
      const airOrigins = carrierPlan ? [...pickedSpaces].sort((a, b) => a.localeCompare(b)) : pickedSpaces;
      for (const space of airOrigins) {
        const air = picked
          .filter(([key]) => keySpace(key) === space && !isCargoPart(keyUnitPart(key)))
          .map(([key]) => exactUnitPick(key))
          .filter((unit): unit is AxisUnitPick & { key: AirUnitKey } => isAirKey(unit.key));
        if (air.length > 0) {
          const carrierDeclaration = carrierPlan?.moveDeclarations[space];
          act({
            type: 'move',
            from: space,
            to: t.id,
            units: air,
            ...(carrierDeclaration ? { newCarrierLandings: [carrierDeclaration] } : {}),
          });
        }
      }
    }
    reset();
  };

  // publish the interactive layer onto the shared map
  useEffect(() => {
    if (selectedRocketLauncher) {
      const targetIds = selectedRocketLauncher.targets.map((target) => target.target);
      map({
        picks: selectedRocketLauncher.targets.map((target) => ({
          id: target.target,
          color: target.target === rocketTarget ? '#f4ca64' : '#e05555',
        })),
        onPick: (id) => {
          if (targetIds.includes(id)) setRocketTarget(id);
        },
        focusSpace: rocketTarget ?? selectedRocketLauncher.source,
        arrows: selectedRocketTarget ? [{
          from: [SPACE_CENTER[selectedRocketLauncher.source] ?? [0, 0]],
          to: SPACE_CENTER[selectedRocketTarget.target] ?? [0, 0],
          color: '#f4ca64',
        }] : [],
        selectedPieces: {
          [selectedRocketLauncher.source]: new Set([
            `${me}:aaGun:${selectedRocketLauncher.ordinal}`,
          ]),
        },
        onRegionTap: (id) => {
          if (targetIds.includes(id)) setRocketTarget(id);
        },
        onUnitTap: (spaceId, power, key, ordinal) => {
          if (spaceId === selectedRocketLauncher.source
            && power === me
            && key === 'aaGun'
            && ordinal === selectedRocketLauncher.ordinal) {
            setRocketLauncherKey(null);
            setRocketTarget(null);
          }
        },
      });
      return;
    }
    if (selectedParatrooperCards.length > 0) {
      const targetIds = paratrooperTargets.map((target) => target.target);
      const selectedPieces: Record<string, Set<string>> = {};
      for (const card of selectedParatrooperCards) {
        (selectedPieces[card.from] ??= new Set()).add(`${me}:bomber:${card.bomber.ordinal}`);
        selectedPieces[card.from]!.add(`${me}:infantry:${card.infantry.ordinal}`);
      }
      for (const support of selectedParatrooperSupport) {
        (selectedPieces[support.from] ??= new Set()).add(`${me}:${support.unit}:${support.ordinal}`);
      }
      map({
        picks: paratrooperTargets.map((target) => ({
          id: target.target,
          color: target.target === paratrooperTarget ? '#f4ca64' : '#e05555',
        })),
        onPick: (id) => {
          if (targetIds.includes(id)) {
            setParatrooperTarget(id);
            setParatrooperSupportKeys([]);
          }
        },
        focusSpace: paratrooperTarget ?? selectedParatrooperCards[0]!.from,
        arrows: selectedParatrooperTarget ? [{
          from: [...new Set(selectedParatrooperCards.map((card) => card.from))]
            .map((space) => SPACE_CENTER[space] ?? [0, 0]),
          to: SPACE_CENTER[selectedParatrooperTarget.target] ?? [0, 0],
          color: '#f4ca64',
        }] : [],
        selectedPieces,
        onRegionTap: (id) => {
          if (targetIds.includes(id)) {
            setParatrooperTarget(id);
            setParatrooperSupportKeys([]);
          }
        },
        onUnitTap: (spaceId, power, key, ordinal) => {
          if (power !== me) return;
          const pair = selectedParatrooperCards.find((card) => card.from === spaceId
            && ((key === 'bomber' && card.bomber.ordinal === ordinal)
              || (key === 'infantry' && card.infantry.ordinal === ordinal)));
          if (pair) {
            setParatrooperPairKeys((keys) => keys.filter((candidate) => candidate !== pair.key));
            setParatrooperTarget(null);
            setParatrooperSupportKeys([]);
            return;
          }
          const support = paratrooperSupportCards.find((card) => card.from === spaceId
            && card.unit === key && card.ordinal === ordinal);
          if (support) {
            setParatrooperSupportKeys((keys) => keys.includes(support.key)
              ? keys.filter((candidate) => candidate !== support.key)
              : [...keys, support.key]);
          }
        },
      });
      return;
    }
    const pickBySpace = new Map<string, SpacePick>();
    if (origin || pickedSpaces.length) {
      for (const target of targets) {
        pickBySpace.set(target.id, {
          id: target.id,
          color: mode === 'combat' ? '#e05555' : target.carrierPlans?.length ? '#e8b450' : '#7be0a3',
        });
      }
      for (const plan of pending?.carrierPlans ?? []) {
        if (!pickBySpace.has(plan.zone)) pickBySpace.set(plan.zone, { id: plan.zone, color: '#e8b450' });
      }
    } else {
      for (const id of origins) pickBySpace.set(id, { id });
    }
    const picks = [...pickBySpace.values()];
    const selectedPieces: Record<string, Set<string>> = {};
    for (const [k, ordinals] of Object.entries(take)) {
      const space = keySpace(k);
      const part = keyUnitPart(k);
      if (isCargoPart(part)) continue;
      for (const ordinal of ordinals) {
        (selectedPieces[space] ??= new Set()).add(`${me}:${partUnit(part)}:${ordinal}`);
      }
    }
    map({
      picks,
      onPick: (id) => {
        if (!origin && !pickedSpaces.length) { if (origins.includes(id)) setOrigin(id); return; }
        const futurePlan = pending?.carrierPlans?.find((plan) => plan.zone === id);
        if (futurePlan) { setCarrierPlanKey(futurePlan.key); setPeek(id); return; }
        const target = axisUniqueTargetForMapPick(targets, id);
        if (target) chooseTarget(target);
        else if (targets.some((candidate) => candidate.id === id)) { setPending(null); setPeek(id); }
      },
      focusSpace: pending?.id ?? peek ?? origin,
      arrows: pending && pickedSpaces.length ? [{
        from: pickedSpaces.map((sp) => SPACE_CENTER[sp] ?? [0, 0]),
        to: SPACE_CENTER[pending.id] ?? [0, 0],
        color: mode === 'combat' ? '#e05555' : pending.carrierPlans?.length ? '#e8b450' : '#7be0a3',
      }, ...((): OrderArrow[] => {
        const plan = selectedCarrierPlanFor(pending);
        return plan && plan.zone !== pending.id ? [{
          from: [SPACE_CENTER[pending.id] ?? [0, 0]],
          to: SPACE_CENTER[plan.zone] ?? [0, 0],
          color: '#e8b450',
        }] : [];
      })()] : [],
      selectedPieces,
      onRegionTap: (id) => {
        // tapping ANY part of the map zooms onto that region (owner: HOI4)
        if (!origin && !pickedSpaces.length) {
          if (origins.includes(id)) setOrigin(id);
          else setPeek(id);
          return;
        }
        if (id === origin) return;
        const futurePlan = pending?.carrierPlans?.find((plan) => plan.zone === id);
        if (futurePlan) { setCarrierPlanKey(futurePlan.key); setPeek(id); return; }
        const target = axisUniqueTargetForMapPick(targets, id);
        if (target) { chooseTarget(target); return; }
        if (targets.some((candidate) => candidate.id === id)) { setPending(null); setPeek(id); return; }
        if (origins.includes(id)) { setOrigin(id); setPeek(id); setPending(null); return; } // focus another origin, keep picks
        setPeek(id);
      },
      onUnitTap: (spaceId, power, key, ordinal) => {
        const mine = power === me;
        if (!mine || key === 'factory' || (mode === 'combat' && key === 'aaGun')) return;
        const max = availableUnitCount(spaceId, key as UnitKey);
        if (max <= 0 || ordinal < 0 || ordinal >= max) return;
        setOrigin(spaceId); // focus follows the tap; picks accumulate across regions
        setPeek(spaceId);
        const tk = `${spaceId}|${key}`;
        setTake((t) => {
          const selected = toggleOrdinalSelection(t[tk], ordinal, max);
          const next = { ...t };
          if (selected.size > 0) {
            next[tk] = selected;
            takeSignatures.current[tk] ??= selectionSignatures[tk];
          } else {
            delete next[tk];
            delete takeSignatures.current[tk];
          }
          return next;
        });
        setPending(null);
      },
    });
  }, [
    origin, peek, targets, origins, mode, pending, take, carrierPlanKey,
    selectedRocketLauncher, selectedRocketTarget, rocketTarget, me,
    selectedParatrooperCards, paratrooperTargets, selectedParatrooperTarget,
    paratrooperTarget, paratrooperSupportCards, selectedParatrooperSupport,
  ]);

  const stepperFor = (space: string, part: string, max: number) => (
    <Stepper
      value={take[`${space}|${part}`]?.size ?? 0}
      max={max}
      label={`${UNITS[partUnit(part)].name} from ${spaceName(space)}`}
      onChange={(n) => setTake((t) => {
        const takeKey = `${space}|${part}`;
        const selected = resizeOrdinalSelection(t[takeKey], n, max);
        const next = { ...t };
        if (selected.size > 0) {
          next[takeKey] = selected;
          takeSignatures.current[takeKey] ??= selectionSignatures[takeKey];
        } else {
          delete next[takeKey];
          delete takeSignatures.current[takeKey];
        }
        return next;
      })}
    />
  );
  const toggleCargoHull = (space: string, card: AxisTransportHullCard) => {
    if (!card.canOffload) return;
    setTransportOrders((current) => {
      const orders = toggleAxisTransportHull(current[space] ?? [], card);
      const next = { ...current };
      if (orders.length) next[space] = orders;
      else delete next[space];
      return next;
    });
    setOrigin(space);
    setPeek(space);
    setPending(null);
  };
  const setCargoHullCount = (space: string, card: AxisTransportHullCard, key: UnitKey, count: number) => {
    setTransportOrders((current) => {
      let orders = current[space] ?? [];
      let order = orders.find((candidate) => sameAxisTransportRef(candidate, card));
      if (!order && count > 0) {
        orders = toggleAxisTransportHull(orders, card, []);
        order = orders.find((candidate) => sameAxisTransportRef(candidate, card));
      }
      if (!order) return current;
      const units = [
        ...order.units.filter((unit) => unit.key !== key),
        ...(count > 0 ? [{ key, count }] : []),
      ];
      orders = units.length
        ? setAxisTransportHullUnits(orders, card, units)
        : orders.filter((candidate) => !sameAxisTransportRef(candidate, card));
      const next = { ...current };
      if (orders.length) next[space] = orders;
      else delete next[space];
      return next;
    });
    setPending(null);
  };

  const loadPicks = loadTarget
    ? exactOwnPicks(loadTarget.territory).filter((unit) => UNITS[unit.key].domain === 'land')
    : [];
  const loadCards = loadTarget ? hullCardsAt(loadTarget.zone) : [];
  const loadCardUsable = (card: AxisTransportHullCard) => card.canLoad
    && (mode === 'noncombat' || (card.owner === me && card.movable));
  const loadAssigned = (key: UnitKey, except?: AxisTransportHullCard) => loadOrders.reduce((total, order) => {
    if (except && sameAxisTransportRef(order, except)) return total;
    return total + (order.units.find((unit) => unit.key === key)?.count ?? 0);
  }, 0);
  const loadMaxFor = (card: AxisTransportHullCard, key: UnitKey): number => {
    const selected = loadPicks.find((unit) => unit.key === key)?.count ?? 0;
    if (!loadCardUsable(card) || selected === 0) return 0;
    const order = loadOrders.find((candidate) => sameAxisTransportRef(candidate, card));
    const otherUnits = order?.units.filter((unit) => unit.key !== key) ?? [];
    const otherAssignedHere = otherUnits.reduce((total, unit) => total + unit.count, 0);
    const baseNonInfantry = card.manifest.some((cargo) => cargo.key !== 'infantry');
    const otherNonInfantry = otherUnits.some((unit) => unit.key !== 'infantry');
    if (key !== 'infantry' && (baseNonInfantry || otherNonInfantry)) return 0;
    const capacity = Math.max(0, card.capacity.remaining - otherAssignedHere);
    const remainingSelection = Math.max(0, selected - loadAssigned(key, card));
    return Math.min(capacity, remainingSelection, key === 'infantry' ? 2 : 1);
  };
  const setLoadCount = (card: AxisTransportHullCard, key: UnitKey, count: number) => {
    setLoadOrders((current) => {
      let orders = current;
      let order = orders.find((candidate) => sameAxisTransportRef(candidate, card));
      if (!order && count > 0) {
        orders = toggleAxisTransportHull(orders, card, []);
        order = orders.find((candidate) => sameAxisTransportRef(candidate, card));
      }
      if (!order) return current;
      const units = [
        ...order.units.filter((unit) => unit.key !== key),
        ...(count > 0 ? [{ key, count }] : []),
      ];
      return units.length
        ? setAxisTransportHullUnits(orders, card, units)
        : orders.filter((candidate) => !sameAxisTransportRef(candidate, card));
    });
  };
  const loadOrdersCurrent = loadOrders.every((order) => {
    const card = loadCards.find((candidate) => sameAxisTransportRef(candidate, order));
    return card && loadCardUsable(card) && card.selectionSig === order.selectionSig;
  });
  const loadAction = loadTarget && loadOrdersCurrent && !surfaceHostileSea(loadTarget.zone)
    ? buildAxisTransportLoadAction(loadTarget.zone, loadTarget.territory, loadPicks, loadOrders)
    : null;
  const forceSummary = picked
    .map(([key, count]) => `${count} ${UNITS[partUnit(keyUnitPart(key))].name}${count === 1 ? '' : 's'}`)
    .join(' · ');
  const originSummary = [...new Set(picked.map(([key]) => keySpace(key)))].map(spaceName).join(' + ');

  return (
    <div className="ax-sheet-body">
      {view.active === 'usa' && (
        <div className="ax-operation-actor" data-power={me}>
          <span>{combatantName(me)} forces</span>
          <b>{view.usaOperationIndex + 1} of 2</b>
          <small>{me === 'china' ? 'Controlled by the United States · Chinese pieces only' : 'United States pieces only'}</small>
        </div>
      )}
      <div className="ig-lab ax-sr-only">
        {mode === 'combat' ? 'Combat move.' : 'Noncombat move.'}
      </div>
      {selectedRocketLauncher ? (
        <div className="ax-flow-guide ax-special-flow">
          <span className="done"><b>1</b> Exact launcher</span>
          <span className={!selectedRocketTarget ? 'active' : 'done'}><b>2</b> Factory target</span>
          <span className={selectedRocketTarget ? 'active' : ''}><b>3</b> Confirm strike</span>
        </div>
      ) : selectedParatrooperCards.length > 0 ? (
        <div className="ax-flow-guide ax-special-flow">
          <span className="done"><b>1</b> Exact airborne pairs</span>
          <span className={!selectedParatrooperTarget ? 'active' : 'done'}><b>2</b> First hostile territory</span>
          <span className={selectedParatrooperTarget ? 'active' : ''}><b>3</b> Support &amp; confirm</span>
        </div>
      ) : (
        <div className="ax-flow-guide">
          <span className={!origin && pickedSpaces.length === 0 ? 'active' : 'done'}><b>1</b> Choose origin</span>
          <span className={origin && picked.length === 0 ? 'active' : picked.length > 0 ? 'done' : ''}><b>2</b> Select units</span>
          <span className={picked.length > 0 && !pending ? 'active' : pending ? 'done' : ''}><b>3</b> Pick destination</span>
          <span className={pending ? 'active' : ''}><b>4</b> Confirm order</span>
        </div>
      )}
      <p className="ax-helper-copy">
        {selectedRocketLauncher
          ? 'Choose one red industrial complex. The launcher stays in place; its single damage die rolls only after the cinematic battlefield and physical dice are ready.'
          : selectedParatrooperCards.length > 0
            ? 'Choose the first territory that was hostile when Combat Move began. The bomber faces AA fire before its linked infantry drops; optional adjacent ground support creates a retreat route.'
          : mode === 'combat'
          ? me === 'china'
            ? 'Chinese infantry and the Flying Tigers may attack only inside printed China or Kwangtung. Finish every Chinese battle before U.S. combat begins.'
            : 'Red destinations contain enemy forces or enemy-held territory. You may combine forces from several origins.'
          : me === 'china'
            ? 'Chinese noncombat movement is separate. The Flying Tigers must stay and land inside the Chinese operating region.'
            : 'Green destinations are ordinary friendly moves. Amber sea zones use an exact purchased-carrier promise and reserve its factory slot now.'}
      </p>
      {selectedRocketLauncher && (
        <section className="ax-special-order-card" aria-label="Rocket strike target">
          <div>
            <UnitIcon unitKey="aaGun" size={30} title="Rocket launcher" />
            <span>
              <b>{axisRocketLauncherLabel(selectedRocketLauncher, AXIS_INDEX, me as PowerKey)}</b>
              <small>One launch from this territory this turn · range {Math.max(...selectedRocketLauncher.targets.map((target) => target.distance))} or less</small>
            </span>
            <button type="button" className="ax-chip" onClick={() => { setRocketLauncherKey(null); setRocketTarget(null); }}>CHANGE</button>
          </div>
          <div className="ax-row ax-wrap">
            {selectedRocketLauncher.targets.map((target) => (
              <Chip
                key={target.target}
                label={`${spaceName(target.target)} · ${target.distance} space${target.distance === 1 ? '' : 's'}`}
                tone={target.target === rocketTarget ? 'gold' : 'danger'}
                onTap={() => setRocketTarget(target.target)}
              />
            ))}
          </div>
        </section>
      )}
      {selectedParatrooperCards.length > 0 && (
        <section className="ax-special-order-card ax-airborne-order" aria-label="Paratroopers attack order">
          <div>
            <UnitIcon unitKey="bomber" size={30} title="Paratrooper bomber" />
            <span>
              <b>{selectedParatrooperCards.length} exact airborne pair{selectedParatrooperCards.length === 1 ? '' : 's'}</b>
              <small>One bomber + one infantry per pair · tap either highlighted sculpt to deselect only that pair</small>
            </span>
            <button type="button" className="ax-chip" onClick={() => { setParatrooperPairKeys([]); setParatrooperTarget(null); setParatrooperSupportKeys([]); }}>CHANGE</button>
          </div>
          <div className="ax-airborne-pairs">
            {selectedParatrooperCards.map((card) => (
              <button
                type="button"
                key={card.key}
                onClick={() => {
                  setParatrooperPairKeys((keys) => keys.filter((key) => key !== card.key));
                  setParatrooperTarget(null);
                  setParatrooperSupportKeys([]);
                }}
              >
                <b>{spaceName(card.from)} · pair {card.pairNumber}</b>
                <span>Bomber {card.bomber.physicalOrdinal + 1} + Infantry {card.infantry.physicalOrdinal + 1}</span>
                <em>Remove</em>
              </button>
            ))}
          </div>
          {paratrooperCards.some((card) => !paratrooperPairKeys.includes(card.key)) && (
            <div className="ax-row ax-wrap ax-airborne-add-pairs">
              {paratrooperCards.filter((card) => !paratrooperPairKeys.includes(card.key)).map((card) => {
                const sharedTarget = axisParatrooperCommonTargets([...selectedParatrooperCards, card]).length > 0;
                const physicalConflict = selectedParatrooperCards.some((selected) => selected.from === card.from
                  && (selected.bomber.ordinal === card.bomber.ordinal
                    || selected.infantry.ordinal === card.infantry.ordinal));
                return (
                  <Chip
                    key={card.key}
                    label={`+ ${spaceName(card.from)} pair ${card.pairNumber}`}
                    tone="future"
                    disabled={!sharedTarget || physicalConflict}
                    title={physicalConflict
                      ? 'That exact bomber or infantry is already assigned to another pair.'
                      : sharedTarget ? 'Add this exact pair' : 'This pair shares no legal target and landing plan with the current force.'}
                    onTap={() => {
                      setParatrooperPairKeys((keys) => [...keys, card.key]);
                      setParatrooperTarget(null);
                      setParatrooperSupportKeys([]);
                    }}
                  />
                );
              })}
            </div>
          )}
          <div className="ax-row ax-wrap">
            {paratrooperTargets.map((target) => (
              <Chip
                key={target.target}
                label={`${spaceName(target.target)} · ${target.distance} space${target.distance === 1 ? '' : 's'}`}
                tone={target.target === paratrooperTarget ? 'gold' : 'danger'}
                onTap={() => { setParatrooperTarget(target.target); setParatrooperSupportKeys([]); }}
              />
            ))}
            {paratrooperTargets.length === 0 && (
              <span className="ax-empty-hint">Those exact bombers share no legal first-hostile target with enough range left to land.</span>
            )}
          </div>
          {selectedParatrooperTarget && (
            <div className="ax-airborne-support">
              <div>
                <b>Optional adjacent ground support</b>
                <small>Each chip is one physical sculpt. Ground support establishes the only legal Paratrooper retreat route.</small>
              </div>
              <div className="ax-row ax-wrap">
                {paratrooperSupportCards.map((support) => {
                  const selected = paratrooperSupportKeys.includes(support.key);
                  return (
                    <Chip
                      key={support.key}
                      label={`${spaceName(support.from)} · ${UNITS[support.unit].name} ${support.physicalOrdinal + 1}`}
                      tone={selected ? 'gold' : 'plain'}
                      onTap={() => setParatrooperSupportKeys((keys) => selected
                        ? keys.filter((key) => key !== support.key)
                        : [...keys, support.key])}
                    />
                  );
                })}
                {paratrooperSupportCards.length === 0 && (
                  <span className="ax-empty-hint">No adjacent ground attacker is available. This airborne-only force cannot retreat.</span>
                )}
              </div>
            </div>
          )}
        </section>
      )}
      {!origin && pickedSpaces.length === 0 && (
        <div className="ax-row ax-wrap">
          {origins.map((id) => (
            <Chip key={id} label={spaceName(id)} disabled={Boolean(selectedRocketLauncher) || selectedParatrooperCards.length > 0} onTap={() => setOrigin(id)} />
          ))}
          <Chip label={mode === 'combat' ? `Finish ${combatantName(me)} combat` : `Finish ${combatantName(me)} movement`} tone="gold" disabled={Boolean(selectedRocketLauncher) || selectedParatrooperCards.length > 0} onTap={finishMovement} />
        </div>
      )}
      {!selectedRocketLauncher && selectedParatrooperCards.length === 0 && !origin && pickedSpaces.length === 0 && rocketLaunchers.length > 0 && (
        <section className="ax-special-tech-panel" aria-label="Available rocket launchers">
          <div className="ax-special-tech-heading">
            <span>Rockets</span>
            <b>{rocketLaunchers.length} exact launcher{rocketLaunchers.length === 1 ? '' : 's'} ready</b>
            <small>Each source territory may launch once. Identical AA guns remain separate choices.</small>
          </div>
          <div className="ax-row ax-wrap">
            {rocketLaunchers.map((launcher) => (
              <Chip
                key={rocketKey(launcher)}
                label={`${axisRocketLauncherLabel(launcher, AXIS_INDEX, me as PowerKey)} · ${launcher.targets.length} target${launcher.targets.length === 1 ? '' : 's'}`}
                tone="future"
                onTap={() => {
                  setRocketLauncherKey(rocketKey(launcher));
                  setRocketTarget(null);
                }}
              />
            ))}
          </div>
        </section>
      )}
      {!selectedRocketLauncher && selectedParatrooperCards.length === 0 && !origin && pickedSpaces.length === 0 && paratrooperCards.length > 0 && (
        <section className="ax-special-tech-panel" aria-label="Available Paratroopers pairs">
          <div className="ax-special-tech-heading">
            <span>Paratroopers</span>
            <b>{paratrooperCards.length} exact pair{paratrooperCards.length === 1 ? '' : 's'} ready</b>
            <small>Choose each bomber and its carried infantry separately. No same-type stack is auto-selected.</small>
          </div>
          <div className="ax-row ax-wrap">
            {paratrooperCards.map((card) => (
              <Chip
                key={card.key}
                label={`${spaceName(card.from)} · Bomber ${card.bomber.physicalOrdinal + 1} + Infantry ${card.infantry.physicalOrdinal + 1}${card.targets.length ? ` · ${card.targets.length} target${card.targets.length === 1 ? '' : 's'}` : ' · no legal landing'}`}
                tone="future"
                disabled={card.targets.length === 0}
                onTap={() => {
                  setParatrooperPairKeys([card.key]);
                  setParatrooperTarget(null);
                  setParatrooperSupportKeys([]);
                }}
              />
            ))}
          </div>
        </section>
      )}
      {(origin || pickedSpaces.length > 0) && (
        <>
          <div className="ax-row" style={{ alignItems: 'center' }}>
            <b style={{ fontSize: 14 }}>{origin ? spaceName(origin) : 'Force'}</b>
            <Chip label="Back" onTap={reset} />
          </div>
          {origin && (
            <div className="ax-units">
              {availableUnitsAt(origin).map(({ key, count }) => (
                <div key={key} className="ax-unit-row">
                  <span>{UNITS[key].name} × {count} available</span>
                  {stepperFor(origin, key, count)}
                </div>
              ))}
              {isSz(origin) && hullCardsAt(origin).length > 0 && (
                <section className="ax-transport-grid" aria-label={`Transports in ${spaceName(origin)}`}>
                  <div className="ax-transport-heading">
                    <b>Physical transports</b>
                    <small>Select hulls individually. Cargo is never pooled.</small>
                  </div>
                  {hullCardsAt(origin).map((card) => {
                    const order = (transportOrders[origin] ?? [])
                      .find((candidate) => sameAxisTransportRef(candidate, card));
                    const dockBlocked = surfaceHostileSea(origin);
                    const canSelect = card.canOffload && !dockBlocked;
                    return (
                      <article
                        key={`${card.owner}-${card.physicalOrdinal}`}
                        className={`ax-transport-card${order ? ' selected' : ''}${!canSelect ? ' disabled' : ''}`}
                      >
                        <button
                          type="button"
                          className="ax-transport-toggle"
                          aria-pressed={Boolean(order)}
                          disabled={!canSelect}
                          onClick={() => toggleCargoHull(origin, card)}
                        >
                          <span className="ax-transport-title">
                            <b>{POWERS[card.owner].short} transport {card.physicalOrdinal + 1}</b>
                            <em>{order ? 'Selected' : card.status}</em>
                          </span>
                          <span className="ax-transport-manifest">
                            {card.manifest.length
                              ? card.manifest.map((cargo) => (
                                  <span key={`${cargo.power}-${cargo.key}`}>
                                    {cargo.power === 'china' ? 'CHN' : POWERS[cargo.power].short} {UNITS[cargo.key].name} × {cargo.count}
                                  </span>
                                ))
                              : <span>Empty · {card.capacity.remaining} spaces open</span>}
                          </span>
                          {(dockBlocked || card.disabledReason) && (
                            <small>{dockBlocked ? 'Enemy surface warships block offloading' : card.disabledReason}</small>
                          )}
                        </button>
                        {order && card.cargo.map((cargo) => (
                          <div className="ax-transport-cargo-pick" key={cargo.key}>
                            <span>{UNITS[cargo.key].name} to unload</span>
                            <Stepper
                              value={order.units.find((unit) => unit.key === cargo.key)?.count ?? 0}
                              max={cargo.count}
                              label={`${UNITS[cargo.key].name} from ${POWERS[card.owner].short} transport ${card.physicalOrdinal + 1}`}
                              onChange={(count) => setCargoHullCount(origin, card, cargo.key, count)}
                            />
                          </div>
                        ))}
                      </article>
                    );
                  })}
                </section>
              )}
            </div>
          )}
          {pickedSpaces.filter((sp) => sp !== origin).length > 0 && (
            <div className="ax-row ax-wrap" style={{ fontSize: 12, opacity: 0.8 }}>
              {pickedSpaces.filter((sp) => sp !== origin).map((sp) => (
                <Chip key={sp} label={`+ ${spaceName(sp)}`} onTap={() => setOrigin(sp)} />
              ))}
            </div>
          )}
          <div className="ax-row ax-wrap">
            {targets.map((t) => (
              <Chip
                key={targetChoiceKey(t)}
                label={`${mode === 'combat' ? (t.amphibious ? 'Assault' : 'Attack') : isSz(t.id) ? 'To' : anyCargo ? 'Offload to' : 'To'} ${spaceName(t.id)}${t.raidUnavailable ? ' · SBR already used' : ''}${t.carrierPlans?.length ? ' · carrier plan' : ''}${t.offloadZone ? ` from ${spaceName(t.offloadZone)}` : ''}${targetRouteLabel(t)}`}
                tone={pending && targetChoiceKey(pending) === targetChoiceKey(t)
                  ? 'gold'
                  : t.carrierPlans?.length ? 'future' : mode === 'combat' ? 'danger' : 'gold'}
                onTap={() => chooseTarget(t)}
              />
            ))}
            {loadZones.map((z) => (
              <Chip
                key={`load-${z}`}
                label={`Load into ${spaceName(z)}`}
                tone="gold"
                onTap={() => {
                  setLoadTarget({ zone: z, territory: origin! });
                  setLoadOrders([]);
                  setPending(null);
                }}
              />
            ))}
            {targets.length === 0 && loadZones.length === 0 && (
              <span className="ax-empty-hint">Use the + controls to select at least one movable unit. Legal destinations will then appear here and glow on the map.</span>
            )}
          </div>
        </>
      )}
      {selectedRocketLauncher && selectedRocketTarget && createPortal(
        <div className="ax-order center ax-order-confirm ax-rocket-confirm" role="region" aria-label="Confirm rocket strike">
          <div className="ax-order-summary">
            <small>Rocket strike · exact AA gun {selectedRocketLauncher.physicalOrdinal + 1}</small>
            <b>{spaceName(selectedRocketLauncher.source)} → {spaceName(selectedRocketTarget.target)}</b>
            <small>
              {selectedRocketTarget.path.map(spaceName).join(' → ')} · one physical damage die · complex cap {(TERR[selectedRocketTarget.target]?.ipc ?? 0) * 2}
            </small>
          </div>
          <div className="ax-order-actions">
            <button
              className="ax-order-go"
              onClick={() => {
                act(buildAxisRocketStrikeAction(selectedRocketLauncher, selectedRocketTarget.target));
                setRocketLauncherKey(null);
                setRocketTarget(null);
              }}
            >
              LAUNCH ROCKET · {spaceName(selectedRocketTarget.target)}
            </button>
            <button className="ax-order-cancel" onClick={() => setRocketTarget(null)} aria-label="Choose another factory">✕</button>
          </div>
        </div>,
        document.body,
      )}
      {selectedParatrooperCards.length > 0 && selectedParatrooperTarget && createPortal(
        <div className="ax-order center ax-order-confirm ax-airborne-confirm" role="region" aria-label="Confirm Paratroopers assault">
          <div className="ax-order-summary">
            <small>Airborne assault · {selectedParatrooperCards.length} exact pair{selectedParatrooperCards.length === 1 ? '' : 's'}</small>
            <b>{[...new Set(selectedParatrooperCards.map((card) => spaceName(card.from)))].join(' + ')} → {spaceName(selectedParatrooperTarget.target)}</b>
            <small>
              AA fire resolves before the drop · {selectedParatrooperSupport.length > 0
                ? `${selectedParatrooperSupport.length} adjacent ground unit${selectedParatrooperSupport.length === 1 ? '' : 's'} establishes retreat`
                : 'airborne-only force cannot retreat'}
            </small>
          </div>
          <div className="ax-order-actions">
            <button
              className="ax-order-go"
              onClick={() => {
                act({
                  type: 'attack',
                  target: selectedParatrooperTarget.target,
                  forces: paratrooperSupportForces,
                  paratroopers: buildAxisParatrooperGroups(
                    selectedParatrooperCards,
                    selectedParatrooperTarget.target,
                  ),
                });
                setParatrooperPairKeys([]);
                setParatrooperTarget(null);
                setParatrooperSupportKeys([]);
              }}
            >
              LAUNCH AIRBORNE ASSAULT · {spaceName(selectedParatrooperTarget.target)}
            </button>
            <button className="ax-order-cancel" onClick={() => { setParatrooperTarget(null); setParatrooperSupportKeys([]); }} aria-label="Choose another airborne target">✕</button>
          </div>
        </div>,
        document.body,
      )}
      {(origin || pickedSpaces.length > 0) && createPortal(
        <div className={`ax-order center${pending ? ' ax-order-confirm' : ''}`}>
          {pending ? (
            <>
              <div className="ax-order-summary">
                <small>{mode === 'combat' ? 'Attack order' : pending.offloadZone ? 'Offload order' : 'Movement order'} · {originSummary} → {spaceName(pending.id)}</small>
                <b>{forceSummary}</b>
                {targetRouteLabel(pending) && (
                  <small className="ax-transport-route-summary">Chosen route: {targetRouteLabel(pending).trim()}</small>
                )}
                {selectedCarrierPlanFor(pending) && (
                  <small className="ax-carrier-order-summary">
                    Purchased carrier required · {spaceName(selectedCarrierPlanFor(pending)!.zone)} · {selectedCarrierPlanFor(pending)!.newCarriers > 0
                      ? selectedCarrierPlanFor(pending)!.carrierFactories.map(spaceName).join(' + ')
                      : 'shared reserved deck slot'}
                  </small>
                )}
                {pending.offloadZone && Object.entries(transportOrders).flatMap(([space, orders]) => {
                  const via = routeViaFor(pending, space);
                  if (!transportRoutesFrom(space).some((candidate) =>
                    candidate.zone === pending.offloadZone && candidate.via === via)) return [];
                  return orders.map((order) => {
                    const summary = summarizeAxisTransportRoute({
                      ...order,
                      from: space,
                      ...(via ? { via } : {}),
                    }, pending.offloadZone!);
                    return (
                      <small key={`${space}-${order.owner}-${order.physicalOrdinal}`} className="ax-transport-route-summary">
                        {POWERS[order.owner].short} hull {order.physicalOrdinal + 1}: {summary.path.map(spaceName).join(' → ')} · {summary.cargoCount} cargo
                      </small>
                    );
                  });
                })}
                {pending.carrierPlans && pending.carrierPlans.length > 1 && (
                  <div className="ax-carrier-plan-choices" role="radiogroup" aria-label="Factory for required carrier">
                    {pending.carrierPlans.map((plan) => {
                      const selected = selectedCarrierPlanFor(pending)?.key === plan.key;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          className={selected ? 'selected' : ''}
                          key={plan.key}
                          onClick={() => setCarrierPlanKey(plan.key)}
                        >
                          <b>{spaceName(plan.zone)}</b>
                          <span>{plan.newCarriers > 0
                            ? `${plan.newCarriers} carrier${plan.newCarriers === 1 ? '' : 's'} from ${plan.carrierFactories.map(spaceName).join(' + ')}`
                            : 'Use the open slot on the reserved carrier'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="ax-order-actions">
                <button className="ax-order-go" onClick={() => commit(pending)}>
                  {mode === 'combat'
                    ? (pending.sbr ? 'STRIKE' : pending.amphibious ? 'ASSAULT' : 'ATTACK')
                    : pending.offloadZone ? 'OFFLOAD' : 'MOVE'} · {spaceName(pending.id)}
                </button>
                <button className="ax-order-cancel" onClick={() => setPending(null)} aria-label="Edit the order">✕</button>
              </div>
            </>
          ) : (
            <button className="ax-order-back" onClick={reset}>Back</button>
          )}
        </div>,
        document.body,
      )}
      {loadTarget && createPortal(
        <div className="ax-modal dark" role="dialog" aria-modal="true" aria-label="Assign cargo to transports">
          <div className="ig-glass ax-modal-card ax-transport-load-modal">
            <div className="ig-lab">Assign exact transport hulls</div>
            <h3>{spaceName(loadTarget.territory)} → {spaceName(loadTarget.zone)}</h3>
            <p>
              Place every selected land unit on a specific hull. In Combat Move, only your own ready transports can load;
              allied transports are available during Noncombat Move.
            </p>
            <div className="ax-transport-load-picks">
              {loadPicks.map((unit) => (
                <span key={unit.key}>{UNITS[unit.key].name} × {unit.count - loadAssigned(unit.key)} left</span>
              ))}
            </div>
            <div className="ax-transport-grid">
              {loadCards.map((card) => {
                const order = loadOrders.find((candidate) => sameAxisTransportRef(candidate, card));
                const usable = loadCardUsable(card);
                const reason = !usable
                  ? mode === 'combat' && card.owner !== me
                    ? 'Allied hulls cannot load and assault in the same turn'
                    : card.disabledReason ?? (card.capacity.remaining === 0 ? 'No capacity remaining' : 'Hull unavailable')
                  : undefined;
                return (
                  <article
                    key={`${card.owner}-${card.physicalOrdinal}`}
                    className={`ax-transport-card${order ? ' selected' : ''}${!usable ? ' disabled' : ''}`}
                  >
                    <div className="ax-transport-title">
                      <b>{POWERS[card.owner].short} transport {card.physicalOrdinal + 1}</b>
                      <em>{card.capacity.remaining} open</em>
                    </div>
                    <div className="ax-transport-manifest">
                      {card.manifest.length
                        ? card.manifest.map((cargo) => (
                            <span key={`${cargo.power}-${cargo.key}`}>
                              {cargo.power === 'china' ? 'CHN' : POWERS[cargo.power].short} {UNITS[cargo.key].name} × {cargo.count}
                            </span>
                          ))
                        : <span>Empty hull</span>}
                    </div>
                    {reason && <small className="ax-transport-reason">{reason}</small>}
                    {usable && loadPicks.map((unit) => (
                      <div className="ax-transport-cargo-pick" key={unit.key}>
                        <span>{UNITS[unit.key].name}</span>
                        <Stepper
                          value={order?.units.find((assigned) => assigned.key === unit.key)?.count ?? 0}
                          max={loadMaxFor(card, unit.key)}
                          label={`${UNITS[unit.key].name} assigned to ${POWERS[card.owner].short} transport ${card.physicalOrdinal + 1}`}
                          onChange={(count) => setLoadCount(card, unit.key, count)}
                        />
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
            <div className="ax-order-actions">
              <button
                className="ax-order-go"
                disabled={!loadAction}
                onClick={() => { if (loadAction) { act(loadAction); reset(); } }}
              >
                LOAD ASSIGNED HULLS
              </button>
              <button
                className="ax-order-cancel"
                onClick={() => { setLoadTarget(null); setLoadOrders([]); }}
                aria-label="Cancel transport loading"
              >✕</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {sbrAsk && createPortal(
        <div className="ax-modal dark">
          <div className="ig-glass ax-modal-card">
            <div className="ig-lab">Bombers over {spaceName(sbrAsk)}</div>
            <p style={{ fontSize: 13.5, opacity: 0.85, margin: '6px 0 12px' }}>
              That territory holds an enemy industrial complex. Bomb the factory, or attack the defenders?
            </p>
            <div className="ax-col">
              <Chip label="Strategic bombing raid" tone="gold" onTap={() => { const t = targets.find((x) => x.id === sbrAsk); if (t) commit(t, true); }} />
              <Chip label="Attack the defenders" tone="danger" onTap={() => { const t = targets.find((x) => x.id === sbrAsk); if (t) commit(t, false); }} />
              <Chip label="Never mind" onTap={() => setSbrAsk(null)} />
            </div>
          </div>
        </div>,
        document.body,
      )}
      {confirmStranded && createPortal(
        <div className="ax-modal dark" onClick={() => setConfirmStranded(false)}>
          <div ref={airWarningRef} className="ig-glass ax-modal-card ax-air-warning" role="alertdialog" aria-modal="true" aria-labelledby="ax-air-warning-title" aria-describedby="ax-air-warning-description" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <div className="ax-decision-kicker">Landing check</div>
            <h2 id="ax-air-warning-title">{strandedTotal} aircraft cannot land</h2>
            <p id="ax-air-warning-description">Ending noncombat now destroys these aircraft. Move them to friendly territory or an available carrier deck first.</p>
            <div className="ax-air-warning-list">
              {stranded.map((group) => (
                <div key={`${group.space}-${group.key}`}>
                  <UnitIcon unitKey={group.key} size={28} title={UNITS[group.key].name} />
                  <span><b>{group.count} {UNITS[group.key].name}{group.count === 1 ? '' : 's'}</b><small>{spaceName(group.space)} - {group.reason === 'no-carrier' ? 'no carrier deck space' : group.reason === 'bomber-at-sea' ? 'bombers cannot land at sea' : 'territory is not friendly'}</small></span>
                </div>
              ))}
            </div>
            <div className="ax-decision-actions">
              <button className="ax-mega xl" onClick={() => setConfirmStranded(false)}>KEEP MOVING</button>
              <button className="ax-mega xl danger" onClick={() => { setConfirmStranded(false); act({ type: 'endPhase' }); }}>END PHASE - LOSE {strandedTotal}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Battle actions live front and center mid-screen (owner: big buttons in the
// middle), while the left panel just narrates.
function BattleSheet({ view, act, map, error }: {
  view: AxisView;
  act: Act;
  map: PublishMap;
  error?: string | null;
}) {
  const c = view.combat!;
  const b = c.battle;
  const strategicRaid = c.kind === 'strategicRaid';
  const rocketStrike = c.kind === 'rocketStrike';
  const battleStep = b.steps[b.stepIndex] ?? null;
  const d = b.decision;
  const [picked, setPicked] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const retreatSelectionKey = axisRetreatSelectionKey(c);
  const [retreatSelection, setRetreatSelection] = useState<AxisRetreatSelection>(() =>
    initialAxisRetreatSelection(c.retreatPolicy));
  const [submittedRetreat, setSubmittedRetreat] = useState<
    { kind: 'remain' } | { kind: 'retreat'; destination: string | null } | null
  >(null);
  const selectedRetreatDestination = normalizeAxisRetreatSelection(c.retreatPolicy, retreatSelection);
  const retreatCopy = axisRetreatCopy(c);
  const retreatAction = buildAxisRetreatAction(c, selectedRetreatDestination, view.battleVisualReady);
  const remainAction = buildAxisRemainAction(c, view.battleVisualReady);
  const byUid = new Map([...b.attacker, ...b.defender].map((u) => [u.uid, u]));
  const casualtyDecision = d?.type === 'casualties' ? d : null;
  const casualtyPlan = casualtyDecision
    ? planCasualties(casualtyDecision, [...b.attacker, ...b.defender], picked)
    : null;
  const casualtyUids = casualtyDecision ? [...new Set(casualtyDecision.buckets.flatMap((bucket) => bucket.eligible))] : [];
  const decisionKey = JSON.stringify(d ?? null);
  const deciderIsDefender = d && d.type !== 'retreat' && (d as { side?: string }).side === 'defender';
  const defenderPower = (b.defender.find((u) => u.hp > 0)?.power ?? b.defender[0]?.power ?? 'china') as PowerKey | 'china';
  const rollAuthority = battleRollAuthority(view);
  const decisionAuthority = battleDecisionAuthority(view);
  const attackerContinueAuthority = battleContinueAuthority(view, 'attacker');
  const defenderContinueAuthority = battleContinueAuthority(view, 'defender');
  const canRoll = controlsAxisPower(view.controlledPowers, rollAuthority);
  const canDecide = controlsAxisPower(view.controlledPowers, decisionAuthority);
  const canContinueAttacker = controlsAxisPower(view.controlledPowers, attackerContinueAuthority);
  const canContinueDefender = controlsAxisPower(view.controlledPowers, defenderContinueAuthority);
  const commanderName = (power: PowerKey | null) => power ? POWERS[power].name : 'the assigned commander';
  const submit = (action: AxisAction, authority: PowerKey | null) => {
    const needsVisualReady = action.type === 'battleRoll'
      || action.type === 'battleCasualties'
      || action.type === 'battleSubmerge'
      || action.type === 'battleRetreat'
      || action.type === 'battleContinue';
    if (submitting || !controlsAxisPower(view.controlledPowers, authority)
      || (needsVisualReady && !view.battleVisualReady)) return;
    if (action.type === 'battleRetreat') {
      setSubmittedRetreat(action.retreat
        ? { kind: 'retreat', destination: action.destination }
        : { kind: 'remain' });
    }
    setSubmitting(true);
    act({ ...action, asPower: authority } as AxisAction & { asPower: PowerKey });
  };
  const over = Boolean(c.confirmed); // battle finished, both sides confirm
  useEffect(() => {
    if (d?.type !== 'retreat' || !c.retreatPolicy || c.retreatPolicy.destinations.length === 0) {
      map({ ...MAP_IDLE, focusSpace: c.space });
      return () => map(MAP_IDLE);
    }
    const chooseDestination = (id: string) => {
      if (canDecide && view.battleVisualReady && c.retreatPolicy?.destinations.includes(id)) setRetreatSelection(id);
    };
    const arrow: OrderArrow[] = typeof selectedRetreatDestination === 'string'
      && SPACE_CENTER[c.space]
      && SPACE_CENTER[selectedRetreatDestination]
      ? [{
          from: [SPACE_CENTER[c.space]],
          to: SPACE_CENTER[selectedRetreatDestination],
          color: '#78e2bd',
        }]
      : [];
    map({
      picks: c.retreatPolicy.destinations.map((id) => ({
        id,
        color: id === selectedRetreatDestination ? '#78e2bd' : '#e8b450',
      })),
      onPick: chooseDestination,
      onRegionTap: chooseDestination,
      focusSpace: c.space,
      arrows: arrow,
    });
    return () => map(MAP_IDLE);
  }, [c.space, canDecide, d?.type, retreatSelectionKey, selectedRetreatDestination, view.battleVisualReady]);
  useEffect(() => { setPicked([]); setSubmitting(false); setSubmittedRetreat(null); }, [c.id]);
  useEffect(() => {
    setRetreatSelection(initialAxisRetreatSelection(c.retreatPolicy));
    setSubmittedRetreat(null);
  }, [retreatSelectionKey]);
  useEffect(() => { setPicked([]); }, [decisionKey]);
  useEffect(() => { setSubmitting(false); }, [b.log.length, b.round, d?.type, c.confirmed?.attacker, c.confirmed?.defender]);
  useEffect(() => { if (error) { setSubmitting(false); setSubmittedRetreat(null); } }, [error]);
  useEffect(() => { if (!view.battleVisualReady) setSubmitting(false); }, [view.battleVisualReady]);
  const winnerLine =
    rocketStrike ? `${c.rocket?.appliedDamage ?? 0} rocket damage delivered to ${spaceName(c.space)}` :
    strategicRaid ? `${c.raid?.appliedDamage ?? 0} bombing damage delivered to ${spaceName(c.space)}` :
    b.status === 'attacker_captured' ? `${combatantName(c.attacker)} takes ${spaceName(c.space)}` :
    b.status === 'attacker_cleared' ? `${combatantName(c.attacker)} clears ${spaceName(c.space)}` :
    b.status === 'defender_won' ? 'The attack is repelled' :
    b.status === 'retreated' ? axisRetreatOutcomeText(combatantName(c.attacker), c.retreatTo, c.space, spaceName) :
    b.status === 'standoff' ? 'Standoff' : 'Mutual destruction';
  const withdrawalReceipt = c.retreatTo !== undefined && b.status !== 'retreated'
    ? typeof c.retreatTo === 'string'
      ? `Withdrawn force routed to ${spaceName(c.retreatTo)}`
      : `Aircraft disengaged over ${spaceName(c.space)}`
    : null;
  const standing = (side: 'attacker' | 'defender') => {
    const m = new Map<UnitKey, number>();
    for (const u of b[side]) if (u.hp > 0) m.set(u.key, (m.get(u.key) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => `${n} ${UNITS[k].name}`).join(', ') || 'none';
  };
  const lastVolley = [...b.log].reverse().find((event) => event.rolls.length > 0);
  const lastVolleyDamage = lastVolley?.metric === 'damage'
    ? lastVolley.rolls.reduce((sum, roll) => sum + (roll.selected === false ? 0 : roll.value), 0)
    : 0;
  const volleyRecap = lastVolley ? (
    <div className="ax-volley-recap">
      <div><span>{lastVolley.title}</span><b>{lastVolley.metric === 'damage' ? `${lastVolleyDamage} damage` : `${lastVolley.rolls.filter((roll) => roll.hit).length} hits`}</b></div>
      <div className="ax-volley-dice" aria-label={lastVolley.metric === 'damage' ? `${lastVolleyDamage} strategic damage from ${lastVolley.rolls.length} dice` : `${lastVolley.rolls.filter((roll) => roll.hit).length} hits from ${lastVolley.rolls.length} dice`}>
        {lastVolley.rolls.map((roll, index) => <span key={`${roll.uid}-${index}`} className={roll.selected === false ? 'discarded' : lastVolley.metric === 'damage' ? 'damage' : roll.hit ? 'hit' : ''} title={roll.selected === false ? 'Discarded heavy-bomber die' : roll.selected ? 'Selected heavy-bomber die' : undefined}>{roll.value}</span>)}
      </div>
    </div>
  ) : null;
  return (
    <>
      <div className="ax-sheet-body">
        <div className="ax-battle-mini">
          <span>{rocketStrike ? 'Live rocket strike' : strategicRaid ? 'Live strategic raid' : 'Live battle'}</span>
          <b>{spaceName(c.space)}</b>
          <small>{rocketStrike
            ? `Launcher at ${spaceName(c.rocket?.source ?? '')} · one cinematic damage die.`
            : strategicRaid
              ? 'AA fire and bombing damage resolve as separate cinematic rolls.'
              : `Round ${b.round} · Follow the decision card on this device.`}</small>
        </div>
      </div>
      {createPortal(<div className="ax-battle-center" role="dialog" aria-label={`Battle orders for ${spaceName(c.space)}`} aria-live="polite">
        {over && c.confirmed && (
          <div className="ax-battle-cas ig-glass">
            <div className="ax-decision-kicker">{rocketStrike ? 'Rocket strike report' : strategicRaid ? 'Strategic raid report' : 'Battle report'} · {spaceName(c.space)}</div>
            <div className="ax-battle-verdict">{winnerLine}</div>
            {withdrawalReceipt && <div className="ax-retreat-receipt">{withdrawalReceipt}</div>}
            {volleyRecap}
            {rocketStrike ? (
              <>
                <div className="ax-battle-standing">
                  <span style={{ color: powerTextColor(c.attacker) }}>Rocket battery</span> {spaceName(c.rocket?.source ?? '')} · die {c.rocket?.roll ?? 0}
                </div>
                <div className="ax-battle-standing">
                  <span style={{ color: powerTextColor(defenderPower) }}>Factory damage</span> {c.rocket?.appliedDamage ?? 0} applied · {(c.rocket?.damageBefore ?? 0) + (c.rocket?.appliedDamage ?? 0)}/{c.rocket?.cap ?? 0}
                </div>
              </>
            ) : strategicRaid ? (
              <>
                <div className="ax-battle-standing">
                  <span style={{ color: powerTextColor(c.attacker) }}>Bombers</span> {b.attacker.filter((unit) => unit.hp > 0).length} through · {b.attacker.filter((unit) => unit.hp <= 0).length} lost
                </div>
                <div className="ax-battle-standing">
                  <span style={{ color: powerTextColor(defenderPower) }}>Factory damage</span> {c.raid?.rawDamage ?? 0} rolled · {c.raid?.appliedDamage ?? 0} applied · {(c.raid?.damageBefore ?? 0) + (c.raid?.appliedDamage ?? 0)}/{c.raid?.cap ?? 0}
                </div>
              </>
            ) : (
              <>
                <div className="ax-battle-standing">
                  <span style={{ color: powerTextColor(c.attacker) }}>{combatantName(c.attacker)}</span> {standing('attacker')}
                </div>
                <div className="ax-battle-standing">
                  <span style={{ color: powerTextColor(defenderPower) }}>{defenderPower === 'china' ? 'China' : POWERS[defenderPower as PowerKey].name}</span> {standing('defender')}
                </div>
              </>
            )}
            <div className="ax-row" style={{ justifyContent: 'center', gap: 10 }}>
              <button
                className="ax-mega xl"
                disabled={c.confirmed.attacker || submitting || !canContinueAttacker || !view.battleVisualReady}
                onClick={() => submit({ type: 'battleContinue', combatId: c.id, visualSeq: c.visualSeq }, attackerContinueAuthority)}
              >{c.confirmed.attacker
                  ? 'ATTACKER READY'
                  : !canContinueAttacker ? `WAITING FOR ${commanderName(attackerContinueAuthority).toUpperCase()}`
                  : view.battleVisualReady ? 'CONTINUE · ATTACKER' : 'FINAL DICE SETTLING'}</button>
              <button
                className="ax-mega xl"
                disabled={c.confirmed.defender || submitting || !canContinueDefender || !view.battleVisualReady}
                onClick={() => submit({ type: 'battleContinue', combatId: c.id, visualSeq: c.visualSeq }, defenderContinueAuthority)}
              >{c.confirmed.defender
                  ? 'DEFENDER READY'
                  : !canContinueDefender ? `WAITING FOR ${commanderName(defenderContinueAuthority).toUpperCase()}`
                  : view.battleVisualReady ? 'CONTINUE · DEFENDER' : 'FINAL DICE SETTLING'}</button>
            </div>
          </div>
        )}
        {!over && !d && (
          <div className="ax-battle-order-card ig-glass">
            <div className="ax-decision-kicker">{rocketStrike ? 'Rocket strike' : strategicRaid ? 'Strategic bombing raid' : `Round ${b.round} · Fire`}</div>
            <h2>{rocketStrike ? 'Roll rocket damage' : strategicRaid ? battleStep === 'aa_fire' ? 'Roll antiaircraft fire' : 'Roll bombing damage' : 'Roll the next volley'}</h2>
            <p>{rocketStrike
              ? `The AA gun at ${spaceName(c.rocket?.source ?? '')} stays in place. Its single physical die scores face-value damage, capped at ${c.rocket?.cap ?? 0} total factory damage.`
              : strategicRaid
              ? battleStep === 'aa_fire'
                ? 'The defending AA gun rolls once per bomber. Shot-down aircraft never reach the complex.'
                : 'Each surviving bomber scores its die face as damage. Heavy Bombers roll two dice and keep the higher result.'
              : 'Each eligible unit rolls once. Heavy Bombers roll two dice and keep their best attack result.'}</p>
            {volleyRecap}
            {!canRoll && (
              <div className="ax-battle-loading-note" role="status" aria-live="polite">
                Waiting for {commanderName(rollAuthority)} to roll this volley.
              </div>
            )}
            {canRoll && !view.battleVisualReady && (
              <div className="ax-battle-loading-note" role="status" aria-live="polite">
                The TV is loading the cinematic battlefield and physical dice. Rolling unlocks when both are ready.
              </div>
            )}
            <button
              className="ax-mega xl"
              disabled={submitting || !view.battleVisualReady || !canRoll}
              onClick={() => submit({ type: 'battleRoll', combatId: c.id, visualSeq: c.visualSeq } as AxisAction, rollAuthority)}
            >{submitting
                ? 'ROLLING…'
                : !canRoll
                  ? `WAITING FOR ${commanderName(rollAuthority).toUpperCase()}`
                  : view.battleVisualReady
                    ? rocketStrike
                      ? 'ROLL ROCKET DAMAGE'
                      : strategicRaid
                        ? battleStep === 'aa_fire' ? 'ROLL AA FIRE' : 'ROLL BOMBING DAMAGE'
                        : 'ROLL THE DICE'
                    : 'PREPARING CINEMATIC…'}</button>
          </div>
        )}
        {!over && d && !canDecide && (
          <div className="ax-battle-order-card ig-glass" role="status" aria-live="polite">
            <div className="ax-decision-kicker">Commander decision</div>
            <h2>Waiting for {commanderName(decisionAuthority)}</h2>
            <p>The assigned commander is resolving this battle decision. The cinematic battle remains live on the TV.</p>
            {volleyRecap}
          </div>
        )}
        {!over && canDecide && d?.type === 'retreat' && (
          <div className={`ax-battle-order-card ax-retreat-card ig-glass${retreatCopy.terminalTransportStandoff ? ' transport-standoff' : ''}`}>
            <div className="ax-decision-kicker">Attacker decision</div>
            <h2>{retreatCopy.title}</h2>
            <p>{retreatCopy.body}</p>
            {volleyRecap}
            {retreatCopy.routePrompt && <div className="ax-retreat-route-prompt">{retreatCopy.routePrompt}</div>}
            {c.retreatPolicy?.destinations.length ? (
              <div className="ax-retreat-route-grid" role="radiogroup" aria-label="Exact retreat destination">
                {c.retreatPolicy.destinations.map((destination, index) => {
                  const selected = destination === selectedRetreatDestination;
                  return (
                    <button
                      key={destination}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`ax-retreat-route${selected ? ' selected' : ''}`}
                      disabled={submitting || !view.battleVisualReady}
                      onClick={() => setRetreatSelection(destination)}
                    >
                      <span>{index + 1}</span>
                      <b>{spaceName(destination)}</b>
                      <small>{selected
                        ? c.retreatPolicy!.destinations.length === 1 ? 'Preselected - confirm below' : 'Selected retreat route'
                        : 'Choose this route'}</small>
                    </button>
                  );
                })}
              </div>
            ) : retreatCopy.noRouteReason ? (
              <div className="ax-retreat-blocked" role="status">{retreatCopy.noRouteReason}</div>
            ) : null}
            {submittedRetreat && (
              <div className="ax-retreat-submitted" role="status" aria-live="polite">
                {submittedRetreat.kind === 'remain'
                  ? `${retreatCopy.remainLabel} order sent. Waiting for the cinematic battlefield.`
                  : typeof submittedRetreat.destination === 'string'
                    ? `Retreat to ${spaceName(submittedRetreat.destination)} sent. Waiting for the cinematic battlefield.`
                    : 'Aircraft disengagement sent. Waiting for the cinematic battlefield.'}
              </div>
            )}
            <div className="ax-decision-actions">
              <button
                className="ax-mega xl"
                disabled={submitting || !remainAction}
                onClick={() => { if (remainAction) submit(remainAction, decisionAuthority); }}
              >{view.battleVisualReady ? retreatCopy.remainLabel : 'FINAL DICE SETTLING…'}</button>
              <button
                className="ax-mega xl danger"
                disabled={submitting || !retreatAction}
                onClick={() => { if (retreatAction) submit(retreatAction, decisionAuthority); }}
              >{!view.battleVisualReady
                  ? 'FINAL DICE SETTLING…'
                  : !c.retreatPolicy?.canRetreat
                    ? 'RETREAT UNAVAILABLE'
                    : c.retreatPolicy.destinationRequired && typeof selectedRetreatDestination !== 'string'
                      ? 'CHOOSE A RETREAT ROUTE'
                      : retreatCopy.airOnly
                        ? retreatCopy.retreatLabel
                        : typeof selectedRetreatDestination === 'string'
                          ? `${retreatCopy.retreatLabel} TO ${spaceName(selectedRetreatDestination).toUpperCase()}`
                          : retreatCopy.retreatLabel}</button>
            </div>
          </div>
        )}
        {!over && canDecide && d?.type === 'submerge' && (
          <div className="ax-battle-order-card ig-glass">
            <div className="ax-decision-kicker">Submarine decision</div>
            <h2>Strike or slip away?</h2>
            <p>Submerged submarines leave this combat before the next volley and cannot fire.</p>
            {volleyRecap}
            <div className="ax-decision-actions">
              <button className="ax-mega xl" disabled={submitting || !view.battleVisualReady} onClick={() => submit({ type: 'battleSubmerge', uids: [], combatId: c.id, visualSeq: c.visualSeq } as AxisAction, decisionAuthority)}>{view.battleVisualReady ? 'STRIKE' : 'FINAL DICE SETTLING…'}</button>
              <button className="ax-mega xl" disabled={submitting || !view.battleVisualReady} onClick={() => submit({ type: 'battleSubmerge', uids: d.subs, combatId: c.id, visualSeq: c.visualSeq } as AxisAction, decisionAuthority)}>{view.battleVisualReady ? 'SUBMERGE' : 'FINAL DICE SETTLING…'}</button>
            </div>
          </div>
        )}
        {!over && canDecide && d?.type === 'casualties' && (
          <div className="ax-battle-cas ig-glass">
            <div className="ax-decision-kicker">{deciderIsDefender ? 'Defender assigns losses' : 'Attacker assigns losses'}</div>
            <h2>{casualtyPlan?.complete ? 'Casualties ready' : `Assign hit ${(casualtyPlan?.processedHits ?? 0) + 1} of ${casualtyPlan?.totalHits ?? d.picks}`}</h2>
            <p>
              {casualtyPlan?.nextSource === 'aa' ? 'This antiaircraft hit must be assigned to an aircraft.'
                : casualtyPlan?.nextSource === 'sub' ? 'This submarine hit must be assigned to a ship.'
                : casualtyPlan?.nextSource === 'bombard' ? 'This bombardment hit must be assigned to a land defender.'
                : casualtyPlan?.complete ? 'Every assignable hit has a target.'
                : 'Choose an eligible unit for the next hit.'}
              {' '}Damaged battleships survive their first hit.
            </p>
            {volleyRecap}
            <div className="ax-casualty-progress"><span style={{ width: `${Math.min(100, ((casualtyPlan?.processedHits ?? 0) / Math.max(1, casualtyPlan?.totalHits ?? d.picks)) * 100)}%` }} /></div>
            <div className="ax-casualty-grid">
              {casualtyUids.map((uid) => {
                const u = byUid.get(uid);
                if (!u) return null;
                const selectedHits = picked.filter((pick) => pick === uid).length;
                const on = selectedHits > 0;
                const selectable = casualtyPlan?.nextEligible.includes(uid) ?? false;
                return (
                  <div className="ax-casualty-choice" key={uid}>
                    <button
                      className={`ax-chip ax-casualty${on ? ' selected' : ''}`}
                      data-tone={on ? 'danger' : 'plain'}
                      aria-pressed={on}
                      disabled={submitting || !view.battleVisualReady || (!on && !selectable)}
                      onClick={() => setPicked((current) => on ? removeLastCasualtyPick(current, uid) : [...current, uid])}
                    >
                      <UnitIcon unitKey={u.key} size={28} title={UNITS[u.key].name} />
                      <span><b>{UNITS[u.key].name}</b><small>{u.hp > 1 ? 'First hit damages' : 'This hit removes it'}</small></span>
                      <em>{on ? `${selectedHits} hit${selectedHits === 1 ? '' : 's'} - tap to undo` : selectable ? 'Select' : 'Not this hit'}</em>
                    </button>
                    {on && selectable && (
                      <button className="ax-casualty-extra" disabled={submitting || !view.battleVisualReady} onClick={() => setPicked((current) => [...current, uid])}>
                        Assign another hit to this {UNITS[u.key].name.toLowerCase()}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="ax-mega xl" disabled={!casualtyPlan?.complete || submitting || !view.battleVisualReady} onClick={() => { if (casualtyPlan?.complete) submit({ type: 'battleCasualties', uids: casualtyPlan.payload, combatId: c.id, visualSeq: c.visualSeq } as AxisAction, decisionAuthority); setPicked([]); }}>
              {!view.battleVisualReady ? 'FINAL DICE SETTLING…' : casualtyPlan?.complete ? `CONFIRM ${casualtyPlan.assigned} UNIT HIT${casualtyPlan.assigned === 1 ? '' : 'S'}` : `ASSIGNED ${casualtyPlan?.assigned ?? 0} UNIT HIT${casualtyPlan?.assigned === 1 ? '' : 'S'}`}
            </button>
          </div>
        )}
      </div>, document.body)}
    </>
  );
}

function MobilizeSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const p = view.powers[view.active];
  const capital = axisCapitalTurnPresentation(view);
  const staged = capital.regularMobilizationLocked
    ? []
    : Object.entries(p.staging) as [UnitKey, number][];
  const stagedTotal = staged.reduce((sum, [, count]) => sum + count, 0);
  const [sel, setSel] = useState<Record<string, number>>({}); // multi-select: key -> count
  const [confirmCarryover, setConfirmCarryover] = useState(false);
  const [focusedDestination, setFocusedDestination] = useState<string | null>(null);
  const selected = Object.entries(sel)
    .filter(([key, n]) => n > 0 && (!capital.regularMobilizationLocked || key === 'china'));
  const placementSelection = Object.fromEntries(selected);
  const authoritativeChinaPlacementSpaces = () => {
    return new Set(view.chinaPlacementSpaces);
  };
  const obligationCards = axisCarrierObligationCards(view, view.active);
  const requiredPlacements = axisCarrierRequiredPlacements(view, view.active);
  const requiredCarrierCount = requiredPlacements.reduce((total, placement) => total + placement.count, 0);
  const planningState = {
    board: view.board,
    control: view.control,
    contested: view.contested,
    factoryDamage: view.factoryDamage,
    factoriesUsed: p.factoriesUsed,
    techs: p.techs,
    chinaPlacementSpaces: [...authoritativeChinaPlacementSpaces()],
    newCarrierLandingObligations: view.newCarrierLandingObligations,
    stagedCarriers: p.staging.carrier ?? 0,
  };
  const placementPlans = useMemo(() => axisMobilizationDestinationPlans({
    state: planningState,
    idx: AXIS_INDEX,
    power: view.active,
    selection: placementSelection,
  }), [sel, view]);
  const requiredPlacementPlans = useMemo(() => requiredPlacements.map((required) => ({
    required,
    plan: axisMobilizationDestinationPlans({
      state: planningState,
      idx: AXIS_INDEX,
      power: view.active,
      selection: { carrier: required.count },
    }).find((plan) => plan.space === required.seaZone && plan.factory === required.factory),
  })), [view]);
  const pendingPlacement = useMemo(() => capital.regularMobilizationLocked ? null : axisFirstLegalStagedPlacement({
    state: planningState,
    idx: AXIS_INDEX,
    power: view.active,
    staging: p.staging,
  }), [view]);
  const spots = [...new Set(placementPlans.map((plan) => plan.space))];
  const requiredSpots = [...new Set(requiredPlacements.map((placement) => placement.seaZone))];

  const placeAll = (plan: (typeof placementPlans)[number]) => {
    act(buildPlaceBatchAction(plan.space, placementSelection, plan.factory));
    setSel({});
    setFocusedDestination(null);
  };

  const placeRequiredCarrier = (space: string, factory: string, count: number) => {
    act(buildPlaceBatchAction(space, { carrier: count }, factory));
    setSel({});
    setFocusedDestination(null);
  };

  const capacityLabel = (plan: (typeof placementPlans)[number]) => {
    const demands: string[] = [];
    if (plan.productionCount > 0 && plan.factory && plan.factoryRemaining != null) {
      demands.push(`${spaceName(plan.factory)} factory ${plan.productionCount}/${plan.factoryRemaining} open slots`);
    }
    if ((plan.factoryReserved ?? 0) > 0) {
      demands.push(`${plan.factoryReserved} slot${plan.factoryReserved === 1 ? '' : 's'} protected`);
    }
    if ((plan.matchingReservedCarriers ?? 0) > 0) {
      demands.push(`fulfills ${plan.matchingReservedCarriers} required carrier${plan.matchingReservedCarriers === 1 ? '' : 's'}`);
    }
    if (plan.fighterCount > 0 && plan.deck) {
      demands.push(`carrier deck ${plan.fighterCount}/${plan.deck.open} slots`);
    }
    if ((sel.china ?? 0) > 0) {
      demands.push('eligible at mobilization start · any number may deploy');
    }
    return demands.length > 0 ? ` - ${demands.join(' - ')}` : '';
  };

  const endTurn = () => {
    if (view.chinaGrant > 0) return;
    if (requiredCarrierCount > 0) {
      setConfirmCarryover(false);
      setFocusedDestination(requiredPlacements[0]?.seaZone ?? null);
      return;
    }
    if (selected.length > 0 && placementPlans.length > 0) {
      setConfirmCarryover(false);
      setFocusedDestination(placementPlans[0]!.space);
      return;
    }
    if (pendingPlacement) {
      setConfirmCarryover(false);
      setSel({ [pendingPlacement.key]: 1 });
      setFocusedDestination(pendingPlacement.plan.space);
      return;
    }
    if (!capital.regularMobilizationLocked && stagedTotal > 0) {
      setConfirmCarryover(true);
      return;
    }
    act({ type: 'endPhase' });
  };

  useEffect(() => {
    if (!confirmCarryover) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmCarryover(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmCarryover]);

  useEffect(() => {
    if (requiredCarrierCount > 0 || pendingPlacement) setConfirmCarryover(false);
  }, [requiredCarrierCount, pendingPlacement]);

  useEffect(() => {
    const legal = selected.length > 0 ? spots : requiredSpots;
    setFocusedDestination((current) => current && legal.includes(current) ? current : null);
  }, [
    selected.map(([key, count]) => `${key}:${count}`).join('|'),
    spots.join('|'),
    requiredSpots.join('|'),
  ]);

  // the camera sits on the mobilization zone while units are chosen; the
  // legal destinations light up on the map as soon as something is selected
  useEffect(() => {
    const activeSpots = selected.length > 0 ? spots : requiredSpots;
    map({
      picks: activeSpots.map((id) => ({ id, color: selected.length > 0 ? '#7be0a3' : '#e8b450' })),
      onPick: (id) => {
        if (!activeSpots.includes(id)) return;
        if (selected.length === 0) {
          setFocusedDestination(id);
          return;
        }
        const plans = placementPlans.filter((plan) => plan.space === id);
        if (plans.length === 1) placeAll(plans[0]!);
        else setFocusedDestination(id);
      },
      focusSpace: focusedDestination ?? (selected.length > 0 || requiredSpots.length > 0 ? null : 'mobilization'),
    });
  }, [
    placementPlans.map((plan) => `${plan.space}:${plan.factory ?? ''}:${plan.factoryRemaining ?? ''}:${plan.deck?.open ?? ''}`).join('|'),
    requiredPlacements.map((placement) => `${placement.seaZone}:${placement.factory}:${placement.count}`).join('|'),
    selected.map(([k, n]) => k + n).join(','),
    focusedDestination,
  ]);

  const visiblePlacementPlans = focusedDestination && spots.includes(focusedDestination)
    ? placementPlans.filter((plan) => plan.space === focusedDestination)
    : placementPlans;

  return (
    <>
    <div className="ax-sheet-body">
      <div className="ig-lab">Mobilize · pick units, then tap a lit destination</div>
      {capital.mobilize && (
        <div className={`ax-capital-mobilize ${capital.occupiedNow ? 'occupied' : 'restored'}`} role="status">
          <b>{capital.mobilize.title}</b>
          <span>{capital.mobilize.detail}</span>
        </div>
      )}
      {requiredPlacements.length > 0 && (
        <section className="ax-required-carrier-list" aria-label="Required carrier placements">
          <div className="ax-required-carrier-title">
            <span>Landing commitment</span>
            <b>{requiredCarrierCount} carrier{requiredCarrierCount === 1 ? '' : 's'} must deploy</b>
            <small>These factory slots are protected. Place every promised carrier before ending the turn.</small>
          </div>
          {requiredPlacementPlans.map(({ required, plan }) => {
            const obligation = obligationCards.find((card) => card.seaZone === required.seaZone);
            const stagedCarriers = p.staging.carrier ?? 0;
            const canPlace = Boolean(plan) && stagedCarriers >= required.count;
            const focused = focusedDestination === required.seaZone;
            return (
              <article
                className={`ax-required-carrier${focused ? ' focused' : ''}`}
                key={`${required.seaZone}-${required.factory}`}
              >
                <UnitIcon unitKey="carrier" size={30} title="Required aircraft carrier" />
                <span>
                  <b>{required.count} carrier{required.count === 1 ? '' : 's'} to {spaceName(required.seaZone)}</b>
                  <small>
                    Build from {spaceName(required.factory)}
                    {obligation ? ` - secures ${obligation.fighterCount} fighter${obligation.fighterCount === 1 ? '' : 's'}` : ''}
                  </small>
                </span>
                <button
                  className="ax-required-carrier-place"
                  disabled={!canPlace}
                  title={canPlace ? `Place from ${spaceName(required.factory)}` : 'The required carrier placement is not currently legal.'}
                  onClick={() => placeRequiredCarrier(required.seaZone, required.factory, required.count)}
                >
                  PLACE REQUIRED
                </button>
              </article>
            );
          })}
        </section>
      )}
      {staged.length === 0 && view.chinaGrant === 0 && (
        <div className="ax-empty-hint">{capital.mobilize?.empty ?? 'Nothing staged. End the turn to collect income.'}</div>
      )}
      <div className="ax-units">
        {staged.map(([k, n]) => (
          <div key={k} className="ax-unit-row">
            <span className="ax-unit-label">
              <UnitIcon unitKey={k} size={22} /> {UNITS[k].name} × {n}
              {k === 'carrier' && requiredCarrierCount > 0 && (
                <small className="ax-staged-reserved">{requiredCarrierCount} reserved</small>
              )}
            </span>
            <Stepper value={sel[k] ?? 0} max={n} onChange={(v) => setSel((s) => ({ ...s, [k]: v }))} label={UNITS[k].name} />
          </div>
        ))}
        {view.chinaGrant > 0 && (
          <div className="ax-unit-row">
            <span className="ax-unit-label"><UnitIcon unitKey="infantry" size={22} /> Chinese infantry × {view.chinaGrant}</span>
            <Stepper value={sel.china ?? 0} max={view.chinaGrant} onChange={(v) => setSel((s) => ({ ...s, china: v }))} label="Chinese infantry" />
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="ax-row ax-wrap ax-mobilize-destinations">
          {focusedDestination && spots.includes(focusedDestination) && spots.length > 1 && (
            <Chip label="Show all destinations" onTap={() => setFocusedDestination(null)} />
          )}
          {visiblePlacementPlans.map((plan) => (
            <Chip
              key={`${plan.space}:${plan.factory ?? 'none'}`}
              label={`Place at ${spaceName(plan.space)}${capacityLabel(plan)}`}
              tone={(plan.matchingReservedCarriers ?? 0) > 0 ? 'future' : 'gold'}
              onTap={() => placeAll(plan)}
            />
          ))}
          {spots.length === 0 && (
            <span style={{ fontSize: 12.5, opacity: 0.68 }}>
              No destination has enough legal capacity for that whole batch. Reduce the selection or choose another unit type.
            </span>
          )}
        </div>
      )}
      <div className="ax-row">
        <Chip
          label={requiredCarrierCount > 0
            ? `Place ${requiredCarrierCount} required carrier${requiredCarrierCount === 1 ? '' : 's'}`
            : pendingPlacement
              ? `Deploy remaining units · ${stagedTotal} awaiting`
            : capital.mobilize?.endLabel ?? (stagedTotal > 0 ? `End turn · ${stagedTotal} unplaced` : 'End turn · collect income')}
          tone="gold"
          disabled={view.chinaGrant > 0 || requiredCarrierCount > 0}
          onTap={endTurn}
          title={requiredCarrierCount > 0
            ? 'Place every carrier promised as an aircraft landing before ending the turn.'
            : pendingPlacement
              ? `At least one ${UNITS[pendingPlacement.key].name} can still deploy. Tap to select it and focus a legal destination.`
            : capital.mobilize?.endTitle ?? (view.chinaGrant > 0 ? 'Place every Chinese infantry grant before ending the US turn.' : stagedTotal > 0 ? 'Review unplaced units before ending the turn.' : 'Collect income and hand play to the next power.')}
        />
      </div>
    </div>
    {!capital.regularMobilizationLocked && requiredCarrierCount === 0 && !pendingPlacement && confirmCarryover && createPortal(
      <div className="ax-modal dark" onClick={() => setConfirmCarryover(false)} role="presentation">
        <div className="ig-glass ax-modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ax-carryover-title">
          <div className="ax-decision-kicker">Unplaced reinforcements</div>
          <h2 id="ax-carryover-title" style={{ margin: '4px 0 8px' }}>{stagedTotal} unit{stagedTotal === 1 ? '' : 's'} cannot deploy this turn</h2>
          <p style={{ fontSize: 13.5, opacity: 0.84, margin: '0 0 14px' }}>
            Every eligible factory or carrier deck is full. These blocked units can remain in {POWERS[view.active].name}'s mobilization zone for the next turn while income is collected now.
          </p>
          <div className="ax-col">
            <button className="ax-order-go" autoFocus onClick={() => setConfirmCarryover(false)}>KEEP DEPLOYING</button>
            <button className="ax-chip" data-tone="gold" onClick={() => { setConfirmCarryover(false); act({ type: 'endPhase' }); }}>
              KEEP BLOCKED UNITS &amp; END TURN
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

// ---------- nation panel (assets + reference card) ----------

function NationPanel({ view, onClose }: { view: AxisView; onClose: () => void }) {
  const me = view.active;
  const p = view.powers[me];
  const territories = AXIS_MAP.territories.filter((t) => view.control[t.id] === me).length;
  const inventory = axisForceInventory(view.board, me);
  const fielded = Object.values(inventory).reduce((sum, count) => sum + (count ?? 0), 0);
  return (
    <div className="ax-nation" onClick={onClose}>
      <div className="ax-nation-card ig-glass" onClick={(e) => e.stopPropagation()} style={{ borderColor: powerHex(me) }}>
        <div className="ax-row" style={{ justifyContent: 'space-between' }}>
          <b style={{ color: powerTextColor(me), fontSize: 18, letterSpacing: '.04em' }}>{POWERS[me].name}</b>
          <button className="ax-chip" onClick={onClose}>Close</button>
        </div>
        <div className="ax-row" style={{ gap: 18, margin: '6px 0 10px' }}>
          <span className="ig-num"><b>{p.ipcs}</b> IPCs</span>
          <span className="ig-num">+{p.production} production</span>
          <span className="ig-num">{territories} territories</span>
        </div>
        {p.techs.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="ig-lab">Developments</div>
            <div className="ax-row ax-wrap" style={{ marginTop: 4 }}>
              {p.techs.map((t: TechKey) => (
                <span
                  key={t}
                  className="ax-chip"
                  style={{ cursor: 'default' }}
                  title={TECH_BY_KEY[t].text}
                  aria-label={`${TECH_BY_KEY[t].name}: ${TECH_BY_KEY[t].text}`}
                >{TECH_BY_KEY[t].name}</span>
              ))}
            </div>
          </div>
        )}
        <div className="ig-lab">Forces in theater · {fielded} fielded</div>
        <div className="ax-force-roster" aria-label={`${POWERS[me].name} forces in theater`}>
          {REFERENCE.filter((key) => (inventory[key] ?? 0) > 0).map((key) => (
            <span key={key}><UnitIcon unitKey={key} size={21} title={UNITS[key].name} /><b className="ig-num">{inventory[key]}</b><small>{UNITS[key].name}</small></span>
          ))}
        </div>
        <div className="ig-lab">Unit reference</div>
        <table className="ax-ref">
          <thead>
            <tr><th></th><th>Cost</th><th>Att</th><th>Def</th><th>Move</th></tr>
          </thead>
          <tbody>
            {REFERENCE.map((k) => {
              const current = axisCurrentUnitReference(k, p.techs);
              return (
                <tr key={k}>
                  <td>{UNITS[k].name}</td>
                  <td className="ig-num" title={current.costModified ? 'Modified by Improved Shipyards' : undefined}>{current.costModified ? <strong>{current.cost}</strong> : current.cost}</td>
                  <td className="ig-num" title={current.attackModified ? 'Modified by developed technology' : undefined}>{current.attackModified ? <strong>{current.attack}</strong> : current.attack || '·'}</td>
                  <td className="ig-num">{current.defense || '·'}</td>
                  <td className="ig-num" title={current.moveModified ? 'Modified by Long-Range Aircraft' : undefined}>{current.moveModified ? <strong>{current.move}</strong> : current.move || '·'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 8 }}>
          Current values include direct technology upgrades; upgraded values are bold. Conditional effects are listed under Developments.
        </div>
      </div>
    </div>
  );
}

// ---------- the IPC bank: counter, bills, income fly-in ----------

interface DeckInfo { face: string | null; grid: [number, number] | null }
function billDeck(manifest: AxisManifest | null, denom: 1 | 5 | 10): DeckInfo | null {
  const nick = denom === 1 ? /ONE/ : denom === 5 ? /FIVE/ : /TEN/;
  const deck = (manifest as unknown as { ipcDecks?: { nick: string; face: string | null; grid: [number, number] | null }[] })?.ipcDecks?.find((d) => nick.test(d.nick ?? ''));
  return deck ? { face: deck.face, grid: deck.grid } : null;
}
function billStyle(deck: DeckInfo | null): CSSProperties {
  if (!deck?.face) return {};
  const [cols, rows] = deck.grid ?? [10, 7];
  return {
    backgroundImage: `url(${deck.face})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: '0% 0%',
  };
}

function IpcBank({ view, manifest }: { view: AxisView; manifest: AxisManifest | null }) {
  const me = view.active;
  const ipcs = view.powers[me].ipcs;
  const [open, setOpen] = useState(false);
  const [flying, setFlying] = useState(0);
  const prev = useRef({ power: me, ipcs });

  useEffect(() => {
    if (prev.current.power === me && ipcs > prev.current.ipcs) {
      setFlying(Math.min(6, Math.max(3, Math.round((ipcs - prev.current.ipcs) / 6))));
      const t = setTimeout(() => setFlying(0), 1600);
      prev.current = { power: me, ipcs };
      return () => clearTimeout(t);
    }
    setFlying(0);
    prev.current = { power: me, ipcs };
  }, [ipcs, me]);

  // greedy note split
  const tens = Math.floor(ipcs / 10);
  const fives = Math.floor((ipcs % 10) / 5);
  const ones = ipcs % 5;
  const oneDeck = billDeck(manifest, 1);
  const fiveDeck = billDeck(manifest, 5);
  const tenDeck = billDeck(manifest, 10);

  return (
    <>
      <button className="ax-bank ig-glass" onClick={() => setOpen(true)} aria-label={`Open treasury. ${ipcs} IPCs available`}>
        <span className="ax-bank-mark">IPC</span>
        <span className="ax-bank-copy">
          <small>Treasury</small>
          <b className="ig-num">{ipcs}</b>
        </span>
      </button>
      {flying > 0 && Array.from({ length: flying }, (_, i) => (
        <span key={i} className="ax-bill-fly" style={{ animationDelay: `${i * 0.14}s`, ...billStyle(oneDeck) }} />
      ))}
      {open && (
        <div className="ax-nation" onClick={() => setOpen(false)}>
          <div className="ax-nation-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ax-row" style={{ justifyContent: 'space-between' }}>
              <b>Treasury · {ipcs} IPCs</b>
              <button className="ax-chip" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="ax-bills">
              {[
                { n: tens, denom: 10, deck: tenDeck },
                { n: fives, denom: 5, deck: fiveDeck },
                { n: ones, denom: 1, deck: oneDeck },
              ].map(({ n, denom, deck }) => (
                n > 0 && (
                  <div key={denom} className="ax-bill-stack">
                    {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                      <span key={i} className="ax-bill" style={{ left: i * 9, top: -i * 2, ...billStyle(deck) }} />
                    ))}
                    <span className="ax-bill-label ig-num">{n} × {denom}</span>
                  </div>
                )
              ))}
              {ipcs === 0 && <span style={{ opacity: 0.6, fontSize: 13 }}>Empty. Capture something.</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AuthorityWaiting({ power, context }: { power: PowerKey; context?: string }) {
  return (
    <div className="ax-sheet-body" role="status" aria-live="polite">
      <div className="ax-battle-mini ax-authority-wait">
        <span>Waiting for commander</span>
        <b>{context ?? `${POWERS[power].name} is acting`}</b>
        <small>This device is observing the active turn. Controls unlock automatically when one of your powers must act.</small>
      </div>
    </div>
  );
}

function DefendingCarrierLandingSheet({ view, act, map, error }: {
  view: AxisView;
  act: (action: AxisAction) => void;
  map: PublishMap;
  error: string | null;
}) {
  const landing = view.defendingCarrierLanding!;
  const progress = landing.progress;
  const decision = progress.ok && progress.status === 'decision' ? progress.decision : null;
  const cards = useMemo(() => axisDefendingCarrierLandingCards(landing), [landing]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedCard = cards.find((card) => card.key === selectedKey) ?? null;
  const fighterRef = decision?.fighter.ref ?? null;
  const origin = decision?.fighter.originSeaZone ?? null;
  const optionSpaces = [...new Set(cards.flatMap((card) => card.space ? [card.space] : []))];
  const ambiguousSpaces = optionSpaces.filter((space) => cards.filter((card) => card.space === space).length > 1);

  useEffect(() => {
    setSelectedKey(null);
    setSubmitting(false);
  }, [fighterRef, landing.choices.length]);
  useEffect(() => { if (error) setSubmitting(false); }, [error]);
  useEffect(() => {
    if (!submitting) return;
    const timeout = window.setTimeout(() => setSubmitting(false), 6_000);
    return () => window.clearTimeout(timeout);
  }, [submitting]);

  useEffect(() => {
    if (!decision || !origin) {
      map(MAP_IDLE);
      return () => map(MAP_IDLE);
    }
    const chooseSpace = (id: string) => {
      const exact = axisUniqueDefendingCarrierOptionAtSpace(cards, id);
      // Several legal decks can share one region. A region tap may never pick
      // one physical hull on the player's behalf.
      setSelectedKey((current) => exact ? (current === exact.key ? null : exact.key) : null);
    };
    const arrows: OrderArrow[] = selectedCard?.space
      && SPACE_CENTER[origin]
      && SPACE_CENTER[selectedCard.space]
      ? [{
          from: [SPACE_CENTER[origin]],
          to: SPACE_CENTER[selectedCard.space],
          color: selectedCard.kind === 'destroy' ? '#e06b62' : '#78e2bd',
        }]
      : [];
    map({
      picks: optionSpaces.map((id) => ({
        id,
        color: selectedCard?.space === id ? '#f4ca64' : ambiguousSpaces.includes(id) ? '#e8b450' : '#78e2bd',
      })),
      onPick: chooseSpace,
      onRegionTap: chooseSpace,
      focusSpace: selectedCard?.space ?? origin,
      arrows,
    });
    return () => map(MAP_IDLE);
  }, [cards, fighterRef, origin, selectedKey]);

  if (!progress.ok) {
    return (
      <div className="ax-sheet-body">
        <div className="ax-def-carrier-invalid" role="alert">
          <span>Emergency landing state needs attention</span>
          <b>{progress.error}</b>
          <small>Ordinary movement remains paused so no fighter or deck slot can be guessed.</small>
        </div>
      </div>
    );
  }
  if (!decision) {
    return (
      <div className="ax-sheet-body">
        <div className="ax-def-carrier-invalid" role="status">
          <span>Emergency carrier landing</span>
          <b>{progress.status === 'waiting-for-combat' ? 'Waiting for every battle to finish' : 'Landing queue complete'}</b>
        </div>
      </div>
    );
  }

  const ownerFighters = landing.snapshot.fighters
    .filter((fighter) => fighter.power === decision.owner)
    .map((fighter) => fighter.ref)
    .sort();
  const fighterOrdinal = Math.max(1, ownerFighters.indexOf(decision.fighter.ref) + 1);
  const totalFighters = landing.snapshot.fighters.length;
  const resolved = landing.choices.length;
  const submitLanding = () => {
    if (!selectedCard || submitting) return;
    setSubmitting(true);
    act({ ...selectedCard.action, asPower: decision.owner } as unknown as AxisAction);
  };

  return (
    <div className="ax-sheet-body ax-def-carrier-sheet">
      <section className="ax-def-carrier-hero" aria-labelledby="ax-def-carrier-title">
        <div className="ax-def-carrier-emblem"><UnitIcon unitKey="fighter" size={34} title="Surviving carrier fighter" /></div>
        <div>
          <span>Emergency landing · combat complete</span>
          <h3 id="ax-def-carrier-title">Bring {POWERS[decision.owner].name} fighter {fighterOrdinal} home</h3>
          <p>Ordinary movement is paused. Choose one exact legal destination for this surviving carrier fighter.</p>
        </div>
        <b className="ig-num">{resolved + 1}<small> / {totalFighters}</small></b>
      </section>

      <div className="ax-def-carrier-route" role="status">
        <span><small>Launched from</small><b>{spaceName(decision.fighter.originSeaZone)}</b></span>
        <i aria-hidden>→</i>
        <span><small>Current priority</small><b>{cards[0]?.ruleLabel ?? 'Landing'}</b></span>
      </div>

      {ambiguousSpaces.length > 0 && (
        <div className="ax-def-carrier-ambiguity">
          <b>Choose the exact flight deck</b>
          <span>{ambiguousSpaces.map((space) => `${spaceName(space)} has ${cards.filter((card) => card.space === space).length} legal carriers`).join(' · ')}. The map will not choose one automatically.</span>
        </div>
      )}

      <div className="ax-def-carrier-options" role="group" aria-label="Exact fighter landing options">
        {cards.map((card) => {
          const selected = selectedKey === card.key;
          return (
            <button
              key={card.key}
              type="button"
              className={`ax-def-carrier-card${selected ? ' selected' : ''}${card.kind === 'destroy' ? ' loss' : ''}`}
              aria-pressed={selected}
              onClick={() => setSelectedKey((current) => current === card.key ? null : card.key)}
            >
              <span className="ax-def-carrier-card-icon">
                <UnitIcon unitKey={card.kind === 'carrier' ? 'carrier' : 'fighter'} size={28} title={card.title} />
              </span>
              <span className="ax-def-carrier-card-copy">
                <small>{card.ruleLabel}</small>
                <b>{card.kind === 'destroy' ? card.title : `${card.title} · ${spaceName(card.space!)}`}</b>
                <em>{card.detail}</em>
              </span>
              {card.kind === 'carrier' && (
                <span className="ax-def-carrier-deck" aria-label={`${card.occupied ?? 0} occupied, ${card.open ?? 0} open deck slots`}>
                  <i className={(card.occupied ?? 0) >= 1 ? 'filled' : ''} />
                  <i className={(card.occupied ?? 0) >= 2 ? 'filled' : ''} />
                  <small>{card.open} open</small>
                </span>
              )}
              <span className="ax-def-carrier-check" aria-hidden>{selected ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <button
        className={`ax-mega xl ax-def-carrier-confirm${selectedCard?.kind === 'destroy' ? ' danger' : ''}`}
        disabled={!selectedCard || submitting}
        onClick={submitLanding}
      >
        {submitting
          ? 'CONFIRMING EXACT LANDING…'
          : !selectedCard
            ? 'SELECT ONE EXACT DESTINATION'
            : selectedCard.kind === 'destroy'
              ? 'CONFIRM FIGHTER LOSS'
              : `LAND AT ${spaceName(selectedCard.space!)}`}
      </button>
      <small className="ax-def-carrier-footnote">Each fighter resolves separately. Used deck slots update before the next fighter is offered.</small>
    </div>
  );
}

function CarrierObligationBanner({ view }: { view: AxisView }) {
  const cards = axisCarrierObligationCards(view, view.active);
  if (cards.length === 0) return null;
  return (
    <section className="ax-carrier-obligations" aria-label="Required carrier landings" role="status">
      <div className="ax-carrier-obligation-head">
        <span>Purchased carrier required</span>
        <b>{cards.reduce((total, card) => total + card.carrierCount, 0)} reserved</b>
      </div>
      {cards.map((card) => (
        <div className="ax-carrier-obligation" key={`${card.power}-${card.seaZone}`}>
          <UnitIcon unitKey="carrier" size={25} title="Required aircraft carrier" />
          <span>
            <b>{card.fighterCount} fighter{card.fighterCount === 1 ? '' : 's'} → {spaceName(card.seaZone)}</b>
            <small>{card.carrierCount} carrier{card.carrierCount === 1 ? '' : 's'} · {card.carrierFactories.map(spaceName).join(' + ')}</small>
          </span>
          <em>REQUIRED</em>
        </div>
      ))}
    </section>
  );
}

// ---------- top-level ----------

export default function AxisPlay({ view, act, error }: {
  view: AxisView;
  act: (a: AxisAction) => void;
  error: string | null;
}) {
  const me = view.active; // dev single-player: the device drives the active power
  const p = view.powers[me];
  const canCommandActive = view.controlledPowers.includes(me);
  const defendingCarrierOwner = axisDefendingCarrierLandingOwner(view.defendingCarrierLanding);
  const defendingCarrierActive = view.defendingCarrierLanding != null;
  const commandPowerKey = defendingCarrierOwner ?? me;
  const commandPower = POWERS[commandPowerKey];
  const canResolveDefendingCarrier = defendingCarrierOwner != null
    && view.controlledPowers.includes(defendingCarrierOwner);
  // sheets may name the power they act for (battle decisions belong to the
  // defender); default is the active power
  const actAs: Act = (a) => act({ asPower: me, ...a } as unknown as AxisAction);
  const manifest = useAxisManifest();
  const ready = useSceneReady();
  const [showNation, setShowNation] = useState(false);
  const [showIntro, setShowIntro] = useState(() => {
    try { return window.localStorage.getItem('axis-guide-v2') !== 'seen'; } catch { return true; }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mapCtl, setMapCtl] = useState<MapCtl>(MAP_IDLE);
  const publish: PublishMap = (ctl) => setMapCtl(ctl);
  const dismissIntro = () => {
    setShowIntro(false);
    try { window.localStorage.setItem('axis-guide-v2', 'seen'); } catch { /* private browsing */ }
  };
  useEffect(() => {
    if (defendingCarrierActive) setShowNation(false);
  }, [defendingCarrierActive]);

  const staged: StagedStack[] = useMemo(() => {
    const out: StagedStack[] = [];
    for (const pw of view.turnOrder) {
      if (pw === view.active && view.turnStartedCapitalOccupied) continue;
      for (const [key, count] of Object.entries(view.powers[pw].staging)) {
        if (count) out.push({ power: pw, key: key as UnitKey, count: count as number });
      }
    }
    return out;
  }, [view.powers, view.active, view.turnStartedCapitalOccupied]);

  // A phase sheet from the previous power may have published live map
  // callbacks. Drop them as soon as this recipient becomes an observer so a
  // stale highlight can never dispatch an unauthorized order.
  useEffect(() => {
    if (!canCommandActive && view.phase !== 'battle' && !canResolveDefendingCarrier) setMapCtl(MAP_IDLE);
  }, [canCommandActive, canResolveDefendingCarrier, view.phase, view.active]);

  const renderedMapCtl = canCommandActive || view.phase === 'battle' || canResolveDefendingCarrier ? mapCtl : MAP_IDLE;

  const focus: FocusTarget | null = useMemo(() => {
    if (!renderedMapCtl.focusSpace) return null;
    const c = SPACE_CENTER[renderedMapCtl.focusSpace];
    if (!c) return null;
    const [x, z] = px2r(c[0], c[1]);
    return { x, z, dist: 18 };
  }, [renderedMapCtl.focusSpace]);

  if (!manifest) return <AxisLoading label="Reading the mod" />;

  const phaseInfo = PHASE_INFO[view.phase] ?? PHASE_INFO.combatMove;
  const capital = axisCapitalTurnPresentation(view);

  return (
    <div className={`ax-page2${collapsed ? ' command-collapsed' : ''}`}>
      <div className="ax-map-bg">
        <AxisTable
          manifest={manifest}
          board={view.board}
          control={view.control}
          focus={focus}
          picks={renderedMapCtl.picks}
          onPick={renderedMapCtl.onPick}
          staged={staged}
          arrows={renderedMapCtl.arrows}
          selectedPieces={renderedMapCtl.selectedPieces}
          onUnitTap={renderedMapCtl.onUnitTap}
          onRegionTap={renderedMapCtl.onRegionTap}
          paused={Boolean(view.combat) && view.combat?.battle.decision?.type !== 'retreat'}
          fixedFrame
        />
      </div>
      {!ready && <AxisLoading label="Setting up the table" overlay />}

      <aside className={`ax-left ax-command ig-glass${collapsed ? ' collapsed' : ''}`} aria-label={`${commandPower.name} command panel`}>
        <header className="ax-left-head">
          <div className="ax-command-heading">
            <div className="ax-command-kicker ig-lab">{view.options.scenario} scenario · Round {view.round}</div>
            <div className="ax-command-nation">
              <span className="ax-power-dot" style={{ background: commandPower.color }} aria-hidden />
              <b style={{ color: powerTextColor(commandPowerKey) }}>{commandPower.name}</b>
              <span>{defendingCarrierActive ? 'Landing' : phaseInfo.short}</span>
            </div>
          </div>
          <div className="ax-command-tools">
            {!defendingCarrierActive && <button className="ax-tool-button" onClick={() => setShowNation(true)}>Nation</button>}
            <button className="ax-tool-button" onClick={() => setShowIntro(true)}>Guide</button>
          </div>
        </header>
        {!defendingCarrierActive && capital.banner && (
          <div className={`ax-capital-alert player ${capital.banner.tone}`} role="status" aria-live="polite">
            <b>{capital.banner.title}</b>
            <span>{capital.banner.detail}</span>
          </div>
        )}
        {!defendingCarrierActive && <CarrierObligationBanner view={view} />}
        <PhaseRail view={view} />
        <UsaChinaOperationProgress view={view} />
        {!defendingCarrierActive && <div className="ax-command-stats" aria-label="Nation status">
          <div><small>Spendable</small><b className="ig-num">{p.ipcs}</b><span>IPCs</span></div>
          <div>
            <small>Income</small>
            <b className="ig-num">{capital.incomeAvailable ? `+${p.production}` : '—'}</b>
            <span>{capital.occupiedNow ? 'capital held' : capital.liberatedMidturn ? 'restored' : 'per turn'}</span>
          </div>
          <div><small>Victory cities</small><b className="ig-num">{POWERS[me].coalition === 'axis' ? view.vc.axis : view.vc.allies}</b><span>of {view.vc.goal}</span></div>
        </div>}
        <div className="ax-command-scroll">
          <PhaseBrief view={view} />
          {error && <div className="ax-error" role="alert">{error}</div>}
          {!showIntro && defendingCarrierActive && (defendingCarrierOwner == null || canResolveDefendingCarrier) && (
            <DefendingCarrierLandingSheet view={view} act={act} map={publish} error={error} />
          )}
          {!showIntro && defendingCarrierActive && defendingCarrierOwner != null && !canResolveDefendingCarrier && (
            <AuthorityWaiting power={defendingCarrierOwner} context={`${POWERS[defendingCarrierOwner].name} is choosing an emergency carrier landing`} />
          )}
          {!showIntro && !defendingCarrierActive && view.phase !== 'battle' && view.phase !== 'gameOver' && !canCommandActive && <AuthorityWaiting power={me} />}
          {!showIntro && !defendingCarrierActive && canCommandActive && view.phase === 'rnd' && <ResearchSheet view={view} act={actAs} map={publish} />}
          {!showIntro && !defendingCarrierActive && canCommandActive && view.phase === 'purchase' && <PurchaseSheet view={view} act={actAs} map={publish} />}
          {!showIntro && !defendingCarrierActive && canCommandActive && view.phase === 'combatMove' && view.active === 'usa' && !view.usaOperationFirst && <UsaChinaOrderChooser act={actAs} map={publish} />}
          {!showIntro && !defendingCarrierActive && canCommandActive && view.phase === 'combatMove' && (view.active !== 'usa' || view.usaOperationFirst) && <MoveFlow key={`combat-${view.operatingPower}`} view={view} act={actAs} mode="combat" map={publish} />}
          {!showIntro && !defendingCarrierActive && view.phase === 'battle' && view.combat && <BattleSheet view={view} act={actAs} map={publish} error={error} />}
          {!showIntro && !defendingCarrierActive && canCommandActive && view.phase === 'noncombat' && <MoveFlow key={`noncombat-${view.operatingPower}`} view={view} act={actAs} mode="noncombat" map={publish} />}
          {!showIntro && !defendingCarrierActive && canCommandActive && view.phase === 'mobilize' && <MobilizeSheet view={view} act={actAs} map={publish} />}
          {!showIntro && !defendingCarrierActive && view.phase === 'gameOver' && (
            <div className="ax-sheet-body">
              <div className="ig-lab">Game over</div>
              <div style={{ fontSize: 15 }}>{view.winner === 'axis' ? 'The Axis' : 'The Allies'} win.</div>
            </div>
          )}
        </div>
        <footer className="ax-command-footer">
          <span>{WIN_CONDITIONS[view.options.winCondition].label}</span>
          <span className="ig-num">Axis {view.vc.axis} · Allies {view.vc.allies}</span>
        </footer>
      </aside>
      <button
        className="ax-left-tab ig-glass"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Open the menu' : 'Collapse to the map'}
      >{collapsed ? '›' : '‹'}</button>

      <IpcBank view={view} manifest={manifest} />

      {showNation && <NationPanel view={view} onClose={() => setShowNation(false)} />}
      {showIntro && (
        <GameIntro intro={AXIS_INTRO} onClose={dismissIntro} />
      )}
    </div>
  );
}
