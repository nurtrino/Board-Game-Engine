// Axis & Allies Anniversary — the turn/phase machine and every player action.
// Phase order (rulebook p6): RND (optional) -> Purchase -> Combat Move ->
// Conduct Combat -> Noncombat Move -> Mobilize -> Collect Income.
// Owner decision: a combat move resolves IMMEDIATELY — declaring an attack
// assembles the battle right away (phase 'battle'), then play returns to
// 'combatMove' for the next attack.

import {
  POWERS, TURN_ORDER, UNITS, TECHS, TECH_BY_KEY, SHIPYARD_COSTS, RESEARCH_DIE_COST,
  OBJECTIVES, CHINA_RULES, CAN_CAPTURE, SURFACE_WARSHIPS,
  type PowerKey, type UnitKey, type TechKey,
} from './config.js';
import {
  activePower, addUnits, coalitionOf, d6, enemyUnitsAt, productionOf, removeUnits,
  sameSide, seaZoneHostile, stacksAt, unitCount, checkVictory, isSeaZoneId,
  type AxisState, type UnitStack, type ActiveCombat,
} from './state.js';
import type { MapIndex, TerritoryDef } from './map.js';
import {
  createBattle, resolveRoll, applyCasualtyPicks, applySubmerge, applyRetreat,
  currentStep, stepDice, type SideSpec, type BattleState,
} from './battle.js';

export type AxisAction =
  // rnd
  | { type: 'buyResearch'; dice: number }
  | { type: 'chooseChart'; chart: 1 | 2 }
  // purchase
  | { type: 'buy'; key: UnitKey; count: number }
  | { type: 'unbuy'; key: UnitKey; count: number }
  | { type: 'repair'; territory: string; count: number }
  // combat move: assemble one attack (possibly from several origins) and
  // resolve it immediately. Amphibious attacks name the offload zone.
  | {
      type: 'attack';
      target: string;
      forces: { from: string; units: { key: UnitKey; count: number }[] }[];
      // amphibious: land units offloading from transports in this zone
      offloadFrom?: string;
      offloadUnits?: { key: UnitKey; count: number }[];
    }
  // battle interaction (routed by pending decisions)
  | { type: 'battleRoll' }
  | { type: 'battleCasualties'; uids: number[] }
  | { type: 'battleSubmerge'; uids: number[] }
  | { type: 'battleRetreat'; retreat: boolean }
  // movement (combatMove phase for repositioning INTO friendly spaces is not
  // a thing — all non-attack moves happen in noncombat; loading transports is)
  | { type: 'move'; from: string; to: string; units: { key: UnitKey; count: number }[]; via?: string }
  | { type: 'load'; zone: string; territory: string; units: { key: UnitKey; count: number }[] }
  | { type: 'offload'; zone: string; territory: string; units: { key: UnitKey; count: number }[] }
  // mobilize
  | { type: 'place'; space: string; key: UnitKey; count: number }
  // phase control
  | { type: 'endPhase' };

export interface ActionResult { ok: boolean; error?: string }

const err = (error: string): ActionResult => ({ ok: false, error });
const OK: ActionResult = { ok: true };

// ---------- shared movement helpers ----------

const isNeutral = (t: TerritoryDef) => t.originalOwner === null || t.isImpassable;

function neighborsFor(s: AxisState, idx: MapIndex, space: string, domain: 'land' | 'sea' | 'air', power: PowerKey | 'china'): string[] {
  const out: string[] = [];
  if (isSeaZoneId(space)) {
    const z = idx.seaZone[space];
    if (!z) return out;
    if (domain !== 'land') {
      for (const a of z.adj) {
        // canals: a zone pair joined only by a canal must be side-controlled
        const canal = idx.map.canals.find((c) => (c.connects[0] === space && c.connects[1] === a) || (c.connects[1] === space && c.connects[0] === a));
        if (canal && domain === 'sea') {
          const okCanal = canal.controlledBy.every((t) => {
            const holder = s.control[t];
            return holder != null && sameSide(holder, power);
          });
          if (!okCanal) continue;
        }
        out.push(a);
      }
      if (domain === 'air') for (const t of z.coastTo ?? []) out.push(t);
    }
    return out;
  }
  const t = idx.territory[space];
  if (!t) return out;
  if (domain !== 'sea') {
    for (const a of t.adj) {
      const other = idx.territory[a];
      if (!other) continue;
      if (domain === 'land' && isNeutral(other)) continue; // never into neutrals
      out.push(a);
    }
  }
  if (domain !== 'land') for (const z of t.coastTo ?? []) out.push(z);
  return out;
}

