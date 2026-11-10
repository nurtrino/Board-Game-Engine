import { POWERS, type AxisPending, type AxisView, type PowerKey } from '@bge/shared';

type BattleSide = 'attacker' | 'defender';

/** The U.S. player makes every decision attributed to the China minor power. */
export function axisControllerPower(power: string | null | undefined): PowerKey | null {
  if (power == null) return null;
  if (power === 'china') return 'usa';
  return Object.prototype.hasOwnProperty.call(POWERS, power) ? power as PowerKey : null;
}

export function controlsAxisPower(
  controlledPowers: readonly PowerKey[],
  power: PowerKey | null | undefined,
): power is PowerKey {
  return power != null && controlledPowers.includes(power);
}

type AuthorityView = Pick<AxisView, 'controlledPowers' | 'pendings' | 'combat'>;

function liveDecisionPending(pendings: readonly AxisPending[]): AxisPending | undefined {
  return pendings.find((pending) => pending.kind !== 'battle-continue');
}

/** Power authorized to roll the current volley. Battle rolls stay attacker-led. */
export function battleRollAuthority(view: AuthorityView): PowerKey | null {
  return axisControllerPower(view.combat?.attacker);
}

/** Power authorized for the current casualty/submerge/retreat decision. */
export function battleDecisionAuthority(view: AuthorityView): PowerKey | null {
  const combat = view.combat;
  if (!combat?.battle.decision) return null;

  const pending = liveDecisionPending(view.pendings);
  if (pending) return axisControllerPower(pending.power);

  // Defensive fallback for a just-arrived view whose decision and pending
  // queue were serialized separately. Normal room views always use pending.
  if (combat.battle.decision.side === 'attacker') return axisControllerPower(combat.attacker);
  const defender = combat.battle.defender.find((unit) => unit.hp > 0)
    ?? combat.battle.defender[0];
  return axisControllerPower(defender?.power);
}

/** Power authorized to acknowledge one side of the finished battle report. */
export function battleContinueAuthority(view: AuthorityView, side: BattleSide): PowerKey | null {
  const pending = view.pendings.find((candidate) =>
    candidate.kind === 'battle-continue' && candidate.data.side === side);
  if (pending) return axisControllerPower(pending.power);

  const combat = view.combat;
  if (!combat) return null;
  if (side === 'attacker') return axisControllerPower(combat.attacker);
  const defender = combat.battle.defender.find((unit) => unit.hp > 0)
    ?? combat.battle.defender[0];
  return axisControllerPower(defender?.power);
}
