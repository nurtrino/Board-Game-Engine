# Politik - Port Spec

Source: TTS workshop `3460664356`, save `Politik`, TTS version `v14.2.1`.
The source save is
`C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Workshop/3460664356.json`.
The official in-mod rulebook is draft `v3.4.26`, object `b18209`, 19 PDF pages
(printed pages 1-36). This spec follows the mod and that rulebook, not memory or
third-party rules summaries.

Politik is a dynamic strategy game of military, political, and corporate
majority control for **2-6 players**. Players lead one of 12 fictional Nations,
build a private tableau, contest the shared map/Council/Industries, and claim
Power Grabs. A winner must hold enough Power Grabs while representing at least
two of the three arenas (rulebook PDF p.3 and p.7, printed pp.4-5 and 12-13).

## 1. What the TTS mod enforces

The mod is an assisted physical-table implementation, not a rules engine.

- Global Lua lines 1-282 creates four conclusion buttons (`1st Action`,
  `2nd Action`, `3rd Action`, `Power Grab`) and camera shortcuts for the main
  board plus the six personal areas. It does not validate actions or card text.
- Scripted price trackers on objects `da8ca3`, `0a732d`, `a04cb4`, `be7d07`,
  `abfcb0`, and `80be5e` move the six price markers across values 1-10.
- Six `Resources` objects track public Capital, Carbon, and Food. Other scripts
  are quality-of-life tools (deck fanning, landscape resolution, resource
  buttons), not comprehensive rule enforcement.
- The game contains 903 objects: the authentic board, six personal areas,
  cards, trackers, and tokens. The rules live primarily in the PDF and printed
  card art.

The web port enforces the turn structure, costs, resources, board ownership,
majorities, Power Grabs, hand privacy, and all core action procedures. Politik's
412 unique cards remain readable as authentic card art. Effects represented by
the data model resolve automatically. Any unencoded printed effect uses an
explicit guided resolver that records every change in the public log; it is
never a silent no-op and never asks players to manipulate raw state.

## 2. Authentic content inventory

From the save and rulebook PDF p.4 (printed pp.6-7):

- Main board: `Custom_Tile` GUID `3a55e6`, 5760x3840 art, transform centred at
  `(0, 5.5, 2.5)`. This is the render and coordinate source of truth.
- Six personal Nation Boards using image GUID family headed by `f1c432`.
- 12 Nation cards: deck `6306fe`, sheet `10414` (4x3).
- 24 Starting Propaganda cards: loose cards on sheet `10416` (6x4).
- 412 Politik cards: deck `d2135c`, across 18 sheets (`10417`-`10434`), each
  6x4; the save's exact `(sheet, cell)` order is authoritative.
- 12 Startup Company cards: deck `2629ce`, sheet `10435` (4x3).
- 24 Obligation cards: deck `d75693`, sheet `10436` (6x4).
- 54 playable Landscape cards in deck `652542`, across sheets `10406`-`10408`,
  plus fixed deck cover/divider `10409:0`. Object script `4817be` removes the
  cover before every shuffle/draw and restores it afterward; it is never part
  of the playable deck.
- 5 Broadcast Station cards (`510885`, sheet `10412`), 3 Immunity cards
  (`7b2729`), and the Final Say card.
- 20 Company boards, 20 Margin tokens, 360 canonical Nation Control tokens,
  60 Nation tokens, 90 Market tokens, 72 leaders total per the rulebook, six
  price markers, and two Clash markers. The save deliberately overprovisions
  72 leaders in each type's supply bag, so the engine treats the shared leader
  supply as sufficient rather than inferring a 216-token limit.
- Embedded official rulebook PDF `b18209`, staged as
  `client/public/politik/rulebook.pdf`.

The extractor must stage all authentic images from the TTS cache, preserve
card-sheet resolution sufficient to read text, produce a web-sized board image
without changing its aspect/coordinate system, and be idempotent.

The 12 Startup Companies are transcribed separately from the 412-card Politik
catalog with their printed name, Industry, starting Margin, Corruption keyword,
Capital/Carbon cost, and three printed Focus values. They must never use a
generic fallback Company, and an unplayed Startup can be Focused in a Clash.

