import { useEffect, useMemo, useState } from 'react';
import {
  ARENAS,
  BASES,
  COUNCIL_SEATS,
  INDUSTRIES,
  NATION_BY_ID,
  POLITIK_DATA,
  POLITIK_ADJACENCY,
  PROPAGANDA_BY_ID,
  PRICE_TRACKS,
  type Arena,
  type BaseId,
  type HandCard,
  type GuidedOperation,
  type PolitikAction,
  type PolitikPendingView,
  type PolitikPlayerView,
  type PolitikView,
  type TradeTransfer,
} from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { playSfx } from '../sfx';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { PolitikCard, buildPolitikBoardTokens, politikCardRef, type PolitikCardLike } from './PolitikBoard';
import { PolitikLessons } from './PolitikLessons';
import { PolitikMat, type PolitikMatModel } from './PolitikMat';
import {
  PolitikTable,
  type PolitikBoardHotspot,
  type PolitikCardRef,
  usePolitikScene,
} from './PolitikScene';
import { buildPolitikTutorial, type PolitikTutorialMode, type PolitikTutorialStep } from './PolitikTutorial';

const POLITIK_INTRO: Intro = {
  title: 'Politik',
  tagline: 'Build a nation, shape the world, and seize power on your terms.',
  goal: 'Establish enough power grabs across at least two arenas to create the new world order. Military influence controls territory, political support controls government, and corporate strength controls markets.',
  points: [
    { label: 'Form your nation', detail: 'Your opening hand is six Politik cards plus one Startup Company. You may replace all six Politik cards once, but the Startup stays. Then choose one of two Nations, its Propaganda, starting pieces, a setup bonus, and one eligible state.' },
    { label: 'Your turn', detail: 'Take two main actions. At 9 or more corruption you take three. You may repeat an action, and you always end your turn explicitly.' },
    { label: 'Eight main actions', detail: 'Play a card, use a ready ability, take a National Action, Clash, Educate leaders, Research cards, Campaign support, or Exchange food and carbon.' },
    { label: 'Three arenas', detail: 'Military power is fought over states, political power over the council and support, and corporate power over companies, markets, margin, and assets.' },
    { label: 'Cards are the law', detail: 'Politik cards, Propaganda, Nations, Companies, Assets, Landscapes, and Obligations can change the normal rules. The interface pauses for every required choice.' },
    { label: 'Final Say', detail: 'Final Say breaks specific ties and disputed choices. It comes from Justice support, then corruption, then Negotiation, then the current turn.' },
    { label: 'Winning', detail: 'Claim the required number of power grabs and spread them across the required arenas. Options such as Long War and Trifecta can raise those requirements.' },
  ],
  rulebook: '/politik/rulebook.pdf',
};

interface StartupDef { id: string; name: string; industries: (typeof INDUSTRIES)[number][]; startingMargin: number; capitalCost: number; carbonCost: number; corruption: boolean }
type CardCatalog = { politics: { id: string; sheet: number; cell: number }[]; obligations: { id: string; sheet: number; cell: number }[]; startups: { id: string; sheet: number; cell: number }[]; startupDefs: StartupDef[]; landscapeDefs?: { id: string; delta: number; industries: string[]; priceTracks: string[] }[] };
const CARD_CATALOG = POLITIK_DATA.cards as unknown as CardCatalog;
const CARD_ART = new Map(
  [...CARD_CATALOG.politics, ...CARD_CATALOG.obligations, ...CARD_CATALOG.startups]
    .map((card) => [card.id, { sheet: card.sheet, cell: card.cell }] as const),
);
const STARTUP_BY_ID = new Map((CARD_CATALOG.startupDefs ?? []).map((card) => [card.id, card]));

const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const sum = (value: Record<string, number> | undefined) => Object.values(value ?? {}).reduce((total, amount) => total + amount, 0);

function handCardArt(card: HandCard | null | undefined): PolitikCardRef | null {
  if (!card) return null;
  return CARD_ART.get(card.id) ?? politikCardRef(card.id);
}

function cardLabel(card: HandCard, index?: number): string {
  if (card.kind === 'startup') return STARTUP_BY_ID.get(card.id)?.name ?? 'STARTUP';
  if (card.kind === 'obligation') return 'OBLIGATION';
  return `POLITIK${index === undefined ? '' : ` ${index + 1}`}`;
}

function tradeCardName(card: HandCard | undefined, label?: string): string | null {
  if (label?.trim()) return label.trim();
  if (!card) return null;
  return CATALOG[card.id]?.name ?? cardLabel(card);
}

function tradeCompany(view: PolitikView, seat: number, id: string | undefined) {
  return view.players[seat]?.companies.find((company) => company.id === id);
}

function tradeTableauName(view: PolitikView, transfer: TradeTransfer): string | null {
  const player = view.players[transfer.from];
  if (!player || !transfer.tableauId) return null;
  if (transfer.tableauKind === 'company') return player.companies.find((company) => company.id === transfer.tableauId)?.title ?? null;
  if (transfer.tableauKind === 'propaganda') return player.propaganda.find((card) => card.instanceId === transfer.tableauId)?.title ?? null;
  if (transfer.tableauKind === 'asset') return player.companies.flatMap((company) => company.assets).find((card) => card.instanceId === transfer.tableauId)?.title ?? null;
  return null;
}

function tradeAbilityName(view: PolitikView, transfer: TradeTransfer): string | null {
  const source = transfer.source;
  const player = view.players[transfer.from];
  if (!source || !player) return null;
  if (source.kind === 'company') return player.companies.find((company) => company.id === source.id)?.title ?? null;
  if (source.kind === 'propaganda') return player.propaganda.find((card) => card.instanceId === source.id)?.title ?? null;
  if (source.kind === 'asset') return player.companies.flatMap((company) => company.assets).find((card) => card.instanceId === source.id)?.title ?? null;
  return view.locations[source.id]?.name ?? null;
}

function tradeTransferDetail(view: PolitikView, transfer: TradeTransfer, allowLocalHandLookup = false): string {
  const amount = transfer.amount ?? 0;
  if (transfer.kind === 'capital' || transfer.kind === 'carbon' || transfer.kind === 'food') return `${amount} ${transfer.kind.toUpperCase()}`;
  if (transfer.kind === 'hand_card') {
    const localCard = allowLocalHandLookup && transfer.handIndex !== undefined ? view.players[transfer.from]?.hand?.[transfer.handIndex] : undefined;
    return `HAND CARD · ${tradeCardName(transfer.card ?? localCard, transfer.label) ?? 'PRIVATE IDENTITY UNAVAILABLE'}`;
  }
  if (transfer.kind === 'margin') {
    const from = tradeCompany(view, transfer.from, transfer.company)?.title ?? 'MISSING COMPANY';
    const to = tradeCompany(view, transfer.to, transfer.toCompany)?.title ?? 'MISSING COMPANY';
    return `${amount} MARGIN · ${from} → ${to}`;
  }
  if (transfer.kind === 'market') {
    const from = tradeCompany(view, transfer.from, transfer.company)?.title ?? 'MISSING COMPANY';
    const to = tradeCompany(view, transfer.to, transfer.toCompany)?.title ?? 'MISSING COMPANY';
    return `${amount} ${(transfer.industry ?? 'UNKNOWN').toUpperCase()} MARKET${amount === 1 ? '' : 'S'} · ${from} → ${to}`;
  }
  if (transfer.kind === 'state') {
    const location = transfer.location ? view.locations[transfer.location] : null;
    const influence = location?.influence[transfer.from] ?? 0;
    return `ENTIRE ${location?.name ?? 'MISSING STATE'} CONTROL · ${influence} INFLUENCE`;
  }
  if (transfer.kind === 'tableau_card') {
    const name = tradeTableauName(view, transfer) ?? 'MISSING TABLEAU CARD';
    const destination = transfer.tableauKind === 'asset' ? ` → ${tradeCompany(view, transfer.to, transfer.toCompany)?.title ?? 'MISSING RECEIVING COMPANY'}` : '';
    return `${titleCase(transfer.tableauKind ?? 'tableau')} · ${name}${destination}`;
  }
  if (transfer.kind === 'use') return `USE ${titleCase(transfer.source?.kind ?? 'ability')} · ${tradeAbilityName(view, transfer) ?? 'MISSING SOURCE'} · ${transfer.activate ? 'ACTIVATE CARD' : 'NO ACTIVATE COST'}`;
  return `FAVOR · “${transfer.favor ?? 'MISSING PROMISE'}”`;
}

function TourOverlay({ steps, step, setStep, setMode, close }: {
  steps: readonly PolitikTutorialStep[];
  step: number;
  setStep: (step: number) => void;
  setMode: (mode: PolitikTutorialMode) => void;
  close: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const safeStep = Math.max(0, Math.min(step, steps.length - 1));
  const item = steps[safeStep];
  const chapters = [...new Set(steps.map((entry) => entry.chapter))];
  useEffect(() => {
    if (item?.mode) setMode(item.mode);
  }, [item?.mode, setMode]);
  useEffect(() => {
    if (!item) return;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    const update = () => {
      const element = item.selector ? document.querySelector(item.selector) : null;
      const next = element?.getBoundingClientRect();
      setRect(next && next.width > 0 && next.height > 0 ? next : null);
    };
    frame = window.requestAnimationFrame(() => {
      update();
      const element = item.selector ? document.querySelector(item.selector) : null;
      if (element && 'ResizeObserver' in window) {
        observer = new ResizeObserver(update);
        observer.observe(element);
      }
    });
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [safeStep, item]);
  if (!item) return null;
  const last = safeStep === steps.length - 1;
  const ring = rect ? {
    top: Math.max(6, rect.top - 6),
    left: Math.max(6, rect.left - 6),
    width: Math.max(0, Math.min(rect.width + 12, window.innerWidth - Math.max(6, rect.left - 6) - 6)),
    height: Math.max(0, Math.min(rect.height + 12, window.innerHeight - Math.max(6, rect.top - 6) - 6)),
  } : null;
  return (
    <div className="pk-tour" role="dialog" aria-modal="true" aria-label="Politik learn-to-play tutorial" data-testid="politik-tutorial">
      {ring && <div className="pk-tour-ring" style={ring} />}
      <div className={`pk-tour-card ig-glass${rect && rect.top < window.innerHeight / 2 ? ' low' : ''}`}>
        <div className="pk-tour-progress" aria-hidden="true"><i style={{ width: `${((safeStep + 1) / steps.length) * 100}%` }} /></div>
        <div className="pk-tour-meta"><span>{item.chapter}</span><b>{safeStep + 1} / {steps.length}</b></div>
        <nav className="pk-tour-chapters" aria-label="Tutorial chapters">
          {chapters.map((chapter) => <button key={chapter} className={chapter === item.chapter ? 'on' : ''} onClick={() => setStep(steps.findIndex((entry) => entry.chapter === chapter))}>{chapter}</button>)}
        </nav>
        <b>{item.title}</b>
        <p>{item.body}</p>
        {item.tip && <small className="pk-tour-tip">{item.tip}</small>}
        <div className="pk-tour-actions">
          <button onClick={close}>EXIT</button>
          <button disabled={safeStep === 0} onClick={() => setStep(Math.max(0, safeStep - 1))}>BACK</button>
          <button className="pk-tour-next" onClick={() => last ? close() : setStep(safeStep + 1)}>{last ? 'FINISH' : 'NEXT'}</button>
        </div>
      </div>
    </div>
  );
}

function ResourceStepper({ label, value, max = 9, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="pk-stepper">
      <span>{label}</span>
      <button onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>MINUS</button>
      <b>{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>PLUS</button>
    </div>
  );
}

interface CardZoomTarget {
  card: PolitikCardLike;
  label: string;
  kind?: string;
}

function CardZoom({ scene, target, close }: { scene: NonNullable<ReturnType<typeof usePolitikScene>>; target: CardZoomTarget; close: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="pk-card-zoom" data-testid="politik-card-zoom" onClick={close} role="dialog" aria-modal="true" aria-label={`${target.label} close-up`}>
      <div className="pk-card-zoom-shell" onClick={(event) => event.stopPropagation()}>
        <div className="pk-card-zoom-head"><div><span className="ig-lab">FULL-SIZE AUTHENTIC CARD</span><b>{target.label}</b>{target.kind && <small>{target.kind}</small>}</div><button onClick={close}>CLOSE</button></div>
        <PolitikCard scene={scene} card={target.card} label={target.label} />
        <p>TAP OUTSIDE THE CARD OR PRESS ESCAPE TO CLOSE.</p>
      </div>
    </div>
  );
}

function Viewer({ kind, scene, view, me, close, focus, zoom, showGoal, startTour, send }: {
  kind: 'hand' | 'decks' | 'reference' | 'trade';
  scene: NonNullable<ReturnType<typeof usePolitikScene>>;
  view: PolitikView;
  me: PolitikPlayerView;
  close: () => void;
  focus: (card: HandCard, index: number) => void;
  zoom: (card: PolitikCardLike, label: string, kind?: string) => void;
  showGoal: () => void;
  startTour: () => void;
  send?: (action: Record<string, unknown>) => void;
}) {
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceType, setReferenceType] = useState<'all' | 'politik' | 'startup' | 'obligation' | 'landscape' | 'nation' | 'propaganda'>('all');
  const [referenceFocus, setReferenceFocus] = useState<{ key: string; title: string; type: string; art: PolitikCardLike; detail: string } | null>(null);
  const other = view.players.find((player) => player.seat !== me.seat)?.seat ?? me.seat;
  const [tradeFrom, setTradeFrom] = useState(me.seat);
  const [tradeTo, setTradeTo] = useState(other);
  const [tradeKind, setTradeKind] = useState<'capital' | 'carbon' | 'food' | 'hand_card' | 'margin' | 'market' | 'state' | 'tableau_card' | 'use' | 'favor'>('capital');
  const [tradeAmount, setTradeAmount] = useState(1);
  const [tradeHand, setTradeHand] = useState(0);
  const [tradeCompany, setTradeCompany] = useState('');
  const [tradeToCompany, setTradeToCompany] = useState('');
  const [tradeIndustry, setTradeIndustry] = useState<(typeof INDUSTRIES)[number]>('media');
  const [tradeLocation, setTradeLocation] = useState(Object.keys(view.locations)[0] ?? 'A1');
  const [tradeFavor, setTradeFavor] = useState('');
  const [tradeTableauKind, setTradeTableauKind] = useState<'company' | 'asset' | 'propaganda'>('company');
  const [tradeTableauId, setTradeTableauId] = useState('');
  const [tradeUseKind, setTradeUseKind] = useState<'company' | 'asset' | 'propaganda'>('company');
  const [tradeUseId, setTradeUseId] = useState('');
  const [tradeUseActivate, setTradeUseActivate] = useState(false);
  const [transfers, setTransfers] = useState<TradeTransfer[]>([]);
  const referenceEntries = useMemo(() => [
    ...Object.values(CATALOG).map((entry) => ({ key: entry.id, title: entry.name, type: 'politik', art: entry.id as PolitikCardLike, detail: `${entry.type.toUpperCase()} · OCR COST ${entry.costText || 'UNAVAILABLE'} · ${entry.rulesText || 'READ AUTHENTIC CARD'}` })),
    ...(CARD_CATALOG.startupDefs ?? []).map((entry) => ({ key: entry.id, title: entry.name, type: 'startup', art: entry.id as PolitikCardLike, detail: `${entry.capitalCost} CAPITAL / ${entry.carbonCost} CARBON · MARGIN ${entry.startingMargin} · ${entry.industries.map(titleCase).join(' / ')}` })),
    ...CARD_CATALOG.obligations.map((entry, index) => ({ key: entry.id, title: `OBLIGATION ${index + 1}`, type: 'obligation', art: entry.id as PolitikCardLike, detail: 'Authentic Obligation card · inspect its printed text.' })),
    ...(CARD_CATALOG.landscapeDefs ?? []).map((entry, index) => ({ key: entry.id, title: `LANDSCAPE ${index + 1}`, type: 'landscape', art: entry.id as PolitikCardLike, detail: `${entry.delta > 0 ? '+' : ''}${entry.delta} · ${entry.industries.map(titleCase).join(' / ')} · ${entry.priceTracks.map(titleCase).join(' / ')}` })),
    ...Object.values(NATION_BY_ID).map((entry) => ({ key: entry.id, title: entry.name, type: 'nation', art: entry.card as PolitikCardLike, detail: `${entry.capital} CAPITAL / ${entry.carbon} CARBON / ${entry.food} FOOD / ${entry.support} SUPPORT / ${entry.leaders} LEADERS` })),
    ...Object.values(PROPAGANDA_BY_ID).map((entry) => ({ key: entry.id, title: entry.name, type: 'propaganda', art: entry.card as PolitikCardLike, detail: `STARTING PROPAGANDA · ${entry.bases.map(titleCase).join(' / ')}${entry.corruption ? ' · CORRUPTION' : ''}${entry.negotiation ? ' · NEGOTIATION' : ''}` })),
  ], []);
  const normalizedReferenceQuery = referenceQuery.trim().toLowerCase();
  const filteredReferenceEntries = referenceEntries.filter((entry) => (referenceType === 'all' || entry.type === referenceType) && (!normalizedReferenceQuery || `${entry.title} ${entry.type} ${entry.detail}`.toLowerCase().includes(normalizedReferenceQuery)));
  const visibleReferenceEntries = filteredReferenceEntries.slice(0, 72);
  const fromPlayer = view.players[tradeFrom] ?? me;
  const toPlayer = view.players[tradeTo] ?? me;
  const fromCompany = fromPlayer.companies.find((company) => company.id === tradeCompany) ?? fromPlayer.companies[0];
  const toCompany = toPlayer.companies.find((company) => company.id === tradeToCompany) ?? toPlayer.companies[0];
  const handCards = (fromPlayer.hand ?? []).map((card, index) => ({ card, index })).filter(({ card }) => card.kind !== 'obligation');
  const handCard = handCards.find(({ index }) => index === tradeHand) ?? handCards[0];
  const controlledStates = Object.values(view.locations).filter((location) => controlledBy(view, location.influence, 'location', location.id) === tradeFrom);
  const stateLocation = controlledStates.find((location) => location.id === tradeLocation) ?? controlledStates[0];
  const tableauSources = tradeTableauKind === 'company' ? fromPlayer.companies.map((item) => ({ id: item.id, title: item.title }))
    : tradeTableauKind === 'propaganda' ? fromPlayer.propaganda.map((item) => ({ id: item.instanceId, title: item.title }))
      : fromPlayer.companies.flatMap((item) => item.assets.map((asset) => ({ id: asset.instanceId, title: asset.title })));
  const tableauId = tableauSources.some((item) => item.id === tradeTableauId) ? tradeTableauId : tableauSources[0]?.id ?? '';
  const useSources = tradeUseKind === 'company' ? fromPlayer.companies.map((item) => ({ id: item.id, title: item.title, ready: item.ready }))
    : tradeUseKind === 'propaganda' ? fromPlayer.propaganda.map((item) => ({ id: item.instanceId, title: item.title, ready: item.ready }))
      : fromPlayer.companies.flatMap((item) => item.assets.map((asset) => ({ id: asset.instanceId, title: asset.title, ready: asset.ready })));
  const useSource = useSources.find((item) => item.id === tradeUseId) ?? useSources[0];
  const marketIndustries = fromCompany && toCompany ? INDUSTRIES.filter((industry) => (fromCompany.markets[industry] ?? 0) > 0 && toCompany.industries.includes(industry)) : [];
  const marketIndustry = marketIndustries.includes(tradeIndustry) ? tradeIndustry : marketIndustries[0];
  const amountRequired = ['capital', 'carbon', 'food', 'margin', 'market'].includes(tradeKind);
  const amountInvalid = amountRequired && (!Number.isInteger(tradeAmount) || tradeAmount < 1);
  const emptySource = tradeKind === 'hand_card' ? !handCard
    : tradeKind === 'margin' ? !fromCompany || !toCompany
      : tradeKind === 'market' ? !fromCompany || !toCompany || !marketIndustry
        : tradeKind === 'state' ? !stateLocation
          : tradeKind === 'tableau_card' ? !tableauId || (tradeTableauKind === 'asset' && !toCompany)
            : tradeKind === 'use' ? !useSource || (tradeUseActivate && !useSource.ready)
              : false;
  const exceedsSource = tradeKind === 'capital' || tradeKind === 'carbon' || tradeKind === 'food' ? tradeAmount > fromPlayer[tradeKind]
    : tradeKind === 'margin' ? tradeAmount > (fromCompany?.margin ?? 0) || (toCompany?.margin ?? 0) + tradeAmount > 9
      : tradeKind === 'market' ? tradeAmount > (fromCompany?.markets[marketIndustry ?? 'media'] ?? 0)
        : false;
  const duplicatePrivateSource = tradeKind === 'hand_card' && !!handCard && transfers.some((transfer) => transfer.kind === 'hand_card' && transfer.from === tradeFrom && transfer.handIndex === handCard.index);
  const proposalInvolvesMe = transfers.some((transfer) => transfer.from === me.seat || transfer.to === me.seat);
  const transferInvalid = tradeFrom === tradeTo || amountInvalid || emptySource || exceedsSource || duplicatePrivateSource || (tradeKind === 'use' && transfers.some((transfer) => transfer.kind === 'use')) || (tradeKind === 'favor' && tradeFavor.trim().length < 3);
  const transferIssue = tradeFrom === tradeTo ? 'Choose two different Nations.'
    : emptySource ? `No eligible ${titleCase(tradeKind)} source is available for ${fromPlayer.name}.`
      : amountInvalid ? 'Enter a whole amount of at least 1.'
        : exceedsSource ? 'The selected source cannot provide that amount, or the destination would exceed its limit.'
          : duplicatePrivateSource ? 'That exact hand card is already in this proposal.'
            : tradeKind === 'use' && transfers.some((transfer) => transfer.kind === 'use') ? 'Only one traded ability use can resolve in a proposal.'
              : tradeKind === 'favor' && tradeFavor.trim().length < 3 ? 'Describe the promised favor in at least 3 characters.'
                : null;
  const addTransfer = () => {
    if (transferInvalid) return;
    let transfer: TradeTransfer;
    if (tradeKind === 'hand_card') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, handIndex: handCard!.index };
    else if (tradeKind === 'margin') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, amount: tradeAmount, company: fromCompany!.id, toCompany: toCompany!.id };
    else if (tradeKind === 'market') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, amount: tradeAmount, company: fromCompany!.id, toCompany: toCompany!.id, industry: marketIndustry! };
    else if (tradeKind === 'state') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, location: stateLocation!.id };
    else if (tradeKind === 'tableau_card') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, tableauKind: tradeTableauKind, tableauId, ...(tradeTableauKind === 'asset' ? { toCompany: toCompany!.id } : {}) };
    else if (tradeKind === 'use') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, source: { kind: tradeUseKind, id: useSource!.id }, activate: tradeUseActivate };
    else if (tradeKind === 'favor') transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, favor: tradeFavor };
    else transfer = { from: tradeFrom, to: tradeTo, kind: tradeKind, amount: tradeAmount };
    setTransfers((list) => [...list, transfer]);
  };
  return (
    <div className="pk-viewer" onClick={close}>
      <div className="pk-viewer-card ig-glass" onClick={(event) => event.stopPropagation()}>
        <div className="pk-viewer-head">
          <div><span className="ig-lab">PRIVATE DEVICE</span><b>{kind === 'hand' ? `FULL HAND ${me.handCount}` : kind === 'decks' ? 'DECK STATUS' : kind === 'trade' ? 'TRADE PROPOSAL' : 'REFERENCE'}</b></div>
          <button onClick={close}>CLOSE</button>
        </div>
        {kind === 'hand' && (
          <div className="pk-viewer-hand">
            {(me.hand ?? []).map((card, index) => (
              <button key={`${card.id}-${index}`} onClick={() => focus(card, index)}>
                <PolitikCard scene={scene} card={handCardArt(card)} label={cardLabel(card, index)} />
                <span>{cardLabel(card, index)}</span>
              </button>
            ))}
          </div>
        )}
        {kind === 'decks' && (
          <div className="pk-deck-view">
            <div className="pk-deck-left">
              <div className="pk-deck-grid">
                <div><span className="ig-lab">POLITIK DECK</span><b>{view.politicsDeckCount}</b><small>{view.politicsDiscardCount} discarded</small></div>
                <div><span className="ig-lab">OBLIGATIONS</span><b>{view.obligationDeckCount}</b><small>Drawn by corrupt effects</small></div>
                <div><span className="ig-lab">LANDSCAPES</span><b>{view.landscape.deckCount}</b><small>{view.landscape.discardCount} resolved</small></div>
                <div><span className="ig-lab">STARTUPS USED</span><b>{view.startupDiscardCount}</b><small>Opening companies already committed</small></div>
                <div><span className="ig-lab">YOUR TABLEAU</span><b>{me.companies.length + me.eventsInPlay.length + me.propaganda.length}</b><small>Companies, events, and Propaganda</small></div>
              </div>
              <span className="ig-lab pk-tableau-title">YOUR READY AND USED CARDS</span>
              <div className="pk-tableau-strip">
                {[...me.propaganda, ...me.eventsInPlay, ...me.companies, ...me.companies.flatMap((company) => company.assets)].map((card) => <button key={'instanceId' in card ? card.instanceId : card.id} className={card.ready ? '' : 'used'} onClick={() => zoom(handCardArt(card.card), card.title, 'YOUR TABLEAU')}><PolitikCard scene={scene} card={handCardArt(card.card)} label={card.title} /><span>{card.title}</span><small>{card.ready ? 'READY' : 'USED'}{'margin' in card ? ` / MARGIN ${card.margin}` : ''} · VIEW CLOSE UP</small></button>)}
              </div>
            </div>
            <div className="pk-deck-landscapes"><button onClick={() => zoom(view.landscape.active, 'Active Landscape', 'LANDSCAPE')}><span className="ig-lab">ACTIVE LANDSCAPE</span><PolitikCard scene={scene} card={view.landscape.active} label="Active Landscape" /><small>VIEW CLOSE UP</small></button><button onClick={() => zoom(view.landscape.upcoming, 'Upcoming Landscape', 'LANDSCAPE')}><span className="ig-lab">UPCOMING LANDSCAPE</span><PolitikCard scene={scene} card={view.landscape.upcoming} label="Upcoming Landscape" /><small>VIEW CLOSE UP</small></button></div>
          </div>
        )}
        {kind === 'reference' && (
          <div className="pk-reference-body pk-reference-learning">
            <PolitikLessons showGoal={showGoal} startTour={startTour} />
            <section className="pk-reference-library-section">
              <div className="pk-variant-reference"><span className="ig-lab">ACTIVE ROOM VARIANTS</span><div><b className={!view.options.longWar && !view.options.trifecta && !view.options.ragingImperials ? 'on' : ''}>STANDARD<small>Normal victory threshold and Imperial defense.</small></b><b className={view.options.longWar ? 'on' : ''}>LONG WAR<small>Raises the required Power Grab total.</small></b><b className={view.options.trifecta ? 'on' : ''}>TRIFECTA<small>Requires at least one Power Grab in all three arenas.</small></b><b className={view.options.ragingImperials ? 'on' : ''}>RAGING IMPERIALS<small>Adds one Imperial Focus card in Clashes.</small></b></div><p>DRAFT / TEAM GAME are rulebook variants and are not available in this digital build.</p></div>
              <div className="pk-card-reference">
                <div className="pk-card-reference-head"><div><span className="ig-lab">SEARCHABLE AUTHENTIC REFERENCE</span><b>CARDS / NATIONS / PROPAGANDA</b></div><small>{filteredReferenceEntries.length} MATCHES</small></div>
                <div className="pk-card-reference-controls"><input data-testid="politik-help-card-search" value={referenceQuery} onChange={(event) => { setReferenceQuery(event.target.value); setReferenceFocus(null); }} placeholder="SEARCH TITLE, TYPE, KEYWORD" /><select data-testid="politik-help-card-type" value={referenceType} onChange={(event) => { setReferenceType(event.target.value as typeof referenceType); setReferenceFocus(null); }}><option value="all">ALL CARDS</option><option value="politik">POLITIK</option><option value="startup">STARTUPS</option><option value="obligation">OBLIGATIONS</option><option value="landscape">LANDSCAPES</option><option value="nation">NATIONS</option><option value="propaganda">STARTING PROPAGANDA</option></select></div>
                {referenceFocus && <div className="pk-card-reference-focus"><button className="pk-reference-zoom" onClick={() => zoom(referenceFocus.art, referenceFocus.title, referenceFocus.type)} aria-label={`View ${referenceFocus.title} close up`}><PolitikCard scene={scene} card={referenceFocus.art} label={referenceFocus.title} /></button><span><small>{referenceFocus.type}</small><b>{referenceFocus.title}</b><p>{referenceFocus.detail}</p><em>Authentic art is authoritative; extracted text is a navigation hint.</em><button onClick={() => zoom(referenceFocus.art, referenceFocus.title, referenceFocus.type)}>VIEW CARD CLOSE UP</button></span></div>}
                <div className="pk-card-reference-grid">{visibleReferenceEntries.map((entry) => <button key={`${entry.type}-${entry.key}`} data-testid={`politik-reference-${entry.type}-${entry.key}`} className={referenceFocus?.key === entry.key && referenceFocus.type === entry.type ? 'on' : ''} onClick={() => setReferenceFocus(entry)}><PolitikCard scene={scene} card={entry.art} label={entry.title} /><span><b>{entry.title}</b><small>{entry.type}</small></span></button>)}</div>
                {filteredReferenceEntries.length > visibleReferenceEntries.length && <small className="pk-reference-limit">Showing the first {visibleReferenceEntries.length}. Refine the search to reach the remaining {filteredReferenceEntries.length - visibleReferenceEntries.length}.</small>}
              </div>
              <a className="pk-rulebook-link" href="/politik/rulebook.pdf" target="_blank" rel="noreferrer">OPEN OFFICIAL RULEBOOK</a>
            </section>
          </div>
        )}
        {kind === 'trade' && (
          <div className="pk-trade-builder">
            <p>Build every transfer in both directions. All involved Nations, plus the active Nation, must approve before anything changes.</p>
            <div className="pk-trade-form">
              <label>FROM<select value={tradeFrom} onChange={(event) => { setTradeFrom(Number(event.target.value)); setTradeCompany(''); setTradeHand(0); setTradeLocation(''); setTradeTableauId(''); setTradeUseId(''); }}>{view.players.map((player) => <option key={player.seat} value={player.seat}>{player.name}</option>)}</select></label>
              <label>TO<select value={tradeTo} onChange={(event) => { setTradeTo(Number(event.target.value)); setTradeToCompany(''); }}>{view.players.filter((player) => player.seat !== tradeFrom).map((player) => <option key={player.seat} value={player.seat}>{player.name}</option>)}</select></label>
              <label>PROPERTY<select value={tradeKind} onChange={(event) => setTradeKind(event.target.value as typeof tradeKind)}>{(['capital', 'carbon', 'food', 'hand_card', 'margin', 'market', 'state', 'tableau_card', 'use', 'favor'] as const).map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
              {amountRequired && <label>AMOUNT<input type="number" min={1} step={1} value={tradeAmount} onChange={(event) => setTradeAmount(Number(event.target.value))} /></label>}
              {tradeKind === 'hand_card' && <label>EXACT HAND CARD<select value={handCard?.index ?? ''} onChange={(event) => setTradeHand(Number(event.target.value))}>{handCards.map(({ card, index }) => <option key={`${card.id}-${index}`} value={index}>{CATALOG[card.id]?.name ?? cardLabel(card, index)}</option>)}</select></label>}
              {(tradeKind === 'margin' || tradeKind === 'market') && <><label>FROM COMPANY<select value={fromCompany?.id ?? ''} onChange={(event) => setTradeCompany(event.target.value)}>{fromPlayer.companies.map((company) => <option key={company.id} value={company.id}>{company.title}{tradeKind === 'margin' ? ` · ${company.margin} MARGIN` : ''}</option>)}</select></label><label>TO COMPANY<select value={toCompany?.id ?? ''} onChange={(event) => setTradeToCompany(event.target.value)}>{toPlayer.companies.map((company) => <option key={company.id} value={company.id}>{company.title}{tradeKind === 'margin' ? ` · ${company.margin} MARGIN` : ''}</option>)}</select></label></>}
              {tradeKind === 'market' && <label>MARKET HELD + ACCEPTED<select value={marketIndustry ?? ''} onChange={(event) => setTradeIndustry(event.target.value as typeof tradeIndustry)}>{marketIndustries.map((industry) => <option key={industry} value={industry}>{industry.toUpperCase()} · {fromCompany?.markets[industry] ?? 0} HELD</option>)}</select></label>}
              {tradeKind === 'state' && <label>ENTIRE CONTROLLED STATE<select value={stateLocation?.id ?? ''} onChange={(event) => setTradeLocation(event.target.value)}>{controlledStates.map((location) => <option key={location.id} value={location.id}>{location.name} · ALL {location.influence[tradeFrom]} INFLUENCE</option>)}</select></label>}
              {tradeKind === 'tableau_card' && <><label>TABLEAU TYPE<select value={tradeTableauKind} onChange={(event) => { setTradeTableauKind(event.target.value as typeof tradeTableauKind); setTradeTableauId(''); }}><option value="company">COMPANY</option><option value="asset">ASSET</option><option value="propaganda">PROPAGANDA</option></select></label><label>EXACT TABLEAU CARD<select value={tableauId} onChange={(event) => setTradeTableauId(event.target.value)}>{tableauSources.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{tradeTableauKind === 'asset' && <label>RECEIVING COMPANY<select value={toCompany?.id ?? ''} onChange={(event) => setTradeToCompany(event.target.value)}>{toPlayer.companies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}</>}
              {tradeKind === 'use' && <><label>ABILITY TYPE<select value={tradeUseKind} onChange={(event) => { setTradeUseKind(event.target.value as typeof tradeUseKind); setTradeUseId(''); }}><option value="company">COMPANY</option><option value="asset">ASSET</option><option value="propaganda">PROPAGANDA</option></select></label><label>EXACT ABILITY SOURCE<select value={useSource?.id ?? ''} onChange={(event) => setTradeUseId(event.target.value)}>{useSources.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.ready ? 'READY' : 'USED'}</option>)}</select></label><label>PRINTED COST<select value={tradeUseActivate ? 'activate' : 'none'} onChange={(event) => setTradeUseActivate(event.target.value === 'activate')}><option value="none">NO ACTIVATE COST</option><option value="activate">ACTIVATE THIS CARD</option></select></label></>}
              {tradeKind === 'favor' && <label>PUBLIC PROMISE<input value={tradeFavor} maxLength={240} onChange={(event) => setTradeFavor(event.target.value)} placeholder="Describe the favor in at least 3 characters" /></label>}
              <button onClick={addTransfer} disabled={transferInvalid}>ADD EXACT TRANSFER</button>
              {transferIssue && <p className="pk-trade-validation">{transferIssue}</p>}
            </div>
            <div className="pk-trade-review-head"><div><span className="ig-lab">REVIEW EXACT PROPOSAL</span><b>{transfers.length} TRANSFER{transfers.length === 1 ? '' : 'S'} · NOTHING MOVES UNTIL EVERY APPROVAL</b></div><small>Tap a row to remove it</small></div>
            <div className="pk-trade-transfers">{transfers.map((transfer, index) => <button key={index} onClick={() => setTransfers((list) => list.filter((_, item) => item !== index))}><b>{view.players[transfer.from].name} → {view.players[transfer.to].name}</b><span>{tradeTransferDetail(view, transfer, true)}</span><small>REMOVE</small></button>)}</div>
            {!transfers.length && <div className="pk-trade-empty">Add transfers above. This review will name every exact item before you send.</div>}
            {!!transfers.length && !proposalInvolvesMe && <div className="pk-trade-validation">Your Nation must give or receive at least one item because you are proposing this trade.</div>}
            <button className="pk-primary" disabled={!transfers.length || !proposalInvolvesMe} onClick={() => { const participants = [...new Set(transfers.flatMap((transfer) => [transfer.from, transfer.to]))]; send?.({ type: 'propose_trade', participants, transfers }); }}>SEND THIS EXACT PROPOSAL FOR APPROVAL</button>
          </div>
        )}
      </div>
    </div>
  );
}

