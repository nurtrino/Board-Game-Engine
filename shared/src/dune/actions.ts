// Dune: Imperium — action reducer. Full rules enforcement per
// docs/specs/dune-imperium.md: agent placement (icons, occupancy, costs,
// requirements), reveal/acquire, influence tracks (VP at 2, bonus + alliance
// at 4), intrigue (plot/combat/endgame), combat resolution with tie rules,
// makers, control flags, leader passives + signets, and endgame tiebreaks.
// Card effects come from the transcribed goldens; multi-step effects resolve
// through a pending-decision queue so every choice is an explicit action.

import {
  CARD_BY_ID, CONFLICT_BY_ID, DUNE_RULES, FACTIONS, INFLUENCE_BONUS_AT_4,
  INTRIGUE_BY_ID, LEADER_BY_ID, SELL_MELANGE, SPACE_BY_ID,
  drawCards, duneRoll, duneShuffle, strengthOf,
  type DuneState, type DunePlayer, type Faction, type PendingDecision, type CardDef,
} from './state.js';

export type DuneAction =
  | { type: 'pick_leader'; leader: string }
  | { type: 'agent'; card: string; space: string; deploy?: number; sell?: number; useOptional?: boolean }
  | { type: 'reveal' }
  | { type: 'acquire'; row?: number; reserve?: 'foldspace' | 'arrakisLiaison' | 'theSpiceMustFlow'; helena?: boolean }
  | { type: 'intrigue'; card: string; deploy?: number }
  | {
      type: 'choose';
      faction?: Faction; factions?: Faction[];
      space?: string; card?: string; seat?: number;
      option?: number; options?: number[];
      accept?: boolean;
    }
  | { type: 'combat_pass' }
  | { type: 'end_turn' };

export interface DuneResult { ok: boolean; error?: string }
// Player-facing alerts stay serious: capitalise the first letter and never
// show an em dash (the device renders these verbatim in the error toast).
const err = (error: string): DuneResult => ({
  ok: false,
  error: error.replace(/\s+—\s+/g, ', ').replace(/^\p{Ll}/u, (c) => c.toUpperCase()),
});

let eventSeq = 1;
function event(s: DuneState, p: DunePlayer, title: string, detail = ''): void {
  s.lastEvent = { seq: eventSeq++, color: p.color, player: p.name, title, detail };
  s.log.push(`${p.name}: ${title}${detail ? ` — ${detail}` : ''}`);
}

const allCardsOf = (p: DunePlayer, id: string): number =>
  [...p.deck, ...p.hand, ...p.discard, ...p.inPlay].filter((c) => c === id).length;

// ---------- influence ----------

function checkAlliance(s: DuneState, f: Faction): void {
  const holder = s.players.find((p) => p.alliances.includes(f)) ?? null;
  const atFour = s.players.filter((p) => p.influence[f] >= DUNE_RULES.allianceAt4);
  if (!atFour.length) {
    if (holder) holder.alliances = holder.alliances.filter((x) => x !== f);
    return;
  }
  const top = Math.max(...atFour.map((p) => p.influence[f]));
  if (holder) {
    // the holder keeps the alliance on ties; loses only to strictly more
    const challengers = atFour.filter((p) => p.influence[f] > holder.influence[f]);
    if (!challengers.length) return;
    holder.alliances = holder.alliances.filter((x) => x !== f);
    if (challengers.length === 1) challengers[0].alliances.push(f);
  } else {
    const best = atFour.filter((p) => p.influence[f] === top);
    if (best.length === 1) best[0].alliances.push(f);
  }
}

function gainInfluence(s: DuneState, p: DunePlayer, f: Faction, n: number): void {
  const before = p.influence[f];
  p.influence[f] = Math.max(0, Math.min(6, before + n));
  const after = p.influence[f];
  if (before < 2 && after >= 2) { p.vp++; s.log.push(`${p.name}: +1 VP (${f} influence)`); }
  if (before >= 2 && after < 2) { p.vp = Math.max(0, p.vp - 1); s.log.push(`${p.name}: -1 VP (${f} influence lost)`); }
  if (before < 4 && after >= 4) {
    const bonus = INFLUENCE_BONUS_AT_4[f] ?? {};
    if (bonus.troops) recruit(s, p, bonus.troops);
    if (bonus.solari) p.solari += bonus.solari;
    if (bonus.water) p.water += bonus.water;
    if (bonus.intrigue) drawIntrigue(s, p, bonus.intrigue);
  }
  checkAlliance(s, f);
}

// ---------- small helpers ----------

function recruit(s: DuneState, p: DunePlayer, n: number): number {
  const take = Math.min(n, p.supply);
  p.supply -= take;
  p.garrison += take;
  return take;
}

function drawIntrigue(s: DuneState, p: DunePlayer, n: number): void {
  for (let i = 0; i < n; i++) {
    if (!s.intrigueDeck.length) {
      if (!s.intrigueDiscard.length) return;
      s.intrigueDeck = duneShuffle(s, s.intrigueDiscard);
      s.intrigueDiscard = [];
    }
    p.intrigue.push(s.intrigueDeck.shift()!);
  }
}

function push(s: DuneState, seat: number, decision: PendingDecision['decision']): void {
  s.pending.push({ seat, decision });
}

function factionCardsInPlay(p: DunePlayer, faction: string): number {
  return p.inPlay.filter((id) => {
    const f = CARD_BY_ID[id]?.faction;
    return f === faction || (Array.isArray(f) && f.includes(faction));
  }).length;
}

const isCity = (spaceId: string) => SPACE_BY_ID[spaceId]?.icon === 'city';
const isLandsraad = (spaceId: string) => SPACE_BY_ID[spaceId]?.icon === 'landsraad';

