# Axis & Allies Anniversary Edition (1941 + 1942) — port spec

Source mod: TTS **1961347286** "Axis and Allies Anniversary Edition(1941 and
1942)". The mod is a **dumb table** (320 chars of Lua, zero snap points, zero
zones): it contributes the board art (two Custom_Boards, GUIDs `be20f5` +
`128d09`), 453 unit meshes, 77 per-nation infinite unit bags, 141 cards
(national reference cards, charts), and 4 assetbundles. ALL rules and map
geometry come from elsewhere:

- **Rules golden**: the official Anniversary rulebook PDF (16pp) staged from
  the owner's assistant repo (`scratchpad/aaa/public/rulebook.pdf` → stage to
  `client/public/axis/rulebook.pdf`).
- **Config/battle golden**: the owner's own tool —
  github.com/nurtrino/Axis-and-Allies-Assistant branch `claude/simulated-battle`
  (cloned at scratchpad/aaa). Lift and adapt:
  - `src/lib/anniversary.config.ts` — powers + turn order (USSR, Germany, UK,
    Italy, Japan, USA; China = USA-controlled minor), unit profiles
    (cost/att/def/move/hits/domain — inf 3/1/2/1, art 4/2/2/1, tank 5/3/3/2,
    AA 6/0/1/1, IC 15, ftr 10/3/4/4, bmr 12/4/1/6, BB 20/4/4/2/2hits,
    CV 14/1/2/2, CA 12/3/3/2, DD 8/2/2/2, SS 6/2/1/2, TP 7/0/0/2),
    victory goals (13 Short / 15 Standard / 18 Total Victory of 18 VCs),
    scenarios Y1941/Y1942.
  - `src/lib/battle.ts` (601) + `combat.ts` (284) + `battle-odds.ts` — the
    dice + combat resolution engine (the battle golden to diff ours against).
  - `src/lib/research.ts` — RND (weapons development) implementation.
  - `src/components/TurnPortal.tsx` (716) — the owner's turn-phase portal;
    THE core UX to expand into the full game flow.
  - `src/components/CampaignBattle.tsx` + `BattleStage.tsx` + `components/sim/`
    — the 3D battle simulator (R3F) with dice view; reuse for our battle
    screen.
  - `ProductionBoard/ProductionChart` — the between-turns production screen.
- **Map golden**: being built by a subagent from the printed board art →
  `games/axis-allies/golden/map.json` (territories with name/IPC/owner/VC/
  capital/impassable/center px/adjacency; numbered sea zones; canals) +
  `tools/tts-extract/fit-axis-map.mjs` overlay diagnostics. The two board
  halves stitch into one art coordinate space (playbook §3B — pixel space is
  the world space).

## Owner decisions (locked)

1. **Single-player dev control for now**: one human may control ALL nations
   (dev seat pattern); no bots. Seating flow: pick Axis or Allies, then
   nation(s); one player may take everything.
2. **Defender plays for real**: the defender watches the battle live and makes
   every choice the physical game gives them (casualty picks, sub submerge,
   AA fire, retreat is the attacker's) via the pending-decision queue.
3. **National Objectives: in** (create toggle, default on).
4. **Win conditions**: rulebook's three — Short (13 VCs), Standard/Normal
   (15), Total Domination (18). Create-screen choice.
5. **Moves on the phone's interactive board** (Kanban board-first pattern:
   pick targets + chip strip); the TV plays the cinematic zoom for every
   action (Brass FocusFly pattern).

## Create-game options

- Scenario: **1941** or **1942** (different setups, same map).
- **RND** (research & development) on/off.
- **National Objectives** on/off (default on).
- Win condition: Short 13 / Standard 15 / Total Domination 18.

## Turn flow (the expanded turn portal — per owner)

Per nation, in fixed order (USSR, Germany, UK, Italy, Japan, USA):
1. **RND** (if enabled): buy dice at 5 IPC, roll for breakthroughs
   (research.ts logic; Anniversary chart from rulebook).
