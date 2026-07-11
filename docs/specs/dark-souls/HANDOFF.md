# Dark Souls: The Board Game — Port Handoff

Written 2026-07-10, mid-port, at the ship-gate stage. This is the complete,
self-contained state of the Dark Souls port so a fresh session (or a different
model) can resume with zero context loss. Read this top to bottom before
touching anything. The short-form recall lives in
`~/.claude/projects/.../memory/dark-souls-port.md`; this file is the long form.

Owner goal (verbatim intent): "get to work on Dark Souls The Board Game With
Official Add Ons, Darkroot Expansion, Four Kings, Old Iron King and Black Dragon
Kalameet. I want full parity with the game. I need the UI and UX to be perfect.
Follow the playbook. It needs to be user friendly. Make it perfect, work until
it is."

---

## 0. TL;DR — where the port stands

**Roughly 90% built. Not yet shippable — two ship gates remain and there is
broken uncommitted code + an entanglement problem to resolve.**

Done and committed (20 commits, all pushed to origin main):
- Full data layer: 8 goldens, all pixel/overlay-verified, zero placeholders.
- Engine: `shared/src/darksouls/`, ~5.8k lines, test suite **136 assertions
  green**.
- TV board client + device client, both live-verified with screenshots.
- Server + lobby wiring (VERIFIED LIVE but NOT COMMITTABLE yet — see §7).

Not done:
- **Ship gate 1** (rulebook UI-coverage audit) — agent started, killed by usage
  limit before finishing. Left partial edits (see §8).
- **Ship gate 2** (`darksouls-ui-smoke.mjs` 4-page DOM game) — agent started,
  killed by usage limit. Left a partial driver script (see §8).
- The entangled wiring files are uncommitted and blocked on the other session
  (see §7).
- **DsPlay.tsx currently DOES NOT TYPECHECK** — the killed gate agents left it
  broken (see §8). This must be fixed or reverted before anything else.

---

## 1. Source material

**Mod:** TTS Workshop `1210887127` — "Dark Souls The Board Game With Official Add
Ons, Darkroot Expansion, Four Kings, Old Iron King and Black Dragon Kalameet".
The title matches the owner's request word for word. Cache JSON at
`C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/1210887127.json`.

- It is a **dumb table**: LuaScript is the 336-char stock TTS template (empty
  onLoad/onUpdate), no object-level Lua. All rules come from the printed cards +
  the official rulebooks. There is NOTHING to parse from Lua.
- **Do NOT confuse with mod `2090170303`** ("DARK SOULS - ALL OFFICIAL CONTENT")
  — a different, bigger mod. We used 2090170303 ONLY as a source for cached
  rulebook PDFs (it ships 16 official Steamforged PDFs; our mod ships none).

**Recursive object inventory:** 1212 objects — 575 cards in 71 decks, 222 tiles,
89 Infinite_Bags (piece dispensers), 60 BlockSquares, 48 custom d6 (4 face
sheets), 42 Custom_Models, 21 Bags, 12 standees, etc.