Known special-card families do not enter the ordinary-card uncertainty flow.
Nation, Starting Propaganda, Startup Company, Obligation, and Broadcast Station
identities remain structured. Startup type, costs, Industries, Margin,
Corruption, and Focus are locked to the verified transcription. Obligation
identity, restrictions, deck return, and live Shirk cost are likewise enforced
from structured state; a player is never asked to reinterpret one as another
card type.

All 54 Landscape icon sets are also transcribed as a signed magnitude, one or
two affected Industries, and one to three affected price tracks. These
structured effects prefill every shared Market, Company Margin, and Price
change; the player is asked only for genuine Margin-overflow choices.

## 3. Shared board geometry

This is playbook map case **B**: interaction positions are measured directly in
the board image's 5760x3840 pixel space and the render uses that same image
space. No homography is needed. The TTS tile is exactly 30x20 world units at
world centre `(0, 2.5)`; its exact mapping is
`pixelX = 192 * worldX + 2880`, `pixelY = -192 * worldZ + 2400`.

The board contains:

- Five Regions (`A`-`E`) with six States each (30 States total).
- Five Broadcast Station States (`X1`-`X5`) connecting adjacent Regions.
- Forty printed State-route edges. Military Clash Influence can only be
  Focused from a location connected directly to the target by one edge.
- Four ideological Bases: Capitalism, Communism, Statism, Fascism.
- Six Council Seats, left to right: Chair, Justice, Commerce, Labor, Intel,
  Defense.
- Six Industries: Media, Energy, Financial, Humanities, Technology,
  Manufacturing.
- Price rows for Food, Carbon, Research, Campaign, Clash, and Educate, each
  bounded 1-10.
- Corruption (0-10+), three Power Grab spaces, National Action spaces,
  Landscape/Obligation/Politik decks, and Final Say.

TV rendering uses the authentic board art on a three.js plane, low physical
tokens seated on the surface, a capped orbit camera, and black surroundings.
Device main-board mode uses the same coordinate data in a fixed readable frame
for selection. TTS/three.js Z mirroring applies to any world-positioned mesh.

Public pieces are seated on the printed spaces rather than on nearby decorative
labels. Council Support uses the centers of the six large black fields at
`(2432,3650)`, `(3027,3650)`, `(3623,3650)`, `(4218,3650)`, `(4813,3650)`, and
`(5408,3650)`. Corporate, Military, and Political Power Grabs use
`(1320,818)`, `(2701,1792)`, and `(4159,3080)`. Income, Rally, Produce, and
Refresh Nation tokens use `(2674,550)`, `(3108,550)`, `(3541,550)`, and
`(3975,550)`. Multiple Council, Base Support, Power Grab, and National Action
pieces use compact stable grids; a lone Influence or Imperial marker is centered
on its State. Shared Market supply is centered on the six printed supply circles,
while player-owned Market remains on its private Company board. Every controlled
Broadcast Station also carries an unambiguous `READY` or `USED` status marker.

## 4. Setup

Rulebook PDF p.5 (printed pp.8-9):

### Shared setup

1. Sort Nation pieces and leaders.
2. Put one Market per player into each matching Industry.
3. Put the six price markers on their printed starting values:
   Food 8, Carbon 5, Research 5, Campaign 5, Clash 2, Educate 2 (the save's
   tracker states and board art are cross-checks).
4. Shuffle Obligations and Broadcast Stations into their board areas.
5. Shuffle Landscapes, reveal the first active Landscape, and resolve its
   Market/Margin/Price changes. Keep the next Landscape visible.
6. Shuffle Politik cards, Nation cards, and Startup Companies.

### Player setup

Each player receives a Nation Board and public resource panel, then:

1. Draw 2 Nation cards, 6 Politik cards, and 1 Startup Company.
2. Optionally mulligan the entire six-card Politik hand once.
3. Select one Nation and one of that Nation's two Starting Propaganda cards.
4. Take the matching 30 Control tokens and 5 Nation tokens.
5. Start Corruption at 0. If Starting Propaganda has Corruption, gain 1 and
   draw an Obligation.
6. Gain the selected Nation's printed Capital, Carbon, Food, Support, and
   leader allotment. Support is assigned among Bases matching the selected
   Starting Propaganda; leaders are selected by type.

Nation starting values transcribed from sheet `10414`:

| Nation | Capital | Carbon | Food | Support | Leaders | Propaganda choices |
|---|---:|---:|---:|---:|---:|---|
| Arden | 25 | 1 | 2 | 1 | 1 | Specializations / Homeland |
| Centina | 35 | 0 | 1 | 1 | 1 | Culture of Openness / Intensification |
| Gran Santi | 25 | 2 | 0 | 1 | 1 | Intimidation Tactics / Steely Wit |
| Indoverra | 20 | 0 | 3 | 1 | 1 | Honor Culture / Oath of Poverty |
| Isant Isay | 35 | 1 | 1 | 1 | 1 | Assured Stability / Lofty Rhetoric |
| Libris | 30 | 1 | 1 | 1 | 1 | Holistic Learnings / Unity |
| Mount Roq | 20 | 2 | 1 | 1 | 1 | Improvisation / Proteges |
| Neometro | 40 | 0 | 0 | 1 | 1 | Backchannels / Cryptocracy |
| Rodgrod | 30 | 2 | 0 | 1 | 1 | Red Empire / Petrostate |
| The Baaslands | 30 | 1 | 0 | 1 | 2 | Dogmatic / Grey Area |
| Ticca Republic | 35 | 0 | 0 | 2 | 1 | Birthright / Old Money |
| UTP | 40 | 0 | 0 | 1 | 1 | Catch and Kill / Marketmaker |

### Final setup

1. Randomly choose first player and clockwise order.
2. Determine Final Say (section 8).
3. From last player counterclockwise, everyone except first and second chooses
   a unique setup bonus: 8 Capital, 1 Food, 1 Carbon, Research 1, or Exchange
   X. In a 2-player game, the second player does receive a bonus.
4. From first player clockwise, each chooses a non-Broadcast State, begins
   with 8 Influence there, and gains its printed State benefit.

Setup is an explicit device flow. Private Nation/hand choices never appear on
the TV until confirmed. Its 11-step setup tutorial explains the objective,
privacy, opening Landscape, mulligan, Nation, Starting Propaganda, Base Support,
leaders, exact setup bonuses, and initial State placement in context. Every
mulligan card, Nation, and Starting Propaganda can be opened as full-size
authentic art without selecting it; selection and `VIEW CLOSE UP` are separate
controls.

## 5. State, privacy, and public information

Resources and hand size are public; card identity in hand is private (rulebook
PDF p.6, printed pp.10-11). The per-player view exposes:

- Private: the viewer's Politik/Obligation hand, setup Nation choices,
  mulligan decision, focused cards before reveal, and pending private choices.
- Public: every player's Nation, tableau, Companies/Assets, resources, hand
  count, discard, Support, Influence, Market, Margin, leaders, Corruption,
  National Action tokens, Broadcast Stations, Immunity, Power Grabs, and
  Final Say.
- TV/neutral views never include private card IDs or hidden clash commitments.

All random draws use a seeded stream stored with the save. All decisions use
serializable pending prompts so reconnects cannot lose an in-progress choice.

Hand limit is 10. Any player above 10 must choose discards before play can
continue. Obligations count toward the limit and cannot be Traded, Developed,
Focused, or discarded normally (rulebook PDF pp.6 and 11).

## 6. Control and victory

Rulebook PDF p.7 (printed pp.12-13):

- State: a Nation with Influence there controls it.
- Region: control at least 2 States and the most States in that Region.
- Council Seat: have Support there and the most Support in that Seat.
- Industry: collectively hold the most Market there across Companies.
- Ties count as "the most" only when Final Say awards the tie to that Nation.

Power Grab criteria:

- Military: control at least 3 Regions.
- Political: control at least 4 Council Seats.
- Corporate: control at least 4 Industries.

At end of turn the active player claims every newly met Power Grab, up to two
of each type. Claims cannot be lost. Victory requires at least two types and:

- 2 players: 4 total Power Grabs.
- 3-4 players: 3 total.
- 5-6 players: 2 total.

`Long War`, `The Trifecta`, and `Raging Imperials` from PDF p.18 (printed
pp.34-35) are create-room options. Standard is the default. `Draft Game` and
`Team Game` are documented in the in-device reference and official rulebook,
but are deliberately not offered as room options until their draft/private-pack
and team-victory flows are fully digital; the UI never implies that they work.