/** Apply a generic reward bag (space rewards, conflict rewards, card boxes). */
function applyRewards(s: DuneState, p: DunePlayer, r: Record<string, unknown>, label: string): { recruited: number } {
  let recruited = 0;
  if (typeof r.solari === 'number') p.solari += r.solari;
  if (typeof r.spice === 'number') p.spice += r.spice;
  if (typeof r.water === 'number') p.water += r.water;
  if (typeof r.troops === 'number') recruited += recruit(s, p, r.troops);
  if (typeof r.draw === 'number') drawCards(s, p, r.draw);
  if (typeof r.intrigue === 'number') drawIntrigue(s, p, r.intrigue);
  if (typeof r.vp === 'number') p.vp += r.vp;
  if (typeof r.persuasion === 'number') p.persuasion += r.persuasion;
  if (typeof r.revealPersuasion === 'number') p.persuasion += r.revealPersuasion;
  if (typeof r.swords === 'number') p.swords += r.swords;
  if (r.influence && typeof r.influence === 'object') {
    for (const [f, n] of Object.entries(r.influence as Record<string, number>)) gainInfluence(s, p, f as Faction, n);
  }
  if (typeof r.influenceAny === 'number') push(s, p.seat, { kind: 'influenceAny', amount: r.influenceAny, label });
  if (r.influencePickTwo) push(s, p.seat, { kind: 'influencePickTwo', label });
  if (typeof r.trash === 'number' && r.trash > 0) push(s, p.seat, { kind: 'trash', optional: true, label });
  if (r.trashToDraw2) push(s, p.seat, { kind: 'trash', optional: true, label: 'Selective Breeding' });
  if (r.mentat === true) {
    if (label.startsWith('conflict:')) { p.mentatCarry = true; } // combat reward: keep for next round
    else if (s.mentatFree) { s.mentatFree = false; p.mentat = true; }
  }
  if (r.control) {
    const space = r.control as keyof DuneState['control'];
    s.control[space] = p.seat;
    s.log.push(`${p.name}: takes control of ${SPACE_BY_ID[space]?.name ?? space}`);
  }
  if (r.stealIntrigue) {
    for (const q of s.players) {
      if (q.seat === p.seat || q.intrigue.length < 4) continue;
      const i = duneRoll(s, 0, q.intrigue.length - 1);
      p.intrigue.push(q.intrigue.splice(i, 1)[0]);
      s.log.push(`${p.name}: steals an intrigue card from ${q.name}`);
    }
  }
  if (r.acquireFoldspace && s.reserve.foldspace > 0) {
    s.reserve.foldspace--;
    p.discard.push('foldspace');
  }
  if (Array.isArray(r.choice)) {
    push(s, p.seat, { kind: 'conflictChoice', options: r.choice as Record<string, unknown>[], pick: 1, label });
  }
  if (Array.isArray(r.chooseTwo)) {
    push(s, p.seat, { kind: 'conflictChoice', options: r.chooseTwo as Record<string, unknown>[], pick: 2, label });
  }
  return { recruited };
}

// ---------- leader signets ----------

function playSignet(s: DuneState, p: DunePlayer): void {
  switch (p.leader) {
    case 'paulAtreides': drawCards(s, p, 1); break;
    case 'dukeLetoAtreides':
      if (p.spice >= 1) push(s, p.seat, { kind: 'influenceWhereBehind', label: 'Prudent Diplomacy: pay 1 spice' });
      break;
    case 'baronHarkonnen':
      if (p.solari >= 1) { p.solari--; drawIntrigue(s, p, 1); }
      break;
    case 'beastRabban': recruit(s, p, p.alliances.length ? 2 : 1); break;
    case 'arianaThorvald': p.water++; break;
    case 'memnonThorvald': p.spice++; break;
    case 'ilbanRichese': p.solari++; break;
    case 'helenaRichese': push(s, p.seat, { kind: 'helenaRow', label: 'Manipulate: replace an Imperium Row card' }); break;
  }
}

/** Spice harvested from a maker space (Ariana Thorvald: -1 but draw a card). */
function harvestSpice(s: DuneState, p: DunePlayer, base: number, bonus: number, doubled: boolean): void {
  let total = (doubled ? base * 2 : base) + bonus;
  if (p.leader === 'arianaThorvald') {
    total = Math.max(0, total - 1);
    drawCards(s, p, 1);
  }
  p.spice += total;
}

// ---------- turn flow ----------

function nextTurn(s: DuneState): void {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (s.turn + i) % n;
    if (!s.players[seat].revealed) { s.turn = seat; return; }
  }
  startCombat(s);
}

// ---------- combat ----------

function startCombat(s: DuneState): void {
  s.phase = 'combat';
  s.postCombat = false;
  s.combatWinner = null;
  s.combatPassed = s.players.filter((p) => p.inConflict === 0).map((p) => p.seat);
  s.turn = s.firstPlayer;
  advanceCombatTurn(s, true);
}

function advanceCombatTurn(s: DuneState, includeCurrent = false): void {
  const n = s.players.length;
  for (let i = includeCurrent ? 0 : 1; i <= n; i++) {
    const seat = (s.turn + i) % n;
    if (!s.combatPassed.includes(seat)) { s.turn = seat; return; }
  }
  resolveCombat(s);
}

function resolveCombat(s: DuneState): void {
  const conflict = s.conflict ? CONFLICT_BY_ID[s.conflict] : null;
  let winner: number | null = null;
  if (conflict) {
    const ranked = s.players
      .map((p) => ({ seat: p.seat, strength: p.inConflict > 0 ? strengthOf(p) : 0 }))
      .filter((x) => x.strength > 0)
      .sort((a, b) => b.strength - a.strength);
    const groups: { strength: number; seats: number[] }[] = [];
    for (const r of ranked) {
      const g = groups.find((x) => x.strength === r.strength);
      if (g) g.seats.push(r.seat); else groups.push({ strength: r.strength, seats: [r.seat] });
    }
    const give = (seats: number[], reward: Record<string, unknown>, place: string) => {
      for (const seat of seats) {
        const p = s.players[seat];
        event(s, p, `${place} in ${conflict.name}`);
        applyRewards(s, p, reward, `conflict:${conflict.name} ${place}`);
      }
    };
    const fourP = s.players.length === 4;
    if (groups.length) {
      if (groups[0].seats.length === 1) {
        winner = groups[0].seats[0];
        give(groups[0].seats, conflict.first, '1st');
        if (groups[1]) {
          if (groups[1].seats.length === 1) {
            give(groups[1].seats, conflict.second, '2nd');
            if (fourP && groups[2]) give(groups[2].seats, conflict.third, '3rd');
          } else {
            // tie for second: each gets the third reward
            give(groups[1].seats, conflict.third, '2nd (tied)');
          }
        }
      } else {
        // tie for first: nobody wins; tied players take the second reward
        give(groups[0].seats, conflict.second, '1st (tied)');
        if (fourP && groups[1]) give(groups[1].seats, conflict.third, '3rd');
      }
    }
  }
  if (winner !== null) {
    // post-win window: the winner may play "when you win a Conflict" intrigue
    s.combatWinner = winner;
    s.postCombat = true;
    s.turn = winner;
    return;
  }
  finishRound(s);
}

