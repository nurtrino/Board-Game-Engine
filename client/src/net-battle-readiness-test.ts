import assert from 'node:assert/strict';
import type { ClientMsg } from '@bge/shared';
import { discardQueuedBattleVisualReadiness, enqueueClientMessage } from './net.js';

const queue: ClientMsg[] = [];
enqueueClientMessage(queue, { type: 'start' });
enqueueClientMessage(queue, {
  type: 'axis_battle_visual_ready',
  combatId: 7,
  visualSeq: 2,
  ready: true,
});
enqueueClientMessage(queue, { type: 'dev_view', seat: null });
enqueueClientMessage(queue, {
  type: 'axis_battle_visual_ready',
  combatId: 7,
  visualSeq: 2,
  ready: false,
});

assert.deepEqual(queue, [
  { type: 'start' },
  { type: 'dev_view', seat: null },
  { type: 'axis_battle_visual_ready', combatId: 7, visualSeq: 2, ready: false },
], 'a reconnect replays only the final readiness fact while preserving every durable message');

enqueueClientMessage(queue, {
  type: 'axis_battle_visual_ready',
  combatId: 8,
  visualSeq: 0,
  ready: true,
});
assert.deepEqual(
  queue.filter((message) => message.type === 'axis_battle_visual_ready'),
  [{ type: 'axis_battle_visual_ready', combatId: 8, visualSeq: 0, ready: true }],
  'readiness never carries across battle generations in the offline queue',
);

discardQueuedBattleVisualReadiness(queue);
assert.deepEqual(
  queue,
  [{ type: 'start' }, { type: 'dev_view', seat: null }],
  'room navigation drops ephemeral readiness without disturbing durable queued messages',
);

console.log('socket battle readiness queue: all checks passed');
