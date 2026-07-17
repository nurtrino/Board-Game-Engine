# SETI rulebook-to-UI coverage audit

Status: **complete - every rulebook/UI row and every runtime ship gate below
passed on 2026-07-12.**

Authoritative sources reviewed:

- `client/public/seti/rulebook.pdf`, all 28 pages, including the back-page FAQ.
- `client/public/seti/player-aid.pdf`, both pages.
- `client/public/seti/alien-species.pdf`, all five species sheets.
- `client/public/seti/faq.pdf`, all 27 pages (general, solo, base-card,
  alien-card, and promo-card clarifications).
- `docs/specs/seti.md` and the typed project, alien, solo, technology, planet,
  sector, and solar-geometry catalogs.

The checkboxes below are acceptance evidence, not design intent. A row is
checked only when the named affordance exists, the corresponding engine choice
is not auto-picked, and a directed test or DOM run has exercised it.

## Acceptance evidence

- `tmp/QA/seti-visual-2026-07-12T17-09-24-491Z/report.json` - live seed-82
  interaction gate: 32 TV/device screenshots, 182 checks, zero failures or
  browser errors, every main action reached through real DOM gestures, and the
  same probe recorded at source, timed 1.08-second polar travel, and settled
  destination coordinates.
- `tmp/QA/seti-rare-visual-2026-07-12T16-54-11-561Z/report.json` - deterministic
  seed-1 automatic-state gate: 162 engine actions and 14 production-component
  screenshots (TV plus private 1024x768 device) for rotation/bump, round income,
  neutral/gold milestones, both species reveals, and final scoring; zero
  failures or browser errors.
- `tools/verify/seti-ui-smoke.mjs` - complete DOM-only games: 4p room `KTXK`
  (94 DOM actions) plus solo D1-D5 rooms `KNQR`, `STGN`, `ZGLB`, `GHNX`, and
  `RWHK` (27/28/17/28/27 DOM actions). No gameplay action was sent directly.
- Shared acceptance: complete 1-4p seeded games now assert conservation,
  private-view redaction, action-by-action deterministic replay, and JSON
  round-trip for every count; solo D1-D5 assert the same replay/redaction/
  round-trip boundary. Current totals are 668/668 general SETI checks, 15 core
  flow cases, 1,582 project-catalog assertions, 1,014 project-runtime
  assertions, 494 alien-catalog assertions, and 78 alien-runtime checks.
- `node tools/verify/seti-pending-visual-contract.mjs` covers all 18 pending
  kinds. Client SETI tests, server tests, full typecheck, production build, and
  scoped whitespace hygiene all pass.

## Setup and public table state

| Source | Required information or decision | Physical UI affordance | Engine/view contract | Gate |
|---|---|---|---|---|
| pp. 4-5 | Random three-disc orientation and four paired sector boards | Authentic layered solar board and four authentic sector strips | Seeded orientations and `sectorBoardOrder` | [x] |
| pp. 4-5 | Two secret random species | Two physical face-down alien boards; fronts appear only on reveal | Redacted `species` view | [x] |
| p. 4 | Three face-up project cards and hidden draw order | Authentic project row plus a face-down deck with remaining count | Public row, count-only deck | [x] |
| p. 5 | Twelve shuffled technology stacks and first-take 2 VP tokens | Twelve physical stacks with the actual face-up reward tile and 2 VP chip | Public `topTileId`, count, first-take flag | [x] |
| p. 5 | Four random gold-tile sides and claim values | Four authentic gold tiles with markers on their exact value spaces | Public side and claim-time points-per-set | [x] |
| pp. 5-6 | Neutral markers, starting player, score order, resources | Shared score/starting-player rail and personal resource pieces | Public player state and remaining neutral pools | [x] |
| p. 6 | Choose one starting hand card as initial income | Touch a real hand card, inspect it, then tuck it under the income card | `initial-income-card` | [x] |
| pp. 7, 19 | Round, active agency, passed agencies, next rotating disc, round-card count | TV status, agency rail, rotation pointer, and round-card stack | Public round/turn/pass/rotation state | [x] |
| all | Other agencies' public resources, computer, techs, income, missions, spacecraft, traces, and gold claims | Expandable TV agency mat made of authentic cards/tiles/pieces | Public player view without private hands | [x] |

