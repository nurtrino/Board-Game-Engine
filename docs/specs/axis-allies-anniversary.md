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

Per nation, in the SCENARIO's turn order (rulebook p6 — this overrides the
assistant config's single order):
- **1941**: Germany, Soviet Union, Japan, United Kingdom, Italy, United States.
- **1942**: Japan, Soviet Union, Germany, United Kingdom, Italy, United States.

Phases per turn:
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
- [x] Rulebook read in full (digests below). NO bonus amounts recovered by
      rendering p23 as an image (the PDF font drops digits in text extraction).
- [x] Setup golden source found: the mod's 1941/1942 "Packup" memory bags
      hold every setup piece WITH its saved board transform — zone-assign
      against map.json for exact per-territory starting units. The mod has
      NO setup-chart or reference cards (its 141 cards are just IPC money);
      the phone's "personal card" will be built from our own layout +
      rulebook data instead.
- [ ] Setup counts per power per scenario: from the mod's National Setup
      Charts cards (SETUP side); National Objectives printed on the BACK of
      those same charts — both goldens come from the mod's 141 cards.

## Rulebook digest (pp1-6)

- 2-6 players; sides split Axis (Germany, Japan, Italy) vs Allies (USA, UK,
  USSR); fewer players = multiple powers each.
- Win: side collectively holds 15 VCs at the END of a complete round
  (standard); 13 = short; 18 = total victory. 18 VCs exist.
- Starting VCs+IPCs — 1941: Germany Berlin/Paris/Warsaw 31, Japan
  Tokyo/Shanghai 17, Italy Rome 10, USA Washington/San Francisco/Honolulu/
  Manila 40, UK London/Calcutta/Sydney/Hong Kong/Ottawa 43, USSR
  Moscow/Stalingrad/Leningrad 30 (Axis 6 VC, Allies 12). 1942: Germany 31,
  Japan Tokyo/Shanghai/Hong Kong/Manila 31, Italy 10, USA
  Washington/SF/Honolulu 38, UK London/Calcutta/Sydney/Ottawa 31, USSR 24
  (Axis 8 VC); 1942 setup overlays German/Japanese control markers on the
  1941-printed map.
- Board wraps horizontally: SZ 20-55, SZ 21-44, SZ 25-43 connect across the
  edge. Top/bottom do not wrap.
- Islands: one island group per sea zone = one territory.
- Canals: Panama (control Panama) and Suez (control BOTH Egypt and
  Trans-Jordan; split control = closed). Side control at the START of the
  turn required; not usable the turn captured. Canals never block land moves.
- Colors: USA green, Germany gray, UK tan, Japan orange, USSR maroon, Italy
  brown, China light green; AA guns + ICs are light gray and change hands.
- Chips: gray = +1 of that unit, red = +5.
- China (US-controlled, separate power, resources never mixed): no income,
  no purchases; gets 1 new infantry per 2 non-Axis-controlled Chinese
  territories during the US purchase phase; placed with US mobilization on
  Chinese territories with < 3 units. Chinese units confined to Chinese
  territories (printed border) + may take Kiangsu and Manchuria; may occupy
  (never control) Kwangtung — its IPCs go to the UK. Cannot load onto
  transports. The Flying Tigers US fighter fights as Chinese; if lost, never
  replaced. US must fully resolve China's combat move + combat before (or
  after) the US's own — never interleaved.
## Rulebook digest (pp7-16)

**Turn order is per scenario** (p6): 1941 = Germany, USSR, Japan, UK, Italy,
USA; 1942 = Japan, USSR, Germany, UK, Italy, USA. Income/units of multiple
powers held by one player stay separate. Collect Income is the only mandatory
phase.