## 7. Turn structure and actions

Rulebook PDF pp.13-16 (printed pp.24-31):

Each active turn has Main Action 1, Main Action 2, then Check Power Grabs.
The same Main Action may be taken twice. At 9+ Corruption, the player receives
Main Action 3. The device always presents an explicit **END TURN / CHECK POWER
GRABS** action; turns never auto-advance silently.

Eight Main Actions:

1. **Play** one Company, Asset, Propaganda, Event, or Obligation from hand.
2. **Use Ability** on a Company, Asset, Propaganda, or Broadcast Station.
3. **National Action**: Income, Rally, Produce, or Refresh.
4. **Clash** in the Military, Political, or Corporate arena.
5. **Educate X**: pay Food price x X, gain X leaders in chosen types.
6. **Research X**: pay Research price x X Capital, draw X cards.
7. **Campaign X**: pay Campaign price x X Capital, move X Support from any
   Bases into exactly one Council Seat.
8. **Exchange X**: buy/sell Food and Carbon at current prices, resolving the
   four transaction types in any order.

Four Edge Actions are available to any Nation during any turn when timing
allows: play an Edge Event, use an Edge Ability, Shirk an Obligation for
`10 x current Corruption` Capital, or Trade. Simultaneous Edge Action order is
set by Final Say. A response window is visible but compact; players can choose
`PASS` so the table never waits ambiguously.

Every action follows declare, check requirements, pay costs, resolve effect.
Canceled actions lose costs already paid unless card text says otherwise.
Unavailable or unaffordable controls are disabled with a plain inline reason.

### 7.1 Play

- Company: pay cost, create Company Board, set printed starting Margin, then
  take one available Market matching an Industry keyword.
- Asset: attach to a controlled Company; add its Industry keywords and printed
  starting Margin. Crossing 9 Margin prompts the owner to take a matching
  Market/reset to 0/continue or remain at 9.
- Propaganda: pay matching Base Support; maximum four in tableau, with an
  explicit replacement choice for the fifth.
- Event: resolve, then discard during Check Power Grabs.
- Obligation: resolve and put on the bottom of the Obligation deck.
- Playing any Corruption-keyword card gains 1 Corruption and draws 1
  Obligation after the card is played.

### 7.2 National Actions

- Income: gain 5 Capital; gain each Company's `Margin x Market`; gain 5 per
  controlled Industry; optionally buy one available Market for 20 Capital and
  assign it to an eligible Company.
- Rally: gain one Base-matching Support for each controlled Propaganda, then
  resolve controlled Council Seats left to right (Chair through Defense).
- Produce: gain every controlled State benefit, then Research once per Region
  occupied. Newly gained Support is assigned among Bases.
- Refresh: Ready all controlled cards and resolve the next Landscape.

A Nation cannot reuse a National Action while its token remains there. After
all four are used, return all four Nation tokens.

### 7.3 Council Seat abilities

- Chair: remove 1 Support from a Council Seat.
- Justice: immediately grants Final Say while controlled.
- Commerce: gain 1 Market and Exchange X.
- Labor: Educate 1 and move Prices a total of 3.
- Intel: gain 1 Corruption and Research 1.
- Defense: immediately gain Immunity while controlled; Rally also distributes
  5 Influence among controlled States.

### 7.4 Landscapes and prices

The active and upcoming Landscapes are always public. On Refresh, apply the
printed +/- magnitude to listed Industry Market supply, every matching
Company's Margin once per listed Industry, and listed price tracks. `Price X`
moves any combination of price markers by a total of X increments, each kept
within 1-10 (rulebook PDF p.12, printed pp.22-23).

## 8. Clashes, Broadcast Stations, and Final Say

### Military Clash

Target any State. Attacker and defender commit hidden Politik cards and
same-type leaders, resolve Focus-timing Edge abilities, and may Focus adjacent
Influence at one Focus per Influence. An Imperial State adds the top Politik
card (two for a Broadcast Station) to defense. Reveal both sides and compare
Military Focus. The winner gains Influence equal to the difference, first
removing opposing Influence then adding their own. On gaining control, take the
State benefit and any Broadcast Station card (PDF p.15, printed p.28).

### Political Clash

