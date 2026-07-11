# Bloodborne: The Board Game — port spec

Source of truth: TTS mod **3572706204** ("Bloodborne: The Board Game [Upscaled &
Scripted]") + the four rulebook PDFs bundled in the mod (staged to
`client/public/bloodborne/`):

- `rulebook.pdf` — Core Rulebook v1.1 (28 pp, full text; extracted to
  `games/bloodborne/rules-text/rulebook.txt` — page refs below are to this).
- `faq.pdf` — official FAQ/errata v1.0 (4 pp, full text).
- `chalice-rules.pdf` — Chalice Dungeon expansion rules (scan; read as images).
- `hunters-dream-rules.pdf` — Hunter's Dream expansion rules (scan; read as
  images).

The mod's Global Lua (`games/bloodborne/lua/global.lua`) scripts **campaign
setup only** (which mission cards, tiles, enemies per chapter). All play rules
come from the rulebooks. Game rules are FULLY ENFORCEABLE (unlike Dark Souls'
honor-system) — the engine enforces everything.

## 1. Scope

Owner directive: full parity, correct assets, perfect new-user UX.

- **First-class: the core box** — 4 campaigns × 3 chapters (The Long Hunt,
  Growing Madness, Secrets of the Church, Fall of Old Yharnam), 4 hunters
  (Saw Cleaver, Threaded Cane, Hunter Axe, Ludwig's Holy Blade), 7 core
  enemies, 5 core bosses (Father Gascoigne, Gascoigne Transformed, Cleric
  Beast, Blood-Starved Beast, Vicar Amelia).
- **Expansion content staged in data** (mod ships it all): 12 more hunters,
  ~10 more campaigns (many marked "not yet fully scripted" in the mod),
  expansion bosses/enemies/tiles, Chalice Dungeon mode, Mini-Bosses, PVP.
  Port order after core proves out.

## 2. Mod structure (where everything lives)

- 5,878 objects total; 4,567 cards in 32 unique card sheets; 547 assetbundle
  minis; 4 PDFs. Only 49 cards carry Description text — **all game data is
  printed card art** → transcription passes (see §8).
- **Campaign bags** (top level, one per campaign, e.g. The Long Hunt
  `081372`): inner Bag holds Campaign deck (intro + 3 chapter cards + ~60
  numbered mission/insight cards), `Enemies` deck (enemy stat cards),
  `Core Tiles` deck (20 map-tile cards), `Firearm Deck`, `Upgrade Stat Deck`
  (60), `Basic Stat Deck` (48 = 12×4), `Consumable Deck` (36), `Enemy Action
  Deck` (6), `Reward Deck` (25), one Bag of 4 minis per enemy type.
- **Weapon bags** (e.g. Saw Cleaver `588674`): trick-weapon dashboard card
  (double-sided), its Firearm card, weapon mini bundle.
- **Hunter bags** (e.g. Saw Cleaver Hunter `cfb7b3`): hunter mini bundle,
  hunter card, starting `Caryll Rune: Hunter` card.
- **Boss bags** (e.g. Cleric Beast `8bae08`): Phase 1 + Phase 2 Boss Action
  decks (5 cards each), Boss HP card, boss mini bundle.
- **Hunt Board** = CardCustom `66b398`; Hunt Tracker token `b567a0`;
  Hunter Dashboards = 4 scripted `Custom_Tile`s (HP 0–6, Echoes 0–3 counters,
  Transform button — mirrors of the physical dashboard).
- Zones (global.lua:1–24) define the table layout; useful for scene anchors.

## 3. Core rules (rulebook refs)

### Campaign / chapter structure (pp. 7, 12–13, 25)

- Campaign = 3 chapters ("3 separate games"). Chapter card has Setup side +
  Missions side. Intro card read at campaign start.
- Each chapter: 1 **Hunt Mission** (win condition chain) + 3 **Insight
  Missions** (side quests; completing one reveals an Insight card = reward +
  1 Collected Insight; Hunt Mission steps usually gate on Collected Insight).
- Mission cards revealed only when trigger criteria met (usually "end a move
  on tile X"); goals printed in red; "Complete the Hunt" = win the chapter.
- Mission-generated tokens/rules discard when that step completes unless the
  next card says otherwise (p. 12).
- Between chapters: hunters keep Upgrades (not exchangeable), Consumables /
  Firearms / Rewards (exchangeable between chapters only), Insight cards.
  Chapter end = all hunters go to Dream and spend remaining echoes (p. 25).
- Lose: at the START of a round only, if Hunt Track is on final space, the
  Final Round begins; fail to complete Hunt Mission by its end → campaign
  restarts (p. 13).

### Hunter setup (p. 8)

- Choose hunter → its trick weapon dashboard (2 sides, free choice of start
  side), its Firearm, mini, dashboard, 6 HP, player aid.
- Hunter deck = 12 stat cards: 3 Basic Endurance / 3 Basic Skill / 3 Basic
  Strength / 3 Basic Vitality. Deck ALWAYS contains exactly 12.
- Hand: draw 3 at first round start.

### Hunt board setup (p. 9)

- Chapter card in slot, Mission deck facedown, Intro faceup.
- Upgrade deck shuffled, 4 faceup upgrade slots (refill instantly on take).
- Consumables shuffled facedown; Rewards text-down; tokens out; Hunt Track
  token on first space.
- 3 Enemy card slots (1/2/3): chapter lists 3 enemies; each Enemy card is
  double-sided (different attacks/abilities) — randomly pick side, shuffle,
  place randomly. This maps spawn icons 1/2/3 → enemy type for the chapter.

### Chapter setup (p. 10)

- Central Lamp tile in middle, all hunters on it (any spaces).
- Special Rules cards (listed on chapter card) flipped faceup near deck.
- Tile deck = listed Named Location tiles + H×2 random tiles (H = hunter
  count; some chapters cap, see Lua `random_tiles` = `min(H*2, cap)`),
  shuffled facedown. FAQ: setup-placed "random, unused tiles" are extra.
  Excluded tiles (Lua `excluded_tiles`) never in deck.
- Enemy minis set aside; Enemy Action deck (3 Basic / 2 Special / 1 Ability)
  shuffled facedown.

### Round & turns (p. 14)

- Round = each player takes a Hunter Turn (any order, chosen each round),
  each individual turn followed by Enemy Activation. Then new round.
- New round (p. 18): 1) advance Hunt Track 1 (final space → Final Round; on
  a Reset icon → map reset §Reset; final space also resets instead of
  advancing further); 2) all players may discard any cards, then draw to 3
  (reshuffle discard when deck empty).
