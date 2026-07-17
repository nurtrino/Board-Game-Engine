# SETI pending-decision visual contract audit

Status: **resolved for the current 18-kind pending-decision inventory**.

Every current `SetiPendingDecision` kind has a visual route that preserves its
exact reducer option identity. Authored choices resolve through a direct table
component, a purpose-built authentic-art surface, or an automatic engine
continuation. Compact `skip`, `done`, and multi-select confirmation controls are
used only where they complete a physical interaction.

This is the pending-decision reachability contract. It does not replace the
broader rulebook, responsive-layout, animation, or full-game browser gates in
`docs/specs/seti-ui-coverage.md`.

## Audited implementation surfaces

- `shared/src/seti/state.ts` — exhaustive pending union, legal targets,
  owner-only redaction, and deferred end-round-card view projection.
- `shared/src/seti/actions.ts` — exact choice payload validation and pass-card
  ordering.
- `shared/src/seti/projectExecutor.ts`, `alienRuntime.ts`, and
  `soloRuntime.ts` — serialized producer grammars and automatic continuations.
- `client/src/seti/setiView.ts` — pending-option hydration from legal targets.
- `client/src/seti/setiPendingPresentation.ts` — direct component descriptors,
  exact option indexes, full mapped-index coverage, and collision handling.
- `client/src/seti/SetiPendingArtifacts.tsx` — authentic-art renderers for
  decisions that do not live on a persistent table component.
- `client/src/seti/SetiPlay.tsx`, `SetiScene.tsx`, and `SetiSoloRival.tsx` —
  direct gestures and exact target callbacks.

## Status vocabulary

| Status | Meaning |
|---|---|
| **Direct** | The player touches the persistent physical component that represents the option. |
| **Specialized** | A purpose-built surface presents authentic card, board, or token art with exact hotspots. |
| **Automatic** | The engine consumes the continuation; it is never presented as a player option. |

## Exhaustive 18-kind matrix