function finishRound(s: DuneState): void {
  s.postCombat = false;
  // troops return to supply, combat markers reset
  for (const p of s.players) {
    p.supply += p.inConflict;
    p.inConflict = 0;
    p.swords = 0;
  }
  // Phase 4: Makers — bonus spice accumulates on unoccupied maker spaces
  for (const id of ['greatFlat', 'haggaBasin', 'imperialBasin'] as const) {
    if (!(s.spaces[id]?.length)) s.makerSpice[id]++;
  }
  // Phase 5: Recall
  s.spaces = {};
  s.voiceBlock = null;
  s.infiltrateNext = null;
  s.mentatFree = true;
  for (const p of s.players) {
    p.agentsLeft = p.agentsTotal;
    p.revealed = false;
    p.persuasion = 0;
    p.mentat = p.mentatCarry; // won as a Conflict reward: kept for next round
    if (p.mentatCarry) s.mentatFree = false;
    p.mentatCarry = false;
    p.spiceMustFlowBonus = 0;
    p.acquireToTop = false;
    p.deployedThisTurn = 0;
    p.binduPass = false;
    p.envoy = false;
    p.helenaAside = null;
    p.actedThisTurn = null;
  }
  const over = s.players.some((p) => p.vp >= DUNE_RULES.winVp) || s.conflictDeck.length === 0;
  if (over) return endGame(s);
  s.firstPlayer = (s.firstPlayer + 1) % s.players.length;
  startRound(s);
}

export function startRound(s: DuneState): void {
  s.phase = 'round';
  s.round++;
  s.conflict = s.conflictDeck.shift() ?? null;
  s.combatWinner = null;
  if (s.conflict) {
    const c = CONFLICT_BY_ID[s.conflict];
    s.log.push(`Round ${s.round}: conflict — ${c.name}`);
    // control defender bonus: the controller of the contested space deploys 1
    const controlled = [c.first, c.second, c.third]
      .map((r) => (r as { control?: string }).control).find(Boolean) as keyof DuneState['control'] | undefined;
    if (controlled && s.control[controlled] !== null) {
      const p = s.players[s.control[controlled]!];
      if (p.supply > 0) { p.supply--; p.inConflict++; s.log.push(`${p.name}: deploys 1 troop (controls ${SPACE_BY_ID[controlled]?.name ?? controlled})`); }
    }
  }
  for (const p of s.players) drawCards(s, p, Math.max(0, DUNE_RULES.handSize - p.hand.length));
  s.turn = s.firstPlayer;
}

// ---------- endgame ----------

function endGame(s: DuneState): void {
  // endgame intrigue is auto-applied where beneficial (all pure upside)
  for (const p of s.players) {
    for (const id of [...p.intrigue]) {
      if (id === 'plansWithinPlans') {
        const tracks = FACTIONS.filter((f) => p.influence[f] >= 3).length;
        const vp = tracks >= 4 ? 2 : tracks >= 3 ? 1 : 0;
        if (vp) { p.vp += vp; s.log.push(`${p.name}: Plans Within Plans (+${vp} VP)`); }
      } else if (id === 'cornerTheMarket') {
        const mine = allCardsOf(p, 'theSpiceMustFlow');
        const most = Math.max(0, ...s.players.filter((q) => q.seat !== p.seat).map((q) => allCardsOf(q, 'theSpiceMustFlow')));
        let vp = 0;
        if (mine >= 2) vp++;
        if (mine > most && mine > 0) vp++;
        if (vp) { p.vp += vp; s.log.push(`${p.name}: Corner the Market (+${vp} VP)`); }
      } else if (id === 'tiebreaker' && p.spice >= 10) {
        p.spice -= 10; p.vp++;
        s.log.push(`${p.name}: Tiebreaker (+1 VP)`);
      }
    }
  }
  s.phase = 'ended';
  const ranked = [...s.players].sort((a, b) =>
    b.vp - a.vp || b.spice - a.spice || b.solari - a.solari || b.water - a.water || b.garrison - a.garrison);
  s.winner = ranked[0].color;
  s.finalScores = ranked.map((p) => ({ seat: p.seat, vp: p.vp, spice: p.spice, solari: p.solari, water: p.water, garrison: p.garrison }));
  s.log.push(`Game over — ${ranked[0].name} wins with ${ranked[0].vp} VP`);
}

// ---------- the reducer ----------

export function currentDunePlayer(s: DuneState): DunePlayer { return s.players[s.turn]; }

