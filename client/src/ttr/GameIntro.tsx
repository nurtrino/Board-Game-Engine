// Start-of-game goal explainer, shared by games. Shows a concise "what you're
// trying to do" with the key intricacies, and a rulebook link (the "?" in the
// bottom-right corner) for the full rules. A game can also supply a `walkthrough`
// — a stepped, first-round teach that opens from the intro.

import { useEffect, useState } from 'react';

export interface WalkStep { title: string; body: string } // body may contain blank-line paragraphs

export interface Intro {
  title: string;
  tagline: string;
  goal: string;
  points: { label: string; detail: string }[];
  rulebook: string; // URL or bundled PDF path
  walkthrough?: WalkStep[]; // optional first-round teach
}

export const TTR_INTRO: Intro = {
  title: 'Ticket to Ride: Rails & Sails',
  tagline: 'The World: build a network of trains and ships across the globe.',
  goal: 'Score the most points by claiming routes between cities and completing the destination tickets in your hand. Unfinished tickets count against you, so pick goals you can actually connect.',
  points: [
    { label: 'Your turn, one action', detail: 'Take 2 travel cards, claim one route, draw tickets, build a harbor, or exchange train/ship pieces.' },
    { label: 'Claiming routes', detail: 'Play cards matching the route’s colour and type. Rectangle routes need trains, oval routes need ships. Grey routes take any one colour; wilds fill any gap; a double-ship card covers two sea spaces.' },
    { label: 'Trains and ships', detail: 'You chose a fixed split of up to 25 trains and up to 50 ships. Rail routes spend trains, sea routes spend ships. Run low on either and you’re stuck on that kind.' },
    { label: 'Tickets and harbors', detail: 'Connect a ticket’s cities for its points (or lose them). Harbors in port cities you’ve reached multiply the tickets that name them (20/30/40).' },
    { label: 'Game end', detail: 'When anyone drops to 6 pieces, everyone gets two last turns. Highest score wins.' },
  ],
  rulebook: '/ttr/rulebook.pdf',
  walkthrough: [
    { title: 'Your turn, one action', body: 'On your turn you do exactly ONE thing from the buttons on your device: draw cards, claim a route, draw tickets, build a harbor, or exchange pieces. The banner at the top always shows whose turn it is.' },
    { title: 'Cards come in two shapes', body: 'On the map a rectangle route needs TRAIN cards and an oval route needs SHIP cards. Grey routes take any one colour, and a wild card fills any gap. This is the main thing to remember.' },
    { title: 'Drawing cards', body: 'Tap DRAW CARDS to take two travel cards. You can take a face-up card from the row, or draw blind from the ship or train pile. A face-up wild card counts as your whole draw for the turn.' },
    { title: 'Claiming a route', body: 'Tap CLAIM A ROUTE, then tap a highlighted route on the map. You spend cards matching its colour and shape to lay your pieces and score points. The number on the button is how many routes you can afford right now.' },
    { title: 'Tickets are your secret goals', body: 'A destination ticket scores if you connect its two cities by the end of the game, and counts AGAINST you if you do not. Tap MY TICKETS to see yours. DRAW TICKETS gets fresh ones but uses your whole turn.' },
    { title: 'How the game ends', body: 'When a player runs low on pieces, everyone gets two final turns and then the highest score wins. Watch the shared TV to follow what everyone else is doing.' },
  ],
};

export const BRASS_INTRO: Intro = {
  title: 'Brass: Birmingham',
  tagline: 'Build an industrial network across the Midlands over two eras.',
  goal: 'Score the most victory points by building industries, flipping them through sales, and connecting your network with canals then rails. Points come at the end of each era from your links and your flipped tiles.',
  points: [
    { label: 'Build', detail: 'Play a card to place an industry tile on a matching location, paying its cost plus any coal and iron it needs. Those must be sourced legally from the board or the markets.' },
    { label: 'Sell to flip', detail: 'Selling cotton, goods and pottery flips the tile face-up: that’s where its victory points and income live. Beer (the barrels on the board) is consumed when you sell.' },
    { label: 'Network', detail: 'Canals (era one) then rails (era two) connect your locations and feed coal and iron across the board. Links score at era end.' },
    { label: 'Money and income', detail: 'Spend cash to build; income ticks up as you flip tiles and takes you through each round. Loans trade income for cash.' },
    { label: 'Two eras', detail: 'After the canal era scores, low-level tiles are removed and the board reshuffles into the rail era. Final scoring decides the winner.' },
  ],
  rulebook: 'https://www.roxley.com/wp-content/uploads/2018/09/Brass-Birmingham-Rulebook.pdf',
  walkthrough: [
    { title: 'Your turn, two actions', body: 'Each turn you take TWO actions from the buttons on the right (just one action in the very first round). The banner shows whose turn it is and how many actions you have left.' },
    { title: 'The seven actions', body: 'BUILD places an industry tile. NETWORK lays a canal or a rail link. SELL flips a finished good face-up to score it. DEVELOP removes one of your tiles so better ones come out. LOAN takes cash but lowers your income. SCOUT grabs wild cards. PASS does nothing. Most actions cost you one card from your hand.' },
    { title: 'Building something', body: 'Tap BUILD, choose a card, then tap a glowing spot on the map. A panel shows exactly what you will pay before you confirm. Cards greyed out in the picker are ones you cannot afford to build with right now.' },
    { title: 'Money and income', body: 'Cash (the pound figure) is what you spend now. Income ticks up every round and grows when you flip tiles by selling. The coins are gold worth 15, silver worth 5, and bronze worth 1.' },
    { title: 'Two eras, and how you win', body: 'The game runs a canal era then a rail era. The links you build and the tiles you flip score VICTORY POINTS at the end of each era. Victory points, not cash, decide the winner.' },
    { title: 'Ending your turn', body: 'When your actions are used up, the turn passes on automatically. Watch the shared TV for the running story of everyone else\'s turns.' },
  ],
};

