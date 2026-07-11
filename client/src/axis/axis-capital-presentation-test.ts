import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  axisCapitalTurnPresentation,
  axisPhasePresentation,
  type AxisCapitalPresentationView,
} from './axisCapitalPresentation.js';

const makeView = (overrides: Partial<AxisCapitalPresentationView> = {}): AxisCapitalPresentationView => ({
  active: 'germany',
  phase: 'purchase',
  capitalOccupied: false,
  turnStartedCapitalOccupied: false,
  chinaGrant: 0,
  options: {
    scenario: '1941', rnd: true, nationalObjectives: false, winCondition: 'standard',
  },
  ...overrides,
});

const node = (view: AxisCapitalPresentationView, key: string) => {
  const found = axisPhasePresentation(view).find((phase) => phase.key === key);
  assert.ok(found, `${key} phase should be present`);
  return found;
};

{
  const view = makeView();
  const capital = axisCapitalTurnPresentation(view);
  assert.equal(capital.affected, false);
  assert.equal(capital.banner, null);
  assert.equal(capital.regularMobilizationLocked, false);
  assert.equal(capital.incomeAvailable, true);
  assert.equal(node(view, 'purchase').progress, 'current');
  assert.equal(node(view, 'purchase').restriction, 'none');
}

{
  const view = makeView({
    active: 'uk', phase: 'combatMove', capitalOccupied: true, turnStartedCapitalOccupied: true,
  });
  const capital = axisCapitalTurnPresentation(view);
  assert.equal(capital.banner?.title, 'CAPITAL OCCUPIED');
  assert.match(capital.banner?.detail ?? '', /research, purchase, deployment, and income skipped/i);
  assert.match(capital.brief ?? '', /combat move.*noncombat move remain available/i);
  assert.equal(capital.regularMobilizationLocked, true);
  assert.equal(capital.incomeAvailable, false);
  assert.equal(node(view, 'rnd').restriction, 'skipped');
  assert.equal(node(view, 'rnd').marker, '—');
  assert.equal(node(view, 'purchase').restriction, 'skipped');
  assert.equal(node(view, 'mobilize').restriction, 'skipped');
  assert.match(node(view, 'mobilize').reason ?? '', /both skipped.*capital held/i);
  assert.equal(capital.mobilize?.endLabel, 'End turn · no income');
}

{
  const view = makeView({
    active: 'usa', phase: 'noncombat', capitalOccupied: true,
    turnStartedCapitalOccupied: true, chinaGrant: 3,
  });
  const capital = axisCapitalTurnPresentation(view);
  assert.match(capital.banner?.detail ?? '', /no u\.s\. research, buying, repairs, placement, or income/i);
  assert.match(capital.banner?.detail ?? '', /china remains active/i);
  assert.match(capital.brief ?? '', /usa and china still complete both operation blocks/i);
  assert.match(capital.brief ?? '', /independent infantry grant/i);
  assert.equal(node(view, 'mobilize').restriction, 'limited');
  assert.equal(node(view, 'mobilize').label, 'China deploy');
  assert.match(node(view, 'mobilize').reason ?? '', /u\.s\. placement \+ income skipped/i);
  assert.equal(capital.mobilize?.endLabel, 'End turn · no U.S. income');
  assert.match(capital.mobilize?.endTitle ?? '', /3 remaining infantry.*no u\.s\. income/i);
}

{
  const view = makeView({
    active: 'ussr', phase: 'mobilize', capitalOccupied: false, turnStartedCapitalOccupied: true,
  });
  const capital = axisCapitalTurnPresentation(view);
  assert.equal(capital.liberatedMidturn, true);
  assert.equal(capital.banner?.title, 'CAPITAL LIBERATED');
  assert.match(capital.banner?.detail ?? '', /earlier economic phases remain skipped.*income restored/i);
  assert.equal(capital.incomeAvailable, true);
  assert.equal(capital.regularMobilizationLocked, true);
  assert.equal(node(view, 'rnd').restriction, 'skipped', 'liberation does not rewrite skipped R&D');
  assert.equal(node(view, 'purchase').restriction, 'skipped', 'liberation does not rewrite skipped Purchase');
  assert.equal(node(view, 'mobilize').restriction, 'limited');
  assert.equal(node(view, 'mobilize').label, 'Income only');
  assert.match(node(view, 'mobilize').reason ?? '', /deployment skipped.*income restored/i);
  assert.equal(capital.mobilize?.endLabel, 'End turn · collect restored income');
}

{
  const view = makeView({
    active: 'usa', phase: 'mobilize', capitalOccupied: false,
    turnStartedCapitalOccupied: true, chinaGrant: 2,
  });
  const capital = axisCapitalTurnPresentation(view);
  assert.equal(node(view, 'mobilize').label, 'China + income');
  assert.match(node(view, 'mobilize').reason ?? '', /u\.s\. placement skipped.*income restored/i);
  assert.match(capital.brief ?? '', /regular placement remain skipped.*china can deploy.*income is restored/i);
  assert.match(capital.mobilize?.endTitle ?? '', /place china's 2 remaining infantry.*restored income/i);
}

{
  const view = makeView({ options: {
    scenario: '1941', rnd: false, nationalObjectives: false, winCondition: 'standard',
  } });
  assert.equal(axisPhasePresentation(view).some((phase) => phase.key === 'rnd'), false, 'disabled R&D is omitted rather than called an occupation skip');
}

{
  const view = makeView({ phase: 'gameOver', capitalOccupied: true, turnStartedCapitalOccupied: true });
  assert.ok(axisPhasePresentation(view).every((phase) => phase.progress === 'done' && phase.restriction === 'none'), 'campaign completion supersedes turn restrictions');
}

const play = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
const board = readFileSync(new URL('./AxisBoard.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

assert.match(play, /<PhaseRail view=\{view\}/, 'player rail consumes authoritative capital presentation');
assert.match(play, /<PhaseBrief view=\{view\}/, 'player brief consumes live and turn-start capital state');
assert.match(play, /ax-capital-alert player/, 'player HUD renders the high-contrast capital alert');
assert.match(play, /const staged = capital\.regularMobilizationLocked\s*\? \[\]/s, 'regular staging controls are hidden after an occupied turn start');
assert.match(play, /capital\.mobilize\?\.endLabel/, 'mobilize end action uses occupied/restored income wording');
assert.match(play, /pw === view\.active && view\.turnStartedCapitalOccupied/, 'lost active-power staging is hidden from the table');
assert.match(play, /listAxisTransportHullCards/, 'per-hull transport UI remains wired');
assert.match(play, /buildAxisTransportLoadAction/, 'exact transport actions remain wired');
assert.match(board, /axisCapitalTurnPresentation\(view\)/, 'TV HUD consumes the same pure presentation');
assert.match(board, /ax-capital-alert tv/, 'TV HUD renders the high-contrast capital alert');
assert.match(board, /nestedOperation/, 'nested USA/China operation progress remains present');
assert.match(styles, /\.ax-phase-rail li\.skipped/, 'skipped phase nodes have explicit styling');
assert.match(styles, /\.ax-capital-alert\.occupied/, 'occupied capital alert has a high-contrast treatment');
assert.match(styles, /\.ax-capital-mobilize\.restored/, 'restored-income mobilize state is visually distinct');

console.log('axis capital presentation: all checks passed');