export function applyDuneAction(s: DuneState, seat: number, a: DuneAction): DuneResult {
  if (s.phase === 'ended') return err('game over');
  const p = s.players[seat];
  if (!p) return err('bad seat');

  // pending decisions block everything else, and only their owner may act
  if (s.pending.length) {
    const head = s.pending[0];
    if (a.type !== 'choose') return err(`${s.players[head.seat].name} must resolve a choice first`);
    if (head.seat !== seat) return err('not your choice');
    return resolveChoice(s, s.players[seat], head, a);
  }

  switch (a.type) {
    case 'pick_leader': {
      if (s.phase !== 'leaders') return err('leaders already picked');
      if (s.turn !== seat) return err('not your pick');
      if (!s.leaderPool.includes(a.leader)) return err('leader not available');
      p.leader = a.leader;
      s.leaderPool = s.leaderPool.filter((l) => l !== a.leader);
      event(s, p, `leads ${LEADER_BY_ID[a.leader].name}`);
      const eff = LEADER_BY_ID[a.leader].passive.effect as { startSpice?: number; startSolari?: number } | undefined;
      if (eff?.startSpice) p.spice += eff.startSpice;
      if (eff?.startSolari) p.solari += eff.startSolari;
      if (a.leader === 'baronHarkonnen') push(s, seat, { kind: 'baronFactions', label: 'Masterstroke: secretly choose 2 Factions' });
      const picked = s.players.filter((q) => q.leader).length;
      if (picked >= s.players.length) startRound(s);
      else s.turn = (s.turn + 1) % s.players.length;
      return { ok: true };
    }

    case 'agent': return agentTurn(s, p, a);

    case 'reveal': {
      if (s.phase !== 'round') return err('not now');
      if (s.turn !== seat) return err('not your turn');
      if (p.revealed) return err('already revealed');
      if (p.actedThisTurn) return err('already acted — end your turn');
      doReveal(s, p);
      return { ok: true };
    }

    case 'acquire': return acquire(s, p, a);

    case 'intrigue': return playIntrigue(s, p, a);

    case 'combat_pass': {
      if (s.phase !== 'combat') return err('not in combat');
      if (s.turn !== seat) return err('not your turn');
      if (s.postCombat) { finishRound(s); return { ok: true }; }
      if (!s.combatPassed.includes(seat)) s.combatPassed.push(seat);
      advanceCombatTurn(s);
      return { ok: true };
    }

    case 'end_turn': {
      if (s.phase !== 'round') return err('not now');
      if (s.turn !== seat) return err('not your turn');
      if (!p.actedThisTurn && !p.binduPass) return err('take an agent or reveal turn first');
      if (p.actedThisTurn === 'reveal') {
        // reveal cleanup: everything in play goes to the discard pile
        p.discard.push(...p.inPlay, ...p.hand);
        p.inPlay = [];
        p.hand = [];
        p.spiceMustFlowBonus = 0;
        p.acquireToTop = false;
        p.helenaAside = null;
      }
      p.actedThisTurn = null;
      p.binduPass = false;
      p.turnsTaken++;
      nextTurn(s);
      return { ok: true };
    }
  }
  return err('unknown action');
}

// ---------- agent turns ----------

function agentTurn(s: DuneState, p: DunePlayer, a: Extract<DuneAction, { type: 'agent' }>): DuneResult {
  if (s.phase !== 'round') return err('not now');
  if (s.turn !== p.seat) return err('not your turn');
  if (p.revealed) return err('already revealed');
  if (p.actedThisTurn) return err('already acted — end your turn');
  if (p.agentsLeft + (p.mentat ? 1 : 0) <= 0) return err('no agents left — reveal');
  const card = CARD_BY_ID[a.card];
  if (!card || !p.hand.includes(a.card)) return err('card not in hand');
  const space = SPACE_BY_ID[a.space];
  if (!space) return err('unknown space');

  // icon check
  const icons = new Set(card.agents);
  if (p.envoy) for (const f of FACTIONS) icons.add(f);
  const anySpace = icons.has('any'); // Kwisatz Haderach
  if (!anySpace && !icons.has(space.icon)) return err(`${card.name} cannot go to ${space.name}`);

  // occupancy
  const unlimited = space.id === 'highCouncil' || space.id === 'swordmaster';
  const occupied = (s.spaces[space.id]?.length ?? 0) > 0;
  const helenaFree = p.leader === 'helenaRichese' && (isCity(space.id) || isLandsraad(space.id));
  if (occupied && !unlimited && !anySpace && !helenaFree && s.infiltrateNext !== p.seat) {
    return err(`${space.name} is occupied`);
  }
  if (s.voiceBlock && s.voiceBlock.space === space.id && s.voiceBlock.by !== p.seat) {
    return err(`${space.name} is blocked by The Voice`);
  }

  // once-per-game + requirements
  if (space.id === 'highCouncil' && p.hasHighCouncil) return err('already on the High Council');
  if (space.id === 'swordmaster' && p.hasSwordmaster) return err('already have the Swordmaster');
  if (space.requires?.fremenInfluence && p.influence.fremen < space.requires.fremenInfluence) {
    return err(`needs ${space.requires.fremenInfluence} Fremen influence`);
  }

  // space cost (Duke Leto: Landsraad spaces cost 1 solari less)
  const cost = { ...(space.cost ?? {}) };
  if (p.leader === 'dukeLetoAtreides' && isLandsraad(space.id) && cost.solari) cost.solari = Math.max(0, cost.solari - 1);
  if ((cost.solari ?? 0) > p.solari) return err('not enough solari');
  if ((cost.spice ?? 0) > p.spice) return err('not enough spice');
  if ((cost.water ?? 0) > p.water) return err('not enough water');

  // sell melange validation
  let sellGain = 0;
  if (space.id === 'sellMelange') {
    const n = a.sell ?? 0;
    if (!SELL_MELANGE[String(n)]) return err('sell 2-5 spice');
    if (p.spice < n) return err('not enough spice');
    sellGain = SELL_MELANGE[String(n)];
  }

  // --- commit ---
  p.hand = p.hand.filter((c) => c !== a.card);
  p.inPlay.push(a.card);
  if (p.agentsLeft > 0) p.agentsLeft--; else p.mentat = false;
  p.actedThisTurn = 'agent';
  p.deployedThisTurn = 0;
  if (s.infiltrateNext === p.seat) s.infiltrateNext = null;
  p.envoy = false;
  (s.spaces[space.id] ??= []).push(p.seat);

  if (cost.solari) {
    p.solari -= cost.solari;
    if (p.leader === 'ilbanRichese') drawCards(s, p, 1); // Ruthless Negotiator
  }
  if (cost.spice) p.spice -= cost.spice;
  if (cost.water) p.water -= cost.water;

  event(s, p, `${card.name} → ${space.name}`);

  let recruited = 0;

  // space effect
  if (space.id === 'sellMelange') {
    p.spice -= a.sell!;
    p.solari += sellGain;
  } else if (space.id === 'highCouncil') {
    p.hasHighCouncil = true;
    if (p.leader === 'memnonThorvald') push(s, p.seat, { kind: 'influenceAny', amount: 1, label: 'Connections' });
  } else if (space.id === 'swordmaster') {
    p.hasSwordmaster = true;
    p.agentsTotal = 3;
    p.agentsLeft += 1;
  } else if (space.id === 'mentat') {
    drawCards(s, p, 1);
    if (s.mentatFree) { s.mentatFree = false; p.mentat = true; }
  } else if (space.rewards) {
    if (space.maker && typeof space.rewards.spice === 'number') {
      const key = space.id as keyof DuneState['makerSpice'];
      harvestSpice(s, p, space.rewards.spice, s.makerSpice[key], a.card === 'carryall');
      s.makerSpice[key] = 0;
      const rest = { ...space.rewards };
      delete rest.spice;
      recruited += applyRewards(s, p, rest, space.name).recruited;
    } else {
      recruited += applyRewards(s, p, space.rewards, space.name).recruited;
    }
  }
  if (space.influence) gainInfluence(s, p, space.influence, a.card === 'powerPlay' ? 2 : 1);

  // control bonus for the space's controller
  if (space.control) {
    const owner = s.control[space.id as keyof DuneState['control']];
    if (owner !== null && owner !== p.seat) {
      const o = s.players[owner];
      if (space.control === 'solari') o.solari += 1; else o.spice += 1;
      s.log.push(`${o.name}: control bonus (${space.name})`);
    } else if (owner === p.seat) {
      if (space.control === 'solari') p.solari += 1; else p.spice += 1;
    }
  }

  // card agent box + signet
  recruited += applyAgentBox(s, p, card, a);
  if (card.id === 'signetRing') playSignet(s, p);

  // deploy to the conflict (combat spaces only)
  if (space.combat) {
    const want = a.deploy ?? 0;
    const deploy = Math.min(want, DUNE_RULES.garrisonDeployMax + recruited, p.garrison);
    if (deploy > 0) {
      p.garrison -= deploy;
      p.inConflict += deploy;
      p.deployedThisTurn += deploy;
      s.log.push(`${p.name}: deploys ${deploy} to the conflict`);
    }
    if (p.leader === 'baronHarkonnen' && !p.baronRevealed && p.deployedThisTurn >= 4 && p.baronFactions) {
      p.baronRevealed = true;
      for (const f of p.baronFactions) gainInfluence(s, p, f, 1);
      s.log.push(`${p.name}: Masterstroke revealed (${p.baronFactions.join(', ')})`);
    }
  } else if (a.deploy) {
    return { ok: true }; // not a combat space — deploy request ignored (already committed)
  }

  return { ok: true };
}