// ---------- rnd ----------

function actBuyResearch(s: AxisState, idx: MapIndex, dice: number): ActionResult {
  const power = activePower(s);
  const p = s.powers[power];
  if (s.phase !== 'rnd') return err('Not the research phase.');
  const cost = dice * RESEARCH_DIE_COST;
  if (dice < 1) return err('Buy at least one research die.');
  if (p.ipcs < cost) return err(`Research costs ${RESEARCH_DIE_COST} per die.`);
  p.ipcs -= cost;
  p.researchTokens += dice;
  // roll all tokens now (tokens persist on failure)
  const rolls = Array.from({ length: p.researchTokens }, () => d6(s));
  const success = rolls.includes(6);
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} rolls research: ${rolls.join(', ')}${success ? ' — breakthrough!' : ' — no breakthrough (researchers stay).'}` });
  if (success) {
    p.researchTokens = 0;
    (s as AxisState & { awaitingChart?: boolean }).awaitingChart = true;
  } else {
    s.phase = 'purchase';
  }
  void idx;
  return OK;
}

function actChooseChart(s: AxisState, chart: 1 | 2): ActionResult {
  const power = activePower(s);
  const p = s.powers[power];
  const flag = s as AxisState & { awaitingChart?: boolean };
  if (s.phase !== 'rnd' || !flag.awaitingChart) return err('No breakthrough waiting.');
  const chartTechs = TECHS.filter((t) => t.chart === chart);
  const remaining = chartTechs.filter((t) => !p.techs.includes(t.key));
  if (remaining.length === 0) return err('Every advance on that chart is already yours.');
  let tech = null;
  let guard = 0;
  while (!tech && guard++ < 100) {
    const roll = d6(s);
    const hit = chartTechs.find((t) => t.roll === roll)!;
    if (!p.techs.includes(hit.key)) tech = hit;
  }
  tech ??= remaining[0];
  p.techs.push(tech.key);
  flag.awaitingChart = false;
  s.phase = 'purchase';
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} develops ${tech.name}.` });
  return OK;
}

// ---------- purchase ----------

function unitCost(p: { techs: TechKey[] }, key: UnitKey): number {
  if (p.techs.includes('improvedShipyards') && SHIPYARD_COSTS[key]) return SHIPYARD_COSTS[key]!;
  return UNITS[key].cost;
}

function actBuy(s: AxisState, key: UnitKey, count: number): ActionResult {
  if (s.phase !== 'purchase') return err('Not the purchase phase.');
  const power = activePower(s);
  const p = s.powers[power];
  const cost = unitCost(p, key) * count;
  if (count < 1) return err('Buy at least one.');
  if (p.ipcs < cost) return err(`Not enough IPCs (${cost} needed).`);
  p.ipcs -= cost;
  p.staging[key] = (p.staging[key] ?? 0) + count;
  return OK;
}

function actUnbuy(s: AxisState, key: UnitKey, count: number): ActionResult {
  if (s.phase !== 'purchase') return err('Not the purchase phase.');
  const power = activePower(s);
  const p = s.powers[power];
  const have = p.staging[key] ?? 0;
  if (have < count) return err('Not that many staged.');
  p.staging[key] = have - count;
  if (p.staging[key] === 0) delete p.staging[key];
  p.ipcs += unitCost(p, key) * count;
  return OK;
}

function actRepair(s: AxisState, idx: MapIndex, territory: string, count: number): ActionResult {
  if (s.phase !== 'purchase') return err('Not the purchase phase.');
  const power = activePower(s);
  const p = s.powers[power];
  const dmg = s.factoryDamage[territory] ?? 0;
  if (s.control[territory] !== power) return err('Not your industrial complex.');
  if (unitCount(s, territory, power, 'factory') === 0 && unitCount(s, territory, null, 'factory') === 0) return err('No industrial complex there.');
  if (dmg < count) return err('Not that much damage.');
  const per = p.techs.includes('increasedFactory') ? 0.5 : 1;
  const cost = Math.ceil(count * per);
  if (p.ipcs < cost) return err(`Repairs cost ${cost} IPCs.`);
  p.ipcs -= cost;
  s.factoryDamage[territory] = dmg - count;
  void idx;
  return OK;
}

// ---------- combat move: assemble and immediately resolve an attack ----------

function techsOf(s: AxisState, power: PowerKey): TechKey[] {
  return s.powers[power].techs;
}

