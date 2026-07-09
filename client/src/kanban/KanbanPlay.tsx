// Personal device for Kanban EV. The work turn is the centrepiece: pick a
// workstation each day, then spend shifts on the department's tasks —
// every action, choice and meeting speech happens here. The TV is the
// factory floor.

import { useState } from 'react';
import {
  DEPTS, DESIGN_BY_GUID, GOAL_BY_GUID, KANBAN_RULES, MODELS, ORDER_BY_GUID, PARTS,
  type CarModel, type Dept, type KanbanAction, type KanbanView, type Part,
} from '@bge/shared';
import { SEAT_TINT } from './KanbanScene';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { playSfx } from '../sfx';

const KANBAN_INTRO: Intro = {
  title: 'Kanban EV',
  tagline: 'Prove yourself on the factory floor — Sandra is watching.',
  goal: 'Score the most Production Points (PP) by designing, assembling, upgrading and testing electric cars across five departments. The game ends after enough weeks and production cycles pass; highest PP wins.',
  points: [
    { label: 'A day', detail: 'Pick a workstation in a NEW department (top spot acts earlier but gives fewer shifts: 2, or 1 in Admin; bottom gives 3, or 2). Then everyone works in top-to-bottom order.' },
    { label: 'Shifts', detail: 'Spend shifts on department tasks or training. Banked shifts add more, but you can never work more than 4 in a day. Books train for free.' },
    { label: 'Design', detail: 'Take design tiles from the row — you need them to claim and upgrade cars. The rightmost columns pay a banked shift or a book.' },
    { label: 'Logistics', detail: 'Issue a kanban order to stock the warehouses (and bank a shift), collect parts from one warehouse, and — once certified — take a parts voucher.' },
    { label: 'Assembly', detail: 'Provide a part a model still needs: its car advances down the line and may roll out to the test track for PP. Upgraded parts must be provided first. Recycling swaps parts for free.' },
    { label: 'R&D', detail: 'Claim cars from the test track (a matching design + an empty garage; deeper cars cost more shifts) and upgrade designs with a matching part for PP and rising part values.' },
    { label: 'Admin', detail: 'Micromanage: split your shifts between Administration and one other department. Fewer shifts here, but you dodge the change-department rule.' },
    { label: 'Sandra', detail: 'She evaluates the least-trained player in her department — fail her criteria and you lose 1 PP plus 1 per banked shift below 5. Then she wrecks something: clears assembly, strips warehouses, recycles designs, advances the pace car, or scores the week.' },
    { label: 'Training', detail: 'Cross the arrow to certify (unlocks department perks and moves you up the Certification track for benefits); reach the end for an award. Final scoring pays 5/3/1 per track.' },
    { label: 'Meetings', detail: 'When the pace car crosses a striped space, the day ends in a meeting: play one performance goal from your hand, and spend speech tokens on goals to score them (earlier speakers get bigger multipliers).' },
    { label: 'Game end', detail: 'When weeks and production cycles run out, final scoring adds your final-goal achievements, banked shifts, leftovers, car values (2-6), training ranks, and tested designs at part value.' },
  ],
  rulebook: '/kanban/rulebook.pdf',
};