type MainAction = 'play' | 'ability' | 'national' | 'clash' | 'educate' | 'research' | 'campaign' | 'exchange';
type ViewerKind = 'hand' | 'decks' | 'reference' | 'trade';
type ManualCardKind = 'company' | 'asset' | 'propaganda' | 'event';
type BoardTargetRequest = 'campaign' | 'clash_military' | 'clash_political' | null;
interface BroadcastBoardPreview {
  station: string;
  mode: 'signal' | 'noise';
  base: BaseId;
  effects: { id: string; detail: string }[];
}

interface CatalogEntry {
  id: string;
  name: string;
  type: string;
  costText?: string;
  focus?: Partial<Record<Arena, number>>;
  margin?: number | null;
  rulesText?: string;
  keywordsText?: string;
}

const CATALOG = (POLITIK_DATA.cards as unknown as { catalog?: Record<string, CatalogEntry> }).catalog ?? {};

function setupNationArt(id: string | null): PolitikCardRef | null {
  return id ? NATION_BY_ID[id]?.card ?? null : null;
}

function setupPropagandaArt(id: string | null): PolitikCardRef | null {
  return id ? PROPAGANDA_BY_ID[id]?.card ?? null : null;
}

function mainActionReason(action: MainAction, view: PolitikView, me: PolitikPlayerView, mine: boolean): string | null {
  if (view.phase !== 'playing') return 'Setup is still in progress.';
  if (view.pending) return 'Resolve the current prompt first.';
  if (!mine) return `Waiting for ${view.players[view.turn]?.name ?? 'the active Nation'}. Edge responses appear when a response window opens.`;
  if (mine && view.actionsTaken >= view.actionsAllowed) return 'No main actions remain. End your turn.';
  if (action === 'play' && !me.handCount) return 'Your hand is empty.';
  if (action === 'ability') {
    const controlledStation = Object.values(view.locations).some((location) => location.kind === 'station' && controlledBy(view, location.influence, 'location', location.id) === me.seat);
    if (!me.propaganda.length && !me.companies.length && !me.companies.some((company) => company.assets.length) && !controlledStation) return 'No controlled ability source is available.';
  }
  if (action === 'national' && me.nationalUsed.length >= 4) return 'All National Actions have been used this turn.';
  if (action === 'clash' && me.carbon < view.prices.clash && sum(me.leaders) < 1) return `Needs ${view.prices.clash} carbon or one matching leader.`;
  if (action === 'educate' && me.food < view.prices.educate) return `Needs ${view.prices.educate} food for one leader.`;
  if (action === 'research' && me.capital < view.prices.research) return `Needs ${view.prices.research} capital for one card.`;
  if (action === 'campaign' && me.capital < view.prices.campaign) return `Needs ${view.prices.campaign} capital.`;
  if (action === 'campaign' && sum(me.support) <= 0) return 'No support is available in your bases.';
  if (action === 'exchange' && me.capital <= 0 && me.food <= 0 && me.carbon <= 0) return 'You have nothing available to buy with or sell.';
  return null;
}