function actAttack(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'attack' }>): ActionResult {
  if (s.phase !== 'combatMove') return err('Not the combat move phase.');
  if (s.combat) return err('Resolve the current battle first.');
  const power = activePower(s);
  const targetSea = isSeaZoneId(a.target);
  const enemies = enemyUnitsAt(s, a.target, power);
  const targetTerr = idx.territory[a.target];
  if (!targetSea && !targetTerr) return err('Unknown target.');
  if (!targetSea && isNeutral(targetTerr!) && !s.control[a.target]) return err('Neutral territories are impassable.');
  const hostileControl = !targetSea && s.control[a.target] != null && !sameSide(s.control[a.target]!, power);
  if (enemies.length === 0 && !hostileControl) return err('Nothing to attack there.');

  // collect and validate forces (adjacency only for now; multi-space moves
  // use 'move' first — tanks/air arrive via their own moves in this MVP wave,
  // refined during client integration)
  const committed: { key: UnitKey; count: number }[] = [];
  const from: ActiveCombat['from'] = [];
  for (const f of a.forces) {
    const legalAdj = neighborsFor(s, idx, f.from, targetSea ? 'sea' : 'land', power).includes(a.target)
      || neighborsFor(s, idx, f.from, 'air', power).includes(a.target);
    if (!legalAdj) return err(`${f.from} does not border the target.`);
    for (const u of f.units) {
      if (unitCount(s, f.from, power, u.key) < u.count) return err(`Not enough ${UNITS[u.key].name} in ${f.from}.`);
      const dom = UNITS[u.key].domain;
      if (!targetSea && dom === 'sea') return err('Ships cannot enter territories.');
      if (targetSea && dom === 'land') return err('Land units cannot attack sea zones.');
    }
  }
  // amphibious offload
  let amphibious = false;
  if (a.offloadFrom && a.offloadUnits?.length) {
    if (targetSea) return err('Amphibious assaults target territories.');
    amphibious = true;
    if (seaZoneHostile(s, a.offloadFrom, power)) return err('Clear the sea zone before offloading (attack it first).');
    // verify cargo exists aboard own transports in that zone
    const aboard: Partial<Record<UnitKey, number>> = {};
    for (const st of stacksAt(s, a.offloadFrom)) {
      if (st.power !== power || st.key !== 'transport') continue;
      for (const c of st.cargo ?? []) aboard[c.key] = (aboard[c.key] ?? 0) + c.count;
    }
    for (const u of a.offloadUnits) {
      if ((aboard[u.key] ?? 0) < u.count) return err(`Not enough ${UNITS[u.key].name} aboard transports in ${a.offloadFrom}.`);
    }
  }

  // move the units out of their origins into the battle
  for (const f of a.forces) {
    for (const u of f.units) {
      removeUnits(s, f.from, power, u.key, u.count);
      committed.push(u);
    }
    from.push({ space: f.from, units: f.units });
  }
  if (amphibious && a.offloadUnits) {
    for (const u of a.offloadUnits) {
      let left = u.count;
      for (const st of stacksAt(s, a.offloadFrom!)) {
        if (st.power !== power || st.key !== 'transport' || !st.cargo) continue;
        for (const c of st.cargo) {
          if (c.key !== u.key || left === 0) continue;
          const take = Math.min(c.count, left);
          c.count -= take;
          left -= take;
        }
        st.cargo = st.cargo.filter((c) => c.count > 0);
      }
      committed.push(u);
    }
    from.push({ space: a.offloadFrom!, units: a.offloadUnits });
  }

  // build defender spec: every enemy unit in the space defends together
  // (multinational defense); AA guns and factories ride along in territories
  const defUnits: SideSpec['units'] = [];
  for (const st of enemies) {
    defUnits.push({ key: st.key, power: st.power, count: st.count });
  }
  const defPowers = [...new Set(enemies.map((e) => e.power))];
  const defTechs = defPowers.length === 1 && defPowers[0] !== 'china' ? techsOf(s, defPowers[0] as PowerKey) : [];

  const battle = createBattle(
    { units: committed.map((u) => ({ ...u, power })), techs: techsOf(s, power) },
    { units: defUnits, techs: defTechs },
    { amphibious, seaCombat: targetSea },
  );
  // enemy units leave the board while the battle runs
  s.board[a.target] = stacksAt(s, a.target).filter((st) => sameSide(st.power, power));

  s.combat = {
    id: s.combatSeq++,
    space: a.target,
    attacker: power,
    from,
    amphibious,
    offloadFrom: a.offloadFrom,
    battle,
    attackerCommitted: committed,
  };
  s.contested.push(a.target);
  s.phase = 'battle';
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} attacks ${targetSea ? idx.seaZone[a.target]?.id ?? a.target : targetTerr!.name}.` });
  syncBattle(s);
  return OK;
}

// ---------- battle progression ----------

function syncBattle(s: AxisState): void {
  const c = s.combat;
  if (!c) return;
  s.pendings = s.pendings.filter((p) => !p.kind.startsWith('battle-'));
  const b = c.battle;
  if (b.status !== 'ongoing') {
    finishBattle(s);
    return;
  }
  if (b.decision) {
    const seatPower = b.decision.type === 'retreat'
      ? c.attacker
      : b.decision.side === 'attacker' ? c.attacker : defenderPowerOf(s, c);
    s.pendings.push({
      id: s.pendingSeq++,
      power: seatPower,
      kind: b.decision.type === 'casualties' ? 'battle-casualties' : b.decision.type === 'submerge' ? 'battle-submerge' : 'battle-retreat',
      data: { decision: b.decision },
    });
  }
}

function defenderPowerOf(s: AxisState, c: ActiveCombat): PowerKey | 'china' {
  const powers = [...new Set(c.battle.defender.filter((u) => u.hp > 0).map((u) => u.power))];
  return (powers[0] ?? 'china') as PowerKey | 'china';
}

function actBattleRoll(s: AxisState): ActionResult {
  const c = s.combat;
  if (!c || s.phase !== 'battle') return err('No battle running.');
  if (c.battle.decision) return err('A decision is pending.');
  const kind = currentStep(c.battle);
  if (!kind || kind === 'casualties') return err('Nothing to roll.');
  const dice = stepDice(c.battle, kind);
  resolveRoll(c.battle, dice.map(() => d6(s)));
  syncBattle(s);
  return OK;
}

function actBattleCasualties(s: AxisState, uids: number[]): ActionResult {
  const c = s.combat;
  if (!c || c.battle.decision?.type !== 'casualties') return err('No casualty pick pending.');
  applyCasualtyPicks(c.battle, uids);
  syncBattle(s);
  return OK;
}

function actBattleSubmerge(s: AxisState, uids: number[]): ActionResult {
  const c = s.combat;
  if (!c || c.battle.decision?.type !== 'submerge') return err('No submerge pending.');
  applySubmerge(c.battle, uids);
  syncBattle(s);
  return OK;
}

function actBattleRetreat(s: AxisState, retreat: boolean): ActionResult {
  const c = s.combat;
  if (!c || c.battle.decision?.type !== 'retreat') return err('No retreat pending.');
  applyRetreat(c.battle, retreat);
  syncBattle(s);
  return OK;
}

function finishBattle(s: AxisState): void {
  const c = s.combat!;
  const b = c.battle;
  const power = c.attacker;
  const survivorsAtk = b.attacker.filter((u) => u.hp > 0);
  const survivorsDef = b.defender.filter((u) => u.hp > 0);

  if (b.status === 'retreated' || b.status === 'defender_won' || b.status === 'standoff' || b.status === 'mutual') {
    // attacker survivors withdraw to the first origin space (rulebook: one
    // adjacent friendly space at least one unit came from)
    const home = c.from[0]?.space ?? c.space;
    for (const u of survivorsAtk) {
      if (b.status === 'standoff' && UNITS[u.key].domain === 'sea') {
        addUnits(s, c.space, power, u.key, 1); // may remain in the zone
      } else {
        addUnits(s, home, power, u.key, 1);
      }
    }
    // defender survivors return to the space
    for (const u of survivorsDef) addUnits(s, c.space, u.power as PowerKey | 'china', u.key, 1);
  } else {
    // attacker cleared or captured the space
    for (const u of survivorsAtk) addUnits(s, c.space, power, u.key, 1);
    if (b.status === 'attacker_captured' && !isSeaZoneId(c.space)) {
      captureTerritory(s, c.space, power);
    }
  }
  s.log.push({ round: s.round, power, text: battleOutcomeText(s, c) });
  s.combat = null;
  s.phase = 'combatMove';
}

function battleOutcomeText(s: AxisState, c: ActiveCombat): string {
  const name = c.space;
  switch (c.battle.status) {
    case 'attacker_captured': return `${POWERS[c.attacker].name} takes ${name}.`;
    case 'attacker_cleared': return `${POWERS[c.attacker].name} clears ${name} but cannot hold it.`;
    case 'defender_won': return `The attack on ${name} is repelled.`;
    case 'retreated': return `${POWERS[c.attacker].name} retreats from ${name}.`;
    case 'mutual': return `Mutual destruction at ${name}.`;
    case 'standoff': return `Standoff at ${name}.`;
    default: return `Battle at ${name} ends.`;
  }
}

function captureTerritory(s: AxisState, territory: string, by: PowerKey): void {
  const prev = s.control[territory];
  // liberation: originally another power on MY side -> revert to them unless
  // their capital is enemy-held
  // (idx not in scope here; original owner is read from setup control at
  //  create time via territory def — the engine keeps it in map data)
  s.control[territory] = by;
  if (prev && !sameSide(prev, by) && prev !== 'china') {
    const loser = s.powers[prev as PowerKey];
    void loser;
  }
  // capital capture: loot unspent IPCs of the ORIGINAL owner
  for (const pk of Object.keys(POWERS) as PowerKey[]) {
    if (POWERS[pk].capital === territory && !sameSide(pk, by)) {
      const looted = s.powers[pk].ipcs;
      s.powers[pk].ipcs = 0;
      s.powers[by].ipcs += looted;
      s.powers[pk].capitalHeldBy = by;
      s.log.push({ round: s.round, power: by, text: `${POWERS[by].name} captures ${POWERS[pk].name}'s capital and loots ${looted} IPCs.` });
    }
  }
}

