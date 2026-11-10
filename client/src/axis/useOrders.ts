// The order model behind the command map: which pieces are in hand, where they may legally go,
// and the exact engine actions an order turns into. It holds no interface of its own. The map
// reports taps and drags, this decides what they mean, and the screen draws the result.
// Legality mirrors the engine through the shared rule helpers, so an order the map offers is one
// the server accepts.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AXIS_INDEX, AXIS_MAP, POWERS, UNITS,
  airReachableDistances, airUnitRange, axisPieceSelectionSignature, enumerateAxisPhysicalPieces, sameAxisSide,
  chinaFighterAttackHasLanding, chinaReachableDistances, isChinaFriendlyLandingTerritory, isChinaOperatingTerritory,
  validateAirAttackLanding, validateAirNoncombatLanding,
  type AirUnitGroup, type AirUnitKey, type AxisAction, type AxisMovementUnit, type AxisPhysicalPiece, type AxisSeaUnitKey,
  type AxisUnitPick, type AxisView, type CarrierMoveProjection, type PowerKey, type UnitKey, type UnitStack,
} from '@bge/shared';
import { buildExactUnitPick, resizeOrdinalSelection, toggleOrdinalSelection } from './axisSelection';
import { strandedAircraft } from './axisAirLanding';
import { axisCarrierLandingPlans, axisCarrierSelectedFighters, type AxisCarrierLandingPlan } from './axisCarrierPresentation';
import { axisLandTwoStepTargets, axisSeaRouteTargets, axisSurfaceHostileSea, axisUniqueTargetForMapPick } from './axisMovementTargets';
import {
  buildAxisTransportLoadAction, buildAxisTransportOffloadAction, listAxisTransportHullCards, sameAxisTransportRef,
  setAxisTransportHullUnits, toggleAxisTransportHull,
  type AxisTransportCargoOrder, type AxisTransportHullCard, type AxisTransportRouteOrder,
} from './axisTransportOrders';
import { axisRocketLauncherCards, axisStrategicRaidTargetAvailable, buildAxisRocketStrikeAction } from './axisSpecialTechnologyPresentation';
import { axisParatrooperCommonTargets, axisParatrooperPairCards, buildAxisParatrooperGroups } from './axisParatrooperPresentation';
import type { PieceHit, StageArrow, Tone } from './MapStage';
import { TERR, ZONE, isSea, sideOf, spaceName } from './world';

export type Act = (a: AxisAction & { asPower?: PowerKey }) => void;
export type OrderMode = 'combat' | 'noncombat';

