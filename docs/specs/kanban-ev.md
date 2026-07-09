# Kanban EV — port spec

Source: TTS mod **3589049550** "Kanban EV [ Scripted - All Expansions ]"
(cache complete: 40 meshes, 187 textures, 16 images, 2 PDFs, 1 assetbundle).
Rulebook: 24-page official PDF in the mod (staged to `/kanban/rulebook.pdf`);
solo rules PDF present but **solo modes (Mr Lacerda / Mr Turczi) are out of
scope**, per the standing pattern. The mod's global.lua (111k chars) is
setup automation + geometry: its tables (CARS, DEMANDS, DESIGNS, GOALS,
PACE, PARTS, PLAYERS, SPOTS, UPGRADES, AWARDS, BOOKS) are the golden for
element definitions and board positions. The mod does NOT enforce rules —
the rulebook is the rules golden; the Lua is the geometry/content golden.

Scope: **base game now**, 2-4 players; expansion/variant content staged and
recorded as create options for later (same pattern as Dune's Ix/Immortality).
Variants in the base rulebook (Nice Sandra, The Planner, Expert Tuning,
Delayed Tuning) are create-options candidates — none implemented at launch.

## 1. Overview

Players are new employees in an electric-car factory, working across five
departments over a series of days. Sandra, the factory manager, is an
automatic worker who moves through departments, evaluates the weakest
worker, and performs a departmental task. Score is Production Points (PP);
most PP at final scoring wins. Tiebreaks: most cars, most tested designs,
most banked shifts.

Departments: **Design · Logistics · Assembly · R&D · Administration**.
Car models: City, SUV, Truck, Sports, Concept (values 2/3/4/5/6 PP).
Car parts: Motor, Autopilot, Battery, Body, Electronics, Drivetrain.

## 2. Setup (rulebook pp4-7)

Board: Sandra tile (red stripe side), 3 random part types in Recycling,
factory goals (2 random per group: certification / claiming / upgrading,
each seeded with generic speech tokens — 2 each at 4p, 2/1 at 3p, 1/1 at
2p), test-track overlay at 2-3p, part value markers leftmost, pace car on a
striped space, meeting + production-cycle markers, designs (1 random tile
on each of the rightmost 8 spaces; rest in 3 stacks of 9: central + two
first-office), assembly (1 car per model on line + 1 on yellow plate),
2 random demand tiles (+ generic speech per tile), kanban order deck
(reveal top card, stock 6 depicted parts into warehouses, card to bottom),
4 performance goals face up in the meeting room, 1 random final goal,
week marker, Sandra at her desk, 3 award tiles per department (2 at 2-3p)
each stack topped with a generic speech token.

Players: player board, 5 basic garage bonus tiles (padlock tile rightmost),
1 speech token slotted + 4 aside, double-upgrade tile, 5 locks, 1 parts
voucher, 3 performance goal cards, 2 kanban order cards, disc on each of
the 5 training tracks, banked-shift marker leftmost, PP marker at **15**.

New-employee orientation: in random start order, each player places their
certification marker on an empty space of the leftmost certification
section (some spaces grant a benefit); then in cert-track order
(right→left) each takes 1 car part from a warehouse and 1 design (any,
including stack tops, no benefit), then the design row refills.

## 3. Day structure

1. **Department selection**: day 1 in cert-track order, later days in
   order of current workstation top→bottom; must pick a *different*
   department; workstation gives 2-3 shifts (Admin 1-2). Sandra selects
   last on day 2, then in sequence: she moves to the next empty
   workstation top→bottom, skipping full departments; at Administration
   she sits at her desk. (2p: players may not enter Sandra's department.)
2. **Work phase**: in workstation order top→bottom, spend shifts on tasks
   and/or training. Banked shifts may add up to a hard cap of **4 shifts
   per day**. Books = free training moves (any time on your turn, in the
   department(s) you work). Gained books/vouchers/banked shifts are
   unusable until end of turn. Lay meeple down when done. Sandra's turn:
   evaluate the least-trained player(s) in her department (penalty: 1 PP
   + 1 PP per banked shift below 5, if the criteria on p18 fails), then
   departmental task (R&D: pace car +1; Assembly: clear all assembly
   spaces; Logistics: strip warehouses to 1 part; Design: recycle
   rightmost 4 tiles; Admin: end-of-week scoring). No Sandra task day 1.
3. After all turns: meeting if the marker was triggered (pace car crossed
   a striped space), and/or end-of-week when Sandra reached Admin.

## 4. Department tasks

- **Design — Select a Design** (1 shift each): take from rightmost 8;
  rightmost 4 columns grant 1 banked shift or 1 book. Refill at end of
  turn (slide right, refill from the row's first-office stack, then
  central; both empty → top row first). Certified: +1 design slot and may
  take stack tops (advanced design).
- **Logistics** — *Issue kanban order* (1 shift, once/turn): gain 1 banked
  shift, place order card (4/2 split, either orientation), stock matching
  warehouses, card to bottom, draw a new one. *Collect car parts* (1
  shift): all parts you want from ONE warehouse, limited by storage.
  Certified: +1 part slot and *Receive parts voucher* (1 shift,
  once/turn). Vouchers: only usable at the moment of Provide-a-Part or
  Upgrade, taking a part from the supply.
- **Assembly** — on arrival, clean any model whose assembly spaces are all
  full (parts to supply). *Provide a needed part* (1 shift): place a part
  (unique among the model's current parts; upgraded parts must be
  provided before non-upgraded) → the model's top car advances one
  position (displacing cars along arrows; branch choice is the player's),
  new car enters if supply has one. Car off the conveyor: gain 1-2 PP by
  conveyor, demand tile speech token if the model matches, car joins the
  test track behind the pace car (max 4 — 5th entry removes the car
  directly behind the pace car). Fulfilled demand (no tokens left) is
  replaced at end of turn. **Recycling**: any time on your turn (not in
  meetings), swap a stored part with one of the 3 recycling parts (all
  different), free, unlimited. Certified: unlocks 5th garage.
- **R&D** — *Claim cars*: return a matching design to the central stack's
  bottom + empty garage required; shifts by queue position (1st=1, 2nd=2,
  3rd=2, 4th=3); pace car advances by cars claimed at end of turn
  (striped space → meeting trigger); park each car, gain + flip the
  garage tile bonus; factory-goal check. *Upgrade a design* (1 shift):
  design showing model+part, plus the part (or voucher) → part onto an
  empty upgrade space of the model, gain the space's printed benefit,
  value marker +1, flip design (upgraded), +2 PP, factory-goal check.
  Certified: unlock the one-time **double-upgrade** (value +2, flip value
  marker, gain PP equal to new value; each part type double-upgradable
  once per GAME across all players).
- **Administration** — pick another department to also work in; split
  shifts/books freely between admin (training only) and that department.
  Certified: +1 speech slot.

**Training/certification** (all departments): 1 shift = +1 track space
(stack on top of markers already there — stack order breaks final-scoring
ties). Crossing the arrow = certified: discard the section's lock, move
the certification marker into the next section (choose an empty space,
gain its benefit), factory-goal check. Track end = Expert: first player
takes the generic speech token on the award stack; every arriving player
secretly picks 1 remaining award tile (immediate benefit).

## 5. Tested designs, weeks, meetings, end

- **Tested design**: an upgraded design whose model matches a car in your
  garages; moves above the board. Scores at week end and final scoring.
- **End-of-week scoring** (Sandra reaches Admin): for each car in your
  garages, 1 PP per upgrade made to that model (by anyone) + 1 PP per
  tested design you own of that model; week marker +1 (max 3).
- **Meeting** (pace car crossing striped spaces): in cert-track order,
  each turn = Speak (play your one mandatory performance goal from hand
  and/or place a speech token on the highest-numbered empty multiplier
  icon of a goal you haven't spoken on — score goal PP × min(multiplier,
  achieved)) or Pass (only after playing your goal); ends when all pass
  consecutively. Afterwards: tokens back beside boards, generic tokens
  convert to slotted own tokens, discard face-up goals, each player seeds
  1 of their 2 remaining hand cards for the next meeting (refill to 4
  from deck at <4p), draw back to 3, meeting marker back to test track,
  production-cycle marker +1 (max 3).
- **Game end**: week marker ≥2 and production-cycle ≥3, or week ≥3 and
  cycle ≥2 (one at least on 2nd, other at least on 3rd). Finish the day
  (including scoring/meeting), then **final scoring**: final-goal
  achievements (1 speech token each, once per player per achievement),
  1 PP per banked shift, 1 PP per token/book/voucher on the board, car
  values (2/3/4/5/6), training-track positions (5/3/1, stack order breaks
  ties, untrained scores nothing), tested design part values.

## 6. Port architecture (per playbook)

- TV = the factory board in 3D (mod meshes: cars, parts, meeples, Sandra,
  pace car, markers); phones = the player board as a rendered 3D mat
  (§5 playbook — mod player-board mesh + cars in garages + parts +
  designs + locks + speech tokens), all moves made on the phone in
  enforced order.
- Engine `shared/src/kanban/` with goldens transcribed from the mod Lua
  tables (element definitions, board spots) + rulebook (rules); full
  enforcement; pending-decision queue for multi-step choices (kanban
  order orientation, design picks, meeting speeches, award picks,
  displacement branch choices, admin split).
- Server bots for every decision kind; 10-run bot playthrough tests +
  invariants; live WS smoke + 4-seat UI-driven DOM smoke (§6.4b gates).
- Sandra is engine-automated (not a bot seat): moves, evaluates,
  departmental tasks, exactly per pp17-18.

## 7. Open questions / to verify during extraction

- [ ] What "All Expansions" adds in this mod vs the retail base box —
      diff the object list against the base-game mod (2582375670 /
      2814175574) and stage extras as future create-options.
- [ ] Warehouse/assembly/test-track spot coordinates from SPOTS/Zones
      tables; board fit method (§3) — likely the mod's own labelled
      zones (method D) since ScriptingTriggers abound (59).
- [ ] Award tile effects, garage bonus tiles (basic + expert), upgrade
      space benefits, certification space benefits, performance goal
      cards (32), final goal tiles (11), kanban order cards (12), factory
      goals (12) — transcribe each from art + Lua + reference book PDF
      (the mod carries rulebook + reference/solo book).
- [ ] Demand tiles (5), design tile distribution (7 per model × 5).
- [ ] The 1 assetbundle — what mesh is inside (extract via UnityPy §2.2).