// ---------- noncombat movement (also transport load/offload) ----------

function actMove(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'move' }>): ActionResult {
  if (s.phase !== 'noncombat' && s.phase !== 'combatMove') return err('Not a movement phase.');
  const power = activePower(s);
  for (const u of a.units) {
    if (unitCount(s, a.from, power, u.key) < u.count) return err(`Not enough ${UNITS[u.key].name} in ${a.from}.`);
  }
  // per-unit legality: destination must be reachable within move range through
  // legal intermediate spaces. MVP: 1-step adjacency, 2-step via `via`.
  for (const u of a.units) {
    const prof = UNITS[u.key];
    const domain = prof.domain === 'structure' ? 'land' : prof.domain;
    if (prof.domain === 'structure') return err('Industrial complexes cannot move.');
    const range = prof.move + (u.key === 'fighter' && techsOf(s, power).includes('longRangeAircraft') ? 2 : u.key === 'bomber' && techsOf(s, power).includes('longRangeAircraft') ? 2 : 0);
    const oneStep = neighborsFor(s, idx, a.from, domain as 'land' | 'sea' | 'air', power).includes(a.to);
    const viaOk = a.via
      ? neighborsFor(s, idx, a.from, domain as 'land' | 'sea' | 'air', power).includes(a.via)
        && neighborsFor(s, idx, a.via, domain as 'land' | 'sea' | 'air', power).includes(a.to)
      : false;
    if (!oneStep && !(viaOk && range >= 2)) return err(`${UNITS[u.key].name} cannot reach ${a.to}.`);
    if (domain === 'land') {
      const t = idx.territory[a.to];
      if (!t) return err('Land units need a territory.');
      const holder = s.control[a.to];
      if (s.phase === 'noncombat' && (holder == null || !sameSide(holder, power))) return err('Noncombat moves must end in friendly territory.');
      if (enemyUnitsAt(s, a.to, power).length > 0 && s.phase === 'noncombat') return err('Enemy units there — that is a combat move.');
      if (a.via) {
        if (u.key !== 'tank' && !(u.key === 'infantry' && techsOf(s, power).includes('mechanizedInfantry'))) return err('Only tanks (and mechanized infantry) move two spaces.');
        if (s.phase === 'noncombat' && enemyUnitsAt(s, a.via, power).length > 0) return err('Cannot pass through enemies in noncombat.');
      }
      if (u.key === 'aaGun' && s.phase !== 'noncombat') return err('AA guns move only in noncombat.');
    }
    if (domain === 'sea') {
      if (!isSeaZoneId(a.to)) return err('Ships stay at sea.');
      const hostileTo = seaZoneHostile(s, a.to, power);
      if (hostileTo && u.key !== 'submarine' && s.phase === 'noncombat') return err('Hostile sea zone.');
      if (a.via && seaZoneHostile(s, a.via, power) && u.key !== 'submarine') return err('Cannot pass through a hostile sea zone.');
    }
    // air landing legality is enforced at endPhase (stranded aircraft die),
    // and clients surface reachable landing spots; deliberate suicide moves
    // are rejected there.
  }
  for (const u of a.units) {
    removeUnits(s, a.from, power, u.key, u.count);
    addUnits(s, a.to, power, u.key, u.count);
  }
  return OK;
}

