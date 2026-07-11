export type FeastTutorialMode = 'home' | 'actions' | 'cards';

export interface FeastTutorialStep {
  chapter: string;
  title: string;
  body: string;
  tip?: string;
  selector?: string;
  mode?: FeastTutorialMode;
}

export const FEAST_TUTORIAL: readonly FeastTutorialStep[] = [
  {
    chapter: 'THE SAGA',
    title: 'BUILD THE MOST VALUABLE ESTATE',
    body: 'Gather goods, explore new lands, build ships and houses, and cover negative spaces on your boards. Ships, emigration, animals, buildings, exploration, occupations, silver, and final income score positive points.',
    tip: 'Every uncovered minus-one cell and every Thing Penalty reduces your final score.',
  },
  {
    chapter: 'READ YOUR DEVICE',
    title: 'YOUR ROUND AND CURRENT DECISION',
    body: 'The header always shows the round, phase, whose turn it is, how many Vikings you can place, and the next decision that must be completed.',
    selector: '[data-feast-tour="status"]',
  },
  {
    chapter: 'READ YOUR DEVICE',
    title: 'THREE VIEWS, ONE TABLE',
    body: 'HOME is your puzzle board and supply. ACTION BOARD is where Vikings work. CARDS holds your private occupation hand, played occupations, weapons, and complete references.',
    selector: '[data-feast-tour="modes"]',
  },
  {
    chapter: 'YOUR HOME',
    title: 'THE PUZZLE IS YOUR ECONOMY',
    body: 'Place green and blue goods, silver, and ore on the authentic grid. A ghost shows the exact cells before you confirm. Green goods may not touch green goods orthogonally. Blue goods, silver, and ore may touch.',
    tip: 'Rotate before confirming. A disabled confirmation explains overlap, color adjacency, board bounds, and income-diagonal requirements.',
    selector: '[data-testid="feast-home-board"]',
    mode: 'home',
  },
  {
    chapter: 'YOUR HOME',
    title: 'OPEN THE INCOME DIAGONAL IN ORDER',
    body: 'To cover an income number, all valid cells left of it, below it, and in its lower-left rectangle must already be covered. The smallest visible number is the silver income that board produces.',
    selector: '[data-feast-tour="income"]',
    mode: 'home',
  },
  {
    chapter: 'YOUR HOME',
    title: 'ENCLOSE A BONUS WITHOUT COVERING IT',
    body: 'Leave a printed bonus cell open and cover every valid neighbor around it. You receive that item in each Bonus phase. Covering the printed symbol gives up that bonus.',
    selector: '[data-feast-tour="bonuses"]',
    mode: 'home',
  },
  {
    chapter: 'YOUR SUPPLY',
    title: 'EVERY TILE IS A REAL COMPONENT',
    body: 'Your supply shows every good with its authentic shape, color, and reverse. Orange upgrades to red, red to green, and green to blue while keeping the same shape. Tap a tile to inspect, rotate, or place it.',
    selector: '[data-feast-tour="goods"]',
    mode: 'home',
  },
  {
    chapter: 'TAKE AN ACTION',
    title: 'THE COLUMN IS THE WORKER COST',
    body: 'Column one takes 1 Viking, column two takes 2, column three takes 3, and column four takes 4. A space can be occupied once each round. Tap a highlighted space on the real board to review its ordered effects.',
    selector: '[data-testid="feast-action-board"]',
    mode: 'actions',
  },
  {
    chapter: 'TAKE AN ACTION',
    title: 'COLUMN BONUSES ADD OCCUPATIONS',
    body: 'A third-column action draws a dark occupation before it resolves. A fourth-column action lets you play one occupation before or after the printed action. The decision panel never skips that timing choice.',
    selector: '[data-feast-tour="action-detail"]',
    mode: 'actions',
  },
  {
    chapter: 'TAKE AN ACTION',
    title: 'ONLY LEGAL SPACES ARE ACTIVE',
    body: 'Occupied, unaffordable, or unavailable spaces are dimmed and state the exact reason. Requirements include Vikings, goods, silver, ships, mountain contents, exploration availability, and limited buildings.',
    selector: '[data-feast-tour="action-detail"]',
    mode: 'actions',
  },
  {
    chapter: 'TAKE AN ACTION',
    title: 'END EVERY TURN EXPLICITLY',
    body: 'Resolve the action and any occupation choices, use any legal anytime actions, then press END TURN. Passing ends your worker placement for the round but still finishes through the same clear turn control.',
    selector: '[data-feast-tour="end-turn"]',
    mode: 'actions',
  },
  {
    chapter: 'SAILING',
    title: 'EACH SHIP OPENS A DIFFERENT PATH',
    body: 'Whaling boats hunt whales. Knarrs trade green goods overseas and buy special tiles. Longships raid, pillage, plunder, and reach distant lands. The same ship may serve several actions until it emigrates.',
    selector: '[data-feast-tour="ships"]',
    mode: 'home',
  },
  {
    chapter: 'ADVENTURE',
    title: 'THE DICE PANEL SHOWS THE WHOLE RESULT',
    body: 'Raid and pillage want high rolls. Hunting, snaring, and whaling want low rolls. The panel shows rolls remaining, ore modifiers, every legal resource or weapon payment, success loot, and failure compensation before you decide.',
    tip: 'A reroll replaces the previous result. A whaling result of zero succeeds immediately.',
    selector: '[data-feast-tour="decision"]',
    mode: 'actions',
  },
  {
    chapter: 'EXPLORATION',
    title: 'NEW LANDS ARE NEW PUZZLES',
    body: 'Claim an available exploration face with the required ship. It joins HOME as another exact grid with its own negative cells, income, and bonuses. Unclaimed faces flip during the printed rounds and the other faces gain silver.',
    selector: '[data-feast-tour="boards"]',
    mode: 'home',
  },
  {
    chapter: 'FEAST',
    title: 'FEED EVERY OPEN TABLE SPACE',
    body: 'Place orange food, red food, and one-silver coins on the Banquet Table. Orange may not touch orange and red may not touch red. Only one tile of each named food may use its efficient horizontal orientation.',
    tip: 'Every uncovered required space gives one permanent Thing Penalty worth minus 3 points.',
    selector: '[data-feast-tour="feast"]',
    mode: 'home',
  },
  {
    chapter: 'ANIMALS',
    title: 'BREEDING ALTERNATES PREGNANCY AND BIRTH',
    body: 'With at least two non-pregnant sheep or cattle, turn one pregnant. In a later breeding phase, every pregnant animal gives birth and turns back. A single pregnant animal still gives birth.',
    selector: '[data-feast-tour="animals"]',
    mode: 'home',
  },
  {
    chapter: 'MOUNTAINS',
    title: 'TAKE FROM THE ARROW END',
    body: 'Mountain items always leave from left to right. Split actions must use different strips. At the end of each round the leftmost item ages away from every strip and one new strip appears.',
    selector: '[data-feast-tour="mountains"]',
    mode: 'actions',
  },
  {
    chapter: 'OCCUPATIONS',
    title: 'THE APPENDIX EXPLAINS ALL 190 CARDS',
    body: 'Open any card for its authentic art, timing category, point value, and full official appendix clarification. Immediate effects happen once, Anytime effects remain available, Each Time effects trigger repeatedly, and As Soon As effects trigger once.',
    selector: '[data-feast-tour="cards"]',
    mode: 'cards',
  },
  {
    chapter: 'SOLO',
    title: 'TWO COLORS BLOCK ALTERNATING ROUNDS',
    body: 'In solo play, one worker color remains on the action board while the other color works. At round end, the older color returns and the newly placed color remains to block the next round.',
    selector: '[data-feast-tour="solo-blockers"]',
    mode: 'actions',
  },
  {
    chapter: 'FINISH THE SAGA',
    title: 'THE FINAL ROUND ENDS AFTER THE FEAST',
    body: 'There is no final Bonus phase. Place remaining legal goods and building resources, then review every score category. The result highlights each uncovered negative cell so the total is fully auditable.',
    selector: '[data-feast-tour="score"]',
    mode: 'home',
  },
];