function PendingPrompt({ pending, view, me, scene, send, inspect, zoom, clashResume = false }: {
  pending: PolitikPendingView;
  view: PolitikView;
  me: PolitikPlayerView;
  scene: NonNullable<ReturnType<typeof usePolitikScene>>;
  send: (action: Record<string, unknown>) => void;
  inspect?: (card: HandCard, index: number) => void;
  zoom?: (card: PolitikCardLike, label: string, kind?: string) => void;
  clashResume?: boolean;
}) {
  const mine = pending.seat === view.you;
  const [selected, setSelected] = useState<number[]>([]);
  const [focus, setFocus] = useState<Record<number, number>>({});
  const [leaders, setLeaders] = useState(0);
  const [focusInfluence, setFocusInfluence] = useState<Record<string, number>>({});
  const [lossMargin, setLossMargin] = useState(0);
  const [lossMarkets, setLossMarkets] = useState<Partial<Record<(typeof INDUSTRIES)[number], number>>>({});
  const [supportAllocation, setSupportAllocation] = useState<Record<BaseId, number>>({ capitalism: 0, communism: 0, statism: 0, fascism: 0 });
  const [note, setNote] = useState('');
  const [guidedOps, setGuidedOps] = useState<GuidedOperation[]>([]);
  const [opKind, setOpKind] = useState<'resource' | 'corruption' | 'support' | 'influence' | 'market' | 'market_supply' | 'industry_margin' | 'margin' | 'price' | 'ready' | 'leader' | 'draw' | 'immunity' | 'move_card' | 'clash_modifier' | 'cancel_clash' | 'acknowledge'>('resource');
  const [opSeat, setOpSeat] = useState(me.seat);
  const [opAmount, setOpAmount] = useState(1);
  const [opResource, setOpResource] = useState<'capital' | 'carbon' | 'food'>('capital');
  const [opLocation, setOpLocation] = useState(Object.keys(view.locations)[0] ?? 'A1');
  const [opIndustry, setOpIndustry] = useState<(typeof INDUSTRIES)[number]>('media');
  const [opCompany, setOpCompany] = useState('');
  const [opPrice, setOpPrice] = useState<(typeof PRICE_TRACKS)[number]>('food');
  const [supportFromZone, setSupportFromZone] = useState<'base' | 'council'>('base');
  const [supportFromId, setSupportFromId] = useState<string>('capitalism');
  const [supportToZone, setSupportToZone] = useState<'base' | 'council'>('council');
  const [supportToId, setSupportToId] = useState<string>('chair');
  const [supportMode, setSupportMode] = useState<'move' | 'gain' | 'lose'>('move');
  const [opArena, setOpArena] = useState<Arena>('military');
  const [opDeck, setOpDeck] = useState<'politik' | 'obligation'>('politik');
  const [opReadyKind, setOpReadyKind] = useState<'company' | 'asset' | 'propaganda' | 'station'>('company');
  const [opReadyId, setOpReadyId] = useState('');
  const [opReady, setOpReady] = useState(true);
  const [opImmune, setOpImmune] = useState(true);
  const [opHandIndex, setOpHandIndex] = useState(0);
  const [opMoveTo, setOpMoveTo] = useState<'politik_discard' | 'obligation_bottom'>('politik_discard');
  const [opAcknowledge, setOpAcknowledge] = useState('');
  const [opOverflowChoices, setOpOverflowChoices] = useState<Record<string, '' | 'remain' | (typeof INDUSTRIES)[number]>>({});
  const [landscapeChoice, setLandscapeChoice] = useState<'' | 'remain' | (typeof INDUSTRIES)[number]>('');
  const [corporateGainChoice, setCorporateGainChoice] = useState<'' | 'remain' | (typeof INDUSTRIES)[number]>('');
  const [clashModifierSide, setClashModifierSide] = useState<'attacker' | 'defender'>('attacker');
  const [clashModifierAmount, setClashModifierAmount] = useState(1);
  const [clashModifierSource, setClashModifierSource] = useState('');
  const [clashCancelSource, setClashCancelSource] = useState('');
  const hand = me.hand ?? [];
  const landscapeSetup = pending.kind === 'landscape' && pending.context === 'setup';

  if (!mine && pending.kind === 'edge_window') {
    return (
      <div className="pk-prompt-wait pk-edge-wait ig-glass" data-testid="politik-edge-waiting">
        <span className="ig-lab">EDGE RESPONSE WINDOW · {pending.cursor + 1} / {pending.order.length}</span>
        <b>{view.players[pending.seat]?.name ?? 'Another Nation'} is responding now</b>
        <p>{pending.reason}. {view.players[pending.order[0]]?.name ?? 'The requester'} acts first; remaining simultaneous responses follow Final Say order.</p>
        <div className="pk-edge-order">{pending.order.map((seat, index) => <span key={seat} className={index < pending.cursor ? 'passed' : index === pending.cursor ? 'current' : ''}><b>{index + 1}</b><small>{view.players[seat]?.name}</small></span>)}</div>
      </div>
    );
  }

  if (!mine && pending.kind !== 'landscape' && pending.kind !== 'clash') {
    return (
      <div className="pk-prompt-wait ig-glass">
        <span className="ig-lab">REQUIRED DECISION</span>
        <b>{view.players[pending.seat]?.name ?? 'Another Nation'} is resolving {titleCase(pending.kind)}</b>
        <p>The table will continue as soon as the private choice is confirmed.</p>
      </div>
    );
  }

  if (pending.kind === 'edge_window') {
    const edgeCards = hand.map((card, index) => ({ card, index, spec: playSpec(card) })).filter((item) => item.spec.kind === 'event');
    const edgeAbilities = [
      ...me.propaganda.map((card) => ({ label: card.title, ready: card.ready, source: { kind: 'propaganda', id: card.instanceId } })),
      ...me.companies.map((card) => ({ label: card.title, ready: card.ready, source: { kind: 'company', id: card.id } })),
      ...me.companies.flatMap((company) => company.assets.map((asset) => ({ label: asset.title, ready: asset.ready, source: { kind: 'asset', id: asset.instanceId } }))),
    ];
    return (
      <div className="pk-prompt-card pk-edge-prompt ig-glass">
        <span className="ig-lab">EDGE WINDOW {pending.cursor + 1} / {pending.order.length}</span>
        <h2>RESPOND OR PASS</h2>
        <p>{pending.reason}. {view.players[pending.order[0]]?.name ?? 'The requester'} acts first; remaining simultaneous responses follow Final Say order. Your hand and ready abilities remain private, and every Edge action returns here until you explicitly pass.</p>
        <div className="pk-edge-order">{pending.order.map((seat, index) => <span key={seat} className={index < pending.cursor ? 'passed' : index === pending.cursor ? 'current' : ''}><b>{index + 1}</b><small>{view.players[seat]?.name}</small></span>)}</div>
        {!!edgeCards.length && <><span className="ig-lab">EVENTS IN HAND</span><p>Inspect the authentic card. Mark it as EDGE only when the printed Edge icon is present.</p><div className="pk-commit-hand">{edgeCards.map(({ card, index }) => <button key={`${card.id}-${index}`} onClick={() => inspect?.(card, index)}><PolitikCard scene={scene} card={handCardArt(card)} label={CATALOG[card.id]?.name ?? cardLabel(card, index)} /><span>{CATALOG[card.id]?.name ?? cardLabel(card, index)}<b>INSPECT PRINTED ICON</b></span></button>)}</div></>}
        {!!edgeAbilities.length && <><span className="ig-lab">CONTROLLED EDGE ABILITIES</span><p>Choose ACTIVATE only if the printed Edge ability includes that cost.</p><div className="pk-detail-list">{edgeAbilities.map((ability) => <div className="pk-ability-row" key={`${ability.source.kind}-${ability.source.id}`}><span><b>{ability.label}</b><small>{ability.ready ? 'READY' : 'USED'}</small></span><button onClick={() => send({ type: 'use_ability', source: ability.source, asEdge: true, activate: false })}>NO ACTIVATE</button><button disabled={!ability.ready} onClick={() => send({ type: 'use_ability', source: ability.source, asEdge: true, activate: true })}>{ability.ready ? 'ACTIVATE' : 'ALREADY USED'}</button></div>)}</div></>}
        <button className="pk-primary" data-testid="politik-edge-pass" onClick={() => send({ type: 'pass_edge' })}>PASS EDGE WINDOW</button>
      </div>
    );
  }

  if (pending.kind === 'allocate_support') {
    const allocated = Object.values(supportAllocation).reduce((total, amount) => total + amount, 0);
    return (
      <div className="pk-prompt-card ig-glass">
        <span className="ig-lab">BROADCAST STATION BENEFIT</span>
        <h2>ALLOCATE {pending.amount} SUPPORT</h2>
        <p>{pending.reason}. Place all gained Support among the eligible ideology Bases.</p>
        {pending.eligible.map((base) => <ResourceStepper key={base} label={base.toUpperCase()} value={supportAllocation[base]} max={pending.amount} onChange={(value) => setSupportAllocation((current) => ({ ...current, [base]: value }))} />)}
        <div className="pk-cost-line"><span>ALLOCATED</span><b>{allocated} / {pending.amount}</b></div>
        <button className="pk-primary" disabled={allocated !== pending.amount} onClick={() => send({ type: 'allocate_support', support: supportAllocation })}>CONFIRM SUPPORT</button>
      </div>
    );
  }

  if (pending.kind === 'landscape') {
    const overflow = pending.overflow;
    const direction = pending.delta > 0 ? 'UP' : 'DOWN';
    const signedDelta = `${pending.delta > 0 ? '+' : ''}${pending.delta}`;
    const affectedCompanies = pending.industries.map((industry) => ({
      industry,
      count: view.players.reduce((total, player) => total + player.companies.filter((company) => company.industries.includes(industry)).length, 0),
    }));
    return (
      <div className="pk-prompt-card pk-landscape-prompt ig-glass" data-pk-tutorial={landscapeSetup ? 'setup-landscape' : 'landscape-help'}>
        <div className="pk-landscape-title">
          <div><span className="ig-lab">{landscapeSetup ? 'OPENING LANDSCAPE · BEFORE MULLIGANS' : 'REFRESH LANDSCAPE · AUTOMATIC TABLE EFFECT'}</span><h2>RESOLVE THE ACTIVE LANDSCAPE</h2></div>
          <span className={`pk-landscape-delta ${pending.delta > 0 ? 'up' : 'down'}`}><small>PRINTED CHANGE</small><b>{signedDelta}</b><em>{direction}</em></span>
        </div>
        <div className="pk-landscape-layout">
          <div className="pk-landscape-authentic"><PolitikCard scene={scene} card={pending.card} label="Active Landscape" /><small>AUTHENTIC ACTIVE CARD</small></div>
          <div className="pk-landscape-effects">
            <p>The card’s canonical effects are applied automatically in printed order. A Company matching two affected Industries resolves both rows. The only decision below is the current Company’s Margin overflow.</p>
            <section>
              <div className="pk-landscape-section-head"><span className="ig-lab">INDUSTRIES · MARKETS AND MARGIN</span><small>15 PHYSICAL MARKETS EACH</small></div>
              <div className="pk-landscape-effect-grid">
                {affectedCompanies.map(({ industry, count }) => {
                  const move = pending.marketMoves[industry] ?? 0;
                  return <div key={industry}>
                    <b>{industry.toUpperCase()}</b>
                    <span>{move > 0 ? `RESERVE → ON BOARD ${move}` : move < 0 ? `ON BOARD → RESERVE ${-move}` : 'POOL AT LIMIT · NO TOKEN MOVED'}</span>
                    <small>NOW {view.marketSupply[industry]} ON BOARD / {view.marketReserve[industry]} RESERVE</small>
                    <em>{count} COMPAN{count === 1 ? 'Y' : 'IES'} · {signedDelta} MARGIN EACH</em>
                  </div>;
                })}
              </div>
            </section>
            <section>
              <div className="pk-landscape-section-head"><span className="ig-lab">PRICE TRACKS</span><small>CLAMPED FROM 1 TO 10</small></div>
              <div className="pk-landscape-price-grid">
                {pending.priceTracks.map((price) => {
                  const move = pending.priceMoves[price] ?? 0;
                  const after = view.prices[price];
                  return <span key={price}><small>{price}</small><b>{after - move} → {after}</b><em>{move > 0 ? `+${move}` : String(move)} APPLIED</em></span>;
                })}
              </div>
            </section>
          </div>
        </div>
        {overflow ? <div className="pk-landscape-overflow">
          <div><span className="ig-lab">{mine ? 'YOUR REQUIRED OVERFLOW CHOICE' : `${view.players[overflow.owner]?.name ?? 'COMPANY OWNER'} IS CHOOSING`}</span><b>{overflow.title}</b><p>{overflow.industry.toUpperCase()} Margin reaches {overflow.total}, crossing 9. Choose one compatible on-board Market and reset/continue to Margin {Math.min(9, overflow.total - 10)}, or take no Market and remain at 9.</p></div>
          {mine ? <>
            <div className="pk-landscape-overflow-options">
              <button className={landscapeChoice === 'remain' ? 'on' : ''} onClick={() => setLandscapeChoice('remain')}><b>REMAIN AT 9</b><span>TAKE NO MARKET</span><small>MARGIN 9</small></button>
              {overflow.eligibleIndustries.map((industry) => {
                const available = view.marketSupply[industry];
                return <button key={industry} className={landscapeChoice === industry ? 'on' : ''} disabled={available <= 0} onClick={() => setLandscapeChoice(industry)}><b>TAKE {industry.toUpperCase()}</b><span>1 MARKET · {available} ON BOARD</span><small>MARGIN {Math.min(9, overflow.total - 10)}</small></button>;
              })}
            </div>
            <button className="pk-primary" disabled={!landscapeChoice} onClick={() => send({ type: 'resolve_landscape', choice: landscapeChoice === 'remain' ? null : landscapeChoice })}>CONFIRM {landscapeChoice === 'remain' ? 'REMAIN AT 9' : landscapeChoice ? `TAKE ${landscapeChoice.toUpperCase()} MARKET` : 'OVERFLOW CHOICE'}</button>
          </> : <div className="pk-landscape-waiting"><b>WAITING FOR {view.players[overflow.owner]?.name ?? 'THE COMPANY OWNER'}</b><span>The automatic effects are already visible. This owner’s single overflow choice will continue resolution.</span></div>}
        </div> : <div className="pk-landscape-finishing"><b>NO PLAYER CHOICE REQUIRED</b><span>The automatic Landscape resolution is completing.</span></div>}
      </div>
    );
  }

  if (pending.kind === 'guided') {
    const opPlayer = view.players[opSeat] ?? me;
    const company = opPlayer.companies.some((item) => item.id === opCompany) ? opCompany : opPlayer.companies[0]?.id ?? '';
    const allCompanies = view.players.flatMap((player) => player.companies.map((item) => ({ company: item, player })));
    const projectedMarketSupply = { ...view.marketSupply };
    const projectedMarketReserve = { ...view.marketReserve };
    const projectedCompanyMargins = Object.fromEntries(allCompanies.map(({ company: item }) => [item.id, item.margin])) as Record<string, number>;
    guidedOps.forEach((operation) => {
      if (operation.kind === 'market_supply') {
        projectedMarketSupply[operation.industry] += operation.amount;
        projectedMarketReserve[operation.industry] -= operation.amount;
      } else if (operation.kind === 'market') {
        projectedMarketSupply[operation.industry] -= operation.amount;
      } else if (operation.kind === 'margin') {
        projectedCompanyMargins[operation.company] = (projectedCompanyMargins[operation.company] ?? 0) + operation.amount;
      } else if (operation.kind === 'industry_margin') {
        allCompanies.filter(({ company: item }) => item.industries.includes(operation.industry)).forEach(({ company: item }) => {
          const total = (projectedCompanyMargins[item.id] ?? item.margin) + operation.amount;
          if (operation.amount < 0) projectedCompanyMargins[item.id] = Math.max(0, total);
          else if (total <= 9) projectedCompanyMargins[item.id] = total;
          else {
            const choice = operation.overflowChoices?.[item.id];
            projectedCompanyMargins[item.id] = choice === null ? 9 : Math.min(9, total - 10);
            if (choice) projectedMarketSupply[choice]--;
          }
        });
      }
    });
    const industryCompanies = allCompanies
      .filter(({ company: item }) => item.industries.includes(opIndustry))
      .map(({ company: item, player }) => ({ company: item, player, margin: projectedCompanyMargins[item.id] ?? item.margin }));
    const crossingCompanies = opKind === 'industry_margin' && opAmount > 0
      ? industryCompanies.filter(({ margin }) => margin + opAmount > 9)
      : [];
    const overflowDemand = Object.fromEntries(INDUSTRIES.map((industry) => [industry, crossingCompanies.filter(({ company: item }) => opOverflowChoices[item.id] === industry).length])) as Record<(typeof INDUSTRIES)[number], number>;
    const overflowComplete = crossingCompanies.every(({ company: item }) => !!opOverflowChoices[item.id]);
    const overflowCapacityValid = INDUSTRIES.every((industry) => overflowDemand[industry] <= projectedMarketSupply[industry]);
    const marketSupplyMoveValid = opKind !== 'market_supply' || (opAmount > 0 ? opAmount <= projectedMarketReserve[opIndustry] : -opAmount <= projectedMarketSupply[opIndustry]);
    const guidedOperationKinds: ReadonlyArray<typeof opKind> = ['resource', 'corruption', 'support', 'influence', 'market', 'market_supply', 'industry_margin', 'margin', 'price', 'ready', 'leader', 'draw', 'immunity', 'move_card', ...(clashResume ? ['clash_modifier', 'cancel_clash'] as const : []), 'acknowledge'];
    const readySources = opReadyKind === 'company' ? opPlayer.companies.map((item) => ({ id: item.id, title: item.title }))
      : opReadyKind === 'propaganda' ? opPlayer.propaganda.map((item) => ({ id: item.instanceId, title: item.title }))
        : opReadyKind === 'asset' ? opPlayer.companies.flatMap((item) => item.assets.map((asset) => ({ id: asset.instanceId, title: asset.title })))
          : Object.values(view.locations).filter((item) => item.kind === 'station' && controlledBy(view, item.influence, 'location', item.id) === opSeat).map((item) => ({ id: item.id, title: item.name }));
    const readyId = readySources.some((item) => item.id === opReadyId) ? opReadyId : readySources[0]?.id ?? '';
    const addOperation = () => {
      let operation: GuidedOperation;
      if (opKind === 'resource') operation = { kind: 'resource', seat: opSeat, resource: opResource, amount: opAmount };
      else if (opKind === 'corruption') operation = { kind: 'corruption', seat: opSeat, amount: opAmount };
      else if (opKind === 'support') operation = { kind: 'support', seat: opSeat, ...(supportMode !== 'gain' ? { from: { zone: supportFromZone, id: supportFromId } } : {}), ...(supportMode !== 'lose' ? { to: { zone: supportToZone, id: supportToId } } : {}), amount: Math.max(1, Math.abs(opAmount)) };
      else if (opKind === 'influence') operation = { kind: 'influence', seat: opSeat, location: opLocation, amount: opAmount };
      else if (opKind === 'market') operation = { kind: 'market', seat: opSeat, company, industry: opIndustry, amount: opAmount };
      else if (opKind === 'market_supply') operation = { kind: 'market_supply', industry: opIndustry, amount: opAmount };
      else if (opKind === 'industry_margin') operation = {
        kind: 'industry_margin', industry: opIndustry, amount: opAmount,
        overflowChoices: Object.fromEntries(crossingCompanies.map(({ company: item }) => [item.id, opOverflowChoices[item.id] === 'remain' ? null : opOverflowChoices[item.id] as (typeof INDUSTRIES)[number]])),
      };
      else if (opKind === 'margin') operation = { kind: 'margin', seat: opSeat, company, amount: opAmount };
      else if (opKind === 'price') operation = { kind: 'price', price: opPrice, amount: opAmount };
      else if (opKind === 'ready') operation = { kind: 'ready', seat: opSeat, source: opReadyKind, id: readyId, ready: opReady };
      else if (opKind === 'leader') operation = { kind: 'leader', seat: opSeat, arena: opArena, amount: opAmount };
      else if (opKind === 'draw') operation = { kind: 'draw', seat: opSeat, deck: opDeck, amount: Math.max(1, Math.abs(opAmount)) };
      else if (opKind === 'immunity') operation = { kind: 'immunity', seat: opSeat, active: opImmune };
      else if (opKind === 'move_card') operation = { kind: 'move_card', seat: opSeat, handIndex: opHandIndex, to: opMoveTo };
      else if (opKind === 'clash_modifier') operation = { kind: 'clash_modifier', side: clashModifierSide, amount: opAmount, source: clashModifierSource.trim() || pending.source };
      else if (opKind === 'cancel_clash') operation = { kind: 'cancel_clash', source: clashCancelSource.trim() || pending.source };
      else operation = { kind: 'acknowledge', text: opAcknowledge.trim() };
      setGuidedOps((operations) => [...operations, operation]);
      if (opKind === 'industry_margin') setOpOverflowChoices({});
    };
    return (
      <div className="pk-prompt-card pk-guided-prompt ig-glass">
        <span className="ig-lab">PRINTED CARD RESOLUTION</span>
        <h2>{pending.source}</h2>
        <p>{pending.instruction}</p>
        <div className="pk-guided-builder">
          <label>OPERATION<select value={guidedOperationKinds.includes(opKind) ? opKind : 'resource'} onChange={(event) => { setOpKind(event.target.value as typeof opKind); setOpOverflowChoices({}); }}>{guidedOperationKinds.map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ').toUpperCase()}</option>)}</select></label>
          {!['price', 'market_supply', 'industry_margin', 'clash_modifier', 'cancel_clash', 'acknowledge'].includes(opKind) && <label>NATION<select value={opSeat} onChange={(event) => { setOpSeat(Number(event.target.value)); setOpCompany(''); setOpReadyId(''); }}>{view.players.map((player) => <option key={player.seat} value={player.seat}>{player.name}</option>)}</select></label>}
          {opKind === 'resource' && <label>RESOURCE<select value={opResource} onChange={(event) => setOpResource(event.target.value as typeof opResource)}><option value="capital">CAPITAL</option><option value="carbon">CARBON</option><option value="food">FOOD</option></select></label>}
          {opKind === 'influence' && <label>STATE / STATION<select value={opLocation} onChange={(event) => setOpLocation(event.target.value)}>{Object.values(view.locations).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
          {(opKind === 'market' || opKind === 'margin') && <label>COMPANY<select value={company} onChange={(event) => setOpCompany(event.target.value)}>{opPlayer.companies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
          {['market', 'market_supply', 'industry_margin'].includes(opKind) && <label>INDUSTRY<select value={opIndustry} onChange={(event) => { setOpIndustry(event.target.value as typeof opIndustry); setOpOverflowChoices({}); }}>{INDUSTRIES.map((industry) => <option key={industry} value={industry}>{industry.toUpperCase()} ({projectedMarketSupply[industry]} ON BOARD / {projectedMarketReserve[industry]} RESERVE)</option>)}</select></label>}
          {opKind === 'price' && <label>PRICE TRACK<select value={opPrice} onChange={(event) => setOpPrice(event.target.value as typeof opPrice)}>{PRICE_TRACKS.map((price) => <option key={price} value={price}>{price.toUpperCase()}</option>)}</select></label>}
          {opKind === 'leader' && <label>LEADER ARENA<select value={opArena} onChange={(event) => setOpArena(event.target.value as Arena)}>{ARENAS.map((arena) => <option key={arena} value={arena}>{arena.toUpperCase()}</option>)}</select></label>}
          {opKind === 'draw' && <label>DECK<select value={opDeck} onChange={(event) => setOpDeck(event.target.value as typeof opDeck)}><option value="politik">POLITIK</option><option value="obligation">OBLIGATION</option></select></label>}
          {opKind === 'ready' && <><label>SOURCE TYPE<select value={opReadyKind} onChange={(event) => { setOpReadyKind(event.target.value as typeof opReadyKind); setOpReadyId(''); }}><option value="company">COMPANY</option><option value="asset">ASSET</option><option value="propaganda">PROPAGANDA</option><option value="station">STATION</option></select></label><label>SOURCE<select value={readyId} onChange={(event) => setOpReadyId(event.target.value)}>{readySources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label><label>STATE<select value={opReady ? 'ready' : 'used'} onChange={(event) => setOpReady(event.target.value === 'ready')}><option value="ready">READY</option><option value="used">USED</option></select></label></>}
          {opKind === 'immunity' && <label>IMMUNITY<select value={opImmune ? 'active' : 'inactive'} onChange={(event) => setOpImmune(event.target.value === 'active')}><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select></label>}
          {opKind === 'move_card' && <><label>HAND CARD<select value={opHandIndex} onChange={(event) => setOpHandIndex(Number(event.target.value))}>{(opPlayer.hand ?? []).map((card, index) => <option key={`${card.id}-${index}`} value={index}>{CATALOG[card.id]?.name ?? cardLabel(card, index)}</option>)}</select></label><label>DESTINATION<select value={opMoveTo} onChange={(event) => setOpMoveTo(event.target.value as typeof opMoveTo)}><option value="politik_discard">POLITIK DISCARD</option><option value="obligation_bottom">OBLIGATION BOTTOM</option></select></label></>}
          {opKind === 'clash_modifier' && <><label>CLASH SIDE<select value={clashModifierSide} onChange={(event) => setClashModifierSide(event.target.value as typeof clashModifierSide)}><option value="attacker">ATTACKER</option><option value="defender">DEFENDER</option></select></label><label>PRINTED SOURCE<input value={clashModifierSource} onChange={(event) => setClashModifierSource(event.target.value)} placeholder={pending.source} /></label></>}
          {opKind === 'cancel_clash' && <label>PRINTED CANCELLATION SOURCE<input value={clashCancelSource} onChange={(event) => setClashCancelSource(event.target.value)} placeholder={pending.source} /></label>}
          {opKind === 'acknowledge' && <label>ACKNOWLEDGEMENT<input value={opAcknowledge} onChange={(event) => setOpAcknowledge(event.target.value)} placeholder="Explain the printed result" /></label>}
          {opKind === 'support' && <><label>CHANGE<select value={supportMode} onChange={(event) => setSupportMode(event.target.value as typeof supportMode)}><option value="move">MOVE</option><option value="gain">GAIN</option><option value="lose">LOSE</option></select></label>{supportMode !== 'gain' && <label>FROM<select value={`${supportFromZone}:${supportFromId}`} onChange={(event) => { const [zone, id] = event.target.value.split(':'); setSupportFromZone(zone as 'base' | 'council'); setSupportFromId(id); }}>{BASES.map((id) => <option key={`base:${id}`} value={`base:${id}`}>BASE: {id.toUpperCase()}</option>)}{COUNCIL_SEATS.map((id) => <option key={`council:${id}`} value={`council:${id}`}>COUNCIL: {id.toUpperCase()}</option>)}</select></label>}{supportMode !== 'lose' && <label>TO<select value={`${supportToZone}:${supportToId}`} onChange={(event) => { const [zone, id] = event.target.value.split(':'); setSupportToZone(zone as 'base' | 'council'); setSupportToId(id); }}>{BASES.map((id) => <option key={`base:${id}`} value={`base:${id}`}>BASE: {id.toUpperCase()}</option>)}{COUNCIL_SEATS.map((id) => <option key={`council:${id}`} value={`council:${id}`}>COUNCIL: {id.toUpperCase()}</option>)}</select></label>}</>}
          {!['ready', 'immunity', 'move_card', 'cancel_clash', 'acknowledge'].includes(opKind) && <label>{opKind === 'support' || opKind === 'draw' ? 'AMOUNT' : 'SIGNED AMOUNT'}<input type="number" value={opAmount} onChange={(event) => { setOpAmount(Number(event.target.value)); if (opKind === 'industry_margin') setOpOverflowChoices({}); }} /></label>}
          {opKind === 'market_supply' && <div className={`pk-shared-op-note${marketSupplyMoveValid ? '' : ' invalid'}`}><b>{opAmount > 0 ? 'RESERVE → ON BOARD' : 'ON BOARD → RESERVE'}</b><span>{marketSupplyMoveValid ? `${Math.abs(opAmount)} ${opIndustry.toUpperCase()} Market${Math.abs(opAmount) === 1 ? '' : 'S'} will move between the physical pools.` : `Only ${opAmount > 0 ? projectedMarketReserve[opIndustry] : projectedMarketSupply[opIndustry]} are available in the source pool.`}</span></div>}
          {opKind === 'industry_margin' && <div className="pk-industry-impact">
            <div><span className="ig-lab">ALL {opIndustry.toUpperCase()} COMPANIES</span><small>{opAmount > 0 ? '+' : ''}{opAmount} MARGIN · choose every overflow before adding</small></div>
            {!industryCompanies.length && <p>No current Company has this Industry. The public operation can still be recorded.</p>}
            {industryCompanies.map(({ company: item, player, margin }) => {
              const total = margin + opAmount;
              const crossing = opAmount > 0 && total > 9;
              const choice = opOverflowChoices[item.id] ?? '';
              return <div className={`pk-industry-company${crossing ? ' crossing' : ''}`} key={item.id}>
                <span><b>{item.title}</b><small>{player.name} · {margin === item.margin ? 'MARGIN' : 'PROJECTED MARGIN'} {margin}</small></span>
                {crossing ? <select aria-label={`${item.title} overflow choice`} value={choice} onChange={(event) => setOpOverflowChoices((current) => ({ ...current, [item.id]: event.target.value as typeof choice }))}>
                  <option value="">SELECT OVERFLOW CHOICE</option>
                  <option value="remain">REMAIN AT 9 · TAKE NO MARKET</option>
                  {item.industries.map((industry) => {
                    const selectedElsewhere = overflowDemand[industry] - (choice === industry ? 1 : 0);
                    const available = projectedMarketSupply[industry] - selectedElsewhere;
                    return <option key={industry} value={industry} disabled={available <= 0}>TAKE {industry.toUpperCase()} MARKET · MARGIN {Math.min(9, total - 10)} ({Math.max(0, available)} ON BOARD)</option>;
                  })}
                </select> : <em>MARGIN {opAmount < 0 ? Math.max(0, total) : Math.min(9, total)}</em>}
              </div>;
            })}
          </div>}
          <button onClick={addOperation} disabled={(!opAmount && !['ready', 'immunity', 'move_card', 'cancel_clash', 'acknowledge'].includes(opKind)) || ((opKind === 'market' || opKind === 'margin') && !company) || !marketSupplyMoveValid || (opKind === 'industry_margin' && (!overflowComplete || !overflowCapacityValid)) || (opKind === 'ready' && !readyId) || (opKind === 'move_card' && !(opPlayer.hand ?? [])[opHandIndex]) || (opKind === 'acknowledge' && opAcknowledge.trim().length < 3)}>ADD OPERATION</button>
        </div>
        <div className="pk-guided-ops">
          {guidedOps.map((operation, index) => <button key={index} onClick={() => setGuidedOps((operations) => operations.filter((_, item) => item !== index))}><b>{operation.kind.toUpperCase()}</b><span>{JSON.stringify(operation).replace(/[{}\"]/g, '').replaceAll(',', '  ')}</span><small>REMOVE</small></button>)}
          {!guidedOps.length && <p>Add every gain, loss, movement, market change, margin change, or price change required by the printed card.</p>}
        </div>
        <label>PUBLIC TABLE NOTE / CANCELLATION REASON<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Describe the resolution or name why the printed effect was canceled" /></label>
        <div className="pk-guided-actions"><button data-testid="politik-guided-cancel" disabled={note.trim().length < 3} onClick={() => send({ type: 'resolve_guided', operations: [], note: note.trim(), canceled: true })}><b>MARK PRINTED EFFECT CANCELED</b><small>Requires the public reason above · paid declaration/use costs remain spent</small></button><button className="pk-primary" data-testid="politik-guided-confirm" disabled={!guidedOps.length || (note.trim() || pending.instruction).length < 3} onClick={() => send({ type: 'resolve_guided', operations: guidedOps, note: note.trim() || pending.instruction })}>CONFIRM {guidedOps.length} OPERATIONS</button></div>
      </div>
    );
  }

  if (pending.kind === 'clash') {
    const catalog = (card: HandCard) => CATALOG[card.id];
    const arena = pending.arena;
    const stages = ['after_cost', 'attacker_commit', 'attacker_focus', 'defender_commit', 'defender_focus', 'after_reveal', 'before_resolve'] as const;
    const stageIndex = stages.indexOf(pending.stage);
    const stageLabel: Record<(typeof stages)[number], string> = {
      after_cost: 'AFTER COST · BEFORE FOCUS', attacker_commit: 'ATTACKER · HIDDEN COMMIT', attacker_focus: 'DURING ATTACKER FOCUS',
      defender_commit: 'DEFENDER · HIDDEN COMMIT', defender_focus: pending.defender === null ? 'DURING IMPERIAL FOCUS' : 'DURING DEFENDER FOCUS',
      after_reveal: 'AFTER REVEAL', before_resolve: 'BEFORE RESOLVE',
    };
    const commitmentStage = pending.stage === 'attacker_commit' || pending.stage === 'defender_commit';
    const responseStage = !commitmentStage;
    const attacker = view.players[pending.attacker];
    const defender = pending.defender === null ? null : view.players[pending.defender];
    const corporateTarget = pending.target.arena === 'corporate' ? pending.target : null;
    const targetLabel = pending.target.arena === 'military' ? view.locations[pending.target.location]?.name ?? pending.target.location
      : pending.target.arena === 'political' ? `${pending.target.council.toUpperCase()} · ${defender?.name ?? 'DEFENDER'}`
        : `${view.players.flatMap((player) => player.companies).find((company) => company.id === corporateTarget?.attackerCompany)?.title ?? 'ATTACKER COMPANY'} / ${view.players.flatMap((player) => player.companies).find((company) => company.id === corporateTarget?.defenderCompany)?.title ?? 'DEFENDER COMPANY'}`;
    const printedFocus = (card: HandCard) => card.kind === 'startup' ? 1 : card.kind === 'obligation' ? 0 : catalog(card)?.focus?.[arena] ?? 0;
    const totalFocus = selected.reduce((total, index) => total + (focus[index] ?? printedFocus(hand[index])), 0);
    const adjacentInfluence = arena === 'military' && pending.target.arena === 'military'
      ? (POLITIK_ADJACENCY[pending.target.location] ?? []).map((id) => view.locations[id]).filter((location) => location && controlledBy(view, location.influence, 'location', location.id) === me.seat && location.influence[me.seat] > 0)
      : [];
    const influenceTotal = Object.values(focusInfluence).reduce((total, amount) => total + amount, 0);
    const attackerModifier = pending.modifiers.filter((modifier) => modifier.side === 'attacker').reduce((total, modifier) => total + modifier.amount, 0);
    const defenderModifier = pending.modifiers.filter((modifier) => modifier.side === 'defender').reduce((total, modifier) => total + modifier.amount, 0);
    const revealed = pending.revealedCommitments;
    const commitmentCards = (commitment: typeof pending.yourCommitment | null | undefined) => commitment?.cards ?? [];
    const clashEdgeCards = hand.map((card, index) => ({ card, index, spec: playSpec(card) })).filter((item) => item.spec.kind === 'event');
    const clashEdgeAbilities = [
      ...me.propaganda.map((card) => ({ label: card.title, ready: card.ready, source: { kind: 'propaganda', id: card.instanceId } })),
      ...me.companies.map((card) => ({ label: card.title, ready: card.ready, source: { kind: 'company', id: card.id } })),
      ...me.companies.flatMap((company) => company.assets.map((asset) => ({ label: asset.title, ready: asset.ready, source: { kind: 'asset', id: asset.instanceId } }))),
    ];
    return (
      <div className="pk-prompt-card pk-clash-prompt ig-glass" data-testid="politik-clash-stage">
        <div className="pk-clash-stage-head"><div><span className="ig-lab">{arena.toUpperCase()} CLASH · {targetLabel}</span><h2>{stageLabel[pending.stage]}</h2><p>{pending.reason}</p></div><div><b>{attacker?.name ?? 'ATTACKER'}</b><span>VS</span><b>{defender?.name ?? 'IMPERIALS'}</b></div></div>
        <div className="pk-clash-timeline">{stages.map((stage, index) => <span key={stage} className={index < stageIndex ? 'done' : index === stageIndex ? 'current' : ''}><b>{index + 1}</b><small>{stageLabel[stage]}</small></span>)}</div>
        {commitmentStage && mine ? <>
          <div className="pk-clash-privacy"><b>COMMIT IN SECRET</b><span>Select cards, enter each printed {arena} Focus from the authentic art when needed, then add leaders and legal adjacent Influence. No opponent sees identities or totals before reveal.</span></div>
          <div className="pk-commit-hand">
            {hand.map((card, index) => {
              const on = selected.includes(index);
              const printed = printedFocus(card);
              return (
                <div className="pk-commit-card" key={`${card.id}-${index}`}>
                  <button className={on ? 'on' : ''} disabled={card.kind === 'obligation'} onClick={() => setSelected((list) => on ? list.filter((value) => value !== index) : [...list, index])}>
                    <PolitikCard scene={scene} card={handCardArt(card)} label={cardLabel(card, index)} />
                    <span>{catalog(card)?.name ?? cardLabel(card, index)} <b>{card.kind === 'obligation' ? 'NOT A FOCUS CARD' : card.kind === 'startup' ? 'UNIVERSAL 1 FOCUS' : `${focus[index] ?? printed} FOCUS`}</b></span>
                  </button>
                  <button className="pk-commit-zoom" onClick={() => zoom?.(handCardArt(card), catalog(card)?.name ?? cardLabel(card, index), `${arena.toUpperCase()} FOCUS CARD`)}>VIEW CLOSE UP</button>
                </div>
              );
            })}
          </div>
          {selected.filter((index) => hand[index]?.kind === 'politik').map((index) => <ResourceStepper key={`focus-${index}`} label={`${catalog(hand[index])?.name ?? cardLabel(hand[index], index)} PRINTED ${arena.toUpperCase()} FOCUS · OCR HINT ${printedFocus(hand[index])}`} value={focus[index] ?? printedFocus(hand[index])} max={10} onChange={(value) => setFocus((current) => ({ ...current, [index]: value }))} />)}
          <ResourceStepper label={`${arena.toUpperCase()} LEADERS`} value={leaders} max={me.leaders[arena]} onChange={setLeaders} />
          {arena === 'military' && <div className="pk-adjacent-focus"><span className="ig-lab">SPEND CONTROLLED ADJACENT INFLUENCE</span>{adjacentInfluence.map((location) => <ResourceStepper key={location.id} label={location.name} value={focusInfluence[location.id] ?? 0} max={location.influence[me.seat]} onChange={(value) => setFocusInfluence((current) => ({ ...current, [location.id]: value }))} />)}{!adjacentInfluence.length && <p>No controlled adjacent location can contribute Influence.</p>}</div>}
          <div className="pk-cost-line"><span>PRIVATE TOTAL TO LOCK</span><b>{totalFocus + leaders + influenceTotal}</b></div>
          <button className="pk-primary" data-testid="politik-clash-commit" onClick={() => send({ type: 'clash_commit', cards: selected.map((handIndex) => ({ handIndex, focus: focus[handIndex] ?? printedFocus(hand[handIndex]) })), leaders, focusInfluence })}>LOCK HIDDEN COMMITMENT</button>
        </> : commitmentStage ? <div className="pk-clash-wait"><b>HIDDEN COMMITMENT IN PROGRESS</b><span>{view.players[pending.seat]?.name} is choosing privately. No cards or total are exposed.</span></div> : null}
        {!revealed && pending.yourCommitment && <div className="pk-clash-private-lock"><span className="ig-lab">YOUR LOCKED COMMITMENT · PRIVATE UNTIL REVEAL</span><div>{commitmentCards(pending.yourCommitment).map((entry, index) => <button key={`${entry.card.id}-${index}`} onClick={() => zoom?.(handCardArt(entry.card), catalog(entry.card)?.name ?? cardLabel(entry.card), 'YOUR LOCKED FOCUS CARD')}><PolitikCard scene={scene} card={handCardArt(entry.card)} label={catalog(entry.card)?.name ?? cardLabel(entry.card)} /><small>{entry.focus} FOCUS · VIEW</small></button>)}</div><b>TOTAL {pending.yourCommitment.total}</b></div>}
        {revealed && <div className="pk-clash-reveal"><span className="ig-lab">FOCUS REVEALED · AUTHENTIC COMMITTED CARDS</span>{([['attacker', attacker, revealed.attacker, attackerModifier], ['defender', defender, revealed.defender, defenderModifier]] as const).map(([side, player, commitment, modifier]) => <section key={side}><div><b>{player?.name ?? (side === 'defender' ? 'IMPERIALS' : 'ATTACKER')}</b><span>{commitment?.total ?? 0}{modifier ? ` ${modifier > 0 ? '+' : ''}${modifier}` : ''} = {(commitment?.total ?? 0) + modifier}</span></div><div>{commitmentCards(commitment).map((entry, index) => <button key={`${entry.card.id}-${index}`} onClick={() => zoom?.(handCardArt(entry.card), catalog(entry.card)?.name ?? cardLabel(entry.card), 'REVEALED FOCUS CARD')}><PolitikCard scene={scene} card={handCardArt(entry.card)} label={catalog(entry.card)?.name ?? cardLabel(entry.card)} /><small>{entry.focus} FOCUS · VIEW</small></button>)}</div><small>{commitment?.leaders ?? 0} LEADERS · {Object.values(commitment?.focusInfluence ?? {}).reduce<number>((total, amount) => total + (amount ?? 0), 0)} ADJACENT INFLUENCE</small></section>)}</div>}
        {!!pending.modifiers.length && <div className="pk-clash-modifier-log"><span className="ig-lab">TYPED MODIFIER AUDIT</span>{pending.modifiers.map((modifier, index) => <div key={index}><b>{view.players[modifier.seat]?.name}</b><span>{modifier.side.toUpperCase()} {modifier.amount > 0 ? '+' : ''}{modifier.amount}</span><small>{modifier.source}</small></div>)}</div>}
        {responseStage && <><div className="pk-edge-order">{pending.order.map((seat, index) => <span key={seat} className={index < pending.cursor ? 'passed' : index === pending.cursor ? 'current' : ''}><b>{index + 1}</b><small>{view.players[seat]?.name}</small></span>)}</div>{mine ? <div className="pk-clash-response"><span className="ig-lab">RESPOND WITH EDGE EVENT / ABILITY / MODIFIER / CANCEL · OR PASS</span>{(clashEdgeCards.length > 0 || clashEdgeAbilities.length > 0) && <div className="pk-clash-edge-options">{clashEdgeCards.length > 0 && <div><small>EVENTS IN HAND · inspect authentic card and declare EDGE only for a printed Edge icon</small>{clashEdgeCards.map(({ card, index }) => <button key={`${card.id}-${index}`} onClick={() => inspect?.(card, index)}>{CATALOG[card.id]?.name ?? cardLabel(card, index)}</button>)}</div>}{clashEdgeAbilities.length > 0 && <div><small>CONTROLLED PRINTED EDGE ABILITIES</small>{clashEdgeAbilities.map((ability) => <span key={`${ability.source.kind}-${ability.source.id}`}><b>{ability.label}</b><button onClick={() => send({ type: 'use_ability', source: ability.source, asEdge: true, activate: false })}>NO ACTIVATE</button><button disabled={!ability.ready} onClick={() => send({ type: 'use_ability', source: ability.source, asEdge: true, activate: true })}>{ability.ready ? 'ACTIVATE' : 'USED'}</button></span>)}</div>}</div>}<p className="pk-clash-direct-note">Use direct modifier or cancel only to record a printed result after its Event or Ability costs have been handled.</p><div className="pk-clash-response-fields"><label>MODIFY SIDE<select data-testid="politik-clash-modifier-side" value={clashModifierSide} onChange={(event) => setClashModifierSide(event.target.value as typeof clashModifierSide)}><option value="attacker">{attacker?.name ?? 'ATTACKER'}</option><option value="defender">{defender?.name ?? 'IMPERIALS'}</option></select></label><label>SIGNED FOCUS<input data-testid="politik-clash-modifier-amount" type="number" value={clashModifierAmount} onChange={(event) => setClashModifierAmount(Number(event.target.value))} /></label><label>PRINTED SOURCE<input data-testid="politik-clash-modifier-source" value={clashModifierSource} maxLength={160} onChange={(event) => setClashModifierSource(event.target.value)} placeholder="Name the card or ability" /></label><button data-testid="politik-clash-modifier-submit" disabled={!clashModifierAmount || clashModifierSource.trim().length < 3} onClick={() => send({ type: 'clash_modifier', side: clashModifierSide, amount: clashModifierAmount, source: clashModifierSource.trim() })}>APPLY TYPED FOCUS MODIFIER</button></div><div className="pk-clash-cancel-row"><input data-testid="politik-clash-cancel-source" value={clashCancelSource} maxLength={160} onChange={(event) => setClashCancelSource(event.target.value)} placeholder="Printed Clash cancellation source" /><button data-testid="politik-clash-cancel-submit" disabled={clashCancelSource.trim().length < 3} onClick={() => send({ type: 'cancel_clash', source: clashCancelSource.trim() })}>CANCEL CLASH FROM PRINTED EFFECT</button></div><button className="pk-primary" data-testid="politik-clash-pass" onClick={() => send({ type: 'pass_clash' })}>PASS {stageLabel[pending.stage]}</button></div> : <div className="pk-clash-wait"><b>{view.players[pending.seat]?.name} IS RESPONDING</b><span>Hidden commitments remain private. Revealed cards and typed modifiers stay public.</span></div>}</>}
      </div>
    );
  }

  if (pending.kind === 'corporate_loss') {
    const company = me.companies.find((item) => item.id === pending.loserCompany);
    const winner = view.players.flatMap((player) => player.companies).find((item) => item.id === pending.winnerCompany);
    const marketLoss = Object.values(lossMarkets).reduce((total, amount) => total + (amount ?? 0), 0);
    const allocated = lossMargin + marketLoss;
    const winnerMargin = (winner?.margin ?? 0) + lossMargin;
    return (
      <div className="pk-prompt-card ig-glass">
        <span className="ig-lab">CORPORATE CLASH LOSS</span>
        <h2>TRANSFER {pending.amount}</h2>
        <p>Allocate the full loss between available Margin and Markets. Lost Margin transfers to {winner?.title ?? 'the winning Company'}; compatible Markets transfer there and incompatible Markets return on board. Nothing is committed until the total equals {pending.amount}.</p>
        <ResourceStepper label="MARGIN" value={lossMargin} max={Math.min(pending.amount, company?.margin ?? 0)} onChange={setLossMargin} />
        {INDUSTRIES.filter((industry) => (company?.markets[industry] ?? 0) > 0).map((industry) => <ResourceStepper key={industry} label={`${industry.toUpperCase()} MARKET`} value={lossMarkets[industry] ?? 0} max={Math.min(pending.amount, company?.markets[industry] ?? 0)} onChange={(value) => setLossMarkets((current) => ({ ...current, [industry]: value }))} />)}
        <div className="pk-cost-line"><span>ALLOCATED</span><b>{allocated} / {pending.amount}</b></div>
        <div className="pk-cost-line"><span>WINNING COMPANY MARGIN PREVIEW</span><b>{winner?.margin ?? 0} + {lossMargin} = {winnerMargin}{winnerMargin > 9 ? ' · OVERFLOW CHOICE FOLLOWS' : ''}</b></div>
        <button className="pk-primary" disabled={allocated !== pending.amount} onClick={() => send({ type: 'resolve_corporate_loss', margin: lossMargin, markets: lossMarkets })}>CONFIRM CORPORATE LOSS</button>
      </div>
    );
  }

  if (pending.kind === 'corporate_gain') {
    const winner = me.companies.find((company) => company.id === pending.winnerCompany);
    const marketSummary = INDUSTRIES.filter((industry) => (pending.marketsTransferred[industry] ?? 0) > 0).map((industry) => `${pending.marketsTransferred[industry]} ${industry}`).join(' / ');
    return (
      <div className="pk-prompt-card pk-corporate-gain ig-glass" data-testid="politik-corporate-gain">
        <span className="ig-lab">CORPORATE CLASH · WINNING COMPANY GAIN</span>
        <h2>{winner?.title ?? 'WINNING COMPANY'} CROSSES 9 MARGIN</h2>
        <p>The loser allocated {pending.marginTransferred} Margin{marketSummary ? ` and ${marketSummary} Market` : ''}. That Margin transfers to the winning Company, reaching {pending.total}.</p>
        <div className="pk-cost-line"><span>TRANSFER PREVIEW</span><b>+{pending.marginTransferred} MARGIN · TOTAL {pending.total}</b></div>
        <div className="pk-landscape-overflow-options">
          <button data-testid="politik-corporate-gain-remain" className={corporateGainChoice === 'remain' ? 'on' : ''} onClick={() => setCorporateGainChoice('remain')}><b>REMAIN AT 9</b><span>TAKE NO MARKET</span><small>FINAL MARGIN 9</small></button>
          {pending.eligibleIndustries.map((industry) => <button key={industry} data-testid={`politik-corporate-gain-${industry}`} className={corporateGainChoice === industry ? 'on' : ''} disabled={view.marketSupply[industry] <= 0} onClick={() => setCorporateGainChoice(industry)}><b>TAKE {industry.toUpperCase()}</b><span>1 MARKET · {view.marketSupply[industry]} ON BOARD</span><small>FINAL MARGIN {Math.min(9, pending.total - 10)}</small></button>)}
        </div>
        <button className="pk-primary" data-testid="politik-corporate-gain-confirm" disabled={!corporateGainChoice} onClick={() => send({ type: 'resolve_corporate_gain', choice: corporateGainChoice === 'remain' ? null : corporateGainChoice })}>CONFIRM {corporateGainChoice === 'remain' ? 'REMAIN AT 9' : corporateGainChoice ? `TAKE ${corporateGainChoice.toUpperCase()} MARKET` : 'WINNER CHOICE'}</button>
      </div>
    );
  }

  if (pending.kind === 'trade') {
    const approved = pending.approvals[me.seat];
    return (
      <div className="pk-prompt-card pk-trade-approval ig-glass">
        <span className="ig-lab">PRIVATE EXCHANGE PROPOSAL</span>
        <h2>{view.players[pending.proposer]?.name ?? 'A Nation'} proposes a trade</h2>
        <p>Review every exact item and direction. Acceptance is atomic: either the complete proposal resolves, or nothing moves.</p>
        <div className="pk-transfer-list pk-trade-approval-list">
          {(pending.transfers ?? []).map((transfer, index) => <div className="pk-trade-approval-row" key={index}>
            {transfer.kind === 'hand_card' && transfer.card && <PolitikCard scene={scene} card={handCardArt(transfer.card)} label={tradeCardName(transfer.card, transfer.label) ?? 'Offered card'} />}
            <span><b>{view.players[transfer.from]?.name} → {view.players[transfer.to]?.name}</b><small>{tradeTransferDetail(view, transfer)}</small></span>
          </div>)}
          {!pending.transfers?.length && <p>The private proposal details are unavailable. Do not approve until they appear.</p>}
        </div>
        <div className="pk-trade-approvers">{pending.approvers.map((seat) => <span key={seat} className={pending.approvals[seat] === true ? 'yes' : pending.approvals[seat] === false ? 'no' : ''}><b>{view.players[seat]?.name}</b><small>{pending.approvals[seat] === true ? 'APPROVED' : pending.approvals[seat] === false ? 'DECLINED' : seat === pending.seat ? 'REVIEWING' : 'WAITING'}</small></span>)}</div>
        {approved === undefined ? <div className="pk-prompt-actions"><button onClick={() => send({ type: 'respond_trade', accept: false })}>DECLINE ALL</button><button className="pk-primary" disabled={!pending.transfers?.length} onClick={() => send({ type: 'respond_trade', accept: true })}>ACCEPT EXACT PROPOSAL</button></div> : <p>Your response is locked. Waiting for the other participants.</p>}
      </div>
    );
  }

  if (pending.kind === 'hand_limit') {
    return (
      <div className="pk-prompt-card pk-hand-limit ig-glass">
        <span className="ig-lab">HAND LIMIT 10</span>
        <h2>DISCARD {pending.excess}</h2>
        <div className="pk-commit-hand">
          {hand.map((card, index) => <button key={`${card.id}-${index}`} className={selected.includes(index) ? 'on' : ''} disabled={card.kind === 'obligation' && me.capital < me.corruption * 10} onClick={() => card.kind === 'obligation' ? send({ type: 'shirk_obligation', handIndex: index }) : setSelected((list) => list.includes(index) ? list.filter((value) => value !== index) : list.length < pending.excess ? [...list, index] : list)}><PolitikCard scene={scene} card={handCardArt(card)} label={cardLabel(card, index)} /><span>{CATALOG[card.id]?.name ?? cardLabel(card, index)}{card.kind === 'obligation' && <b>{me.capital >= me.corruption * 10 ? `SHIRK FOR ${me.corruption * 10} CAPITAL` : `NEEDS ${me.corruption * 10} CAPITAL`}</b>}</span></button>)}
        </div>
        <button className="pk-primary" disabled={selected.length !== pending.excess} onClick={() => send({ type: 'discard', handIndices: selected })}>DISCARD SELECTED</button>
      </div>
    );
  }

  return <div className="pk-prompt-wait ig-glass"><span className="ig-lab">SETUP DECISION</span><b>Complete the highlighted setup step.</b></div>;
}

function SetupPanel({ view, me, scene, send, zoom }: {
  view: PolitikView;
  me: PolitikPlayerView;
  scene: NonNullable<ReturnType<typeof usePolitikScene>>;
  send: (action: Record<string, unknown>) => void;
  zoom: (card: PolitikCardLike, label: string, kind?: string) => void;
}) {
  const pending = view.pending;
  const mine = pending?.seat === view.you;
  const [nation, setNation] = useState<string | null>(null);
  const [propaganda, setPropaganda] = useState<string | null>(null);
  const [setupSupport, setSetupSupport] = useState<Record<BaseId, number>>({ capitalism: 0, communism: 0, statism: 0, fascism: 0 });
  const [leaders, setLeaders] = useState<Record<Arena, number>>({ military: 0, political: 0, corporate: 0 });
  const [steelyWitCouncil, setSteelyWitCouncil] = useState<'' | (typeof COUNCIL_SEATS)[number]>('');
  const [exchangeBonus, setExchangeBonus] = useState(false);
  const [setupExchange, setSetupExchange] = useState({ buyFood: 0, sellFood: 0, buyCarbon: 0, sellCarbon: 0 });

  useEffect(() => {
    setNation(null);
    setPropaganda(null);
    setSetupSupport({ capitalism: 0, communism: 0, statism: 0, fascism: 0 });
    setLeaders({ military: 0, political: 0, corporate: 0 });
    setSteelyWitCouncil('');
    setExchangeBonus(false);
    setSetupExchange({ buyFood: 0, sellFood: 0, buyCarbon: 0, sellCarbon: 0 });
  }, [pending?.kind]);

  if (!pending) return null;
  if (!mine) {
    return (
      <div className="pk-setup-overlay">
        <div className="pk-setup-wait ig-glass">
          <img src={scene.logo} alt="Politik" />
          <span className="ig-lab">NATION FORMATION</span>
          <h2>{view.players[pending.seat]?.name ?? 'Another Nation'} is making a private choice</h2>
          <p>Your selections remain hidden until they are confirmed. You can inspect your hand and the reference while you wait.</p>
        </div>
      </div>
    );
  }

  if (pending.kind === 'mulligan') {
    return (
      <div className="pk-setup-overlay">
        <div className="pk-setup-card pk-mulligan ig-glass">
          <span className="ig-lab">SETUP 1 OF 4</span>
          <h1>KEEP OR REPLACE YOUR OPENING HAND</h1>
          <p>You may replace all six opening Politik cards once. Your Startup remains in your hand, and individual Politik cards cannot be kept.</p>
          <div className="pk-setup-hand" data-pk-tutorial="setup-hand">
            {(me.hand ?? []).map((card, index) => <button key={`${card.id}-${index}`} data-testid={`politik-setup-card-zoom-${index}`} onClick={() => zoom(handCardArt(card), CATALOG[card.id]?.name ?? cardLabel(card, index), card.kind === 'startup' ? 'VERIFIED STARTUP' : 'OPENING HAND')}><PolitikCard scene={scene} card={handCardArt(card)} label={cardLabel(card, index)} /><span>{CATALOG[card.id]?.name ?? cardLabel(card, index)}{card.kind === 'startup' ? ' / STARTUP STAYS' : ''}</span><small>VIEW CLOSE UP</small></button>)}
          </div>
          <div className="pk-setup-actions"><button data-testid="politik-setup-mulligan-replace" onClick={() => send({ type: 'mulligan', take: true })}>REPLACE ALL 6 POLITIK CARDS</button><button className="pk-primary" data-testid="politik-setup-mulligan-keep" onClick={() => send({ type: 'mulligan', take: false })}>KEEP THIS HAND</button></div>
        </div>
      </div>
    );
  }

  if (pending.kind === 'nation') {
    const nationDef = nation ? NATION_BY_ID[nation] : null;
    const propagandaChoices = nationDef?.propaganda ?? [];
    const propagandaDef = propaganda ? PROPAGANDA_BY_ID[propaganda] : null;
    const allowedBases = propagandaDef?.bases ?? [];
    const leaderTotal = Object.values(leaders).reduce((total, amount) => total + amount, 0);
    const supportTotal = Object.values(setupSupport).reduce((total, amount) => total + amount, 0);
    const steelyWit = propagandaDef?.id === 'steelyWit';
    const ready = !!nationDef && !!propagandaDef && supportTotal === nationDef.support && leaderTotal === nationDef.leaders && (!steelyWit || !!steelyWitCouncil);
    const changeLeader = (arena: Arena, amount: number) => setLeaders((current) => ({ ...current, [arena]: amount }));
    return (
      <div className="pk-setup-overlay">
        <div className="pk-setup-card pk-nation-setup ig-glass">
          <span className="ig-lab">SETUP 2 OF 4</span>
          <h1>FORM YOUR NATION</h1>
          <div className="pk-nation-columns">
            <section>
              <h3>1. CHOOSE A NATION</h3>
              <p>Your Nation sets opening resources. Selection never locks an arena.</p>
              <div className="pk-choice-cards" data-pk-tutorial="setup-nation-choices">
                {(me.nationChoices ?? []).map((id) => <div className="pk-choice-card" key={id}><button data-testid={`politik-setup-nation-${id}`} className={nation === id ? 'on' : ''} onClick={() => { setNation(id); setPropaganda(null); setSetupSupport({ capitalism: 0, communism: 0, statism: 0, fascism: 0 }); }}><PolitikCard scene={scene} card={setupNationArt(id)} label={NATION_BY_ID[id]?.name ?? id} /><span>{NATION_BY_ID[id]?.name ?? id}</span></button><button className="pk-choice-zoom" data-testid={`politik-setup-nation-zoom-${id}`} onClick={() => zoom(setupNationArt(id), NATION_BY_ID[id]?.name ?? id, 'NATION')}>VIEW CLOSE UP</button></div>)}
              </div>
            </section>
            <section className={!nationDef ? 'locked' : ''}>
              <h3>2. CHOOSE PROPAGANDA</h3>
              <p>Base icons govern opening Support, Rally, and Broadcast strength.</p>
              <div className="pk-choice-cards" data-pk-tutorial="setup-propaganda-choices">
                {propagandaChoices.map((id) => <div className="pk-choice-card" key={id}><button data-testid={`politik-setup-propaganda-${id}`} className={propaganda === id ? 'on' : ''} onClick={() => { setPropaganda(id); setSteelyWitCouncil(''); const bases = PROPAGANDA_BY_ID[id]?.bases ?? []; setSetupSupport({ capitalism: bases.length === 1 && bases[0] === 'capitalism' ? NATION_BY_ID[nation!].support : 0, communism: bases.length === 1 && bases[0] === 'communism' ? NATION_BY_ID[nation!].support : 0, statism: bases.length === 1 && bases[0] === 'statism' ? NATION_BY_ID[nation!].support : 0, fascism: bases.length === 1 && bases[0] === 'fascism' ? NATION_BY_ID[nation!].support : 0 }); }}><PolitikCard scene={scene} card={setupPropagandaArt(id)} label={PROPAGANDA_BY_ID[id]?.name ?? id} /><span>{PROPAGANDA_BY_ID[id]?.name ?? id}</span></button><button className="pk-choice-zoom" data-testid={`politik-setup-propaganda-zoom-${id}`} onClick={() => zoom(setupPropagandaArt(id), PROPAGANDA_BY_ID[id]?.name ?? id, 'STARTING PROPAGANDA')}>VIEW CLOSE UP</button></div>)}
              </div>
            </section>
            <section className={!propagandaDef ? 'locked' : ''}>
              <h3>3. PLACE SUPPORT AND LEADERS</h3>
              <p>{nationDef ? `${nationDef.support} support and ${nationDef.leaders} leaders` : 'Select a Nation first.'}</p>
              <div data-pk-tutorial="setup-support">{BASES.map((base) => <ResourceStepper key={base} label={`${base.toUpperCase()} SUPPORT`} value={setupSupport[base]} max={allowedBases.includes(base) ? nationDef?.support ?? 0 : 0} onChange={(value) => setSetupSupport((current) => ({ ...current, [base]: value }))} />)}</div>
              <div data-pk-tutorial="setup-leaders">{ARENAS.map((arena) => <ResourceStepper key={arena} label={`${arena.toUpperCase()} LEADERS`} value={leaders[arena]} max={nationDef?.leaders ?? 0} onChange={(value) => changeLeader(arena, value)} />)}</div>
              {steelyWit && <label className="pk-steely-choice">STEELY WIT · PRINTED +1 COUNCIL SUPPORT<select data-testid="politik-setup-steely-wit-council" value={steelyWitCouncil} onChange={(event) => setSteelyWitCouncil(event.target.value as typeof steelyWitCouncil)}><option value="">SELECT REQUIRED COUNCIL SEAT</option>{COUNCIL_SEATS.map((council) => <option key={council} value={council}>{council.toUpperCase()}</option>)}</select><small>This is an additional opening Support; your Nation’s normal Support remains in the matching Fascism Base.</small></label>}
              <small>{supportTotal} OF {nationDef?.support ?? 0} SUPPORT / {leaderTotal} OF {nationDef?.leaders ?? 0} LEADERS ASSIGNED</small>
            </section>
          </div>
          <button className="pk-primary pk-setup-confirm" data-testid="politik-setup-nation-confirm" disabled={!ready} onClick={() => send({ type: 'choose_nation', nation, propaganda, support: setupSupport, leaders, ...(steelyWit && steelyWitCouncil ? { steelyWitCouncil } : {}) })}>CONFIRM NATION</button>
        </div>
      </div>
    );
  }

  if (pending.kind === 'setup_bonus') {
    const transactions = [
      setupExchange.buyFood ? { resource: 'food', mode: 'buy', amount: setupExchange.buyFood } : null,
      setupExchange.sellFood ? { resource: 'food', mode: 'sell', amount: setupExchange.sellFood } : null,
      setupExchange.buyCarbon ? { resource: 'carbon', mode: 'buy', amount: setupExchange.buyCarbon } : null,
      setupExchange.sellCarbon ? { resource: 'carbon', mode: 'sell', amount: setupExchange.sellCarbon } : null,
    ].filter(Boolean);
    const capitalAfter = me.capital - setupExchange.buyFood * view.prices.food - setupExchange.buyCarbon * view.prices.carbon + setupExchange.sellFood * view.prices.food + setupExchange.sellCarbon * view.prices.carbon;
    const foodAfter = me.food + setupExchange.buyFood - setupExchange.sellFood;
    const carbonAfter = me.carbon + setupExchange.buyCarbon - setupExchange.sellCarbon;
    return (
      <div className="pk-setup-overlay">
        <div className="pk-setup-card pk-bonus-setup ig-glass" data-pk-tutorial="setup-bonuses">
          <span className="ig-lab">SETUP 3 OF 4</span>
          <h1>CHOOSE YOUR OPENING ADVANTAGE</h1>
          <p>Each option may be claimed only as permitted by the current setup order.</p>
          {!exchangeBonus && <div className="pk-bonus-grid">{pending.available.map((bonus) => <button key={bonus} data-testid={`politik-setup-bonus-${bonus}`} onClick={() => bonus === 'exchange' ? setExchangeBonus(true) : send({ type: 'choose_setup_bonus', bonus })}><b>{bonus.toUpperCase()}</b><span>{bonus === 'capital' ? 'Gain exactly 8 Capital.' : bonus === 'food' ? 'Gain exactly 1 Food.' : bonus === 'carbon' ? 'Gain exactly 1 Carbon.' : bonus === 'research' ? 'Research exactly 1 Politik card.' : 'Resolve one opening Food / Carbon Exchange at current prices.'}</span></button>)}</div>}
          {exchangeBonus && <div className="pk-setup-exchange"><span className="ig-lab">OPENING EXCHANGE</span><ResourceStepper label={`BUY FOOD @ ${view.prices.food}`} value={setupExchange.buyFood} max={Math.min(100, Math.floor(me.capital / view.prices.food))} onChange={(value) => setSetupExchange((current) => ({ ...current, buyFood: value }))} /><ResourceStepper label={`SELL FOOD @ ${view.prices.food}`} value={setupExchange.sellFood} max={Math.min(100, me.food + setupExchange.buyFood)} onChange={(value) => setSetupExchange((current) => ({ ...current, sellFood: value }))} /><ResourceStepper label={`BUY CARBON @ ${view.prices.carbon}`} value={setupExchange.buyCarbon} max={Math.min(100, Math.floor(me.capital / view.prices.carbon))} onChange={(value) => setSetupExchange((current) => ({ ...current, buyCarbon: value }))} /><ResourceStepper label={`SELL CARBON @ ${view.prices.carbon}`} value={setupExchange.sellCarbon} max={Math.min(100, me.carbon + setupExchange.buyCarbon)} onChange={(value) => setSetupExchange((current) => ({ ...current, sellCarbon: value }))} /><div className="pk-cost-line"><span>AFTER EXCHANGE</span><b>{capitalAfter} CAP / {foodAfter} FOOD / {carbonAfter} CARBON</b></div><div className="pk-setup-actions"><button onClick={() => setExchangeBonus(false)}>BACK</button><button className="pk-primary" disabled={!transactions.length || capitalAfter < 0 || foodAfter < 0 || carbonAfter < 0} onClick={() => send({ type: 'choose_setup_bonus', bonus: 'exchange', exchange: transactions })}>CONFIRM EXCHANGE</button></div></div>}
        </div>
      </div>
    );
  }

  if (pending.kind === 'start_state') {
    const dogmatic = me.startingPropaganda === 'dogmatic';
    return (
      <div className="pk-start-state-note ig-glass" data-testid="politik-setup-start-state">
        <span className="ig-lab">SETUP 4 OF 4</span>
        <b>{dogmatic ? 'DOGMATIC · CHOOSE ANY STATE OR X1–X5' : 'CHOOSE YOUR STARTING STATE'}</b>
        <p>{dogmatic ? 'Every ordinary State and Broadcast Station X1–X5 is highlighted. An ordinary State grants its printed benefit; a Broadcast Station start places 8 Influence but explicitly skips the station’s +1 Support capture benefit.' : 'Tap any highlighted ordinary State on the live main board. Its printed benefit resolves immediately.'}</p>
      </div>
    );
  }
  return null;
}

function detectedIndustries(entry: CatalogEntry | undefined): string[] {
  const text = `${entry?.keywordsText ?? ''} ${entry?.rulesText ?? ''}`.toLowerCase();
  const industries = ['media', 'energy', 'financial', 'humanities', 'technology', 'manufacturing'].filter((industry) => text.includes(industry));
  return industries.length ? industries : ['media'];
}

function playSpec(card: HandCard): Record<string, unknown> {
  const startup = card.kind === 'startup' ? STARTUP_BY_ID.get(card.id) : null;
  if (startup) return { kind: 'company', title: startup.name, industries: startup.industries, startingMargin: startup.startingMargin, capitalCost: startup.capitalCost, carbonCost: startup.carbonCost, corruption: startup.corruption };
  const entry = CATALOG[card.id];
  const title = entry?.name ?? titleCase(card.kind);
  if (card.kind === 'obligation' || entry?.type === 'obligation') return { kind: 'obligation', title };
  if (entry?.type === 'asset') return { kind: 'asset', title, industries: detectedIndustries(entry), startingMargin: entry.margin ?? 0 };
  if (entry?.type === 'propaganda') {
    const text = `${entry.keywordsText ?? ''} ${entry.rulesText ?? ''}`.toLowerCase();
    const base = BASES.find((candidate) => text.includes(candidate)) ?? 'capitalism';
    return { kind: 'propaganda', title, base, corruption: text.includes('corruption'), negotiation: text.includes('negotiation') };
  }
  if (entry?.type === 'company') return { kind: 'company', title, industries: detectedIndustries(entry), startingMargin: entry.margin ?? 1 };
  return { kind: 'event', title, edge: false };
}

function controlledBy(view: PolitikView, values: number[], kind: 'location' | 'council' | 'industry', id: string): number | null {
  const max = Math.max(...values);
  if (max <= 0) return null;
  const candidates = values.map((value, seat) => ({ value, seat })).filter((item) => item.value === max).map((item) => item.seat);
  if (candidates.length === 1) return candidates[0];
  const ruling = view.ties.find((tie) => tie.kind === kind && tie.id === id)?.ruling;
  if (ruling !== null && ruling !== undefined && candidates.includes(ruling)) return ruling;
  return candidates.includes(view.finalSay) ? view.finalSay : null;
}

function validRallyAllocation(cards: { bases: BaseId[] }[], gains: Record<BaseId, number>): boolean {
  const tokens = BASES.flatMap((base) => Array.from({ length: gains[base] }, () => base));
  if (tokens.length !== cards.length) return false;
  const used = new Set<number>();
  const assign = (index: number): boolean => {
    if (index === tokens.length) return true;
    for (let card = 0; card < cards.length; card++) {
      if (used.has(card) || !cards[card].bases.includes(tokens[index])) continue;
      used.add(card);
      if (assign(index + 1)) return true;
      used.delete(card);
    }
    return false;
  };
  return assign(0);
}

function NationalPanel({ view, me, send }: { view: PolitikView; me: PolitikPlayerView; send: (action: Record<string, unknown>) => void }) {
  const [kind, setKind] = useState<'income' | 'rally' | 'produce' | 'refresh'>('income');
  const [buyMarket, setBuyMarket] = useState(false);
  const [company, setCompany] = useState(me.companies[0]?.id ?? '');
  const selectedCompany = me.companies.find((item) => item.id === company) ?? me.companies[0];
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number]>(selectedCompany?.industries[0] ?? 'media');
  const [commerceMix, setCommerceMix] = useState({ buyFood: 0, sellFood: 0, buyCarbon: 0, sellCarbon: 0 });
  const defaultRally = Object.fromEntries(BASES.map((base) => [base, me.propaganda.filter((card) => card.bases[0] === base).length])) as Record<BaseId, number>;
  const [rallySupport, setRallySupport] = useState<Record<BaseId, number>>(defaultRally);
  const [produceSupport, setProduceSupport] = useState<Record<BaseId, number>>({ capitalism: 0, communism: 0, statism: 0, fascism: 0 });
  const [chairSeat, setChairSeat] = useState(-1);
  const [chairCouncil, setChairCouncil] = useState<(typeof COUNCIL_SEATS)[number]>('chair');
  const [laborLeader, setLaborLeader] = useState<Arena>('military');
  const [laborPrices, setLaborPrices] = useState<{ price: (typeof PRICE_TRACKS)[number]; amount: number }[]>([
    { price: 'food', amount: -1 }, { price: 'carbon', amount: -1 }, { price: 'research', amount: -1 },
  ]);
  const controlledLocations = Object.values(view.locations).filter((location) => controlledBy(view, location.influence, 'location', location.id) === me.seat);
  const controlledStations = controlledLocations.filter((location) => location.kind === 'station').length;
  const [defenseInfluence, setDefenseInfluence] = useState<Record<string, number>>({});
  const controlledCouncil = COUNCIL_SEATS.filter((seat) => controlledBy(view, view.councilSupport[seat], 'council', seat) === me.seat);
  const controlledIndustries = INDUSTRIES.filter((market) => controlledBy(view, view.players.map((player) => player.companies.reduce((total, item) => total + (item.markets[market] ?? 0), 0)), 'industry', market) === me.seat);
  const projectedIncome = 5 + me.companies.reduce((total, item) => total + item.margin * Object.values(item.markets).reduce((markets, amount) => markets + (amount ?? 0), 0), 0) + controlledIndustries.length * 5;
  const validChairTargets = COUNCIL_SEATS.flatMap((seat) => view.players.filter((player) => view.councilSupport[seat][player.seat] > 0).map((player) => ({ seat: player.seat, council: seat })));
  const selectedChairTarget = validChairTargets.find((target) => target.seat === chairSeat && target.council === chairCouncil);
  const rallyCount = Object.values(rallySupport).reduce((total, value) => total + value, 0);
  const produceCount = Object.values(produceSupport).reduce((total, value) => total + value, 0);
  const defenseCount = Object.values(defenseInfluence).reduce((total, value) => total + value, 0);
  const commerceExchange = [
    commerceMix.buyFood ? { resource: 'food', mode: 'buy', amount: commerceMix.buyFood } : null,
    commerceMix.sellFood ? { resource: 'food', mode: 'sell', amount: commerceMix.sellFood } : null,
    commerceMix.buyCarbon ? { resource: 'carbon', mode: 'buy', amount: commerceMix.buyCarbon } : null,
    commerceMix.sellCarbon ? { resource: 'carbon', mode: 'sell', amount: commerceMix.sellCarbon } : null,
  ].filter(Boolean);
  const commerceCapitalAfter = me.capital - commerceMix.buyFood * view.prices.food - commerceMix.buyCarbon * view.prices.carbon + commerceMix.sellFood * view.prices.food + commerceMix.sellCarbon * view.prices.carbon;
  const commerceFoodAfter = me.food + commerceMix.buyFood - commerceMix.sellFood;
  const commerceCarbonAfter = me.carbon + commerceMix.buyCarbon - commerceMix.sellCarbon;
  const rallyValid = validRallyAllocation(me.propaganda, rallySupport);
  const chairValid = !controlledCouncil.includes('chair') || validChairTargets.length === 0 || !!selectedChairTarget;
  const laborValid = !controlledCouncil.includes('labor') || laborPrices.every((move) => view.prices[move.price] + move.amount >= 1 && view.prices[move.price] + move.amount <= 10);
  const payload: Record<string, unknown> = { type: 'national', action: kind };
  if (kind === 'income') payload.incomeMarket = buyMarket && selectedCompany ? { company: selectedCompany.id, industry } : null;
  if (kind === 'rally') {
    payload.rallySupport = rallySupport;
    if (controlledCouncil.includes('chair') && selectedChairTarget) payload.chair = selectedChairTarget;
    if (controlledCouncil.includes('commerce') && selectedCompany) { payload.commerceMarket = { company: selectedCompany.id, industry }; if (commerceExchange.length) payload.commerceExchange = commerceExchange; }
    if (controlledCouncil.includes('labor')) { payload.laborLeader = laborLeader; payload.laborPrices = laborPrices; }
    if (controlledCouncil.includes('defense')) payload.defenseInfluence = Object.entries(defenseInfluence).filter(([, amount]) => amount > 0).map(([location, amount]) => ({ location, amount }));
  }
  if (kind === 'produce') payload.produceSupport = produceSupport;
  const valid = kind === 'rally' ? rallyValid && chairValid && laborValid && (!controlledCouncil.includes('defense') || controlledLocations.length === 0 || defenseCount === 5) && commerceCapitalAfter >= 0 && commerceFoodAfter >= 0 && commerceCarbonAfter >= 0
    : kind === 'produce' ? produceCount === controlledStations
      : kind === 'income' ? !buyMarket || (!!selectedCompany && me.capital + projectedIncome >= 20 && view.marketSupply[industry] > 0)
        : true;
  return (
    <div className="pk-action-detail">
      <span className="ig-lab">NATIONAL 1</span><h3>RESOLVE A NATIONAL ACTION</h3>
      <p>A used token remains unavailable across turns. When all four tokens have been used, the full set clears together.</p>
      <div className="pk-national-grid">{(['income', 'rally', 'produce', 'refresh'] as const).map((action) => <button key={action} className={kind === action ? 'on' : ''} disabled={me.nationalUsed.includes(action)} onClick={() => setKind(action)}><b>{action.toUpperCase()}</b><small>{action === 'income' ? 'Gain capital, then optionally buy one Market for 20.' : action === 'rally' ? 'Gain Base-matching Support, then resolve controlled council seats.' : action === 'produce' ? 'Resolve controlled State benefits and research occupied Regions.' : 'Advance the Landscape and ready every controlled card.'}</small>{me.nationalUsed.includes(action) && <em>TOKEN UNAVAILABLE</em>}</button>)}</div>
      {kind === 'income' && <div className="pk-national-options"><div className="pk-cost-line"><span>PROJECTED INCOME</span><b>{projectedIncome} CAPITAL</b></div><label className="pk-check"><input type="checkbox" checked={buyMarket} onChange={(event) => setBuyMarket(event.target.checked)} />BUY 1 MARKET FOR 20 AFTER INCOME</label>{buyMarket && <><label>COMPANY<select value={selectedCompany?.id ?? ''} onChange={(event) => { setCompany(event.target.value); const next = me.companies.find((item) => item.id === event.target.value); setIndustry(next?.industries[0] ?? 'media'); }}>{me.companies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>INDUSTRY<select value={industry} onChange={(event) => setIndustry(event.target.value as typeof industry)}>{(selectedCompany?.industries ?? []).map((item) => <option key={item} value={item}>{item.toUpperCase()} ({view.marketSupply[item]} LEFT)</option>)}</select></label></>}</div>}
      {kind === 'rally' && <div className="pk-national-options"><span className="ig-lab">BASE-MATCHING SUPPORT {rallyCount} / {me.propaganda.length}</span>{BASES.map((base) => <ResourceStepper key={base} label={base.toUpperCase()} value={rallySupport[base]} max={me.propaganda.filter((card) => card.bases.includes(base)).length} onChange={(value) => setRallySupport((current) => ({ ...current, [base]: value }))} />)}{!!controlledCouncil.length && <div className="pk-controlled-list"><small>CONTROLLED SEATS RESOLVE LEFT TO RIGHT</small><b>{controlledCouncil.join(' / ')}</b></div>}{controlledCouncil.includes('chair') && validChairTargets.length > 0 && <label>CHAIR REMOVES 1 SUPPORT<select value={selectedChairTarget ? `${selectedChairTarget.seat}:${selectedChairTarget.council}` : ''} onChange={(event) => { const [seat, council] = event.target.value.split(':'); setChairSeat(Number(seat)); setChairCouncil(council as typeof chairCouncil); }}><option value="">SELECT REQUIRED TARGET</option>{validChairTargets.map((target) => <option key={`${target.seat}:${target.council}`} value={`${target.seat}:${target.council}`}>{target.seat === me.seat ? 'YOUR SUPPORT' : view.players[target.seat].name} AT {target.council.toUpperCase()}</option>)}</select></label>}{controlledCouncil.includes('chair') && <p>Chair resolves first and may remove your own Support. This can change which later Council Seats you control; the server rechecks each Seat from left to right.</p>}{controlledCouncil.includes('commerce') && selectedCompany && <><label>COMMERCE COMPANY<select value={selectedCompany.id} onChange={(event) => { setCompany(event.target.value); const next = me.companies.find((item) => item.id === event.target.value); setIndustry(next?.industries[0] ?? 'media'); }}>{me.companies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>COMMERCE MARKET<select value={industry} onChange={(event) => setIndustry(event.target.value as typeof industry)}>{selectedCompany.industries.map((item) => <option key={item} value={item}>{item.toUpperCase()} ({view.marketSupply[item]} LEFT)</option>)}</select></label></>}{controlledCouncil.includes('labor') && <><label>LABOR LEADER<select value={laborLeader} onChange={(event) => setLaborLeader(event.target.value as Arena)}>{ARENAS.map((arena) => <option key={arena} value={arena}>{arena.toUpperCase()}</option>)}</select></label>{laborPrices.map((move, index) => <div className="pk-labor-move" key={index}><select value={move.price} onChange={(event) => setLaborPrices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value as typeof move.price } : item))}>{PRICE_TRACKS.map((price) => <option key={price} value={price}>{price.toUpperCase()}</option>)}</select><select value={move.amount} onChange={(event) => setLaborPrices((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))}><option value={-1}>DOWN 1</option><option value={1}>UP 1</option></select></div>)}</>}{controlledCouncil.includes('intel') && <p>INTEL: Gain 1 Corruption, then Research 1 Politik card. No Obligation is drawn.</p>}{controlledCouncil.includes('defense') && <><span className="ig-lab">DEFENSE INFLUENCE {defenseCount} / 5</span>{controlledLocations.map((location) => <ResourceStepper key={location.id} label={location.name} value={defenseInfluence[location.id] ?? 0} max={5} onChange={(value) => setDefenseInfluence((current) => ({ ...current, [location.id]: value }))} />)}</>}</div>}
      {kind === 'rally' && controlledCouncil.includes('commerce') && <div className="pk-national-options"><span className="ig-lab">COMMERCE OPTIONAL EXCHANGE</span><ResourceStepper label={`BUY FOOD @ ${view.prices.food}`} value={commerceMix.buyFood} max={Math.min(100, Math.floor(me.capital / view.prices.food))} onChange={(value) => setCommerceMix((current) => ({ ...current, buyFood: value }))} /><ResourceStepper label={`SELL FOOD @ ${view.prices.food}`} value={commerceMix.sellFood} max={Math.min(100, me.food + commerceMix.buyFood)} onChange={(value) => setCommerceMix((current) => ({ ...current, sellFood: value }))} /><ResourceStepper label={`BUY CARBON @ ${view.prices.carbon}`} value={commerceMix.buyCarbon} max={Math.min(100, Math.floor(me.capital / view.prices.carbon))} onChange={(value) => setCommerceMix((current) => ({ ...current, buyCarbon: value }))} /><ResourceStepper label={`SELL CARBON @ ${view.prices.carbon}`} value={commerceMix.sellCarbon} max={Math.min(100, me.carbon + commerceMix.buyCarbon)} onChange={(value) => setCommerceMix((current) => ({ ...current, sellCarbon: value }))} /><div className="pk-cost-line"><span>AFTER COMMERCE</span><b>{commerceCapitalAfter} CAP / {commerceFoodAfter} FOOD / {commerceCarbonAfter} CARBON</b></div></div>}
      {kind === 'produce' && <div className="pk-national-options"><p>Every controlled State resolves its printed benefit. Each occupied Region researches one card. Your {controlledStations} controlled Broadcast Stations each create 1 Support to allocate now.</p>{BASES.map((base) => <ResourceStepper key={base} label={base.toUpperCase()} value={produceSupport[base]} max={controlledStations} onChange={(value) => setProduceSupport((current) => ({ ...current, [base]: value }))} />)}<div className="pk-cost-line"><span>STATION SUPPORT</span><b>{produceCount} / {controlledStations}</b></div></div>}
      {kind === 'refresh' && <div className="pk-national-options"><p>The active Landscape resolves, the visible upcoming Landscape becomes active, a new upcoming card is revealed, and all controlled cards and stations become ready.</p></div>}
      {!valid && <div className="pk-disabled-reason">COMPLETE EVERY REQUIRED ALLOCATION WITHIN YOUR AVAILABLE RESOURCES AND TRACK LIMITS.</div>}
      <button className="pk-primary" disabled={!valid || me.nationalUsed.includes(kind)} onClick={() => send(payload)}>CONFIRM {kind.toUpperCase()}</button>
    </div>
  );
}

function ActionPanel({ action, view, me, boardTarget, targetRequest, setTargetRequest, showBroadcastPreview, send, focusHand }: {
  action: MainAction | null;
  view: PolitikView;
  me: PolitikPlayerView;
  boardTarget: string | null;
  targetRequest: BoardTargetRequest;
  setTargetRequest: (request: BoardTargetRequest) => void;
  showBroadcastPreview: (preview: BroadcastBoardPreview | null) => void;
  send: (action: Record<string, unknown>) => void;
  focusHand: () => void;
}) {
  const [amount, setAmount] = useState(1);
  const [leaders, setLeaders] = useState<Record<Arena, number>>({ military: 0, political: 0, corporate: 0 });
  const [campaignBases, setCampaignBases] = useState<Record<BaseId, number>>({ capitalism: 0, communism: 0, statism: 0, fascism: 0 });
  const [exchangeMix, setExchangeMix] = useState({ buyFood: 0, sellFood: 0, buyCarbon: 0, sellCarbon: 0 });
  const [arena, setArena] = useState<Arena>('military');
  const [defender, setDefender] = useState(view.players.find((player) => player.seat !== me.seat)?.seat ?? 0);
  const [attackerCompany, setAttackerCompany] = useState(me.companies[0]?.id ?? '');
  const [defenderCompany, setDefenderCompany] = useState('');
  const [payment, setPayment] = useState<'carbon' | 'leader'>(me.carbon >= view.prices.clash ? 'carbon' : 'leader');
  const [broadcastStation, setBroadcastStation] = useState('');
  const [broadcastMode, setBroadcastMode] = useState<'signal' | 'noise'>('signal');
  const [broadcastBase, setBroadcastBase] = useState<BaseId>('capitalism');

  useEffect(() => {
    setAmount(1);
    setTargetRequest(null);
    showBroadcastPreview(null);
  }, [action, setTargetRequest, showBroadcastPreview]);

  if (!action) {
    return <div className="pk-action-empty"><span className="ig-lab">MAIN ACTION</span><b>Choose an action above.</b><p>Every choice, cost, and required target will appear here before anything is committed.</p></div>;
  }

  if (action === 'play') {
    const companies = view.players.reduce((total, player) => total + player.companies.length, 0);
    return <div className="pk-action-detail"><span className="ig-lab">PLAY 1</span><h3>PLAY A CARD FROM HAND</h3><p>Tap an upright card below to inspect its printed text, focus values, cost, and legal play controls.</p><div className={`pk-company-cap${companies >= 20 ? ' full' : ''}`}><span className="ig-lab">GLOBAL COMPANY BOARDS</span><b>{companies} / 20</b><small>{companies >= 20 ? 'Company cards are disabled until a physical board is free.' : `${20 - companies} remain for every Nation combined.`}</small></div><button data-testid="politik-open-full-hand" onClick={focusHand}>OPEN FULL HAND</button></div>;
  }

  if (action === 'ability') {
    const mine = view.turn === me.seat;
    const sources = [
      ...me.propaganda.map((card) => ({ label: card.title, ready: card.ready, source: { kind: 'propaganda', id: card.instanceId } })),
      ...me.companies.map((card) => ({ label: card.title, ready: card.ready, source: { kind: 'company', id: card.id } })),
      ...me.companies.flatMap((company) => company.assets.map((asset) => ({ label: `${company.title}: ${asset.title}`, ready: asset.ready, source: { kind: 'asset', id: asset.instanceId } }))),
    ];
    const stations = Object.values(view.locations).filter((location) => location.kind === 'station' && controlledBy(view, location.influence, 'location', location.id) === me.seat);
    const station = stations.find((location) => location.id === broadcastStation) ?? stations[0];
    const strength = me.propaganda.filter((card) => card.bases.includes(broadcastBase)).length;
    const regions = new Set(station?.regions ?? []);
    const adjacentStates = Object.values(view.locations).filter((location) => location.kind === 'state' && !!location.region && regions.has(location.region));
    const effects = adjacentStates.map((location) => {
      const controller = controlledBy(view, location.influence, 'location', location.id);
      if (broadcastMode === 'signal') {
        const gain = controller === me.seat ? strength : 0;
        return { id: location.id, detail: gain > 0 ? `SIGNAL +${gain} INFLUENCE` : 'SIGNAL · NO CHANGE' };
      }
      if (controller === null || controller === me.seat) return { id: location.id, detail: 'NOISE · NO OPPOSING CONTROLLER' };
      const target = view.players[controller];
      if (target.immunity.defense || target.immunity.temporary) return { id: location.id, detail: `NOISE BLOCKED · ${target.name} IMMUNE` };
      const defense = target.propaganda.filter((card) => card.bases.includes(broadcastBase)).length;
      const removed = Math.min(Math.max(0, strength - defense), location.influence[controller]);
      return { id: location.id, detail: removed > 0 ? `NOISE −${removed} ${target.name} INFLUENCE` : `NOISE 0 · ${strength} VS ${defense} PROPAGANDA` };
    });
    const changed = effects.filter((effect) => /[+−]\d/.test(effect.detail));
    return <div className="pk-action-detail"><span className="ig-lab">USE 1</span><h3>USE A CONTROLLED ABILITY</h3><p>Read the printed ability. Does it show Activate as a cost? A non-Activate ability can resolve even when its card is already used.</p>{!!sources.length && <div className="pk-detail-list">{sources.map((source) => <div className="pk-ability-row" key={`${source.source.kind}-${source.source.id}`}><span><b>{source.label}</b><small>{source.ready ? 'READY' : 'USED'} {source.source.kind.toUpperCase()}</small></span><button disabled={!mine} onClick={() => send({ type: 'use_ability', source: source.source, activate: false })}>NO ACTIVATE</button><button disabled={!mine || !source.ready} onClick={() => send({ type: 'use_ability', source: source.source, activate: true })}>{source.ready ? 'ACTIVATE' : 'ALREADY USED'}</button></div>)}</div>}{!!stations.length && <div className="pk-broadcast-builder"><div><span className="ig-lab">STRICT BROADCAST STATION ACTION</span><b>SIGNAL OR NOISE</b><small>The server resolves every adjacent ordinary State atomically.</small></div><label>CONTROLLED STATION<select data-testid="politik-broadcast-station" value={station?.id ?? ''} onChange={(event) => { setBroadcastStation(event.target.value); showBroadcastPreview(null); }}>{stations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.stationReady ? 'READY' : 'ACTIVATED'}</option>)}</select></label><div className="pk-broadcast-mode"><button data-testid="politik-broadcast-mode-signal" className={broadcastMode === 'signal' ? 'on' : ''} onClick={() => { setBroadcastMode('signal'); showBroadcastPreview(null); }}><b>SIGNAL</b><small>Add matching strength to your controlled ordinary States in both adjacent Regions.</small></button><button data-testid="politik-broadcast-mode-noise" className={broadcastMode === 'noise' ? 'on' : ''} onClick={() => { setBroadcastMode('noise'); showBroadcastPreview(null); }}><b>NOISE</b><small>Remove the matching Propaganda difference from non-immune opposing ordinary States.</small></button></div><span className="ig-lab">CHOOSE PRINTED BASE · STRENGTH {strength}</span><div className="pk-base-choices">{BASES.map((base) => <button key={base} data-testid={`politik-broadcast-base-${base}`} className={broadcastBase === base ? 'on' : ''} onClick={() => { setBroadcastBase(base); showBroadcastPreview(null); }}>{base.toUpperCase()} · {me.propaganda.filter((card) => card.bases.includes(base)).length}</button>)}</div><div className="pk-broadcast-preview"><span><b>{station?.name ?? 'NO STATION'}</b><small>{station?.regions.join(' + ') ?? 'NO ADJACENT REGIONS'}</small></span><span><b>{changed.length} / {effects.length} STATES CHANGE</b><small>{broadcastMode === 'signal' ? `+${changed.length * strength} TOTAL INFLUENCE PROJECTED` : 'IMMUNITY AND DEFENDING PROPAGANDA INCLUDED'}</small></span></div><button data-testid="politik-broadcast-show-board" disabled={!station} onClick={() => station && showBroadcastPreview({ station: station.id, mode: broadcastMode, base: broadcastBase, effects })}>SHOW PREVIEW ON MAIN BOARD</button><button className="pk-primary" data-testid="politik-broadcast-confirm" disabled={!mine || !station?.stationReady} onClick={() => station && send({ type: 'broadcast', station: station.id, mode: broadcastMode, base: broadcastBase })}>{station?.stationReady ? `CONFIRM ${broadcastMode.toUpperCase()} · ${broadcastBase.toUpperCase()}` : 'STATION ALREADY ACTIVATED'}</button></div>}</div>;
  }

  if (action === 'national') {
    return <NationalPanel view={view} me={me} send={send} />;
  }

  if (action === 'research') {
    const cost = amount * view.prices.research;
    return <div className="pk-action-detail"><span className="ig-lab">RESEARCH X</span><h3>DRAW POLITIK CARDS</h3><p>Pay the current price once for each card. The hand limit is 10.</p><ResourceStepper label="CARDS" value={amount} max={Math.max(1, Math.min(5, Math.floor(me.capital / view.prices.research)))} onChange={setAmount} /><div className="pk-cost-line"><span>TOTAL COST</span><b>{cost} CAPITAL</b></div><button className="pk-primary" disabled={amount < 1 || cost > me.capital} onClick={() => send({ type: 'research', amount })}>RESEARCH {amount}</button></div>;
  }

  if (action === 'educate') {
    const count = Object.values(leaders).reduce((total, value) => total + value, 0);
    const cost = count * view.prices.educate;
    return <div className="pk-action-detail"><span className="ig-lab">EDUCATE X</span><h3>GAIN LEADERS</h3><p>Choose the arena for every leader. Each costs the current Educate price in food.</p>{ARENAS.map((kind) => <ResourceStepper key={kind} label={kind.toUpperCase()} value={leaders[kind]} max={Math.max(0, Math.floor(me.food / view.prices.educate))} onChange={(value) => setLeaders((current) => ({ ...current, [kind]: value }))} />)}<div className="pk-cost-line"><span>{count} LEADERS</span><b>{cost} FOOD</b></div><button className="pk-primary" disabled={!count || cost > me.food} onClick={() => send({ type: 'educate', leaders })}>EDUCATE</button></div>;
  }

  if (action === 'campaign') {
    const support = Object.values(campaignBases).reduce((total, value) => total + value, 0);
    const cost = support * view.prices.campaign;
    return <div className="pk-action-detail"><span className="ig-lab">CAMPAIGN X</span><h3>MOVE SUPPORT TO ONE COUNCIL SEAT</h3><p>Allocate any amount across permitted Bases. Every selected Support moves into the same council seat.</p>{BASES.map((candidate) => <ResourceStepper key={candidate} label={`${candidate.toUpperCase()} (${me.support[candidate]})`} value={campaignBases[candidate]} max={me.support[candidate]} onChange={(value) => setCampaignBases((current) => ({ ...current, [candidate]: value }))} />)}<button className={targetRequest === 'campaign' ? 'on' : ''} onClick={() => setTargetRequest('campaign')}>{boardTarget ? `TARGET: ${titleCase(boardTarget)}` : 'SELECT ONE COUNCIL SEAT ON BOARD'}</button><div className="pk-cost-line"><span>{support} SUPPORT</span><b>{cost} CAPITAL</b></div><button className="pk-primary" disabled={!boardTarget || !support || cost > me.capital} onClick={() => send({ type: 'campaign', council: boardTarget, fromBases: campaignBases })}>CONFIRM CAMPAIGN</button></div>;
  }

  if (action === 'exchange') {
    const transactions = [
      exchangeMix.buyFood ? { resource: 'food', mode: 'buy', amount: exchangeMix.buyFood } : null,
      exchangeMix.sellFood ? { resource: 'food', mode: 'sell', amount: exchangeMix.sellFood } : null,
      exchangeMix.buyCarbon ? { resource: 'carbon', mode: 'buy', amount: exchangeMix.buyCarbon } : null,
      exchangeMix.sellCarbon ? { resource: 'carbon', mode: 'sell', amount: exchangeMix.sellCarbon } : null,
    ].filter(Boolean);
    const capitalAfter = me.capital - exchangeMix.buyFood * view.prices.food - exchangeMix.buyCarbon * view.prices.carbon + exchangeMix.sellFood * view.prices.food + exchangeMix.sellCarbon * view.prices.carbon;
    const foodAfter = me.food + exchangeMix.buyFood - exchangeMix.sellFood;
    const carbonAfter = me.carbon + exchangeMix.buyCarbon - exchangeMix.sellCarbon;
    return (
      <div className="pk-action-detail"><span className="ig-lab">EXCHANGE X</span><h3>BUILD ONE BUY / SELL MIX</h3><p>Combine any number of food and carbon purchases or sales up to the engine bound of 100, then confirm the entire exchange once.</p><ResourceStepper label={`BUY FOOD @ ${view.prices.food}`} value={exchangeMix.buyFood} max={Math.min(100, Math.floor(me.capital / view.prices.food))} onChange={(value) => setExchangeMix((current) => ({ ...current, buyFood: value }))} /><ResourceStepper label={`SELL FOOD @ ${view.prices.food}`} value={exchangeMix.sellFood} max={Math.min(100, me.food + exchangeMix.buyFood)} onChange={(value) => setExchangeMix((current) => ({ ...current, sellFood: value }))} /><ResourceStepper label={`BUY CARBON @ ${view.prices.carbon}`} value={exchangeMix.buyCarbon} max={Math.min(100, Math.floor(me.capital / view.prices.carbon))} onChange={(value) => setExchangeMix((current) => ({ ...current, buyCarbon: value }))} /><ResourceStepper label={`SELL CARBON @ ${view.prices.carbon}`} value={exchangeMix.sellCarbon} max={Math.min(100, me.carbon + exchangeMix.buyCarbon)} onChange={(value) => setExchangeMix((current) => ({ ...current, sellCarbon: value }))} /><div className="pk-cost-line"><span>AFTER EXCHANGE</span><b>{capitalAfter} CAP / {foodAfter} FOOD / {carbonAfter} CARBON</b></div><button className="pk-primary" disabled={!transactions.length || capitalAfter < 0 || foodAfter < 0 || carbonAfter < 0} onClick={() => send({ type: 'exchange', transactions })}>CONFIRM {transactions.length} TRANSACTIONS</button></div>
    );
  }

  const opponents = view.players.filter((player) => player.seat !== me.seat);
  const defenderPlayer = view.players[defender];
  const targetCompanies = defenderPlayer?.companies ?? [];
  const clashTarget = arena === 'military'
    ? boardTarget ? { arena, location: boardTarget } : null
    : arena === 'political'
      ? boardTarget ? { arena, council: boardTarget, defender } : null
      : attackerCompany && defenderCompany ? { arena, attackerCompany, defenderCompany, defender } : null;
  const politicalTargetValid = arena !== 'political' || (!!boardTarget && (view.councilSupport[boardTarget as (typeof COUNCIL_SEATS)[number]]?.[defender] ?? 0) > 0);
  return (
    <div className="pk-action-detail">
      <span className="ig-lab">CLASH 1</span><h3>DECLARE A CLASH</h3><p>Choose an arena and public target. Commitments are selected privately after the declaration.</p>
      <div className="pk-arena-grid">{ARENAS.map((kind) => <button key={kind} className={arena === kind ? 'on' : ''} onClick={() => { setArena(kind); setTargetRequest(kind === 'military' ? 'clash_military' : kind === 'political' ? 'clash_political' : null); }}>{kind.toUpperCase()}</button>)}</div>
      <label>DEFENDER<select value={defender} onChange={(event) => { const seat = Number(event.target.value); setDefender(seat); setDefenderCompany(view.players[seat]?.companies[0]?.id ?? ''); }}>{opponents.map((player) => <option key={player.seat} value={player.seat}>{player.name}</option>)}</select></label>
      {arena !== 'corporate' && <button className={targetRequest ? 'on' : ''} onClick={() => setTargetRequest(arena === 'military' ? 'clash_military' : 'clash_political')}>{boardTarget ? `TARGET: ${titleCase(boardTarget)}` : `SELECT ${arena === 'military' ? 'STATE OR STATION' : 'COUNCIL SEAT'} ON BOARD`}</button>}
      {arena === 'corporate' && <><label>YOUR COMPANY<select value={attackerCompany} onChange={(event) => setAttackerCompany(event.target.value)}>{me.companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}</select></label><label>RIVAL COMPANY<select value={defenderCompany} onChange={(event) => setDefenderCompany(event.target.value)}>{targetCompanies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}</select></label></>}
      <div className="pk-cost-line"><span>DECLARATION COST</span><b>{view.prices.clash} CARBON OR 1 {arena.toUpperCase()} LEADER</b></div>
      <div className="pk-arena-grid"><button className={payment === 'carbon' ? 'on' : ''} disabled={me.carbon < view.prices.clash} onClick={() => setPayment('carbon')}>PAY {view.prices.clash} CARBON</button><button className={payment === 'leader' ? 'on' : ''} disabled={me.leaders[arena] < 1} onClick={() => setPayment('leader')}>SPEND 1 LEADER</button></div>
      {!politicalTargetValid && <div className="pk-disabled-reason">THE SELECTED DEFENDER HAS NO SUPPORT IN THAT COUNCIL SEAT.</div>}
      <button className="pk-primary" disabled={!clashTarget || !politicalTargetValid || (payment === 'carbon' ? me.carbon < view.prices.clash : me.leaders[arena] < 1)} onClick={() => send({ type: 'clash', target: clashTarget, payment })}>DECLARE {arena.toUpperCase()} CLASH</button>
    </div>
  );
}

export function PolitikPlay({ view, act, error }: { view: PolitikView; act: (action: PolitikAction) => void; error: string | null }) {
  const scene = usePolitikScene();
  const me = view.you === null ? null : view.players[view.you];
  const [mode, setMode] = useState<'personal' | 'main'>('personal');
  const [selectedAction, setSelectedAction] = useState<MainAction | null>(null);
  const [targetRequest, setTargetRequest] = useState<BoardTargetRequest>(null);
  const [boardTarget, setBoardTarget] = useState<string | null>(null);
  const [broadcastPreview, setBroadcastPreview] = useState<BroadcastBoardPreview | null>(null);
  const [viewer, setViewer] = useState<ViewerKind | null>(null);
  const [focused, setFocused] = useState<{ card: HandCard; index: number } | null>(null);
  const [zoomedCard, setZoomedCard] = useState<CardZoomTarget | null>(null);
  const [focusTitle, setFocusTitle] = useState('');
  const [focusDeclaredKind, setFocusDeclaredKind] = useState<ManualCardKind>('event');
  const [focusManualOpen, setFocusManualOpen] = useState(false);
  const [focusCost, setFocusCost] = useState(0);
  const [focusCarbonCost, setFocusCarbonCost] = useState(0);
  const [focusCorruptionRequirement, setFocusCorruptionRequirement] = useState(0);
  const [focusCorruption, setFocusCorruption] = useState(false);
  const [focusNegotiation, setFocusNegotiation] = useState(false);
  const [focusSupportBase, setFocusSupportBase] = useState<BaseId>('capitalism');
  const [focusSupportCost, setFocusSupportCost] = useState(1);
  const [focusDeclaredIndustries, setFocusDeclaredIndustries] = useState<(typeof INDUSTRIES)[number][]>([]);
  const [focusStartingMargin, setFocusStartingMargin] = useState(0);
  const [focusRequirementsConfirmed, setFocusRequirementsConfirmed] = useState(false);
  const [focusCompany, setFocusCompany] = useState('');
  const [focusIndustry, setFocusIndustry] = useState<(typeof INDUSTRIES)[number]>('media');
  const [focusReplacement, setFocusReplacement] = useState('');
  const [focusMarginMarket, setFocusMarginMarket] = useState<string>('remain');
  const [eventTiming, setEventTiming] = useState<'main' | 'edge'>('main');
  const [showIntro, setShowIntro] = useState(view.turnNumber <= 1);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<{ seq: number; title: string; detail: string } | null>(null);
  const [guidedClashResume, setGuidedClashResume] = useState(false);

  const send = (action: Record<string, unknown>) => {
    playSfx('click');
    if (view.pending?.kind === 'clash' && view.pending.seat === me?.seat && (action.type === 'play_card' || action.type === 'use_ability')) setGuidedClashResume(true);
    if (action.type === 'resolve_guided') setGuidedClashResume(false);
    act(action as PolitikAction);
  };

  useEffect(() => {
    if (view.pending?.kind !== 'guided') setGuidedClashResume(false);
  }, [view.pending?.kind]);

  useEffect(() => {
    if (view.pending?.kind === 'start_state' && view.pending.seat === view.you) setMode('main');
  }, [view.pending, view.you]);
  useEffect(() => {
    if (targetRequest) {
      setBoardTarget(null);
      setMode('main');
    }
  }, [targetRequest]);
  useEffect(() => {
    if (broadcastPreview) setMode('main');
  }, [broadcastPreview]);
  useEffect(() => {
    const event = view.lastEvent;
    if (!event || event.seat !== view.you) return;
    setReceipt({ seq: event.seq, title: event.title, detail: event.detail });
    const timer = window.setTimeout(() => setReceipt((current) => current?.seq === event.seq ? null : current), 3500);
    setSelectedAction(null);
    setTargetRequest(null);
    setBoardTarget(null);
    setBroadcastPreview(null);
    return () => window.clearTimeout(timer);
  }, [view.lastEvent?.seq, view.you]);
  useEffect(() => { if (error) playSfx('error'); }, [error]);
  useEffect(() => {
    if (!focused || !me) return;
    const spec = playSpec(focused.card);
    const suggestedKind = ['company', 'asset', 'propaganda', 'event'].includes(String(spec.kind)) ? spec.kind as ManualCardKind : 'event';
    const industries = Array.isArray(spec.industries) ? spec.industries as (typeof INDUSTRIES)[number][] : [];
    setFocusTitle(String(spec.title ?? CATALOG[focused.card.id]?.name ?? cardLabel(focused.card, focused.index)));
    setFocusDeclaredKind(suggestedKind);
    setFocusManualOpen(false);
    setFocusCost(Number(spec.capitalCost ?? 0));
    setFocusCarbonCost(Number(spec.carbonCost ?? 0));
    setFocusCorruptionRequirement(Number(spec.corruptionRequirement ?? 0));
    setFocusCorruption(!!spec.corruption);
    setFocusNegotiation(!!spec.negotiation);
    setFocusSupportBase(BASES.includes(spec.base as BaseId) ? spec.base as BaseId : 'capitalism');
    setFocusSupportCost(Number(spec.supportCost ?? 0));
    setFocusDeclaredIndustries(industries);
    setFocusStartingMargin(Number(spec.startingMargin ?? 0));
    setFocusRequirementsConfirmed(false);
    setFocusCompany(me.companies[0]?.id ?? '');
    setFocusIndustry(industries[0] ?? me.companies[0]?.industries[0] ?? 'media');
    setFocusReplacement(me.propaganda[0]?.instanceId ?? '');
    setFocusMarginMarket('remain');
    const interrupt = view.pending?.seat === me.seat && (view.pending.kind === 'edge_window' || (view.pending.kind === 'clash' && view.pending.stage !== 'attacker_commit' && view.pending.stage !== 'defender_commit'));
    setEventTiming(interrupt ? 'edge' : 'main');
  }, [focused?.index]);

  if (!scene || !me) return <div className="page center"><h2>Opening your Nation</h2></div>;

  const tutorialSteps = buildPolitikTutorial({
    phase: view.phase,
    pendingKind: view.pending?.kind,
    players: view.players.length,
    longWar: view.options.longWar,
    trifecta: view.options.trifecta,
    ragingImperials: view.options.ragingImperials,
  });

  const mine = view.turn === me.seat;
  const current = view.players[view.turn];
  const tokens = buildPolitikBoardTokens(scene, view);
  const hotspots: PolitikBoardHotspot[] = [];
  if (view.pending?.kind === 'start_state' && view.pending.seat === me.seat) {
    scene.boardData.states.forEach((state) => hotspots.push({ id: state.id, px: state.px, label: state.name ?? state.id, detail: `START HERE, GAIN ${state.benefit?.toUpperCase()}` }));
    if (me.startingPropaganda === 'dogmatic') scene.boardData.stations.forEach((station) => hotspots.push({ id: station.id, px: station.px, label: station.name ?? station.id, detail: 'DOGMATIC START · 8 INFLUENCE · NO +1 SUPPORT BENEFIT' }));
  } else if (broadcastPreview) {
    const effectById = new Map(broadcastPreview.effects.map((effect) => [effect.id, effect.detail]));
    scene.boardData.states.filter((state) => effectById.has(state.id)).forEach((state) => hotspots.push({ id: state.id, px: state.px, label: state.name ?? state.id, detail: effectById.get(state.id)!, selected: /[+−]\d/.test(effectById.get(state.id)!), disabled: true }));
    const station = scene.boardData.stations.find((item) => item.id === broadcastPreview.station);
    if (station) hotspots.push({ id: station.id, px: station.px, label: station.name ?? station.id, detail: `${broadcastPreview.mode.toUpperCase()} SOURCE · ${broadcastPreview.base.toUpperCase()}`, selected: true, disabled: true });
  } else if (targetRequest === 'campaign' || targetRequest === 'clash_political') {
    scene.boardData.council.forEach((seat) => hotspots.push({ id: seat.id, px: seat.px, label: seat.name ?? seat.id, detail: targetRequest === 'campaign' ? 'CAMPAIGN TARGET' : 'POLITICAL CLASH', selected: boardTarget === seat.id }));
  } else if (targetRequest === 'clash_military') {
    [...scene.boardData.states, ...scene.boardData.stations].forEach((location) => hotspots.push({ id: location.id, px: location.px, label: location.name ?? location.id, detail: 'MILITARY CLASH', selected: boardTarget === location.id }));
  }
  const legalTargets = hotspots.filter((hotspot) => !hotspot.disabled);
  const handleBoardPick = (id: string) => {
    if (view.pending?.kind === 'start_state' && view.pending.seat === me.seat) {
      send({ type: 'choose_start_state', state: id });
      return;
    }
    setBoardTarget(id);
    playSfx('click');
  };

  const nation = me.nation ? NATION_BY_ID[me.nation] : null;
  const startingPropaganda = me.startingPropaganda ? PROPAGANDA_BY_ID[me.startingPropaganda] : null;
  const mat: PolitikMatModel = {
    color: SEAT_HEX[me.color] ?? me.color,
    nation: nation?.card ? { card: nation.card, title: nation.name, kind: 'Nation' } : null,
    propagandaCards: me.propaganda.flatMap((entry) => {
      const card = handCardArt(entry.card);
      return card ? [{ card, title: entry.title, kind: 'Propaganda', ready: entry.ready }] : [];
    }),
    capital: me.capital,
    carbon: me.carbon,
    food: me.food,
    corruption: me.corruption,
    support: me.support,
    leaders: me.leaders,
    companies: me.companies.map((company) => ({
      id: company.id,
      title: company.title,
      card: handCardArt(company.card),
      industries: [...company.industries],
      ready: company.ready,
      markets: Object.fromEntries(Object.entries(company.markets).map(([industry, amount]) => [industry, amount ?? 0])),
      margin: company.margin,
      assets: company.assets.flatMap((asset) => {
        const card = handCardArt(asset.card);
        return card ? [{ card, title: asset.title, kind: 'Asset', ready: asset.ready }] : [];
      }),
    })),
    events: me.eventsInPlay.flatMap((event) => {
      const card = handCardArt(event.card);
      return card ? [{ card, title: event.title, kind: 'Event', ready: event.ready }] : [];
    }),
    stations: Object.values(view.locations).flatMap((location) => {
      if (location.kind !== 'station' || controlledBy(view, location.influence, 'location', location.id) !== me.seat || !location.stationCard) return [];
      const card = politikCardRef(location.stationCard);
      return card ? [{ card, title: location.name, kind: 'Broadcast Station', ready: location.stationReady }] : [];
    }),
    finalSay: me.seat === view.finalSay,
    immunity: me.immunity.defense || me.immunity.temporary,
  };

  const actionLabels: { id: MainAction; label: string; cost: string }[] = [
    { id: 'play', label: 'PLAY', cost: '1 CARD' },
    { id: 'ability', label: 'USE ABILITY', cost: 'READY CARD' },
    { id: 'national', label: 'NATIONAL', cost: '1 ACTION' },
    { id: 'clash', label: 'CLASH', cost: `${view.prices.clash} CARBON / LEADER` },
    { id: 'educate', label: 'EDUCATE', cost: `${view.prices.educate} FOOD EACH` },
    { id: 'research', label: 'RESEARCH', cost: `${view.prices.research} EACH` },
    { id: 'campaign', label: 'CAMPAIGN', cost: `${view.prices.campaign} EACH` },
    { id: 'exchange', label: 'EXCHANGE', cost: 'MARKET PRICE' },
  ];
  const focusStartup = focused?.card.kind === 'startup' ? STARTUP_BY_ID.get(focused.card.id) : null;
  const focusMeta = focused ? CATALOG[focused.card.id] ?? (focusStartup ? { id: focusStartup.id, name: focusStartup.name, type: 'company', costText: String(focusStartup.capitalCost), focus: { military: 1, political: 1, corporate: 1 }, margin: focusStartup.startingMargin, rulesText: `Opening Company. Universal Focus 1. ${focusStartup.industries.map(titleCase).join(', ')}.`, keywordsText: `${focusStartup.industries.map(titleCase).join(' / ')}${focusStartup.corruption ? ' / Corruption' : ''}` } : null) : null;
  const focusSpec = focused ? playSpec(focused.card) : null;
  const focusReason = mainActionReason('play', view, me, mine);
  const focusTargetCompany = me.companies.find((company) => company.id === focusCompany) ?? me.companies[0];
  const focusKind = focused?.card.kind === 'politik' ? focusDeclaredKind : typeof focusSpec?.kind === 'string' ? focusSpec.kind : '';
  const edgeEvent = focusKind === 'event' && eventTiming === 'edge';
  const focusIndustries = focusStartup ? focusStartup.industries : focusDeclaredIndustries;
  const focusAvailableIndustries = focusIndustries.filter((industry) => view.marketSupply[industry] > 0);
  const focusMarketIndustry = focusAvailableIndustries.includes(focusIndustry) ? focusIndustry : focusAvailableIndustries[0] ?? focusIndustries[0];
  const companyBoardCount = view.players.reduce((total, player) => total + player.companies.length, 0);
  const companyCapReached = focusKind === 'company' && companyBoardCount >= 20;
  const ownEdgeWindow = view.pending?.kind === 'edge_window' && view.pending.seat === me.seat;
  const ownClashResponse = view.pending?.kind === 'clash' && view.pending.seat === me.seat && view.pending.stage !== 'attacker_commit' && view.pending.stage !== 'defender_commit';
  const ownInterruptWindow = ownEdgeWindow || ownClashResponse;
  const focusUnverified = focused?.card.kind === 'politik';
  const requirementsReady = !focusUnverified || focusRequirementsConfirmed;
  const focusDisabled = companyCapReached ? 'All 20 physical Company boards are already in play.'
    : !requirementsReady ? 'Enter the printed values for this unverified card.'
      : focusCost > me.capital ? `Needs ${focusCost} capital.`
        : focusCarbonCost > me.carbon ? `Needs ${focusCarbonCost} carbon.`
          : focusCorruptionRequirement > me.corruption ? `Needs at least ${focusCorruptionRequirement} Corruption.`
            : (focusKind === 'company' || focusKind === 'asset') && !focusIndustries.length ? 'Select at least one printed Industry.'
              : focusKind === 'propaganda' && me.support[focusSupportBase] < focusSupportCost ? `Needs ${focusSupportCost} ${focusSupportBase} Support.`
                : edgeEvent ? (ownInterruptWindow ? null : 'No Edge or Clash response window is open for you.') : focusReason;
  const declaredFocusSpec = {
    ...focusSpec,
    kind: focusKind,
    title: focusTitle.trim() || focusMeta?.name || 'CARD',
    capitalCost: focusCost,
    carbonCost: focusCarbonCost,
    corruptionRequirement: focusCorruptionRequirement,
    ...(focusUnverified ? { requirementsConfirmed: focusRequirementsConfirmed } : {}),
    corruption: focusCorruption,
    ...((focusKind === 'company' || focusKind === 'asset') ? { industries: focusIndustries, startingMargin: focusStartingMargin } : {}),
    ...(focusKind === 'propaganda' ? { base: focusSupportBase, supportCost: focusSupportCost, negotiation: focusNegotiation } : {}),
    ...(focusKind === 'event' ? { edge: eventTiming === 'edge' } : {}),
  };
  const shirkCost = me.corruption * 10;
  const openTie = view.ties.find((tie) => tie.ruling === null);
  const winners = view.winners ?? [];
  const winnerNames = winners.map((seat) => view.players[seat]?.name).filter(Boolean).join(' AND ') || 'SESSION COMPLETE';

  return (
    <div className="pk-device" style={{ '--seat': SEAT_HEX[me.color] ?? me.color } as React.CSSProperties}>
      <header className="pk-device-head">
        <div className="pk-identity" data-pk-tour="identity">
          <span className="pk-seat-mark" />
          <div><span className="ig-lab">{me.seat === view.finalSay ? 'FINAL SAY' : `SEAT ${me.seat + 1}`}</span><b>{nation?.name ?? 'FORMING NATION'}</b><small>{startingPropaganda?.name ?? 'PROPAGANDA NOT CHOSEN'}{view.options.longWar ? ' / LONG WAR' : ''}{view.options.trifecta ? ' / TRIFECTA' : ''}{view.options.ragingImperials ? ' / RAGING IMPERIALS' : ''}</small></div>
        </div>
        <div className="pk-head-resources" data-pk-tour="resources">
          <span><small>CAPITAL</small><b>{me.capital}</b></span><span><small>CARBON</small><b>{me.carbon}</b></span><span><small>FOOD</small><b>{me.food}</b></span><span><small>CORRUPTION</small><b>{me.corruption}</b></span><span><small>SUPPORT</small><b>{sum(me.support)}</b></span><span><small>LEADERS</small><b>{sum(me.leaders)}</b></span>
          <span className="pk-grab"><small>POWER GRABS</small><b>{sum(me.powerGrabs)}</b><em>M {me.powerGrabs.military} P {me.powerGrabs.political} C {me.powerGrabs.corporate}</em></span>
        </div>
        <div className={`pk-turn-status${view.phase !== 'ended' && mine ? ' mine' : ''}`} data-pk-tutorial="turn-status"><span className="ig-lab">{view.phase === 'ended' ? 'NEW WORLD ORDER' : mine ? 'YOUR TURN' : 'NOW ACTING'}</span><b>{view.phase === 'ended' ? winnerNames : mine ? `${Math.max(0, view.actionsAllowed - view.actionsTaken)} ACTIONS LEFT` : current?.name}</b></div>
      </header>

      <main className={`pk-device-stage ${view.phase}`} data-pk-tour="board">
        <div className={`pk-scene-layer pk-personal-layer ${mode === 'personal' ? 'active' : 'mini'}`} data-pk-tutorial="personal-tableau" onClick={mode === 'personal' ? undefined : () => setMode('personal')}>
          <PolitikMat scene={scene} model={mat} onInspect={(card, label, kind) => setZoomedCard({ card, label, kind })} />
          {mode !== 'personal' && <span className="pk-mini-label">PERSONAL</span>}
        </div>
        <div className={`pk-scene-layer pk-main-layer ${mode === 'main' ? 'active' : 'mini'}`} data-pk-tutorial="board-map" onClick={mode === 'main' ? undefined : () => setMode('main')}>
          <PolitikTable scene={scene} tokens={tokens} hotspots={hotspots} onPick={handleBoardPick} camera={mode === 'main' ? 'device' : 'mini'} />
          {mode !== 'main' && <span className="pk-mini-label">MAIN BOARD</span>}
        </div>

        <div className="pk-board-switch ig-glass" data-pk-tour="switch">
          <button className={mode === 'personal' ? 'on' : ''} onClick={() => setMode('personal')}>PERSONAL</button>
          <button className={mode === 'main' ? 'on' : ''} onClick={() => setMode('main')}>MAIN BOARD</button>
        </div>

        {mode === 'main' && legalTargets.length > 0 && <div className="pk-legal-targets ig-glass" data-testid="politik-board-legal-targets"><div><span className="ig-lab">LEGAL TARGETS</span><small>TAP A LISTED SPACE OR THE BOARD</small></div><div>{legalTargets.map((target) => <button key={target.id} data-testid={`politik-board-target-${target.id}`} className={target.selected ? 'on' : ''} onClick={() => handleBoardPick(target.id)}><b>{target.label}</b><small>{target.detail}</small></button>)}</div></div>}

        <div className="pk-device-market ig-glass" aria-label="Public Market token pools" data-pk-tutorial="market-pools">
          <div className="pk-device-market-head"><span className="ig-lab">PUBLIC MARKETS</span><small>15 EACH</small></div>
          <div className="pk-device-market-grid">
            {INDUSTRIES.map((industry) => <span key={industry} style={{ borderTopColor: scene.boardData.industries.find((item) => item.id === industry)?.color }}>
              <small>{industry}</small>
              <b>{view.marketSupply[industry]}<em>ON BOARD</em></b>
              <b>{view.marketReserve[industry]}<em>RESERVE</em></b>
            </span>)}
          </div>
        </div>

        {view.phase === 'playing' && (
          <aside className="pk-action-rail ig-glass" data-pk-tour="actions">
            <div className="pk-action-head"><div><span className="ig-lab">MAIN ACTIONS</span><b>{view.actionsTaken} / {view.actionsAllowed} USED</b></div><button onClick={() => setSelectedAction(null)}>CLEAR</button></div>
            <div className="pk-action-grid" data-pk-tutorial="action-grid">
              {actionLabels.map((action) => {
                const reason = mainActionReason(action.id, view, me, mine);
                return <button key={action.id} data-testid={`politik-action-${action.id}`} data-pk-tutorial={action.id === 'educate' ? 'x-actions' : undefined} className={selectedAction === action.id ? 'on' : ''} disabled={!!reason} onClick={() => { setSelectedAction(action.id); setBoardTarget(null); }} title={reason ?? `${action.label}: ${action.cost}`}><b>{action.label}</b><small>{reason ?? action.cost}</small></button>;
              })}
            </div>
            <div className="pk-action-detail-wrap"><ActionPanel key={selectedAction ?? 'none'} action={selectedAction} view={view} me={me} boardTarget={boardTarget} targetRequest={targetRequest} setTargetRequest={setTargetRequest} showBroadcastPreview={setBroadcastPreview} send={send} focusHand={() => setViewer('hand')} /></div>
            <button className="pk-end-turn" data-pk-tour="end" data-testid="politik-end-turn" disabled={!mine || !!view.pending || view.actionsTaken < view.actionsAllowed} onClick={() => send({ type: 'end_turn' })}><span>{mine && view.actionsTaken < view.actionsAllowed ? 'FINISH YOUR MAIN ACTIONS' : 'END TURN'}</span><small>{view.actionsTaken < view.actionsAllowed ? `${view.actionsAllowed - view.actionsTaken} REQUIRED ACTIONS REMAIN` : 'CHECK POWER GRABS AND PASS'}</small></button>
          </aside>
        )}

        {view.pending && (view.phase === 'playing' || view.pending.kind === 'guided' || view.pending.kind === 'landscape') && <PendingPrompt key={`${view.pending.kind}-${view.pending.seat}-${view.pending.kind === 'landscape' ? `${view.pending.overflow?.company ?? 'automatic'}-${view.pending.overflow?.industry ?? ''}-${view.pending.industryIndex}-${view.pending.companyIndex}` : view.pending.kind === 'clash' ? `${view.pending.stage}-${view.pending.cursor}-${view.pending.modifiers.length}` : ''}`} pending={view.pending} view={view} me={me} scene={scene} send={send} inspect={(card, index) => setFocused({ card, index })} zoom={(card, label, kind) => setZoomedCard({ card, label, kind })} clashResume={guidedClashResume} />}
        {view.phase === 'setup' && view.pending?.kind !== 'guided' && view.pending?.kind !== 'landscape' && <SetupPanel view={view} me={me} scene={scene} send={send} zoom={(card, label, kind) => setZoomedCard({ card, label, kind })} />}
        {openTie && me.seat === view.finalSay && (
          <div className="pk-final-say ig-glass">
            <span className="ig-lab">FINAL SAY REQUIRED</span>
            <b>RULE THE {openTie.kind.toUpperCase()} TIE AT {openTie.id.toUpperCase()}</b>
            <p>These Nations share the top value of {openTie.value}. Your ruling persists until the tie changes.</p>
            <div>{openTie.candidates.map((seat) => <button key={seat} style={{ '--seat': SEAT_HEX[view.players[seat].color] ?? view.players[seat].color } as React.CSSProperties} onClick={() => send({ type: 'final_say', contest: openTie.key, winner: seat })}><span className="pk-seat-mark" />{view.players[seat].name}</button>)}</div>
          </div>
        )}
        {view.phase === 'ended' && (
          <div className="pk-end-screen" data-testid="politik-game-ended">
            <div className="pk-end-card pk-device-end-card ig-glass">
              <img src={scene.logo} alt="Politik" />
              <span className="ig-lab">NEW WORLD ORDER</span>
              <h1>{winnerNames}</h1>
              <p>{winners.length > 1 ? 'THE FINAL ORDER IS SHARED.' : winners.includes(me.seat) ? 'YOUR NATION ESTABLISHED THE FINAL ORDER.' : 'THE FINAL ORDER HAS BEEN ESTABLISHED.'}</p>
              <div className="pk-end-score">
                {winners.map((seat) => {
                  const winner = view.players[seat];
                  return winner ? <span key={seat} style={{ '--seat': SEAT_HEX[winner.color] ?? winner.color } as React.CSSProperties}><i className="pk-seat-mark" /><b>{winner.name}</b><small>{sum(winner.powerGrabs)} POWER GRABS · M {winner.powerGrabs.military} · P {winner.powerGrabs.political} · C {winner.powerGrabs.corporate}</small></span> : null;
                })}
              </div>
              <a href="/">RETURN TO GAME LIBRARY</a>
            </div>
          </div>
        )}
        {receipt && <div className="pk-receipt ig-glass" key={receipt.seq}><span>CONFIRMED</span><b>{receipt.title}</b><small>{receipt.detail}</small></div>}
        {error && <div className="pk-error ig-glass"><b>ACTION NOT ACCEPTED</b><span>{error}</span></div>}
      </main>

      <footer className="pk-hand-dock" data-pk-tour="hand">
        <div className="pk-hand-tools" data-pk-tutorial="edge-tools">
          <button onClick={() => setViewer('hand')}><b>HAND</b><small>{me.handCount} CARDS</small></button>
          <button onClick={() => setViewer('decks')}><b>DECKS</b><small>COUNTS</small></button>
          <button data-testid="politik-open-trade" disabled={!!view.pending && !ownInterruptWindow} onClick={() => setViewer('trade')}><b>TRADE</b><small>{ownInterruptWindow ? `${ownClashResponse ? 'CLASH' : 'EDGE'} RESPONSE · RESUMES` : 'PROPOSE'}</small></button>
          <button data-testid="politik-open-responses" disabled={!!view.pending} onClick={() => send({ type: 'open_edge_window', reason: `${me.name} requested an at-any-time Edge response` })}><b>RESPONSES</b><small>OPEN · REQUESTER ACTS FIRST</small></button>
          <button data-pk-tour="help" data-testid="politik-open-help" onClick={() => setViewer('reference')}><b>HELP</b><small>RULES + CARDS</small></button>
        </div>
        <div className="pk-hand-scroll">
          {(me.hand ?? []).map((card, index) => <button key={`${card.id}-${index}`} className={focused?.index === index ? 'on' : ''} onClick={() => setFocused({ card, index })}><PolitikCard scene={scene} card={handCardArt(card)} label={cardLabel(card, index)} /><span>{CATALOG[card.id]?.name ?? cardLabel(card, index)}</span><small>{CATALOG[card.id]?.type?.toUpperCase() ?? card.kind.toUpperCase()}</small></button>)}
          {!me.handCount && <div className="pk-empty-hand"><b>YOUR HAND IS EMPTY</b><span>Use tableau abilities or another legal main action.</span></div>}
        </div>
      </footer>

      {focused && (
        <div className="pk-focus-backdrop" onClick={() => setFocused(null)}>
          <div className="pk-focus-card ig-glass" onClick={(event) => event.stopPropagation()}>
            <button className="pk-focus-art-button" data-testid="politik-focus-card-zoom" onClick={() => setZoomedCard({ card: handCardArt(focused.card), label: focusTitle || focusMeta?.name || cardLabel(focused.card, focused.index), kind: focusUnverified ? 'UNVERIFIED POLITIK CARD' : focusMeta?.type?.toUpperCase() ?? focused.card.kind.toUpperCase() })} aria-label="View this card close up"><PolitikCard scene={scene} card={handCardArt(focused.card)} label={cardLabel(focused.card, focused.index)} /><span>VIEW CARD CLOSE UP</span></button>
            <div className="pk-focus-info">
              <span className="ig-lab">{focusUnverified ? 'UNVERIFIED POLITIK CARD' : focusMeta?.type?.toUpperCase() ?? focused.card.kind.toUpperCase()}</span>
              <h2>{focusTitle || focusMeta?.name || cardLabel(focused.card, focused.index)}</h2>
              {focusStartup && <div className="pk-exact-card-data"><span className="ig-lab">VERIFIED STARTUP DATA</span><p>{focusMeta?.rulesText}</p><small>Costs, Industries, Margin, Corruption, and universal Focus 1 are locked to verified structured data.</small></div>}
              {focused.card.kind === 'obligation' && <div className="pk-exact-card-data"><span className="ig-lab">OBLIGATION</span><p>Return this card to the bottom of the Obligation deck by paying the live Shirk cost below.</p></div>}
              {focusUnverified && <>
                <div className="pk-ocr-hint"><span className="ig-lab">OPTIONAL OCR HINT · NEVER ENFORCED</span><p>{focusMeta?.rulesText ?? 'No transcription hint is available. Read the authentic card art.'}</p><small>COST HINT: {focusMeta?.costText || 'UNAVAILABLE'}{focusMeta?.keywordsText ? ` · KEYWORD HINT: ${focusMeta.keywordsText}` : ''}</small><b>Use the card art. Manual values override this hint completely.</b></div>
                {focusMeta?.focus && <div className="pk-focus-values"><span className="pk-focus-hint-label">OCR FOCUS HINT</span>{ARENAS.map((arena) => <span key={arena}><small>{arena}</small><b>{focusMeta.focus?.[arena] ?? 0}</b></span>)}</div>}
                <div className={`pk-manual-card-status${focusRequirementsConfirmed ? ' ready' : ''}`}>
                  <div><span className="ig-lab">{focusRequirementsConfirmed ? 'MANUAL VALUES READY' : 'UNVERIFIED DIGITAL CARD'}</span><b>{focusRequirementsConfirmed ? `${titleCase(focusKind)} · ${focusCost} CAPITAL · ${focusCarbonCost} CARBON` : 'ENTER THE VALUES THAT MATTER FOR THIS PLAY'}</b><p>{focusRequirementsConfirmed ? 'These values, not the OCR hint, will be sent to the rules engine.' : 'You only do this for cards without verified structured data. Read the authentic art, enter its type and printed costs, then continue.'}</p></div>
                  <button data-testid="politik-card-manual-toggle" onClick={() => setFocusManualOpen((open) => !open)}>{focusManualOpen ? 'HIDE MANUAL ENTRY' : focusRequirementsConfirmed ? 'EDIT MANUAL VALUES' : 'ENTER PRINTED VALUES'}</button>
                </div>
                {focusManualOpen && <div className="pk-manual-card-editor" data-testid="politik-card-manual-editor">
                  <label>CARD NAME FOR TABLE LOG<input value={focusTitle} maxLength={100} onChange={(event) => { setFocusTitle(event.target.value); setFocusRequirementsConfirmed(false); }} /></label>
                  <label>HOW THIS CARD ENTERS PLAY<select value={focusDeclaredKind} onChange={(event) => { setFocusDeclaredKind(event.target.value as ManualCardKind); setFocusRequirementsConfirmed(false); }}><option value="company">COMPANY</option><option value="asset">ASSET</option><option value="propaganda">PROPAGANDA</option><option value="event">EVENT</option></select></label>
                  <ResourceStepper label="PRINTED CAPITAL COST" value={focusCost} max={Math.max(100, me.capital)} onChange={(value) => { setFocusCost(value); setFocusRequirementsConfirmed(false); }} />
                  <ResourceStepper label="PRINTED CARBON COST" value={focusCarbonCost} max={10} onChange={(value) => { setFocusCarbonCost(value); setFocusRequirementsConfirmed(false); }} />
                  <ResourceStepper label={`MINIMUM CORRUPTION REQUIRED (${me.corruption} CURRENT)`} value={focusCorruptionRequirement} max={20} onChange={(value) => { setFocusCorruptionRequirement(value); setFocusRequirementsConfirmed(false); }} />
                  <label>CORRUPTION EFFECT ICON<select value={focusCorruption ? 'yes' : 'no'} onChange={(event) => { setFocusCorruption(event.target.value === 'yes'); setFocusRequirementsConfirmed(false); }}><option value="no">NO CORRUPTION EFFECT</option><option value="yes">GAIN 1 CORRUPTION + DRAW OBLIGATION</option></select></label>
                  {(focusKind === 'company' || focusKind === 'asset') && <div className="pk-printed-industries"><span className="ig-lab">PRINTED INDUSTRIES</span><div>{INDUSTRIES.map((industry) => <button key={industry} className={focusIndustries.includes(industry) ? 'on' : ''} onClick={() => { setFocusDeclaredIndustries((current) => current.includes(industry) ? current.filter((item) => item !== industry) : [...current, industry]); setFocusRequirementsConfirmed(false); }}>{industry.toUpperCase()}</button>)}</div><ResourceStepper label="PRINTED MARGIN" value={focusStartingMargin} max={9} onChange={(value) => { setFocusStartingMargin(value); setFocusRequirementsConfirmed(false); }} /></div>}
                  {focusKind === 'propaganda' && <div className="pk-propaganda-requirements"><label>SUPPORT COMES FROM<select value={focusSupportBase} onChange={(event) => { setFocusSupportBase(event.target.value as BaseId); setFocusRequirementsConfirmed(false); }}>{BASES.map((base) => <option key={base} value={base}>{base.toUpperCase()} · {me.support[base]} AVAILABLE</option>)}</select></label><ResourceStepper label="PRINTED SUPPORT COST" value={focusSupportCost} max={10} onChange={(value) => { setFocusSupportCost(value); setFocusRequirementsConfirmed(false); }} /><label>NEGOTIATION ICON<select value={focusNegotiation ? 'yes' : 'no'} onChange={(event) => { setFocusNegotiation(event.target.value === 'yes'); setFocusRequirementsConfirmed(false); }}><option value="no">NO NEGOTIATION</option><option value="yes">HAS NEGOTIATION</option></select></label></div>}
                  {focusKind === 'event' && <label>EVENT TIMING<select value={eventTiming} onChange={(event) => { setEventTiming(event.target.value as typeof eventTiming); setFocusRequirementsConfirmed(false); }}><option value="main">MAIN ACTION EVENT</option><option value="edge">EDGE EVENT</option></select><small>Choose Edge only if the authentic card shows the Edge icon.</small></label>}
                  <button className="pk-primary" data-testid="politik-card-manual-confirm" disabled={!focusTitle.trim() || ((focusKind === 'company' || focusKind === 'asset') && !focusIndustries.length)} onClick={() => { setFocusRequirementsConfirmed(true); setFocusManualOpen(false); }}>USE THESE PRINTED VALUES</button>
                </div>}
              </>}
              {requirementsReady && focusKind === 'asset' && <label>TARGET COMPANY<select value={focusTargetCompany?.id ?? ''} onChange={(event) => setFocusCompany(event.target.value)}>{me.companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}</select></label>}
              {requirementsReady && focusKind === 'company' && <div className={`pk-company-cap${companyCapReached ? ' full' : ''}`}><span className="ig-lab">GLOBAL COMPANY BOARD LIMIT</span><b>{companyBoardCount} / 20 IN PLAY</b><small>{companyCapReached ? 'No Company can enter play until a physical Company board becomes available.' : `${20 - companyBoardCount} physical Company board${20 - companyBoardCount === 1 ? '' : 's'} remain.`}</small></div>}
              {requirementsReady && focusKind === 'company' && focusIndustries.length > 0 && <label>OPENING MARKET<select value={focusMarketIndustry ?? ''} onChange={(event) => setFocusIndustry(event.target.value as typeof focusIndustry)}>{focusIndustries.map((industry) => <option key={industry} value={industry} disabled={view.marketSupply[industry] <= 0}>{industry.toUpperCase()} ({view.marketSupply[industry]} ON BOARD)</option>)}</select><small>If every matching on-board Market is empty, the Company enters without one.</small></label>}
              {requirementsReady && focusKind === 'asset' && focusTargetCompany && focusTargetCompany.margin + focusStartingMargin > 9 && <label>MARGIN ABOVE 9<select value={focusMarginMarket} onChange={(event) => setFocusMarginMarket(event.target.value)}><option value="remain">REMAIN AT 9</option>{focusTargetCompany.industries.map((industry) => <option key={industry} value={industry} disabled={view.marketSupply[industry] <= 0}>TAKE 1 {industry.toUpperCase()} MARKET ({view.marketSupply[industry]} ON BOARD)</option>)}</select></label>}
              {requirementsReady && focusKind === 'propaganda' && me.propaganda.length >= 4 && <label>REPLACE PROPAGANDA<select value={focusReplacement} onChange={(event) => setFocusReplacement(event.target.value)}>{me.propaganda.map((card) => <option key={card.instanceId} value={card.instanceId}>{card.title}</option>)}</select></label>}
              {focused.card.kind === 'obligation' && <div className="pk-cost-line"><span>SHIRK COST AT CORRUPTION {me.corruption}</span><b>{shirkCost} CAPITAL</b></div>}
              {focused.card.kind === 'obligation' ? <button className="pk-primary" data-testid="politik-shirk-obligation" disabled={(!ownInterruptWindow && !!view.pending && view.pending.kind !== 'hand_limit') || me.capital < shirkCost} onClick={() => send({ type: 'shirk_obligation', handIndex: focused.index })}>{me.capital < shirkCost ? `NEEDS ${shirkCost} CAPITAL` : ownInterruptWindow ? `SHIRK · RETURN TO ${ownClashResponse ? 'CLASH' : 'EDGE'} RESPONSE` : 'SHIRK OBLIGATION'}</button> : requirementsReady ? <button className="pk-primary" data-testid="politik-play-card-confirm" disabled={!!focusDisabled || (focusKind === 'asset' && !focusTargetCompany) || (focusKind === 'company' && focusIndustries.some((industry) => view.marketSupply[industry] > 0) && !focusMarketIndustry) || (focusKind === 'propaganda' && me.propaganda.length >= 4 && !focusReplacement)} title={focusDisabled ?? 'Play this card'} onClick={() => send({ type: 'play_card', handIndex: focused.index, spec: declaredFocusSpec, ...(focusKind === 'asset' && focusTargetCompany ? { targetCompany: focusTargetCompany.id, marginMarket: focusMarginMarket === 'remain' ? null : focusMarginMarket } : {}), ...(focusKind === 'company' && focusMarketIndustry ? { marketIndustry: focusMarketIndustry } : {}), ...(focusKind === 'propaganda' && me.propaganda.length >= 4 ? { replacePropaganda: focusReplacement } : {}) })}>{focusDisabled ? focusDisabled.toUpperCase() : edgeEvent ? 'PLAY EDGE EVENT' : 'PLAY THIS CARD'}</button> : null}
              <button onClick={() => setFocused(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {viewer && <Viewer kind={viewer} scene={scene} view={view} me={me} close={() => setViewer(null)} focus={(card, index) => { setViewer(null); setFocused({ card, index }); }} zoom={(card, label, kind) => setZoomedCard({ card, label, kind })} showGoal={() => { setViewer(null); setShowIntro(true); }} startTour={() => { setViewer(null); setTourStep(0); }} send={send} />}
      {showIntro && <GameIntro intro={POLITIK_INTRO} onClose={() => setShowIntro(false)} onWalkthrough={() => { setShowIntro(false); setTourStep(0); }} />}
      {tourStep !== null && <TourOverlay steps={tutorialSteps} step={tourStep} setStep={setTourStep} setMode={setMode} close={() => setTourStep(null)} />}
      {zoomedCard && <CardZoom scene={scene} target={zoomedCard} close={() => setZoomedCard(null)} />}
    </div>
  );
}