## Turn structure and universal free-action timing

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 7; FAQ Q4 | Exactly one main action; free actions before, after, or between main-action steps | Printed player-board main-action regions remain distinct from touchable free-action pieces | `mainActionTaken` plus interruptible serialized resolution | [x] |
| FAQ Q4 | A free action cannot interrupt another free action | Current free action resolves before another free-action target accepts input | Resolution ownership/interrupt guard | [x] |
| p. 7 | Explicitly finish a normal turn | Tactile `END TURN` control, enabled only after a main action and completed mandatory effects | `end_turn` | [x] |
| pp. 18, 20 | No free actions during milestone/species resolution | Only the current physical milestone/species target remains interactive | `turnResolution` and typed pending queue | [x] |
| pp. 18, FAQ Q32 | Crossed player milestones resolve from current player clockwise; neutral last | One agency/tile/alien target at a time with visible order | Ordered milestone continuation | [x] |

## Probe actions and movement

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 8 | Launch one probe on Earth for 2 credits, respecting the probe limit | Touch/drag a probe from supply, then touch glowing Earth | `launch` | [x] |
| pp. 8-9 | Spend energy for movement; choose the probe and each orthogonally adjacent destination | Touch a probe, then a glowing adjacent cell; piece animates cell by cell | `move { pieceId, to, payment }` | [x] |
| pp. 8-9 | Pay an extra movement to leave asteroids unless upgraded | Affordability halo and energy pieces reflect the exact edge cost | `moveEnergyCost` | [x] |
| p. 9; FAQ Q20 | Split a multi-move effect among any probes and stop early when optional | After each step, all eligible probes lift again; compact finish control | Project/alien movement pending options | [x] |
| p. 9 | Choose energy or a movement-corner card as payment | Touch energy, or touch the physical movement corner then probe and destination | `payment.energy` / `payment.cardId` | [x] |
| FAQ Q21, p. 28 | Every visit, including a rotation push, gains printed publicity and may trigger visits | Piece follows the disc/bump and the visited object pulses | Geometry visit events | [x] |

## Orbit and land

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 10 | Choose a probe at a non-Earth planet and orbit it | Touch probe, then the glowing printed orbit arc | `orbit { pieceId, body }` | [x] |
| p. 11 | Choose a probe and planet or eligible moon to land on | Touch probe, then the glowing planet/moon space | `land { pieceId, body }` | [x] |
| p. 11; FAQ Q6-Q7 | Orbiter and tech discounts change the displayed landing cost, including moons | Cost ring on the physical destination | Legal target/cost projection | [x] |
| p. 11 | Choose either remaining Mars first-landing data reward | Touch one of the two printed Mars data spaces | `mars-first-data` | [x] |
| p. 11 | A moon has one space and requires moon technology unless a card overrides it | Occupied moons stop glowing; card-granted destinations glow only for that effect | Legal target/project pending | [x] |

## Scan and sectors

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 12 | Pay 1 credit + 2 energy and choose either mandatory Scan step first | Touch the printed telescope, then touch Earth or a physical row card in either order | Serialized Scan resolution | [x] |
| p. 12 | Place Earth's signal in its current sector | Earth-linked sector glows; touch the sector | `signal-sector` | [x] |
| p. 12 | Choose a row card and one of its two matching sectors; refill only after the entire Scan | Touch/drag one of the three real cards into a matching glowing sector | `signal-sector { row }` plus deferred refill | [x] |
| p. 17 | Earth-adjacent telescope redirects the Earth signal | Earth and its two adjacent sectors glow | Scan tech option + `signal-sector` | [x] |
| p. 17; FAQ Q40 | Discard one project or non-Exertian alien hand card for an extra matching signal | Touch the installed tech, then a real hand card, then a matching sector | Scan tech/card/sector continuation | [x] |
| p. 17 | Spend 1 publicity for an extra Mercury-sector signal | Touch the installed tech/publicity piece, then Mercury's sector | Scan tech continuation | [x] |
| p. 17; FAQ Q25 | Spend 1 energy to launch or gain one movement during Scan | Touch the installed tech, then probe supply or a probe/destination | Scan tech continuation | [x] |
| pp. 12-13 | Mandatory excess signals remain legal and contribute to majority | Full sectors keep a target halo and accept the marker | Signal reducer | [x] |
| p. 13 | Choose the resolution order of multiple completed sectors | Touch one completed physical sector at a time | `completed-sector-order` | [x] |
| p. 13 | Majority/latest-marker tie break, winner reward, contributor publicity, second-place carryover | Sector strip visibly resets and preserves the second-place marker | Automatic sector resolver | [x] |

