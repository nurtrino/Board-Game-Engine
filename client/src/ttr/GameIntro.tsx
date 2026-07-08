// Start-of-game goal explainer, shared by games. Shows a concise "what you're
// trying to do" with the key intricacies, and a rulebook link (the "?" in the
// bottom-right corner) for the full rules.

export interface Intro {
  title: string;
  tagline: string;
  goal: string;
  points: { label: string; detail: string }[];
  rulebook: string; // URL or bundled PDF path
}

export const TTR_INTRO: Intro = {
  title: 'Ticket to Ride: Rails & Sails',
  tagline: 'The World — build a network of trains and ships across the globe.',
  goal: 'Score the most points by claiming routes between cities and completing the destination tickets in your hand. Unfinished tickets count against you, so pick goals you can actually connect.',
  points: [
    { label: 'Your turn, one action', detail: 'Take 2 travel cards, claim one route, draw tickets, build a harbor, or exchange train/ship pieces.' },
    { label: 'Claiming routes', detail: 'Play cards matching the route’s colour and type — rectangles need trains, ovals need ships. Grey routes take any one colour; wilds fill any gap; a double-ship card covers two sea spaces.' },
    { label: 'Trains and ships', detail: 'You chose a fixed split of 25-max trains and 50-max ships. Rail routes spend trains, sea routes spend ships — run low on either and you’re stuck on that kind.' },
    { label: 'Tickets and harbors', detail: 'Connect a ticket’s cities for its points (or lose them). Harbors in port cities you’ve reached multiply the tickets that name them (20/30/40).' },
    { label: 'Game end', detail: 'When anyone drops to 6 pieces, everyone gets two last turns. Highest score wins — no longest-route bonus here.' },
  ],
  rulebook: '/ttr/rulebook.pdf',
};

export const BRASS_INTRO: Intro = {
  title: 'Brass: Birmingham',
  tagline: 'Build an industrial network across the Midlands over two eras.',
  goal: 'Score the most victory points by building industries, flipping them through sales, and connecting your network with canals then rails. Points come at the end of each era from your links and your flipped tiles.',
  points: [
    { label: 'Build', detail: 'Play a card to place an industry tile on a matching location, paying its cost plus any coal and iron it needs — those must be sourced legally from the board or markets.' },
    { label: 'Sell to flip', detail: 'Selling cotton, goods and pottery flips the tile face-up: that’s where its victory points and income live. Beer is consumed to sell.' },
    { label: 'Network', detail: 'Canals (era one) then rails (era two) connect your locations and feed coal/iron across the board. Links score at era end.' },
    { label: 'Money and income', detail: 'Spend cash to build; income ticks up as you flip tiles and takes you through each round. Loans trade income for cash.' },
    { label: 'Two eras', detail: 'After the canal era scores, low-level tiles are removed and the board reshuffles into the rail era. Final scoring decides the winner.' },
  ],
  rulebook: 'https://www.roxley.com/wp-content/uploads/2018/09/Brass-Birmingham-Rulebook.pdf',
};

export const TREK_INTRO: Intro = {
  title: 'Trekking the National Parks',
  tagline: 'Race across the US map collecting stones and claiming park cards.',
  goal: 'Score the most points by claiming park cards, occupying major parks with campsites, and collecting stones. The game ends when someone claims their fifth park card or the last stone leaves the map.',
  points: [
    { label: 'Two actions per turn', detail: 'Any mix of: draw a trek card, move your trekker, claim a park card, or occupy a major park.' },
    { label: 'Moving', detail: 'Play trek cards whose numbers add up exactly to the trails you walk. Land on a park with a stone to collect it. You cannot pass through other trekkers — but landing on one bumps them back to START.' },
    { label: 'Claiming parks', detail: 'Stand on a park shown in the face-up park row and pay its icons with matching trek cards. Each card is a number OR an icon, never both.' },
    { label: 'Major parks', detail: 'Three are in play. Occupy one with a campsite (5 points) by paying its icons on-site; each grants a lasting or one-time power. Each player can occupy each major once.' },
    { label: 'Stones and bonuses', detail: 'Stones are 1 point each; whoever collects the most of a color wins its bonus card (second-most too, except in 2-player). Ties cancel the card.' },
    { label: 'Hand limit', detail: 'Discard down to 12 trek cards at the end of your turn.' },
  ],
  rulebook: '/trek/rulebook.pdf',
};

export const DT_INTRO: Intro = {
  title: 'Dark Tower',
  tagline: 'The 1981 electronic classic — circle the kingdoms, storm the tower.',
  goal: 'Be first to gather the brass, silver and gold keys, return home, solve the Riddle of the Keys and defeat the brigade inside the Dark Tower. The tower itself runs the game exactly as the original did.',
  points: [
    { label: 'One action per turn', detail: 'Move, raid a tomb, visit the bazaar, rest at a sanctuary, cross a frontier, or attack the tower.' },
    { label: 'Moving is risky', detail: 'Each move can be safe, or bring brigands, the dragon, plague, or leave you lost. A scout, healer or sword turns each hazard to your favor.' },
    { label: 'Keys and kingdoms', detail: 'Cross the frontier into each kingdom in turn. Tomb treasure hides that kingdom\'s key — you cannot leave without it.' },
    { label: 'Feed your warriors', detail: 'Every turn eats food (1 per 15 warriors). At zero food, warriors starve. The bazaar sells food, warriors and helpers — haggle, but the merchant may slam the shutters.' },
    { label: 'Battles', detail: 'Each round both sides roll. Win a round and the brigands halve; lose one and a warrior falls. Retreating costs a warrior.' },
    { label: 'The tower', detail: 'Home with the gold key, answer the two-key riddle, then beat the tower\'s full brigade. Victory plays the 1812 Overture and earns a 0-99 rating.' },
  ],
  rulebook: '/darktower/rulebook.pdf',
};

export function GameIntro({ intro, onClose }: { intro: Intro; onClose: () => void }) {
  return (
    <div
      style={{ position: 'absolute', inset: 0, background: 'rgba(3,6,9,0.86)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        className="ig-glass"
        style={{ position: 'relative', maxWidth: 560, width: '100%', maxHeight: '86vh', overflowY: 'auto', borderRadius: 20, padding: '26px 28px 64px' }}
        onClick={(e) => e.stopPropagation()}
      >
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
        <button
          onClick={onClose}
          className="tp-act primary"
          style={{ marginTop: 22, width: 'auto', padding: '11px 26px', display: 'inline-block' }}
        >Got it</button>

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
