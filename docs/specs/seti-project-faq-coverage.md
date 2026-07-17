# SETI project-card FAQ coverage

This is the machine-backed coverage index for every base/promo project entry on
pages 12-26 of the bundled official FAQ. The exact inventory is exported as
`SETI_PROJECT_FAQ_RUNTIME_COVERAGE` from `shared/src/seti/projectCatalog.ts` and
is asserted by `project-catalog-test.ts`. Every listed card is part of the
140-card typed-catalog/executor sweep; the behavior column identifies the FAQ
rule that the runtime must preserve.

| FAQ page | Cards | Runtime/FAQ behavior covered |
|---|---|---|
| 12 | #1 Pioneer 11, #2 Mariner 10, #3 Voyager 2, #4 Galileo | Zero-cost cards are still main actions; visits must occur after the mission is active; one global mission space per emitted visit. |
| 12 | #9 Falcon Heavy | Two free launches ignore the probe limit only for those launches. |
| 12 | #11 Grant | Draw first, then discard that exact drawn card and resolve its free corner. |
| 12 | #15 Atmospheric Entry | Remove a chosen owned orbiter; removing the first/reward-space orbiter reopens that physical space. |
| 13 | #16 Dragonfly | A free landing may use an occupied planet/moon space and still gains the covered reward. |
| 13 | #17 OSIRIS-REx | Choose any owned probe; score on-space and orthogonally adjacent visible asteroids independently. |
| 13 | #19 Gravitational Slingshot | For every planet visit for the rest of this turn, choose publicity or one movement; later free-action movement qualifies. |
| 13 | #20 Mercury Flyby, #21 Venus Flyby, #22 Mars Flyby, #23 Jupiter Flyby, #24 Saturn Flyby | Visit means moving onto the printed planet; the once-per-card reward is evaluated after the ordered movement effect. |
| 14 | #25 Lightsail | Count each unique planet visited this turn once, explicitly including Earth. |
| 14 | #26 Through the Asteroid Belt | Asteroid exit restrictions are ignored for the turn. |
| 14 | #27 Hubble, #28 Kepler, #29 James Webb | Move first; select one probe on the solar board; bind all signals to its sector (#28) or its sector plus each neighbor exactly once (#29). |
| 14 | #30 Great Observatories Project | Select zero to three distinct probes of any owner; each selected probe's current sector receives one signal. |
| 14 | #45 Allen Telescope Array, #46 ALMA, #47 Very Large Array | Discard/mark both row cards before refill; evaluate sector completion before the printed follow-up reward. |
| 15 | #50 Square Kilometre Array | Discard/mark all three before refill; score distinct sectors, not marker count. |
| 15 | #51 Lovell, #52 Parkes, #53 Deep Synoptic Array, #54 VERITAS, #55 Arecibo | A card-granted Scan waives only 1 credit + 2 energy; both base Scan elements and every owned telescope tech remain available at their printed optional costs. |
| 15 | #58 Uranus Orbiter and Probe, #60 Trident Probe | Conditional mission presence includes the planet's moons (official correction). |
| 16 | #65 FAST | Resolve two row signals and refill before rotating/researching; tile-draw rewards see the refilled row. |
| 16 | #67 Yevpatoria | Research first, then optionally discard one hand card for its matching signal. |
| 16 | #73 Clean Space Initiative, #74 Pre-launch Testing | #73 discards all three row cards even if movement is skipped and does not count as a hand-corner trigger; #74 counts matching corners shown in the complete ordinary hand, including alien cards. |
| 16 | #78 SETI Institute, #79 ISS, #80 Cape Canaveral | Each Scan/Launch emission offers one globally chosen unclaimed reward; spaces may be claimed in any order. |
| 16 | #81 International Collaboration | Do not rotate; choose only a stack researched by another player; skip the ordinary tile bonus while retaining the Probe Launch or telescope's intrinsic 2 data. |
| 17 | #84 Sample Return | Remove a chosen owned lander from a planet/moon; removing a reward-space lander reopens that physical space. |
| 17 | #88 Chandra | Both signals bind to one selected probe sector; the four-current-sector condition is offered before completed-sector cleanup. |
| 17 | #89 NIAC | Resolve the draw-three main effect before the mission becomes active; ordinary alien cards count in hand, Exertians do not. This also reflects the 2025-11-11 living-FAQ ruling. |
| 17 | #91 Fusion Reactor, #92 NASA Image of the Day, #93 Government Funding | Count pre-existing matching income cards (including alien income), then optionally tuck this card and gain its printed income immediately. |
| 17 | #98 Coronal Spectrograph, #99 Electron Microscope, #100 Exascale Supercomputer | The new trace must be placed for a species where the player already has the required same-color trace. |
| 18 | #101 Telescope Time Allocation | A Scan emits one global trigger; its chosen extra signal resolves before completed-sector cleanup. |
| 18 | #103 Westerbork | Two wins must be on the same sector, not merely two wins total. |
| 18 | #106 Strategic Planning | Printed-cost 1/2/3 project plays trigger the matching space only after the played card's complete main effect. |
| 18 | #107 First Black Hole Photo | Each blue trace emission offers one globally chosen unclaimed blue-trace reward. |
| 18 | #112 Planetary Geologic Mapping | Orbiter/lander pairing accepts a moon lander in the same planetary system (official correction). |
| 19 | #113 Solvay Conference | Choose an unmarked gold tile and score `units × lowest/rightmost value`; do not create a gold claim. |
| 19 | #114 Planet Hunters | Draw first, then discard zero to three ordinary hand cards sequentially for their signal corners. |
| 19 | #116 Control Center | Yellow/red/blue signal emissions each offer one globally chosen matching movement space. |
| 19 | #117 Lunar Gateway | Either Orbit or Land can claim either printed reward, but a single emitted action covers only one space. |
| 19 | #118 PLATO | All three markers bind to one selected probe sector and return replaced data to supply instead of gaining it. |
| 20 | #119 PIXL | Research/rotate first, apply its technology reward, then score current publicity. |
| 20 | #120 Orbiting Lagrange Point | Evaluate exactly one own current signal in the selected probe sector before sector cleanup; returning the resolving card preserves conservation. |
| 20 | #122 Amateur Astronomers | Reveal/discard one deck card and place its mandatory matching signal, sequentially, three times. |
| 20 | #123 Asteroids Flyby, #124 Cometary Encounter | A visible-feature visit during the turn qualifies; each card's reward is paid once even after repeated visits. |
| 21 | #125 Trajectory Correction | At least one move within the same ring this turn qualifies. |
| 21 | #126 Euclid Telescope Construction | Choose Probe or Telescope, rotate once, then score owned Computer techs. |
| 21 | #127 NEAR Shoemaker | End-game condition uses the probe's final top-visible asteroid location after all rotations. |
| 21 | #128 Advanced Navigation System | Every non-Earth planet visit offers one global choice among its remaining spaces. |
| 21 | #129 Asteroids Research | A visible-asteroid visit triggers only on the mission owner's turn; the owner's research/pass rotation can qualify, another player's rotation cannot. |
| 22 | #133 Optimal Launch Window | Count only other planets/comets radially in front of Earth, maximum three; never count Earth itself. |
| 22 | #134 Herschel Space Observatory | Current living card marks one signal in an owned-probe sector; evaluate four current sectors before cleanup. |
| 22 | #135 Noto Radio Observatory | Gain publicity, then perform the complete cost-waived Scan with optional telescope costs intact. |
| 22 | #136 Algonquin Radio Observatory | Place one signal of each printed color; replaced data returns to supply and no data is gained. |
| 22 | #138 Cornell University | Only discarding a card from hand for its free-action corner qualifies; matching ordinary alien corners qualify. |
| 26 | Promo CardID 204700, Not a Planet Since 2006 | Permanent owner-only Pluto spaces, exact costs/rewards/capacities, outer-ring requirement, landing discount, and planet-counting semantics. |

The optional `Gateway to Mars` promo (CardID 41500) is also fully typed and
covered by the 140-card sweep. It is not listed in the bundled November 2024
FAQ pages, so it is intentionally outside the 75-entry FAQ inventory.
