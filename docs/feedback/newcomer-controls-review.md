# Newcomer Controls Review — all games

An extensive, in-character usability review of every playable game (Brass, Ticket
to Ride, Trekking, Dark Tower, Dune), written from the point of view of a confused
first-time player sitting in the room. Each game was reviewed by an agent given
the persona below, judging **only the on-screen controls** — buttons, labels,
copy, prompts, numbers, legends, empty/error states, the intro/tutorial, and the
TV board from across the room.

**Hard scope constraint:** the reviewer could critique anything EXCEPT the 3D
rendered model of the board / personal mat itself (the rendered pieces and board
surface are fixed). Where the 3D view is confusing, the fix is always a label,
caption, legend, or HUD element *around* it — never a change to the model.

Produced by five parallel review agents reading each game's device UI, TV board,
and intro copy. Nothing here is applied yet — this is the punch-list.

---

## The persona (reusable prompt)

> You are a first-time player who just sat down in someone's living room to play a
> board game you don't really know. Adopt this mindset completely and never break
> character:
>
> - You do NOT know this game's rules, terms, icons, or strategy. You've maybe
>   heard the name. Treat every game-specific word as unfamiliar jargon unless the
>   screen plainly explains it right there.
> - You are a normal person, not a developer or designer. You react like a
>   confused guest: "wait, is it my turn?", "what does this button do?", "what's
>   this number?", "what am I supposed to tap?"
> - You only judge what's actually on the screens in front of you: your personal
>   device (a tablet/phone controller) and the shared TV showing the board. You
>   cannot read a rulebook mid-turn and you shouldn't have to.
> - At every moment you want to answer, without asking a human: (1) Whose turn is
>   it / is it mine? (2) What am I allowed to do right now? (3) What does each
>   button/label/number/icon mean? (4) How do I actually take my turn, step by
>   step? (5) What just happened after I tapped, and what happens next?
> - Whenever the interface assumes knowledge you don't have, uses an unlabeled
>   icon/number, hides an action, uses jargon, or leaves you unsure what to do, you
>   flag it, and you quote the exact on-screen text/label so it can be found.
>
> THE ONE RULE ABOUT YOUR FEEDBACK: You may critique anything EXCEPT the 3D
> rendered model of the board / your personal mat itself. Everything else is where
> all your feedback should go: button labels, wording, copy tone, layout, ordering
> of steps, prompts, help/tooltip text, what the tutorial explains, legends for
> icons, labels/captions around the 3D view, colors, empty/waiting/error states,
> and the intro. If the 3D model itself is confusing, do NOT ask to change the
> model, instead suggest a label, legend, caption, or HUD element around it that
> would clear it up.

---

## Cross-game patterns (the fixes that recur in every game)

These came up independently in 4–5 of the 5 reviews. Fixing them once, as shared
conventions, would lift every game at once.

1. **The "Walk me through the interface" button only works for Dune.** Four
   independent reviewers found that `BRASS_INTRO`, `TTR_INTRO`, `TREK_INTRO` and
   `DT_INTRO` have no `walkthrough` array and their play components never pass
   `onWalkthrough`, so the button never renders — every game except Dune drops a
   newcomer into a cold interface with only a wall of rules text. The stepped-teach
   framework already exists; it just isn't wired up. **This is the single biggest
   gap across the whole app.** (Verify per game before acting, but the reading is
   consistent.)

2. **Hover tooltips are invisible on the actual hardware.** Every game leans on
   `title="…"` attributes to explain icons, abbreviations, and help buttons — and
   the devices are tablets with no hover. The "?" help buttons, the influence-pip
   meanings, the `w/g/f` and `s/sp/w/g/i` stat abbreviations, the pegasus "extra
   action," the route-shape legend: all hover-only, all unreachable on touch.
   Replace with visible labels or tap-to-explain.

3. **"Whose turn / what do I do now" is under-stated on the device.** The turn
   status is usually one small, dimmed line. Newcomers want a loud, persistent
   banner: "YOUR TURN — do X" vs "Waiting for {name}." Several games also mix the
   player's **name** and their raw **color** for the same person in different spots
   ("Purple is acting" vs a name-based turn pill).

