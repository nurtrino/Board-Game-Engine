import { stateMatchesGame } from './save-compat.js';

const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
};

check(stateMatchesGame('seti', { game: 'seti', round: 3 }), 'matching tagged SETI state is resumable');
check(!stateMatchesGame('seti', { era: 'canal', round: 1 }), 'untagged Brass state cannot masquerade as SETI');
check(!stateMatchesGame('seti', { game: 'brass', round: 1 }), 'mismatched tagged state is rejected');
check(stateMatchesGame('brass', { era: 'canal', round: 1 }), 'legacy untagged Brass state remains resumable');
check(stateMatchesGame('darktower', { level: 2, dtBrigands: 18 }), 'legacy untagged Dark Tower state remains resumable');
check(!stateMatchesGame('bloodborne', { phase: 'play' }), 'modern untagged state is treated as incompatible');
check(stateMatchesGame('feast', null), 'an unstarted lobby has no compatibility problem');

console.log('save compatibility: all checks passed');