export const TREK_INTRO: Intro = {
  title: 'Trekking the National Parks',
  tagline: 'Race across the US map collecting stones and claiming park cards.',
  goal: 'Score the most points by claiming park cards, occupying major parks with campsites, and collecting stones. The game ends when someone claims their fifth park card or the last stone leaves the map.',
  points: [
    { label: 'Two actions per turn', detail: 'Any mix of: draw a trek card, move your trekker, claim a park card, or occupy a major park.' },
    { label: 'Moving', detail: 'Play trek cards whose numbers add up exactly to the trails you walk. Land on a park with a stone to collect it. You cannot pass through other trekkers, and landing on one bumps them back to START.' },
    { label: 'Claiming parks', detail: 'Stand on a park shown in the face-up park row and pay its icons with matching trek cards. Each card is a number OR an icon, never both.' },
    { label: 'Major parks', detail: 'Three are in play. Occupy one with a campsite (5 points) by paying its icons on-site; each grants a lasting or one-time power. Each player can occupy each major once.' },
    { label: 'Stones and bonuses', detail: 'Stones are 1 point each; whoever collects the most of a color wins its bonus card (second-most too, except in 2-player). Ties cancel the card.' },
    { label: 'Hand limit', detail: 'Discard down to 12 trek cards at the end of your turn.' },
  ],
  rulebook: '/trek/rulebook.pdf',
  walkthrough: [
    { title: 'Your turn, two actions', body: 'Each turn you take two actions from the buttons: draw a trek card, move your trekker, claim a park, or occupy a major park. The banner shows whose turn it is and how many actions you have left.' },
    { title: 'Moving to a park', body: 'Tap MOVE, then tap NUMBER cards in your hand until they add up to the exact number of trail steps to the park you want. Then tap the glowing park on the map to walk there. Icon cards are not numbers and will not move you.' },
    { title: 'Two kinds of cards', body: 'Every trek card is either a NUMBER (used to move) or an ICON (used to pay a park\'s cost). Take them from the face-up row or draw blind from the deck. Keep at most 12.' },
    { title: 'Claiming and occupying parks', body: 'Stand on a park shown in the row and tap CLAIM to pay its icons and score it. A MAJOR park can be OCCUPIED with one of your campsites for extra points and a special power.' },
    { title: 'Stones and score', body: 'Landing on a park that holds a stone collects it. Stones are worth 1 point each, and having the most of a colour earns a bonus at the end. Your score and everyone\'s is shown at the top.' },
    { title: 'Ending your turn', body: 'Tap END TURN when you are done, even if you have actions left. The game ends when someone claims their fifth park card or the last stone is gone.' },
  ],
};

export const DT_INTRO: Intro = {
  title: 'Dark Tower',
  tagline: 'The 1981 electronic classic: circle the kingdoms, storm the tower.',
  goal: 'Be first to gather the brass, silver and gold keys, return home, solve the Riddle of the Keys and defeat the brigade inside the Dark Tower. The tower itself runs the game exactly as the original did.',
  points: [
    { label: 'One action per turn', detail: 'Move, raid a tomb, visit the bazaar, rest at a sanctuary, cross a frontier, or attack the tower.' },
    { label: 'Moving is risky', detail: 'Each move can be safe, or bring brigands, the dragon, plague, or leave you lost. A scout, healer or sword turns each hazard to your favor.' },
    { label: 'Keys and kingdoms', detail: 'Cross the frontier into each kingdom in turn. Tomb treasure hides that kingdom\'s key, and you cannot leave without it.' },
    { label: 'Feed your warriors', detail: 'Every turn eats food (1 per 15 warriors). At zero food, warriors starve. The bazaar sells food, warriors and helpers. Haggle if you like, but the merchant may slam the shutters.' },
    { label: 'Battles', detail: 'Each round both sides roll. Win a round and the brigands halve; lose one and a warrior falls. Retreating costs a warrior.' },
    { label: 'The tower', detail: 'Home with the gold key, answer the two-key riddle, then beat the tower\'s full brigade. Victory plays the 1812 Overture and earns a 0-99 rating.' },
  ],
  rulebook: '/darktower/rulebook.pdf',
  walkthrough: [
    { title: 'Your turn: move, then act', body: 'On your turn, first DRAG your warrior one space around the board on the shared screen. Then press ONE action button on the tower panel on your device.' },
    { title: 'The tower panel', body: 'The coloured buttons are the tower\'s controls. MOVE just takes the space you landed on. TOMB searches ruins for treasure and keys. BAZAAR buys food and warriors. SANCTUARY heals you. FRONTIER crosses into the next kingdom.' },
    { title: 'Yes and No', body: 'The green YES button confirms or buys. The red NO button declines, and NO / END is how you END YOUR TURN. During a fight, YES fights on and NO retreats (retreating costs a warrior).' },
    { title: 'Warriors and food', body: 'Your warriors fight the brigands, and every turn they eat food. Run out of food and warriors starve, so keep buying food at the bazaar. The numbers by your name are warriors, gold and food.' },
    { title: 'Keys and the tower', body: 'Cross into each of the four kingdoms and raid tombs to collect the brass, silver and gold keys. Once you hold the gold key you can storm the DARK TOWER to try to win.' },
  ],
};

