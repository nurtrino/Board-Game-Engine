import { useEffect, useState, type ReactNode } from 'react';

interface FeastLesson {
  id: string;
  chapter: string;
  title: string;
  summary: string;
  points: string[];
  visual: ReactNode;
}

const Cell = ({ tone = 'empty', label, wide, tall }: { tone?: string; label?: string; wide?: number; tall?: number }) => (
  <span
    aria-hidden="true"
    className={`ft-demo-cell ${tone}`}
    style={{ gridColumn: `span ${wide ?? 1}`, gridRow: `span ${tall ?? 1}` }}
  >
    {label}
  </span>
);

function DemoControls({
  label,
  status,
  tryLabel,
  onTry,
  onReset,
  children,
}: {
  label: string;
  status: string;
  tryLabel: string;
  onTry: () => void;
  onReset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="ft-demo-controls">
      <div role="group" aria-label={label}>
        {children}
        <button type="button" className="try" onClick={onTry}>{tryLabel}</button>
        <button type="button" onClick={onReset}>RESET</button>
      </div>
      <output aria-live="polite">{status}</output>
    </div>
  );
}

function PlacementVisual() {
  const [rotation, setRotation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [attempted, setAttempted] = useState(false);
  const legal = rotation === 'vertical';
  const candidate = new Set(rotation === 'horizontal' ? [8, 9] : [3, 9]);
  const occupied = new Set([7, 19]);
  const status = attempted
    ? legal
      ? 'Legal placement committed: the green tile stays inside the board and only meets green at a corner.'
      : 'Placement blocked: the preview shares an edge with the green tile already at row 2, column 2.'
    : legal
      ? 'The vertical preview is legal. Try placing it to commit the tile.'
      : 'The horizontal preview is illegal. Rotate it until no green edges touch.';

  const reset = () => {
    setRotation('horizontal');
    setAttempted(false);
  };

  return (
    <div className="ft-demo-practice ft-demo-placement" aria-label="Interactive legal tile placement and rotation demonstration">
      <figure className="ft-demo-asset ft-demo-board-asset">
        <img src="/feast/home-long.webp" alt="Authentic A Feast for Odin long home board" />
        <figcaption>YOUR AUTHENTIC HOME BOARD</figcaption>
      </figure>
      <div className="ft-demo-practice-panel">
        <div className="ft-demo-mini-board" role="img" aria-label={`A green tile preview in ${rotation} orientation. ${status}`}>
          {Array.from({ length: 24 }, (_, index) => {
            const tone = occupied.has(index)
              ? 'green fixed'
              : candidate.has(index)
                ? `green preview ${legal ? 'legal' : 'bad'} ${attempted && legal ? 'committed' : ''}`
                : '';
            return <Cell key={index} tone={tone} />;
          })}
        </div>
        <div className="ft-demo-legend" aria-hidden="true">
          <span><i className="fixed" />PLACED</span>
          <span><i className={legal ? 'legal' : 'bad'} />PREVIEW</span>
        </div>
        <DemoControls
          label="Placement practice controls"
          status={status}
          tryLabel="TRY PLACING"
          onTry={() => setAttempted(true)}
          onReset={reset}
        >
          <button
            type="button"
            aria-pressed={rotation === 'vertical'}
            onClick={() => {
              setRotation((current) => current === 'horizontal' ? 'vertical' : 'horizontal');
              setAttempted(false);
            }}
          >
            ROTATE 90°
          </button>
        </DemoControls>
      </div>
    </div>
  );
}

const ACTION_STEPS = [
  { label: 'OPEN SPACE', detail: 'Your blue Viking may use this printed action space.' },
  { label: 'BLOCKED', detail: 'A rival red Viking occupies it, so nobody may use that printed space again this round.' },
  { label: 'IMITATION', detail: 'The grey extension copies the occupied action. Pay the copied column’s normal Viking cost.' },
  { label: 'PASS', detail: 'Passing ends your worker placement for this round; other players may keep acting.' },
  { label: 'END TURN', detail: 'After the action and any Anytime effects, End Turn hands control to the next active player.' },
] as const;

function ActionsVisual() {
  const [step, setStep] = useState(0);
  const current = ACTION_STEPS[step];
  return (
    <div className="ft-demo-practice ft-demo-actions" aria-label="Interactive action blocking, imitation, passing, and ending a turn demonstration">
      <div className="ft-demo-action-scene">
        <img src="/feast/action-board.webp" alt="Authentic A Feast for Odin action board" />
        <span className={`ft-demo-worker blue ${step > 0 ? 'dim' : ''}`} aria-hidden="true" />
        {step >= 1 && step < 3 && <span className="ft-demo-worker red" aria-hidden="true" />}
        {step === 2 && (
          <figure className="ft-demo-imitation">
            <img src="/feast/extensions/columns-2.webp" alt="Column two imitation extension" />
            <span className="ft-demo-worker grey" aria-hidden="true" />
          </figure>
        )}
        {step === 3 && <div className="ft-demo-action-stamp pass">PASSED</div>}
        {step === 4 && <div className="ft-demo-action-stamp end">TURN COMPLETE</div>}
      </div>
      <div className="ft-demo-practice-panel">
        <ol className="ft-demo-stepper" aria-label="Turn sequence">
          {ACTION_STEPS.map((entry, index) => (
            <li key={entry.label} className={index === step ? 'on' : ''} aria-current={index === step ? 'step' : undefined}>
              <b>{index + 1}</b><span>{entry.label}</span>
            </li>
          ))}
        </ol>
        <DemoControls
          label="Action sequence practice controls"
          status={`${current.label}: ${current.detail}`}
          tryLabel="TRY NEXT STEP"
          onTry={() => setStep((value) => Math.min(ACTION_STEPS.length - 1, value + 1))}
          onReset={() => setStep(0)}
        />
      </div>
    </div>
  );
}

function EstateCellsVisual({ mode }: { mode: 'income' | 'bonus' }) {
  const [stage, setStage] = useState(0);
  const isIncome = mode === 'income';
  const maxStage = isIncome ? 3 : 2;
  const bonusCovered = stage === 0 ? 0 : stage === 1 ? 4 : 8;
  const bonusNeighbors = [0, 1, 2, 3, 5, 6, 7, 8];
  const income = [3, 3, 4, 5][stage];
  const status = isIncome
    ? stage === 3
      ? 'Income 5 is open: every required lower-left foundation cell is covered while the printed 5 stays visible.'
      : `Income is ${income}. Cover the highlighted foundation in order; skipping ahead is not legal.`
    : stage === 2
      ? 'Bonus enclosed: all eight valid neighbors are covered and the mead icon remains open, so it pays every Bonus phase.'
      : stage === 1
        ? 'Four neighbors are covered, but the enclosure is incomplete. No bonus is produced yet.'
        : 'The printed mead cell is open. Cover every valid neighboring cell without covering the icon.';

  return (
    <div className="ft-demo-practice ft-demo-estate" aria-label={`Interactive ${mode} board cell demonstration`}>
      <figure className="ft-demo-asset ft-demo-board-asset">
        <img src="/feast/home-short.webp" alt="Authentic A Feast for Odin short home board" />
        <figcaption>{isIncome ? 'FOLLOW THE PRINTED DIAGONAL' : 'LEAVE THE PRINTED BONUS OPEN'}</figcaption>
      </figure>
      <div className="ft-demo-practice-panel">
        {isIncome ? (
          <div className="ft-demo-income-grid" role="img" aria-label={status}>
            <Cell tone={stage >= 3 ? 'covered pulse' : stage === 2 ? 'target' : ''} />
            <Cell tone={stage >= 3 ? 'covered pulse' : ''} />
            <Cell tone="income open" label="5" />
            <Cell /><Cell />
            <Cell tone={stage >= 2 ? 'covered pulse' : stage === 1 ? 'target' : ''} />
            <Cell tone="income covered" label="4" />
            <Cell /><Cell /><Cell />
            <Cell tone="income covered" label="3" />
            <Cell /><Cell /><Cell /><Cell />
          </div>
        ) : (
          <div className="ft-demo-bonus-grid" role="img" aria-label={status}>
            {Array.from({ length: 9 }, (_, index) => index === 4
              ? <span key={index} className="bonus"><img src="/feast/goods/mead.webp" alt="" /><b>MEAD</b></span>
              : <Cell key={index} tone={bonusNeighbors.indexOf(index) < bonusCovered ? 'covered pulse' : 'target'} />)}
          </div>
        )}
        <DemoControls
          label={`${mode} practice controls`}
          status={status}
          tryLabel={isIncome ? 'TRY COVERING NEXT' : 'TRY ENCLOSING'}
          onTry={() => setStage((value) => Math.min(maxStage, value + 1))}
          onReset={() => setStage(0)}
        />
      </div>
    </div>
  );
}

function FeastVisual() {
  const [stage, setStage] = useState(0);
  const gaps = [4, 1, 0][stage];
  const penalty = gaps * 3;
  const status = stage === 0
    ? 'Four uncovered required cells create four Thing Penalties: −12 points.'
    : stage === 1
      ? 'Legal food and silver cover most of the table. One remaining gap creates one Thing Penalty: −3 points.'
      : 'The emigrated longship permanently covers its feast position and scores 21 points. This example now has no gap.';
  return (
    <div className="ft-demo-practice ft-demo-feast" aria-label="Interactive Feast penalties and emigration demonstration">
      <div className="ft-demo-feast-scene">
        <img className="table" src="/feast/banquet-table-long.webp" alt="Authentic long Banquet Table" />
        <div className={`ft-demo-food-layout stage-${stage}`} aria-hidden="true">
          {stage >= 1 && <><img className="peas" src="/feast/goods/peas.webp" alt="" /><img className="milk" src="/feast/goods/milk.webp" alt="" /><span className="coin">1</span></>}
          {stage >= 2 && <img className="emigrant" src="/feast/ships/longship-front.webp" alt="" />}
          {Array.from({ length: gaps }, (_, index) => <span className="gap" key={index}>−3</span>)}
        </div>
        <div className="ft-demo-penalty-meter" aria-hidden="true"><span>OPEN CELLS {gaps}</span><b className={penalty ? 'negative' : ''}>{penalty ? `−${penalty}` : '0'} VP</b></div>
      </div>
      <div className="ft-demo-practice-panel">
        <div className="ft-demo-rule-chips" aria-hidden="true"><span>ORANGE ≠ ORANGE</span><span>RED ≠ RED</span><span>SILVER SEPARATES</span><span>EMIGRATION COVERS</span></div>
        <DemoControls
          label="Feast practice controls"
          status={status}
          tryLabel="TRY NEXT FEAST"
          onTry={() => setStage((value) => Math.min(2, value + 1))}
          onReset={() => setStage(0)}
        />
      </div>
    </div>
  );
}

function DiceVisual() {
  const [action, setAction] = useState<'raid' | 'hunt'>('raid');
  const [rollIndex, setRollIndex] = useState(-1);
  const [paid, setPaid] = useState(false);
  const rolls = action === 'raid' ? [4, 7, 2] : [5, 3, 1];
  const roll = rollIndex < 0 ? null : rolls[rollIndex % rolls.length];
  const final = roll === null ? null : action === 'raid' && paid ? roll + 2 : roll;
  const success = final !== null && (action === 'raid' ? final > 5 : paid);
  const status = roll === null
    ? `${action === 'raid' ? 'Raiding wants a high d8 roll' : 'Hunting wants a low d8 roll'}. Try a roll, then inspect the exact payment.`
    : action === 'raid'
      ? paid
        ? `Paid 1 stone and 1 long sword: ${roll} + 2 = ${final}. The battle succeeds and may take loot worth at most ${final}.`
        : `Rolled ${roll}. Results of 5 or less must fail; payment can raise the battle result.`
      : paid
        ? `Paid exactly ${roll}: ${Math.min(3, roll)} wood + ${Math.max(0, roll - 3)} bow${Math.max(0, roll - 3) === 1 ? '' : 's'}. Hunting succeeds.`
        : `Rolled ${roll}. To succeed, allocate exactly ${roll} total wood and bow cards.`;

  const selectAction = (next: 'raid' | 'hunt') => {
    setAction(next);
    setRollIndex(-1);
    setPaid(false);
  };

  return (
    <div className="ft-demo-practice ft-demo-dice" aria-label="Interactive dice roll and payment demonstration">
      <div className="ft-demo-dice-scene">
        <figure className={action === 'raid' ? 'on' : ''}>
          <img src="/feast/ships/longship-front.webp" alt="Longship used for raiding" />
          <figcaption><b>RAID · HIGH</b><span>d8 + stone + long sword</span></figcaption>
        </figure>
        <div className={`ft-demo-die ${success ? 'success' : ''}`} role="img" aria-label={roll === null ? 'Die has not been rolled' : `Die result ${roll}, final result ${final}`}>
          <span>{final ?? '?'}</span><small>{paid && action === 'raid' ? `${roll} + 2` : roll === null ? 'ROLL' : 'RESULT'}</small>
        </div>
        <figure className={action === 'hunt' ? 'on' : ''}>
          <img src="/feast/goods/game-meat.webp" alt="Game meat reward for successful hunting" />
          <figcaption><b>HUNT · LOW</b><span>pay result with wood + bows</span></figcaption>
        </figure>
      </div>
      <div className="ft-demo-practice-panel">
        {roll !== null && (
          <div className="ft-demo-payment" aria-hidden="true">
            <span>PHYSICAL ROLL <b>{roll}</b></span><i>→</i>
            <span>PAYMENT <b>{paid ? action === 'raid' ? '+2' : roll : '0'}</b></span><i>→</i>
            <span>OUTCOME <b className={success ? 'success' : ''}>{success ? 'SUCCESS' : 'DECIDE'}</b></span>
          </div>
        )}
        <DemoControls
          label="Dice action practice controls"
          status={status}
          tryLabel={roll === null ? 'TRY A ROLL' : 'TRY A REROLL'}
          onTry={() => {
            setRollIndex((value) => value + 1);
            setPaid(false);
          }}
          onReset={() => {
            setRollIndex(-1);
            setPaid(false);
          }}
        >
          <button type="button" className={action === 'raid' ? 'selected' : ''} aria-pressed={action === 'raid'} onClick={() => selectAction('raid')}>RAID HIGH</button>
          <button type="button" className={action === 'hunt' ? 'selected' : ''} aria-pressed={action === 'hunt'} onClick={() => selectAction('hunt')}>HUNT LOW</button>
          <button type="button" disabled={roll === null} onClick={() => setPaid(true)}>{action === 'raid' ? 'PAY STONE + SWORD' : 'PAY EXACT RESULT'}</button>
        </DemoControls>
      </div>
    </div>
  );
}

function BreedingVisual() {
  return (
    <div className="ft-demo-breed" aria-label="Animal breeding timeline">
      <div><span className="animal">SHEEP</span><b>+</b><span className="animal">SHEEP</span></div><i>BREEDING PHASE</i><div><span className="animal pregnant">PREGNANT</span><b>+</b><span className="animal">SHEEP</span></div><i>NEXT BREEDING</i><div><span className="animal">SHEEP</span><b>+</b><span className="animal">SHEEP</span><b>+</b><span className="animal">NEWBORN</span></div>
    </div>
  );
}

function PhaseVisual() {
  const phases = ['NEW VIKING', 'HARVEST', 'EXPLORE', 'WEAPON', 'ACTIONS', 'START PLAYER', 'INCOME', 'BREEDING', 'FEAST', 'BONUS', 'MOUNTAINS', 'RETURN'];
  return <div className="ft-demo-phases" aria-label="Twelve phases of a round">{phases.map((phase, index) => <span key={phase}><b>{index + 1}</b>{phase}</span>)}</div>;
}

const MOUNTAIN_ITEMS = ['WOOD', 'WOOD', 'STONE', 'ORE', '2 SILVER'] as const;

function MountainVisual() {
  const [aged, setAged] = useState(0);
  const replacement = aged > MOUNTAIN_ITEMS.length;
  const status = replacement
    ? 'The strip was empty, so it was discarded and a new authentic strip was revealed.'
    : aged === MOUNTAIN_ITEMS.length
      ? 'The last leftmost item aged away. Try once more to discard the empty strip and reveal a replacement.'
      : aged === 0
        ? 'Take and age from the arrow end: the leftmost remaining item.'
        : `${aged} item${aged === 1 ? '' : 's'} aged away. The arrow now points to ${MOUNTAIN_ITEMS[aged]}.`;
  return (
    <div className="ft-demo-practice ft-demo-mountain" aria-label="Interactive mountain strip arrow aging demonstration">
      <figure className="ft-demo-mountain-scene">
        <img src={replacement ? '/feast/mountains/strip-02.webp' : '/feast/mountains/strip-01.webp'} alt={replacement ? 'New authentic mountain strip' : 'Authentic mountain strip one'} />
        <figcaption>{replacement ? 'NEW STRIP REVEALED' : 'AUTHENTIC STRIP · ARROW END'}</figcaption>
      </figure>
      <div className="ft-demo-practice-panel">
        <div className="ft-demo-mountain-items" role="img" aria-label={status}>
          <i aria-hidden="true" />
          {(replacement ? MOUNTAIN_ITEMS : MOUNTAIN_ITEMS).map((item, index) => (
            <span key={`${item}-${index}`} className={`${item.toLowerCase().replace(' ', '-')} ${!replacement && index < aged ? 'aged' : ''}`}>{item}</span>
          ))}
        </div>
        <DemoControls
          label="Mountain aging practice controls"
          status={status}
          tryLabel={aged === MOUNTAIN_ITEMS.length ? 'TRY REVEALING NEW' : 'TRY AGING ONE ITEM'}
          onTry={() => setAged((value) => Math.min(MOUNTAIN_ITEMS.length + 1, value + 1))}
          onReset={() => setAged(0)}
        />
      </div>
    </div>
  );
}

function ShipVisual() {
  return <div className="ft-demo-ships" aria-label="Ship roles"><div><b>WHALING BOAT</b><span>3 VP · WHALING · 2 ORE MAX</span></div><div><b>KNARR</b><span>5 VP · TRADE · SPECIAL SALE</span></div><div><b>LONGSHIP</b><span>8 VP · RAID · PILLAGE · DISTANT EXPLORATION</span></div><div className="emigrate"><b>EMIGRATION</b><span>18 / 21 VP · COVERS THE FEAST</span></div></div>;
}

const SCORE_ROWS = [
  ['SHIPS', 16], ['EMIGRATION', 39], ['BOARDS AND HOUSES', 64], ['ANIMALS', 12],
  ['OCCUPATIONS', 9], ['SILVER AND INCOME', 18], ['UNCOVERED SPACES', -27], ['THING PENALTIES', -3],
] as const;

function ScoreVisual() {
  const [stage, setStage] = useState(0);
  const total = SCORE_ROWS.reduce((sum, [, value]) => sum + value, 0);
  const status = stage === 0
    ? 'Start with every positive category. Try the scoring steps to reveal exactly what adds and subtracts.'
    : stage === 1
      ? 'Positive categories total 158 points: ships, emigration, boards, animals, occupations, silver, and final income.'
      : stage === 2
        ? 'Uncovered −1 cells and Thing Penalties subtract 30 points. Each negative source remains separately auditable.'
        : `Final score: 158 − 30 = ${total}. There is no tiebreaker.`;
  return (
    <div className="ft-demo-practice ft-demo-scoring" aria-label="Interactive final scoring demonstration">
      <figure className="ft-demo-score-board">
        <img src="/feast/home-long.webp" alt="Authentic home board with negative spaces used in scoring" />
        <figcaption>EVERY UNCOVERED −1 CELL COUNTS</figcaption>
      </figure>
      <div className="ft-demo-practice-panel">
        <div className="ft-demo-score" aria-label={status}>
          {SCORE_ROWS.map(([label, value]) => {
            const visible = value >= 0 ? stage >= 1 : stage >= 2;
            return <div key={label} className={visible ? 'revealed' : ''}><span>{label}</span><b className={value < 0 ? 'negative' : ''}>{visible ? `${value > 0 ? '+' : ''}${value}` : '—'}</b></div>;
          })}
          <footer className={stage >= 3 ? 'revealed' : ''}><span>FINAL SAGA</span><strong>{stage >= 3 ? total : '—'}</strong></footer>
        </div>
        <DemoControls
          label="Scoring practice controls"
          status={status}
          tryLabel="TRY NEXT SCORE STEP"
          onTry={() => setStage((value) => Math.min(3, value + 1))}
          onReset={() => setStage(0)}
        />
      </div>
    </div>
  );
}

function OccupationVisual() {
  return <div className="ft-demo-cardtypes" aria-label="Occupation timing categories"><span className="immediate"><b>IMMEDIATE</b>RESOLVE ONCE WHEN PLAYED</span><span className="anytime"><b>ANYTIME</b>USE WHEN THE CARD ALLOWS</span><span className="each"><b>EACH TIME</b>TRIGGER WHEN CONDITION REPEATS</span><span className="soon"><b>AS SOON AS</b>TRIGGER ONCE WHEN FIRST MET</span></div>;
}

function GenericVisual({ title, lines }: { title: string; lines: string[] }) {
  return <div className="ft-demo-generic"><b>{title}</b>{lines.map((line, index) => <span key={line}><i>{index + 1}</i>{line}</span>)}</div>;
}

const LESSONS: readonly FeastLesson[] = [
  { id: 'goal', chapter: 'START HERE', title: 'THE SCORE AND THE EMPTY SPACES', summary: 'See each positive category and each penalty build the final score.', points: ['Cover printed negative cells.', 'Keep ships, animals, silver, and played occupations for positive points.', 'Emigration and exploration can be worth many points but create more puzzle space.', 'There is no tiebreaker.'], visual: <ScoreVisual /> },
  { id: 'round', chapter: 'START HERE', title: 'THE TWELVE PHASE ROUND', summary: 'Follow every automatic and interactive step in order.', points: ['The action phase is only phase 5.', 'Income comes before breeding and the feast.', 'The final game ends after Feast, with no final Bonus.', 'Occupation prompts pause the phase track when a real choice is needed.'], visual: <PhaseVisual /> },
  { id: 'actions', chapter: 'TAKE ACTIONS', title: 'BLOCK, IMITATE, PASS, AND END', summary: 'Practice the complete turn handoff on the authentic action board.', points: ['Use exactly the number of Vikings shown by the column.', 'A printed space is used once per round.', 'An imitation extension copies an occupied action at its normal column cost.', 'Passing ends your actions; End Turn hands control to the next active player.'], visual: <ActionsVisual /> },
  { id: 'placement', chapter: 'BUILD THE ESTATE', title: 'LEGAL GOODS PLACEMENT', summary: 'Rotate, preview, and try a placement on an exact practice grid.', points: ['Home and exploration accept green, blue, silver, and ore.', 'Green may not touch green orthogonally.', 'Blue, silver, and ore may touch.', 'A committed tile cannot be removed.'], visual: <PlacementVisual /> },
  { id: 'income', chapter: 'BUILD THE ESTATE', title: 'INCOME DIAGONAL', summary: 'Cover the lower-left foundation one cell at a time and watch income open.', points: ['Printed bonus cells already count as covered.', 'The smallest uncovered income number pays.', 'Each exploration board has its own income.', 'All board incomes resolve simultaneously.'], visual: <EstateCellsVisual mode="income" /> },
  { id: 'bonuses', chapter: 'BUILD THE ESTATE', title: 'ENCLOSE RECURRING BONUSES', summary: 'Try enclosing an authentic good while keeping its printed cell open.', points: ['All valid neighbors must be covered.', 'Edge bonuses require fewer neighbors.', 'Covering the printed item forfeits it.', 'All bonuses resolve simultaneously.'], visual: <EstateCellsVisual mode="bonus" /> },
  { id: 'goods', chapter: 'BUILD THE ESTATE', title: 'THE GOODS COLOR LADDER', summary: 'Upgrade a tile without changing its physical shape.', points: ['Orange farm goods become red animal products.', 'Red becomes green craft goods.', 'Green becomes blue luxury goods.', 'Overseas Trading can flip different green goods at once.'], visual: <GenericVisual title="SAME SHAPE · MORE VALUE" lines={['ORANGE · FARM', 'RED · ANIMAL', 'GREEN · CRAFT', 'BLUE · LUXURY']} /> },
  { id: 'feast', chapter: 'FEED THE VIKINGS', title: 'FEAST GAPS AND EMIGRATION', summary: 'Fill the authentic Banquet Table, count penalties, then see emigration cover future feasts.', points: ['Orange may not touch orange; red may not touch red.', 'Silver may touch silver and separates food colors.', 'Only one of each named food uses its efficient orientation.', 'Every gap gives a permanent minus-3 Thing Penalty.'], visual: <FeastVisual /> },
  { id: 'ships', chapter: 'SAIL', title: 'SHIPS AND EMIGRATION', summary: 'Choose the vessel that supports the plan you are building.', points: ['Bay capacity is 3 whaling boats and 4 large ships.', 'A ship may support several actions in one round.', 'Arm before, never during, a die action.', 'Emigration removes the ship and covers future feasts.'], visual: <ShipVisual /> },
  { id: 'dice', chapter: 'SAIL', title: 'ROLL, PAY, OR DECLARE FAILURE', summary: 'Practice high and low dice actions with the exact payment direction visible.', points: ['Roll up to three times; each reroll replaces the old result.', 'Raid and pillage want high results.', 'Hunt, snare, and whale want low results.', 'Failure builds resources and often returns Vikings.'], visual: <DiceVisual /> },
  { id: 'exploration', chapter: 'SAIL', title: 'EXPLORATION FACES AND SILVER', summary: 'Claim a unique puzzle board before its face turns away.', points: ['Short-distance islands accept any ship.', 'Iceland, Greenland, and Bear Island need a large ship.', 'American destinations require a longship.', 'Other unclaimed faces gain silver in each flip round.'], visual: <GenericVisual title="THE FOUR DOUBLE-SIDED BOARDS" lines={['SHETLAND → BEAR ISLAND', 'FAROE ISLANDS → BAFFIN ISLAND', 'ICELAND → LABRADOR', 'GREENLAND → NEWFOUNDLAND']} /> },
  { id: 'animals', chapter: 'BUILD THE ESTATE', title: 'SHEEP AND CATTLE BREEDING', summary: 'Pregnancy and birth alternate across breeding phases.', points: ['Two non-pregnant animals create one pregnancy.', 'Every pregnant animal gives one newborn next time.', 'A single pregnant animal still gives birth.', 'Animals placed into houses no longer breed or score as animals.'], visual: <BreedingVisual /> },
  { id: 'mountains', chapter: 'TAKE ACTIONS', title: 'MOUNTAIN ARROWS AND AGING', summary: 'Remove the arrow-end item yourself and reveal a replacement when empty.', points: ['The printed 2 silver pair is one item.', 'Split allowances must use separate strips.', 'Remove one leftmost item from every strip after each round.', 'Discard an empty strip and reveal a new one.'], visual: <MountainVisual /> },
  { id: 'occupations', chapter: 'CARDS', title: 'ALL 190 OCCUPATIONS', summary: 'Identify timing and open the official clarification for any card.', points: ['Starting cards have light-brown backs.', 'Hands are private; played cards are public.', 'Card text overrides ordinary rules.', 'The guided resolver records uncommon effects in the public log.'], visual: <OccupationVisual /> },
  { id: 'solo', chapter: 'SOLO', title: 'ALTERNATING BLOCKER COLORS', summary: 'One worker color acts while the previous color remains on the board.', points: ['Never add a CPU opponent.', 'Leave this round’s workers to block the next round.', 'Return the older color at round end.', 'The solo player is always start player.'], visual: <GenericVisual title="SOLO COLOR CYCLE" lines={['RED ACTS · GRAY WAITS', 'RED REMAINS · GRAY ACTS', 'RED RETURNS · GRAY REMAINS', 'REPEAT THROUGH THE FINAL FEAST']} /> },
];

export const FEAST_LESSON_TOUR_STEP: Readonly<Record<string, number>> = {
  goal: 0, round: 1, actions: 7, placement: 3, income: 4, bonuses: 5, goods: 6,
  feast: 14, ships: 11, dice: 12, exploration: 13, animals: 15, mountains: 16,
  occupations: 17, solo: 18,
};

export function FeastLessons({ close, startTour }: { close: () => void; startTour: (step?: number) => void }) {
  const [selected, setSelected] = useState(LESSONS[0].id);
  const lesson = LESSONS.find((entry) => entry.id === selected) ?? LESSONS[0];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className="ft-lessons" role="dialog" aria-modal="true" aria-labelledby="ft-lessons-title" data-testid="feast-lessons">
      <div className="ft-lessons-shell ig-glass">
        <header><div><span>INTERACTIVE VISUAL RULES COMPANION</span><h2 id="ft-lessons-title">LEARN A FEAST FOR ODIN</h2></div><button type="button" className="ft-icon-button" onClick={close} aria-label="Close lessons">CLOSE</button></header>
        <aside aria-label="Lesson chapters">
          {LESSONS.map((entry) => <button type="button" key={entry.id} className={entry.id === lesson.id ? 'on' : ''} aria-current={entry.id === lesson.id ? 'page' : undefined} onClick={() => setSelected(entry.id)}><span>{entry.chapter}</span><b>{entry.title}</b></button>)}
        </aside>
        <main aria-labelledby={`ft-lesson-${lesson.id}`}>
          <div className="ft-lesson-kicker">{lesson.chapter}</div>
          <h3 id={`ft-lesson-${lesson.id}`}>{lesson.title}</h3>
          <p>{lesson.summary}</p>
          <div key={lesson.id} className="ft-lesson-visual">{lesson.visual}</div>
          <ol>{lesson.points.map((point) => <li key={point}>{point}</li>)}</ol>
          <footer>
            <button type="button" className="ft-button primary" onClick={() => { close(); startTour(FEAST_LESSON_TOUR_STEP[lesson.id] ?? 0); }}>SHOW THIS ON THE LIVE TABLE</button>
            <a className="ft-button" href="/feast/rulebook.pdf" target="_blank" rel="noreferrer">RULEBOOK</a>
            <a className="ft-button" href="/feast/appendix.pdf" target="_blank" rel="noreferrer">OCCUPATION APPENDIX</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