## Computer and Analyze

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 14 | Place one pool data into the leftmost top-row space as a free action | Touch the data cube, then the one glowing computer space | `place_data { slot }` | [x] |
| p. 14 | Resolve publicity and optional income spaces when covered | Covered printed icon pulses; income waits for a real card or compact skip | Top-space reward / `tuck-income-card` | [x] |
| pp. 16-17; FAQ Q22-Q23 | Put a computer tech in any of four physical slots; an occupied top space gives no retroactive 2 VP | After choosing the tile, touch one of four glowing computer slots | `computer-tech-slot` | [x] |
| p. 17 | A computer tech replaces its aligned top space with 2 VP and unlocks its lower space only while the top is filled | Exact installed tile under the aligned top space; lower socket glows conditionally | Computer board-slot state | [x] |
| p. 17 | Choose any eligible lower tech space and resolve that tile's printed reward | Touch a glowing lower socket on the authentic tile | `place_data { slot }` | [x] |
| p. 14 | Analyze for 1 energy when all six top spaces are filled; clear every top/lower data and choose a blue trace | Touch the printed Analyze core, then a glowing blue alien space | `analyze`, then `trace-space` | [x] |

## Cards, income, purchases, and exchanges

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 15 | Inspect a card without committing it; then choose its main effect | Tap for a 370x540+ authentic closeup and a separate `PLAY MAIN` target | `play_card { cardId }` | [x] |
| pp. 7, 15 | Use a card for exactly one purpose | Played/discarded/tucked card visibly leaves the hand and cannot serve another purpose | Card zone reducer | [x] |
| p. 15; FAQ Q3 | Resolve the complete printed white effect left-to-right before the card becomes a mission | Serialized card-resolution stack | Project/alien runtime | [x] |
| p. 15; FAQ Q28-Q29 | Conditional completion is optional; one emitted trigger can cover at most one eligible circle globally | Touch an eligible face-up mission/circle or compact skip; no auto-pick | Conditional/trigger pending | [x] |
| p. 6 | Income increase may be skipped; otherwise choose any project or non-Exertian alien card and gain its corner immediately | Touch a real hand card and drag/touch it under income, or compact skip | `tuck-income-card` | [x] |
| p. 18 | Buy a row/deck card for 3 publicity | Touch the real row card or face-down deck; cost ring appears | `buy_card { source }` | [x] |
| p. 18; back FAQ | Exchange two same-kind resources, including project/alien cards but never Exertians, for a resource or row/deck card | Touch two matching pieces/cards, then the desired resource piece or physical card source | `exchange` | [x] |
| p. 19 | Any row card taken outside Scan refills immediately; Scan refills after the whole effect | Physical empty slot refills at the correct continuation boundary | Row refill scheduler | [x] |
| p. 19 | Hidden deck order stays hidden while the full catalog remains inspectable as reference | Face-down deck plus separately labeled reference library | Redacted deck and non-stateful catalog modal | [x] |