- Hunter Turn actions (each costs 1 stat card discarded; unlimited repeats;
  may keep cards for defense):
  - **Move**: up to 2 spaces along grey-line adjacency; must finish the
    move before another action. Minis/tokens never block. **Pursuit**: if a
    Move exits a space/tile containing enemies, at end of move those enemies
    move 1 space along the hunter's path (Move action only).
  - **Reveal tile**: moving off an unconnected exit draws the top tile,
    connects any exit of it to the space just left, populates icons
    (consumable token on each consumable icon; enemy minis on spawn icons
    1/2/3 per hunt-board mapping), then the hunter is placed on the
    connecting space (may continue leftover movement). Connecting spaces are
    adjacent (1 movement to cross); exit against no-exit = not adjacent.
    All-exits-blocked reveal → draw replacement, shuffle blocked tile back.
    Enemy mini shortage → take the farthest-from-any-hunter mini of that
    type (p. 15).
  - **Interact**: pick up consumable (discard token, draw 1 Consumable) or
    mission interaction; one Interact hits ALL interactable elements of the
    space. Enemies in the space immediately attack first (flip 1 Enemy
    Action card each; no Attack/Dodge response; slain → no interact) (p. 16).
  - **Transform**: clear ALL slots (discard the cards) and flip the trick
    weapon dashboard. Only way to clear slots barring card effects.
  - **Go to Hunter's Dream** (from anywhere): see §Dream.
  - **Attack** (enemy in same space): stat card goes into an EMPTY attack
    slot (not discarded) → Combat.
