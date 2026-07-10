// Mirror the Dark Souls goldens into the engine's data directory.
// The goldens at games/dark-souls/golden-draft/ are authoritative; the engine
// imports the copies under shared/src/darksouls/data/ (same pattern as
// axis/map-data.json). Re-run after any golden edit:
//   node shared/src/darksouls/sync-data.mjs
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const src = join(repo, 'games', 'dark-souls', 'golden-draft');
const dst = join(here, 'data');
mkdirSync(dst, { recursive: true });

const FILES = [
  'dice.json', 'enemies.json', 'encounters.json', 'treasures.json',
  'bosses.json', 'classes.json', 'tiles.json', 'scenarios.json',
];
for (const f of FILES) {
  copyFileSync(join(src, f), join(dst, f));
  console.log(`synced ${f}`);
}