Target another Nation's Support in a Council Seat. Both sides Focus cards and
leaders, reveal, and compare Political Focus. The winner captures opposing
Support equal to the difference, limited by Support present when the Clash
started (PDF p.15, printed p.29).

### Corporate Clash

Choose one attacker Company and one opposing Company. Both sides Focus cards
and leaders, reveal, and compare Corporate Focus. The losing Company owner
chooses a total loss of Market and/or Margin equal to the difference. Market
that the winning Company cannot legally hold returns to shared supply
(PDF p.16, printed p.30).

### Broadcast Stations

- Signal: activate, choose a Base, then add Influence to every controlled State
  in both adjacent Regions equal to controlled Propaganda with that Base.
- Noise: activate, choose a Base, then reduce opposing States in both adjacent
  Regions by the attacker's matching Propaganda minus the target Nation's
  matching Propaganda. Immunity prevents Noise (PDF p.8, printed pp.14-15).

Temporary card-granted Immunity expires at the active turn's end. Defense Seat
Immunity follows control of that Seat.

### Final Say

The Final Say holder resolves every tie. Recompute immediately using the first
criterion with exactly one leader: Justice Seat controller, most Corruption,
most Negotiation keywords, then active player. Bribes for a tie judgment are
allowed and are not a formal Trade (PDF p.11, printed p.20).

## 9. Trading and guided card resolution

Trades can include hand cards, tableau cards, use of a card, resources,
Margin, States, favors, and other negotiable property. They must involve
multiple Nations and be approved by the active player. Agreements are
non-binding. Received items do not count as "gained" for triggers and retain
Ready/Activated state. Obligations, Final Say, and Immunity are not tradable
(PDF p.12, printed p.23).

The device provides a trade builder showing both sides, affordability, and a
final confirmation for every involved player. The TV shows only the accepted
result, not private cards offered before acceptance.

An ordinary Politik card does not ask for a blanket confirmation when drawn,
browsed, or merely held. If the player actually uses a card whose digital
transcription is uncertain, the card opens beside a single `ENTER PRINTED
VALUES` action. The player enlarges the authentic art and enters only the fields
needed by that use: card type and name, printed Capital/Carbon and minimum
Corruption, Corruption/Negotiation or Edge icons, Industries and Margin, or
Propaganda Base and Support cost as applicable. The manually entered declaration
is authoritative for legality, payment, placement, and keyword consequences;
the printed Focus entered during a Clash is likewise authoritative. OCR title,
cost, keyword, rules, and Focus text is labeled `OPTIONAL OCR HINT · NEVER
ENFORCED` and cannot alter the rules engine.

After declaration, any authentic effect not yet data-encoded opens beside a
guided resolver with typed operations (resources, Research/Develop, Support,
Influence, Market/Margin, Price, Ready/Activate, leader, and card movement).
The controlling player selects the printed operations and targets; the engine
validates ownership and numeric bounds and writes a precise public audit event.
This is the digital equivalent of the mod's honor-system piece movement while
remaining understandable to new players. Verified Startup and structured
Obligation cards bypass manual declaration and retain their known rules data.

## 10. Client experience

### Shared TV

- Full authentic board in a dark room, seated tokens, orbit camera.
- Persistent turn/action counter, Final Say, prices, active/upcoming Landscape,
  deck counts, public player summaries, and narrated latest action.
- Base Support, Council Support, Power Grabs, National Action tokens, Market
  supply, and Broadcast Station `READY`/`USED` status sit directly on their
  printed board spaces and remain distinguishable at the normal camera angle.
- `EXPLAIN BOARD` labels every region and functional zone. Clicking any label
  opens a short rule and the exact consequences of control.
- During selections initiated on a device, legal destinations glow without
  exposing private cards. Clashes focus the camera on the target and reveal
  Focus cards together.
- TV plays action/turn/win sounds; devices stay quiet apart from taps/errors.

### Personal device

Landscape iPad (768 px tall) is the hard no-scroll target. A single shell has a
one-click **PERSONAL / MAIN BOARD** switch:

- Personal: fixed top-down tableau with the authentic Nation Board and separate
  Company trackers. The Nation card and three leader reserves sit in their
  printed zones; exact resources, main-board Support, Corruption, Final Say,
  Immunity, Propaganda, Broadcast Stations, Events, Companies, Assets, Markets,
  and Margin are separated into labeled areas. Each Company has its own tracker,
  one Margin marker on 0-9, summarized Market pieces, and an explicit READY/USED
  state. No Support or Corruption piece is duplicated onto the personal art.