function applyAgentBox(s: DuneState, p: DunePlayer, card: CardDef, a: Extract<DuneAction, { type: 'agent' }>): number {
  const box = card.agentBox;
  if (!box) return 0;
  let recruited = 0;

  // optional cost gate ("you are never forced to pay such a cost")
  const cost = box.cost as Record<string, number> | undefined;
  if (cost) {
    const wants = a.useOptional !== false;
    const affordable = (cost.spice ?? 0) <= p.spice && (cost.solari ?? 0) <= p.solari && (cost.water ?? 0) <= p.water
      && (!cost.loseInfluenceAny || FACTIONS.some((f) => p.influence[f] > 0));
    if (!wants || !affordable) return 0;
    p.spice -= cost.spice ?? 0;
    p.solari -= cost.solari ?? 0;
    p.water -= cost.water ?? 0;
    if (cost.loseInfluenceAny) {
      push(s, p.seat, { kind: 'influencePick', options: FACTIONS.filter((f) => p.influence[f] > 0), label: 'Lose 1 influence', lose: true });
    }
  }
  const requires = box.requires as Record<string, number> | undefined;
  if (requires?.guildInfluence && p.influence.guild < requires.guildInfluence) return 0;

  recruited += applyRewards(s, p, box, card.name).recruited;

  // per-card specials (text effects)
  switch (card.id) {
    case 'theVoice': push(s, p.seat, { kind: 'voiceSpace', label: 'The Voice: block a space' }); break;
    case 'imperialSpy': // "Trash this card: draw an Intrigue card"
      p.inPlay = p.inPlay.filter((c) => c !== card.id);
      drawIntrigue(s, p, 1);
      s.log.push(`${p.name}: trashes Imperial Spy`);
      break;
    case 'geneManipulation':
      if (factionCardsInPlay(p, 'beneGesserit') > 1) p.spice += 2;
      break;
    case 'gunThopter':
      for (const q of s.players) if (q.seat !== p.seat && q.garrison > 0) { q.garrison--; q.supply++; }
      break;
    case 'testOfHumanity':
      for (const q of s.players) {
        if (q.seat !== p.seat && (q.hand.length > 0 || q.inConflict + q.garrison > 0)) {
          push(s, q.seat, { kind: 'discardOrLoseTroop', label: 'Test of Humanity' });
        }
      }
      break;
    case 'reverendMotherMohiam':
      if (factionCardsInPlay(p, 'beneGesserit') > 1) {
        for (const q of s.players) {
          if (q.seat === p.seat) continue;
          for (let i = 0; i < 2 && q.hand.length; i++) {
            const idx = duneRoll(s, 0, q.hand.length - 1);
            q.discard.push(q.hand.splice(idx, 1)[0]);
          }
          s.log.push(`${q.name}: discards 2 cards (Mohiam)`);
        }
      }
      break;
    case 'jessicaOfArrakis':
      if (factionCardsInPlay(p, 'beneGesserit') > 1) drawCards(s, p, 2);
      break;
    case 'missionariaProtectiva':
      if (factionCardsInPlay(p, 'beneGesserit') > 1) push(s, p.seat, { kind: 'influenceAny', amount: 1, label: 'Missionaria Protectiva' });
      break;
    case 'guildBankers': p.spiceMustFlowBonus = 3; break;
    case 'seekAllies': case 'powerPlay':
      p.inPlay = p.inPlay.filter((c) => c !== card.id); // trash themselves
      s.log.push(`${p.name}: trashes ${card.name}`);
      break;
    case 'foldspace':
      p.inPlay = p.inPlay.filter((c) => c !== card.id);
      s.reserve.foldspace++; // reserve cards return to their stack when trashed
      break;
    case 'firmGrip':
      if (cost?.solari) push(s, p.seat, { kind: 'influencePick', options: ['guild', 'beneGesserit', 'fremen'], label: 'Firm Grip' });
      break;
  }
  return recruited;
}