**Asset hosting reality (important for any re-extract):** 305 unique asset URLs.
~1120 references on the dead `cloud-3.steamusercontent.com` (rewrite to
`steamusercontent-a.akamaihd.net`), PLUS ~632 old Google Drive links, 44
**Pastebin** links (the class-mini OBJ meshes are hosted as pastebin.com/raw!),
and 15 deviantart textures. `download-mod-assets.mjs 1210887127` fetched 305/306;
the one failure (Ornstein's mesh, ugc/831322964257707424) was a transient network
error and was re-fetched by hand. Everything is now in the TTS cache. The munge
is `url.replace(/[^A-Za-z0-9]/g,'')`; try the akamaihd rewrite first, fall back
to the raw URL. Cache layout: `Mods/{Images,Models,PDF}/<munge>.<ext>`.

**Rulebooks** (the mod ships ZERO PDFs — all sourced externally, staged at
`games/dark-souls/rulebooks/`, committed):
- `core-rulebook.pdf` (40pp) — recovered from the Internet Archive. The dead
  squarespace URL 404s live; the Wayback CDX API had a snapshot
  (`web.archive.org/web/20201112012441id_/...DS-Core-Rules-lores.pdf`). WebFetch
  can't reach archive.org, so fetch via a node `fetch()` script (that works).
- `darkroot.pdf` (12pp), `four-kings.pdf` (16pp), `old-iron-king.pdf` (16pp),
  `black-dragon-kalameet.pdf` (16pp), `add-ons.pdf` (15pp, invader/summon/mimic
  rules), `characters-expansion.pdf` (bonus) — all from mod 2090170303's cache.
- To READ a PDF: pymupdf (`import fitz`), render sparse pages with
  `page.get_pixmap(dpi=100)` and Read the image. Wrap stdout in a utf-8
  TextIOWrapper or cp1252 throws.

---

## 2. Commit history (all on origin main, chronological)

```
45d6b0b scout inventory (1212 objects, 71 decks, 10 classes, risks)
90996f4 stage all official rulebooks (core recovered via Wayback)
0e193da core rulebook digest (40pp, page refs, engine notes, gap list)
214b7aa expansion digests (Darkroot, FK, OIK, Kalameet, Add Ons)
b428d96 dice golden (pixel-verified 2 ways)
7658fcc enemies golden (15 data cards, 23 behaviors, Kirk x2)
3a0c2af encounters golden (66 cards)
38ca7a4 treasures golden (278 cards)
358b92f parity spec (docs/specs/dark-souls.md)
1c2961b bosses golden (15 bosses, 180 cards)
db278bd extractor + staged assets (302 files, 115MB)
373c954 classes golden (10 boards)
207c204 scenarios golden (7 scenarios)
b2e8cbd tiles golden (22 faces, 356 nodes, 931 edges)
245ab7f OIK Blasted Nodes + Kalameet Fiery Ruin decoded node-by-node
6d529d9 engine + 116-assertion test suite
776d759 lobby tile
c9c905e decoded patterns consumed + summons wired + decision log (136 green)
372f089 device client
1fba088 TV board
```

---

## 3. The data layer (8 goldens under `games/dark-souls/golden-draft/`)

All committed. All mirrored into `shared/src/darksouls/data/` by
`shared/src/darksouls/sync-data.mjs` (re-run it after editing any golden). The
transcription method throughout: crop each card cell from the cached sheet with
sharp (cell = `CardID % 100`; sheets are 10-wide; grid dims recorded per deck),
Read the crop, transcribe, re-crop solo when ambiguous, cross-check against the
rulebook's worked examples.

### dice.json — pixel-verified two ways (visual + bright-pixel-count)
- black `{0,1,1,1,2,2}`, blue `{1,1,2,2,2,3}`, orange `{1,2,2,3,3,4}`, dodge 3
  success / 3 blank (50% per die).
- Sheets are 302x302, 3x3 grid, **top row unused**, faces in rows 2-3.

### enemies.json — 15 data cards, 23 behaviors, ZERO unreadables
- 6 core + 7 Darkroot enemies + 2 invaders (Kirk, Longfinger Kirk).
- **CRITICAL CORRECTION discovered here (overrides the digests):** the core
  digest §12 icon glosses are INVERTED. On the actual cards (verified vs rulebook
  p.40 icon key): **skull = targets the AGGRO-token holder; ornate ring = nearest
  character; (●) = damage all models on the node.** Every downstream transcription
  and the engine use the corrected legend.
- **Regular enemies have NO behavior decks** — behavior is printed on the data
  card (rules p.24). The small unnamed 5-card decks in the mod are
  starting-equipment decks, not behavior decks.
- **The mod contains only 2 of 12 invaders** (Kirk + Longfinger Kirk). "Full
  parity" = parity with the MOD's contents; the other 10 invaders have zero
  assets in the save.
- Darkroot obscured stats resolved from sheets: Mushroom Parent block 1/resist 2
  (its "6" is push-damage on the move, no attack), Plow Scarecrow damage 4
  (targets aggro), Stone Guardian/Knight push values. Crossbow Hollow's attack is
  MAGICAL; both archers target aggro; Greatbowman attacks BEFORE moving.

### encounters.json — 66 cards
- Core L1/L2/L3 (12 each), Darkroot L1/L2/L3 (6 each), mega-boss L4 (4 each for
  FK/OIK/Kalameet).
- This edition's cards are **v1 pictographic**: no trial text, no party-size
  scaling. Rewards are rulebook constants (2 souls/char L1-3, 8 souls/char L4).
  Red circle = primary spawn, red X = secondary, gold dagger band = trapped.
- **6 mega-boss L4 cards spawn enemies from sets NOT in this mod** — flagged
  `enemy: "UNKNOWN"`. The engine treats them as **undrawable** (the official
  redraw rule: if a revealed L4 needs components you don't own, draw another).
- Cross-check: rulebook p.18 worked example ("The Forgotten") matched exactly.

### treasures.json — 278 cards, ZERO unreadables
- core 70, transmuted 20 (all embered), darkroot 15, boss 35, class 5+5
  transposed x10 classes = 100, starting equipment 35, invader 2.
- Rulebook examples match dice-for-dice (Dragonslayer Spear, Shortsword, mega-boss
  rewards).
- `twoHanded` settled by a glyph pass (46 cards; note Dragonslayer Spear / Iron
  King Hammer / Four Kings Sword print as ONE-handed).
- No separate "legendary" deck exists — the 20-card Transmuted deck IS the
  legendary pool (owner open question #4, default adopted).
- Class-deck assignment inferred (TTS `deckGuid` preserved as ground truth).

### bosses.json — 15 bosses, 180 cards, ZERO unreadable faces
- Minis: Winged Knight, Titanite Demon, Gargoyle, Boreal Outrider (8 each: 5
  std + 3 heat). Dancer (12). Ornstein & Smough (15: 5 PAIRED tete-beche + 5
  Ornstein-heat + 5 Smough-heat). Old Dragonslayer (8). Hungry/Voracious Mimic
  (7 each, no arcs, no heat). Smelter Demon (13). Artorias (13). Sif (14, incl.
  Limping Strike cooldown). Four Kings (20: King One 8, Kings Two/Three/Four 4
  each; dodge scales 1→2→3). Old Iron King (18: 9 behaviors + 3 Fire Beam + 6
  Blasted Nodes). Kalameet (21: 13 behaviors + 8 Fiery Ruin).
- **OIK Blasted Nodes (6) + Kalameet Fiery Ruin (8) are decoded node-by-node**
  (commit 245ab7f) — affine-fit onto the arena's printed eye/head icons,
  overlay-verified. `{tile, nodes[], dpadNode}` per card. `_meta.resolved`
  documents the decode conventions. OIK's 3 Fire Beam cards carry no per-card
  target by design — they resolve via the Blasted Nodes deck.
- **Summons appended later** (commit c9c905e): Eygon of Carim (taunt 11, Battle
  Ready) + Witch Beatrice (taunt 0, blue weak-arc bonus), from the addon25 sheet
  cells 55-64. 4 behavior cards each. In a `summons` section of the golden.
- Digest corrections: Voracious Heavy Punch damage = 6 (the digest's "5" is the
  Hungry Mimic card); skull=aggro confirmed.

### classes.json — 10 class boards
- Warrior, Knight, Herald, Assassin, Sorcerer, Thief, Deprived, Cleric,
  Mercenary, Pyromancer. Full stat tier tables Base/T1/T2/T3 (+ campaign T4=40
  constant). Taunt order is a complete 1-10 permutation. Heroic actions verbatim.
  Endurance = 10 boxes (verified vs p.20). Herald's table matches p.15 photo
  digit-for-digit.
- **FLAGS:** the mod ships only 7 character sculpts for 10 classes — **no mini
  for Thief, Cleric, Pyromancer** (TV uses stand-in sculpts + seat-colour rings
  for identity). Deprived/Mercenary minis are position-inferred (confirm with a
  render). Dodge dice come ONLY from equipment (no class dodge stat).

### tiles.json — 22 faces, 356 nodes, 931 edges, overlay-verified
- 12 room faces (room1a-6b, 13n/32e each, primary/secondary spawn+terrain node
  roles keyed to encounters.json), mini-boss tile (boss1a/b), main-boss tile
  (boss2a/b), 3 mega arenas (front+back where two-sided; OIK-back has 3
  `ironKing` eye nodes). 8-way adjacency per p.10.
- **Low-confidence flags:** FK-front is the blurriest scan + its doorway is not
  printed (S by convention); OIK-back is low-res; boss-tile doorways are art-read
  only. Overlays in scratchpad `ds-tiles/`.
- Note: the mod's 63 physical State room faces are per-encounter DRESSED art
  variants; the graphs cover the 12 canonical faces. A future nicety is mapping
  each encounter to its dressed art.

### scenarios.json — 7 scenarios + campaignOverlay
- `standard` (one-shot), `first-journey`, `coiled-sword`, `facing-the-abyss`
  (Darkroot), `call-of-the-abyss` (Darkroot+FK), `bathed-in-flame` (extends
  first-journey + Kalameet), `go-beyond-death` (**excluded: true** — needs
  Pursuer + Explorers/Iron Keep content absent from the mod).
- campaignOverlay carries persistence, spark economy (+1/boss, 2-souls-per-member
  purchase), shop overrides 2/1, dash-through, campaign level table 4/8/16/20 +
  T4=40 — all verbatim with page refs.
- **KNOWN PRINTED-GAME CONFLICT:** Call of the Abyss needs 3 distinct Four Kings
  L4 draws but only 2 are drawable with this mod's contents. Engine default =
  **cross-deck L4 substitution** (owner open question, default adopted).

---

## 4. The engine — `shared/src/darksouls/`

~5.8k lines. Test suite **136 assertions, 0 failures**
(`npx tsx shared/src/darksouls/darksouls-test.ts`). Exported from
`shared/src/index.ts` (all `Ds`/`DS_`-prefixed, collision-checked).

Files:
- `config.ts` (~130) — spark table (5/4/3/2 by player count), level costs
  (std 2/4/8, campaign 4/8/16/20 + T4=40), soul rewards, condition defs (incl.
  calamity, supply cap 4), exact golden dice faces, trap distribution, ember /
  endurance / node-cap constants.
- `data.ts` (~390) — typed accessors over the mirrored goldens (enemies,
  encounters + undrawable-L4 predicate, treasures, bosses incl. paired O&S / FK
  pools / decoded beam+strafe, classes, tile BFS/entrances/terrain, scenarios,
  summons).
- `state.ts` (~938) — `DsState` (options, stages, campaign cursor, sparks/souls/
  droppedSouls, characters with **cube endurance bar** [black stamina from top,
  red damage from bottom], equipment slots, conditions, position, per-char + party
  soul cache, summonEarned/summon, tile chain with persistent chests/traps/mimics/
  invasion tokens, encounter run, boss run [deck/discard/heat-up/beam/strafe/kings/
  arc facing/position], aggro token holder, pendings queue, serializable script,
  seeded RNG counter [mulberry32], TV log with node refs), `createDarkSouls`,
  `dsViewFor` (public-info game; deck order hidden as a count).
- `actions.ts` (~3000) — the full action union + a `choose`-only gate while
  pendings exist (head-owner only) + a **resumable enemy/boss step executor** that
  emits log steps for TV playback. Handles: printed-behavior enemies (corrected
  icon key), invaders with decks/heat-up, all 11 bosses incl. O&S pairing +
  survivor decks, Four Kings Royal Summons + Take a Breather, OIK lava-lock +
  beam indirection (decoded) + Old Iron Rage, Kalameet strafe/calamity (decoded)
  + Mark, mimics, Sif/Artorias/Dancer/Smelter/Old-Dragonslayer heat-up overrides,
  arcs / weak-arc +1 black die, pushes/overflow/traps, death → cache drop → corpse
  run → spark/TPK reset, standard + mega-finale + campaign progression (double
  Gargoyle, named encounters, L4 sections, dash-through), summon lifecycle
  (fog-gate souls-XOR-summon fork, activation after every character, Distract,
  boss can hit/push summons, death without bonfire reset).
- `darksouls-test.ts` (~848) — 3-part per playbook §6.3: bot playthroughs
  (standard 1-4p, First Journey S1 1-4p; bots LOSE on sparks, which is correct —
  DS is brutal to greedy bots, so all win/progression paths are covered by
  directed tests), conservation invariants after every action (treasure multiset,
  endurance 0-10, node caps 3-models/1-boss, soul/spark ranges, behavior-deck
  ledger), directed rules tests with digest page refs (aggro grab, estus, ember
  threshold, heat-up injection, weak-arc, dodge 50% via seeded stream, cache
  drop/retrieval, TPK, FK king-2 injection, undrawable-L4 redraw, CotA cross-deck
  substitution, decoded beam/strafe exact node sets, full summon lifecycle).

**The 27 engine judgment calls** (rules the rulebook/goldens left ambiguous) are
recorded verbatim in `docs/specs/dark-souls.md` §7 "Decision log (engine v1)".
Highlights the next session should know:
- **#11 (LARGEST GAP for true full parity):** the 25 text-only spell cards are
  rejected in v1 — the engine only executes "+N damage" and "gain Bleed" upgrade
  text. A spell-effect DSL is the biggest remaining rules gap.
- #13/#17: character-inflicted conditions don't stick to bosses/summons in v1.
- #14: OIK beam / Kalameet strafe band-approximation was DELETED — engine now
  consumes the decoded node lists.
- #3: trap token values are invented (in no golden or rulebook).
- #20: legendary injection = the Transmuted deck.
- Mega-tier summons are absent from the mod (only mini/main tiers can summon).

---

## 5. The clients — `client/src/darksouls/`

### TV board (committed, live + fixture verified)
- `DsBoard.tsx` — stage plate, whose-activation pill, AI step-log playback
  (~2.3s dwell, camera flown to each step's nodeId, playSfx per kind), per-char
  endurance chips on the mod's healthbar tiles (black cubes from left, red from
  right, estus/luck/heroic/ember markers, aggro + first-activation tokens), boss
  panel (mod dial-wheel art rotated by health, KING ONE-FOUR mats for FK, paired
  O&S dials, deck/discard, heat-up flag, flipped behavior card as banner), bonfire
  panel, tile map strip, fog-gate overlay, VICTORY / YOU DIED screens, mute,
  `?cam=x,z,h` shot pin, DEV `?dsfix=<bossId|victory|defeat>` fixture (builds a
  legal boss fight through the real engine).
- `DsScene.tsx` — 3D table: tile/arena/bonfire plane with staged art, gold node
  rings from the tiles golden, OBJ minis seated by bounding box, standees for flat
  minis, terrain/traps/tokens, arc rings + facing tick, fog mist wall, orbit
  camera with focus flights.
- `ds-assets.ts` — FACE_ART map (engine faceId → staged art via munged-URL→GUID
  matching, fronts AND backs), mini lookups, behavior-cell → sheet-cell resolver.
- `ds-board.css` — ds-* HUD on ig-* glass tokens.
- `BoardPage.tsx` — the lazy `DsBoard` dispatch (2 hunks). **ENTANGLED, see §7.**
- Asset finds: manifest `bossDial.face` (guid 7cb5fc) is actually the BONFIRE
  tile art; the real dial wheel is token `ref-705789`.

### Device (committed, live verified)
- `DsPlay.tsx` — class pick (10 real boards), encounter screen (class-board mat
  with sheet-cell card crops in printed slots, live cube endurance bar, node map,
  action rail with walk/run/per-weapon attacks showing dice chips + range/icon
  tags + stamina cost, estus, heroic, swap, explicit END ACTIVATION), centered
  pending prompts (defence with block+dodge dice, dodge-move, post-roll with luck/
  heroic, push placement, treasure keep, trap, arc, aggro, ember), bonfire (travel
  strip, chest, Andre buy/equip/sell, Firekeeper tier table + costs, stash, REST
  host-gated), show-deck, GameIntro 6-step walkthrough, game-over. Souls/sparks
  always in header. **CURRENTLY BROKEN — see §8.**
- `dsPlayRules.ts` — client-side mirror of every reducer legality check (so
  buttons grey with inline reasons, never bounce errors). **Partial edits, see §8.**
- `DsNodeMap.tsx` — 2D node-graph tap surface from tiles.json.
- `ds-play.css` — own stylesheet.
- `PlayPage.tsx` — lazy `DsPlay` dispatch. **ENTANGLED, see §7.**
- `rulebook.pdf` — core book copied for GameIntro (committed).

---

## 6. Server + lobby (VERIFIED LIVE, but see §7)

An agent wired `darksouls` into the server registry + lobby and verified it live:
a full bot party played a real room to a legal spark-out gameOver (28 paced bot
log lines, zero warnings), engine suite re-ran 116/116 (this was before the
summons commit took it to 136).

- Registry: `engines.darksouls` {create/view/apply} using `createDarkSouls`,
  `dsViewFor`, `applyDarkSoulsAction`. `DS_SEATS`/`DsSeat` added to
  `shared/src/darksouls/state.ts`, wired into `shared/src/protocol.ts`
  (`SeatColor`, `GAME_SEATS`).
- Seats: co-op 1-4, palette Ember / Ash / Moss / Slate (classes picked in-game).
  `soloSeats: 4` so a lone dev table gets a full party. Create options: scenario,
  partySize, darkrootMix, darkrootTreasure, mimics, invaders, summons.
- `scheduleDsBots` + `dsBotAct` (policy cribbed from the test suite): answers
  pendings at 1.0s, picks classes at 0.9s (only after humans lock in), char turns
  at 1.8s, bonfire at 2.2s (CPU levels primary stat; travel/shopping stay with a
  human host).
- Lobby tile at `client/public/dark-souls/logo.webp` (committed) composed from
  the mod's class-board back. `SelectGame.tsx` gets tile + 7-row options panel;
  `TableScene.tsx` gets 4 DS seat hexes.

---

## 7. CRITICAL: the entanglement problem (deferred-commit files)

A **second Claude session is concurrently working in the same git working tree**
on other games (a new "politik" game + an Axis v2 rework). Its uncommitted
changes are interleaved with our DS wiring in these shared files:

```
 M server/src/index.ts          (2243-line diff — mostly the OTHER session)
 M client/src/pages/BoardPage.tsx
 M client/src/pages/PlayPage.tsx
 M client/src/pages/SelectGame.tsx
 M shared/src/protocol.ts
 M shared/src/index.ts
 M client/src/brass/TableScene.tsx
 M client/src/main.tsx
```

Our DS additions to these files are REAL and VERIFIED but **must not be committed
wholesale** — `git add`-ing them would sweep the other session's WIP into our
commit (the playbook §7 explicitly warns about this; it already happened once on
the Axis port). **Rule: never `git add` those 8 files as a unit.**

Resolution options for the next session (pick based on what you find):
1. **Preferred:** wait until the other session commits its work, then the working
   tree diff on those files will be OUR DS residue only — commit that with
   explicit paths.
2. If you must commit sooner, use `git add -p` to stage ONLY the DS hunks in each
   file (the DS hunks are recognizable: `darksouls`/`DsBoard`/`DsPlay`/`DS_SEATS`/
   `POLITIK` is the other session, not us).
3. Verify after: `git stash` is dangerous here (shared tree) — avoid it.

Everything in `client/src/darksouls/`, `shared/src/darksouls/`, `games/dark-souls/`,
`docs/specs/dark-souls*`, `client/public/dark-souls/`, `tools/tts-extract/
extract-dark-souls.mjs`, `tools/verify/ds-drive.mjs` is DS-OWNED and safe to
commit with explicit paths.

---

## 8. BROKEN / partial uncommitted work from the killed ship-gate agents

Two agents were launched for the ship gates and both were killed by the Fable 5
usage limit mid-edit. They left the working tree in a partially-broken state:

```
 M client/src/darksouls/DsPlay.tsx      <- DOES NOT TYPECHECK (see errors below)
 M client/src/darksouls/dsPlayRules.ts  <- +83 lines, partial
?? client/src/darksouls/dsAssets.ts     <- 124 lines, NEW, untracked (note: a
                                            DUPLICATE-ish of ds-assets.ts with a
                                            different name — reconcile or delete)
?? tools/verify/darksouls-ui-smoke.mjs  <- 277 lines, partial gate-2 driver
```

**DsPlay.tsx typecheck errors** (`cd client && npx tsc --noEmit`):
```
DsPlay.tsx(927,20): Property 'plan' does not exist on type
  '{ kind: "walk"|"run"; plan: MovePlan } | { kind: "swap" }'
DsPlay.tsx(927,38): Parameter 't' implicitly has 'any' type
DsPlay.tsx(937,15): Type '"swap"|"walk"|"run"' not assignable to DsAction type
```
These come from a half-finished refactor of the move/swap action shape. **First
task for the resumer: decide to FINISH or REVERT these partial edits.** The last
CLEAN committed state of DsPlay.tsx/dsPlayRules.ts is commit `372f089` (device
client) — `git checkout 372f089 -- client/src/darksouls/DsPlay.tsx
client/src/darksouls/dsPlayRules.ts` reverts them if you'd rather rebuild the
gate work fresh. `dsAssets.ts` (untracked) and the partial `darksouls-ui-smoke.mjs`
can be deleted and rebuilt, OR finished.

Note the naming collision: the TV agent committed `ds-assets.ts` (hyphen); a gate
agent created `dsAssets.ts` (camel). Only `ds-assets.ts` is imported/committed.
Delete `dsAssets.ts` unless you deliberately merge it.

---

## 9. What remains to finish the port

1. **Fix or revert the broken DsPlay.tsx** (§8) so the client typechecks clean.
2. **Ship gate 1 — rulebook UI-coverage audit** (playbook §6.4b): re-read the 6
   digests + spec §7, map every player decision / optional cost / choice of
   amount / public-info to a concrete UI element on device or TV; reverse-sweep
   the `DsAction` union for values the UI auto-picks; write the findings as
   `docs/specs/dark-souls.md` §8 with a FULL/ENGINE/SIMPLIFIED/MISSING legend;
   fix small gaps inline. (Agent `af2c256711d36d3b2` started this — its transcript
   may be resumable, or start fresh.)
3. **Ship gate 2 — UI-driven full game** (playbook §6.4b): finish
   `tools/verify/darksouls-ui-smoke.mjs` (modeled on `axis-ui-smoke.mjs`): 4
   puppeteer pages = 4 characters, all human seats so the DRIVER makes every
   decision through the DOM (partySize 4, no CPU fill). Standard one-shot. PASS =
   reach VICTORY or YOU DIED (both legal terminals) through the DOM with zero 90s
   stalls, having cleared ≥1 encounter and entered ≥1 boss fight or sparked out
   trying. **RESTART server-alt first** (tsx doesn't hot-reload shared/). If it
   stalls, the stall IS the finding — diagnose the missing affordance and fix the
   client. (Agent `a6ae9186b124b5b0e` started this.)
4. **Resolve the entangled wiring commit** (§7) once the other session lands.
5. **Final memory + spec update**, then report to owner.

Optional parity-completeness follow-ups (not blockers, but "full parity" +
"perfect" is the bar): the 25 text-only spell DSL (§4 gap #11); dressed-art tile
variants; the 3 missing class minis (substitutes are in place).

---

## 10. How to run / verify locally

- **Alt dev pair** (isolated from the other session's default 5173/8787):
  server-alt on **8899**, client-alt on **5273**, via `.claude/launch.json`
  (`npm run dev:alt`, vite proxy via BGE_SERVER env). ALWAYS restart server-alt
  after any `shared/` change — tsx does not hot-reload the workspace dep, and a
  stale server silently serves the old engine (this bit the Axis port repeatedly).
  Note: a prior run left the alt server started as `brass` for DS rooms and left
  two poisoned saves that crash-loop `scheduleDsBots` at boot — if the alt server
  won't start, check `server/.rooms.json` for DS saves and remove them.
- **Engine tests:** `npx tsx shared/src/darksouls/darksouls-test.ts` (136 green).
- **Client typecheck:** `cd client && npx tsc --noEmit` (there is a pre-existing
  error in the OTHER session's `axis-*-presentation-test.ts` — ignore it; DS files
  must be clean, and right now DsPlay.tsx is NOT — see §8).
- **Re-sync a golden into the engine:** edit `games/dark-souls/golden-draft/*.json`,
  then `node shared/src/darksouls/sync-data.mjs`.
- **Re-run the extractor:** `node tools/tts-extract/extract-dark-souls.mjs`
  (idempotent, count-asserted, skip-if-exists).
- **Screenshot verify:** `tools/verify/ds-drive.mjs` drives a room; `shoot.mjs`
  for TV (honors `?cam=` and `?dsfix=<bossId>`), `phone-shot.mjs` for device.
- **Scratchpad artifacts** (overlays, crops, driver scripts) from all the
  transcription/verification agents live under the session scratchpad
  `.../scratchpad/ds-*/` if any respin is needed.

---

## 11. Owner open questions (flagged in spec, defaults adopted — confirm with owner)

1. Campaign save persistence (one room = one campaign — DEFAULT) vs export.
2. Solo UX (one player driving multiple characters vs CPU fill — engine supports
   both; `soloSeats: 4` gives a full party).
3. Physical boss-dial fidelity on the TV (implemented as rotated dial-wheel art).
4. Legendary pool = the 20-card Transmuted deck (DEFAULT, no separate legendary
   set exists in the mod).
5. Keep the invaders module with only 2 of 12 invaders + 3 tokens (KEPT).
6. Summons pool = 2 of 10 (Eygon, Beatrice — the only two in the mod; WIRED).
7. Undrawable-L4 count: 5 cards with UNKNOWN spawns (golden) vs the brief's 6.
8. "Go Beyond Death" campaign EXCLUDED (needs absent Pursuer/Explorers/Iron Keep).
9. Mimic-marked chests print on L4 cards even with the Mimics module off (they
   ambush anyway — DEFAULT per OQ9).
10. Call of the Abyss cross-deck L4 substitution (DEFAULT — only 2 of 3 needed FK
    L4s are drawable).

---

## 12. Playbook discipline reminders (this port has followed them; keep it up)

- Mod files are the golden source — never memory/web for rules. (We recovered the
  core rulebook rather than reconstruct it from memory.)
- Overlay-verify, never eyeball (tiles, node patterns, dice all done this way).
- Commit + push at every milestone (20 commits so far — the port is fully
  resumable from any of them).
- No em dashes, no emoji, UPPERCASE labels, middot separators, seat = outline not
  dot, explicit End Turn (END ACTIVATION), show-deck, grey-out-unaffordable with
  reason, no-scroll iPad-landscape 768, cards portrait upright, real 3D + orbit
  camera on the TV / fixed frame on the personal mat.
- Prove every fix with a screenshot or green test run in the same message.
```