- Main Board: fixed readable board frame with selectable hotspots and an
  always-visible `BACK TO PERSONAL` control. Any action requiring a board target
  moves here automatically and returns after confirmation.
- Header: outlined seat identity, current action step, Capital/Carbon/Food,
  hand count, Corruption, Final Say status, and three Power Grab tracks.
- Action dock: only legal actions, each with cost and disabled reason; explicit
  End Turn. Context panels show what a selection will change before commit.
- Card inspection: every hand, setup, tableau, Landscape, and Clash commitment
  card can open authentic art in a full-size close-up without exposing another
  player's hidden information. Manual-entry inputs, dropdowns, and options use a
  dark high-contrast surface with tablet-readable type; there are no white-on-
  white native select controls.
- Reference drawer: a 15-module Help lesson library covers Start Here, How to
  Win, Turn and Timing, Main Actions, Edge Actions, Board and Control, Cards and
  Keywords, National Actions, Clashes, Companies and Economy, Corruption and
  Obligations, Final Say and Ties, Trading, Worked Examples, and Strategy and
  Variants. It also retains searchable authentic Nation/card reference and a
  one-click official rulebook.
- The replayable 24-step playing tutorial targets the real identity, resources,
  PERSONAL/MAIN switch, board, action grid, every action family, Clash flow,
  Edge tools, hand, End Turn, and Help controls. It changes board mode when a
  lesson needs the shared map, keeps every card inside a 1024x768 viewport, and
  uses chapter/progress labels so a new player always knows where they are.

All labels follow the shared in-game style: serious uppercase labels, middot
separators, no emoji, no em dash, seat colour as an outline, and clear disabled
reasons.

## 11. Verification and ship gates

Required before complete:

1. Extractor count assertions: 903 objects, 412 Politik cards, 54 playable
   Landscapes plus the fixed cover, 12 Nations, 12 Startups, 24 Obligations, 5 Stations, 30 States,
   5 Broadcast Station spaces, six Seats/Industries/prices.
2. Golden/scene/shared card ordering and board coordinates agree.
3. Engine tests: deterministic playthroughs at 2-6 players, card/token
   conservation, hand privacy, costs, all three Clash procedures, Final Say,
   National Action cycling, Corruption third action, Power Grab/victory rules,
   and variants.
4. Client build and typecheck, clean page-error runs, TV and device screenshots
   at desktop and 1024x768, with board pieces seated, card art upright, key
   digital labels at readable tablet sizes, and authentic close-up card art.
   Audit all 11 setup tutorial steps, all 24 playing tutorial steps, all 15 Help
   lessons, dark manual-entry controls, and the on-demand uncertain-card path.
5. Live WebSocket full game reaches a winner with deliberate bot pacing.
6. Rulebook UI-coverage audit maps every decision/optional cost/amount/public
   fact from PDF pages 3-18 to a visible TV or device affordance.
7. A 1024x768 Puppeteer device completes a full live game with two paced
   production opponents, using actual rendered controls for every human choice;
   a separate live WebSocket game verifies neutral-TV and private-seat views.

## 12. Rulebook UI-coverage audit

This audit uses the embedded official rulebook v3.4.26. PDF page numbers below
are the 19-page file pages; the printed spread numbers are included so a player
can cross-check the physical layout. "Device" always means the acting player's
private screen. "TV" always means the neutral shared screen.