// ---------- reveal + acquire ----------

function doReveal(s: DuneState, p: DunePlayer): void {
  p.revealed = true;
  p.actedThisTurn = 'reveal';
  const revealedCards = [...p.hand];
  p.inPlay.push(...p.hand);
  p.hand = [];
  event(s, p, 'reveals', revealedCards.map((c) => CARD_BY_ID[c]?.name ?? c).join(', '));

  if (p.hasHighCouncil) p.persuasion += DUNE_RULES.highCouncilPersuasion;

  for (const id of revealedCards) {
    const def = CARD_BY_ID[id];
    const r = def?.reveal;
    if (!r) continue;
    if (typeof r.persuasion === 'number') p.persuasion += r.persuasion;
    if (typeof r.swords === 'number') p.swords += r.swords;
    if (typeof r.solari === 'number') p.solari += r.solari;
    if (typeof r.spice === 'number') p.spice += r.spice;
    if (typeof r.water === 'number') p.water += r.water;
    if (typeof r.intrigue === 'number') drawIntrigue(s, p, r.intrigue);

    const bond = r.fremenBond as Record<string, unknown> | undefined;
    if (bond && factionCardsInPlay(p, 'fremen') > 1) applyRewards(s, p, bond, `${def.name} (Fremen Bond)`);
    const fi2 = r.fremenInfluence2 as Record<string, unknown> | undefined;
    if (fi2 && p.influence.fremen >= 2) applyRewards(s, p, fi2, def.name);
    const fAll = r.fremenAlliance as Record<string, unknown> | undefined;
    if (fAll && p.alliances.includes('fremen')) applyRewards(s, p, fAll, def.name);
    const eAll = r.emperorAlliance as Record<string, unknown> | undefined;
    if (eAll && p.alliances.includes('emperor')) applyRewards(s, p, eAll, def.name);
    const gAll = r.guildAlliance as { cost?: { spice?: number }; vp?: number } | undefined;
    if (gAll && p.alliances.includes('guild') && p.spice >= (gAll.cost?.spice ?? 0)) {
      push(s, p.seat, { kind: 'conflictChoice', options: [gAll as Record<string, unknown>, {}], pick: 1, label: `${def.name}: pay spice for 1 VP?` });
    }
    const and = r.and as { cost?: Record<string, number> } | undefined;
    if (and?.cost && (and.cost.solari ?? 0) <= p.solari) {
      push(s, p.seat, { kind: 'conflictChoice', options: [and as Record<string, unknown>, {}], pick: 1, label: `${def.name}: optional` });
    }
    if (Array.isArray(r.choice)) {
      push(s, p.seat, { kind: 'conflictChoice', options: r.choice as Record<string, unknown>[], pick: 1, label: def.name });
    }
    if (def.id === 'lietKynes') p.persuasion += 2 * factionCardsInPlay(p, 'fremen');
    if (def.id === 'guildBankers') p.spiceMustFlowBonus = 3;
  }
}

function acquire(s: DuneState, p: DunePlayer, a: Extract<DuneAction, { type: 'acquire' }>): DuneResult {
  if (s.phase !== 'round') return err('not now');
  if (s.turn !== p.seat) return err('not your turn');
  if (p.actedThisTurn !== 'reveal') return err('reveal first');

  const buy = (id: string, cost: number): DuneResult => {
    if (p.persuasion < cost) return err('not enough persuasion');
    p.persuasion -= cost;
    const def = CARD_BY_ID[id];
    if (def?.acquireBox) applyRewards(s, p, def.acquireBox, `${def.name} (acquire)`);
    if (p.acquireToTop) p.deck.unshift(id); else p.discard.push(id);
    event(s, p, `acquires ${def?.name ?? id}`);
    return { ok: true };
  };

  if (a.helena && p.helenaAside) {
    const id = p.helenaAside.card;
    const r = buy(id, Math.max(0, (CARD_BY_ID[id]?.cost ?? 0) - 1));
    if (r.ok) p.helenaAside = null;
    return r;
  }
  if (typeof a.row === 'number') {
    const id = s.imperiumRow[a.row];
    if (!id) return err('empty slot');
    const r = buy(id, CARD_BY_ID[id]?.cost ?? 0);
    if (r.ok) s.imperiumRow[a.row] = s.imperiumDeck.shift() ?? null;
    return r;
  }
  if (a.reserve) {
    if (s.reserve[a.reserve] <= 0) return err('pile empty');
    const costs = { foldspace: 0, arrakisLiaison: 2, theSpiceMustFlow: 9 };
    let cost: number = costs[a.reserve];
    if (a.reserve === 'theSpiceMustFlow') cost = Math.max(0, cost - p.spiceMustFlowBonus);
    const r = buy(a.reserve, cost);
    if (r.ok) s.reserve[a.reserve]--;
    return r;
  }
  return err('nothing to acquire');
}

// ---------- intrigue ----------

