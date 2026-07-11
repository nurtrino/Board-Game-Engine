import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  battlePresentationGenerationAccepts,
  battlePresentationReady,
  battlePresentationSessionAccepts,
  diceNotation,
  physicalDiceResultMatches,
  physicalDiceResultValues,
  planBattleVisualTransition,
  type BattlePresentationSnapshot,
} from './axisBattlePresentation';

assert.equal(battlePresentationReady({ cinematic: false, dice: false, failed: false }), false, 'nothing loaded stays locked');
assert.equal(battlePresentationReady({ cinematic: true, dice: false, failed: false }), false, 'battlefield alone stays locked');
assert.equal(battlePresentationReady({ cinematic: false, dice: true, failed: false }), false, 'dice alone stay locked');
assert.equal(battlePresentationReady({ cinematic: true, dice: true, failed: false }), true, 'both renderers unlock rolling');
assert.equal(battlePresentationReady({ cinematic: true, dice: true, failed: true }), false, 'a renderer failure revokes readiness');

const liveSession = { combatId: 41, sessionEpoch: 7 };
assert.equal(battlePresentationSessionAccepts(liveSession, liveSession, true), true, 'the current visible renderer session may report readiness');
assert.equal(battlePresentationSessionAccepts({ ...liveSession, sessionEpoch: 6 }, liveSession, true), false, 'a stale retry session cannot report readiness');
assert.equal(battlePresentationSessionAccepts({ ...liveSession, combatId: 40 }, liveSession, true), false, 'a prior combat cannot unlock the next combat');
assert.equal(battlePresentationSessionAccepts(liveSession, liveSession, false), false, 'hidden displays ignore async renderer callbacks');
const liveGeneration = { ...liveSession, visualSeq: 12 };
assert.equal(battlePresentationGenerationAccepts(liveGeneration, liveGeneration, true), true, 'the exact visible generation may settle');
assert.equal(battlePresentationGenerationAccepts({ ...liveGeneration, visualSeq: 11 }, liveGeneration, true), false, 'an old visual sequence cannot settle the current generation');

assert.equal(diceNotation([1, 6, 3]), '3d6@1,6,3', 'physical dice preserve exact engine results');
assert.equal(diceNotation([]), null, 'an empty volley does not animate dice');

const physicalResult = (values: number[]) => ({
  notation: `${values.length}d6@${values.join(',')}`,
  sets: [{ rolls: values.map((value) => ({ value, reason: 'forced' })) }],
});
assert.deepEqual(physicalDiceResultValues(physicalResult([1, 6, 3])), [1, 6, 3], 'renderer results retain exact die order');
assert.equal(physicalDiceResultMatches([1, 6, 3], physicalResult([1, 6, 3])), true, 'matching physical faces settle the salvo');
assert.equal(physicalDiceResultMatches([1, 6, 3], physicalResult([1, 3, 6])), false, 'reordered physical faces cannot settle the salvo');
assert.equal(physicalDiceResultMatches([1, 6, 3], physicalResult([1, 6])), false, 'a missing physical die cannot settle the salvo');
assert.equal(physicalDiceResultMatches([1], [{ value: 1 }]), false, 'the ignored-@ result shape from the old renderer is rejected');
assert.equal(physicalDiceResultMatches([1], { sets: [{ rolls: [{ value: 7 }] }] }), false, 'invalid d6 faces are rejected');

const snapshot = (
  units: BattlePresentationSnapshot['units'],
  status = 'ongoing',
): BattlePresentationSnapshot => ({ units, status });
const infantry = { uid: 1, key: 'infantry', side: 'attacker' as const, hp: 1, submerged: false };
const battleship = { uid: 2, key: 'battleship', side: 'defender' as const, hp: 2, submerged: false };
const submarine = { uid: 3, key: 'submarine', side: 'attacker' as const, hp: 1, submerged: false };

{
  const transition = planBattleVisualTransition(
    snapshot([infantry]),
    snapshot([{ ...infantry, hp: 0 }]),
    'land',
  );
  assert.deepEqual(transition.destroyedIds, ['1'], 'same-salvo casualty removal creates a death beat');
  assert.equal(transition.durationMs, 2_200, 'land deaths keep readiness locked for their full animation');
}

{
  const transition = planBattleVisualTransition(
    snapshot([battleship]),
    snapshot([{ ...battleship, hp: 1 }]),
    'sea',
  );
  assert.deepEqual(transition.damagedIds, ['2'], 'a surviving capital-ship hit is still a visual state change');
  assert.equal(transition.durationMs, 900, 'damage presentation settles before another action');
}

{
  const transition = planBattleVisualTransition(
    snapshot([submarine]),
    snapshot([{ ...submarine, submerged: true }]),
    'sea',
  );
  assert.deepEqual(transition.submergedIds, ['3'], 'submerge is tracked independently of dice volleys');
  assert.equal(transition.durationMs, 1_800, 'submerge animation blocks the next action');
}

