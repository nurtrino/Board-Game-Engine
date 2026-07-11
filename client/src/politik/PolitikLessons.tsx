import { useState } from 'react';

type LessonFactLabel = 'PURPOSE' | 'PAY' | 'CHOOSE' | 'RESULT' | 'WHY' | 'COMMON MISTAKE' | 'REMEMBER';

interface LessonFact {
  label: LessonFactLabel;
  text?: string;
  items?: readonly string[];
}

interface LessonTopic {
  title: string;
  facts: readonly LessonFact[];
}

export interface PolitikLesson {
  id: string;
  title: string;
  summary: string;
  topics: readonly LessonTopic[];
}

export const POLITIK_LESSONS: readonly PolitikLesson[] = [
  {
    id: 'start-here',
    title: 'Start Here',
    summary: 'Learn the table, form your Nation, and use the device without exposing private information.',
    topics: [
      {
        title: 'The game in one minute',
        facts: [
          { label: 'PURPOSE', text: 'Build power in the military, political, and corporate arenas, then turn control into permanent Power Grabs.' },
          { label: 'CHOOSE', text: 'On each turn, take two Main Actions. At 9 or more Corruption, take three. You may repeat the same Main Action.' },
          { label: 'RESULT', text: 'After every required action, explicitly Check Power Grabs. If you meet the room\'s victory condition, the game ends.' },
          { label: 'WHY', text: 'Control can change before your turn ends, but a Power Grab already claimed can never be lost.' },
        ],
      },
      {
        title: 'Your two views',
        facts: [
          { label: 'PURPOSE', text: 'PERSONAL keeps your hand, Nation tableau, resources, prompts, and choices close. MAIN BOARD shows States, Council Seats, Industries, prices, and legal targets.' },
          { label: 'CHOOSE', text: 'Switch views whenever you like. A board-targeting action may move you to MAIN BOARD automatically and return after confirmation.' },
          { label: 'COMMON MISTAKE', text: 'Do not wait for the shared TV to reveal a private prompt. Hidden cards and unresolved choices belong on the acting player\'s device.' },
        ],
      },
      {
        title: 'Formation',
        facts: [
          { label: 'CHOOSE', items: ['Keep or replace your six Politik cards as one complete mulligan; the Startup Company stays.', 'Choose one of two Nations and one of that Nation\'s two Starting Propaganda cards.', 'Assign printed starting Support to legal Bases and printed leaders among the three types.', 'When prompted, choose an available setup bonus, then a legal unoccupied starting State.'] },
          { label: 'RESULT', text: 'You begin with 8 Influence in the chosen State and immediately gain its printed benefit.' },
          { label: 'COMMON MISTAKE', text: 'The starting State normally cannot be a Broadcast Station. A printed setup exception can change that rule.' },
        ],
      },
      {
        title: 'When a card is unfamiliar',
        facts: [
          { label: 'REMEMBER', text: 'Open the authentic card at full size. OCR labels are navigation hints, never rules authority.' },
          { label: 'CHOOSE', text: 'If a digital card record is uncertain, enter the printed type, costs, requirements, Focus, and relevant icons when that card is used.' },
          { label: 'RESULT', text: 'Core rules stay enforced while uncommon printed effects use a typed, public resolution record.' },
        ],
      },
    ],
  },
  {
    id: 'how-to-win',
    title: 'How to Win',
    summary: 'Qualify in an arena at the end of your turn, claim Power Grabs, and meet the room threshold.',
    topics: [
      {
        title: 'Qualify for Power Grabs',
        facts: [
          { label: 'PURPOSE', text: 'Convert majorities on the shared board into permanent victory progress.' },
          { label: 'RESULT', items: ['MILITARY: control at least 3 Regions.', 'POLITICAL: control at least 4 Council Seats.', 'CORPORATE: control at least 4 Industries.'] },
          { label: 'REMEMBER', text: 'During Check Power Grabs, claim every newly met arena Grab, up to two Power Grabs of each type.' },
          { label: 'COMMON MISTAKE', text: 'Qualifying does not award a marker immediately. You must still meet the condition when you Check Power Grabs at the end of your turn.' },
        ],
      },
      {
        title: 'Standard victory',
        facts: [
          { label: 'RESULT', items: ['2 Nations: 4 total Power Grabs.', '3-4 Nations: 3 total Power Grabs.', '5-6 Nations: 2 total Power Grabs.'] },
          { label: 'WHY', text: 'Standard victory also requires Power Grabs from at least two different arenas. A stack of only one type is not enough.' },
          { label: 'REMEMBER', text: 'Long War, Trifecta, and other selected room options can change the test. The active variant is shown on your device.' },
        ],
      },
    ],
  },
  {
    id: 'turn-and-timing',
    title: 'Turn and Timing',
    summary: 'Know who may act, what gets paid, and when a decision is actually finished.',
    topics: [
      {
        title: 'Turn anatomy',
        facts: [
          { label: 'PURPOSE', text: 'Complete Main Action 1, Main Action 2, then Check Power Grabs. At 9 or more Corruption, complete Main Action 3 as well.' },
          { label: 'CHOOSE', text: 'Any of the eight Main Actions may be repeated unless its own availability rule prevents it.' },
          { label: 'RESULT', text: 'END TURN / CHECK POWER GRABS claims new markers, cleans up Events, then passes the turn.' },
          { label: 'COMMON MISTAKE', text: 'A turn does not end just because you have nothing else planned. Finish every required Main Action and use the explicit end-turn control.' },
        ],
      },
      {
        title: 'Resolve an action in order',
        facts: [
          { label: 'CHOOSE', items: ['Declare the action and all required targets.', 'Check printed and core requirements.', 'Pay costs.', 'Resolve the effect and every required follow-up choice.'] },
          { label: 'WHY', text: 'The order matters for responses, changing control, and effects that alter later requirements.' },
          { label: 'COMMON MISTAKE', text: 'If an effect cancels an action after costs are paid, those costs remain spent unless the authentic card says otherwise.' },
        ],
      },
      {
        title: 'Pending choices and hand limit',
        facts: [
          { label: 'REMEMBER', text: 'Finish the highlighted private or public decision before beginning another action.' },
          { label: 'RESULT', text: 'A hand above 10 cards creates a discard prompt before play can continue.' },
          { label: 'COMMON MISTAKE', text: 'Obligations count toward the 10-card limit but cannot be discarded normally. Play or legally Shirk them instead.' },
        ],
      },
    ],
  },
  {
    id: 'main-actions',
    title: 'Main Actions',
    summary: 'The eight actions are the vocabulary of every active turn.',
    topics: [
      {
        title: 'Cards, abilities, Nation, and conflict',
        facts: [
          { label: 'CHOOSE', items: ['PLAY: play one Company, Asset, Propaganda, Event, or Obligation from hand.', 'USE ABILITY: resolve one controlled Company, Asset, Propaganda, or Broadcast Station ability.', 'NATIONAL ACTION: choose Income, Rally, Produce, or Refresh if its token is available.', 'CLASH: challenge in the Military, Political, or Corporate arena.'] },
          { label: 'PAY', text: 'Each card or ability uses its printed costs. A Clash costs the current Clash price in Carbon or one leader matching the arena.' },
          { label: 'COMMON MISTAKE', text: 'Using an ability is a Main Action even when the printed ability has no Activate cost. A printed Edge timing can make an ability an Edge Action instead.' },
        ],
      },
      {
        title: 'The four X actions',
        facts: [
          { label: 'CHOOSE', items: ['EDUCATE X: gain X leaders divided among Military, Political, and Corporate.', 'RESEARCH X: draw X Politik cards.', 'CAMPAIGN X: move X Support from any mix of your Bases into exactly one Council Seat.', 'EXCHANGE X: buy or sell Food and Carbon in the transaction order you choose.'] },
          { label: 'PAY', items: ['Educate costs X times the current Educate price in Food.', 'Research costs X times the current Research price in Capital.', 'Campaign costs X times the current Campaign price in Capital.', 'Exchange buys or sells each unit at that resource\'s current price in Capital.'] },
          { label: 'RESULT', text: 'The preview shows the complete cost and resulting resources before you confirm.' },
          { label: 'COMMON MISTAKE', text: 'Campaign may draw Support from several Bases, but all moved Support must enter one Council Seat.' },
        ],
      },
    ],
  },
  {
    id: 'edge-actions',
    title: 'Edge Actions',
    summary: 'Any Nation may respond during a valid timing window without spending the active player\'s Main Action.',
    topics: [
      {
        title: 'The four responses',
        facts: [
          { label: 'CHOOSE', items: ['Play a printed Edge Event.', 'Use a printed Edge Ability.', 'Shirk an Obligation.', 'Propose a Trade.'] },
          { label: 'PAY', text: 'Pay the printed Event or Ability cost. Shirk costs 10 times your current Corruption in Capital. A Trade pays only the property its participants approve.' },
          { label: 'RESULT', text: 'After resolving one response, the timing window continues according to the printed effect and the visible response order.' },
        ],
      },
      {
        title: 'Response order',
        facts: [
          { label: 'PURPOSE', text: 'Make simultaneous reactions deterministic and keep the table from waiting on an unspoken decision.' },
          { label: 'CHOOSE', text: 'When your device names you as responder, take a legal Edge Action or PASS.' },
          { label: 'WHY', text: 'Final Say sets the order for simultaneous Edge Actions. Clash windows also pause at their printed timing points.' },
          { label: 'COMMON MISTAKE', text: 'An ordinary Event or ability is not an Edge Action merely because you want to interrupt. The authentic card must grant the timing.' },
        ],
      },
    ],
  },
  {
    id: 'board-and-control',
    title: 'Board and Control',
    summary: 'Read control from Influence, Support, and Market majorities, with Final Say settling exact ties.',
    topics: [
      {
        title: 'Military map',
        facts: [
          { label: 'PURPOSE', text: 'Influence contests individual States; State control builds Region control.' },
          { label: 'RESULT', text: 'Control a State by having the positive Influence lead there. A tied lead needs a Final Say ruling.' },
          { label: 'RESULT', text: 'To control a Region, control at least 2 ordinary States there and more States than every rival. A tied lead needs a Final Say ruling.' },
          { label: 'WHY', text: 'Control of 3 Regions qualifies for a Military Power Grab.' },
          { label: 'REMEMBER', text: 'When you gain control of a State, take its benefit. Produce later resolves the benefits of all States you control.' },
        ],
      },
      {
        title: 'Council and Industries',
        facts: [
          { label: 'RESULT', items: ['COUNCIL SEAT: have Support there and the most Support; a tied lead needs Final Say.', 'INDUSTRY: hold the most matching Market across all your Companies; a tied lead needs Final Say.'] },
          { label: 'WHY', text: 'Four controlled Council Seats qualify for Political; four controlled Industries qualify for Corporate.' },
          { label: 'COMMON MISTAKE', text: 'Market is counted across your whole tableau, not only your strongest Company.' },
        ],
      },
      {
        title: 'Broadcast Stations',
        facts: [
          { label: 'PURPOSE', text: 'A Station links two adjacent Regions and grants a reusable Signal or Noise ability while controlled and Ready.' },
          { label: 'CHOOSE', text: 'Signal adds Influence to your controlled ordinary States in both adjacent Regions equal to your matching Propaganda. Noise removes your matching count minus that State controller\'s matching count, to a minimum of 0.' },
          { label: 'COMMON MISTAKE', text: 'Defense or temporary Immunity prevents Noise. A Broadcast Station is a special space and does not count as an ordinary State for Region control.' },
        ],
      },
    ],
  },
  {
    id: 'cards-and-keywords',
    title: 'Cards and Keywords',
    summary: 'Let authentic art govern unique text while the device handles core placement, costs, and public state.',
    topics: [
      {
        title: 'Five play results',
        facts: [
          { label: 'RESULT', items: ['COMPANY: create a Company tableau, set printed Margin, then take one available Market matching an Industry keyword.', 'ASSET: attach it to one of your Companies and add its printed Industries, Margin, and abilities.', 'PROPAGANDA: pay Support from a matching Base and place it in your tableau; replace one if this would exceed four.', 'EVENT: resolve it now; it remains visible until Check Power Grabs, then discards.', 'OBLIGATION: resolve it, then return it to the bottom of the Obligation deck.'] },
          { label: 'COMMON MISTAKE', text: 'A card\'s type, costs, requirements, icons, and unique text come from authentic art, not an OCR hint.' },
        ],
      },
      {
        title: 'Ready, Activate, Corruption, and Negotiation',
        facts: [
          { label: 'PAY', text: 'Activate is a printed ability cost. The source must be Ready and becomes used. An ability without Activate does not automatically use its source.' },
          { label: 'RESULT', text: 'Playing a Corruption-keyword card gains 1 Corruption and draws 1 Obligation after the card resolves.' },
          { label: 'WHY', text: 'Negotiation can determine Final Say after Justice and Corruption fail to produce one leader.' },
          { label: 'REMEMBER', text: 'Refresh readies your controlled cards and Broadcast Stations.' },
        ],
      },
      {
        title: 'Focus and card authority',
        facts: [
          { label: 'PURPOSE', text: 'Focus values let Politik cards serve as hidden strength in any of the three Clash arenas.' },
          { label: 'CHOOSE', text: 'When committing an uncertain Politik card, enter the printed Focus for the current arena. An unplayed Startup is universal 1 Focus.' },
          { label: 'RESULT', text: 'Focused cards leave your hand and discard after the Clash. Obligations cannot be Focused.' },
        ],
      },
    ],
  },
  {
    id: 'national-actions',
    title: 'National Actions',
    summary: 'Each of the four powerful procedures has its own token and cannot repeat until the full cycle resets.',
    topics: [
      {
        title: 'Income and Rally',
        facts: [
          { label: 'RESULT', text: 'INCOME gains 5 Capital, each Company\'s Margin times its Market count, and 5 Capital per controlled Industry. You may then buy one legal available Market for 20 Capital.' },
          { label: 'RESULT', text: 'RALLY gains one matching Base Support per controlled Propaganda, then resolves Council Seats you control from Chair through Defense.' },
          { label: 'COMMON MISTAKE', text: 'Chair resolves first and may change who controls a later Seat. Control is checked again before each later Council power.' },
        ],
      },
      {
        title: 'Produce and Refresh',
        facts: [
          { label: 'RESULT', text: 'PRODUCE gains every controlled State benefit, assigns gained Support among Bases, then Researches once for each Region where you have Influence.' },
          { label: 'RESULT', text: 'REFRESH readies all controlled cards and Stations, advances the Landscape, and resolves its Market, Margin, and price changes.' },
          { label: 'COMMON MISTAKE', text: 'Produce research counts Regions you occupy, not only Regions you control.' },
        ],
      },
      {
        title: 'Token cycle',
        facts: [
          { label: 'CHOOSE', text: 'Select only a National Action whose token is available.' },
          { label: 'RESULT', text: 'Its token stays used across turns. Immediately after you use all four different National Actions, all four tokens return.' },
          { label: 'WHY', text: 'The cycle prevents repeating one National Action while still letting you plan the order over several turns.' },
        ],
      },
    ],
  },
  {
    id: 'clashes',
    title: 'Clashes',
    summary: 'Pay, commit hidden Focus, pass through response windows, reveal together, and apply the difference.',
    topics: [
      {
        title: 'Shared Clash procedure',
        facts: [
          { label: 'PAY', text: 'Spend Carbon equal to the current Clash price or spend one leader matching the chosen arena.' },
          { label: 'CHOOSE', text: 'Choose a legal target. Each side secretly commits eligible cards and any same-arena leaders. Military sides may also Focus Influence from adjacent controlled States.' },
          { label: 'RESULT', text: 'After each printed timing window passes, reveal both totals. The higher side wins by the difference; a tie changes nothing.' },
          { label: 'COMMON MISTAKE', text: 'Committed cards, leaders, and Military Influence are spent even if a later printed effect cancels the Clash.' },
        ],
      },
      {
        title: 'Military and Political results',
        facts: [
          { label: 'RESULT', text: 'MILITARY removes opposing Influence equal to the difference, then adds any remainder for the winner. Gaining control awards the State benefit and a Station card when applicable.' },
          { label: 'RESULT', text: 'POLITICAL captures opposing Support in the targeted Council Seat equal to the difference, capped by the Support that side had there when the Clash began.' },
          { label: 'REMEMBER', text: 'Imperial defense commits one Politik card, or two at a Broadcast Station. Raging Imperials adds one more.' },
        ],
      },
      {
        title: 'Corporate result',
        facts: [
          { label: 'CHOOSE', text: 'Name one of your Companies and one opposing Company before Focus.' },
          { label: 'RESULT', text: 'The losing owner allocates a total loss of Margin and/or Market equal to the difference. Capturable Market moves to the winning Company; Market it cannot legally hold returns to supply.' },
          { label: 'COMMON MISTAKE', text: 'Corporate Focus compares the chosen Companies, but Industry control still totals Market across every Company you own.' },
        ],
      },
    ],
  },
  {
    id: 'companies-and-economy',
    title: 'Companies and Economy',
    summary: 'Build eligible Market holdings, grow Margin carefully, and turn the tableau into Income and Corporate control.',
    topics: [
      {
        title: 'Companies, Assets, and Market',
        facts: [
          { label: 'PURPOSE', text: 'Company Industries define which Market the Company can hold. Assets can add Industries, Margin, and abilities.' },
          { label: 'CHOOSE', text: 'When a Company or effect grants Market, choose an available token matching an Industry that Company has.' },
          { label: 'RESULT', text: 'All matching Market across your Companies contributes to Industry control.' },
          { label: 'COMMON MISTAKE', text: 'A Market token cannot be assigned to a Company without the matching Industry keyword, even if you control that Industry elsewhere.' },
        ],
      },
      {
        title: 'Margin and overflow',
        facts: [
          { label: 'PURPOSE', text: 'Margin multiplies each Company\'s Market count during Income and can absorb Corporate Clash loss.' },
          { label: 'CHOOSE', text: 'When a Margin gain would cross 9, take an eligible available Market and subtract 10 Margin while keeping the remainder, or remain at 9.' },
          { label: 'COMMON MISTAKE', text: 'Margin is tracked per Company. Do not combine two Companies before calculating Income.' },
        ],
      },
      {
        title: 'Prices and Landscapes',
        facts: [
          { label: 'RESULT', text: 'Food, Carbon, Research, Campaign, Clash, and Educate prices stay between 1 and 10.' },
          { label: 'WHY', text: 'The active Landscape can change Industry Market supply, matching Company Margin, and listed price tracks. The upcoming Landscape is public, so plan for it.' },
          { label: 'COMMON MISTAKE', text: 'A Landscape applies its signed change to every listed category exactly as shown; do not infer effects from its illustration.' },
        ],
      },
    ],
  },
  {
    id: 'corruption-and-obligations',
    title: 'Corruption and Obligations',
    summary: 'Corruption grants tempo and political leverage, but adds restrictive cards and expensive escape costs.',
    topics: [
      {
        title: 'Corruption',
        facts: [
          { label: 'RESULT', items: ['At 9 or more Corruption, your active turn has three Main Actions instead of two.', 'Most Corruption can determine Final Say when Justice does not produce one holder.', 'Playing a Corruption-keyword card gains 1 Corruption and draws an Obligation.'] },
          { label: 'COMMON MISTAKE', text: 'Not every effect that raises Corruption also draws an Obligation. The extra draw belongs specifically to playing a Corruption-keyword card unless printed text says otherwise.' },
        ],
      },
      {
        title: 'Obligations',
        facts: [
          { label: 'PURPOSE', text: 'Obligations occupy hand space and force you to address their authentic printed effect.' },
          { label: 'CHOOSE', text: 'Play an Obligation as a Main Action, or Shirk it as an Edge Action when timing allows.' },
          { label: 'PAY', text: 'Shirk costs 10 times your current Corruption in Capital.' },
          { label: 'RESULT', text: 'A played or Shirked Obligation returns to the bottom of the Obligation deck.' },
          { label: 'COMMON MISTAKE', text: 'Obligations cannot be Traded, Developed, Focused, or discarded normally.' },
        ],
      },
    ],
  },
  {
    id: 'final-say-and-ties',
    title: 'Final Say and Ties',
    summary: 'One visible holder resolves control ties, disputed order, and simultaneous Edge timing.',
    topics: [
      {
        title: 'Who has Final Say?',
        facts: [
          { label: 'RESULT', items: ['First: the controller of the Justice Seat.', 'If that does not produce one holder: the sole leader in Corruption.', 'Next: the sole leader in Negotiation keywords.', 'Finally: the active player.'] },
          { label: 'REMEMBER', text: 'Final Say is recomputed immediately when Justice control, Corruption, Negotiation, or the active player changes.' },
          { label: 'COMMON MISTAKE', text: 'A tie at one priority does not let the tied players share Final Say. Move to the next criterion until exactly one holder remains.' },
        ],
      },
      {
        title: 'What the holder decides',
        facts: [
          { label: 'PURPOSE', text: 'Settle tied State, Region, Council, and Industry control and order simultaneous Edge Actions.' },
          { label: 'CHOOSE', text: 'When prompted, select one of the tied legal candidates. The ruling lasts only while that exact tie remains.' },
          { label: 'WHY', text: 'Final Say can turn a tied majority into control, which can immediately alter Council powers, Immunity, or Power Grab qualification.' },
          { label: 'REMEMBER', text: 'Bribes for a ruling are allowed by the rulebook, but they are not a formal Trade and promises remain non-binding.' },
        ],
      },
    ],
  },
  {
    id: 'trading',
    title: 'Trading',
    summary: 'Build an exact exchange, obtain every required approval, and distinguish transfers from non-binding promises.',
    topics: [
      {
        title: 'What may be offered',
        facts: [
          { label: 'CHOOSE', text: 'Trades may include resources, hand cards, tableau cards, Margin, Market, States, use of a card, and stated favors or promises.' },
          { label: 'COMMON MISTAKE', text: 'Obligations, Final Say, and Immunity cannot be traded.' },
        ],
      },
      {
        title: 'Approval and completion',
        facts: [
          { label: 'PURPOSE', text: 'Make all immediate property changes explicit before anything moves.' },
          { label: 'CHOOSE', text: 'Every Nation giving or receiving property must approve. The active player must also approve, even when not otherwise involved.' },
          { label: 'RESULT', text: 'Only after all approvals do the listed transfers happen together. Received cards keep their Ready or used state and do not trigger effects that require an item to be gained.' },
          { label: 'WHY', text: 'Offered hand-card identities stay private to the necessary approvers until the accepted result becomes public.' },
          { label: 'COMMON MISTAKE', text: 'The immediate transfers are enforced, but future favors are not. An agreement does not bind a later choice.' },
        ],
      },
    ],
  },
  {
    id: 'worked-examples',
    title: 'Worked Examples',
    summary: 'Use the same declare, pay, choose, and result pattern for common calculations.',
    topics: [
      {
        title: 'Campaign 3 at price 5',
        facts: [
          { label: 'PURPOSE', text: 'Move 3 Support into one Council Seat.' },
          { label: 'PAY', text: '3 x 5 = 15 Capital.' },
          { label: 'CHOOSE', text: 'For example, take 2 Support from Capitalism and 1 from Statism, then choose Commerce as the only destination.' },
          { label: 'RESULT', text: 'Commerce gains all 3 Support; both source Bases lose the selected amounts.' },
          { label: 'COMMON MISTAKE', text: 'You cannot split the 3 Support between Commerce and Labor in the same Campaign.' },
        ],
      },
      {
        title: 'Income with two Companies',
        facts: [
          { label: 'CHOOSE', text: 'Company A has Margin 3 and 2 Market. Company B has Margin 2 and 1 Market. You control 2 Industries.' },
          { label: 'RESULT', text: 'Gain base 5 + (3 x 2) + (2 x 1) + (2 x 5) = 23 Capital.' },
          { label: 'REMEMBER', text: 'After gaining Income, you may spend 20 Capital for one eligible available Market.' },
        ],
      },
      {
        title: 'Military Clash won by 3',
        facts: [
          { label: 'CHOOSE', text: 'The attacker reveals 7 Focus and the defender reveals 4.' },
          { label: 'RESULT', text: 'The attacker wins by 3. If the target has 2 defender Influence, remove both and add 1 attacker Influence.' },
          { label: 'WHY', text: 'The difference removes opposition first; only the remainder becomes new Influence.' },
          { label: 'COMMON MISTAKE', text: 'Winning by 3 does not always mean placing 3 new Influence.' },
        ],
      },
    ],
  },
  {
    id: 'strategy-and-variants',
    title: 'Strategy and Variants',
    summary: 'Plan around the victory clock, public information, and the exact options selected for this room.',
    topics: [
      {
        title: 'Reliable planning ideas',
        facts: [
          { label: 'WHY', items: ['Build toward at least two arenas; standard victory rejects a one-arena pile of Power Grabs.', 'Check whether rivals can break a majority before your end-turn claim.', 'Use the upcoming Landscape, public prices, and used National tokens to plan a turn ahead.', 'Value Final Say when several control races are tied, but remember the holder can change immediately.'] },
          { label: 'COMMON MISTAKE', text: 'These are planning suggestions, not extra rules. Authentic card text may create a stronger line or a specific exception.' },
        ],
      },
      {
        title: 'Supported room options',
        facts: [
          { label: 'RESULT', items: ['STANDARD: normal threshold, at least two arenas.', 'LONG WAR: raises the normal total Power Grab requirement by 1.', 'TRIFECTA: replaces the standard victory test with at least 1 Power Grab in all three arenas.', 'RAGING IMPERIALS: Imperial defense commits one additional Politik card in every Clash.'] },
          { label: 'REMEMBER', text: 'The device identifies active options. Read them before formation because they change which fronts and Imperial targets matter.' },
        ],
      },
      {
        title: 'Rulebook-only variants',
        facts: [
          { label: 'REMEMBER', text: 'Draft Game and Team Game appear in the official rulebook but are not available as digital room options. The interface does not simulate partial versions of them.' },
        ],
      },
    ],
  },
];