function actLoad(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'load' }>): ActionResult {
  if (s.phase !== 'combatMove' && s.phase !== 'noncombat') return err('Not a movement phase.');
  const power = activePower(s);
  const zone = idx.seaZone[a.zone];
  if (!zone) return err('Unknown sea zone.');
  if (!(zone.coastTo ?? []).includes(a.territory)) return err('That territory does not border the zone.');
  for (const u of a.units) {
    if (UNITS[u.key].domain !== 'land') return err('Transports carry land units.');
    if (unitCount(s, a.territory, power, u.key) < u.count) return err(`Not enough ${UNITS[u.key].name} there.`);
  }
  // capacity: 1 land unit + 1 extra infantry per transport
  const tps = stacksAt(s, a.zone).filter((st) => st.power === power && st.key === 'transport');
  if (!tps.length) return err('No transport in that zone.');
  // flatten capacity check across transports
  const cargoNow = tps.flatMap((st) => st.cargo ?? []);
  const nonInfNow = cargoNow.filter((c) => c.key !== 'infantry').reduce((n, c) => n + c.count, 0);
  const infNow = cargoNow.filter((c) => c.key === 'infantry').reduce((n, c) => n + c.count, 0);
  const tpCount = tps.reduce((n, st) => n + st.count, 0);
  const nonInfNew = a.units.filter((u) => u.key !== 'infantry').reduce((n, u) => n + u.count, 0);
  const infNew = a.units.filter((u) => u.key === 'infantry').reduce((n, u) => n + u.count, 0);
  if (nonInfNow + nonInfNew > tpCount) return err('Each transport carries one land unit plus one infantry.');
  if (infNow + infNew > tpCount * 2 - (nonInfNow + nonInfNew)) return err('Not enough transport capacity.');
  // load onto the first transport stack (cargo tracked per power in the zone)
  for (const u of a.units) {
    removeUnits(s, a.territory, power, u.key, u.count);
    const st = tps[0];
    st.cargo ??= [];
    const c = st.cargo.find((x) => x.key === u.key && x.power === power);
    if (c) c.count += u.count;
    else st.cargo.push({ power, key: u.key, count: u.count });
  }
  return OK;
}

