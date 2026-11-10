import assert from 'node:assert/strict';
import type { AxisView, PowerKey } from '@bge/shared';
import {
  axisControllerPower,
  battleContinueAuthority,
  battleDecisionAuthority,
  battleRollAuthority,
  controlsAxisPower,
} from './axisAuthority.js';

const authorityView = (overrides: Record<string, unknown> = {}) => ({
  controlledPowers: ['germany'] as PowerKey[],
  pendings: [],
  combat: {
    attacker: 'germany',
    battle: {
      decision: null,
      defender: [{ power: 'ussr', hp: 1 }],
    },
  },
  ...overrides,
}) as unknown as AxisView;

assert.equal(axisControllerPower('china'), 'usa', 'China decisions route to the U.S. controller');
assert.equal(axisControllerPower('uk'), 'uk', 'major powers keep their own controller');
assert.equal(battleRollAuthority(authorityView()), 'germany', 'the attacker controls battle rolls');
assert.equal(
  battleRollAuthority(authorityView({ combat: { ...authorityView().combat, attacker: 'china' } })),
  'usa',
  'the USA rolls for a Chinese attacker',
);
assert.equal(controlsAxisPower(['germany'], 'germany'), true, 'owned power is actionable');
assert.equal(controlsAxisPower(['ussr'], 'germany'), false, 'another player\'s power is not actionable');

{
  const view = authorityView({
    pendings: [{ id: 1, power: 'china', kind: 'battle-casualties', data: {} }],
    combat: {
      attacker: 'japan',
      battle: {
        decision: { type: 'casualties', side: 'defender', picks: 1, buckets: [] },
        defender: [{ power: 'china', hp: 1 }],
      },
    },
  });
  assert.equal(battleDecisionAuthority(view), 'usa', 'the USA controls a Chinese defender decision');
}

{
  const view = authorityView({
    combat: {
      attacker: 'china',
      battle: {
        decision: { type: 'retreat', side: 'attacker' },
        defender: [{ power: 'japan', hp: 1 }],
      },
    },
  });
  assert.equal(battleDecisionAuthority(view), 'usa', 'the USA controls a Chinese attacker decision fallback');
  assert.equal(battleContinueAuthority(view, 'attacker'), 'usa', 'the USA acknowledges for a Chinese attacker fallback');
}

{
  const view = authorityView({
    pendings: [{ id: 2, power: 'germany', kind: 'battle-retreat', data: {} }],
    combat: {
      attacker: 'germany',
      battle: {
        decision: { type: 'retreat', side: 'attacker' },
        defender: [{ power: 'ussr', hp: 1 }],
      },
    },
  });
  assert.equal(battleDecisionAuthority(view), 'germany', 'the attacker controls retreat decisions');
}

{
  const view = authorityView({
    pendings: [
      { id: 3, power: 'germany', kind: 'battle-continue', data: { side: 'attacker' } },
      { id: 4, power: 'china', kind: 'battle-continue', data: { side: 'defender' } },
    ],
  });
  assert.equal(battleContinueAuthority(view, 'attacker'), 'germany', 'attacker acknowledgement routes to the attacker');
  assert.equal(battleContinueAuthority(view, 'defender'), 'usa', 'Chinese defender acknowledgement routes to the USA');
}

console.log('axis client authority: all checks passed');
