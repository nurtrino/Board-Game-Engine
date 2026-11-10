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