function actOffload(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'offload' }>): ActionResult {
  if (s.phase !== 'noncombat') return err('Peacetime offloads happen in noncombat (amphibious assaults use attack).');
  const power = activePower(s);
  const zone = idx.seaZone[a.zone];
  if (!zone) return err('Unknown sea zone.');
  if (!(zone.coastTo ?? []).includes(a.territory)) return err('That territory does not border the zone.');
  const holder = s.control[a.territory];
  if (holder == null || !sameSide(holder, power)) return err('Offload into friendly territory only.');
  const tps = stacksAt(s, a.zone).filter((st) => st.power === power && st.key === 'transport');
  for (const u of a.units) {
    let left = u.count;
    for (const st of tps) {
      for (const c of st.cargo ?? []) {
        if (c.key !== u.key || c.power !== power || left === 0) continue;
        const take = Math.min(c.count, left);
        c.count -= take;
        left -= take;
      }
      st.cargo = (st.cargo ?? []).filter((c) => c.count > 0);
    }
    if (left > 0) return err(`Not enough ${UNITS[u.key].name} aboard.`);
    addUnits(s, a.territory, power, u.key, u.count);
  }
  return OK;
}

// ---------- mobilize ----------

function actPlace(s: AxisState, idx: MapIndex, a: Extract<AxisAction, { type: 'place' }>): ActionResult {
  if (s.phase !== 'mobilize') return err('Not the mobilize phase.');
  const power = activePower(s);
  const p = s.powers[power];
  if ((p.staging[a.key] ?? 0) < a.count) return err('Not that many staged.');
  const prof = UNITS[a.key];
  const sea = prof.domain === 'sea';
  // find the governing factory territory
  const factoryTerr = sea
    ? (idx.seaZone[a.space]?.coastTo ?? []).find((t) => s.control[t] === power && unitCount(s, t, null, 'factory') > 0)
    : a.space;
  if (!factoryTerr) return err('No friendly industrial complex adjacent to that zone.');
  if (!sea) {
    if (s.control[a.space] !== power) return err('Place at your own industrial complexes.');
    if (a.key === 'factory') {
      const t = idx.territory[a.space];
      if (!t || t.ipc < 1) return err('New complexes need a territory worth at least 1 IPC.');
      if (unitCount(s, a.space, null, 'factory') > 0) return err('One complex per territory.');
    } else if (unitCount(s, a.space, null, 'factory') === 0) {
      return err('Units enter play at industrial complexes.');
    }
  }
  if (a.key !== 'factory') {
    const t = idx.territory[factoryTerr]!;
    const cap = t.ipc + (p.techs.includes('increasedFactory') ? 2 : 0) - (s.factoryDamage[factoryTerr] ?? 0);
    const used = p.factoriesUsed[factoryTerr] ?? 0;
    if (used + a.count > cap) return err(`That complex can mobilize ${Math.max(0, cap - used)} more unit(s) this turn.`);
    p.factoriesUsed[factoryTerr] = used + a.count;
  }
  p.staging[a.key]! -= a.count;
  if (p.staging[a.key] === 0) delete p.staging[a.key];
  addUnits(s, a.space, power, a.key, a.count);
  return OK;
}

