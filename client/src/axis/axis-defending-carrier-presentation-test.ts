import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AxisDefendingCarrierLandingOption } from '@bge/shared';
import {
  axisDefendingCarrierLandingCards,
  axisDefendingCarrierLandingOwner,
  axisUniqueDefendingCarrierOptionAtSpace,
  type AxisDefendingCarrierLandingView,
} from './axisDefendingCarrierPresentation.js';

const fighter = {
  ref: 'fighter:uk:7',
  power: 'uk' as const,
  originSeaZone: 'sz-6',
  homeCarrierRef: 'carrier:uk:sunk',
};
const options: AxisDefendingCarrierLandingOption[] = [
  {
    fighterRef: fighter.ref,
    fighterPower: 'uk',
    kind: 'carrier',
    carrierRef: 'carrier:uk:a',
    carrierPower: 'uk',
    space: 'sz-6',
    distance: 0,
    ruleStep: 'same-zone-carrier',
  },
  {
    fighterRef: fighter.ref,
    fighterPower: 'uk',
    kind: 'carrier',
    carrierRef: 'carrier:uk:b',
    carrierPower: 'uk',
    space: 'sz-6',
    distance: 0,
    ruleStep: 'same-zone-carrier',
  },
];
const landing = {
  snapshot: {
    timing: { allCombatsResolved: true, ordinaryNoncombatStarted: false },
    fighters: [fighter],
    carriers: [
      { ref: 'carrier:uk:b', power: 'uk', seaZone: 'sz-6', occupied: 1 },
      { ref: 'carrier:uk:a', power: 'uk', seaZone: 'sz-6', occupied: 0 },
    ],
    seaZones: [],
    territories: [],
  },
  choices: [],
  resumeCombatant: 'germany',
  progress: {
    ok: true,
    status: 'decision',
    decision: { fighter, owner: 'uk', ruleStep: 'same-zone-carrier', options },
    resolutions: [],
    remainingFighterRefs: [fighter.ref],
    decks: [
      { carrierRef: 'carrier:uk:a', carrierPower: 'uk', seaZone: 'sz-6', occupied: 0, open: 2 },
      { carrierRef: 'carrier:uk:b', carrierPower: 'uk', seaZone: 'sz-6', occupied: 1, open: 1 },
    ],
  },
} as unknown as AxisDefendingCarrierLandingView;

const cards = axisDefendingCarrierLandingCards(landing);
assert.equal(axisDefendingCarrierLandingOwner(landing), 'uk');
assert.deepEqual(cards.map((card) => [card.title, card.occupied, card.open]), [
  ['United Kingdom carrier 1', 0, 2],
  ['United Kingdom carrier 2', 1, 1],
]);
assert.deepEqual(cards.map((card) => card.action), [
  { type: 'defendingCarrierLanding', fighterRef: fighter.ref, kind: 'carrier', carrierRef: 'carrier:uk:a' },
  { type: 'defendingCarrierLanding', fighterRef: fighter.ref, kind: 'carrier', carrierRef: 'carrier:uk:b' },
]);
assert.equal(
  axisUniqueDefendingCarrierOptionAtSpace(cards, 'sz-6'),
  null,
  'one highlighted sea zone must not silently auto-select one of several exact carrier hulls',
);
assert.equal(axisUniqueDefendingCarrierOptionAtSpace(cards.slice(0, 1), 'sz-6')?.key, cards[0]?.key);

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
const boardSource = readFileSync(new URL('./AxisBoard.tsx', import.meta.url), 'utf8');
assert.match(playSource, /current === card\.key \? null : card\.key/,
  'tapping the already-highlighted exact landing option deselects only that card');
assert.match(playSource, /axisUniqueDefendingCarrierOptionAtSpace\(cards, id\)/,
  'map taps preserve exact-deck ambiguity instead of auto-selecting a same-zone hull');
assert.match(playSource, /act\(\{ \.\.\.selectedCard\.action, asPower: decision\.owner \}/,
  'the exact fighter owner, not the active attacker, authorizes the emergency landing');
assert.match(playSource, /!defendingCarrierActive && canCommandActive && view\.phase === 'combatMove'/,
  'ordinary combat controls stay unmounted while the landing queue blocks the phase');
assert.match(playSource, /view\.controlledPowers\.includes\(defendingCarrierOwner\)/,
  'the owner can resolve the landing from their own device even during another power turn');
assert.match(playSource, /const commandPowerKey = defendingCarrierOwner \?\? me/,
  'the command header clearly switches from the attacking turn power to the fighter owner');
assert.match(boardSource, /Emergency Carrier Landing/,
  'the shared display names the blocking post-combat landing subphase');
assert.match(boardSource, /decision\.fighter\.originSeaZone/,
  'the shared map focuses the sea zone where the exact fighter launched');

console.log('axis defending carrier presentation: all checks passed');