| Pending kind | Exact option grammar | Current visual contract | Evidence |
|---|---|---|---|
| `initial-income-card` | visible project card ID | **Direct.** Inspect/touch the real hand card and tuck it into the income lane. | Hand-card mapping and `choose_initial_income` payload in `SetiPlay.tsx`. |
| `discard-to-four` | exactly `count` project or non-Exertian alien card IDs | **Direct staged multi-select.** Each real hand card toggles visibly; the choice commits only when exactly `count` cards are selected and confirmed. | `pendingChosen`, `pendingPick`, and the staged `cards` payload; anchored by `seti-pending-visual-contract.mjs`. |
| `end-round-card` | card IDs in the current round-end fan | **Specialized.** Authentic project faces render as a touchable fan. The private fan may remain open while another eligible player acts, then becomes the barrier before the next passer chooses. | `SetiPendingArtifacts` end-round model; shared `core-flow-test.ts` deferred-pass test and `solo-runtime-test.ts` rival-order test. |
| `signal-sector` | sector IDs; project-row variants also preserve a row index | **Direct.** Touch Earth/effect sectors or choose/drag the exact project-row card and then touch a matching sector. | Row and sector descriptors in `setiPendingPresentation.ts`; exact row is carried by `pendingAction`. |
| `completed-sector-order` | sector IDs | **Direct.** Touch the next completed physical star sector. | Sector target mapping and direct cue coverage. |
| `trace-space` | exact alien-board space IDs | **Direct.** Touch the glowing discovery, research, or overflow socket. | `traceTargets` and `onTrace` exact-space callback. |
| `gold-tile` | gold tile IDs | **Direct.** Touch the exact tile in the physical gold rack; the target emits the tile ID. | `seti-board-targets-test.ts` verifies target identity and 40px hit areas. |
| `tech-stack` | technology stack IDs | **Direct.** Touch the glowing physical stack after Research rotation. | Pending stack hydration into `techStackTargets`. |
| `computer-tech-slot` | numeric board slots `0..3`, aligned to printed top spaces `0, 1, 3, 5` | **Direct.** Touch one legal printed computer position on the personal board; the descriptor retains the original numeric option. | `computerTechChoices` assertions in `seti-pending-presentation-test.ts`. |
| `mars-first-data` | remaining printed numeric data values | **Direct.** Touch the exact physical Mars data token; its printed amount is emitted. | `seti-board-targets-test.ts` verifies value identity, distinct fan offsets, and 40px targets. |
| `tuck-income-card` | visible project/non-Exertian alien card IDs, optionally `skip` | **Direct.** Touch/drag the real card into income; optional skip remains compact. | Hand-card pending mapping and exact card payload. |
| `card-effect-choice` | typed producer grammar described below | **Direct or Specialized.** Every authored grammar is routed to its physical component or authentic-art renderer while preserving the original option index. | Presentation and artifact suites; full mapped-index contract. |
| `alien-card-source` | `face-up:<cardId>` and/or `deck` | **Direct.** Touch the authentic face-up alien card or face-down species deck. | Alien card/deck descriptors and `SetiScene` callbacks. |
| `centaurian-reward` | `reward:<index>` | **Specialized.** Authentic Centaurian board art exposes the exact unclaimed printed reward sockets. | `seti-pending-artifacts-test.ts` verifies reordered reducer indexes and reward sockets. |
| `exertian-card` | `skip` or `<creditCost>|<alienCardId>` | **Direct.** Touch the private Exertian card; skip is compact and payment remains attached to the card choice. | Exertian parsing in `setiPendingPresentation.ts` and owner-only pending redaction. |
| `solo-objective-task` | `<objectiveId>|<taskIndex>` | **Specialized.** Touch the exact eligible task circle over authentic objective art. | `SetiSoloObjectiveDecision`; contract asserts exact option identity is preserved. |
| `project-visit-reward` | `publicity` or `move` | **Specialized.** Authentic source-project art presents the printed publicity and movement regions. | Reordered semantic-index assertions in `seti-pending-artifacts-test.ts`. |
| `manual-trigger-choice` | `claim|<cardId>|<slotId>`, `complete|<cardId>`, or `skip` | **Direct.** Every eligible printed mission circle has its own stable hotspot; completion has a separate card region and skip stays compact. | `missionChoices`, unique `missionTargetIndexes`, and rendered `.seti-mission-slot-target` contract. |

## `card-effect-choice` visual grammar coverage

`card-effect-choice` is a transport union, not one generic menu. The current
authored grammars are mapped as follows.

| Producer grammar | Visual route | Exactness guarantee |
|---|---|---|
| Project deck/row draw (`deck`, `row:<index>`) | **Direct** project deck and row cards | Preserves source row/deck identity. |
| Visible hand, drawn, discard, or tuck card IDs | **Direct** real cards | Emits exact card IDs; multi-card choices stage to required cardinality. |
| Resolving-card tuck (`skip`, source card ID) | **Specialized** authentic card plus income path | `tuck-income` artifact preserves tuck and skip indexes even if reordered. |
| Optional piece/cell movement | **Direct** probe/capsule followed by a glowing legal cell | Preserves piece ID, cell ID, and encoded movement cost. |
| Free orbit/landing and occupied-space replacement | **Direct** piece, body region, or exact placed spacecraft | Preserves action, piece, body, and occupied spacecraft ID. |
| Remove a placed spacecraft | **Direct** exact orbiter/lander | Uses stable placed-spacecraft identity, never a planet-name approximation. |
| Serialized Scan step | **Direct** Earth, project row, or exact installed telescope technology | `scanStepChoices` maps every step key and the final `done`; no step is hidden by a partial mapping. |
| Scan energy branch (`launch`, `move`) | **Direct** launch bay or real probe | Selected probe is carried into the following movement step. |
| Trace color (`purple`, `orange`, `blue`) | **Specialized** physical trace tokens/lanes | `trace-color` artifact retains original reducer indexes. |
| Sector choice | **Direct** exact star sector | Covers ordinary and together-signal effects. |
| 'Oumuamua destination (`sector:<id>`, `tile:<slot>`) | **Direct** sector or exact module signal socket | `oumuamuaTileChoices` and `onOumuamuaTile` preserve the tile slot. |
| Mascamite sample and body-qualified sample | **Direct** exact face-down sample token | Preserves body and token order/sample identity. |
| Mascamite qualifying probe | **Direct** qualifying probe | Selects the real capsule/probe before any following sample step. |
| Exofossil movement quantity (`0..held`) | **Specialized** authentic exofossil token stacks | `exofossil-quantity` retains both amount and reducer index. |
| Exofossil spend/skip | **Specialized** token-spend surface | `exofossil-spend` shows the physical token versus compact zero/skip. |
| Triggerable alien mission reward (`reward:<index>`) | **Specialized** hotspots over authentic alien card art | Emits the exact printed reward index. |
| Alien printed branch (numeric effect index) | **Specialized** hotspots over authentic alien card regions | Emits the exact authored effect index. |
| Automatic alien continuation (`continue`/activation keys) | **Automatic** | `settleSetiAlienAutomaticContinuations` consumes it before player input. |

