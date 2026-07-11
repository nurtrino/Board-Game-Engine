import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const play = readFileSync(new URL('./AxisPlay.tsx', import.meta.url), 'utf8');
const stage = readFileSync(new URL('./AxisBattleStage.tsx', import.meta.url), 'utf8');
const board = readFileSync(new URL('./AxisBoard.tsx', import.meta.url), 'utf8');

assert.match(play, /chooseUsOperationOrder.*first: 'china'/s, 'player can explicitly choose China-first combat');
assert.match(play, /chooseUsOperationOrder.*first: 'usa'/s, 'player can explicitly choose USA-first combat');
assert.match(play, /view\.active === 'usa' && !view\.usaOperationFirst && <UsaChinaOrderChooser/, 'chooser replaces movement while operating power is unset');
assert.match(play, /key=\{`combat-\$\{view\.operatingPower\}`\}/, 'combat picker remounts when the exact operating power changes');
assert.match(play, /const techs = me === 'china' \? \[\]/, 'China receives no United States technology in movement previews');
assert.match(play, /return new Set\(view\.chinaPlacementSpaces\)/, 'mobilization uses the authoritative China placement snapshot');
assert.match(play, /eligible at mobilization start · any number may deploy/, 'placement UI explains unlimited placement after phase-start eligibility');
assert.doesNotMatch(stage, /POWERS\[c\.attacker\]/, 'cinematic battle stage never indexes major powers with a Chinese attacker');
assert.match(stage, /attackerName:\s*powerName\(c\.attacker\)/, 'both battle renderers receive a China-safe attacker label');
assert.match(board, /United States'} operations · \$\{view\.usaOperationIndex \+ 1\}\/2/, 'TV HUD exposes nested USA/China operation progress');
assert.match(board, />\{active\.name\} turn</, 'TV keeps the major USA turn owner visible');

console.log('axis China UI: all checks passed');
