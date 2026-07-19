// Container player device: one no-scroll page — the player's harbor board as
// a top-down authentic-art tableau, cash/loans/scoring card private panel,
// every action as an explicit control with unaffordable options greyed out
// with a reason, arrangement dialogs for pricing containers, the Off-Shore
// Bank panel, secret delivery bidding, and an explicit END TURN.

import { useEffect, useMemo, useState } from 'react';
import type {
  ContainerView, ContAction, ContColor, ContLots, ContBidContainer, ContainerState,
} from '@bge/shared';
import {
  CONT_COLORS, CONT_RULES, contLotCount, contDistributeCounts,
  CONT_SCORING_CARDS, CONT_BLUFF_MAX,
} from '@bge/shared';
import { playSfx } from '../sfx';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { CONT_SCENE, CONT_PIECE_HEX, CONT_UI_HEX } from './cont-scene';
import { ContainerMat } from './ContainerMat';
import './container.css';

const S = CONT_SCENE;

const CONTAINER_INTRO: Intro = {
  title: 'Container',
  tagline: 'Run a shipping line: produce, price, ship, and auction containers.',
  goal: 'Make the most money. Produce containers at your factories, sell them through opponents, ship them to Container Island, and auction them off. Your secret scoring card sets what each color is worth to you at the end.',
  points: [
    { label: 'Two actions per turn', detail: 'Build, Produce, Factory Purchase, Harbor Purchase, Sail, Reprice, or Call Bank. Produce and Call Bank at most once per turn. Then press END TURN.' },
    { label: 'You never buy your own goods', detail: 'Your factories sell to opponents; your harbor sells to opponents’ ships. Set prices to tempt them.' },
    { label: 'Shipping', detail: 'Sail your ship between the ocean, opponents’ harbors, the Off-Shore Bank, and Container Island. Docking at a harbor gives one free purchase.' },
    { label: 'Delivery auctions', detail: 'Docking at Container Island auctions your cargo. Opponents bid secretly; you collect the bid plus a matching subsidy, or buy the load out for yourself.' },
    { label: 'The Off-Shore Bank', detail: 'Auction cash for containers or containers for cash, and take $10 loans, $1 interest per turn, $11 to settle at game end.' },
    { label: 'Game end', detail: 'When the supply runs out of two container colors, the turn finishes and everyone scores: island containers by your secret card, $3 per container on ships and at the bank, $2 in harbors.' },
  ],
  rulebook: '/container/rulebook.pdf',
  walkthrough: [
    { title: 'Your board', body: 'The bottom half is your factory district, the top your harbor. Containers sit in priced lots; the tracks show your next building cost and storage limits.' },
    { title: 'Produce and price', body: 'PRODUCE pays $1 to the player on your right and makes one container per factory. Arrange them in your $1-$4 lots; the price is what opponents pay you.' },
    { title: 'Buying', body: 'FACTORY PURCHASE trucks containers from one opponent’s factory lots into your harbor. Dock your ship at a harbor and load with HARBOR PURCHASE.' },
    { title: 'Delivering', body: 'SAIL to the ocean, then to Container Island. Your cargo is auctioned: everyone else bids secretly, and you take the high bid doubled, or pay the bank to keep the load.' },
    { title: 'The bank', body: 'CALL BANK starts or raises an auction, cash for a container lot, containers for a cash lot. Win it at the start of your next turn. Loans are always available.' },
  ],
};

interface Props {
  view: ContainerView;
  act: (a: ContAction) => void;
  seat: number;
  error: string | null;
}

// The live interface tour: each step spotlights a REAL control (data-tour)
// and explains it in the scheme of the whole game. No em dashes.
const CONT_TOUR: { target?: string; title: string; body: string }[] = [
  { title: 'Welcome to your shipping company', body: 'The TV is the shared sea: both islands, every harbor board, every ship. You run everything from this screen. The goal is simple: end the game with the most money. Money comes from selling containers to the players around you and from delivering cargo to Container Island. Tap NEXT to walk through every control.' },
  { target: 'turn', title: 'Two actions per turn', body: 'The header always shows whose turn it is and how many actions you have left. You take TWO actions each turn, the same one twice if you like, except PRODUCE and CALL BANK which are once per turn. The colored counters on the right are the shared container supply.' },
  { target: 'aid', title: 'Your player aid', body: 'The question mark opens your official player aid: the three turn steps and every action on one card, exactly as printed. Your aid card also lies beside your board on the TV table. Come back to it any time.' },
  { target: 'board', title: 'Your harbor board', body: 'The same board that sits in front of you on the TV table. The bottom half is your FACTORY district: factories make containers and the $1 to $4 lots are the shelves where you price them. The top half is your HARBOR: warehouses set how much you can store, the $2 to $6 lots price it, and the docks along the top are where opponents\' ships tie up to shop.' },
  { target: 'produce', title: 'Produce', body: 'PRODUCE pays $1 to the player on your right and makes one container per factory you own, taken from the shared supply. You then arrange your whole factory district into priced lots.\n\nPricing is the game: price low and opponents buy fast but you earn little; price high and your shelves sit full, blocking your next PRODUCE.' },
  { target: 'build-factory', title: 'Build', body: 'BUILD FACTORY adds a new factory color (up to four, all different): one more container per PRODUCE and 2 more factory storage. BUILD WAREHOUSE (up to five) adds 1 harbor storage each. Costs rise along the printed tracks on your board and are paid to the supply.' },
  { target: 'opponents', title: 'The other companies', body: 'Every opponent\'s shelves and prices are public, and you can NEVER buy your own goods, so this strip is your shopping catalog. FACTORY rows show what a truck can fetch for your harbor; HARBOR rows show what your ship could load. Tap a company to see their full board.' },
  { target: 'factory-purchase', title: 'Factory purchase', body: 'FACTORY PURCHASE trucks containers from ONE opponent\'s factory shelves straight into your harbor, paying them their printed prices. Then you re-price the goods in your own harbor lots and wait for ships.\n\nBuy low, mark up. That margin is where harbor money is made.' },
  { target: 'ship', title: 'Your ship', body: 'Your ship holds up to five containers. It can be in the ocean, docked at an opponent\'s harbor, at the Off-Shore Bank, or at Container Island. It can never enter your own harbor: your own goods must be bought by somebody else.' },
  { target: 'sail', title: 'Sail', body: 'SAIL moves the ship: one action from any board to the ocean, one more to a destination.\n\nDocking at a harbor gives ONE FREE purchase on arrival. Docking at the Bank loads containers you won at auction. Docking at Container Island starts a delivery auction and ends your turn immediately.' },
  { target: 'harbor-purchase', title: 'Harbor purchase', body: 'HARBOR PURCHASE loads containers from the harbor where your ship is docked, at the owner\'s printed prices, onto your ship. This is the last leg of the supply chain: factory shelf, harbor shelf, ship, island.' },
  { target: 'island', title: 'Delivering to Container Island', body: 'When you sail to the island, every opponent secretly bids cash for your whole cargo. Accept and you collect the winning bid TWICE (the government matches it) while the winner stacks your containers in their island scoring area.\n\nOr buy the load out yourself: pay the high bid to the Bank and keep the containers in YOUR scoring area.' },
  { target: 'scorecard', title: 'Your secret scoring card', body: 'The heart of the game. At the end, containers in your island scoring area are worth what THIS card says: $10, $6, $4 or $2 per color, and your two-value color pays $10 each if you collected all five colors, else $5.\n\nThe catch: your MOST COMMON island color is discarded for nothing. Collect variety, not piles, and never let opponents guess your card.' },
  { target: 'bank', title: 'The Off-Shore Bank', body: 'CALL BANK runs auctions both ways: bid cash on a container lot, or bid containers from your shelves on a cash lot. Hold the high bid until your next turn and you win it; winnings wait in your holding hex until your ship collects them.\n\nThe Bank also gives $10 loans: $1 interest every turn, seizure of your containers if you default, and an $11 settlement at game end.' },
  { target: 'cash', title: 'Cash is score, and it is secret', body: 'Nobody can see how much cash you hold, not even the TV. Every dollar you end with counts, plus your island area by your card, $3 per container on your ship or in bank holding, and $2 per container in your harbor. Factory shelves are worth NOTHING at the end.' },
  { target: 'supply', title: 'How the game ends', body: 'When TWO container colors run out of the shared supply, the current turn finishes and everyone scores. These counters are the clock: watch them to time your last deliveries and to stop producing colors that help an opponent\'s scoring card.\n\nThe FACTORIES LEFT and WAREHOUSES LEFT panel on the right shows the buildings still in the supply: when a color runs out of factories, nobody else can build one.' },
  { target: 'end-turn', title: 'The whole engine', body: 'Build, produce, price, truck, sail, deliver, auction. Press END TURN when you are done, and remember: you only get rich by making OTHER players want your containers. Good luck.' },
];