**Phase 1 — RND (optional rule)**: researcher tokens cost 5 IPC each, any
number. Roll 1d6 per token; any 6 = breakthrough (discard ALL tokens);
no 6 = keep tokens for future turns (they persist!). On success pick chart 1
or 2, roll 1d6 for which advance; reroll duplicates; one advance max per
turn. Chart 1: 1 Advanced Artillery (1 art supports 2 inf), 2 Rockets (each
AA gun may rocket-attack an enemy IC within 3 spaces for 1d6 damage during
SBR step), 3 Paratroopers (bomber carries 1 inf, must stop at first hostile
territory, no SBR that turn), 4 Increased Factory Production (+2 units over
IPC value, repairs half price), 5 War Bonds (+1d6 IPC at Collect Income),
6 Mechanized Infantry (inf paired with tank moves 2). Chart 2: 1 Super Subs
(sub att 3), 2 Jet Fighters (ftr att 4), 3 Improved Shipyards (BB 17 CV 11
CA 10 DD 7 TP 6 SS 5), 4 Radar (AA hits on 1-2), 5 Long-Range Aircraft
(ftr 6, bmr 8), 6 Heavy Bombers (2 dice per bomber attack/SBR, defense
still 1 die).

**Phase 2 — Purchase**: each IC produces up to the territory IPC value in
units/turn (mobilize-time limit). Repairs: 1 IPC per damage marker, paid at
purchase. Unplaced purchased units carry over to future Mobilize phases.

**Phase 3 — Combat Move**: land units stop on enemy units incl. AA/IC. Air
moves through hostile freely. Sea units stop in hostile SZs (zones with only
enemy subs/transports don't count as hostile for stopping; attacking them is
optional; ending combat move on lone enemy transports DESTROYS them and
counts as combat). Subs pass through hostile SZs unless an enemy destroyer
is there (movement ends immediately). Carrier fighters launch before the
carrier moves, move independently; guest (allied) fighters are cargo.
Amphibious moves are declared here (loading/moving a transport for assault =
combat move even if SZ is empty). Tanks blitz: 2 territories, first hostile-
but-empty gets your control marker; must stop on any enemy unit incl. AA/IC.
No suicide runs: must declare a possible landing path for all attacking air.
No moves into/through neutrals ever.

**Phase 4 — Conduct Combat** (attacker picks the order of spaces; each space
fully resolved before the next; no reinforcements once begun):
1. *Strategic bombing raids*: AA fires per bomber first; survivors roll 1d6
   each (2d6 heavy) = damage markers under the IC; cap = 2× territory IPC;
   SBR bombers do nothing else this turn.
2. *Amphibious assaults*: (a) sea combat if defending warships (must involve
   all attacking sea units; only subs/transports defending = attacker may
   ignore); (b) if NO sea combat happened, each BB/CA in the offload SZ may
   bombard once — max one ship per offloaded land unit, BB hits ≤4, CA ≤3,
   casualties go to the casualty zone and still fire back in land combat;
   (c) land combat. Seaborne units cannot retreat; overland units + air
   retreat together per normal rules.
3. *General combat sequence*: place on battle board → attacker fires →
   defender fires → remove defender's casualties → press or retreat →
   conclude. Hit = roll ≤ value. Defender's casualties fire back (casualty
   zone). Subs (both sides): surprise strike before all else unless an enemy
   destroyer is on the board; may submerge instead of rolling any time
   they'd roll (also when only enemy aircraft remain); sub hits can only
   kill sea units. AA: fires once, first round only, one AA per territory,
   1d6 per attacking air unit, 1 = dead (assign per-aircraft if mixed).
   Retreat: attacker only, between rounds, ALL units to ONE adjacent
   friendly space at least one attacker came from; air retreats in place and
   lands in Noncombat. Defenseless transports: auto-destroyed when attacker
   still has units capable of hitting them.
4. *Conclude*: attacker needs a surviving LAND unit to capture (air/sea
   cannot). Capture: control marker, production +value for you / −value for
   loser; captured AA/IC change hands (IC unusable until next turn, AA can't
   move that turn). Liberation: originally-friendly territory reverts to
   original controller (unless their capital is enemy-held → you keep it
   until liberation). Capitals: capturer LOOTS all unspent IPCs of the
   ORIGINAL owner; owner collects no income, no purchases, no research —
   only Combat Move / Conduct Combat / Noncombat phases — until liberated;
   liberation reverts ICs/AAs and friendly-held territories.
   VC capture = take the token; win checked at END of a full round (after
   the US turn).

**Multinational forces**: allies defend together (mutual casualty picks,
attacker breaks ties; each defender rolls own units); allies NEVER attack
together — ally units in an attacked SZ sit out and cannot be casualties.
Allied transports can carry your units (3-step: load your turn, move their
turn, offload your next turn). Fighters may land on allied carriers but are
cargo on the ally's turn.

