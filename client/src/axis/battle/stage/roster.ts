// How many drawn figures stand for how many engine units. Pure.
// A group of forty infantry is drawn as, say, sixteen figures; as the forty fall, the sixteen thin
// out in proportion, and the last figure stands until the last unit is gone.

export interface FigureCounts {
  /** Figures that are alive (standing, submerged or still aboard). */
  live: number;
  /** Of the live figures, how many are under water. */
  submerged: number;
  /** Of the live figures, how many have not landed yet. */
  aboard: number;
  /** Figures that left the battle alive (a partial withdrawal). */
  gone: number;
  /** Figures drawn as wrecks. */
  dead: number;
}

export interface GroupTruth {
  /** Units the group started with. */
  total: number;
  alive: number;
  submerged: number;
  aboard: number;
  /** Units no longer in the battle state at all. */
  withdrawn: number;
}

const share = (n: number, of: number, figures: number) => (of <= 0 ? 0 : Math.round((n / of) * figures));

export function figureCounts(figures: number, truth: GroupTruth): FigureCounts {
  if (figures <= 0 || truth.total <= 0) return { live: 0, submerged: 0, aboard: 0, gone: 0, dead: 0 };
  const alive = Math.max(0, Math.min(truth.total, truth.alive));
  const withdrawn = Math.max(0, Math.min(truth.total - alive, truth.withdrawn));
  let live = alive === 0 ? 0 : Math.min(figures, Math.max(1, share(alive, truth.total, figures)));
  // a group that has taken losses never looks untouched while figures remain to remove
  if (alive < truth.total && live === figures && figures > 1) live = figures - 1;
  let gone = withdrawn === 0 ? 0 : Math.min(figures - live, Math.max(1, share(withdrawn, truth.total, figures)));
  if (alive + withdrawn >= truth.total) gone = figures - live; // nobody died: no wrecks
  const dead = figures - live - gone;

  const sub = Math.max(0, Math.min(alive, truth.submerged));
  const submerged = sub === 0 ? 0 : sub >= alive ? live : Math.min(live - 1, Math.max(live > 1 ? 1 : 0, share(sub, alive, live)));
  const ab = Math.max(0, Math.min(alive - sub, truth.aboard));
  const room = live - submerged;
  const aboard = ab === 0 ? 0 : ab >= alive - sub ? room : Math.min(Math.max(0, room - 1), Math.max(room > 1 ? 1 : 0, share(ab, alive, live)));
  return { live, submerged, aboard, gone, dead };
}

/** Count a group's units in the current battle state. */
export function truthFor(
  uids: readonly number[],
  byUid: ReadonlyMap<number, { hp: number; submerged?: boolean; aboard?: boolean }>,
  allGone = false,
): GroupTruth {
  const t: GroupTruth = { total: uids.length, alive: 0, submerged: 0, aboard: 0, withdrawn: 0 };
  for (const uid of uids) {
    const u = byUid.get(uid);
    if (!u) { t.withdrawn += 1; continue; }
    if (u.hp <= 0) continue;
    if (allGone) { t.withdrawn += 1; continue; }
    t.alive += 1;
    if (u.submerged) t.submerged += 1;
    else if (u.aboard) t.aboard += 1;
  }
  return t;
}
