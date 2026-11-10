import type { BrassEvent, BrassSnap } from '@bge/shared';
import type { SceneDef } from './pieces';

/** Scene x/z of whatever an event is about: where the camera goes on the big
 * screen, and where cubes fly to and from on every screen. */
export function focusOf(scene: SceneDef, ev: BrassEvent, before: BrassSnap, after: BrassSnap): { x: number; z: number } | null {
  const at = (kind: string, test: (name: string) => boolean) => {
    const z = scene.zones.find((q) => q.kind === kind && test(q.name));
    return z ? { x: z.pos[0], z: -z.pos[2] } : null;
  };
  if (ev.square) return at('locationSquare', (n) => n === ev.square);
  if (ev.link) return at('linkZone', (n) => n === ev.link);
  if (ev.kind === 'develop') {
    if (ev.ironFrom && ev.ironFrom !== 'market') return at('locationSquare', (n) => n === ev.ironFrom);
    const slot = before.markets.iron.findIndex((v) => v === 1);
    return slot >= 0 ? at('ironMarket', (n) => n.endsWith(`iron ${slot}`)) : null;
  }
  if (ev.kind === 'loan') {
    const p = after.players.find((q) => q.color === ev.color);
    return p ? at('track', (n) => n === `track ${p.incomeOffset}`) : null;
  }
  if (ev.kind === 'scout') {
    const a = at('deckZone', (n) => n === 'wild location');
    const b = at('deckZone', (n) => n === 'wild industry');
    return a && b ? { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } : a ?? b;
  }
  return null;
}
