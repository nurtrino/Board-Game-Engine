export type PolitikTutorialMode = 'personal' | 'main';

export interface PolitikTutorialStep {
  chapter: string;
  title: string;
  body: string;
  tip?: string;
  selector?: string;
  mode?: PolitikTutorialMode;
}

interface TutorialContext {
  phase: 'setup' | 'playing' | 'ended';
  pendingKind?: string | null;
  players: number;
  longWar?: boolean;
  trifecta?: boolean;
  ragingImperials?: boolean;
}

function standardVictory(players: number): number {
  return players === 2 ? 4 : players <= 4 ? 3 : 2;
}

function setupSelector(context: TutorialContext, kind: string, selector: string): string | undefined {
  return context.pendingKind === kind ? selector : undefined;
}

function setupSteps(context: TutorialContext): PolitikTutorialStep[] {
  const required = standardVictory(context.players) + (context.longWar ? 1 : 0);
  return [
    {
      chapter: 'START HERE',
      title: 'BUILD THE NEW WORLD ORDER',
      body: 'Claim Power Grabs by controlling the world. Military needs 3 Regions, Political needs 4 Council Seats, and Corporate needs 4 Industries. Eligible Power Grabs are claimed only when a turn ends.',
      tip: `${required} total Power Grabs are required in this room${context.trifecta ? ', including one in every arena' : ', normally across at least two arenas'}.`,
    },
    {
      chapter: 'START HERE',
      title: 'TWO ACTIONS, MANY USES FOR EVERY CARD',
      body: 'Take two Main Actions and repeat an action if useful. At 9 Corruption you take three. A Politik card can resolve its printed effect or be committed face-down for its arena Focus during a Clash.',
      tip: 'Your private device protects hands and hidden Focus. The shared TV shows only public information.',
    },
    {
      chapter: 'FORM YOUR NATION',
      title: 'THE OPENING LANDSCAPE SETS THE ECONOMY',
      body: 'Before Nations form, the first Landscape changes Market pools, Company Margin, and listed prices. The next Landscape remains visible so everyone can plan for the next Refresh.',
      selector: setupSelector(context, 'landscape', '[data-pk-tutorial="setup-landscape"]'),
    },
    {
      chapter: 'FORM YOUR NATION',
      title: 'KEEP OR REPLACE THE SIX POLITIK CARDS',
      body: 'You drew six Politik cards and one Startup Company. Open any card at full size. Keep all six Politik cards or replace all six once; your Startup always stays.',
      selector: setupSelector(context, 'mulligan', '[data-pk-tutorial="setup-hand"]'),
    },
    {
      chapter: 'FORM YOUR NATION',
      title: 'CHOOSE A NATION',
      body: 'Your Nation sets starting Capital, Carbon, Food, Support, and Leaders. It does not lock your victory path. Inspect both authentic cards before choosing.',
      selector: setupSelector(context, 'nation', '[data-pk-tutorial="setup-nation-choices"]'),
    },
    {
      chapter: 'FORM YOUR NATION',
      title: 'CHOOSE STARTING PROPAGANDA',
      body: 'Its Base icons decide where Support may begin, what Rally produces, and Broadcast strength. A printed Corruption icon immediately adds 1 Corruption and draws an Obligation.',
      selector: setupSelector(context, 'nation', '[data-pk-tutorial="setup-propaganda-choices"]'),
    },
    {
      chapter: 'FORM YOUR NATION',
      title: 'PLACE SUPPORT IN MATCHING BASES',
      body: 'Base Support pays for new Propaganda or moves into exactly one Council Seat through Campaign. Once Support enters the Council it no longer has a Base identity.',
      selector: setupSelector(context, 'nation', '[data-pk-tutorial="setup-support"]'),
    },
    {
      chapter: 'FORM YOUR NATION',
      title: 'CHOOSE LEADERS BY ARENA',
      body: 'A matching Leader can replace the Carbon declaration cost of a Clash. Matching Leaders committed later each add 1 Focus. Assign the exact total printed on your Nation.',
      selector: setupSelector(context, 'nation', '[data-pk-tutorial="setup-leaders"]'),
    },
    {
      chapter: 'OPENING POSITION',
      title: 'TAKE ONE UNIQUE SETUP BONUS',
      body: 'Eligible players choose from last player backward: 8 Capital, 1 Food, 1 Carbon, Research 1, or one Exchange at current prices. Once claimed, that bonus is unavailable to later choosers.',
      selector: setupSelector(context, 'setup_bonus', '[data-pk-tutorial="setup-bonuses"]'),
    },
    {
      chapter: 'OPENING POSITION',
      title: 'BEGIN WITH 8 INFLUENCE',
      body: 'Choose one highlighted ordinary State, place 8 Influence, and immediately gain its printed Food, Carbon, or Research benefit. Dogmatic may choose a Broadcast Station but skips its normal Support capture benefit.',
      selector: setupSelector(context, 'start_state', '[data-testid="politik-setup-start-state"]'),
      mode: 'main',
    },
    {
      chapter: 'OPENING POSITION',
      title: 'THE GAME WILL NEVER SKIP A PRIVATE CHOICE',
      body: 'Finish the highlighted setup prompt. Other players see only that you are choosing; your unconfirmed Nation, Propaganda, hand, and allocations remain private.',
      tip: 'Run the full learn-to-play tour again from HELP after setup to learn every action and contest.',
    },
  ];
}