## Mapping and collision invariants

The direct presentation layer builds `mappedIndexes` from every concrete
descriptor and derives `unmappedIndexes` for all remaining substantive
options. A pending prompt is treated as fully direct only when every option is
mapped or is an explicit finish control. Therefore:

1. one mapped target cannot hide an unmapped sibling;
2. two reducer options cannot silently collapse onto one component;
3. mission reward circles use stable `cardId + slotId` target identities;
4. the generic fallback remains visible for an unknown future grammar;
5. `pendingPick` honors `count`, `required`, `max`, and `min`, while staged
   selection prevents early multi-select commits;
6. every specialized artifact carries the original reducer array index rather
   than reconstructing a choice from its label.

## Specialized authentic-art inventory

`SetiPendingArtifacts` currently provides nine purpose-built models:

- end-round project-card fan;
- project visit publicity/movement regions;
- resolving-card tuck-to-income path;
- three trace-color lanes;
- exofossil quantity stacks;
- exofossil spend/skip;
- Centaurian board reward sockets;
- alien mission reward circles;
- alien printed-effect regions.

Every artifact option inherits a minimum 40-by-40-pixel hotspot. Persistent
table components use their own tested 40px target contracts.

## Verification contracts

The audit is executable rather than documentary-only:

- `node tools/verify/seti-pending-visual-contract.mjs` compares this matrix to
  the `SetiPendingDecision` union and currently reports all **18** kinds. It
  also anchors legal-option hydration, mission/scan/computer descriptors,
  multi-card staging, specialized-artifact integration, and solo task identity.
- `npm run test:seti --workspace client` runs:
  - `seti-pending-presentation-test.ts` — exact direct descriptors, full-index
    coverage, collision behavior, mission circles, Scan, computer positions,
    samples, movement, and 'Oumuamua sockets;
  - `seti-pending-artifacts-test.ts` — semantic classification, reordered
    option indexes, tuck-income, trace, exofossil, Centaurian, alien-card art,
    SSR safety, and 40px hotspots;
  - `seti-board-targets-test.ts` — gold, Mars, Scan Earth, spacecraft, alien,
    sector, responsive, and noninteractive-TV target contracts.
- `npm run test:seti --workspace shared` includes the deferred pass-card tests:
  an earlier passer's choice remains private and nonblocking, the next passer
  cannot choose ahead, the final choice gates round transition, and the solo
  rival cannot remove its pass card first.

## Acceptance contract

- Every current pending option index has exactly one direct target,
  specialized authentic-art target, or explicit compact finish control.
- Every touch emits the exact engine value, including mission `slotId`, project
  row, computer board slot, occupied spacecraft ID, sample identity, movement
  cost, Mars amount, gold tile ID, and 'Oumuamua tile slot.
- Multi-select decisions remain visibly staged and commit only at their exact
  required cardinality.
- Owner-only decisions remain redacted; a deferred end-round fan does not block
  another eligible player's turn.
- No current pending path depends on a long written list of gameplay options.