2. **Purchase units**: everything bought goes to the STAGING AREA — the real
   3D pieces appear in the mobilization zone.
3. **Combat movement — resolved immediately per move** (owner directive: not
   all at once). Each combat move: open the board on the phone, select units
   + destination zone → the battle simulator opens with those units
   preselected → battle view + dice rolls (3D sim) → defender makes their
   choices live → resolution. Then the next combat move.
4. **Non-combat movement**.
5. **Mobilize** new units (staging area → factories, placement limits per
   rulebook).
6. **Collect income** (+ National Objectives if on, convoy/capital rules).
After every nation's turn: the **production screen on the TV** — current
income per power + the income change from that turn (ProductionBoard/Chart
lift).

## TV

- Fullscreen map (stitched board art), all pieces as the mod's real unit
  meshes, per-nation colors from the bags.
- Camera flies to and zooms on every action (combat move, battle, mobilize)
  — Brass FocusFly + Dark Tower "voice it through the board" patterns.
- Battle view: when a battle starts, TV shows the battle (3D battle sim
  stage or zoomed board region + dice), then the result.
- Production screen between turns: income tables + change bars.

## Phone

- A clean lineup of current assets (unit counts by type, on-map totals),
  IPCs, and the nation's REFERENCE CARD from the mod (the play side, NOT the
  setup side — the mod's 141 cards include per-nation reference cards; face
  choice matters).
- Board-first interactive map for moves: tap origin/units, tap destination;
  pick frames per the Kanban pattern; chip strip for unit counts.
- Multi-nation players: the device shows the active nation during their turn
  (dev single-player controls all seats with the existing seat pattern).
- Fixed-frame personal readout per the updated playbook (no orbit on the
  personal view); no scrolling (iPad landscape 768 is the constraint).

## Engine sketch (shared/src/axis/)

- State: per-power (IPCs, units by zone {type,count,damaged for BBs},
  researched techs, objectives), map ownership per territory, turn/phase
  (rnd/purchase/combat/noncombat/mobilize/income), staging purchases,
  current battle {attacker units, defender units, zone, round, casualties
  pending}, pending-decision queue (casualties, submerge, AA, retreat,
  mobilize placement, VC win checks), seeded RNG stream for all dice.
- Zones/adjacency/movement legality from map.json (subagent). Transports
  (load/offload, amphibious), carriers (fighter landing), subs (surprise
  strike vs destroyer presence), AA (one shot per attacking air unit),
  strategic bombing (IC damage per Anniversary), China rules (US-controlled,
  no purchase — one infantry per 2 territories per rulebook), capitals
  (IPC looting), convoy boxes if printed on this map, canals/straits.
- Battle resolution mirrors the assistant's battle.ts (diff our engine's
  outcomes against theirs as a golden test).

## Verification plan

- Engine tests: bot playthroughs (random-legal with a "press toward enemy
  capitals" bias), unit conservation per zone transitions, directed rules
  tests (AA one-shot, BB two hits, sub surprise strike, transport limits,
  China restrictions, NO awards, VC counting), battle-outcome diffs vs the
  assistant's engine for scripted matchups.
- Ship gates per playbook §6.4b when the client lands.

## Status

- [x] Mod scouted (dumb table; assets inventoried).
- [x] Owner scoping answered (above).
- [x] Rulebook secured (16pp official PDF from the assistant repo).
- [x] Assistant repo cloned; lift list identified.
- [ ] Map zone golden (subagent in flight).
- [ ] Rulebook full read + rules digest into this spec (setup counts for
      1941/1942 from the reference-card SETUP side + rulebook charts; NO
      list; RND chart; China rules; canal rules).
- [ ] extract-axis.mjs (stage board halves, unit meshes per nation bag,
      reference cards incl. face/back, flags).
- [ ] Engine + tests; server registry; TV; phone; production screen;
      ship gates.
