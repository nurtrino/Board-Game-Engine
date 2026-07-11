import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AXIS_BATTLE_VISUAL_STYLE_KEY,
  loadAxisBattleVisualStyle,
  parseAxisBattleVisualStyle,
  saveAxisBattleVisualStyle,
} from './axisBattleVisualStyle.js';

assert.equal(parseAxisBattleVisualStyle('diorama'), 'diorama');
assert.equal(parseAxisBattleVisualStyle('cinematic'), 'cinematic');
assert.equal(parseAxisBattleVisualStyle('retired-fallback'), 'cinematic', 'unknown old values cannot resurrect another renderer');

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
};
saveAxisBattleVisualStyle('diorama', storage);
assert.equal(memory.get(AXIS_BATTLE_VISUAL_STYLE_KEY), 'diorama');
assert.equal(loadAxisBattleVisualStyle(storage), 'diorama', 'the TV keeps its deliberate presentation choice');
assert.equal(loadAxisBattleVisualStyle({ getItem: () => { throw new Error('blocked'); } }), 'cinematic', 'storage failures use the mandatory original cinematic');

const stageSource = readFileSync(new URL('./AxisBattleStage.tsx', import.meta.url), 'utf8');
assert.match(stageSource, /const loadStylizedBattleSim = \(\) => import\('\.\/sim\/StylizedBattleSim'\)/,
  'the secondary diorama stays in its own on-demand performance chunk');
assert.match(stageSource, /loadAxisBattleVisualStyle\(\) === 'diorama'[\s\S]*?loadStylizedBattleSim\(\)/,
  'a persisted diorama choice preloads its small lazy module before combat without affecting the initial chunk');
assert.match(stageSource, /const StylizedBattleRenderer = useMemo\(\(\) => lazy\(loadStylizedBattleSim\), \[retryKey\]\)/,
  'retrying replaces React.lazy rejected state instead of replaying a permanently cached chunk error');
assert.match(stageSource, /aria-pressed=\{visualStyle === 'cinematic'\}/,
  'the original cinematic remains an explicit selectable presentation');
assert.match(stageSource, /aria-pressed=\{visualStyle === 'diorama'\}/,
  'the non-photorealistic command diorama is an explicit second presentation');
assert.match(stageSource, /setSettledVisualSeq\(\{ sessionEpoch: -1, value: visualSeq - 1 \}\)/,
  'switching renderers revokes readiness and requires the current generation to repaint');
assert.match(stageSource, /disabled=\{diceRolling\} aria-pressed=\{visualStyle === 'diorama'\}/,
  'the renderer cannot be torn down while authoritative physical dice are still settling');
assert.match(stageSource, /if \(next === visualStyle \|\| diceRolling\) return;\s*revokeBattleVisualReady\(\)/,
  'a style switch immediately revokes server readiness before either renderer is torn down');

console.log('axis battle visual style: all checks passed');