const hex = (t: number[]) => `#${t.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

const CSS = `
.kb-wrap { position: fixed; inset: 0; background: #05080b; color: #e8ebf0; font: 14px Inter, sans-serif; overflow: hidden; display: flex; flex-direction: column; }
.kb-top { display: flex; gap: 8px; align-items: center; padding: 10px 12px 6px; flex-wrap: wrap; }
.kb-main { flex: 1; overflow-y: auto; padding: 0 12px 12px; }
.kb-btn { padding: 11px 14px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06); color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1px; text-transform: uppercase; }
.kb-btn.primary { background: rgba(120,200,255,0.14); border-color: rgba(120,200,255,0.5); }
.kb-btn:disabled { opacity: 0.35; cursor: default; }
.kb-row { display: flex; gap: 8px; flex-wrap: wrap; padding: 6px 0; }
.kb-opt { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #e8ebf0; cursor: pointer; font: 13px Inter, sans-serif; }
.kb-opt:disabled { opacity: 0.4; cursor: default; }
.kb-lab { font: 700 11px Inter, sans-serif; letter-spacing: 1.6px; text-transform: uppercase; opacity: 0.6; }
.kb-err { position: absolute; bottom: 74px; left: 50%; transform: translateX(-50%); background: #35131a; border: 1px solid rgba(255,90,90,0.4); color: #ffb3b3; padding: 8px 14px; border-radius: 10px; z-index: 70; font-size: 13px; }
.kb-actions { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap; }
`;

function goalText(guid: string): string {
  const g = GOAL_BY_GUID[guid];
  if (!g) return guid;
  const [kind, arg] = g.per.split(':');
  const what: Record<string, string> = {
    car: 'car in your garages', carModelKind: 'different car model', model: `${arg} in your garages`,
    upgradedPart: `${arg} upgraded design`, upgradedDesign: 'upgraded design', testedDesign: 'tested design',
    partOf: `part (${arg})`, carInGarages: `car in garages ${arg}`, certifiedIn: `being certified in ${arg}`,
    design: 'design on your board', book: 'book', certification: 'certification', part: 'part',
    bankedShift: 'banked shift', speechOnBoard: 'speech token kept',
  };
  return `${g.pp} PP per ${what[kind] ?? g.per} (up to ${g.max}x)`;
}

export function KanbanPlay({ view, act, error }: {
  view: KanbanView;
  act: (a: KanbanAction) => void;
  error: string | null;
}) {
  const [showIntro, setShowIntro] = useState(true);
  const [pickPart, setPickPart] = useState<Part | null>(null); // orientation picks
  const me = view.you !== null ? view.players[view.you] : null;
  if (!me) return <div className="page center"><h2>Clocking in</h2></div>;

  const send = (a: KanbanAction) => { playSfx('click'); act(a); };
  const myPending = view.pending?.seat === me.seat ? view.pending : null;
  const myTurn = view.turn === me.seat && !view.pending;
  const depts: Dept[] = me.workstation
    ? (me.workstation.dept === 'Admin' ? (me.adminDept ? ['Admin', me.adminDept] : ['Admin']) : [me.workstation.dept])
    : [];

  const head = (
    <>
      <style>{CSS}</style>
      <div className="kb-top">
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: hex(SEAT_TINT[me.color]) }} />
        <b>{me.name}</b>
        <span style={{ opacity: 0.55, fontSize: 12 }}>{me.workstation ? `${me.workstation.dept} · ${me.shiftsLeft} shifts` : ''}</span>
        <span style={{ marginLeft: 'auto', font: '800 16px Inter, sans-serif' }}>{me.pp} PP</span>
        <button className="kb-btn" style={{ padding: '6px 10px' }} onClick={() => setShowIntro(true)}>?</button>
      </div>
      <div className="kb-top" style={{ paddingTop: 0, fontSize: 12, opacity: 0.85, gap: 10 }}>
        <span>{me.bankedShifts} banked</span>
        <span>{me.books} books</span>
        <span>{me.vouchers} vouchers</span>
        <span>{me.speechOnBoard} speech</span>
        <span>{me.designs.length} designs</span>
        <span>{me.parts.length} parts</span>
        <span>{me.garages.filter(Boolean).length} cars</span>
      </div>
    </>
  );

  // ---------- pending decisions ----------
  if (myPending) {
    const d = myPending.decision as Record<string, unknown> & { kind: string; label?: string };
    return (
      <div className="kb-wrap">
        {head}
        <div className="kb-main">
          <div className="kb-lab" style={{ padding: '8px 0' }}>{String(d.label ?? 'Choose')}</div>
          {d.kind === 'certSpace' && [3, 2, 1, 0].map((sp) => {
            const taken = view.players.some((q) => q.seat !== me.seat && q.cert.section === d.section && q.cert.space === sp);
            return (
              <button key={sp} className="kb-opt" disabled={taken} onClick={() => send({ type: 'choose', space: sp })}>
                <b>Space {4 - sp} from the left</b>
                <span style={{ opacity: 0.6 }}>{sp === 0 ? 'acts first' : sp === 3 ? 'acts last' : ''}{taken ? ' · taken' : ''}</span>
              </button>
            );
          })}
          {d.kind === 'orientPick' && (
            <>
              <div className="kb-lab">1 · Take a car part</div>
              <div className="kb-row">
                {PARTS.map((p) => (
                  <button key={p} className="kb-btn" disabled={view.warehouses[p] <= 0}
                    style={pickPart === p ? { outline: '2px solid #e8ebf0' } : undefined}
                    onClick={() => setPickPart(p)}>{p} ({view.warehouses[p]})</button>
                ))}
              </div>
              <div className="kb-lab" style={{ paddingTop: 8 }}>2 · Take a design</div>
              {[...view.designRow.filter(Boolean), view.centralTop, view.officeTopTop, view.officeBottomTop].filter(Boolean).map((g, i) => (
                <button key={`${g}-${i}`} className="kb-opt" disabled={!pickPart}
                  onClick={() => { send({ type: 'choose', part: pickPart!, design: g! }); setPickPart(null); }}>
                  <b>{DESIGN_BY_GUID[g!].model}</b>
                  <span style={{ opacity: 0.6 }}>{DESIGN_BY_GUID[g!].part ?? 'flex'}</span>
                </button>
              ))}
            </>
          )}
          {d.kind === 'selectWorkstation' && DEPTS.map((dept) => (
            <div key={dept} style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
              {[0, 1].map((slot) => (
                <button key={slot} className="kb-opt" style={{ flex: 1 }}
                  onClick={() => send({ type: 'choose', dept, space: slot })}>
                  <b>{dept}</b>
                  <span style={{ opacity: 0.6 }}>{slot === 0 ? `top · ${dept === 'Admin' ? 1 : 2} shifts, acts earlier` : `bottom · ${dept === 'Admin' ? 2 : 3} shifts`}</span>
                </button>
              ))}
            </div>
          ))}
          {d.kind === 'award' && (d.options as string[]).map((g, i) => (
            <button key={g} className="kb-opt" onClick={() => send({ type: 'choose', option: i })}>
              <b>Award {i + 1}</b><span style={{ opacity: 0.6 }}>secret tile</span>
            </button>
          ))}
          {d.kind === 'displace' && (d.options as number[]).map((n) => (
            <button key={n} className="kb-opt" onClick={() => send({ type: 'choose', node: n })}>
              <b>{n === 0 ? 'Roll out to the test track' : `Conveyor spot ${n}`}</b>
              {n !== 0 && view.conveyor[n] && <span style={{ opacity: 0.6 }}>pushes the {view.conveyor[n]}</span>}
            </button>
          ))}
          {d.kind === 'garage' && me.garages.map((g, i) => (
            <button key={i} className="kb-opt" disabled={g !== null || (i === 4 && me.training.Assembly < 3)}
              onClick={() => send({ type: 'choose', garage: i })}>
              <b>Garage {i + 1}</b>
              <span style={{ opacity: 0.6 }}>{g ? g : me.garageTiles[i].flipped ? 'bonus used' : 'bonus ready'}{i === 4 ? ' · needs Assembly cert' : ''}</span>
            </button>
          ))}
          {d.kind === 'seedGoal' && (me.goals ?? []).map((g) => (
            <button key={g} className="kb-opt" onClick={() => send({ type: 'choose', goal: g })}>
              <b>{goalText(g)}</b>
            </button>
          ))}
        </div>
        {error && <div className="kb-err">{error}</div>}
        {showIntro && <GameIntro intro={KANBAN_INTRO} onClose={() => setShowIntro(false)} />}
      </div>
    );
  }

  // ---------- meeting ----------
  if (view.phase === 'meeting') {
    const mine = view.turn === me.seat;
    return (
      <div className="kb-wrap">
        {head}
        <div className="kb-main">
          <div className="kb-lab" style={{ padding: '8px 0' }}>
            {mine ? 'Your turn · speak or pass' : `${view.players[view.turn].name} is speaking`}
          </div>
          <div className="kb-lab">Goals on the table</div>
          {view.meetingGoals.map((g, i) => {
            const def = GOAL_BY_GUID[g.guid];
            const spoken = g.tokens.some((t) => t.seat === me.seat);
            const full = g.tokens.length >= (def?.max ?? 0);
            return (
              <button key={`${g.guid}-${i}`} className="kb-opt" disabled={!mine || spoken || full || me.speechOnBoard <= 0}
                onClick={() => send({ type: 'speak', placeToken: i })}>
                <b>{goalText(g.guid)}</b>
                <span style={{ opacity: 0.6 }}>{full ? 'full' : `next: ${(def?.max ?? 0) - g.tokens.length}x`}{spoken ? ' · spoken' : ''}</span>
              </button>
            );
          })}
          <div className="kb-lab" style={{ paddingTop: 10 }}>Your hand {me.playedGoalThisMeeting ? '· goal played' : '· play one this meeting'}</div>
          {(me.goals ?? []).map((g) => (
            <button key={g} className="kb-opt" disabled={!mine || me.playedGoalThisMeeting}
              onClick={() => send({ type: 'speak', playGoal: g, placeToken: me.speechOnBoard > 0 ? view.meetingGoals.length : undefined })}>
              <b>{goalText(g)}</b>
              <span style={{ opacity: 0.6 }}>play{me.speechOnBoard > 0 ? ' + speak' : ''}</span>
            </button>
          ))}
        </div>
        <div className="kb-actions">
          <button className="kb-btn primary" disabled={!mine || !me.playedGoalThisMeeting} onClick={() => send({ type: 'pass' })}>Pass</button>
        </div>
        {error && <div className="kb-err">{error}</div>}
        {showIntro && <GameIntro intro={KANBAN_INTRO} onClose={() => setShowIntro(false)} />}
      </div>
    );
  }

  // ---------- work turn ----------
  return (
    <div className="kb-wrap">
      {head}
      <div className="kb-main">
        <div className="kb-lab" style={{ padding: '6px 0' }}>
          {view.phase === 'ended' ? `${view.players.find((p) => p.color === view.winner)?.name} wins`
            : view.pending ? `${view.players[view.pending.seat].name} is deciding`
            : view.phase === 'select' ? `${view.players[view.turn]?.name ?? 'Sandra'} is choosing a workstation`
            : myTurn ? 'Your shifts · pick tasks below' : `${view.players[view.turn]?.name ?? 'Sandra'} is working`}
        </div>

        {myTurn && view.phase === 'work' && (
          <>
            {me.workstation?.dept === 'Admin' && !me.adminDept && (
              <>
                <div className="kb-lab">Micromanage · pick your second department</div>
                <div className="kb-row">
                  {DEPTS.filter((x) => x !== 'Admin').map((x) => (
                    <button key={x} className="kb-btn" onClick={() => send({ type: 'admin_pick', dept: x })}>{x}</button>
                  ))}
                </div>
              </>
            )}
            <div className="kb-lab">Training</div>
            <div className="kb-row">
              {depts.map((x) => (
                <button key={x} className="kb-btn" disabled={me.shiftsLeft <= 0} onClick={() => send({ type: 'train', dept: x })}>
                  Train {x} ({me.training[x]}/6)
                </button>
              ))}
              {depts.map((x) => me.books > 0 && (
                <button key={`h-${x}`} className="kb-btn" onClick={() => send({ type: 'homework', dept: x })}>Book → {x}</button>
              ))}
              <button className="kb-btn" disabled={me.bankedShifts <= 0} onClick={() => send({ type: 'use_banked', n: 1 })}>
                Use banked shift
              </button>
            </div>

            {depts.includes('Design') && (
              <>
                <div className="kb-lab" style={{ paddingTop: 8 }}>Design row · 1 shift each</div>
                {view.designRow.map((g, i) => g && (
                  <button key={`${g}-${i}`} className="kb-opt" disabled={me.shiftsLeft <= 0}
                    onClick={() => send({ type: 'select_design', index: i })}>
                    <b>{DESIGN_BY_GUID[g].model} · {DESIGN_BY_GUID[g].part ?? 'flex'}</b>
                    <span style={{ opacity: 0.6 }}>{i % 4 === 3 ? '+1 banked shift' : i % 4 === 2 ? '+1 book' : ''}</span>
                  </button>
                ))}
                {me.training.Design >= 3 && (
                  <div className="kb-row">
                    {(['central', 'officeTop', 'officeBottom'] as const).map((st) => (
                      <button key={st} className="kb-btn" disabled={me.shiftsLeft <= 0} onClick={() => send({ type: 'advanced_design', stack: st })}>
                        {st === 'central' ? 'Central stack' : st === 'officeTop' ? 'Office top' : 'Office bottom'}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {depts.includes('Logistics') && (
              <>
                <div className="kb-lab" style={{ paddingTop: 8 }}>Logistics</div>
                {(me.orders ?? []).map((o) => !me.orderIssued && (
                  <div key={o} className="kb-opt" style={{ flexDirection: 'column', alignItems: 'stretch', display: 'flex', gap: 6, cursor: 'default' }}>
                    <span><b>Kanban order</b> · {ORDER_BY_GUID[o].parts.join(' · ')}</span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {[0, 1, 2, 3].map((pl) => (
                        <button key={pl} className="kb-btn" disabled={me.shiftsLeft <= 0}
                          onClick={() => send({ type: 'issue_order', card: o, placement: pl as 0 | 1 | 2 | 3 })}>
                          {pl < 2 ? `4 up / 2 down` : `flipped`}{pl % 2 === 1 ? ' alt' : ''}
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
                <div className="kb-row">
                  {PARTS.map((p) => view.warehouses[p] > 0 && (
                    <button key={p} className="kb-btn" disabled={me.shiftsLeft <= 0}
                      onClick={() => send({ type: 'collect_parts', warehouse: p, count: 6 })}>
                      Take {p} ({view.warehouses[p]})
                    </button>
                  ))}
                  {me.training.Logistics >= 3 && !me.voucherTaken && (
                    <button className="kb-btn" disabled={me.shiftsLeft <= 0} onClick={() => send({ type: 'receive_voucher' })}>Voucher</button>
                  )}
                </div>
              </>
            )}

            {depts.includes('Assembly') && (
              <>
                <div className="kb-lab" style={{ paddingTop: 8 }}>Assembly · provide a part</div>
                {MODELS.map((m) => (
                  <div key={m} className="kb-opt" style={{ flexDirection: 'column', alignItems: 'stretch', display: 'flex', gap: 6, cursor: 'default' }}>
                    <span><b>{m}</b> · has {view.assemblyParts[m].join(', ') || 'nothing'}</span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[...new Set(me.parts)].map((p) => (
                        <button key={p} className="kb-btn" disabled={me.shiftsLeft <= 0}
                          onClick={() => send({ type: 'provide_part', model: m, part: p })}>{p}</button>
                      ))}
                      {me.vouchers > 0 && PARTS.filter((p) => !me.parts.includes(p)).slice(0, 3).map((p) => (
                        <button key={`v-${p}`} className="kb-btn" disabled={me.shiftsLeft <= 0}
                          onClick={() => send({ type: 'provide_part', model: m, part: p, voucher: true })}>{p} (voucher)</button>
                      ))}
                    </span>
                  </div>
                ))}
                <div className="kb-lab" style={{ paddingTop: 8 }}>Recycling · free swap</div>
                <div className="kb-row">
                  {[...new Set(me.parts)].flatMap((give) => view.recycling.map((take) => (
                    <button key={`${give}-${take}`} className="kb-btn" onClick={() => send({ type: 'recycle', give, take })}>
                      {give} → {take}
                    </button>
                  )))}
                </div>
              </>
            )}

            {depts.includes('RnD') && (
              <>
                <div className="kb-lab" style={{ paddingTop: 8 }}>R&D · claim cars ({KANBAN_RULES.claimShiftCost.join('/')} shifts by spot)</div>
                {view.testTrack.map((c, i) => c && (
                  <div key={`tt-${i}`} className="kb-opt" style={{ flexDirection: 'column', alignItems: 'stretch', display: 'flex', gap: 6, cursor: 'default' }}>
                    <span><b>{c}</b> · spot {i + 1} behind the pace car</span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(me.designs ?? []).filter((g) => DESIGN_BY_GUID[g].model === c).map((g) => (
                        <button key={g} className="kb-btn" onClick={() => send({ type: 'claim_car', queueIndex: i, design: g })}>
                          use {DESIGN_BY_GUID[g].part ?? 'flex'} design
                        </button>
                      ))}
                    </span>
                  </div>
                ))}
                <div className="kb-lab" style={{ paddingTop: 8 }}>Upgrade a design · 1 shift, +2 PP</div>
                {(me.designs ?? []).filter((g) => DESIGN_BY_GUID[g].part).map((g) => {
                  const def = DESIGN_BY_GUID[g];
                  const space = view.upgrades[def.model].findIndex((x) => x === null);
                  const havePart = me.parts.includes(def.part!);
                  return (
                    <button key={g} className="kb-opt" disabled={me.shiftsLeft <= 0 || space < 0 || (!havePart && me.vouchers <= 0)}
                      onClick={() => send({ type: 'upgrade_design', design: g, space, voucher: !havePart, double: me.doubleUpgrade === 'ready' && !view.partDoubled[def.part!] })}>
                      <b>{def.model} · {def.part}</b>
                      <span style={{ opacity: 0.6 }}>{havePart ? 'have part' : me.vouchers > 0 ? 'via voucher' : 'need part'}{me.doubleUpgrade === 'ready' && !view.partDoubled[def.part!] ? ' · double!' : ''}</span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* everyone: your board summary */}
        <div className="kb-lab" style={{ paddingTop: 12 }}>Your garages</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {me.garages.map((g, i) => `G${i + 1}: ${g ?? '—'}`).join(' · ')}
        </div>
        <div className="kb-lab" style={{ paddingTop: 8 }}>Upgraded designs</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {me.upgraded.length ? me.upgraded.map((u) => `${u.model} ${u.part}${me.tested.some((t) => t.model === u.model && t.part === u.part) ? ' (tested)' : ''}`).join(' · ') : 'none yet'}
        </div>
      </div>

      <div className="kb-actions">
        {myTurn && view.phase === 'work' && (
          <button className="kb-btn primary" onClick={() => send({ type: 'end_turn' })}>End Turn</button>
        )}
      </div>
      {error && <div className="kb-err">{error}</div>}
      {showIntro && <GameIntro intro={KANBAN_INTRO} onClose={() => setShowIntro(false)} />}
    </div>
  );
}