// ---------- income + turn advance ----------

function objectiveMet(s: AxisState, idx: MapIndex, o: (typeof OBJECTIVES)[number]): boolean {
  const side = POWERS[o.power].coalition;
  const holds = (t: string) => {
    const h = s.control[t];
    return h != null && coalitionOf(h) === side;
  };
  if (o.special === 'anyOriginallyJapanese') {
    return idx.map.territories.some((t) => t.originalOwner === 'japan' && holds(t.id));
  }
  if (o.special === 'sovietsOnlyAndArchangel') {
    if (s.control['archangel'] !== 'ussr') return false;
    for (const t of idx.map.territories) {
      if (s.control[t.id] !== 'ussr') continue;
      const foreign = stacksAt(s, t.id).some((st) => st.power !== 'ussr' && coalitionOf(st.power) === 'allies');
      if (foreign) return false;
    }
    return true;
  }
  let met: boolean;
  if (o.kind === 'all') met = o.territories.every(holds);
  else if (o.kind === 'atLeast') met = o.territories.filter(holds).length >= (o.n ?? 1);
  else met = o.territories.some(holds);
  if (met && o.special === 'noEnemySurfaceWarshipsSz131415') {
    for (const sz of ['sz-13', 'sz-14', 'sz-15']) {
      const enemyShips = stacksAt(s, sz).some((st) => coalitionOf(st.power) !== side && SURFACE_WARSHIPS.includes(st.key));
      if (enemyShips) return false;
    }
  }
  return met;
}

function collectIncome(s: AxisState, idx: MapIndex): void {
  const power = activePower(s);
  const p = s.powers[power];
  let income = 0;
  if (!p.capitalHeldBy) {
    income = productionOf(s, idx, power);
    if (s.options.nationalObjectives) {
      for (const o of OBJECTIVES) {
        if (o.power === power && objectiveMet(s, idx, o)) {
          income += o.bonus;
          s.log.push({ round: s.round, power, text: `National objective met: +${o.bonus} IPCs.` });
        }
      }
    }
    if (p.techs.includes('warBonds')) {
      const bond = d6(s);
      income += bond;
      s.log.push({ round: s.round, power, text: `War bonds: +${bond} IPCs.` });
    }
  }
  p.ipcs += income;
  p.lastIncome = income;
  s.log.push({ round: s.round, power, text: `${POWERS[power].name} collects ${income} IPCs.` });
}

// China: 1 new infantry per 2 non-Axis Chinese territories, placed during the
// US mobilize (engine: granted at the start of the US mobilize phase into a
// staging count the US player places with the china power tag).
export function chinaInfantryGrant(s: AxisState, idx: MapIndex): number {
  const n = idx.map.territories.filter((t) => t.isChinese && (() => {
    const h = s.control[t.id];
    return h != null && coalitionOf(h) === 'allies';
  })()).length;
  return Math.floor(n / CHINA_RULES.infantryPerTerritories);
}

