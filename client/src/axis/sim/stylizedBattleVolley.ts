import { stylizedVolleyLinks, type StylizedVolleyLink } from './stylizedBattleLayout';
import type { SimUnit } from './battlescene';

/**
 * Builds an authoritative simultaneous volley. A sculpt named in firingIds is
 * allowed to finish its shot even when it was selected as a casualty in the
 * same exchange; it remains unavailable as a target for every other shooter.
 */
export function stylizedAuthoritativeVolleyLinks(args: {
  readonly units: readonly SimUnit[];
  readonly firingIds: readonly string[];
  readonly preferredTargetIds?: readonly string[];
  readonly shotLinks?: readonly { readonly firingId: string; readonly targetId: string }[];
  readonly destroyedIds?: readonly string[];
  readonly submergedIds?: readonly string[];
}): StylizedVolleyLink[] {
  const submerged = new Set(args.submergedIds ?? []);
  const engaged = args.units.filter((unit) => !submerged.has(unit.id)
    && !(unit.paratrooper?.role === 'infantry' && unit.paratrooper.aboard));
  const byId = new Map(engaged.map((unit) => [unit.id, unit]));
  let slot = 0;
  return args.firingIds.flatMap((firingId) => {
    const firing = byId.get(firingId);
    if (!firing) return [];
    const declaredExact = (args.shotLinks ?? []).filter((link) => link.firingId === firingId);
    const exact = declaredExact
      .flatMap((link) => {
        const target = byId.get(link.targetId);
        if (!target || target.side === firing.side) return [];
        return [{ firingId, targetId: link.targetId, delayMs: slot++ * 85 }];
      });
    // Exact links are roll-level authority. They may intentionally point to an
    // aircraft whose HP already reached zero in this same AA presentation.
    if (declaredExact.length > 0) return exact;
    const links = stylizedVolleyLinks({
      units: engaged,
      firingIds: [firingId],
      preferredTargetIds: args.preferredTargetIds,
      destroyedIds: (args.destroyedIds ?? []).filter((id) => id !== firingId),
    });
    return links.map((link) => ({ ...link, delayMs: slot++ * 85 }));
  });
}
