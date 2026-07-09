# Dune: Imperium — Port Spec (base + Rise of Ix + Immortality as options)

Source: TTS workshop **2354919205** "Dune Imperium + Rise of IX + Immortality
(scripted)". Golden dumps at `games/dune-imperium/golden/` (`global.lua` 110k,
`objects.lua` 657k across 188 object scripts, `manifest.json` decks/bags).
Owner scope: import everything; **expansions are create-save options, base-only
default**. 2–4 players (CPU seats cover solo); skip the mod's House Hagal solo
bot, epic mode, and "go to 11" variant.

## 1. What the mod is (enforcement model)

The mod is **honor-system on card effects and space rewards** — players drag
agents/cubes/resources; scripts automate: setup (per riseIX/immortality/epic
flags on the First Player Marker `784534`), influence-track VP + alliance
tokens (`onObjectDrop` in global; alliance tokens `4c2bcc`/`33452e`/`ad1aae`/
`13e990` self-check majorities), card acquisition (`cardAquire`), resource
counter "bowls" with +/− buttons, per-player boards (draw/discard/reveal
buttons), and the House Hagal bot (`f1a7d1`, 52k — skip). Card scripts are only
trash-confirm buttons.

**Our engine goes full Brass-style enforcement** (like every port): phases,
agent placement legality, costs/rewards, influence, combat, acquisition, VP —
with card/space/leader data transcribed per playbook §2.4. The mod's own space
table (below) + the bundled rulebook PDF (`9ac7d6` Rules, `9f549f` Errata) are
the golden references.

## 2. Content inventory (from manifest.json, split by option)

**Base** (all near the table centre):
- 4 starter decks × 10 (unnamed in save — identify by CardID/sheet cell; the
  known base starter: 2× Convincing Argument, 2× Dagger, 1× Dune the Desert
  Planet, 1× Diplomacy, 1× Reconnaissance, 1× Seek Allies, 1× Signet Ring —
  verify vs sheet).
- Imperium deck `cfedf4` = **68 cards, 44 uniques** (names in manifest — e.g.
  Bene Gesserit Sister ×3, Power Play ×3, Sardaukar Legion ×2, uniques ×1).
- Intrigue deck `f10b4e` = **40 cards, 34 uniques** (names in manifest).
- Conflicts: CI `84d4cb` ×4, CII `6e3846` ×10, CIII `1afb58` ×4 (unnamed —
  identify from sheet art).
- Reserve piles: Foldspace `972f9e` ×6, Arrakis Liaison `7e541b` ×8, The Spice
  Must Flow `c86928` ×10.
- Leaders: 14 total in `leaderGUID` (base 8 + Ix 6) — leader cards have
  scripts with their names ("Paul Atreides", "Baron Harkonnen", …); tag each
  base/ix.
- Board-space sign cards sit as loose cards on the board at the
  `hagalLocations` coordinates.

**Rise of Ix** (staged off-table, x>35): bag `6b4579` (47 objs), Tech Tiles bag
`dee0f6` (18), Ix intrigue `8222e0` ×17, extra CI ×2 + CIII cards, imperium
additions deck `6419f4` ×36, CHOAM freighter tokens/track, dreadnoughts,
snooper tokens.

**Immortality**: bag `aec572` (23), imperium additions `d2fd10` ×30, intrigue
`6d939e` ×15, Tleilaxu deck `4d7670` ×19, Experimentation `c29438` ×8, research
tokens/track zones (`researchDeckZone f8befb`, researchRow, TleilaxuTokens).

## 3. Setup (setupGame in global.lua, base path riseIX=0 immortality=0)

- Shuffle everything. Conflict stack (bottom→top as drawn): take 3 from CIII +
  the 4th CIII, then 5 from CII, then 1 from CI → **10 rounds**; rest trashed.
  (riseIX: all-CIII variations; epic: different mix — skipped.)