| PDF page (printed) | Rulebook information and decisions | Personal-device affordance | Shared-TV affordance and enforcement |
|---|---|---|---|
| 3 (4-5) | Goal, three arenas, majority control, multi-use cards, two Main Actions, National Actions, timing and Power Grabs | First-open goal card, 11-step setup tutorial, 24-step playing tutorial, action rail and the 15-module Help library explain the complete loop in plain language | Turn/action plate, public control tokens, player Power Grab summaries and final winner presentation keep the objective visible |
| 4 (6-7) | Complete component inventory and physical limits | Top-down Nation tableau renders the Nation, active Propaganda, Companies, Assets, leaders, exact resources, one Margin marker per Company and summarized Markets; deck drawer exposes public counts | Authentic main board, active/upcoming Landscapes, six prices, Market pools and all placed public pieces; the engine conserves cards and Market, and enforces the 20-Company supply |
| 5 (8-9) | Main setup, mulligan, private Nation/Propaganda selection, Support/leader allocation, unique bonus and starting State | Explicit setup prompts plus an 11-step contextual tutorial; private cards stay on the device; mulligan, Nation, and Propaganda art has a separate full-size close-up; every amount has a counter and confirmation; board targeting switches to MAIN BOARD and back | Shows only formation progress and confirmed public choices. Opening Landscape resolves first, then all setup order/uniqueness/state-benefit rules are server-authoritative |
| 6 (10-11) | Control/Nation tokens, tableau layout, public resources, 10-card hand limit, Develop/Remove/Activate/Ready vocabulary | Fixed top-down personal tableau mirrors the physical zones without perspective distortion; labeled READY/USED cards and exact counters replace ambiguous stacks; forced hand-limit modal excludes illegal Obligation discards; glossary explains every verb | Public token values, hand counts, National token usage and tableau facts are visible without leaking card identities |
| 7 (12-13) | State/Region/Seat/Industry control, ties, Focus values, keywords, Power Grab thresholds and victory | Help lessons plus card focus panel show arenas/keywords; every hand, setup, tableau, Landscape, Clash, and reference card can open authentic art in a full-height close-up; action previews show resulting targets/costs; Power Grab track stays in the header | Board tokens and player summaries show every majority; Base/Council Support and Power Grabs sit on their printed fields; ties get a named Final Say ruling prompt; claims occur only during end-turn check and cannot be lost |
| 8 (14-15) | Regions, Imperial States, Broadcast Stations, Signal, Noise and Immunity | Station ability builder selects Signal/Noise and Base, previews adjacent Regions and effects, then uses the same one-click board mode; Immunity is shown on the personal mat/status | Board shows centered State/Station pieces and an explicit Station `READY`/`USED` marker; Signal/Noise math, adjacent-Region scope, Imperial restoration and Immunity exclusion are validated by the engine |
| 9 (16-17) | Council powers, Rally order, Propaganda maximum, Bases and Support | Campaign builder moves any Base mix into one Seat; Rally builder allocates per-Propaganda Support and shows Chair through Defense decisions in exact left-to-right order; fifth Propaganda requires replacement | Council/Base Support is always public. Justice/Defense update immediately; Chair can change the controller of later powers before they resolve |
| 10 (18-19) | Industries, Companies, Assets, Market, Margin, shortages and >9 Margin choice | Card play names Company/Asset industries, target Company, starting Margin and opening Market; every overflow asks that Company owner to take an eligible Market or remain at 9 | TV shows all Company public state plus 15-token Market supply/reserve; conservation, Industry eligibility, shortage behavior, zero floor and Company-board limit are authoritative |
| 11 (20-21) | Final Say priority, live tie rulings, Corruption, third action, Obligations, Shirk and restrictions | Final Say receives an explicit candidate chooser for each live tie; Corruption and action count are persistent; Obligations have Play and computed `10 x Corruption` Shirk controls and cannot enter forbidden flows | Final Say holder/rulings, Corruption and hand counts are public; higher-priority changes recompute immediately and tie rulings expire when the tied set/value changes |
| 12 (22-23) | Leaders, Landscapes, Trading, resources, prices and Price X | Header/mat keep leaders/resources always visible; Landscape panel gives exact signed Market/Margin/price preview and owner-only overflow; trade builder lists both directions, exact property and every approver | Active/upcoming authentic Landscape art, prices, Market pools and accepted trades are public; private offered hand cards are visible only to approvers; all 54 Landscapes use structured definitions |
| 13 (24-25) | Turn sequence, eight Main Actions, four Edge Actions, any-Nation timing, declaration/requirements/cost/effect, cancellation and Check Power Grabs | Action rail shows all eight with inline disabled reasons; RESPONSES opens an ordered Edge window; hand/card declaration confirms printed costs/requirements; guided cards can explicitly record a canceled effect while retaining paid costs; END TURN is explicit and never automatic | TV identifies actor/action number and narrates accepted results. Server enforces active-player Main Actions, all-player Edge responses, exact staged Clash cancellation, Event cleanup and end-turn claims; uncommon printed cancellations use the audited guided outcome described below |
| 14 (26-27) | Play Company/Asset/Propaganda/Event/Obligation, Use Ability and all four National Actions | Authentic enlarged card plus a dedicated full-size art view; an uncertain ordinary card reveals manual printed-value fields only when the player chooses to use it, while verified Startups and structured Obligations remain locked; Company/Asset/Propaganda targets and owner overflow follow declaration; ability source picker includes Ready and optional Activate; National panel exposes every optional amount and target | Played tableau and readiness are public. Income, Rally, Produce and Refresh are structured, including optional Income Market, Council powers, occupied-Region research and Landscape advance; used Nation tokens sit on the matching printed action spaces |
| 15 (28-29) | Military and Political Clash: payment, hidden Focus, leaders, adjacent Influence, Imperial defense, timing windows, reveal, difference and capture cap | Clash builder selects arena/payment/target; private commitment modal shows only the player's own cards/leaders/source-specific adjacent Influence; every committed or revealed card has a full-size close-up; player-entered printed Focus is authoritative over its OCR hint; staged response prompts cover During Focus, after reveal and before resolve | TV shows a Clash in progress without commitments, then reveals both together; engine calculates Imperial defense, Focus totals, Influence exchange/benefit and Political starting-Support cap |
| 16 (30-31) | Corporate Clash transfers; Educate, Research, Campaign, Exchange; Edge Event/Ability, Shirk and Trade | Corporate loss owner allocates exact Margin/Market transfer; X-action steppers show live total cost and final resources; Edge controls remain available in the player's response window | Corporate eligibility/overflow and uncapturable Market return are public and conserved; all X costs, one-Seat Campaign rule and ordered Exchange transactions are atomic |
| 17 (32-33) | Worked examples, variable/typed card costs, ability costs, Obligation math and triggered Edge abilities | Enlarged authentic card art is the authority. OCR is an optional, never-enforced hint. Only an uncertain card being used opens the dark, high-contrast declaration editor; manual type, costs, requirements, icons, Industries, Margin, Support and Focus override OCR completely. The typed guided resolver covers resources, Support, Influence, cards, leaders, readiness, Market/Margin, prices and acknowledgements | Every guided operation is validated and logged rather than silently ignored. The exact printed card remains visible beside the resolver so the table can audit uncommon unique effects |
| 18 (34-35) | Strategy tips and five variants | HELP provides goal/action/glossary explanations and opens the official rulebook in one click for the complete strategy page. Room creation exposes Standard, Long War, Trifecta and Raging Imperials with exact descriptions | TV labels active supported variants. Draft and Team are described but intentionally unavailable; no partial or misleading implementation is advertised |
| 19 (36) | Alphabetical terms/index | Searchable/tappable glossary explains common terms; OPEN OFFICIAL RULEBOOK gives the full indexed source in one click | Board guide explains regions, Seats, Industries, prices and Power Grabs without requiring a private screen |