function destroyStrandedAircraft(s: AxisState, idx: MapIndex): void {
  // At the end of noncombat: any fighter/bomber in a space where it cannot be
  // (hostile territory, or sea zone without a friendly carrier slot) dies.
  const power = activePower(s);
  for (const [space, stacks] of Object.entries(s.board)) {
    for (const st of [...stacks]) {
      if (st.power !== power || (st.key !== 'fighter' && st.key !== 'bomber')) continue;
      if (isSeaZoneId(space)) {
        if (st.key === 'bomber') {
          removeUnits(s, space, power, st.key, st.count);
          s.log.push({ round: s.round, power, text: `${st.count} bomber(s) lost at sea.` });
          continue;
        }
        // fighters need carrier slots (2 per carrier, friendly)
        const carriers = stacksAt(s, space).filter((c) => sameSide(c.power, power) && c.key === 'carrier').reduce((n, c) => n + c.count, 0);
        const fighters = stacksAt(s, space).filter((c) => sameSide(c.power, power) && c.key === 'fighter').reduce((n, c) => n + c.count, 0);
        const over = fighters - carriers * 2;
        if (over > 0) {
          removeUnits(s, space, power, 'fighter', Math.min(over, st.count));
          s.log.push({ round: s.round, power, text: `${Math.min(over, st.count)} fighter(s) ditch at sea — no carrier deck.` });
        }
      } else {
        const holder = s.control[space];
        if (holder == null || !sameSide(holder, power)) {
          removeUnits(s, space, power, st.key, st.count);
          s.log.push({ round: s.round, power, text: `${st.count} aircraft stranded over ${idx.territory[space]?.name ?? space} are lost.` });
        }
      }
    }
  }
}

function actEndPhase(s: AxisState, idx: MapIndex): ActionResult {
  const power = activePower(s);
  switch (s.phase) {
    case 'rnd': {
      const flag = s as AxisState & { awaitingChart?: boolean };
      if (flag.awaitingChart) return err('Choose a breakthrough chart first.');
      s.phase = 'purchase';
      return OK;
    }
    case 'purchase':
      s.phase = 'combatMove';
      return OK;
    case 'combatMove':
      if (s.combat) return err('Resolve the battle first.');
      s.phase = 'noncombat';
      return OK;
    case 'battle':
      return err('Resolve the battle first.');
    case 'noncombat':
      destroyStrandedAircraft(s, idx);
      s.phase = 'mobilize';
      return OK;
    case 'mobilize': {
      s.phase = 'income';
      collectIncome(s, idx);
      // advance to the next power
      const order = TURN_ORDER[s.options.scenario];
      s.powers[power].factoriesUsed = {};
      s.contested = [];
      // clear per-turn movement marks
      for (const stacks of Object.values(s.board)) for (const st of stacks) delete st.moved;
      if (s.turnIdx === order.length - 1) {
        checkVictory(s, idx);
        if (s.winner) return OK;
        s.round += 1;
        s.turnIdx = 0;
      } else {
        s.turnIdx += 1;
      }
      s.phase = s.options.rnd ? 'rnd' : 'purchase';
      s.log.push({ round: s.round, power: activePower(s), text: `${POWERS[activePower(s)].name} is up.` });
      return OK;
    }
    case 'income':
      return OK;
    default:
      return err('Game over.');
  }
}

// ---------- dispatcher ----------

export function applyAxisAction(s: AxisState, idx: MapIndex, seat: PowerKey, action: AxisAction): ActionResult {
  if (s.phase === 'gameOver') return err('The game is over.');
  const active = activePower(s);
  // battle decisions may belong to the defender; everything else to the active power
  const battleDecisionSeat = s.pendings.find((p) => p.kind.startsWith('battle-'))?.power;
  const isBattleDecision = action.type === 'battleCasualties' || action.type === 'battleSubmerge' || action.type === 'battleRetreat';
  if (isBattleDecision) {
    if (seat !== battleDecisionSeat && battleDecisionSeat !== 'china') return err('Not your decision.');
  } else if (seat !== active) {
    return err(`It is ${POWERS[active].name}'s turn.`);
  }

  switch (action.type) {
    case 'buyResearch': return actBuyResearch(s, idx, action.dice);
    case 'chooseChart': return actChooseChart(s, action.chart);
    case 'buy': return actBuy(s, action.key, action.count);
    case 'unbuy': return actUnbuy(s, action.key, action.count);
    case 'repair': return actRepair(s, idx, action.territory, action.count);
    case 'attack': return actAttack(s, idx, action);
    case 'battleRoll': return actBattleRoll(s);
    case 'battleCasualties': return actBattleCasualties(s, action.uids);
    case 'battleSubmerge': return actBattleSubmerge(s, action.uids);
    case 'battleRetreat': return actBattleRetreat(s, action.retreat);
    case 'move': return actMove(s, idx, action);
    case 'load': return actLoad(s, idx, action);
    case 'offload': return actOffload(s, idx, action);
    case 'place': return actPlace(s, idx, action);
    case 'endPhase': return actEndPhase(s, idx);
    default: return err('Unknown action.');
  }
}

export { CAN_CAPTURE, TECH_BY_KEY };