## Research technologies

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 16; FAQ Q3/Q47 | Pay 6 publicity and rotate before choosing a technology | Touch printed Research; exact disc animates; only then do eligible stacks glow | Begin Research then `tech-stack` | [x] |
| p. 16 | Choose any one of the twelve unowned technologies; card-granted tech restricts type and is free | Touch a physical stack; unavailable/owned stacks remain inert | `tech-stack` | [x] |
| p. 16 | Gain the visible top reward, remove first-take 2 VP if present, then install the exact tile | Stack top and 2 VP chip update; the installed authentic face replaces the taken stack face | Public top tile and owned tile id | [x] |
| p. 16 | A card still rotates even if no eligible tech remains | Disc rotation occurs before the empty choice is skipped | Project runtime | [x] |

## Pass, rounds, milestones, and final scoring

| Source | Required decision | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 19 | Commit Pass only after any desired free actions | Touch the physical round-card/rotation area or compact Pass control | `pass` | [x] |
| p. 19 | Discard to four before rotation | Touch exactly the excess real hand cards; Exertians are excluded | `discard-to-four` | [x] |
| p. 19 | First passer rotates after discard, including round 5 | Rotation pointer advances and the exact disc transitions before cards | Pass continuation | [x] |
| p. 19 | In rounds 1-4 choose one authentic end-round card; last passer discards the leftover | Touch one card from the physical fan | `end-round-card` | [x] |
| p. 19 note | Earlier passer may delay the card choice until another player passes | Nonblocking private card fan that must settle before the next passer chooses | Deferred pass-card continuation | [x] |
| p. 19 | Income, then starting-player marker exactly one seat clockwise; pass order is irrelevant | Income piece counts update, then the starting marker appears at the clockwise agency | Round transition | [x] |
| p. 18 | Each player crossing 20/30 consumes at most one remaining neutral marker; marker goes to the leftmost empty discovery space | Marker leaves the neutral supply and appears in the exact leftmost discovery socket | Per-player neutral flags and remaining pools | [x] |
| pp. 18, 21 | At 25/50/70 choose a different gold tile and occupy the next value; score units times that claim-time value | Touch an unclaimed physical gold tile; marker lands on exact value | `gold-tile` with stored points-per-set | [x] |
| p. 21 | Final project/alien scoring, gold sets, alien scoring, and shared ties | Final table expands each score source with authentic card/tile art | Deterministic final scorer/view | [x] |

## Discovery and all five alien modules

| Source | Required decision or information | Physical UI affordance | Engine action/pending contract | Gate |
|---|---|---|---|---|
| p. 20 | Choose any legal matching discovery/research space or voluntarily choose either species' overflow | Touch the exact glowing socket on one of the two alien boards | `trace-space` | [x] |
| p. 20 | Reveal only after milestones at end of turn; reward discovery markers, not overflow | The face-down board is replaced by its authentic front/module; rewarded sockets resolve in marker order | Species continuation | [x] |
| all species | Draw from face-up alien card or hidden deck when granted | Touch the face-up alien card or physical alien deck | `alien-card-source` | [x] |
| Mascamites | Collect a hidden sample only through a sample card; choose planet/sample and place a capsule marker | Touch planet/sample token, then the moved capsule | Alien project pending | [x] |
| Mascamites | Move capsules like probes but never orbit/land/count toward limit; choose which mission to deliver at destination | Touch capsule and cells; then touch eligible mission and capsule | Move/deliver sample actions | [x] |
| Mascamites | Reveal delivered token/reward and add it as a public blue research space | Token front is revealed and appears in its blue board socket | Mascamite module state | [x] |
| Anomalies | Three exact anomaly positions/sides; after every rotation, Earth-aligned anomaly rewards the highest marked trace in its column | Physical anomaly tokens, aligned position, winning column markers, and mission-log result | Rotation hook | [x] |
| 'Oumuamua | Physical disc-3 tile, data, signals, exofossils, visit publicity, orbit/land, and sector-or-tile signal choices | Tile/data/exofossils update in place; valid destination(s) glow | Oumuamua module + signal pending | [x] |
| Centaurians | Message milestones 15 VP ahead, oldest first; choose one still-available shared reward | Physical score-track message token and reward socket | `centaurian-reward` | [x] |
| Centaurians | Pay data only from pool for board spaces; repeatable top spaces remain touchable | Pool data and eligible board socket glow | Trace reducer | [x] |
| Exertians | Private three-card deal plus discovery bonus, optional immediate face-down plays, first/second milestones and second cost | Owner sees authentic hand cards; table shows only card backs/count; milestone/cards glow at the right time | `exertian-card` and redaction | [x] |
| Exertians | Public danger traces, hidden card danger until end, one-tenth loss after all other scoring | Board danger icons/markers, then endgame reveal and exact loss in the final breakdown | Exertian final scorer | [x] |