{
  const transition = planBattleVisualTransition(snapshot([infantry]), snapshot([]), 'land');
  assert.deepEqual(transition.retreatingIds, ['1'], 'partial withdrawal retains its departing model for the transition');
  assert.equal(transition.durationMs, 1_800, 'withdrawal animation blocks the next action');
}

{
  const transition = planBattleVisualTransition(
    snapshot([infantry]),
    snapshot([infantry], 'retreated'),
    'land',
  );
  assert.deepEqual(transition.retreatingIds, ['1'], 'a full retreat animates every surviving attacker');
}

assert.equal(
  planBattleVisualTransition(snapshot([infantry]), snapshot([infantry]), 'land').durationMs,
  0,
  'declining a choice still gets a paint-frame acknowledgement without inventing a timed effect',
);

const simSource = readFileSync(new URL('./sim/BattleSim.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(simSource, /BattleTacticalFallback|cinematicEnabled|Enable cinematic/, 'no alternate tactical battle remains');
assert.match(simSource, /<Canvas/, 'the cinematic canvas is always part of the battle renderer');
assert.match(simSource, /useRef<number \| null>\(null\)/, 'a remounted cinematic must repaint the current generation before acknowledging it');

const stageSource = readFileSync(new URL('./AxisBattleStage.tsx', import.meta.url), 'utf8');
assert.match(stageSource, /@3d-dice\/dice-box-threejs/, 'the predetermined-outcome physical cinematic dice are installed');
assert.doesNotMatch(stageSource, /from ['"]@3d-dice\/dice-box['"]/, 'the renderer that ignores @values cannot return');
assert.match(stageSource, /settleAuthoritativeDiceFaces\(runtime\.box, expectedValues\)/, 'the adapter verifies the faces that are actually visible after the physical throw');
assert.match(stageSource, /swapDiceFace\(die, expected\[index\]!\)/, 'a divergent real-time throw is relabeled to the exact authoritative face before readiness returns');
assert.match(stageSource, /return dice\.every\(\(die, index\) => die\.getFaceValue\?\.\(\)\.value === expected\[index\]\)/, 'the final rendered face of every die is checked in exact order');
assert.match(stageSource, /axisOwnedGeometry\?\.dispose/, 'forced-face geometry clones are released between volleys');
assert.match(stageSource, /baseScale: 46/, 'physical dice are sized for the shallow TV rail instead of being cropped at the package default');
assert.match(stageSource, /function createDiceRuntime\(initialHost\?: HTMLElement\)[\s\S]*?initialHost\.appendChild\(el\)/,
  'a cold retry initializes WebGL against the visible tray dimensions instead of a hidden viewport');
assert.match(stageSource, /previous battle's settled faces[\s\S]*?clearDiceImmediately\(runtime\.box\)/, 'a new or resumed engagement synchronously clears stale physical faces before replay');
assert.doesNotMatch(stageSource, /function resetDiceBox[\s\S]*?\.clearDice\(\)/,
  'disposing physical dice never leaves the package clearDice delayed render pointed at a dead context');
assert.match(stageSource, /runtime\.disposed \|\| diceRuntime !== runtime/,
  'a superseded late dice initialization cannot report readiness');
assert.match(stageSource, /void init\.then\(\(\) => \{[\s\S]*?disposeDiceRuntime\(runtime\)/,
  'a late raw initialization re-enters teardown after its runtime was superseded');
assert.doesNotMatch(stageSource, /function disposeDiceRuntime[\s\S]*?if \(runtime\.disposed\) return;/,
  'late initialization can re-attempt renderer disposal after the lifecycle flag was already set');
assert.match(stageSource, /ownerToken[\s\S]*?rollToken/,
  'the shared dice canvas and each authoritative throw have explicit ownership leases');
assert.match(stageSource, /onReadyRef\.current = onReady[\s\S]*?\}, \[enabled, retryKey\]\);/,
  'session callback changes cannot tear down the physical dice owner or reroll settled faces');
const styleSwitchSource = stageSource.slice(
  stageSource.indexOf('const selectVisualStyle'),
  stageSource.indexOf('const requiredPresentationDuration'),
);
assert.doesNotMatch(styleSwitchSource, /setRetryKey/,
  'switching battlefield art preserves the exact settled physical dice instead of restarting their renderer');
assert.match(stageSource, /<DiceTray[\s\S]*?enabled=\{pageVisible\}/,
  'a hidden shared display cannot initialize or roll the physical dice offscreen');
assert.match(stageSource, /renderer\?\.dispose\?\.\(\)[\s\S]*?renderer\?\.forceContextLoss\?\.\(\)/,
  'dice teardown releases both Three resources and the underlying WebGL context');
assert.match(stageSource, /window\.removeEventListener\('resize', runtime\.resizeListener\)/,
  'dice teardown removes the package global resize listener instead of retaining a dead runtime');
assert.match(stageSource, /if \(renderer\?\.render\) renderer\.render = \(\) => \{\}/,
  'a queued package animation frame cannot render through a released WebGL context');
assert.doesNotMatch(stageSource, /setTimeout\([^)]*setStageReady|setStageReady\(true\)/, 'no timer can fake presentation readiness');
assert.match(stageSource, /cinematicInteractive/, 'rolling waits for the cinematic intro to finish');
assert.match(stageSource, /diceRolling/, 'rolling stays locked while physical dice are settling');
assert.match(stageSource, /settledSalvo/, 'the final report waits for the exact physical salvo to settle');
assert.match(stageSource, /settledBattlefieldSalvo/, 'the next roll waits for battlefield shots and deaths to finish');
assert.match(stageSource, /const revokeBattleVisualReady = useCallback[\s\S]*?activeGenerationRef\.current[\s\S]*?reportRef\.current\?\.\(combatId, false, visualSeq\)/,
  'renderer loss, retry, and style changes synchronously revoke the exact server-side generation');
assert.match(stageSource, /settledVisualSeq/, 'same-salvo decisions wait for their exact battlefield generation');
assert.match(stageSource, /settledVisualSeqState\.sessionEpoch === sessionEpoch[\s\S]*?: visualSeq - 1/,
  'a fresh renderer session cannot inherit an already-settled visual generation');
assert.match(stageSource, /sessionIdentity = `\$\{c\.id\}:\$\{visualStyle\}:\$\{retryKey\}`/,
  'combat, renderer choice, and retry each establish a distinct callback session');
assert.match(stageSource, /invalidatePresentationSession\(\);[\s\S]*?setRetryKey/,
  'a retry invalidates retained callbacks before mounting its replacement');
assert.match(stageSource, /completedSalvo !== activeSalvoRef\.current/,
  'stale physical or battlefield volleys cannot settle a newer salvo');
assert.match(stageSource, /battlePresentationGenerationAccepts\([\s\S]*?activeGenerationRef\.current/,
  'battlefield completion must match the exact active visual generation');
assert.match(stageSource, /reportedRef = useRef<\{ combatId: number; visualSeq: number; ready: boolean \}/,
  'readiness de-duplication cannot confuse two combats that reuse a visual sequence');
assert.match(stageSource, /planBattleVisualTransition/, 'battlefield state changes are diffed independently of dice volleys');
assert.match(stageSource, /metric === 'damage'/, 'strategic damage dice use face-value presentation instead of hit counts');
assert.match(stageSource, /selected === false/, 'discarded Heavy Bomber dice remain visible but are not scored');
assert.match(stageSource, /`AA vs \$\{UNITS\[target\.key\]\.name\}`/, 'AA dice name the exact Fighter or Bomber assigned by the engine');
assert.match(stageSource, /data-target-uid=\{r\.targetUid\}/, 'AA dice retain an inspectable link to their exact aircraft');
assert.match(stageSource, /last\?\.kind === 'aa_fire'/, 'the cinematic volley prefers the aircraft targeted by AA fire');
assert.match(stageSource, /const rendererProps:[\s\S]*?shotLinks,/, 'AA dice preserve exact shooter-to-aircraft links in both battlefield renderers');
assert.match(stageSource, /Strategic bombing raid/, 'the original cinematic stage explicitly identifies strategic raids');
assert.match(stageSource, /Rocket strike/, 'rocket damage receives its own cinematic stage and report');
assert.match(stageSource, /last\?\.kind === 'raid_damage' \|\| last\?\.kind === 'rocket_damage'/, 'economic damage volleys target the exact factory model');
assert.match(stageSource, /visibilitychange/, 'a hidden shared display revokes battle readiness');

const require = createRequire(import.meta.url);
const physicalDicePackage = readFileSync(require.resolve('@3d-dice/dice-box-threejs'), 'utf8');
assert.match(physicalDicePackage, /split\(["'`]@["'`]\)/, 'the installed renderer parses predetermined @values notation');
assert.match(physicalDicePackage, /swapDiceFace/, 'the installed renderer maps its pre-simulated throw to the requested faces');

const playSource = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
assert.match(playSource, /Roll bombing damage/, 'controller presents strategic damage as its own gated roll');
assert.match(playSource, /keep the higher result/, 'controller explains Heavy Bomber SBR selection');
assert.match(playSource, /ROLL ROCKET DAMAGE/, 'controller exposes rocket damage only as a gated cinematic roll');
assert.match(playSource, /disabled=\{submitting \|\| !view\.battleVisualReady \|\| \(!on && !selectable\)\}/, 'casualty picking stays inert until the exact presentation settles');

const boardSource = readFileSync(new URL('./AxisBoard.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(boardSource, /function BattlePanel/, 'the retired tactical battle panel cannot return as a fallback');
assert.match(boardSource, /void warmDiceBox\(\)[\s\S]*?return releaseDiceBox;/,
  'the warmed physical dice singleton is released when the Axis TV route unmounts');

console.log('axis battle presentation: all checks passed');