function playIntrigue(s: DuneState, p: DunePlayer, a: Extract<DuneAction, { type: 'intrigue' }>): DuneResult {
  const def = INTRIGUE_BY_ID[a.card];
  if (!def || !p.intrigue.includes(a.card)) return err('intrigue not in hand');
  const e = def.effect;
  const winTrigger = e.trigger === 'when you win a Conflict';

  if (s.phase === 'combat') {
    if (s.turn !== p.seat) return err('not your turn');
    if (s.postCombat) {
      if (!winTrigger || s.combatWinner !== p.seat) return err('only "when you win" cards now');
    } else {
      if (!def.kind.includes('combat')) return err('not a combat card');
      if (winTrigger) return err('play that after winning');
      if (p.inConflict === 0) return err('no troops in the conflict');
    }
  } else if (s.phase === 'round') {
    if (s.turn !== p.seat) return err('not your turn');
    if (def.kind !== 'plot') return err('play that during combat');
  } else return err('not now');

  const cost = e.cost as Record<string, number> | undefined;
  if (cost) {
    if ((cost.solari ?? 0) > p.solari) return err('not enough solari');
    if ((cost.spice ?? 0) > p.spice) return err('not enough spice');
    if ((cost.water ?? 0) > p.water) return err('not enough water');
    if ((cost.troopsInConflict ?? 0) > p.inConflict) return err('not enough troops in the conflict');
  }
  if (e.requires === 'high council seat' && !p.hasHighCouncil) return err('needs a High Council seat');
  if (e.requires === 'faction alliance' && p.alliances.length === 0) return err('needs a Faction Alliance');
  if (def.id === 'urgentMission' && !Object.values(s.spaces).some((arr) => arr.includes(p.seat))) {
    return err('no agent on the board to recall');
  }
  if (def.id === 'doubleCross' && !s.players.some((q) => q.seat !== p.seat && q.inConflict > 0)) {
    return err('no opposing troops in the conflict');
  }

  // commit
  p.intrigue = p.intrigue.filter((c) => c !== a.card);
  s.intrigueDiscard.push(a.card);
  if (cost) {
    p.solari -= cost.solari ?? 0;
    p.spice -= cost.spice ?? 0;
    p.water -= cost.water ?? 0;
    if (cost.troopsInConflict) { p.inConflict -= cost.troopsInConflict; p.supply += cost.troopsInConflict; }
  }
  event(s, p, `plays ${def.name}`);

  // Refocus shuffles BEFORE its draw — handle it fully in the switch
  if (def.id !== 'refocus') applyRewards(s, p, e, def.name);

  switch (def.id) {
    case 'refocus':
      p.deck = duneShuffle(s, [...p.deck, ...p.discard]);
      p.discard = [];
      drawCards(s, p, 1);
      break;
    case 'poisonSnooper': {
      if (p.deck.length === 0 && p.discard.length) { p.deck = duneShuffle(s, p.discard); p.discard = []; }
      if (p.deck.length) {
        push(s, p.seat, {
          kind: 'conflictChoice', options: [{ draw: 1 }, { trashTop: true }], pick: 1,
          label: `Poison Snooper: top card is ${CARD_BY_ID[p.deck[0]]?.name ?? p.deck[0]}`,
        });
      }
      break;
    }
    case 'dispatchAnEnvoy': p.envoy = true; break;
    case 'infiltrate': s.infiltrateNext = p.seat; break;
    case 'charisma': p.persuasion += 2; break;
    case 'calculatedHire': if (s.mentatFree) { s.mentatFree = false; p.mentat = true; } break;
    case 'bypassProtocol':
      push(s, p.seat, {
        kind: 'conflictChoice', pick: 1, label: 'Bypass Protocol',
        options: [{ freeAcquire: 3 }, { cost: { spice: 2 }, freeAcquire: 5, toTop: true }],
      });
      break;
    case 'recruitmentMission': p.persuasion += 1; p.acquireToTop = true; break;
    case 'reinforcements': {
      // troops already recruited generically; optional reveal-turn deploy
      if (p.actedThisTurn === 'reveal' && a.deploy) {
        const d = Math.min(a.deploy, 3, p.garrison);
        p.garrison -= d;
        p.inConflict += d;
      }
      break;
    }
    case 'binduSuspension': p.binduPass = true; break; // its draw came from the effect bag
    case 'rapidMobilization': { const d = p.garrison; p.garrison = 0; p.inConflict += d; break; }
    case 'doubleCross': push(s, p.seat, { kind: 'pickOpponentInConflict', label: 'Double Cross' }); break;
    case 'urgentMission': push(s, p.seat, { kind: 'recallAgent', label: 'Urgent Mission' }); break;
  }

  // playing a combat card reopens the bidding: everyone with troops un-passes
  if (s.phase === 'combat' && !s.postCombat) {
    s.combatPassed = s.players.filter((q) => q.inConflict === 0).map((q) => q.seat);
    advanceCombatTurn(s, true);
  }
  return { ok: true };
}

// ---------- pending choices ----------