- **Enemy Activation** (after each Hunter Turn; p. 16): enemies on the
  hunter's tile or connected tiles activate, in hunt-board order 1→2→3
  (mission-spawned extra types + bosses last, FAQ). Each: move 1 space
  toward that hunter (already there → no move; if in another hunter's space,
  move only if it reaches the active hunter's space), then if in the
  hunter's space, Attack (Combat). Surprise: enemies entering activation
  range mid-activation still activate. Sudden death: hunter slain →
  remaining activations cancel.
  **OWNER DIRECTIVE (Jul 10 2026): the engine resolves Enemy Activation
  fully automatically** — movement, pathing, pursuit, and attack initiation
  happen without any player input, applying Intelligent & Cruel
  deterministically to path/order ambiguities (e.g. tie-break toward the
  move that reaches a hunter, then the lowest-HP hunter). Players only act
  inside the resulting combats (dodge etc.).

### Combat (pp. 18–22)

Always hunter vs one enemy. Steps:

1. **Select stat card** into an empty attack slot (commits that slot's
   attack). No empty slots when attacked → no attack, no dodge; suffer it.
   Stat-card effects with no stated timing trigger IMMEDIATELY on slot
   placement (attack or dodge; FAQ), before attacks resolve.
2. **Flip Enemy Action card**: Basic / Special / Ability → enemy uses that
   attack (or ability) from its Enemy card. Deck = 3/2/1; only reshuffled
   when empty (card counting is a real tactic). Abilities resolve
   immediately when flipped unless a Speed/timing is printed; can't be
   staggered/dodged unless stated. A Basic/Special slot may itself print an
   Ability (white background) — treated as Ability in all ways.
3. **Dodge** (optional): a hand card with Dodge keyword placed into an
   empty slot of speed ≥ enemy attack speed → evade the enemy attack
   entirely (not effects that don't target the hunter). Dodging doesn't
   affect the hunter's own attack. Dodge is just a keyword — dodge cards may
   initiate attacks too (FAQ).
4. **Resolve attacks by speed**: Fast > Medium > Slow; ties simultaneous
   (both damage + effects apply). Hunter with no attack counts Speed 0 when
   referenced. Speed can exceed Fast (count steps) or drop to 0 (resolves
   after everything).
   - Damage: hunter loses HP tokens (0 → slain); enemy accumulates damage
     tokens (≥ HP → slain; hunter gains 1 Blood Echo, mini removed).
   - Simultaneous slaying: both die, echo is lost.
   - Effect moved someone out of the space before the opposing attack
     resolved → that attack misses, but still "took place" for triggers
     (FAQ). Heal-after-attack doesn't save you if already slain (FAQ).

Effects (p. 21 + glossary p. 26):

- **Stagger**: cancels opposing SLOWER attacks entirely.
- **Stun**: discard 1 hand card, else suffer 1 damage.
- **Poison**: gain poison token (max 1); 1 damage at end of each of your
  Hunter Turns; removed at Dream.
- **Frenzy**: gain frenzy token (max 1); +1 damage suffered from all
  attacks; removed at Dream.
- **Block (X)**: reduce damage suffered by X; applies immediately, speed
  independent (FAQ).
- **Cancel Attack**: prevents all effects+damage unless already resolved.
- **Clear 1 Slot**: discard cards from any 1 slot (may target own).
- Stat archetypes: Endurance=dodge, Skill=stagger, Strength=+damage,
  Vitality=block/draw.
- Stat-card effects are mandatory when completable (FAQ).

### Blood echoes (p. 21)

Max 3; 4th is discarded. All lost on death. Gained: slay enemy (1), mission
rewards.

### Bosses (p. 23)

Boss HP card double-sided (Phase 1/Phase 2), HP scales with hunter count.
Phase 1 damage full → clear damage, flip to Phase 2 (excess doesn't carry;
current attack still resolves from Phase 1 deck, FAQ). Two 5-card Boss
Action decks (one per phase), used like the Enemy Action deck. Bosses are
NOT removed on reset; they heal fully (stay Phase 2). Spawned by missions;
activate after normal enemies.

### NPC enemies (p. 23)

Mission-placed tokens; act as normal enemies; single-sided Enemy card with
1–2 hunters side and 3+ side.

### Hunter's Dream (p. 23–24)

Voluntary action or on death (death: echoes discarded FIRST). Turn ends.

1. Advance Hunt Track 1 (may trigger Reset; FAQ: no limit per round).
2. Recombine ALL stat cards (deck, discard, hand, weapon slots) into deck.
3. MUST spend all echoes: each buys 1 of the 4 faceup Upgrades (slot refills
   instantly).
4. Optionally incorporate each bought upgrade: swap 1-for-1 with any card in
   the deck (deck stays 12). Unincorporated upgrades are discarded for the
   chapter.
5. Shuffle deck; refresh Firearm + Rewards; discard Poison/Frenzy; heal to 6.
6. Next round: refill hand as normal; on their turn choose weapon side and
   place mini on ANY Lamp space, then play normally.
7. Slain before taking their turn this round → skip that turn entirely
   (p. 21 "Slain out of activation").

### Hunt Track resets (p. 24)

On reaching a Reset icon space (and the final space, which resets instead
of advancing): remove all non-boss enemies from map; replenish all
consumable tokens; respawn mission enemies; replenish all spawn points
(closest-to-hunters first); bosses heal full, stay in phase.

### Consumables / Rewards / Firearms (p. 17)

- Consumable: one-use, kept beside dashboard (no hand limit given), usable
  in stated window ("Hunter Turn" = any moment in own turn; "On Attack" =
  when choosing attack); discard after use; empty deck → reshuffle discard.
- Rewards: Hunter Tools + Caryll Runes, max 2 of each per hunter; 3rd → give
  away or set aside. Exhaust on use (flip facedown); refresh at Dream.
  Kept all campaign.
- Firearm: exactly 1 carried; each states its own refresh (all refresh at
  Dream too). Starting firearm can't be exchanged/used by others.

### Fog Gates (p. 24)

Mission-placed on every exit of a tile; lamp there gets Broken Lamp token.
All enemies except the mission's removed from that tile. Hunters may enter,
never leave except via Dream; broken lamp unusable (no Dream return there);
enemies can't cross, stop adjacent, ignore hunters beyond gates; only the
mission's listed enemies spawn there. Removed when the creating mission
step completes; then normal spawning resumes next reset.

### Intelligent & Cruel (p. 24)

Any ambiguous effect resolution → pick the WORST outcome for the players.
(Engine: implement deterministic worst-case choice, or queue a decision
labeled with this rule where "worst" is unclear.)

### FAQ rulings (all implemented)

Effects trigger on slot placement; enemy "At X Speed, before Hunter's
Attack" abilities; dodge keyword dual-use; mandatory completable effects;
setup extra tiles; populated setup tiles; named tiles count as random;
mid-attack movement; no heal after death; unlimited track advances;
phase-transition mid-attack; extra enemy activation order; insight-token
"instead of being slain" enemies (not slain, attack not cancelled).

### Errata (FAQ p. 4) — bake into golden data

Core: Growing Madness Ch3 setup +Graveyard tile, random max 5; Long Hunt
card 20 + Secrets card 18: Cleric Beast spawns on enemy-3 space (not 1).
Chalice setup +Arena Gate tile. Cainhurst: Forsaken Legacy 15 rune =
Corruption; Martyr's Ch2 + card 11 "Statuary Hall". Forbidden Woods: Dark
Rites Ch3 +Decrepit Shack, random max 5; card 46 "Decrepit Shack"; Den of
Vipers 5 rune = Moon; 10 = Hunter's Blunderbuss; 34 add clinic teleport.
Mergo's Loft: Birth of Madness 33 teleport wording. Byrgenwerth: Eldritch
Truth 20 Garden of Eyes can't leave; 25 refers Garden of Eyes + Oedon's
Chapel.

## 4. Expansion rules

### Hunter's Dream (scan p. 2)

- Bonus Chapter "The Hunt's End": played after a completed campaign with
  the campaign hunters (keep upgrades/rewards); plays as a normal chapter.
- **Mini-Bosses**: build Mini-Boss Spawn deck = N chosen mini-boss cards
  (recommend 2) + NONE cards up to tile-deck size. On each new tile reveal
  (after populate + move), flip 1: mini-boss spawns in the hunter's space.
  Activate as normal enemies; NOT removed on reset (heal full); slain → 1
  echo + printed Reward/Firearm, permanently defeated (no respawn); fog
  gates remove them like other enemies.

### Chalice Dungeon (scan pp. 2–3)

- Setup: normal hunter setup; Chalice Dungeon Setup card in chapter slot;
  Chalice Trap deck shuffled; start on Chalice Entrance tile; tile deck =
  chalice tiles only: Arena Gate + 2 Arena Gate Lever + H+4 random (Arena
  tile NEVER shuffled; auto-connects to Arena Gate when revealed). 3 random
  enemies from any set; boss random from any set, revealed when a player
  first enters the Arena.
- Mission (from setup card): interact with both Arena Gate Levers to unlock
  the Arena; slay the Chalice Boss.
- **Chalice Rites**: 0–3 (players may exceed; warned) random rite cards
  modify the dungeon; completing one discards it and each hunter's next
  Dream visit grants 3 free Upgrade cards.
- **Chalice Traps**: each time a hunter reveals AND moves onto a new tile,
  flip 1 trap card, apply immediately (e.g. Ambush: spawn + activate 1
  enemy-2 in hunter's space).

## 5. Engine design (shared/src/bloodborne/)

- Seat = hunter. 1–4 players, CPU fill allowed. Game id `bloodborne`.
- State: campaign id, chapter (1–3), huntTrack pos, per-chapter mission
  state machine (revealed mission cards, per-card token/rule state,
  collected insight, special rules), tile map (placed tiles: id, rotation,
  connections; per-space contents), tile deck order, enemy roster (type ↔
  slot 1/2/3, chosen card sides), enemies on map (type, space, damage),
  bosses (phase, damage, action decks), enemy action deck/discard, hunters
  (hp, echoes, hand, deck, discard, weapon side, slots[], firearm+exhaust,
  rewards+exhaust, consumables, poison/frenzy, inDream, mustSkipTurn,
  pendingDreamPlacement), upgrade row + deck, consumable deck/discard,
  reward deck, round order tracking, pending decision queue, seeded RNG,
  campaign persistence blob between chapters.
- Actions: choose campaign/chapter/hunter (lobby), turn actions (move path,
  interact, transform, dream, attack {slot, card}, use consumable, use
  firearm/reward, end turn), combat sub-actions via pending queue (dodge?
  {card, slot} / decline, choice prompts from card effects), dream upgrade
  picks + incorporation swaps, weapon-side + lamp placement on return,
  new-round discard-any + draw handled per player, mission interactions.
- The pending-decision queue drives ALL branching (dodge windows, upgrade
  picks, intelligent-and-cruel choices surfaced to players when genuinely
  ambiguous, mission card choices, reward give-away at 3rd tool/rune).
- Mission cards = data-driven DSL per campaign in golden: triggers
  (`endMoveOn:tile`, `interactOn:space`, `insightCount>=n`, `bossSlain`,
  ...), effects (spawn, fogGates, tokens, reward, advance/complete,
  specialRule ids), goal text. Hand-authored per card from transcription,
  with campaign-specific special rules coded as flags the engine interprets.
- Tests: bot playthrough completing The Long Hunt Ch1 at 1–4 players;
  conservation (12-card hunter decks, 36 consumables, enemy action 6, HP
  bounds, echo ≤3); directed tests per rule above (pursuit, dodge speed,
  stagger, enemy action reshuffle-only-when-empty, dream flow, reset,
  final-round loss, fog gates, interact-aggro, boss phase flip mid-attack).

## 6. Renderer plan

- **Map situation = §3-style B/none**: tiles are square card art placed at
  runtime — the map is BUILT dynamically, no photographed-board fit. TV
  renders 3D: tile cards as flat plates seated on black, enemy/hunter minis
  from the mod's assetbundle meshes, tokens from mod token art, hunt board
  + track + enemy slots as a HUD panel from the real hunt-board art. Orbit
  camera, capped tilt.
- Per-tile space graph transcribed into golden (spaces as polygons w/
  centers, grey-line adjacency, exits per edge, icons per space). Verify by
  line/dot overlay per tile (trek pattern).
- **Device**: hunter dashboard tableau from real art (dashboard + trick
  weapon dashboard w/ 2 sides + firearm card + stat hand + consumables +
  rewards + HP/echo/poison/frenzy state), action bar (greyed w/ reasons),
  combat prompts (enemy action card art, dodge picker), dream flow
  (upgrade row), mission log. Tap map = main-board switch (Politik pattern).
  No scroll at 1024×768.

## 7. Assets

- All 354 mod assets cached (1 transient failure re-fetched: Chikage bundle).
- Minis: `.unity3d` bundles → extract meshes/textures via UnityPy
  (inspect-bundles.py / extract-darktower.py pattern). 547 bundle instances,
  ~80 unique (16 hunters, 16 weapons, ~40 enemies/bosses, decks').
- Card sheets staged + per-cell crops for the client (tiles, cards).
- Rulebooks staged (done). Game tile logo composed from mod art.

## 8. Transcription passes (contact sheets, cross-checked)

1. Trick weapon dashboards ×16 (both sides: ability text, slots, attack
   name/speed/damage) — core 4 first.
2. Firearms (11 core + exp), Basic Stat cards (8 unique faces), Upgrade
   deck (60), Consumables (36 → unique faces + counts), Rewards (25).
3. Enemy cards (14 core + exp; both sides: HP, basic/special/ability).
4. Boss HP cards + 50 boss action cards (core), + expansion bosses later.
5. Campaign decks: core 4 × ~64 cards (intro, 3 chapters both sides,
   missions/insights both sides) → mission DSL. THE big pass.
6. Map tiles ×20 core (+expansions): space graphs, exits, icons, named
   locations, lamps.
7. Hunt board: track length, reset icons, slots. Player aid (4 faces).

Cross-checks: rulebook worked examples (Threaded Cane p. 19/22: slots
Quick Cut / Slash / Deadly Thrust, Scourge Beast 4 HP Quick Swipe fast 2dmg
basic), component counts (p. 4–6), Lua campaign tables (mission numbers per
chapter), errata list, enemy action deck 3/2/1.

## 9. Ship-gate results (Jul 10 2026)

**Rulebook UI-coverage audit** — every printed decision has a home:
hunter pick (device picker, both weapon sides previewable, free start-side
choice per p. 8), turn order (BEGIN TURN per seat, any order), move/stop-early
(map taps + END MOVE), tile reveal + orientation choice (rotation previews),
interact, transform, dream, attack (card + slot + target via map tap),
combat attack-back / dodge (slot speed legality enforced + shown) / pass,
firearm fire + refresh (discard picker; Evelyn echo option; Cannon/Flamesprayer
as combat attacks; Blunderbuss target; rifle/torch sentries automatic),
all 24 core rewards (on-kill windows are explicit prompts; gem slot picker;
Old Hunter Bone auto-dodge button in the dodge window; Eye rune swap picker),
consumable timing windows + target pickers, dream upgrade forced spending +
optional incorporation swaps, return placement (side + lamp), round refresh
discard-any, mission choices/branches as prompts, mission bait/offer buttons
(engine-hook gated), End Turn explicit, Show deck + missions log w/ real card
backs, rulebook linked. Reverse audit (engine actions the UI can't reach):
none — every action type + choose variant has a device affordance.
Known simplifications (documented, non-blocking): `clearSlots` auto-picks the
first filled slot (printed "any 1 slot" is a player choice); Beast-rune on-kill
target is deterministic (closest-to-death within 1); leaping attacks target
via first-enemy default at range.

**UI-driven full game**: 4-seat puppeteer game entirely through the device DOM
reached YOU DIED in 83s / 397 clicks with zero stalls (tools/verify/
bloodborne-ui-smoke.mjs). **WS smokes**: full games completed on all four core
campaigns through the real server w/ CPU co-op seats. **Engine tests**:
bloodborne-test.ts green (1/2/4p playthroughs, conservation invariants,
directed rules). Client tsc + build green.

**DSL coverage**: The Long Hunt fully encoded; Growing Madness / Secrets of
the Church / Fall of Old Yharnam encoded with `_unsupported` lists in
games/bloodborne/golden/dsl/*.json — inexpressible printed effects surface as
special-rule chips on the device (visible, honor-system) rather than being
dropped; interpreter extensions continue.

## 10. Open items

- PVP mode (Chalice components include PVP screens): out of scope unless
  owner asks.
- Expansion campaigns marked "not yet fully scripted" in the mod still have
  full physical card sets in bags — port as data when reached.