**Phase 5 — Noncombat Move**: any unit that didn't move/fight (AA guns move
ONLY here, 1 space). Only air and subs may pass hostile spaces. Air must end
where it can land (territory friendly since start of turn, or carrier —
fighter may land in an IC-adjacent SZ where a NEW carrier will be placed
this turn); no landing in just-captured territories; unlandable aircraft
die. Carriers must move to pick up stranded fighters if possible; carrier
stops once a fighter lands.

**Phase 6 — Mobilize**: place staged units at ICs controlled since start of
turn (not ones captured this turn). Per-IC limit = territory IPC value minus
damage markers. Land units + bombers at the IC territory; sea units in an
adjacent SZ (even hostile — no combat, combat is over); fighters at the IC
or on YOUR carrier adjacent (new or existing); new ICs in any income≥1
territory held since start of turn, one IC per territory. Unplaced units
stay in staging for later.

**Phase 7 — Collect Income**: national production value + bonus income.
Capital enemy-held = collect nothing. No lending between powers.
National Objectives (optional, per power; bonus values read from rendered
rulebook p23 — EVERY objective pays 5 IPC except USSR's first which pays 10):
- USA "Arsenal of Democracy": +5 all of W/C/E United States; +5 Philippines;
  +5 France; +5 if 3+ of Midway/Wake/Hawaiian Is./Solomons (Allied control).
- UK "British Empire": +5 all of E Canada/W Canada/Gibraltar/Egypt/
  Australia/Union of South Africa; +5 any originally-Japanese territory;
  +5 France and/or Balkans.
- USSR "Great Patriotic War": +10 if 3+ of Norway/Finland/Poland/
  Bulgaria-Romania/Czechoslovakia-Hungary/Balkans; +5 if no other Allied
  forces in any Soviet-controlled territory AND Soviets control Archangel.
- Germany "Lebensraum": +5 all of France/NW Europe/Germany/
  Czechoslovakia-Hungary/Bulgaria-Romania/Poland; +5 if 3+ of Baltic
  States/East Poland/Ukraine/Eastern Ukraine/Belorussia; +5 Karelia S.S.R.
  and/or Caucasus.
- Japan "Co-Prosperity Sphere": +5 all of Manchuria/Kiangsu/French
  Indo-China-Thailand; +5 if 4+ of Kwangtung/East Indies/Borneo/
  Philippines/New Guinea/Solomons; +5 Hawaiian Is./Australia/India any.
- Italy "Mare Nostrum": +5 all of Italy/Balkans/Morocco-Algeria/Libya AND
  no enemy surface warships in SZ 13/14/15; +5 if 3+ of Egypt/Trans-Jordan/
  France/Gibraltar.
All conditions are side-control ("Allied/Axis powers control") except
USSR's second, which is Soviet-specific.

**Unit profiles** (confirms assistant config): inf 3 IPC 1/2/1 (att 2 when
paired 1:1 with artillery, attack only); art 4 2/2/1; tank 5 3/3/2 blitz;
AA 6 −/1/1 noncombat-move only, capturable, never destroyed in combat;
IC 15, no att/def/move, damage markers, capturable; ftr 10 3/4/4;
bmr 12 4/1/6; BB 20 4/4/2 two hits (damage persists through combat, repairs
free after combat ends — turn upright), bombard ≤4; CV 14 1/2/2 carries 2
fighters (fighters defend from air, cannot be sub casualties); CA 12 3/3/2
bombard ≤3; DD 8 2/2/2 anti-sub (cancels submerge/surprise strike/sub
movement, lets aircraft hit subs); SS 6 2/1/2 submersible + surprise strike,
can't hit air; TP 7 0/0/2 capacity = 1 land unit + 1 extra infantry, chosen
last, defenseless-transport rule, offload = whole move, one territory only.
Air range: first SZ off a coast counts 1; carrier launch doesn't count the
carrier's SZ; islands = SZ and island are separate spaces for range.
Surface warships = BB/CV/CA/DD (not TP; SS is a warship but not surface).

- [ ] extract-axis.mjs (stage board halves, unit meshes per nation bag,
      reference cards incl. face/back, flags).
- [ ] Engine + tests; server registry; TV; phone; production screen;
      ship gates.