### Unique-card boundary

The board game contains 412 unique Politik cards plus Nation, Starting
Propaganda, Broadcast Station, Startup and Obligation text. Core procedures,
all 54 Landscapes, every Startup, Broadcast Signal/Noise, setup exceptions,
Capital/Carbon/Corruption declarations, staged Clash timing/cancellation,
control, trading and victory are structured. For a rare unique effect not
represented by a dedicated operation, the authentic card opens next to a typed,
server-validated guided resolver and the chosen resolution is written to the
public log. A guided effect can be marked canceled after declaration; paid
costs, the consumed action, card placement and activation remain spent.

The intentional boundary is explicit: there is no universal opponent
pre-effect response stack for every one of the 412 ordinary effects. An
uncertain ordinary card is not pre-confirmed as part of setup or hand browsing;
the compact manual editor opens only on demand while preparing to use it. Its
player-entered printed type, costs, requirements, icons, Industries, Margin,
Support data, timing, and Clash Focus are the engine input, and uncommon Food,
leader, Develop, Remove, or other unique operations are completed through the
guided audit. OCR-derived
titles, Focus values, costs, keywords, and rules text improve navigation only:
they are explicitly non-authoritative and never override authentic art or the
manual declaration. Verified special cards continue to use their structured
data without this uncertainty prompt.