type TakeKey = string; // `${space}|${unit}`
const keySpace = (k: TakeKey) => k.slice(0, k.indexOf('|'));
const keyUnit = (k: TakeKey) => k.slice(k.indexOf('|') + 1) as UnitKey;
const SEA_KEYS: UnitKey[] = ['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];
const AIR_KEYS: UnitKey[] = ['fighter', 'bomber'];
const isAirKey = (key: UnitKey): key is AirUnitKey => key === 'fighter' || key === 'bomber';

export interface OrderTarget {
  id: string;
  via?: string;
  /** Ingress chosen for each origin; null is a direct route. */
  routeByOrigin?: Record<string, string | null>;
  amphibious?: boolean;
  offloadZone?: string;
  sbr?: boolean;
  raidUnavailable?: boolean;
  /** Landing on a carrier that was bought this turn, when no ordinary landing exists. */
  carrierPlans?: AxisCarrierLandingPlan[];
}

export interface PickedGroup { space: string; key: UnitKey; count: number; max: number }

function neighborsOf(id: string): string[] {
  const t = TERR[id];
  if (t) return [...t.adj, ...(t.coastTo ?? [])];
  const z = ZONE[id];
  if (z) return [...z.adj, ...(z.coastTo ?? [])];
  return [];
}

export function useOrders(view: AxisView, act: Act, mode: OrderMode, enabled: boolean) {
  const me = view.operatingPower ?? view.active;
  const techs = me === 'china' ? [] : view.powers[me].techs;
  const mySide = sideOf(me);

  const [take, setTake] = useState<Record<TakeKey, Set<number>>>({});
  const takeSignatures = useRef<Record<TakeKey, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [transportOrders, setTransportOrders] = useState<Record<string, AxisTransportCargoOrder[]>>({});
  const [loadTarget, setLoadTarget] = useState<{ zone: string; territory: string } | null>(null);
  const [loadOrders, setLoadOrders] = useState<AxisTransportCargoOrder[]>([]);
  const [pending, setPending] = useState<OrderTarget | null>(null);
  const [choices, setChoices] = useState<OrderTarget[] | null>(null);
  const [carrierPlanKey, setCarrierPlanKey] = useState<string | null>(null);
  const [sbrAsk, setSbrAsk] = useState<string | null>(null);
  const [rocketKey, setRocketKey] = useState<string | null>(null);
  const [rocketTarget, setRocketTarget] = useState<string | null>(null);
  const [paraKeys, setParaKeys] = useState<string[]>([]);
  const [paraTarget, setParaTarget] = useState<string | null>(null);
  const [paraSupportKeys, setParaSupportKeys] = useState<string[]>([]);
  const [confirmStranded, setConfirmStranded] = useState(false);

  const reset = () => {
    setTake({});
    takeSignatures.current = {};
    setFocus(null);
    setTransportOrders({});
    setLoadTarget(null);
    setLoadOrders([]);
    setPending(null);
    setChoices(null);
    setCarrierPlanKey(null);
    setSbrAsk(null);
    setRocketKey(null);
    setRocketTarget(null);
    setParaKeys([]);
    setParaTarget(null);
    setParaSupportKeys([]);
  };
  useEffect(() => { reset(); setConfirmStranded(false); }, [me, mode, enabled]);

  // ---------- what can be picked up ----------

  const myStacksAt = (id: string): UnitStack[] => (view.board[id] ?? []).filter((s) => s.power === me);
  const availableInStack = (stack: UnitStack) => Math.max(0, stack.count - (stack.moved ?? 0));
  const selectableUnit = (stack: { key: UnitKey }) =>
    stack.key !== 'factory'
    && !(mode === 'combat' && stack.key === 'aaGun')
    && (me !== 'china' || stack.key === 'infantry' || stack.key === 'fighter');
  const availableCount = (id: string, key: UnitKey) => myStacksAt(id)
    .filter((stack) => stack.key === key && selectableUnit(stack))
    .reduce((total, stack) => total + availableInStack(stack), 0);
  const availableUnitsAt = (id: string): { key: UnitKey; count: number }[] => {
    const counts = new Map<UnitKey, number>();
    for (const stack of myStacksAt(id)) {
      if (!selectableUnit(stack)) continue;
      const n = availableInStack(stack);
      if (n > 0) counts.set(stack.key, (counts.get(stack.key) ?? 0) + n);
    }
    return [...counts].map(([key, count]) => ({ key, count }));
  };

  const hullCardsAt = (id: string): AxisTransportHullCard[] => (me === 'china' ? [] : listAxisTransportHullCards(id, view.board[id] ?? [], me, mode));
  const surfaceHostileSea = (id: string) => axisSurfaceHostileSea(view, me, id);

  const origins = useMemo(
    () => (enabled ? Object.keys(view.board).filter((id) =>
      availableUnitsAt(id).length > 0 || hullCardsAt(id).some((card) => card.canOffload && card.manifest.some((cargo) => cargo.power === me))) : []),
    [view.board, me, mode, enabled],
  );

  const enemyAt = (id: string) => (view.board[id] ?? []).some((s) => sideOf(s.power) !== mySide);
  const hostileControl = (id: string) => {
    const h = view.control[id];
    return !isSea(id) && h != null && sideOf(h) !== mySide;
  };
  const friendly = (id: string) => {
    if (isSea(id)) return !surfaceHostileSea(id);
    const h = view.control[id];
    return h != null && sideOf(h) === mySide;
  };
  const passable = (id: string) => !TERR[id]?.isImpassable && (isSea(id) || TERR[id]?.originalOwner != null || view.control[id] != null);

  // ---------- the force in hand ----------

  const ordinaryPicked = Object.entries(take).filter(([, o]) => o.size > 0).map(([k, o]) => [k, o.size] as [TakeKey, number]);
  const cargoSpaces = Object.keys(transportOrders);
  const pickedSpaces = [...new Set([...ordinaryPicked.map(([k]) => keySpace(k)), ...cargoSpaces])];
  const picked: PickedGroup[] = ordinaryPicked.map(([k, count]) => ({ space: keySpace(k), key: keyUnit(k), count, max: availableCount(keySpace(k), keyUnit(k)) }));
  const cargoPicked: { space: string; key: UnitKey; count: number }[] = Object.entries(transportOrders).flatMap(([space, orders]) => {
    const totals = new Map<UnitKey, number>();
    for (const order of orders) for (const unit of order.units) totals.set(unit.key, (totals.get(unit.key) ?? 0) + unit.count);
    return [...totals].map(([key, count]) => ({ space, key, count }));
  });
  const anyCargo = cargoPicked.length > 0;
  const onlyBombers = picked.length > 0 && picked.every((p) => p.key === 'bomber') && !anyCargo;

  const selectedPhysical = useMemo(() => {
    const result: (AxisPhysicalPiece & { space: string })[] = [];
    for (const [takeKey, ordinals] of Object.entries(take)) {
      const space = keySpace(takeKey);
      const key = keyUnit(takeKey);
      for (const piece of enumerateAxisPhysicalPieces(view.board[space] ?? [])) {
        if (!piece.available || piece.power !== me || piece.key !== key || piece.ordinal == null) continue;
        if (ordinals.has(piece.ordinal)) result.push({ ...piece, space });
      }
    }
    return result;
  }, [take, view.board, me]);
  const selectedAir: AirUnitGroup[] = selectedPhysical.filter((p) => isAirKey(p.key))
    .map((p) => ({ from: p.space, key: p.key as AirUnitKey, count: 1, movementSpent: p.movementSpent }));
  const selectedCarrierFighters = me === 'china' ? [] : axisCarrierSelectedFighters(selectedPhysical);
  const carrierPlansFor = (target: string) => (me === 'china' ? [] : axisCarrierLandingPlans({
    view, idx: AXIS_INDEX, power: me, fighters: selectedCarrierFighters, mode, target,
  }));
  const carrierMovesTo = (destination: string): CarrierMoveProjection[] => selectedPhysical
    .filter((p) => p.key === 'carrier')
    .map((p) => ({
      from: p.space, to: destination, count: 1,
      cargoFighters: (p.cargo ?? []).filter((c) => c.key === 'fighter' && sameAxisSide(c.power, me)).reduce((n, c) => n + c.count, 0),
    }));

  // A second controller can change the board while an order is being built. A selection whose
  // stack changed is dropped rather than quietly moving to a different piece.
  const selectionSignatures = useMemo(() => {
    const signatures: Record<TakeKey, string> = {};
    for (const [space, stacks] of Object.entries(view.board)) {
      const keys = new Set<UnitKey>();
      for (const stack of stacks) if (stack.power === me && selectableUnit(stack)) keys.add(stack.key);
      for (const key of keys) signatures[`${space}|${key}`] = axisPieceSelectionSignature(stacks, me, key);
    }
    return signatures;
  }, [view.board, me, mode]);
  const previousSignatures = useRef(selectionSignatures);
  useEffect(() => {
    const previous = previousSignatures.current;
    setTake((current) => {
      let changed = false;
      const next: Record<TakeKey, Set<number>> = {};
      for (const [key, ordinals] of Object.entries(current)) {
        if (previous[key] !== selectionSignatures[key]) { changed = true; delete takeSignatures.current[key]; continue; }
        const max = availableCount(keySpace(key), keyUnit(key));
        const valid = new Set([...ordinals].filter((o) => o >= 0 && o < max));
        if (valid.size > 0) next[key] = valid;
        else delete takeSignatures.current[key];
        if (valid.size !== ordinals.size) changed = true;
      }
      return changed ? next : current;
    });
    previousSignatures.current = selectionSignatures;
  }, [selectionSignatures]);
  useEffect(() => {
    setTransportOrders((current) => {
      let changed = false;
      const next: Record<string, AxisTransportCargoOrder[]> = {};
      for (const [space, orders] of Object.entries(current)) {
        const cards = hullCardsAt(space);
        const valid = orders.filter((order) => {
          const card = cards.find((c) => sameAxisTransportRef(c, order));
          if (!card || !card.canOffload || card.selectionSig !== order.selectionSig) return false;
          return order.units.every((unit) => unit.count <= (card.cargo.find((c) => c.key === unit.key)?.count ?? 0));
        });
        if (valid.length) next[space] = valid;
        if (valid.length !== orders.length) changed = true;
      }
      return changed ? next : current;
    });
  }, [view.board, me, mode]);

  // ---------- where it may go ----------

  interface TransportRoute { zone: string; via?: string }
  const transportRoutesFrom = (space: string): TransportRoute[] => {
    const selected = transportOrders[space] ?? [];
    if (!isSea(space) || selected.length === 0) return [];
    const cards = hullCardsAt(space);
    const allMovable = selected.every((order) => cards.find((card) => sameAxisTransportRef(card, order))?.movable === true);
    const routes = new Map<string, TransportRoute>();
    if (!surfaceHostileSea(space)) routes.set(space, { zone: space });
    if (!allMovable) return [...routes.values()];
    for (const route of axisSeaRouteTargets({ snapshot: view, idx: AXIS_INDEX, power: me, from: space, units: ['transport'], phase: 'noncombat' })) {
      routes.set(`${route.id}|${route.via ?? ''}`, { zone: route.id, ...(route.via ? { via: route.via } : {}) });
    }
    return [...routes.values()];
  };

  const targetsFor = (space: string): OrderTarget[] => {
    const selectedHere: AxisMovementUnit[] = picked.filter((p) => p.space === space).map((p) => ({ key: p.key, count: p.count }));
    const cargoHere = (transportOrders[space] ?? []).length > 0;
    if (selectedHere.length === 0 && !cargoHere) return [];
    const own = selectedHere.map((u) => u.key);
    const landUnits = selectedHere.filter((u) => UNITS[u.key].domain === 'land');
    const seaUnits = selectedHere.filter((u) => UNITS[u.key].domain === 'sea').map((u) => u.key as AxisSeaUnitKey);
    const shipsOnly = own.length > 0 && own.every((k) => SEA_KEYS.includes(k)) && !cargoHere;
    const bombardmentGroup = seaUnits.length > 0
      && seaUnits.every((key) => key === 'battleship' || key === 'cruiser')
      && own.every((key) => SEA_KEYS.includes(key) || AIR_KEYS.includes(key))
      && !cargoHere;
    const airOnly = own.length > 0 && own.every((k) => AIR_KEYS.includes(k)) && !cargoHere;
    const landHere = own.some((k) => !SEA_KEYS.includes(k) && !AIR_KEYS.includes(k));
    const seaOrigin = isSea(space);
    const out: OrderTarget[] = [];
    const chinaAllowed = (id: string) => me !== 'china' || (!isSea(id) && Boolean(TERR[id]) && isChinaOperatingTerritory(TERR[id]));
    const enemyFactory = (id: string) => !isSea(id) && hostileControl(id) && (view.board[id] ?? []).some((s) => s.key === 'factory');
    const sbrTarget = (id: string) => me !== 'china' && enemyFactory(id) && axisStrategicRaidTargetAvailable(view, me, id);
    const airHere = selectedAir.filter((u) => u.from === space);
    const airRange = airHere.length > 0
      ? Math.min(...airHere.map((u) => Math.max(0, (me === 'china' ? UNITS.fighter.move : airUnitRange(u.key, techs)) - (u.movementSpent ?? 0))))
      : 0;
    const addAirTargets = (predicate: (id: string) => boolean) => {
      const reachable = me === 'china'
        ? chinaReachableDistances(AXIS_MAP.territories, space, airRange)
        : airReachableDistances(AXIS_INDEX, space, airRange);
      for (const [id] of reachable) {
        if (id === space || !chinaAllowed(id) || !predicate(id) || out.some((t) => t.id === id)) continue;
        const raidFactory = mode === 'combat' && onlyBombers && enemyFactory(id);
        out.push({ id, sbr: raidFactory && sbrTarget(id), ...(raidFactory && !sbrTarget(id) ? { raidUnavailable: true } : {}) });
      }
    };

    if (mode === 'combat') {
      const want = (id: string) => (isSea(id) ? enemyAt(id) : enemyAt(id) || hostileControl(id));
      if (airOnly) {
        addAirTargets((id) => want(id) && (isSea(id) || passable(id)));
        return out;
      }
      if (seaOrigin) {
        if (cargoHere) {
          for (const route of transportRoutesFrom(space)) {
            for (const t of ZONE[route.zone]?.coastTo ?? []) {
              if (want(t) && passable(t) && !out.some((o) => o.id === t && o.offloadZone === route.zone && o.via === route.via)) {
                out.push({ id: t, amphibious: true, offloadZone: route.zone, ...(route.via ? { via: route.via } : {}) });
              }
            }
          }
        }
        if (shipsOnly || (own.length > 0 && !cargoHere)) {
          for (const route of axisSeaRouteTargets({ snapshot: view, idx: AXIS_INDEX, power: me, from: space, units: seaUnits, phase: 'combatMove' })) {
            if (want(route.id)) out.push(route);
          }
        }
        if (bombardmentGroup && cargoSpaces.some((o) => transportRoutesFrom(o).some((route) => route.zone === space))) {
          for (const territory of ZONE[space]?.coastTo ?? []) if (want(territory) && passable(territory)) out.push({ id: territory });
        }
        return out;
      }
      for (const n of neighborsOf(space)) {
        if (isSea(n) && landHere) continue;
        if (!isSea(n) && !passable(n)) continue;
        if (chinaAllowed(n) && want(n)) out.push({ id: n, sbr: onlyBombers && sbrTarget(n) });
      }
      for (const route of axisLandTwoStepTargets({ snapshot: view, idx: AXIS_INDEX, power: me, from: space, units: landUnits, techs, phase: 'combatMove' })) {
        if (want(route.id) && passable(route.id)) out.push(route);
      }
      return out;
    }

    // Noncombat: never into or through hostile or neutral ground.
    if (airOnly) {
      addAirTargets((id) => (me === 'china'
        ? !isSea(id) && isChinaFriendlyLandingTerritory(TERR[id], view.control, view.contested) && !enemyAt(id)
        : isSea(id)
          ? friendly(id) || carrierPlansFor(id).length > 0
          : friendly(id) && !enemyAt(id) && passable(id)));
      return out;
    }
    if (seaOrigin) {
      if (cargoHere && !surfaceHostileSea(space)) {
        for (const t of ZONE[space]?.coastTo ?? []) if (!isSea(t) && friendly(t) && !enemyAt(t)) out.push({ id: t, offloadZone: space });
      }
      if (shipsOnly || (own.length > 0 && !cargoHere)) {
        out.push(...axisSeaRouteTargets({ snapshot: view, idx: AXIS_INDEX, power: me, from: space, units: seaUnits, phase: 'noncombat' }));
      }
      return out;
    }
    for (const n of neighborsOf(space)) {
      if (isSea(n)) continue;
      if (chinaAllowed(n) && friendly(n) && !enemyAt(n) && passable(n)) out.push({ id: n });
    }
    for (const route of axisLandTwoStepTargets({ snapshot: view, idx: AXIS_INDEX, power: me, from: space, units: landUnits, techs, phase: 'noncombat' })) {
      if (friendly(route.id) && !enemyAt(route.id) && passable(route.id)) out.push(route);
    }
    return out;
  };

  // One order, one destination: it must be reachable by every origin in the force.
  const targets = useMemo((): OrderTarget[] => {
    if (!enabled || pickedSpaces.length === 0) return [];
    let acc: OrderTarget[] | null = null;
    for (const space of pickedSpaces) {
      const ts = targetsFor(space);
      if (acc == null) {
        acc = ts.map((t) => ({ ...t, routeByOrigin: { [space]: t.via ?? null } }));
        continue;
      }
      const combined: OrderTarget[] = [];
      for (const t of acc) {
        for (const other of ts) {
          if (t.id !== other.id || (t.offloadZone && other.offloadZone && t.offloadZone !== other.offloadZone)) continue;
          combined.push({
            ...t,
            amphibious: t.amphibious || other.amphibious,
            offloadZone: t.offloadZone ?? other.offloadZone,
            sbr: (t.sbr ?? false) && (other.sbr ?? false),
            raidUnavailable: t.raidUnavailable || other.raidUnavailable,
            routeByOrigin: { ...(t.routeByOrigin ?? {}), [space]: other.via ?? null },
          });
        }
      }
      acc = combined;
    }
    const merged = acc ?? [];
    if (selectedAir.length === 0) return merged;
    return merged.flatMap((target) => {
      if (me === 'china') {
        if (mode === 'noncombat') return isChinaFriendlyLandingTerritory(TERR[target.id], view.control, view.contested) ? [target] : [];
        const contested = [...new Set([...view.contested, target.id])];
        return selectedAir.every((unit) => unit.key === 'fighter' && chinaFighterAttackHasLanding({
          territories: AXIS_MAP.territories, control: view.control, contested,
          from: unit.from, target: target.id, movementSpent: unit.movementSpent, range: UNITS.fighter.move,
        })) ? [target] : [];
      }
      const ordinaryAir = selectedPhysical.filter((p) => isAirKey(p.key)).map((p) => ({
        from: p.space, key: p.key as AirUnitKey, count: 1, movementSpent: p.movementSpent,
        ...((mode === 'combat' && p.carrierLanding) || (mode === 'noncombat' && p.carrierLanding?.seaZone === target.id)
          ? { futureCarrierZone: p.carrierLanding!.seaZone } : {}),
      }));
      const args = { snapshot: view, idx: AXIS_INDEX, power: me, techs, air: ordinaryAir, carrierMoves: carrierMovesTo(target.id) };
      const ordinary = mode === 'combat'
        ? validateAirAttackLanding({ ...args, target: target.id }).ok
        : validateAirNoncombatLanding({ ...args, destination: target.id }).ok;
      if (ordinary) return [target];
      const carrierPlans = carrierPlansFor(target.id).filter((plan) => {
        const futureAir = selectedAir.map((unit) => (unit.key === 'fighter' ? { ...unit, futureCarrierZone: plan.zone } : unit));
        const futureArgs = { ...args, air: futureAir };
        return mode === 'combat'
          ? validateAirAttackLanding({ ...futureArgs, target: target.id }).ok
          : validateAirNoncombatLanding({ ...futureArgs, destination: target.id }).ok;
      });
      return carrierPlans.length > 0 ? [{ ...target, carrierPlans }] : [];
    });
  }, [take, transportOrders, mode, view, techs.join(','), me, enabled]);

  /** Sea zones where the land units in hand can board a transport. */
  const loadZones = useMemo(() => {
    if (!enabled || me === 'china' || anyCargo || pickedSpaces.length !== 1) return [];
    const origin = pickedSpaces[0];
    if (isSea(origin)) return [];
    if (picked.length === 0 || picked.some((p) => UNITS[p.key].domain !== 'land')) return [];
    return (TERR[origin]?.coastTo ?? []).filter((z) =>
      !surfaceHostileSea(z) && hullCardsAt(z).some((card) => card.canLoad && (mode === 'noncombat' || (card.owner === me && card.movable))));
  }, [take, transportOrders, mode, view.board, enabled, me]);

  const selectedCarrierPlanFor = (t: OrderTarget): AxisCarrierLandingPlan | undefined =>
    t.carrierPlans?.find((plan) => plan.key === carrierPlanKey) ?? t.carrierPlans?.[0];
  const routeViaFor = (t: OrderTarget, space: string): string | undefined => {
    if (t.routeByOrigin && Object.prototype.hasOwnProperty.call(t.routeByOrigin, space)) return t.routeByOrigin[space] ?? undefined;
    return t.via;
  };
  const routeLabel = (t: OrderTarget): string => {
    const parts: string[] = [];
    const routes = Object.entries(t.routeByOrigin ?? {}).filter((e): e is [string, string] => e[1] != null);
    if (routes.length === 1 && pickedSpaces.length === 1) parts.push(`through ${spaceName(routes[0][1])}`);
    else if (routes.length) parts.push(routes.map(([from, via]) => `${spaceName(from)} through ${spaceName(via)}`).join(', '));
    if (t.offloadZone) parts.push(`landing from ${spaceName(t.offloadZone)}`);
    return parts.join(', ');
  };

  const choose = (t: OrderTarget) => {
    setChoices(null);
    setPending(t);
    setCarrierPlanKey(t.carrierPlans?.[0]?.key ?? null);
  };

  // ---------- turning the order into actions ----------

  const exactUnitPick = (takeKey: TakeKey): AxisUnitPick => {
    // The signature is the one captured when the first piece was picked up, so a board change
    // since then is rejected by the server instead of moving a different piece.
    const signature = takeSignatures.current[takeKey] ?? previousSignatures.current[takeKey];
    return buildExactUnitPick(keyUnit(takeKey), take[takeKey] ?? new Set(), signature);
  };
  const exactOwnPicks = (space: string): AxisUnitPick[] => Object.keys(take)
    .filter((k) => keySpace(k) === space).map(exactUnitPick).filter((u) => u.count > 0);

  const commit = (t: OrderTarget, forceSbr?: boolean) => {
    const carrierPlan = selectedCarrierPlanFor(t);
    if (mode === 'combat') {
      if (t.sbr && forceSbr === undefined) { setSbrAsk(t.id); return; }
      if (forceSbr) {
        const forces = pickedSpaces.map((space) => {
          const bomber = exactOwnPicks(space).find((u) => u.key === 'bomber');
          return bomber ? { from: space, bombers: bomber.count, ordinals: bomber.ordinals, selectionSig: bomber.selectionSig } : null;
        }).filter((f): f is NonNullable<typeof f> => f != null);
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
              const via = routeViaFor(t, space);
              if (!transportRoutesFrom(space).some((c) => c.zone === t.offloadZone && c.via === via)) return [];
              return orders.map((order) => ({ ...order, from: space, ...(via ? { via } : {}) }));
            })
          : [];
        act({
          type: 'attack', target: t.id, forces,
          ...(carrierPlan ? { newCarrierLandings: [carrierPlan.declaration] } : {}),
          ...(t.offloadZone && routedHulls.length ? { amphibious: { zone: t.offloadZone, hulls: routedHulls } } : {}),
        });
      }
    } else {
      // One destination, sent in a safe physical order: cargo comes ashore, then carriers and
      // everything else that is not flying, then aircraft, so the decks are there to land on.
      for (const [space, orders] of Object.entries(transportOrders)) {
        if (!isSea(t.id) && t.offloadZone === space) {
          const offload = buildAxisTransportOffloadAction(space, t.id, orders);
          if (offload) act(offload);
        }
      }
      const hasCarrier = (space: string) => picked.some((p) => p.space === space && p.key === 'carrier');
      const ordered = [...pickedSpaces].sort((a, b) => Number(hasCarrier(b)) - Number(hasCarrier(a)));
      for (const space of ordered) {
        const nonAir = exactOwnPicks(space).filter((u) => !isAirKey(u.key));
        if (nonAir.length === 0) continue;
        const via = routeViaFor(t, space);
        act({ type: 'move', from: space, to: t.id, units: nonAir, ...(via ? { via } : {}) });
      }
      const airOrigins = carrierPlan ? [...pickedSpaces].sort((a, b) => a.localeCompare(b)) : pickedSpaces;
      for (const space of airOrigins) {
        const air = exactOwnPicks(space).filter((u) => isAirKey(u.key));
        if (air.length === 0) continue;
        const declaration = carrierPlan?.moveDeclarations[space];
        act({ type: 'move', from: space, to: t.id, units: air, ...(declaration ? { newCarrierLandings: [declaration] } : {}) });
      }
    }
    reset();
  };

  // ---------- picking up ----------

  const mine = (hit: PieceHit) => hit.power === me && selectableUnit({ key: hit.key }) && availableCount(hit.space, hit.key) > 0;
  const setGroup = (space: string, key: UnitKey, fn: (current: Set<number> | undefined, max: number) => Set<number>) => {
    const tk = `${space}|${key}`;
    const max = availableCount(space, key);
    setTake((t) => {
      const selected = fn(t[tk], max);
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
    setFocus(space);
    setPending(null);
    setChoices(null);
  };

  /** One tap adds one piece: the exact sculpt in open ground, the next of the stack when crowded. */
  const tapPiece = (hit: PieceHit) => {
    if (!enabled) return;
    if (!mine(hit)) { tapRegion(hit.space); return; }
    if (rocketKey || paraKeys.length) return;
    if (!hit.stacked) {
      const ordinal = hit.ordinals[0];
      if (ordinal == null) return;
      setGroup(hit.space, hit.key, (cur, max) => toggleOrdinalSelection(cur, ordinal, max));
      return;
    }
    setGroup(hit.space, hit.key, (cur, max) => ((cur?.size ?? 0) >= max ? new Set() : resizeOrdinalSelection(cur, (cur?.size ?? 0) + 1, max)));
  };

  /** A long press takes every unit of that type in the space, or puts them all back. */
  const holdPiece = (hit: PieceHit) => {
    if (!enabled || !mine(hit) || rocketKey || paraKeys.length) return;
    setGroup(hit.space, hit.key, (cur, max) => ((cur?.size ?? 0) >= max ? new Set() : resizeOrdinalSelection(cur, max, max)));
  };

  const setCount = (space: string, key: UnitKey, n: number) => setGroup(space, key, (cur, max) => resizeOrdinalSelection(cur, n, max));

  const takeAll = (space: string) => {
    const units = availableUnitsAt(space);
    if (!units.length) return;
    setTake((t) => {
      const next = { ...t };
      for (const { key, count } of units) {
        const tk = `${space}|${key}`;
        next[tk] = resizeOrdinalSelection(next[tk], count, count);
        takeSignatures.current[tk] ??= selectionSignatures[tk];
      }
      return next;
    });
    setFocus(space);
    setPending(null);
    setChoices(null);
  };

  const pickTarget = (id: string): boolean => {
    const unique = axisUniqueTargetForMapPick(targets, id);
    if (unique) { choose(unique); return true; }
    const variants = targets.filter((t) => t.id === id);
    if (variants.length > 1) { setPending(null); setChoices(variants); return true; }
    if (loadZones.includes(id)) { openLoad(id); return true; }
    return false;
  };

  const tapRegion = (id: string) => {
    if (!enabled) return;
    if (rocketKey) { if (rocket?.targets.some((t) => t.target === id)) setRocketTarget(id); return; }
    if (paraKeys.length) {
      if (paraTargets.some((t) => t.target === id)) { setParaTarget(id); setParaSupportKeys([]); }
      return;
    }
    const plan = pending?.carrierPlans?.find((p) => p.zone === id);
    if (plan) { setCarrierPlanKey(plan.key); return; }
    if (pickedSpaces.length) {
      if (pickTarget(id)) return;
      // Tapping more of your own ground adds it to the force; anything else is ignored so a
      // stray touch never throws an order away.
      if (origins.includes(id) && !pickedSpaces.includes(id)) takeAll(id);
      else if (origins.includes(id)) setFocus(id);
      return;
    }
    if (origins.includes(id)) {
      if (availableUnitsAt(id).length) takeAll(id);
      else setFocus(id);
    }
  };

  /** A piece is being dragged: pick it up if it is not already in hand and say where the order starts. */
  const dragStart = (hit: PieceHit): string[] | null => {
    if (!enabled || !mine(hit) || rocketKey || paraKeys.length) return null;
    const held = take[`${hit.space}|${hit.key}`];
    // A stack travels whole; a single sculpt joins the force on its own. Hold a piece to take all of its type.
    if (hit.stacked) {
      if (!held?.size) setGroup(hit.space, hit.key, (cur, max) => resizeOrdinalSelection(cur, max, max));
    } else if (hit.ordinals[0] != null && !held?.has(hit.ordinals[0])) {
      setGroup(hit.space, hit.key, (cur, max) => toggleOrdinalSelection(cur, hit.ordinals[0], max));
    }
    setPending(null);
    setChoices(null);
    return [...new Set([...pickedSpaces, hit.space])];
  };
  const dragEnd = (space: string | null) => {
    if (space) pickTarget(space);
  };

  // ---------- transports ----------

  const toggleCargoHull = (space: string, card: AxisTransportHullCard) => {
    if (!card.canOffload) return;
    setTransportOrders((current) => {
      const orders = toggleAxisTransportHull(current[space] ?? [], card);
      const next = { ...current };
      if (orders.length) next[space] = orders;
      else delete next[space];
      return next;
    });
    // The hull carries its cargo to the beach itself: it is not also sent as a ship.
    setTake((t) => {
      if (!t[`${space}|transport`]) return t;
      const next = { ...t };
      delete next[`${space}|transport`];
      delete takeSignatures.current[`${space}|transport`];
      return next;
    });
    setFocus(space);
    setPending(null);
    setChoices(null);
  };
  const cargoSelected = (space: string, card: AxisTransportHullCard) => (transportOrders[space] ?? []).some((o) => sameAxisTransportRef(o, card));

  const loadPicks = loadTarget ? exactOwnPicks(loadTarget.territory).filter((u) => UNITS[u.key].domain === 'land') : [];
  const loadCards = loadTarget ? hullCardsAt(loadTarget.zone) : [];
  const loadCardUsable = (card: AxisTransportHullCard) => card.canLoad && (mode === 'noncombat' || (card.owner === me && card.movable));
  const loadMaxIn = (orders: AxisTransportCargoOrder[], picks: AxisUnitPick[], card: AxisTransportHullCard, key: UnitKey): number => {
    const selected = picks.find((u) => u.key === key)?.count ?? 0;
    if (!loadCardUsable(card) || selected === 0) return 0;
    const order = orders.find((c) => sameAxisTransportRef(c, card));
    const others = order?.units.filter((u) => u.key !== key) ?? [];
    const otherHere = others.reduce((n, u) => n + u.count, 0);
    const baseNonInfantry = card.manifest.some((c) => c.key !== 'infantry');
    const otherNonInfantry = others.some((u) => u.key !== 'infantry');
    if (key !== 'infantry' && (baseNonInfantry || otherNonInfantry)) return 0;
    const assignedElsewhere = orders.reduce((n, o) => (sameAxisTransportRef(o, card) ? n : n + (o.units.find((u) => u.key === key)?.count ?? 0)), 0);
    return Math.min(Math.max(0, card.capacity.remaining - otherHere), Math.max(0, selected - assignedElsewhere), key === 'infantry' ? 2 : 1);
  };
  const withLoadCount = (orders: AxisTransportCargoOrder[], card: AxisTransportHullCard, key: UnitKey, count: number): AxisTransportCargoOrder[] => {
    let next = orders;
    let order = next.find((c) => sameAxisTransportRef(c, card));
    if (!order && count > 0) {
      next = toggleAxisTransportHull(next, card, []);
      order = next.find((c) => sameAxisTransportRef(c, card));
    }
    if (!order) return orders;
    const units = [...order.units.filter((u) => u.key !== key), ...(count > 0 ? [{ key, count }] : [])];
    return units.length ? setAxisTransportHullUnits(next, card, units) : next.filter((c) => !sameAxisTransportRef(c, card));
  };
  /** Opens the boarding sheet with every unit already given a berth where one exists. */
  function openLoad(zone: string) {
    const territory = pickedSpaces[0];
    const picks = exactOwnPicks(territory).filter((u) => UNITS[u.key].domain === 'land');
    let orders: AxisTransportCargoOrder[] = [];
    // Heavy units first: each needs a hull to itself plus one infantry.
    for (const unit of [...picks].sort((a, b) => Number(a.key === 'infantry') - Number(b.key === 'infantry'))) {
      let left = unit.count;
      for (const card of hullCardsAt(zone)) {
        if (left <= 0) break;
        const room = Math.min(left, loadMaxIn(orders, picks, card, unit.key));
        if (room <= 0) continue;
        const has = orders.find((o) => sameAxisTransportRef(o, card))?.units.find((u) => u.key === unit.key)?.count ?? 0;
        orders = withLoadCount(orders, card, unit.key, has + room);
        left -= room;
      }
    }
    // Whatever found no berth stays ashore: the order is trimmed to what the hulls can take.
    for (const unit of picks) {
      const aboard = orders.reduce((n, o) => n + (o.units.find((u) => u.key === unit.key)?.count ?? 0), 0);
      if (aboard < unit.count) setGroup(territory, unit.key, (cur, max) => resizeOrdinalSelection(cur, aboard, max));
    }
    if (!orders.length) return;
    setLoadTarget({ zone, territory });
    setLoadOrders(orders);
    setPending(null);
    setChoices(null);
  }
  const loadCurrent = loadOrders.every((order) => {
    const card = loadCards.find((c) => sameAxisTransportRef(c, order));
    return card && loadCardUsable(card) && card.selectionSig === order.selectionSig;
  });
  const loadAction = loadTarget && loadCurrent && !surfaceHostileSea(loadTarget.zone)
    ? buildAxisTransportLoadAction(loadTarget.zone, loadTarget.territory, loadPicks, loadOrders)
    : null;
  const loadAssigned = (key: UnitKey) => loadOrders.reduce((n, o) => n + (o.units.find((u) => u.key === key)?.count ?? 0), 0);

  // ---------- rockets and paratroopers ----------

  const rocketLaunchers = useMemo(() => (enabled && mode === 'combat' ? axisRocketLauncherCards({ view, idx: AXIS_INDEX, power: me }) : []), [mode, me, view, enabled]);
  const rocketId = (l: (typeof rocketLaunchers)[number]) => `${l.source}:${l.ordinal}:${l.selectionSig}`;
  const rocket = rocketLaunchers.find((l) => rocketId(l) === rocketKey) ?? null;
  const rocketAim = rocket?.targets.find((t) => t.target === rocketTarget) ?? null;

  const paraCards = useMemo(() => (enabled && mode === 'combat' ? axisParatrooperPairCards({ view, idx: AXIS_INDEX, power: me }) : []), [mode, me, view, enabled]);
  const paraSelected = useMemo(() => paraKeys.flatMap((key) => {
    const card = paraCards.find((c) => c.key === key);
    return card ? [card] : [];
  }), [paraCards, paraKeys.join('|')]);
  const paraTargets = useMemo(() => axisParatrooperCommonTargets(paraSelected), [paraSelected]);
  const paraAim = paraTargets.find((t) => t.target === paraTarget) ?? null;
  interface SupportCard { key: string; from: string; unit: UnitKey; ordinal: number; physicalOrdinal: number; selectionSig: string }
  const paraSupport = useMemo((): SupportCard[] => {
    if (!paraAim || me === 'china') return [];
    const reserved = new Set(paraSelected.map((c) => `${c.from}:infantry:${c.infantry.ordinal}`));
    return AXIS_MAP.territories.filter((t) => t.adj.includes(paraAim.target)).flatMap((t) => {
      const stacks = view.board[t.id] ?? [];
      const sigs = new Map<UnitKey, string>();
      return enumerateAxisPhysicalPieces(stacks).flatMap((piece) => {
        if (!piece.available || piece.power !== me || piece.ordinal == null) return [];
        const profile = UNITS[piece.key];
        if (profile.domain !== 'land' || profile.attack <= 0 || piece.key === 'aaGun') return [];
        if (reserved.has(`${t.id}:${piece.key}:${piece.ordinal}`)) return [];
        const selectionSig = sigs.get(piece.key) ?? axisPieceSelectionSignature(stacks, me, piece.key);
        sigs.set(piece.key, selectionSig);
        return [{ key: `${t.id}:${piece.key}:${piece.ordinal}`, from: t.id, unit: piece.key, ordinal: piece.ordinal, physicalOrdinal: piece.physicalOrdinal, selectionSig }];
      });
    });
  }, [paraAim, paraSelected, me, view.board]);
  const paraSupportSelected = paraSupportKeys.flatMap((key) => {
    const card = paraSupport.find((c) => c.key === key);
    return card ? [card] : [];
  });
  const launchRocket = () => {
    if (!rocket || !rocketAim) return;
    act(buildAxisRocketStrikeAction(rocket, rocketAim.target));
    reset();
  };
  const launchAirborne = () => {
    if (!paraSelected.length || !paraAim) return;
    const groups = new Map<string, Map<UnitKey, SupportCard[]>>();
    for (const card of paraSupportSelected) {
      const units = groups.get(card.from) ?? new Map<UnitKey, SupportCard[]>();
      units.set(card.unit, [...(units.get(card.unit) ?? []), card]);
      groups.set(card.from, units);
    }
    const forces = [...groups].map(([from, units]) => ({
      from,
      units: [...units].map(([key, cards]) => ({ key, count: cards.length, ordinals: cards.map((c) => c.ordinal).sort((a, b) => a - b), selectionSig: cards[0].selectionSig })),
    }));
    act({ type: 'attack', target: paraAim.target, forces, paratroopers: buildAxisParatrooperGroups(paraSelected, paraAim.target) });
    reset();
  };
  useEffect(() => {
    if (rocketKey && !rocket) { setRocketKey(null); setRocketTarget(null); }
    const live = new Set(paraCards.map((c) => c.key));
    if (paraKeys.some((k) => !live.has(k))) setParaKeys((keys) => keys.filter((k) => live.has(k)));
  }, [rocketKey, rocket, paraCards, paraKeys]);

  // ---------- ending the phase ----------

  const stranded = useMemo(() => {
    if (!enabled || mode !== 'noncombat') return [];
    if (me !== 'china') return strandedAircraft(view, me);
    return Object.entries(view.board).flatMap(([space, stacks]) => {
      const count = stacks.filter((s) => s.power === 'china' && s.key === 'fighter').reduce((n, s) => n + s.count, 0);
      return count > 0 && !isChinaFriendlyLandingTerritory(TERR[space], view.control, view.contested)
        ? [{ space, key: 'fighter' as const, count, reason: 'hostile-territory' as const }] : [];
    });
  }, [mode, view.board, view.control, view.contested, me, enabled]);
  const strandedTotal = stranded.reduce((n, g) => n + g.count, 0);
  const finish = (force = false) => {
    if (!force && mode === 'noncombat' && strandedTotal > 0) { setConfirmStranded(true); return; }
    setConfirmStranded(false);
    act({ type: 'endPhase' });
  };

  // ---------- what the map should show ----------

  const tone: Tone = mode === 'combat' ? 'attack' : 'move';
  const stageTargets: { id: string; tone: Tone }[] = [];
  const stageArrows: StageArrow[] = [];
  let stageSelection: Record<string, Set<number>> = take;
  if (rocket) {
    for (const t of rocket.targets) stageTargets.push({ id: t.target, tone: t.target === rocketTarget ? 'special' : 'attack' });
    stageSelection = { [`${rocket.source}|aaGun`]: new Set([rocket.ordinal]) };
    if (rocketAim) stageArrows.push({ from: [rocket.source], to: rocketAim.target, tone: 'special' });
  } else if (paraSelected.length) {
    for (const t of paraTargets) stageTargets.push({ id: t.target, tone: t.target === paraTarget ? 'special' : 'attack' });
    const sel: Record<string, Set<number>> = {};
    const add = (space: string, key: string, ordinal: number) => { (sel[`${space}|${key}`] ??= new Set()).add(ordinal); };
    for (const c of paraSelected) { add(c.from, 'bomber', c.bomber.ordinal); add(c.from, 'infantry', c.infantry.ordinal); }
    for (const s of paraSupportSelected) add(s.from, s.unit, s.ordinal);
    stageSelection = sel;
    if (paraAim) stageArrows.push({ from: [...new Set([...paraSelected.map((c) => c.from), ...paraSupportSelected.map((s) => s.from)])], to: paraAim.target, tone: 'special' });
  } else if (pickedSpaces.length) {
    for (const t of targets) stageTargets.push({ id: t.id, tone: t.carrierPlans?.length ? 'special' : tone });
    for (const z of loadZones) stageTargets.push({ id: z, tone: 'special' });
    for (const plan of pending?.carrierPlans ?? []) stageTargets.push({ id: plan.zone, tone: 'special' });
    if (pending) {
      stageArrows.push({ from: pickedSpaces, to: pending.id, tone: pending.carrierPlans?.length ? 'special' : tone });
      const plan = selectedCarrierPlanFor(pending);
      if (plan && plan.zone !== pending.id) stageArrows.push({ from: [pending.id], to: plan.zone, tone: 'special' });
    }
  } else {
    for (const id of origins) stageTargets.push({ id, tone: 'origin' });
  }

  const verb = (t: OrderTarget) => (mode === 'combat' ? (t.sbr ? 'Strike' : t.amphibious ? 'Assault' : 'Attack') : t.offloadZone ? 'Land at' : 'Move to');

  return {
    me, mode, enabled, origins, focus,
    take, picked, cargoPicked, pickedSpaces, hasForce: pickedSpaces.length > 0,
    targets, loadZones, pending, choices, sbrAsk,
    tapPiece, holdPiece, tapRegion, dragStart, dragEnd, setCount, takeAll, reset,
    choose, cancelPending: () => { setPending(null); setChoices(null); },
    commit, verb, routeLabel,
    carrierPlan: pending ? selectedCarrierPlanFor(pending) : undefined, setCarrierPlanKey,
    closeSbr: () => setSbrAsk(null),
    // transports
    hullCardsAt, toggleCargoHull, cargoSelected,
    load: loadTarget ? {
      ...loadTarget, picks: loadPicks, cards: loadCards, orders: loadOrders, usable: loadCardUsable,
      maxFor: (card: AxisTransportHullCard, key: UnitKey) => loadMaxIn(loadOrders, loadPicks, card, key),
      countOn: (card: AxisTransportHullCard, key: UnitKey) => loadOrders.find((o) => sameAxisTransportRef(o, card))?.units.find((u) => u.key === key)?.count ?? 0,
      setCount: (card: AxisTransportHullCard, key: UnitKey, n: number) => setLoadOrders((o) => withLoadCount(o, card, key, n)),
      left: (key: UnitKey) => (loadPicks.find((u) => u.key === key)?.count ?? 0) - loadAssigned(key),
      ready: loadAction != null,
      confirm: () => { if (loadAction) { act(loadAction); reset(); } },
      cancel: () => { setLoadTarget(null); setLoadOrders([]); },
    } : null,
    // special orders
    rocketLaunchers, rocketId, rocket, rocketAim,
    pickRocket: (key: string | null) => { reset(); setRocketKey(key); },
    launchRocket,
    paraCards, paraSelected, paraTargets, paraAim, paraSupport, paraSupportKeys,
    togglePara: (key: string) => {
      if (!paraKeys.length) reset();
      setParaKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
      setParaTarget(null);
      setParaSupportKeys([]);
    },
    toggleParaSupport: (key: string) => setParaSupportKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    launchAirborne,
    special: Boolean(rocket) || paraSelected.length > 0,
    // phase end
    stranded, strandedTotal, confirmStranded, finish, cancelFinish: () => setConfirmStranded(false),
    // map
    stageTargets, stageArrows, stageSelection, dim: pickedSpaces.length > 0 || Boolean(rocket) || paraSelected.length > 0,
  };
}

export type Orders = ReturnType<typeof useOrders>;
export const sideLabel = (power: string) => (sideOf(power) === 'axis' ? 'Axis' : 'Allies');
export const powerLabel = (power: string) => (power === 'china' ? 'China' : POWERS[power as PowerKey].name);