function resolveChoice(s: DuneState, p: DunePlayer, head: PendingDecision, a: Extract<DuneAction, { type: 'choose' }>): DuneResult {
  const d = head.decision;
  const done = (): DuneResult => { s.pending.shift(); return { ok: true }; };

  switch (d.kind) {
    case 'influenceAny': {
      if (!a.faction || !FACTIONS.includes(a.faction)) return err('pick a faction');
      gainInfluence(s, p, a.faction, d.amount);
      return done();
    }
    case 'influencePickTwo': {
      const fs = a.factions ?? [];
      if (fs.length !== 2 || fs[0] === fs[1] || !fs.every((f) => FACTIONS.includes(f))) return err('pick two different factions');
      for (const f of fs) gainInfluence(s, p, f, 1);
      return done();
    }
    case 'influenceWhereBehind': {
      if (a.accept === false) return done();
      if (!a.faction) return err('pick a faction');
      const behind = s.players.some((q) => q.seat !== p.seat && q.influence[a.faction!] > p.influence[a.faction!]);
      if (!behind) return err('an opponent must have more influence there');
      if (p.spice < 1) return err('not enough spice');
      p.spice--;
      gainInfluence(s, p, a.faction, 1);
      return done();
    }
    case 'influencePick': {
      if (!a.faction || !d.options.includes(a.faction)) return err('pick a faction');
      gainInfluence(s, p, a.faction, d.lose ? -1 : 1);
      return done();
    }
    case 'voiceSpace': {
      if (!a.space || !SPACE_BY_ID[a.space]) return err('pick a space');
      s.voiceBlock = { space: a.space, by: p.seat };
      s.log.push(`${p.name}: The Voice blocks ${SPACE_BY_ID[a.space].name}`);
      return done();
    }
    case 'trash': {
      if (a.accept === false && d.optional) return done();
      if (!a.card) return err('pick a card to trash');
      const from = p.hand.includes(a.card) ? p.hand : p.discard.includes(a.card) ? p.discard : p.inPlay.includes(a.card) ? p.inPlay : null;
      if (!from) return err('card not yours');
      from.splice(from.indexOf(a.card), 1);
      if (a.card in s.reserve) (s.reserve as unknown as Record<string, number>)[a.card]++;
      const def = CARD_BY_ID[a.card];
      if (def?.trashTrigger) applyRewards(s, p, def.trashTrigger, `${def.name} (trashed)`);
      s.log.push(`${p.name}: trashes ${def?.name ?? a.card}`);
      if (d.label === 'Selective Breeding') drawCards(s, p, 2);
      return done();
    }
    case 'discardOrLoseTroop': {
      if (a.card) {
        if (!p.hand.includes(a.card)) return err('card not in hand');
        p.hand.splice(p.hand.indexOf(a.card), 1);
        p.discard.push(a.card);
      } else {
        if (p.inConflict > 0) { p.inConflict--; p.supply++; }
        else if (p.garrison > 0) { p.garrison--; p.supply++; }
        else return err('discard a card instead');
      }
      return done();
    }
    case 'baronFactions': {
      const fs = a.factions ?? [];
      if (fs.length !== 2 || fs[0] === fs[1] || !fs.every((f) => FACTIONS.includes(f))) return err('pick two different factions');
      p.baronFactions = fs;
      return done();
    }
    case 'helenaRow': {
      if (a.accept === false) return done();
      const i = a.option ?? -1;
      if (i < 0 || i >= s.imperiumRow.length || !s.imperiumRow[i]) return err('pick a row card');
      const removed = s.imperiumRow[i]!;
      s.imperiumRow[i] = s.imperiumDeck.shift() ?? null;
      p.helenaAside = { card: removed };
      s.log.push(`${p.name}: sets aside ${CARD_BY_ID[removed]?.name ?? removed}`);
      return done();
    }
    case 'recallAgent': {
      if (!a.space || !(s.spaces[a.space] ?? []).includes(p.seat)) return err('no agent there');
      const arr = s.spaces[a.space];
      arr.splice(arr.indexOf(p.seat), 1);
      p.agentsLeft++;
      s.log.push(`${p.name}: recalls an agent from ${SPACE_BY_ID[a.space]?.name ?? a.space}`);
      return done();
    }
    case 'pickOpponentInConflict': {
      const target = s.players[a.seat ?? -1];
      if (!target || target.seat === p.seat || target.inConflict === 0) return err('pick an opponent with troops in the conflict');
      target.inConflict--;
      target.supply++;
      if (p.supply > 0) { p.supply--; p.inConflict++; }
      return done();
    }
    case 'freeAcquire': {
      if (a.accept === false) return done();
      if (typeof a.option !== 'number') return err('pick a row card');
      const id = s.imperiumRow[a.option];
      if (!id) return err('pick a row card');
      const cardCost = CARD_BY_ID[id]?.cost ?? 0;
      if (cardCost > d.limit) return err(`must cost ${d.limit} or less`);
      s.imperiumRow[a.option] = s.imperiumDeck.shift() ?? null;
      const def = CARD_BY_ID[id];
      if (def?.acquireBox) applyRewards(s, p, def.acquireBox, `${def.name} (acquire)`);
      if (d.toTop) p.deck.unshift(id); else p.discard.push(id);
      event(s, p, `acquires ${def?.name ?? id}`);
      return done();
    }
    case 'conflictChoice': {
      const idxs = d.pick === 1 ? (typeof a.option === 'number' ? [a.option] : []) : (a.options ?? []);
      if (idxs.length !== d.pick || idxs.some((i) => i < 0 || i >= d.options.length)) return err(`pick ${d.pick}`);
      if (d.pick === 2 && idxs[0] === idxs[1]) return err('pick two different options');
      // validate combined costs first
      let solari = 0, spice = 0, water = 0;
      for (const i of idxs) {
        const c = d.options[i].cost as Record<string, number> | undefined;
        solari += c?.solari ?? 0; spice += c?.spice ?? 0; water += c?.water ?? 0;
      }
      if (solari > p.solari || spice > p.spice || water > p.water) return err('cannot afford that option');
      p.solari -= solari; p.spice -= spice; p.water -= water;
      for (const i of idxs) {
        const opt = { ...d.options[i] };
        delete opt.cost;
        if (typeof opt.text === 'string' && /^Retreat/.test(opt.text)) {
          // Master Tactician: pull troops out of the conflict
          const cap = /three/.test(opt.text) ? 3 : /two/.test(opt.text) ? 2 : p.inConflict;
          const back = Math.min(cap, p.inConflict);
          p.inConflict -= back;
          p.garrison += back;
          s.log.push(`${p.name}: retreats ${back} troop${back === 1 ? '' : 's'}`);
          delete opt.text;
        }
        if (opt.trashTop) {
          const top = p.deck.shift();
          if (top) s.log.push(`${p.name}: trashes ${CARD_BY_ID[top]?.name ?? top} from the deck top`);
          delete opt.trashTop;
        }
        if (opt.freeAcquire) {
          push(s, p.seat, { kind: 'freeAcquire', limit: opt.freeAcquire as number, toTop: !!opt.toTop, label: 'Acquire a card' });
          delete opt.freeAcquire;
          delete opt.toTop;
        }
        applyRewards(s, p, opt, d.label);
      }
      return done();
    }
  }
  return err('unknown choice');
}