function playingSteps(context: TutorialContext): PolitikTutorialStep[] {
  const required = standardVictory(context.players) + (context.longWar ? 1 : 0);
  const variants = [context.longWar && 'LONG WAR', context.trifecta && 'TRIFECTA', context.ragingImperials && 'RAGING IMPERIALS'].filter(Boolean).join(' / ');
  return [
    {
      chapter: 'OBJECTIVE',
      title: 'WIN THROUGH AT LEAST TWO ARENAS',
      body: 'Control 3 Regions for a Military Power Grab, 4 Council Seats for Political, or 4 Industries for Corporate. Power Grabs are permanent and checked when your turn ends.',
      tip: `This room requires ${required} total${context.trifecta ? ' and one in every arena' : ' across at least two arenas'}${variants ? `. Active variants: ${variants}.` : '.'}`,
    },
    {
      chapter: 'OBJECTIVE',
      title: 'PRIVATE DEVICE, PUBLIC TABLE',
      body: 'Your hand, setup choices, and unrevealed Clash commitment live only here. Resources, hand counts, Influence, Support, Companies, Markets, Margin, leaders, Corruption, and played cards are public on the table.',
    },
    {
      chapter: 'READ YOUR DEVICE',
      title: 'IDENTITY, FINAL SAY, AND VARIANTS',
      body: 'Your Nation and Starting Propaganda stay visible here. FINAL SAY chooses winners of live ties. It comes from Justice, then most Corruption, then most Negotiation, then the active Nation.',
      selector: '[data-pk-tour="identity"]',
    },
    {
      chapter: 'READ YOUR DEVICE',
      title: 'RESOURCES AND PUBLIC STATUS',
      body: 'Capital pays cards and actions, Carbon pays Clashes and printed construction, and Food buys Leaders. At 9 Corruption you gain a third Main Action, but corrupt effects can also add Obligations.',
      selector: '[data-pk-tour="resources"]',
    },
    {
      chapter: 'READ YOUR DEVICE',
      title: 'YOUR PERSONAL TABLEAU',
      body: 'This physical layout holds your Nation, Propaganda, Companies, Assets, Events, Leaders, resources, Markets, Margin, and ready status. Cards marked used cannot pay an Activate cost until readied.',
      selector: '[data-pk-tutorial="personal-tableau"]',
      mode: 'personal',
    },
    {
      chapter: 'READ YOUR DEVICE',
      title: 'ONE TAP BETWEEN PERSONAL AND MAIN',
      body: 'Switch boards whenever you want. An action that needs a State or Council target switches automatically and also shows a readable list of every legal target.',
      selector: '[data-pk-tour="switch"]',
      mode: 'main',
    },
    {
      chapter: 'CONTROL THE BOARD',
      title: 'MILITARY: STATES, REGIONS, AND STATIONS',
      body: 'Any Influence controls a State. A Region needs at least 2 controlled States and the most States there. Broadcast Stations connect Regions, count as States, grant Support when captured, and provide Signal or Noise.',
      selector: '[data-pk-tutorial="board-map"]',
      mode: 'main',
    },
    {
      chapter: 'CONTROL THE BOARD',
      title: 'POLITICAL: BASES AND COUNCIL SEATS',
      body: 'Support begins in four ideological Bases. Campaign moves it into one Seat. Have Support and the most there to control that Seat; Rally resolves controlled Seat powers from Chair through Defense.',
      selector: '.pk-main-layer',
      mode: 'main',
    },
    {
      chapter: 'CONTROL THE BOARD',
      title: 'CORPORATE: COMPANIES AND INDUSTRIES',
      body: 'Add each Industry Market across all your Companies. The most Market controls that Industry. Companies earn Income from Margin times Market; Assets add Industries, abilities, and printed Margin.',
      selector: '[data-pk-tutorial="market-pools"]',
    },
    {
      chapter: 'TAKE A TURN',
      title: 'TWO MAIN ACTIONS',
      body: 'Take any two Main Actions and repeat one if useful. At 9 or more Corruption, take three. A pending prompt must finish before another action begins.',
      selector: '[data-pk-tutorial="turn-status"]',
    },
    {
      chapter: 'TAKE A TURN',
      title: 'ONLY LEGAL ACTIONS ARE ACTIVE',
      body: 'Choose one of eight actions. A disabled button states exactly what is missing. Selecting an action opens its costs, choices, projected totals, and confirmation below the grid.',
      selector: '[data-pk-tutorial="action-grid"]',
    },
    {
      chapter: 'TAKE A TURN',
      title: 'PLAY A CARD',
      body: 'Open a hand card, enlarge the authentic art, and follow its printed requirements, costs, then effect. Verified cards fill themselves. If digital text is uncertain, enter the printed values before playing.',
      selector: '[data-testid="politik-action-play"]',
    },
    {
      chapter: 'TAKE A TURN',
      title: 'USE A READY ABILITY',
      body: 'Choose a controlled Company, Asset, Propaganda, or Broadcast Station. Mark Activate only when the authentic card prints it as a cost; that turns the source used. Other ability costs do not automatically use it.',
      selector: '[data-testid="politik-action-ability"]',
    },
    {
      chapter: 'TAKE A TURN',
      title: 'NATIONAL ACTION TOKENS CYCLE',
      body: 'Income earns Capital, Rally gains Base Support and resolves Council powers, Produce gains State and Region benefits, and Refresh readies cards while advancing Landscapes. Each token stays used until all four clear together.',
      selector: '[data-testid="politik-action-national"]',
    },
    {
      chapter: 'TAKE A TURN',
      title: 'X ACTIONS USE LIVE PRICES',
      body: 'Educate buys Leaders with Food. Research buys cards with Capital. Campaign moves Base Support into one Seat. Exchange buys or sells Food and Carbon. Choose whole amounts and review the final cost before confirming.',
      selector: '[data-pk-tutorial="x-actions"]',
    },
    {
      chapter: 'CLASHES',
      title: 'DECLARE A CONTEST',
      body: 'Military contests a State, Political contests another Nation’s Support, and Corporate contests Companies. Pay the current Clash price in Carbon or one matching Leader, then choose the exact target.',
      selector: '[data-testid="politik-action-clash"]',
    },
    {
      chapter: 'CLASHES',
      title: 'COMMIT FOCUS IN SECRET',
      body: 'Commit any Politik cards and enter their printed Focus for this arena. Extra matching Leaders add 1 each. In Military, controlled Influence in directly adjacent locations may also add 1 Focus each.',
      tip: 'Human commitments stay private until both sides finish. Imperial targets use automatic top-deck defense.',
      selector: '[data-testid="politik-action-clash"]',
    },
    {
      chapter: 'CLASHES',
      title: 'THE DIFFERENCE BECOMES CONTROL',
      body: 'The winner’s Focus difference moves Influence, Support, or Corporate value. Political capture cannot exceed starting target Support. In Corporate, the loser allocates Margin and eligible Market losses.',
      selector: '[data-pk-tutorial="board-map"]',
      mode: 'main',
    },
    {
      chapter: 'EDGE TIMING',
      title: 'ANY NATION MAY RESPOND',
      body: 'The four Edge Actions are play an Edge Event, use an Edge ability, Shirk an Obligation, and Trade. RESPONSES opens an ordered window; the requester acts first and everyone explicitly acts or passes.',
      selector: '[data-pk-tutorial="edge-tools"]',
    },
    {
      chapter: 'EDGE TIMING',
      title: 'OBLIGATIONS AND TRADES',
      body: 'Obligations count toward the 10-card limit and cannot be Traded, Developed, Focused, or discarded normally. Play one as a Main Action or Shirk it for 10 Capital per current Corruption. Trades move only after every required approval.',
      selector: '[data-pk-tutorial="edge-tools"]',
    },
    {
      chapter: 'STAY ORIENTED',
      title: 'YOUR HAND IS ALWAYS AVAILABLE',
      body: 'Tap any card for authentic art and a full-height close-up. HAND opens the whole collection. DECKS shows public deck counts, your ready and used tableau cards, and both visible Landscapes.',
      selector: '[data-pk-tour="hand"]',
      mode: 'personal',
    },
    {
      chapter: 'STAY ORIENTED',
      title: 'END TURN CHECKS THE WORLD',
      body: 'After every required Main Action, END TURN discards resolved Events, checks all eligible Power Grabs, checks victory, and passes control. Claimed Power Grabs can never be lost.',
      selector: '[data-pk-tour="end"]',
    },
    {
      chapter: 'STAY ORIENTED',
      title: 'HELP IS THE COMPLETE LESSON LIBRARY',
      body: 'Replay this tutorial, learn any system by topic, search every authentic card, inspect Nations and Starting Propaganda, or open the official rulebook. You never need to remember a rule before playing.',
      selector: '[data-pk-tour="help"]',
    },
    {
      chapter: 'STAY ORIENTED',
      title: 'READY TO BUILD YOUR NATION',
      body: 'Follow the action panel and every highlighted private prompt. Read authentic card art when an unusual effect appears; the guided resolver records uncommon effects publicly instead of silently guessing.',
      tip: 'A good first turn is usually about fixing the resource, Support, or board position your Nation needs next.',
    },
  ];
}

function endedSteps(context: TutorialContext): PolitikTutorialStep[] {
  return [
    {
      chapter: 'GAME COMPLETE',
      title: 'THE NEW WORLD ORDER IS SET',
      body: 'The winner reached this room’s Power Grab requirement and represented the required arenas. Power Grabs were checked at the end of turns and remained permanent after being claimed.',
    },
    {
      chapter: 'GAME COMPLETE',
      title: 'REVIEW ANY SYSTEM',
      body: 'HELP still contains the full lesson library, searchable authentic cards, examples, variants, and official rulebook for your next game.',
      selector: '[data-pk-tour="help"]',
    },
  ];
}

export function buildPolitikTutorial(context: TutorialContext): PolitikTutorialStep[] {
  if (context.phase === 'setup') return setupSteps(context);
  if (context.phase === 'ended') return endedSteps(context);
  return playingSteps(context);
}
