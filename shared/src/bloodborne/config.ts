// Bloodborne: The Board Game — engine constants. Rules per
// docs/specs/bloodborne.md (Core Rulebook v1.1 page refs).

// Lobby seat colors (join order = seat index). Hunter (weapon) is picked
// in-game during the setup phase, so colors stay hunter-agnostic. The four
// physical dashboard trims are red/blue/green/yellow (mod dashboards).
export const BB_SEATS = ['Crimson', 'Cobalt', 'Verdant', 'Amber'] as const;
export type BbSeat = (typeof BB_SEATS)[number];

export const BB_MAX_HP = 6; // p. 8 (heal to 6 at the Dream)
export const BB_MAX_ECHOES = 3; // p. 21 (a 4th is discarded)
export const BB_HAND_SIZE = 3; // p. 14 / p. 18 refresh
export const BB_HUNTER_DECK_SIZE = 12; // always 12 (p. 24)
export const BB_MOVE_SPACES = 2; // p. 14
export const BB_UPGRADE_ROW = 4; // p. 9 (4 faceup upgrade slots)
export const BB_MAX_TOOLS = 2; // p. 17 (max 2 Hunter Tools)
export const BB_MAX_RUNES = 2; // p. 17 (max 2 Caryll Runes)

// Enemy Action deck composition (p. 20): 3 Basic / 2 Special / 1 Ability,
// reshuffled ONLY when empty (card counting is intended).
export const BB_ENEMY_ACTION_DECK = ['basic', 'basic', 'basic', 'special', 'special', 'ability'] as const;
export type BbEnemyActionKind = (typeof BB_ENEMY_ACTION_DECK)[number];

// Attack speeds. Resolution order fast > medium > slow; ties simultaneous
// (p. 20). Effects can push speed above fast or to 0 (p. 21) — the engine
// keeps a numeric rank: slow=1, medium=2, fast=3, 0 = after everything.
export type BbSpeed = 'fast' | 'medium' | 'slow';
export const BB_SPEED_RANK: Record<BbSpeed, number> = { fast: 3, medium: 2, slow: 1 };

// Hunt track: length + reset icons are transcribed from the hunt board art
// (golden components.huntBoard). See data.ts HUNT_TRACK.

export const BB_STATS = ['endurance', 'skill', 'strength', 'vitality'] as const;
export type BbStat = (typeof BB_STATS)[number];