## Solo rival

| Source | Required decision or information | Physical UI affordance | Engine/view contract | Gate |
|---|---|---|---|---|
| pp. 22-23 | Difficulty-specific rival board, objective composition, three active objective tiles, action deck, progress, publicity, computer, data, techs | Expandable authentic rival board and physical decks/tiles/tokens | Public solo view | [x] |
| pp. 24-26 | Reveal action card, show decision arrow, first legal action, exact movement/scan/trace/tech priority, then discard | Physical current action card beside the rival board; resulting physical pieces and markers update | Automatic rival runtime | [x] |
| p. 26 | If one trigger can mark multiple objective tasks, choose exactly one; mission may also trigger independently | Open rival board and touch the exact task icon on one physical objective | `solo-objective-task` | [x] |
| pp. 23-26 | Rival progress crossings add an advanced card to the top; rival passes only with empty deck; first pass rotates and card becomes progress | Deck/progress/round-card animations | Solo round continuation | [x] |
| pp. 24-26; FAQ S.15-S.19 | All five alien-specific rival action cards and species exceptions | Authentic species action card and resulting physical module state | Solo species runtime | [x] |
| p. 26 | End rounds 1-4 spend 1/2/3/4 completed objectives or advance 3 per missing; end round 5 score 5 per uncompleted objective except difficulty 1 | Objective tiles update to spent state; progress marker transitions and final points update | Solo round/endgame scorer | [x] |

## Reverse action-contract audit

The final audit must be regenerated after the engine union stabilizes. Every
field below must be supplied by a real gesture and must not be silently chosen
by the client:

| Action/choice field | Gesture source | Gate |
|---|---|---|
| `move.pieceId`, `move.to`, `move.payment` | touched piece, touched cell, touched energy/card corner | [x] |
| `orbit/land.pieceId`, `body` | touched probe, touched printed destination | [x] |
| `place_data.slot` | touched pool data, touched computer socket | [x] |
| `research/tech-stack` and computer board slot | printed Research, physical stack, physical computer slot | [x] |
| `play_card/discard_for_corner.cardId` | touched authentic hand card and face/corner commitment | [x] |
| `complete_alien_mission/deliver_sample` ids | touched mission and physical capsule | [x] |
| `buy_card.source` | touched real row card or deck | [x] |
| `exchange.give/receive/cardIds/row` | touched pieces/cards and physical destination/source | [x] |
| Every `SetiChoice` variant | matching card/sector/space/tile/number/compact optional finish target | [x] |

## Runtime evidence satisfied

- [x] Directed engine suites for every row above, every FAQ card entry, all
  five alien modules, and solo S.15-S.19.
- [x] Seeded complete engine games for 1/2/3/4 players and solo difficulties
  1-5, with conservation, redaction, JSON round-trip, and deterministic replay.
- [x] Live WebSocket full-game smoke after restarting the shared engine server.
- [x] DOM-only four-seat full game at 1024x768; no raw gameplay actions.
- [x] DOM-only solo full game; no raw gameplay actions.
- [x] TV and device screenshots for setup, movement, rotation/bump, orbit,
  land, Scan, Analyze, Research, both species reveals, milestones, round income,
  solo rival, and final scoring.
- [x] Zero console errors; zero page scroll at 1024x768; all interactive targets
  at least 40 px; card closeup at least 370x540.
- [x] Client/shared/server typecheck, build, all tests, and `git diff --check`.