export interface PolitikLessonsProps {
  startTour: () => void;
  showGoal: () => void;
}

export function PolitikLessons({ startTour, showGoal }: PolitikLessonsProps) {
  const [selectedId, setSelectedId] = useState(POLITIK_LESSONS[0].id);
  const selected = POLITIK_LESSONS.find((lesson) => lesson.id === selectedId) ?? POLITIK_LESSONS[0];

  return (
    <section className="pk-lessons" data-testid="politik-lessons" aria-labelledby="politik-lessons-title">
      <header className="pk-lessons-header">
        <div className="pk-lessons-heading">
          <span className="pk-lessons-kicker">LEARN POLITIK</span>
          <h2 id="politik-lessons-title">LESSON LIBRARY</h2>
          <p>Choose one subject. Each lesson tells you what to do, what it costs, and what changes.</p>
        </div>
        <div className="pk-lessons-actions" aria-label="Learning actions">
          <button type="button" data-testid="politik-lessons-show-goal" onClick={showGoal}>SHOW THE GOAL</button>
          <button type="button" className="pk-lessons-primary" data-testid="politik-lessons-start-tour" onClick={startTour}>START / RESUME FULL TUTORIAL</button>
        </div>
      </header>

      <div className="pk-lessons-layout">
        <nav className="pk-lessons-index" aria-label="Politik lesson index">
          <span className="pk-lessons-index-label">15 SHORT LESSONS</span>
          <ol>
            {POLITIK_LESSONS.map((lesson, index) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  className={selected.id === lesson.id ? 'pk-lessons-index-current' : undefined}
                  data-testid={`politik-lessons-index-${lesson.id}`}
                  aria-current={selected.id === lesson.id ? 'page' : undefined}
                  aria-controls="politik-lesson-panel"
                  onClick={() => setSelectedId(lesson.id)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <b>{lesson.title}</b>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <article
          id="politik-lesson-panel"
          className="pk-lessons-panel"
          data-testid={`politik-lesson-${selected.id}`}
          aria-labelledby={`politik-lesson-title-${selected.id}`}
        >
          <header className="pk-lessons-panel-header">
            <span className="pk-lessons-kicker">CORE RULES LESSON</span>
            <h2 id={`politik-lesson-title-${selected.id}`}>{selected.title}</h2>
            <p>{selected.summary}</p>
          </header>

          <div className="pk-lessons-topics">
            {selected.topics.map((topic, topicIndex) => (
              <section className="pk-lessons-topic" key={topic.title} data-testid={`politik-lesson-${selected.id}-topic-${topicIndex + 1}`}>
                <h3>{topic.title}</h3>
                <dl>
                  {topic.facts.map((fact, factIndex) => (
                    <div className="pk-lessons-fact" key={`${fact.label}-${factIndex}`}>
                      <dt>{fact.label}</dt>
                      <dd>
                        {fact.text && <p>{fact.text}</p>}
                        {fact.items && (
                          <ul>
                            {fact.items.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <footer className="pk-lessons-boundary" data-testid="politik-lessons-rulebook-boundary">
            <b>AUTHENTIC CARD AND RULEBOOK BOUNDARY</b>
            <p>This library summarizes the core procedures enforced by the digital table. Authentic printed card art governs each unique card and any exception. OCR text is only a hint. Enlarge an uncertain card, enter its printed values when asked, and use the guided record for a rare effect that is not structured in the interface.</p>
            <a href="/politik/rulebook.pdf" target="_blank" rel="noreferrer">OPEN OFFICIAL RULEBOOK</a>
          </footer>
        </article>
      </div>
    </section>
  );
}