4. **Disabled buttons never say why.** Across all five games, illegal/unaffordable
   actions grey out with no reason (Dune is the exception now — it shows "· not
   enough water"). Newcomers read a greyed button as "broken." Every disabled
   control should state its reason.

5. **No post-action confirmation on the device.** After you tap, the result is
   narrated only on the TV. A player heads-down on their tablet doesn't know their
   move worked or what they got. A brief device-side "You did X, gained Y" closes
   this everywhere.

6. **Jargon labels with no inline gloss.** "Network"/"Develop"/"Scout" (Brass),
   "Reveal"/"persuasion"/"the Voice" (Dune), "harbor"/"exchange"/"pairs" (TTR),
   "trails"/"occupy"/"river" (Trek), "Haggle"/"Frontier"/"Sanctuary" (Dark Tower).
   Button labels are single theme words a newcomer can't decode, and the hint text
   often only appears *after* the button is armed.

7. **The score that decides the game isn't the number on screen.** Brass shows
   cash on the TV (VP is a tap away); Trek and Dark Tower show no running score at
   all until the endgame. A party game needs the winning metric visible to the room
   the whole time.

8. **The intro is a rulebook wall, not a first-move teach.** Every intro front-
   loads terms defined with other undefined terms, and none of them answer "what do
   I physically do on my very first turn?" The plain-language definitions that DO
   exist (e.g. Dune's "Solari is money, spice is the desert currency") are buried in
   a popup the player closes and forgets, instead of sitting on the chips/controls.

9. **TV stat rows are unreadable from the couch.** Abbreviated, hover-decoded stat
   strings (`4s 2sp 1w 3g 2i`, `20·40`, `3w · 5g · 2f · 1/4`) are illegible from
   across a room. Icons+numbers or a small always-visible legend would fix it
   without touching the 3D.

---

## Dune: Imperium

I sat down, someone handed me a tablet, and the TV lit up with a desert board. Here's everything that tripped me up, quoting exactly what's on the screens.

### 1. Opening the device — first 10 seconds
- The very first thing that happens is an intro popup (`DUNE_INTRO`) whose goal line reads: *"Reach 10 victory points, or lead when the last conflict is fought. Send agents to the board for resources, troops and influence. Reveal your hand to buy better cards and fight. Win conflicts for the biggest prizes."* That's four sentences with **six unexplained terms** (agents, influence, reveal your hand, persuasion later, conflicts) before I've seen a single button.
- Before the game even starts I may hit the **leader pick** screen: *"Choose your leader"* with subtext *"Each leader has a passive power and a signet-ring ability. Tap one to take it."* I have no idea what a "passive power" or a **"signet-ring ability"** is, and the images are the only thing to judge by. I'm picking blind. The explanation only appears *later* beside the conflict card, which is too late to choose.
- Once in the main screen, the top bar shows my color dot, name, leader name, **"0 VP"** and a lone **"?"** button — the only help affordance, unlabeled.
- Row of chips (Solari / Spice / Water / Garrison / Agents) and four faction bars. Nothing prominently says *"wait, not your turn"* or *"tap a card to start."* First impression: mild panic, lots of numbers, no clear "do this next."

### 2. "Is it my turn / what can I do right now?" clarity
- The whole game-state cue is **one small dimmed line** (`opacity: 0.6`) at the top of the left column. On someone else's turn: *"Alice is acting"*; on mine: *"Play a card for an agent turn, or reveal."* The most important info on the screen is styled like a faint caption.
- Status strings confuse: *"Play a card for an agent turn, or reveal"* (what's an "agent turn"?), *"Alice is deciding"* (deciding what?).
- **No persistent "IT'S YOUR TURN" banner** on the device. When it's not my turn, hand cards still look tappable but do nothing (`canAgent` false) with no explanation — I'd think the app froze.

### 3. Every button & label, one by one
- Clear-ish: `Solari/Spice/Water` chips, `Hand (5)`/`Intrigue (2)` counts, `Back/Close/Skip/Next/Done`, `End Turn`.
- **"REVEAL"** — the primary gold button; as a newcomer "Reveal" means nothing and sounds like it exposes my secret cards. No hint on the button.
- **"Garrison"** (military jargon → "Troops at home"), **"Agents"** showing `2+1` (the `+1` from Mentat is unexplained; looks like a typo), **"In fight"** (cryptic), **"Persuasion"**/**"Strength"** chips (jargon, appear conditionally).
- **"Liaison (2)"** / **"Spice Must Flow (9)"** reserve buttons — card names with no description.
- The agent-box toggle **"Card effect · pay 2 spice"** with **"PAYING"/"SKIPPING"** — clever but I don't understand what I'm paying for.
- Deck chips `Deck/Discard/Supply` — "Supply" actually means *troops not on the board*, but reads like "draw supply."
- **"Prescience · top of deck: …"** — flavor jargon for "peek at your top card."

### 4. Taking a full turn — where I'd get stuck
1. Status jargon ("agent turn") stalls me before I start.
2. Tapping a card swaps the whole screen to a space picker ("Send an agent with Dagger") — I lose sight of my resources/board.
3. Space reasons like *"· the Voice"* are meaningless (looks like a bug).
4. PAYING/SKIPPING toggle looks like part of the space cost.
5. **"Troops to deploy · only if you pick a combat space"** appears *before* I pick a space — setting a number for a thing I haven't chosen.
6. Tapping a space commits instantly, no confirm, no "you paid X / got Y" on the device — I have to eyeball chips.
7. Status flips to "End your turn" while I still have "Agents: 1" — I could end with agents unused; nothing says "1 agent left."
8. The forced **REVEAL** moment isn't signposted.
9. The acquire strip is card art + a bare number — buying blind.
10. Combat resolves on the TV; my device gives no win/lose summary.

### 5. Unexplained jargon, icons, numbers
- "agent/agent turn", "signet-ring ability", "persuasion", "the Voice", "Prescience", "Mentat", "High Council"/"Swordmaster", "control flag", "+1 Emperor"/"influenceAny", "2+1" agents, influence pips (meaning is hover-only `title`, invisible on tablet), the "★" alliance star (no legend), bare reveal-strip cost numbers, and the TV's `4s 2sp 1w 3g 2i 2/2 ag` + `EMP/GLD/BG/FRE` codes (hover-decoded, unreadable across the room).

### 6. Waiting / error / empty states
- Faint "Alice is acting/deciding/bids"; loading "Crossing the deep desert" (reads like an in-game action); raw server `error` toast with no friendly framing; tapping a card off-turn silently does nothing (no "not your turn" coaching).

### 7. Intro / walkthrough
- `DUNE_INTRO` is a dense rulebook wall that defines terms with other undefined terms and front-loads tiebreakers before turn one. The good plain-language line ("Solari is money…") should be *on the chips*.
- `DUNE_TOUR` (coach-marks) is genuinely better and highlights real elements, but it's buried behind the less-helpful popup, still jargon-heavy, ends on premature strategy tips, and never makes me *do* a real first action.

### 8. TV board from the couch
- Good: "Round 1 of 10", the center "Conflict" card, per-player "12 VP", the turn pill, the event caption.
- Bad: player stat rows (`4s 2sp…`, `EMP 1 GLD 0…`) are illegible; "First" tag is tiny; combat has no big "ALICE WINS THE CONFLICT" callout.
- The host **"Explain the board"** guide is the best teaching content in the game — but it's off by default and player devices can't reach it.

### 9. Top 10 fixes (Dune)
1. Loud, persistent turn banner on the device ("YOUR TURN — tap a card to place an agent (2 left), or Reveal").
2. Subtitle the "REVEAL" button and surface it only when out of agents.
3. Plain-language definitions on the chips (touch-friendly, not hover).
4. Device-side "you did X, got Y" after each action.
5. Fix influence-track legibility on touch; label the ★.
6. Reorder the space picker (troop count *after* choosing a combat space); plain-word blockers ("blocked by The Voice — an opponent's card banned this space").
7. Readable leader descriptions *before* you commit.
8. Default the TV "Explain the board" guide ON for round 1; make stat rows readable.
9. Lead onboarding with the interactive tour; cut the strategy/tiebreaker minutiae; add one guided first turn.
10. Inline-gloss the small jargon ("2+1", "Supply", "Prescience", "In fight").

---

## Brass: Birmingham

I sat down, someone handed me a tablet, and the TV lit up. I've never played this game.

### 1. Opening the device — first 10 seconds
- Intro titled **"Brass: Birmingham"**, tagline **"Build an industrial network across the Midlands over two eras."** "industrial network" and "eras" already mean nothing.
- Goal paragraph: *"Score the most victory points by building industries, flipping them through sales, and connecting your network with canals then rails."* — five unfamiliar terms in one sentence; **"flipping them through sales"** is baffling.
- Buttons **"Got it"** and **"Walk me through the interface"** — but Brass has **no walkthrough defined** and PlayPage passes no `onWalkthrough`, so that button likely never appears. My only lifelines are "Got it" and a tiny **"?"**.
- After dismissing: a board/mat, a card fan, a stats box, "?" and "Deck" buttons, and a column of seven action buttons — no anchor telling me where to look first.

### 2. "Is it my turn / what can I do?" clarity
- Good: a **"Your turn"** / **"[Name] is playing"** pill.
- **"Your turn · action 1 of 2"** helps — but round 1 says **"action 1 of 1"** with no explanation (looks like a bug).
- Not-my-turn prompt says **"Purple is acting"** (raw **color**, while the turn pill uses the **name** — two labels for one person).
- Seven buttons grey out off-turn with no "why." On-turn "idle" never says *what to actually do*.

### 3. Every button & label
- Seven one-word actions: **Build, Network, Develop, Sell, Loan, Scout, Pass.** Only Build/Loan/Pass are plain English.
  - **"Network"** — as a verb means nothing; it's "build a canal/railway."
  - **"Develop"** — hint *"remove a tile from your board."* **Develop = remove/destroy** is the opposite of the English word; most counterintuitive label in the app.
  - **"Scout"** — *"Discard 2 cards + 1 for the action; take the two wilds."* — "the two wilds" and the card math are a riddle.
  - **"Sell"** / **"Loan"** / **"Pass"** — "flip", "income falls 3 levels", "do nothing (but lose a card)" all under-explained.
- **Hints only show once a button is armed** — so the seven mystery words start hint-less.
- Stats: **Cash/Income/VP/Links** — "VP" unexpanded, "Links" a unitless number. **"SPENT THIS ROUND"** coins with no "£".
- Best labels in the app: the context confirm buttons — **"Play this card," "Discard & take the loan," "Build — £34."** More of this.

### 4. Taking a full turn — where I'd get stuck
- Tap Build → card picker with cards **dimmed to 28%** and **no reason why** (reads as broken).
- Picker blurb introduces "Location cards vs industry cards" and "inside your network" — brand-new distinctions I can't map to my cards.
- Flow bounces picker → my mat → the table board → a modal, each with a terse one-line prompt; glowing tiles/squares aren't named until *after* I tap.
- The **confirmBuild** cost breakdown ("Coal ×2 from connected mine free… Total £34 — you have £40") is the best screen, but "connected mine vs market" is unexplained.
- After "Build — £34" the flow just resets — no device-side "you built X."

### 5. Unexplained jargon/numbers
- "flip"/"flips face-up", "cotton/goods/pottery", "the two wilds", "canal/rail era", "income falls 3 levels", "Links", "VP", the **coin chips** (gold £15 / silver £5 / bronze £1, never stated), "action 1 of 2" variance, "from connected mine / market / iron works", and **"Beer"** (appears on the TV stat modal and in the Sell blurb but is never taught).

### 6. Waiting / error / empty states
- Off-turn greying with no "why"; "Connecting"/"Dealing…"; **"Hand hidden"** (a newcomer panics "where are my cards?").
- The proactive guard notices are a genuine strength in tone (*"You have nothing to sell — you need an unflipped cotton mill…"*) but dense with untaught jargon.

### 7. Intro / walkthrough
- All concept, no interface; *"Beer is consumed to sell"* comes out of nowhere. **There is no stepped walkthrough for Brass** even though the framework supports it — the biggest gap. The turn structure (7 actions, most cost a card, 2 actions/turn) is never explained.

### 8. TV from the couch
- Era/round plate and "[Name] to act" are readable. But score chips show **name + cash** — the most prominent number (cash) is NOT the winning metric (VP is a tap away); actively misleading.
- "flip"/"sell"/"sold" are three words for one concept across screens; **"Beer"** finally appears as a number with no explanation.

### 9. Top 10 fixes (Brass)
1. Add a real stepped walkthrough (framework exists, unused).
2. Relabel/subtitle jargon actions — priority **"Network → Build Link"**, **"Develop → Develop (remove a tile)"**.
3. Show action hints before a button is armed.
4. Explain why picker cards are dimmed.
5. Put VP on the TV score chips, not just cash.
6. Unify money display (label coin chips / add legend).
7. Unify vocabulary (flip/sell/sold; board/mat/map/table; color vs name).
8. Device-side result confirmation after acting.
9. Explain "action 1 of 2" (and round-1 "1 of 1").
10. Introduce/label invisible concepts (beer, coal/iron sources, income levels, wild cards) via a "?" glossary.

---

## Ticket to Ride: Rails & Sails

I sat down, someone handed me a tablet, and the TV lit up with a giant world map.

### 1. Opening the device — first 10 seconds
- Intro **"The World — build a network of trains and ships across the globe."** Dismiss it and I'm at **"Rails and Sails — setup / Choose your tickets"** with no explanation of what a "ticket" is, and **nothing tells me which color/player I am**.
- **"Keep at least 3 of 5. Unkept tickets go under the deck."** — I don't know the *consequence* of keeping a ticket (the "counts against you" warning from the intro isn't repeated where I decide). No "?" on the setup screen.

### 2. "Is it my turn?" clarity
- **"{color} is sailing"** (raw color, and "sailing" is wrong if they're building a train route). **"Draw one more or end turn"** assumes I know the draw-two rule.
- **"Final turns"** appears with zero explanation.
- The one-action-per-turn rule lives only in disabled buttons — nothing states it.

### 3. Every button & label
- **"Draw cards"** (of what?), **"Claim a route (3)"** (the **(3)** — routes I can afford? — is unexplained), **"Draw tickets"** (uses whole turn, not on the button), **"Build a harbor"** (why?), **"Exchange pieces"** (sounds like trading with another player), **"My tickets"** vs **"Draw tickets"** (confusable), **"Show deck"** (reads like an action, is a reference gallery), **"End turn"** (often disabled with no reason).
- Stat labels `Trains 20 · Ships 40 · Harbors · Tickets` OK; the big **score** number is unlabeled.

### 4. Taking a full turn — where I'd get stuck
- Draw overlay: *"Take up to two cards — a faceup wild counts as both"* (wild? both what?); **SHIPS 38 / TRAINS 41** deck counts look like costs.
- "Claim a route" is tappable even when nothing's affordable → toasts *"No route you can afford right now"* after the tap.
- Claim confirm: **"3 ship spaces · blue · pairs"** — "spaces" and **"· pairs"** are mystery tokens.
- No "you're done — end your turn?" nudge.
- **No walkthrough wired up** (`TTR_INTRO` has no `walkthrough`, `TtrPlay` no `onWalkthrough`).

### 5. Unexplained jargon/numbers
- "faceup wild counts as both", "double-ship / sea spaces", "3 ship spaces · blue · pairs", **rectangle=train / oval=ship** (the key legend lives only in the dismissed intro), harbor "(20/30/40)", the piece-count math ("60 pieces total" vs "up to 25 trains and 50 ships" vs "20/40" — reads as a contradiction), the "(3)", the bare score, "38/41" deck counts, "×7" stack badges, TV "20·40", "boxed".

### 6. Waiting / error / empty states
- "Fleet locked in" (locked in *what*?), "Loading the world", bare `{error}` toasts, and the "No route you can afford" notice firing *after* a tappable dead button. Off-turn: only "{color} is sailing", no last-action echo on the device.

### 7. Intro
- Useful route-shape line is text-only (no icons). "Harbors… multiply the tickets that name them (20/30/40)" is impenetrable. "no longest-route bonus here" references another game. **"Walk me through the interface" is not wired up for TTR.** Closes on any outside click.

### 8. TV from the couch
- No big whose-turn text (only a 2px chip outline). Chips read `name / score / "20·40"` (unlabeled). The action caption is the best element. "Final turns" appears with no explanation. Win shows a name but no final standings.

### 9. Top 10 fixes (TTR)
1. Add the promised walkthrough for this game.
2. Persistent "one action per turn" reminder; disabled buttons explain themselves.
3. On-device route-shape legend (▭ train / ⬭ ship / grey = any).
4. Label the naked numbers (score "PTS", the "(3)", deck counts, TV "20·40").
5. Clarify jargon buttons ("Exchange → Swap unused pieces (costs points)", "Show deck → Card reference", "(uses your whole turn)" on Draw tickets).
6. Turn banner uses names + real action; echo last action on the device.
7. Explain "Final turns" the moment it appears (both screens).
8. Reconcile the piece-count math in setup.
9. Don't let clearly-illegal actions be tappable.
10. Define the claim-confirm terms inline ("Costs 3 blue ship cards").

---

## Trekking the National Parks

I sat down, someone handed me the tablet.

### 1. Opening the device — first 10 seconds
- **"Loading the trails"** doesn't say which device/game. After "Got it", a busy 3D map + tall panel stack with no "start here" pointer. The **"?"** is hover-labeled only. My name panel shows a place like **"START"** with no "You're at:" prefix. Four bare numbers **Parks / Stones / Campsites / Cards** with no context.

### 2. "Is it my turn?" clarity
- Decent: **"Your turn — 2 actions left"** vs **"{name} is trekking"** — but "actions" is undefined and "trekking" reads oddly (vs plain "{name}'s turn"). Off-turn everything just dims with no "Wait for your turn." Can't tell which buttons cost an action.

### 3. Every button & label
- **Move** (needs cards — not obvious), **"Claim a park"/"Claim {Name}"** (greyed with no reason), **"Occupy a major park"** ("occupy" jargon; "major" undefined), **"My parks"**, **"Show deck"** (should be "Card reference"), **"Deck {n}"** (unexplained draw + number), **"End turn (skip 2)"** ("skip 2" reads as a penalty → "2 actions unused"), **"Discard 0/2"** (cryptic fraction).

### 4. Taking a full turn — where I'd get stuck
- Move mode: *"Select number cards below"* — I can't tell number cards from icon cards; tapping an icon card does nothing with no explanation.
- **"5 trails"** — "trails" undefined; then *"Tap a glowing park on the map"* and *"No destination at that exact distance"* with no hint what number would work (guess-and-check).
- **"5 trails (or 6)"** — the "(or 6)" bonus is mysterious.
- Claim/Occupy auto-pick the cards spent (`paymentFor`) — a newcomer fears the app is spending cards they wanted to keep, with no way to change it.
- **"Occupy — 5 points + ability"** — doesn't say what the ability *is*.
- **"Acadia wild pair included"**, the Everglades stone-swap, and the sudden **hand limit / "Select 2 cards to discard"** all appear with no context.

### 5. Unexplained jargon/numbers
- "trails", "Trek river", "Stones", "Campsites", "Parks vs Major parks", bare "Cards: 8", "Deck 12", the four stat numbers, "+ ability", "(or 6)", "Acadia wild pair", "Hawai'i Volcanoes free hop", and the card icons (no legend). No running score anywhere on the device.

### 6. Waiting / error / empty states
- Friendly empties ("none yet", "Nothing claimed yet"). But off-turn silent dimming, "No destination at that exact distance" (fact, not fix), and no post-move confirmation on the device.

### 7. Intro
- Strongest of the bunch on *goal*, but dense with jargon it never reinforces mid-turn; the exact-sum mechanic is one clause. **No walkthrough wired up** (`TREK_INTRO` has no `walkthrough`). The best teaching text is the intro itself, gone after "Got it".

### 8. TV from the couch
- Active-player outline is subtle; the pill helps. Chips show "{n} parks" + tiny **"{n}st · {n}c"** (unreadable) and **no score all game**. Side rails "Parks"/"Major parks" need "you can claim/occupy" captions. The **"Awards"** strip is 22px — unreadable. Endgame is the first time scores appear.

### 9. Top 10 fixes (Trek)
1. Define "trails" + the exact-sum rule on the device in move mode.
2. Add the missing guided walkthrough / first-turn coach.
3. Explain *why* Claim/Occupy are disabled.
4. Show score (mine + everyone's) during the game, on device and TV.
5. Label the four stat numbers (esp. Campsites, Stones).
6. Explain auto-picked payment; ideally let me change it.
7. Spell out powers instead of naming them ("+ ability", "(or 6)", "Acadia wild pair").
8. Rename opaque labels ("Show deck → Card reference", "Trek river → Face-up trek cards", "End turn (skip 2) → 2 actions unused", "{name} is trekking → {name}'s turn").
9. Add an explicit "Waiting for {name}…" state.
10. Fix the TV's tiny/abbreviated info (expand "st/c", enlarge "Awards", caption the rails).

---

## Dark Tower

I sat down, someone handed me a tablet, and the TV lit up with a tower.

### 1. Opening the device — first 10 seconds
- Intro's **"Walk me through the interface"** never appears (DT_INTRO has no `walkthrough`, `DtPlay` passes no `onWalkthrough`) — "Got it" dumps me into a 12-button panel. The persistent help **"?"** is hover-labeled only (unreachable on a tablet). The readout shows **"Level 1"** and **"Timbrus · 1/4"** with no meaning yet.

### 2. "Is it my turn?" clarity
- Best signal: **"Your turn — move your piece one space, then press an action."** But the same instruction appears **twice** (board overlay + status). Off-turn buttons dim silently (no "wait for your turn"). Sub-phase prompts ("YES fights, NO retreats") assume I've found the YES/NO buttons and know which colored keys they are.

### 3. Every button & label (the 12-button panel)
- Many buttons stack a **second word under a divider** that's never explained: **Yes/Buy, No/End, Tomb/Ruin, Sanctuary/Citadel, Dark/Tower.**
- **"Repeat"** (replays the tower's last animation — reads like "repeat my turn/undo"), **"Haggle"** and **"Bazaar"** (market jargon), **"Frontier"** (border crossing), **"Move"** (confusing — I already dragged my pawn).
- **"Clear"** is `press.clear = null` **always** — a permanently dead button a newcomer will keep pressing.
- **"No / End" is how you end your turn** — totally non-obvious.
- The **pegasus tile on the scorecard is a hidden button** (hover-title "Fly the pegasus — take another action"), invisible on touch.

### 4. Taking a full turn — where I'd get stuck
- "Move your piece one space" never says **drag your pawn**; the "Moving your piece" popup only appears *after* I've discovered dragging.
- After moving, "press an action" — six buttons, most greyed for invisible reasons; "Move" is secretly the do-nothing option.
- **No visible "End turn"** during the main turn (hidden in "No/End" in the `turnDone` phase).
- The **riddle** phase overloads NO=cycle vs NO=end elsewhere — easy to mash wrong.
- Resolution plays on the (silent-on-phone) tower; no per-turn recap on the device.

### 5. Unexplained jargon/numbers
- "Level 1", "Timbrus · 1/4" (the "/4" = kingdoms crossed), rival "3w · 5g · 2f · 1/4" (w/g/f never spelled out on the phone), "2 keys", the LCD codes ("Cr" = curse red; riddle numbers), "brigands", "Rating {score}" (out of what?), "pegasus/scout/healer/sword" tile powers.

### 6. Waiting / error / empty states
- "Raising the tower" (fine). Off-turn: dim buttons + "{name} is playing", no "waiting". Raw `{error}` toast. The **permanently-dead "Clear"** is itself a bad state. The climactic **"Dark/Tower"** button has no confirm/guard.

### 7. Intro
- Good flavor, but maps no rule to a button; uses the same jargon the panel does with no glossary; never states the core loop ("drag pawn → press one action → press No to end"). **"Walk me through the interface" not wired up.** The best teaching text (the "Moving your piece" popup) only fires reactively, once per turn.

### 8. TV from the couch
- "Level 1 — 4 brigands within" (ambiance). The LCD codes are mirrored but undecodable. Chips repeat `w/g/f`, `1/4`, `2 keys` with the subtle turn outline. The caption is the most followable element. "Rating {score}" on the win screen is undefined. Nothing tells the active player which button to press.

### 9. Top 10 fixes (Dark Tower)
1. Wire up / write an actual interface walkthrough (the core "drag → one action → No/End" loop).
2. Fix or remove the permanently-dead "Clear" button.
3. Explain the stacked second words (Buy/End/Ruin/Citadel); make clear "No/End" ends the turn.
4. Tell me to **drag** the piece before I must; surface the "Moving your piece" rules in the intro.
5. Make disabled buttons say why ("Need the gold key", "Only at the bazaar").
6. Legend for w/g/f, "/4", and "keys" on both screens.
7. Decode the LCD codes ("Curse the Red kingdom?" instead of "Cr").
8. Reveal the hidden pegasus extra-action.
9. Make "?" and the rulebook link obviously say "Help".
10. Guard the endgame "Dark/Tower" button with a confirm/caption.

---

*Generated by five in-character review agents. Constraint respected throughout:
no feedback asks to change the 3D board/mat model — only the labels, copy,
legends, prompts, ordering, and HUD around it.*