export function GameIntro({ intro, onClose, onWalkthrough }: {
  intro: Intro; onClose: () => void;
  onWalkthrough?: () => void; // if set, "Walk me through" hands off to a live interface tour instead of the text steps
}) {
  const [walk, setWalk] = useState<number | null>(null); // null = overview, else step index
  const steps = intro.walkthrough ?? [];
  const inWalk = walk !== null && steps.length > 0;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(3,6,9,0.86)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        className="ig-glass"
        role="dialog"
        aria-modal="true"
        aria-label={`${intro.title} guide`}
        style={{ position: 'relative', maxWidth: 580, width: '100%', maxHeight: '88vh', overflowY: 'auto', borderRadius: 20, padding: '26px 28px 64px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {inWalk ? (
          <Walkthrough steps={steps} step={walk!} setStep={setWalk} title={intro.title} onDone={() => setWalk(null)} />
        ) : (
          <>
            <div className="ig-lab">{intro.tagline}</div>
            <h1 style={{ margin: '2px 0 12px', fontSize: 26 }}>{intro.title}</h1>
            <p style={{ opacity: 0.88, lineHeight: 1.55, marginBottom: 16 }}>{intro.goal}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {intro.points.map((pt) => (
                <div key={pt.label}>
                  <div style={{ font: '700 13px Inter, sans-serif', letterSpacing: 0.3 }}>{pt.label}</div>
                  <div style={{ opacity: 0.72, fontSize: 13.5, lineHeight: 1.5 }}>{pt.detail}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
              <button autoFocus onClick={onClose} className="tp-act primary" style={{ width: 'auto', padding: '11px 26px' }}>Got it</button>
              {(onWalkthrough || steps.length > 0) && (
                <button onClick={() => (onWalkthrough ? onWalkthrough() : setWalk(0))} className="tp-act" style={{ width: 'auto', padding: '11px 22px' }}>
                  Walk me through the interface
                </button>
              )}
            </div>
          </>
        )}

        {/* rulebook link, bottom-right ? */}
        <a
          href={intro.rulebook}
          target="_blank"
          rel="noreferrer"
          title="Open the full rulebook"
          className="ig-glass"
          style={{
            position: 'absolute', bottom: 16, right: 16, width: 42, height: 42, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
            color: '#e8ebf0', font: '700 19px Inter, sans-serif',
          }}
        >?</a>
      </div>
    </div>
  );
}

function Walkthrough({ steps, step, setStep, title, onDone }: {
  steps: WalkStep[]; step: number; setStep: (n: number | null) => void; title: string; onDone: () => void;
}) {
  const s = steps[step];
  const last = step === steps.length - 1;
  return (
    <>
      <div className="ig-lab">{title} · walkthrough</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
        {steps.map((_, i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? '#e8b450' : 'rgba(255,255,255,0.14)' }} />
        ))}
      </div>
      <div className="ig-lab" style={{ opacity: 0.5 }}>Step {step + 1} of {steps.length}</div>
      <h2 style={{ margin: '6px 0 12px', fontSize: 21 }}>{s.title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {s.body.split('\n\n').map((para, i) => (
          <p key={i} style={{ opacity: 0.86, lineHeight: 1.6, margin: 0, fontSize: 14.5 }}>{para}</p>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <button onClick={() => (step === 0 ? onDone() : setStep(step - 1))} className="tp-act" style={{ width: 'auto', padding: '11px 22px' }}>
          {step === 0 ? 'Overview' : 'Back'}
        </button>
        {!last
          ? <button onClick={() => setStep(step + 1)} className="tp-act primary" style={{ width: 'auto', padding: '11px 26px' }}>Next</button>
          : <button onClick={onDone} className="tp-act primary" style={{ width: 'auto', padding: '11px 26px' }}>Finish</button>}
      </div>
    </>
  );
}