- Imperium row: 5 face-up from imperium deck (zones `imperiumRow`).
- Reserve piles face-up. Intrigue deck face-down.
- Per player: shuffle starter deck, **draw 5**; 4 influence cubes to the four
  faction-track zeros; **3 troops to garrison** (epic 5); score marker on the
  track (`scoreTokenSetup`: <4 players → spot[1], 4 players → spot[2] — check
  rulebook for the VP value each spot represents); combat marker to 0; sword-
  master + high-council seats empty; leader chosen pre-setup (mod requires a
  leader in each seat's zone before setup runs).
- First player random (`RandomFP`).

## 4. Board spaces (agent placement)

The Hagal script's tables give the mod's authoritative space list + zone GUIDs
+ positions (`hagalLocations` in `objects.lua` ~line 300): Stillsuits, Hardy
Warriors, Secrets, Selective Breeding, Foldspace, Heighliner, Wealth, Conspire,
Rally Troops, Hall of Oratory, Carthag, Harvest Spice (3 maker zones: Great
Flat / Hagga Basin / Imperial Basin), Arrakeen, Research Station, Sietch Tabr
(check), + Ix-only: Dreadnought, Tech Negotiation, Interstellar Shipping, and
"X or Interstellar" swaps. Faction/combat/troop flags per space are in the
Hagal space table (`Emperor/Guild/Bene/Fremen`, `Combat`, `Troops`).

Full costs/requirements/rewards per space (water/spice/solari costs, card
draw, persuasion, etc.) must be completed from the **rulebook PDF** (staged
from `9ac7d6`) + board art; encode as
`{ id, name, agentIcon: faction|landsraad|city|spice, cost, rewards, combat:
bool, influence?: faction, ixOnly?, immortalityOnly? }`.
Occupancy: one agent per space (High Council/Hall of Oratory per rules).

## 5. Round structure (engine phases)

1. **Agent turns** (clockwise from first player): play a card with the
   matching agent icon → place agent on an unoccupied space → pay cost →
   rewards (resources / influence+VP / troops to garrison / draw / mentat…);
   deploy troops to conflict if the space shows combat (from garrison +
   rewards, per rules limits). Or **reveal turn** when out of agents (or by
   choice): reveal hand, sum persuasion + swords, buy imperium-row/reserve
   cards (persuasion), then optionally deploy… (rulebook exact).
2. **Combat**: after all reveal, resolve conflict — strength = troops×2 +
   swords + intrigue plays (combat intrigue in turn order); rewards 1st/2nd/3rd
   per conflict card; ties per rules.
3. **Makers**: spice accumulates on desert spaces with no agents.
4. **Recall**: agents return, mentat returns, pass first player, new conflict.
   Hand cleanup: discard played+unplayed, draw 5.
- **End**: 10 VP after combat, or after round 10 (conflict deck empty); tie-
  breaks per rulebook.

## 6. Card data to transcribe (playbook §2.4 contact sheets)

Per imperium/starter/reserve card: `{ name, count, cell, faction icons (agent
box access), agent effect, reveal: {persuasion, swords, effects}, acquire
cost, trash effects, expansion tag }`. Per intrigue: `{ name, type: plot/
combat/endgame, effect }`. Per conflict: `{ level, name, rewards[3] }`. Per
leader: `{ name, signet, passive, expansion }`. Names come free from the
manifest; **effects/icons from card art contact sheets**, cross-checked
against the rulebook + errata PDFs. Base first (44 imperium + 8 starter + 3
reserve + 34 intrigue + 12 conflicts + 8 leaders); Ix/Immortality cards next.

Complex/edge effects may be encoded as `choice` prompts (player picks from
options) — never a silent no-op.

## 7. Engine sketch

`shared/src/dune/`: options `{ riseOfIx, immortality }` at create (default
false/false — the lobby's create flow needs an options UI, a first).
State: players (leader, resources {spice,solari,water}, troops garrison/
supply, agents, hand/deck/discard/played, intrigue hand, influence ×4,
alliances, VP, high-council/swordmaster flags), imperium row, reserve piles,
conflict stack + current, phase, combat {deployed, strength, passed}, makers
spice, round. Views: hands + intrigue redacted; everything else public.
Seats: Red/Blue/Orange/Green (mod colours).

## 8. Client sketch

TV: the mod's board art (find the board image object — likely a Custom_Board/
tile at centre; fit per playbook §3B if node coords are art-pixel, else place
zone markers from the Lua zone positions), agent tokens, influence tracks,
combat area, imperium row + conflict card big and readable, captions.
Phone: hand fan (portrait), play-card → pick glowing legal space, reveal
summary (persuasion/swords), buy row, intrigue hand, resource dial, End Turn.
Leader card on device. GameIntro + rulebook.pdf.

## 9. Status (shipped July 2026)

Base game shipped end to end. Goldens: spaces.json (Board Space Guide from
the rulebook PDF pages 17-18 + art-verified 4-influence bonuses and Sell
Melange rates — Emperor's 4-bonus is 2 TROOPS, the rulebook text alone
doesn't say), conflicts.json (18 cards read cell-by-cell; no nicknames in
the mod), leaders.json (14 scans; the 6 Rise of Ix leaders transcribed and
waiting), cards.json (44 imperium uniques + 34 intrigue + starters +
reserve, copies from the mod deck contents).

Engine shared/src/dune/: full enforcement (agent icons, occupancy, The
Voice, costs, Sietch Tabr gate, once-per-game seats, reveal/persuasion,
influence VP-at-2 / bonus+alliance-at-4 with steal-on-exceed, all intrigue,
combat with printed tie rules + post-win window, makers, control flags,
leader passives/signets, endgame tiebreaks). Multi-step card effects run
through a pending-decision queue — every choice is an explicit action.
dune-test.ts: 12 bot playthroughs + invariants + directed tests.

Client: TV board = mod art + the mod's base-game overlay tiles at the Lua
setup coordinates + agent pawn mesh + troop cubes, all through an affine
art->world fit on three labelled tile anchors (Conspire / Stillsuits /
Sell Melange). The mod's board is the Ix layout; sendAgentSetup(riseIX==0)
in global.lua is the authority for base overlay placement. Combat X and
the four garrison circles measured from the art. Phone: leader pick, hand
-> space picker, reveal/acquire, intrigue drawer, choice prompts, End Turn.
tools/verify/dune-smoke.mjs = live WS full-game driver.

## 10. Open items

- [ ] Rise of Ix option: content is staged (sheets, leaders, Ix deck GUIDs
      in scene.json) — needs engine systems (dreadnoughts, tech tiles,
      freighter track), the Ix board layout (no overlays), leader signet
      icon confirmation, and a create-options protocol field.
- [ ] Immortality option: Tleilaxu track + research + specimens.
- [ ] Lobby create-options UI lands together with the first expansion.
- [ ] Reveal-time retreat riders (Scout / Chani) are not offered — combat
      troops can only be pulled back via Master Tactician's choice.
