// Visual placement surface: the real board art with tappable paw-print
// spots, the dealt forest cards on their bush shelves, the event row (basic
// tiles + special event cards), and destination cards as card art. Legal
// targets glow; illegal ones dim with the engine's reason. Workers show as
// seat-colored dots exactly where they stand.

import type { EverdellView, EvLocRef } from '@bge/shared';
import {
  EV_BASIC_EVENT_BY_ID, EV_BASIC_LOCATIONS, EV_CARD_BY_ID, EV_HAVEN_PX,
  EV_JOURNEY, EV_SPECIAL_BY_ID, EVERDELL_SEAT_HEX,
} from '@bge/shared';
import { cardImg, forestImg, specialEventImg } from './ev-assets';

const ART_W = 2111, ART_H = 2064;
// forest bush shelves (art px) — matches the TV board layout
const FOREST_PX: [number, number][] = [[175, 1030], [195, 1340], [1945, 1030], [1925, 1340]];

const pct = (px: number, py: number) => ({ left: `${(px / ART_W) * 100}%`, top: `${(py / ART_H) * 100}%` });

export interface EvMapGroups {
  basics?: boolean;
  forest?: boolean;
  haven?: boolean;
  journey?: boolean;
  dests?: boolean;
  events?: boolean;
}

export function EvBoardMap({ view, seat, groups, check, onPick, hint }: {
  view: EverdellView;
  seat: number;
  groups: EvMapGroups;
  /** null = legal (glow); string = disabled with that reason. */
  check: (loc: EvLocRef) => string | null;
  onPick: (loc: EvLocRef) => void;
  hint?: string;
}) {
  const workersAt = (loc: EvLocRef): { seat: number }[] => {
    const key = JSON.stringify(loc);
    const out: { seat: number }[] = [];
    for (const p of view.players) {
      for (const w of p.workers) {
        if (JSON.stringify(w.loc) === key) out.push({ seat: p.seat });
      }
    }
    return out;
  };

  const dots = (loc: EvLocRef) => {
    const here = workersAt(loc);
    if (here.length === 0) return null;
    return (
      <span className="ev-workers">
        {here.map((h, i) => (
          <span key={i} className="ev-worker-dot" style={{ background: EVERDELL_SEAT_HEX[view.players[h.seat].color] }} />
        ))}
      </span>
    );
  };

  const spot = (loc: EvLocRef, px: number, py: number, label: string, key: string) => {
    const why = check(loc);
    return (
      <button key={key} className={'ev-spot ' + (why ? 'no' : 'ok')} style={pct(px, py)}
        disabled={!!why} aria-label={label}
        onClick={() => onPick(loc)}>
        {dots(loc)}
        <span className="why">{why ? why.toUpperCase() : label}</span>
      </button>
    );
  };

  const dests = view.players.flatMap((p) =>
    p.city
      .filter((cc) => {
        const d = EV_CARD_BY_ID[cc.card];
        return d && (d.color === 'destination' || d.destinationSpot) && (p.seat === seat || d.open);
      })
      .map((cc) => ({ p, cc })));

  return (
    <div className="ev-mapwrap" data-testid="ev-map">
      {hint && <div className="ev-rail-label" style={{ textAlign: 'center' }}>{hint}</div>}

      {groups.events && (
        <div className="ev-map-events">
          {view.basicEvents.map((e) => {
            const def = EV_BASIC_EVENT_BY_ID[e.id];
            const loc: EvLocRef = { t: 'basicEvent', id: e.id };
            const why = e.claimedBy !== null ? `achieved by ${view.players[e.claimedBy].name}` : check(loc);
            return (
              <button key={e.id} className={'ev-map-event tile ' + (why ? 'no' : 'ok')} disabled={!!why}
                onClick={() => onPick(loc)} aria-label={def.name}>
                <img src={def.img} alt={def.name} />
                {e.claimedBy !== null && (
                  <span className="claimed" style={{ ['--claim' as never]: EVERDELL_SEAT_HEX[view.players[e.claimedBy].color] }} />
                )}
                <span className="why">{(why ?? `${def.points} PTS`).toUpperCase()}</span>
              </button>
            );
          })}
          {view.specialEvents.map((e) => {
            const def = EV_SPECIAL_BY_ID[e.id];
            const loc: EvLocRef = { t: 'specialEvent', id: e.id };
            const why = e.claimedBy !== null ? `achieved by ${view.players[e.claimedBy].name}` : check(loc);
            return (
              <button key={e.id} className={'ev-map-event ' + (why ? 'no' : 'ok')} disabled={!!why}
                onClick={() => onPick(loc)} aria-label={def.name}>
                <img src={specialEventImg(e.id)} alt={def.name} />
                {e.claimedBy !== null && (
                  <span className="claimed" style={{ ['--claim' as never]: EVERDELL_SEAT_HEX[view.players[e.claimedBy].color] }} />
                )}
                <span className="why">{(why ?? def.name).toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="ev-map" style={{ backgroundImage: 'url(/everdell/board.webp)' }}>
        {groups.basics && EV_BASIC_LOCATIONS.map((l) =>
          spot({ t: 'basic', id: l.id }, l.px[0], l.px[1],
            Object.entries(l.gain).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(' + ') + (l.shared ? ' · SHARED' : ''),
            l.id))}
        {groups.haven && spot({ t: 'haven' }, EV_HAVEN_PX[0], EV_HAVEN_PX[1], 'HAVEN · DISCARD FOR RESOURCES', 'haven')}
        {groups.journey && EV_JOURNEY.map((j) =>
          spot({ t: 'journey', id: j.id }, j.px[0], j.px[1], `JOURNEY ${j.points} · DISCARD ${j.points}`, j.id))}
        {groups.forest && view.forest.map((f, i) => {
          const loc: EvLocRef = { t: 'forest', id: f.id };
          const why = check(loc);
          const [px, py] = FOREST_PX[i] ?? FOREST_PX[0];
          return (
            <button key={f.id} className={'ev-map-forest ' + (why ? 'no' : 'ok')} style={pct(px, py)}
              disabled={!!why} onClick={() => onPick(loc)} aria-label={f.id}>
              <img src={forestImg(f.id)} alt={f.id} />
              {dots(loc)}
              <span className="why">{why ? why.toUpperCase() : 'FOREST'}</span>
            </button>
          );
        })}
      </div>

      {groups.dests && (
        <div className="ev-map-dests">
          {dests.map(({ p, cc }) => {
            const loc: EvLocRef = { t: 'city', seat: p.seat, uid: cc.uid };
            const why = check(loc);
            const def = EV_CARD_BY_ID[cc.card]!;
            return (
              <button key={`${p.seat}:${cc.uid}`} className={'ev-map-dest ' + (why ? 'no' : 'ok')}
                disabled={!!why} onClick={() => onPick(loc)} aria-label={def.name}>
                <img src={cardImg(cc.card)} alt={def.name} />
                <span className="who">{p.seat === seat ? 'YOUR CITY' : `${p.name.toUpperCase()} · OPEN`}</span>
                {dots(loc)}
                {why && <span className="why">{why.toUpperCase()}</span>}
              </button>
            );
          })}
          {dests.length === 0 && (
            <span className="dim" style={{ font: '600 11px Inter, sans-serif' }}>NO DESTINATION CARDS IN PLAY YET</span>
          )}
        </div>
      )}
    </div>
  );
}