function ContainerTour({ step, setStep, onClose }: { step: number; setStep: (n: number) => void; onClose: () => void }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const s = CONT_TOUR[step];
  const last = step === CONT_TOUR.length - 1;
  useEffect(() => {
    if (!s.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const pad = 6;
      setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    }, 260);
    return () => clearTimeout(t);
  }, [step, s.target]);

  const topHalf = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false;
  const calloutPos: React.CSSProperties = rect
    ? (topHalf ? { left: '50%', bottom: 18, transform: 'translateX(-50%)' } : { left: '50%', top: 18, transform: 'translateX(-50%)' })
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="cont-tour" data-testid="cont-tour">
      {rect ? (
        <div className="cont-tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      ) : (
        <div className="cont-tour-dim" />
      )}
      <div className="cont-tour-card ig-glass" style={calloutPos}>
        <div className="cont-tour-bars">
          {CONT_TOUR.map((_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}
        </div>
        <span className="cont-label">STEP {step + 1} OF {CONT_TOUR.length}</span>
        <h2>{s.title}</h2>
        {s.body.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
        <div className="cont-tour-btns">
          <button className="ig-btn" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>{step === 0 ? 'CLOSE' : 'BACK'}</button>
          {!last
            ? <button className="ig-btn primary" onClick={() => setStep(step + 1)}>NEXT</button>
            : <button className="ig-btn primary" onClick={onClose}>DONE</button>}
          <button className="ig-btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>SKIP</button>
        </div>
      </div>
    </div>
  );
}

type ColorCounts = Partial<Record<ContColor, number>>;

const countBy = (list: ContColor[]): ColorCounts => {
  const m: ColorCounts = {};
  for (const c of list) m[c] = (m[c] ?? 0) + 1;
  return m;
};
const totalOf = (m: ColorCounts) => Object.values(m).reduce((a, b) => a + (b ?? 0), 0);

function Blocks({ colors, size = 16 }: { colors: ContColor[]; size?: number }) {
  return (
    <span className="cont-blocks">
      {colors.map((c, i) => (
        <i key={i} className="cont-block" style={{ background: CONT_PIECE_HEX[c], width: size, height: size * 0.44 }} />
      ))}
    </span>
  );
}

function ColorChip({ color, count, onClick, active, disabled }: {
  color: ContColor; count?: number; onClick?: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button className={'cont-chip' + (active ? ' active' : '')} disabled={disabled} onClick={onClick}>
      <i style={{ background: CONT_PIECE_HEX[color] }} />
      {count !== undefined && <b>{count}</b>}
    </button>
  );
}

/** lots -> per-price color counts */
const lotsCounts = (lots: ContLots): Record<number, ColorCounts> =>
  Object.fromEntries(Object.entries(lots).map(([p, list]) => [p, countBy(list)]));
const countsToLots = (counts: Record<number, ColorCounts>): ContLots =>
  Object.fromEntries(Object.entries(counts).map(([p, m]) => [
    p,
    Object.entries(m).flatMap(([c, n]) => Array.from({ length: n ?? 0 }, () => c as ContColor)),
  ]));

// ---------------- arrangement dialog ----------------

function ArrangeDialog({ title, prices, initial, pool: poolInit, onConfirm, onClose }: {
  title: string;
  prices: number[];
  initial: Record<number, ColorCounts>;
  pool: ColorCounts;
  onConfirm: (lots: ContLots) => void;
  onClose: () => void;
}) {
  const [lots, setLots] = useState<Record<number, ColorCounts>>(() =>
    Object.fromEntries(prices.map((p) => [p, { ...(initial[p] ?? {}) }])));
  const [pool, setPool] = useState<ColorCounts>({ ...poolInit });
  const [sel, setSel] = useState<ContColor | null>(null);
  const poolTotal = totalOf(pool);

  const toPool = (price: number, color: ContColor) => {
    setLots((l) => ({ ...l, [price]: { ...l[price], [color]: (l[price][color] ?? 0) - 1 } }));
    setPool((q) => ({ ...q, [color]: (q[color] ?? 0) + 1 }));
  };
  const toLot = (price: number) => {
    if (!sel || (pool[sel] ?? 0) <= 0) return;
    setLots((l) => ({ ...l, [price]: { ...l[price], [sel]: (l[price][sel] ?? 0) + 1 } }));
    setPool((q) => {
      const next = { ...q, [sel]: (q[sel] ?? 0) - 1 };
      if ((next[sel] ?? 0) <= 0) setSel(null);
      return next;
    });
  };

  return (
    <div className="ig-modal" onClick={onClose}>
      <div className="ig-modal-card ig-glass cont-arrange" onClick={(e) => e.stopPropagation()}>
        <div className="ig-modal-head">
          <b>{title}</b>
          <button className="ig-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="cont-arrange-pool">
          <span className="cont-label">TO PLACE</span>
          {poolTotal === 0 && <span className="dim">ALL PLACED</span>}
          {CONT_COLORS.filter((c) => (pool[c] ?? 0) > 0).map((c) => (
            <ColorChip key={c} color={c} count={pool[c]} active={sel === c} onClick={() => setSel(c)} />
          ))}
        </div>
        <div className="cont-arrange-lots">
          {prices.map((p) => (
            <div key={p} className="cont-arrange-lot">
              <button className="cont-lot-price" disabled={!sel || poolTotal === 0} onClick={() => toLot(p)}>
                ${p}{sel ? ' +' : ''}
              </button>
              <div className="cont-lot-contents">
                {CONT_COLORS.filter((c) => (lots[p]?.[c] ?? 0) > 0).map((c) => (
                  <ColorChip key={c} color={c} count={lots[p][c]} onClick={() => toPool(p, c)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="dim cont-hint">TAP A COLOR ABOVE, THEN A PRICE. TAP A PLACED CHIP TO TAKE IT BACK.</p>
        <button className="ig-btn primary" disabled={poolTotal > 0}
          onClick={() => onConfirm(countsToLots(lots))}>
          CONFIRM PRICES
        </button>
      </div>
    </div>
  );
}

// ---------------- pick-from-lots dialog (purchases, container bids) ----------------

function PickDialog({ title, offer, cashCap, countCap, minCount, confirmLabel, onConfirm, onClose, costFn, labelFn }: {
  title: string;
  offer: Record<number, ColorCounts>; // price -> available
  cashCap: number;
  countCap: number;
  minCount?: number;
  confirmLabel: string;
  onConfirm: (picks: { price: number; color: ContColor; count: number }[], cost: number) => void;
  onClose: () => void;
  costFn?: (price: number) => number; // default: price
  labelFn?: (price: number) => string;
}) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const cost = Object.entries(picks).reduce((a, [k, n]) => a + (costFn ? costFn(Number(k.split(':')[0])) : Number(k.split(':')[0])) * n, 0);
  const count = Object.values(picks).reduce((a, b) => a + b, 0);
  const adjust = (price: number, color: ContColor, d: number) => {
    const k = `${price}:${color}`;
    const avail = offer[price]?.[color] ?? 0;
    setPicks((p) => {
      const next = Math.max(0, Math.min(avail, (p[k] ?? 0) + d));
      return { ...p, [k]: next };
    });
  };
  const over = cost > cashCap || count > countCap;
  const under = count < (minCount ?? 1);
  return (
    <div className="ig-modal" onClick={onClose}>
      <div className="ig-modal-card ig-glass cont-pick" onClick={(e) => e.stopPropagation()}>
        <div className="ig-modal-head">
          <b>{title}</b>
          <button className="ig-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="cont-pick-rows">
          {Object.entries(offer).map(([p, m]) => (
            totalOf(m) > 0 && (
              <div key={p} className="cont-pick-row">
                <span className="cont-lot-price static">{labelFn ? labelFn(Number(p)) : `$${p}`}</span>
                {CONT_COLORS.filter((c) => (m[c] ?? 0) > 0).map((c) => {
                  const k = `${p}:${c}`;
                  return (
                    <span key={c} className="cont-pick-cell">
                      <ColorChip color={c} count={m[c]} />
                      <button className="cont-mini" onClick={() => adjust(Number(p), c, -1)}>−</button>
                      <b>{picks[k] ?? 0}</b>
                      <button className="cont-mini" onClick={() => adjust(Number(p), c, 1)}>+</button>
                    </span>
                  );
                })}
              </div>
            )
          ))}
          {Object.values(offer).every((m) => totalOf(m) === 0) && <span className="dim">NOTHING AVAILABLE</span>}
        </div>
        <div className="cont-pick-foot">
          <span>{count} PICKED{costFn ? '' : ` · $${cost}`}</span>
          {over && <span className="cont-warn">{cost > cashCap ? 'NOT ENOUGH CASH' : 'NO ROOM'}</span>}
        </div>
        <button className="ig-btn primary" disabled={over || under}
          onClick={() => onConfirm(
            Object.entries(picks).filter(([, n]) => n > 0).map(([k, n]) => {
              const [price, color] = k.split(':');
              return { price: Number(price), color: color as ContColor, count: n };
            }), cost)}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------- amount dialog (bids) ----------------

function AmountDialog({ title, max, min = 0, note, confirmLabel, extra, bluffMax, onConfirm, onClose }: {
  title: string; max: number; min?: number; note?: string; confirmLabel: string;
  extra?: React.ReactNode;
  /** offer up to this many $0 bluff cards for the pile (delivery bids) */
  bluffMax?: number;
  onConfirm: (n: number, bluffs: number) => void; onClose?: () => void;
}) {
  const [n, setN] = useState(min);
  const [bluffs, setBluffs] = useState(0);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="ig-modal">
      <div className="ig-modal-card ig-glass cont-amount">
        <div className="ig-modal-head">
          <b>{title}</b>
          {onClose && <button className="ig-modal-x" onClick={onClose}>✕</button>}
        </div>
        {note && <p className="dim">{note}</p>}
        <div className="cont-amount-row">
          <button className="cont-mini" onClick={() => setN((v) => clamp(v - 5))}>−5</button>
          <button className="cont-mini" onClick={() => setN((v) => clamp(v - 1))}>−1</button>
          <b className="cont-amount-n">${n}</b>
          <button className="cont-mini" onClick={() => setN((v) => clamp(v + 1))}>+1</button>
          <button className="cont-mini" onClick={() => setN((v) => clamp(v + 5))}>+5</button>
        </div>
        {bluffMax !== undefined && bluffMax > 0 && (
          <div className="cont-bluff-row">
            <span>BLUFF CARDS · WORTH $0, BUT THE TABLE ONLY SEES YOUR PILE SIZE</span>
            <div>
              <button className="cont-mini" onClick={() => setBluffs((v) => Math.max(0, v - 1))}>−</button>
              <b>{bluffs}</b>
              <button className="cont-mini" onClick={() => setBluffs((v) => Math.min(bluffMax, v + 1))}>+</button>
            </div>
          </div>
        )}
        {extra}
        <button className="ig-btn primary" onClick={() => onConfirm(n, bluffs)}>{confirmLabel}</button>
      </div>
    </div>
  );
}

// ---------------- the board tableau (top-down authentic art) ----------------

/** the 3D personal board in a fixed frame, plus the docked-visitor caption */
function BoardTableau({ view, seat, tall }: { view: ContainerView; seat: number; tall?: boolean }) {
  const visitors = view.players.filter((q) => q.ship.loc.kind === 'harbor' && q.ship.loc.seat === seat);
  return (
    <div className={'cont-mat-frame' + (tall ? ' tall' : '')} data-testid="cont-tableau">
      <ContainerMat view={view} seat={seat} />
      {visitors.length > 0 && (
        <div className="cont-mat-visitors">
          {visitors.map((q) => (
            <span key={q.seat} style={{ borderColor: CONT_UI_HEX[q.color] }}>
              {q.name.toUpperCase()} DOCKED
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- opponent board modal ----------------

function OpponentModal({ view, seat, onClose }: { view: ContainerView; seat: number; onClose: () => void }) {
  const p = view.players[seat];
  return (
    <div className="ig-modal" onClick={onClose}>
      <div className="ig-modal-card ig-glass cont-opp-modal" onClick={(e) => e.stopPropagation()}
        style={{ borderColor: CONT_UI_HEX[p.color] }}>
        <div className="ig-modal-head">
          <span className="ig-prompt-ring" style={{ borderColor: CONT_UI_HEX[p.color] }} />
          <b>{p.name.toUpperCase()}</b>
          <button className="ig-modal-x" onClick={onClose}>✕</button>
        </div>
        <BoardTableau view={view} seat={seat} tall />
        <div className="cont-opp-facts">
          <span>SHIP · {p.ship.loc.kind.toUpperCase()} · {p.ship.cargo.length}/5</span>
          <span>ISLAND · {p.scoring.length}</span>
          <span>HOLDING · {p.holding.length}</span>
          <span>LOANS · {p.loans}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------- main ----------------

export default function ContainerPlay({ view, act, seat, error }: Props) {
  const p = view.players[seat];
  const myTurn = view.phase === 'playing' && view.turn === seat && !view.delivery && view.pending.length === 0;
  // the goal and game logic open for every player the first time they sit down
  const [intro, setIntro] = useState(() => sessionStorage.getItem('cont-intro-shown') !== '1');
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => { if (intro) sessionStorage.setItem('cont-intro-shown', '1'); }, [intro]);
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'produce'; make: ContColor[] }
    | { kind: 'produce-pick'; eligible: ContColor[]; room: number }
    | { kind: 'reprice'; district: 'factory' | 'harbor' }
    | { kind: 'factory-pick'; from: number }
    | { kind: 'factory-place'; from: number; picks: { price: number; color: ContColor; count: number }[] }
    | { kind: 'harbor-pick' }
    | { kind: 'sail' }
    | { kind: 'sail-bank-load' }
    | { kind: 'bank' }
    | { kind: 'bank-cash-bid'; lot: number; min: number }
    | { kind: 'bank-cont-bid'; lot: number; min: number }
    | { kind: 'opp'; seat: number }
    | { kind: 'card'; img: string; label: string; wide?: boolean }
  >(null);

  useEffect(() => { if (error) playSfx('error'); }, [error]);
  const doAct = (a: ContAction) => { playSfx('click'); act(a); };

  // legality mirrors (grey out with reasons; the engine is the authority)
  const myCash = p.cash ?? 0; // own cash is always visible; null is only for others
  const factoryCost = CONT_RULES.factoryCosts[p.factories.length];
  const warehouseCost = CONT_RULES.warehouseCosts[p.warehouses];
  const eligibleProduce = p.factories.filter((c) => view.supply.containers[c] > 0);
  const produceRoom = p.factories.length * CONT_RULES.factoryLimitPer - contLotCount(p.factoryLots) - p.reserves.factory;
  const produceN = Math.min(eligibleProduce.length, Math.max(0, produceRoom));
  const harborRoom = p.warehouses - contLotCount(p.harborLots) - p.reserves.harbor;
  const noActions = view.actionsLeft <= 0;

  const reason = (checks: [boolean, string][]): string | null => {
    for (const [bad, why] of checks) if (bad) return why;
    return null;
  };
  const rBuildFactory = reason([
    [noActions, 'no actions left'],
    [p.factories.length >= 4, 'track full'],
    [!CONT_COLORS.some((c) => !p.factories.includes(c) && view.supply.factories[c] > 0), 'no factories in supply'],
    [myCash < factoryCost, 'not enough cash'],
  ]);
  const rBuildWarehouse = reason([
    [noActions, 'no actions left'],
    [p.warehouses >= 5, 'track full'],
    [view.supply.warehouses <= 0, 'supply empty'],
    [myCash < warehouseCost, 'not enough cash'],
  ]);
  const rProduce = reason([
    [noActions, 'no actions left'],
    [view.producedThisTurn, 'once per turn'],
    [myCash < 1, 'cannot pay the $1 wage'],
    [produceN === 0, produceRoom <= 0 ? 'no storage room' : 'no supply'],
  ]);
  const rFactoryBuy = reason([
    [noActions, 'no actions left'],
    [harborRoom <= 0, 'harbor full'],
    [!view.players.some((q) => q.seat !== seat && contLotCount(q.factoryLots) > 0), 'nothing for sale'],
  ]);
  const freeBuy = view.anchorBuy && view.turn === seat && p.ship.loc.kind === 'harbor';
  const rHarborBuy = reason([
    [p.ship.loc.kind !== 'harbor', 'ship not docked'],
    [!freeBuy && noActions, 'no actions left'],
    [p.ship.cargo.length >= 5, 'ship full'],
    [p.ship.loc.kind === 'harbor' && contLotCount(view.players[(p.ship.loc as { seat: number }).seat].harborLots) === 0, 'harbor empty'],
  ]);
  const rSail = reason([[noActions, 'no actions left']]);
  const rReprice = reason([[noActions, 'no actions left']]);
  const rCallBank = reason([
    [noActions, 'no actions left'],
    [view.calledBankThisTurn, 'once per turn'],
    [view.wonAuctionThisTurn, 'won an auction this turn'],
    [view.endTriggered, 'the game is ending'],
  ]);
  const rLoan = reason([[p.loans >= 2, 'loan limit']]);
  const rRepay = reason([[p.loans <= 0, 'no loans'], [myCash < 10, 'not enough cash']]);

  // pending decision for me?
  const myPending = view.pending[0] && (
    (view.pending[0].kind === 'bankDistribute' && view.pending[0].seat === seat)
    || (view.pending[0].kind === 'seize' && view.pending[0].decider === seat)
  ) ? view.pending[0] : null;

  // delivery prompts
  const d = view.delivery;
  const myBidNeeded = d && d.stage === 'bidding' && d.bidsIn[seat] === false && d.deliverer !== seat;
  const myRunoffNeeded = d && d.stage === 'runoff' && d.runoffAmong.includes(seat) && d.bidsIn[seat] === false;
  const myResolve = d && d.stage === 'resolve' && d.deliverer === seat;

  const island = useMemo(() => {
    if (!p.scoringCard) return null;
    return CONT_SCORING_CARDS[p.scoringCard];
  }, [p.scoringCard]);

  const actBtn = (tourId: string, label: string, why: string | null, onClick: () => void, primary = false) => (
    <button className={'ig-btn cont-action' + (primary ? ' primary' : '')}
      disabled={!myTurn || why !== null}
      onClick={onClick}
      data-tour={tourId}>
      <span>{label}</span>
      {why && myTurn && <small>· {why.toUpperCase()}</small>}
    </button>
  );

  return (
    <div className="cont-play" data-testid="cont-play">
      {intro && (
        <GameIntro intro={CONTAINER_INTRO}
          onClose={() => setIntro(false)}
          onWalkthrough={() => { setIntro(false); setTour(0); }} />
      )}
      {tour !== null && <ContainerTour step={tour} setStep={setTour} onClose={() => setTour(null)} />}

      {/* status header */}
      <header className="cont-head ig-glass">
        <span className="cont-head-seat" style={{ borderColor: CONT_UI_HEX[p.color] }}>
          {p.name.toUpperCase()}
        </span>
        <span className={'cont-head-turn' + (myTurn ? ' mine' : '')} data-testid="cont-turn" data-tour="turn" key={view.turn}>
          {view.phase === 'ended'
            ? 'GAME OVER'
            : view.delivery
              ? 'DELIVERY AUCTION'
              : view.turn === seat ? `YOUR TURN · ${view.actionsLeft} ACTION${view.actionsLeft === 1 ? '' : 'S'}`
                : `${view.players[view.turn].name.toUpperCase()}'S TURN`}
        </span>
        <span className="cont-head-supply" data-tour="supply">
          {CONT_COLORS.map((c) => (
            <span key={c} className={'cont-supply-chip' + (view.supply.containers[c] === 0 ? ' out' : '')}>
              <i style={{ background: CONT_PIECE_HEX[c] }} />{view.supply.containers[c]}
            </span>
          ))}
        </span>
        <button className="ig-btn ghost" onClick={() => setIntro(true)}>RULES</button>
        <button className="ig-btn ghost cont-aid-btn" aria-label="Player aid" data-tour="aid"
          onClick={() => setDialog({ kind: 'card', img: S.cards.aid, label: 'PLAYER AID · TURN REFERENCE', wide: true })}>
          ?
        </button>
      </header>

      <div className="cont-cols">
        {/* action rail */}
        <nav className="cont-rail ig-glass" data-testid="cont-actions">
          {actBtn('build-factory', 'BUILD FACTORY' + (factoryCost ? ` · $${factoryCost}` : ' · FREE'), rBuildFactory, () => {
            const options = CONT_COLORS.filter((c) => !p.factories.includes(c) && view.supply.factories[c] > 0);
            if (options.length === 1) doAct({ type: 'build_factory', color: options[0] });
            else setDialog({ kind: 'produce-pick', eligible: options, room: -1 }); // reuse as color pick
          })}
          {actBtn('build-warehouse', 'BUILD WAREHOUSE' + (warehouseCost ? ` · $${warehouseCost}` : ' · FREE'), rBuildWarehouse,
            () => doAct({ type: 'build_warehouse' }))}
          {actBtn('produce', `PRODUCE · ${produceN || ''}`, rProduce, () => {
            if (eligibleProduce.length > produceN) setDialog({ kind: 'produce-pick', eligible: eligibleProduce, room: produceN });
            else setDialog({ kind: 'produce', make: eligibleProduce });
          })}
          {actBtn('factory-purchase', 'FACTORY PURCHASE', rFactoryBuy, () => setDialog({ kind: 'factory-pick', from: -1 }))}
          {actBtn('harbor-purchase', 'HARBOR PURCHASE' + (freeBuy ? ' · FREE' : ''), rHarborBuy, () => setDialog({ kind: 'harbor-pick' }))}
          {actBtn('sail', 'SAIL', rSail, () => setDialog({ kind: 'sail' }))}
          {actBtn('reprice-factory', 'REPRICE FACTORY', rReprice, () => setDialog({ kind: 'reprice', district: 'factory' }))}
          {actBtn('reprice-harbor', 'REPRICE HARBOR', rReprice, () => setDialog({ kind: 'reprice', district: 'harbor' }))}
          {actBtn('call-bank', 'CALL BANK', rCallBank, () => setDialog({ kind: 'bank' }))}
          <div className="cont-rail-loans" data-tour="loans">
            <button className="ig-btn ghost"
              disabled={rLoan !== null || view.phase !== 'playing' || (view.turn !== seat && !view.delivery)}
              onClick={() => doAct({ type: 'take_loan' })}>
              TAKE LOAN{rLoan ? ` · ${rLoan.toUpperCase()}` : ''}
            </button>
            <button className="ig-btn ghost" disabled={!myTurn || rRepay !== null}
              onClick={() => doAct({ type: 'repay_loan' })}>
              REPAY{myTurn && rRepay ? ` · ${rRepay.toUpperCase()}` : ''}
            </button>
          </div>
          <button className={'ig-btn cont-end-turn' + (myTurn && noActions ? ' primary' : '')}
            disabled={!myTurn} data-tour="end-turn"
            onClick={() => doAct({ type: 'end_turn' })}>
            END TURN
          </button>
        </nav>

        {/* my board: the real 3D mat */}
        <main className="cont-center">
          <div data-tour="board" className="cont-center-board">
            <BoardTableau view={view} seat={seat} />
          </div>
          <div className="cont-opps" data-testid="cont-opps" data-tour="opponents">
            {view.players.filter((q) => q.seat !== seat).map((q) => (
              <button key={q.seat} className="ig-glass cont-opp"
                style={{ borderColor: CONT_UI_HEX[q.color] }}
                onClick={() => setDialog({ kind: 'opp', seat: q.seat })}>
                <b>{q.name.toUpperCase()}</b>
                <span>
                  SHIP {q.ship.cargo.length}/5 · {q.ship.loc.kind === 'harbor' ? `AT ${view.players[q.ship.loc.seat].name.toUpperCase()}` : q.ship.loc.kind.toUpperCase()}
                  {q.loans > 0 ? ` · LOANS ${q.loans}` : ''}
                </span>
                <span className="cont-opp-lots">
                  <em>FACTORY</em>
                  {CONT_RULES.factoryLotPrices.map((pr) => q.factoryLots[pr].length > 0 && (
                    <span key={pr} className="cont-opp-lot">${pr}<Blocks colors={q.factoryLots[pr]} size={11} /></span>
                  ))}
                  {contLotCount(q.factoryLots) === 0 && <span className="dim">EMPTY</span>}
                </span>
                <span className="cont-opp-lots">
                  <em>HARBOR</em>
                  {CONT_RULES.harborLotPrices.map((pr) => q.harborLots[pr].length > 0 && (
                    <span key={pr} className="cont-opp-lot">${pr}<Blocks colors={q.harborLots[pr]} size={11} /></span>
                  ))}
                  {contLotCount(q.harborLots) === 0 && <span className="dim">EMPTY</span>}
                </span>
              </button>
            ))}
          </div>
        </main>

        {/* private panel */}
        <aside className="cont-side ig-glass" data-testid="cont-side">
          <div className="cont-cash" data-testid="cont-cash" data-tour="cash">
            <span className="cont-label">CASH</span>
            <b>${p.cash ?? 0}</b>
            {p.loans > 0 && <span className="cont-loans">LOANS {p.loans} · $1 INTEREST EACH TURN</span>}
          </div>
          {p.scoringCard && (
            <button className="cont-scorecard" data-testid="cont-scorecard" data-tour="scorecard"
              onClick={() => setDialog({ kind: 'card', img: S.cards.scoring[p.scoringCard!], label: 'FINAL SCORING CARD · SECRET' })}>
              <img src={S.cards.scoring[p.scoringCard]} alt="Secret scoring card" />
              <span>SECRET SCORING</span>
            </button>
          )}
          <div className="cont-panel" data-tour="ship">
            <span className="cont-label">SHIP · {p.ship.loc.kind === 'harbor' ? `${view.players[(p.ship.loc as { seat: number }).seat].name.toUpperCase()}'S HARBOR` : p.ship.loc.kind.toUpperCase()}</span>
            <div className="cont-ship-slots">
              {Array.from({ length: 5 }, (_, i) => (
                <i key={i} className="cont-block slot" style={p.ship.cargo[i] ? { background: CONT_PIECE_HEX[p.ship.cargo[i]] } : undefined} />
              ))}
            </div>
          </div>
          <div className="cont-panel" data-tour="island">
            <span className="cont-label">ISLAND SCORING AREA · {p.scoring.length}</span>
            <Blocks colors={p.scoring} />
          </div>
          <div className="cont-panel">
            <span className="cont-label">BANK HOLDING · {p.holding.length}</span>
            <Blocks colors={p.holding} />
          </div>
          <div className="cont-panel" data-testid="cont-supply-left" data-tour="supply-left">
            <span className="cont-label">FACTORIES LEFT</span>
            <div className="cont-supply-row">
              {CONT_COLORS.map((c) => (
                <span key={c} className={'cont-supply-piece' + (view.supply.factories[c] === 0 ? ' out' : '')}>
                  <img src={S.factoryArt[c].img} alt={`${c} factory`} />
                  <b>{view.supply.factories[c]}</b>
                </span>
              ))}
            </div>
            <span className="cont-label">WAREHOUSES LEFT</span>
            <div className="cont-supply-row">
              <span className={'cont-supply-piece' + (view.supply.warehouses === 0 ? ' out' : '')}>
                <img src={S.warehouseArt.img} alt="warehouse" />
                <b>{view.supply.warehouses}</b>
              </span>
            </div>
          </div>
          <div className="cont-panel cont-bank" data-testid="cont-bank" data-tour="bank">
            <span className="cont-label">OFF-SHORE BANK</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="cont-bank-lot">
                <span>{['I', 'II', 'III'][i]}</span>
                <Blocks colors={view.bank.containerLots[i]} size={12} />
                <b>${view.bank.cashLots[i]}</b>
              </div>
            ))}
            {view.bank.auctions.map((a) => (
              <div key={`${a.lotType}${a.lot}`} className="cont-bank-auction">
                {a.lotType === 'container' ? 'CONTAINER' : 'CASH'} LOT {['I', 'II', 'III'][a.lot]} ·{' '}
                {view.players[a.bidder].name.toUpperCase()} BIDS {a.lotType === 'container' ? `$${a.bid}` : `${a.bid} CONTAINERS`}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {error && <div className="cont-error ig-glass" role="alert">{error}</div>}

      {/* ---------------- dialogs ---------------- */}

      {dialog?.kind === 'card' && (
        <div className="ig-modal" onClick={() => setDialog(null)}>
          <div className={'cont-card-close' + (dialog.wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
            <img src={dialog.img} alt={dialog.label} />
            <span>{dialog.label}</span>
            {island && dialog.img === S.cards.scoring[p.scoringCard!] && (
              <small className="dim">
                TWO-VALUE {island.twoValue.toUpperCase()} $10 WITH ALL FIVE COLORS, ELSE $5 ·{' '}
                {Object.entries(island.values).map(([c, v]) => `${c.toUpperCase()} $${v}`).join(' · ')}
              </small>
            )}
            <button className="ig-btn" onClick={() => setDialog(null)}>CLOSE</button>
          </div>
        </div>
      )}

      {dialog?.kind === 'opp' && <OpponentModal view={view} seat={dialog.seat} onClose={() => setDialog(null)} />}

      {/* build factory color / produce overflow picker */}
      {dialog?.kind === 'produce-pick' && (
        <div className="ig-modal" onClick={() => setDialog(null)}>
          <div className="ig-modal-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ig-modal-head">
              <b>{dialog.room === -1 ? 'CHOOSE FACTORY COLOR' : `CHOOSE ${dialog.room} TO PRODUCE`}</b>
              <button className="ig-modal-x" onClick={() => setDialog(null)}>✕</button>
            </div>
            <ProducePick dialogRoom={dialog.room} eligible={dialog.eligible}
              counts={dialog.room === -1 ? view.supply.factories : view.supply.containers}
              onPick={(colors) => {
                if (dialog.room === -1) { doAct({ type: 'build_factory', color: colors[0] }); setDialog(null); }
                else setDialog({ kind: 'produce', make: colors });
              }} />
          </div>
        </div>
      )}

      {dialog?.kind === 'produce' && (
        <ArrangeDialog title={`PRODUCE · ARRANGE YOUR FACTORY LOTS ($1 WAGE TO ${view.players[(seat - 1 + view.players.length) % view.players.length].name.toUpperCase()})`}
          prices={CONT_RULES.factoryLotPrices as number[]}
          initial={lotsCounts(p.factoryLots)}
          pool={countBy(dialog.make)}
          onConfirm={(lots) => { doAct({ type: 'produce', make: dialog.make, lots }); setDialog(null); }}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'reprice' && (
        <ArrangeDialog title={`REPRICE · ${dialog.district === 'factory' ? 'FACTORY' : 'HARBOR'} DISTRICT`}
          prices={(dialog.district === 'factory' ? CONT_RULES.factoryLotPrices : CONT_RULES.harborLotPrices) as number[]}
          initial={{}}
          pool={countBy(Object.values(dialog.district === 'factory' ? p.factoryLots : p.harborLots).flat())}
          onConfirm={(lots) => { doAct({ type: 'reprice', district: dialog.district, lots }); setDialog(null); }}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'factory-pick' && dialog.from === -1 && (
        <div className="ig-modal" onClick={() => setDialog(null)}>
          <div className="ig-modal-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ig-modal-head">
              <b>BUY FROM WHICH FACTORY?</b>
              <button className="ig-modal-x" onClick={() => setDialog(null)}>✕</button>
            </div>
            <div className="cont-opp-list">
              {view.players.filter((q) => q.seat !== seat).map((q) => (
                <button key={q.seat} className="ig-btn" disabled={contLotCount(q.factoryLots) === 0}
                  onClick={() => setDialog({ kind: 'factory-pick', from: q.seat })}>
                  {q.name.toUpperCase()} · {contLotCount(q.factoryLots)} FOR SALE
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'factory-pick' && dialog.from >= 0 && (
        <PickDialog title={`BUY FROM ${view.players[dialog.from].name.toUpperCase()}'S FACTORY`}
          offer={lotsCounts(view.players[dialog.from].factoryLots)}
          cashCap={p.cash ?? 0} countCap={harborRoom}
          confirmLabel="BUY AND PLACE"
          onConfirm={(picks) => setDialog({ kind: 'factory-place', from: dialog.from, picks })}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'factory-place' && (
        <ArrangeDialog title="ARRANGE YOUR HARBOR LOTS"
          prices={CONT_RULES.harborLotPrices as number[]}
          initial={lotsCounts(p.harborLots)}
          pool={countBy(dialog.picks.flatMap((x) => Array.from({ length: x.count }, () => x.color)))}
          onConfirm={(lots) => { doAct({ type: 'factory_buy', from: dialog.from, picks: dialog.picks, lots }); setDialog(null); }}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'harbor-pick' && p.ship.loc.kind === 'harbor' && (
        <PickDialog title={`LOAD FROM ${view.players[(p.ship.loc as { seat: number }).seat].name.toUpperCase()}'S HARBOR${freeBuy ? ' · FREE ACTION' : ''}`}
          offer={lotsCounts(view.players[(p.ship.loc as { seat: number }).seat].harborLots)}
          cashCap={p.cash ?? 0} countCap={5 - p.ship.cargo.length}
          confirmLabel="BUY AND LOAD"
          onConfirm={(picks) => { doAct({ type: 'harbor_buy', picks, free: freeBuy }); setDialog(null); }}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'sail' && (
        <div className="ig-modal" onClick={() => setDialog(null)}>
          <div className="ig-modal-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ig-modal-head">
              <b>SAIL · SHIP IN {p.ship.loc.kind === 'harbor' ? 'A HARBOR' : p.ship.loc.kind.toUpperCase()}</b>
              <button className="ig-modal-x" onClick={() => setDialog(null)}>✕</button>
            </div>
            <div className="cont-opp-list">
              {p.ship.loc.kind !== 'ocean' && (
                <button className="ig-btn" onClick={() => { doAct({ type: 'sail', to: 'ocean' }); setDialog(null); }}>
                  TO THE OCEAN
                </button>
              )}
              {p.ship.loc.kind === 'ocean' && (
                <>
                  {view.players.filter((q) => q.seat !== seat).map((q) => (
                    <button key={q.seat} className="ig-btn cont-sail-opt"
                      onClick={() => { doAct({ type: 'sail', to: { harbor: q.seat } }); setDialog(null); }}>
                      {q.name.toUpperCase()}'S HARBOR · {contLotCount(q.harborLots)} FOR SALE
                      <small>⚓ ANCHOR ACTION · ONE FREE HARBOR PURCHASE ON ARRIVAL</small>
                    </button>
                  ))}
                  <button className="ig-btn cont-sail-opt"
                    onClick={() => {
                      if (p.holding.length > 0) setDialog({ kind: 'sail-bank-load' });
                      else { doAct({ type: 'sail', to: 'bank' }); setDialog(null); }
                    }}>
                    OFF-SHORE BANK{p.holding.length > 0 ? ` · HOLDING ${p.holding.length}` : ''}
                    <small>⚓ ANCHOR ACTION · LOAD YOUR AUCTION WINNINGS, FREE</small>
                  </button>
                  <button className="ig-btn cont-sail-opt" disabled={p.ship.cargo.length === 0}
                    onClick={() => { doAct({ type: 'sail', to: 'island' }); setDialog(null); }}>
                    CONTAINER ISLAND · AUCTION {p.ship.cargo.length} CARGO{p.ship.cargo.length === 0 ? ' · EMPTY SHIP' : ''}
                    <small>⚓ ANCHOR ACTION · MANDATORY DELIVERY AUCTION, THEN YOUR TURN ENDS</small>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'sail-bank-load' && (
        <PickDialog title="LOAD FROM YOUR HOLDING AREA · FREE"
          offer={{ 0: countBy(p.holding) }}
          cashCap={Infinity} countCap={5 - p.ship.cargo.length} minCount={0}
          confirmLabel="SAIL TO THE BANK"
          costFn={() => 0}
          labelFn={() => 'HOLDING'}
          onConfirm={(picks) => {
            const load = picks.flatMap((x) => Array.from({ length: x.count }, () => x.color));
            doAct({ type: 'sail', to: 'bank', load });
            setDialog(null);
          }}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'bank' && (
        <div className="ig-modal" onClick={() => setDialog(null)}>
          <div className="ig-modal-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ig-modal-head">
              <b>CALL BANK</b>
              <button className="ig-modal-x" onClick={() => setDialog(null)}>✕</button>
            </div>
            <div className="cont-opp-list">
              {view.bank.auctions.map((a) => {
                const short = a.lotType === 'container' && myCash < a.bid + 1;
                return (
                  <button key={`${a.lotType}${a.lot}`} className="ig-btn" disabled={a.bidder === seat || short}
                    onClick={() => setDialog(a.lotType === 'container'
                      ? { kind: 'bank-cash-bid', lot: a.lot, min: a.bid + 1 }
                      : { kind: 'bank-cont-bid', lot: a.lot, min: a.bid + 1 })}>
                    OUTBID · {a.lotType === 'container' ? 'CONTAINER' : 'CASH'} LOT {['I', 'II', 'III'][a.lot]} ·
                    {a.lotType === 'container' ? ` OVER $${a.bid}` : ` OVER ${a.bid} CONTAINERS`}
                    {a.bidder === seat ? ' · YOUR BID LEADS' : short ? ' · NOT ENOUGH CASH' : ''}
                  </button>
                );
              })}
              {view.bank.tokensFree > 0 && (view.players.length >= 5 || view.bank.auctions.length === 0) && (
                <>
                  {!view.bank.auctions.some((a) => a.lotType === 'container') && [0, 1, 2].map((lot) => (
                    <button key={`c${lot}`} className="ig-btn" disabled={view.bank.containerLots[lot].length === 0}
                      onClick={() => setDialog({ kind: 'bank-cash-bid', lot, min: 1 })}>
                      BID CASH FOR CONTAINER LOT {['I', 'II', 'III'][lot]} · {view.bank.containerLots[lot].length} CONTAINERS
                    </button>
                  ))}
                  {!view.bank.auctions.some((a) => a.lotType === 'cash') && [0, 1, 2].map((lot) => (
                    <button key={`m${lot}`} className="ig-btn" disabled={view.bank.cashLots[lot] === 0}
                      onClick={() => setDialog({ kind: 'bank-cont-bid', lot, min: 1 })}>
                      BID CONTAINERS FOR ${view.bank.cashLots[lot]} · CASH LOT {['I', 'II', 'III'][lot]}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'bank-cash-bid' && (
        <AmountDialog title={`CASH BID · CONTAINER LOT ${['I', 'II', 'III'][dialog.lot]}`}
          min={Math.min(dialog.min, p.cash ?? 0)} max={p.cash ?? 0}
          note="THE CASH IS LOCKED ON THE BID TILE UNTIL THE AUCTION RESOLVES"
          confirmLabel="PLACE BID"
          onConfirm={(n) => { doAct({ type: 'call_bank', lotType: 'container', lot: dialog.lot, cash: n }); setDialog(null); }}
          onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'bank-cont-bid' && (
        <PickDialog title={`CONTAINER BID · CASH LOT ${['I', 'II', 'III'][dialog.lot]} · AT LEAST ${dialog.min}`}
          offer={{
            ...Object.fromEntries(Object.entries(lotsCounts(p.factoryLots)).map(([pr, m]) => [`${pr}`, m])),
            ...Object.fromEntries(Object.entries(lotsCounts(p.harborLots)).map(([pr, m]) => [`${Number(pr) + 100}`, m])),
          } as Record<number, ColorCounts>}
          cashCap={Infinity} countCap={99} minCount={dialog.min}
          confirmLabel="PLACE BID"
          costFn={() => 0}
          labelFn={(pr) => (pr >= 100 ? `HARBOR $${pr - 100}` : `FACTORY $${pr}`)}
          onConfirm={(picks) => {
            const containers: ContBidContainer[] = picks.flatMap((x) =>
              Array.from({ length: x.count }, () => ({
                from: x.price >= 100 ? 'harbor' as const : 'factory' as const,
                price: x.price >= 100 ? x.price - 100 : x.price,
                color: x.color,
              })));
            doAct({ type: 'call_bank', lotType: 'cash', lot: dialog.lot, containers });
            setDialog(null);
          }}
          onClose={() => setDialog(null)} />
      )}

      {/* delivery prompts */}
      {(myBidNeeded || myRunoffNeeded) && d && (
        <AmountDialog
          title={myRunoffNeeded ? 'RUNOFF · ADD TO YOUR BID' : `SECRET BID · ${view.players[d.deliverer].name.toUpperCase()} DELIVERS ${d.cargo.length}`}
          min={0} max={Math.max(0, (p.cash ?? 0) - (myRunoffNeeded ? (d.yourBid ?? 0) : 0))}
          note={`CARGO: ${d.cargo.map((c) => c.toUpperCase()).join(' · ')} · WINNER PLACES THEM IN THEIR SCORING AREA`}
          confirmLabel="PLACE SECRET BID"
          bluffMax={Math.max(0, CONT_BLUFF_MAX - d.yourBluffs)}
          extra={p.loans < 2 ? (
            <button className="ig-btn ghost" onClick={() => doAct({ type: 'take_loan' })}>TAKE A $10 LOAN FIRST</button>
          ) : undefined}
          onConfirm={(n, bluffs) => doAct({ type: 'delivery_bid', amount: n, bluffs })} />
      )}

      {myResolve && d && (() => {
        const totals = d.bids ?? {};
        const high = Math.max(0, ...Object.values(totals).map((b) => b ?? 0));
        return (
          <div className="ig-modal">
            <div className="ig-modal-card ig-glass">
              <div className="ig-modal-head"><b>DELIVERY · BIDS REVEALED</b></div>
              <div className="cont-opp-list">
                {Object.entries(totals).map(([s, b]) => (
                  <div key={s} className="cont-bid-row">
                    <span>
                      {view.players[Number(s)].name.toUpperCase()}
                      {(d.bluffs?.[Number(s)] ?? 0) > 0 ? ` · ${d.bluffs![Number(s)]} BLUFF` : ''}
                    </span>
                    <b>${b ?? 0}</b>
                  </div>
                ))}
                {d.tied.length > 1 ? d.tied.map((w) => (
                  <button key={w} className="ig-btn primary"
                    onClick={() => doAct({ type: 'delivery_resolve', mode: 'accept', winner: w })}>
                    ACCEPT · {view.players[w].name.toUpperCase()} WINS · COLLECT ${high * 2}
                  </button>
                )) : (
                  <button className="ig-btn primary"
                    onClick={() => doAct({ type: 'delivery_resolve', mode: 'accept' })}>
                    ACCEPT HIGH BID · COLLECT ${high * 2}
                  </button>
                )}
                <button className="ig-btn" disabled={(p.cash ?? 0) < high}
                  onClick={() => doAct({ type: 'delivery_resolve', mode: 'buyout' })}>
                  BUY OUT · PAY ${high} TO THE BANK, KEEP THE CONTAINERS
                  {(p.cash ?? 0) < high ? ' · NOT ENOUGH CASH' : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* pending decisions */}
      {myPending?.kind === 'bankDistribute' && (
        <DistributeDialog view={view} containers={myPending.containers}
          onConfirm={(perLot) => doAct({ type: 'choose_distribute', perLot })} />
      )}
      {myPending?.kind === 'seize' && (
        <SeizeDialog view={view} victim={myPending.seat} count={myPending.count}
          onConfirm={(picks) => doAct({ type: 'choose_seize', picks })} />
      )}

      {/* game over */}
      {view.phase === 'ended' && (
        <div className="cont-play-end ig-glass" data-testid="cont-ended">
          <b>{view.winners.map((w) => view.players[w].name.toUpperCase()).join(' · ')} WIN{view.winners.length === 1 ? 'S' : ''}</b>
          {p.finalScore && (
            <span>
              YOU: ${p.finalScore.total} · CASH {p.finalScore.cash} · ISLAND {p.finalScore.island} · LEFTOVERS {p.finalScore.leftovers}
              {p.finalScore.loans !== 0 ? ` · LOANS ${p.finalScore.loans}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ProducePick({ dialogRoom, eligible, counts, onPick }: {
  dialogRoom: number; eligible: ContColor[]; counts?: Partial<Record<ContColor, number>>;
  onPick: (colors: ContColor[]) => void;
}) {
  const [sel, setSel] = useState<ContColor[]>([]);
  const target = dialogRoom === -1 ? 1 : dialogRoom;
  const toggle = (c: ContColor) => setSel((s) =>
    s.includes(c) ? s.filter((x) => x !== c) : s.length < target ? [...s, c] : s);
  return (
    <div className="cont-produce-pick">
      <div className="cont-arrange-pool">
        {eligible.map((c) => (
          <ColorChip key={c} color={c} count={counts?.[c]} active={sel.includes(c)} onClick={() => toggle(c)} />
        ))}
      </div>
      {counts && <span className="dim cont-hint">THE COUNT IS HOW MANY ARE LEFT IN THE SUPPLY</span>}
      <button className="ig-btn primary" disabled={sel.length !== target} onClick={() => onPick(sel)}>
        CONFIRM
      </button>
    </div>
  );
}

function DistributeDialog({ view, containers, onConfirm }: {
  view: ContainerView; containers: ContColor[]; onConfirm: (perLot: ContColor[][]) => void;
}) {
  const counts = contDistributeCounts(view as unknown as ContainerState, containers.length);
  const [perLot, setPerLot] = useState<ContColor[][]>([[], [], []]);
  const [pool, setPool] = useState<ColorCounts>(countBy(containers));
  const [sel, setSel] = useState<ContColor | null>(null);
  const add = (lot: number) => {
    if (!sel || (pool[sel] ?? 0) <= 0 || perLot[lot].length >= counts[lot]) return;
    setPerLot((pl) => pl.map((l, i) => (i === lot ? [...l, sel] : l)));
    setPool((q) => ({ ...q, [sel]: (q[sel] ?? 0) - 1 }));
  };
  const done = perLot.every((l, i) => l.length === counts[i]);
  return (
    <div className="ig-modal">
      <div className="ig-modal-card ig-glass">
        <div className="ig-modal-head"><b>DISTRIBUTE YOUR BID AMONG THE BANK LOTS</b></div>
        <div className="cont-arrange-pool">
          {CONT_COLORS.filter((c) => (pool[c] ?? 0) > 0).map((c) => (
            <ColorChip key={c} color={c} count={pool[c]} active={sel === c} onClick={() => setSel(c)} />
          ))}
        </div>
        <div className="cont-arrange-lots">
          {[0, 1, 2].map((lot) => (
            <div key={lot} className="cont-arrange-lot">
              <button className="cont-lot-price" disabled={counts[lot] === 0} onClick={() => add(lot)}>
                {['I', 'II', 'III'][lot]} · {perLot[lot].length}/{counts[lot]}
              </button>
              <Blocks colors={perLot[lot]} />
            </div>
          ))}
        </div>
        <button className="ig-btn primary" disabled={!done} onClick={() => onConfirm(perLot)}>CONFIRM</button>
      </div>
    </div>
  );
}

function SeizeDialog({ view, victim, count, onConfirm }: {
  view: ContainerView; victim: number; count: number; onConfirm: (picks: ContColor[]) => void;
}) {
  const v = view.players[victim];
  // simulate the seizure order locally to offer only legal picks
  const [picks, setPicks] = useState<ContColor[]>([]);
  const sim = useMemo(() => {
    const clone = {
      scoring: [...v.scoring], cargo: [...v.ship.cargo], holding: [...v.holding],
      harbor: Object.values(v.harborLots).flat(), factory: Object.values(v.factoryLots).flat(),
    };
    for (const c of picks) {
      for (const list of [clone.scoring, clone.cargo, clone.holding, clone.harbor, clone.factory]) {
        if (list.length > 0) { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); break; }
      }
    }
    const order: [string, ContColor[]][] = [
      ['SCORING AREA', clone.scoring], ['SHIP', clone.cargo], ['HOLDING', clone.holding],
      ['HARBOR', clone.harbor], ['FACTORY', clone.factory],
    ];
    return order.find(([, list]) => list.length > 0) ?? null;
  }, [picks, v]);
  const need = Math.min(count, picks.length + (sim ? 1 : 0));
  return (
    <div className="ig-modal">
      <div className="ig-modal-card ig-glass">
        <div className="ig-modal-head">
          <b>BANK SEIZURE · PICK {count} FROM {v.name.toUpperCase()}</b>
        </div>
        <div className="cont-arrange-pool">
          <Blocks colors={picks} />
        </div>
        {sim && picks.length < count && (
          <>
            <span className="cont-label">FROM THE {sim[0]}</span>
            <div className="cont-arrange-pool">
              {CONT_COLORS.filter((c) => sim[1].includes(c)).map((c) => (
                <ColorChip key={c} color={c} count={sim[1].filter((x) => x === c).length}
                  onClick={() => setPicks((s) => [...s, c])} />
              ))}
            </div>
          </>
        )}
        <button className="ig-btn primary" disabled={picks.length < need}
          onClick={() => onConfirm(picks)}>
          CONFIRM SEIZURE
        </button>
      </div>
    </div>
  );
}
