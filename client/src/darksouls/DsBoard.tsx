// Dark Souls: The Board Game — the TV. Full-screen 3D of the active tile
// (exploration room, boss arena, or the bonfire camp), the engine's AI step
// log played back one announcement at a time with camera attention, ig-* HUD:
// per-character endurance chips on the mod's own healthbar art, the boss
// health dial built from the mod's dial wheel, the flipped behaviour card as
// the turn banner, a tile map strip, bonfire shop feed, fog-gate transitions,
// and victory / YOU DIED screens. TV voices actions, turnovers, and the win.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DS_BOSSES, DS_CLASSES, DS_ENCOUNTER_BY_ID,
  createDarkSouls, applyDarkSoulsAction, dsViewFor,
  type DsView, type DsLogEntry, type DsBossDef,
} from '@bge/shared';
import { playSfx, sfxEnabled, setSfxEnabled, type SfxName } from '../sfx';
import {
  DS_FACE_ART, DS_DIAL_WHEEL, DS_KING_MATS, DS_HEALTHBAR, DS_SEAT_HEX,
  DS_BONFIRE_TOKEN, DS_FOG_WALL, DS_FIRST_ACT_TOKEN, DS_AGGRO_TOKEN,
  useDsManifest, dsBossCardArt, type DsManifest, type DsCardArt,
} from './ds-assets';
import { DsTable, dsFaceSpace, useDsSceneReady, type DsFocus } from './DsScene';
import './ds-board.css';

// ---------- helpers ----------

/** house copy rules: no em dashes on screen; capitalise the first letter */
const tidy = (t: string): string =>
  t.replace(/\s+—\s+/g, ', ').replace(/^\p{Ll}/u, (c) => c.toUpperCase());

const SFX_FOR_KIND: Record<string, SfxName> = {
  attack: 'build', dice: 'shuffle', flip: 'shuffle', move: 'click',
  phase: 'link', bonfire: 'coins', treasure: 'coins', win: 'win',
  death: 'error', defeat: 'error', mega: 'link',
};

function activeFaceId(view: DsView): string {
  if (view.encounter) return view.encounter.faceId;
  if (view.partyAt !== 'bonfire') return view.tiles.find((t) => t.id === view.partyAt)?.faceId ?? 'bonfire';
  return 'bonfire';
}

function stageLabel(view: DsView): string {
  if (view.phase === 'gameOver') return 'GAME OVER';
  if (view.phase === 'bossEncounter' && view.boss) return `BOSS · ${DS_BOSSES[view.boss.id]?.name ?? view.boss.id}`.toUpperCase();
  if (view.phase === 'encounter') {
    const card = view.encounter?.encounterId ? DS_ENCOUNTER_BY_ID[view.encounter.encounterId] : null;
    return card ? `ENCOUNTER · ${card.name} · LEVEL ${card.level}`.toUpperCase() : 'ENCOUNTER';
  }
  const target = view.stage === 'preMini' ? view.miniBossId
    : view.stage === 'postMini' ? view.mainBossId
      : view.stage === 'megaL4' || view.stage === 'megaBoss' ? view.megaBossId : null;
  const name = target ? DS_BOSSES[target]?.name : null;
  return name ? `BONFIRE · THE ROAD TO ${name}`.toUpperCase() : 'BONFIRE';
}

function bossCardName(def: DsBossDef | undefined, cellKey: string): string | null {
  if (!def) return null;
  const raw = String(cellKey);
  const beam = raw.startsWith('beam:');
  const n = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
  const pools = beam ? [def.fireBeam ?? []] : [
    def.behaviors ?? [], def.kingOne ?? [], def.fireBeam ?? [],
    def.ornsteinHeatUps ?? [], def.smoughHeatUps ?? [],
  ];
  for (const pool of pools) {
    const hit = pool.find((c) => String(c.cell) === n || String(c.cell) === raw);
    if (hit) return hit.name;
  }
  const paired = def.pairedBehaviors?.find((c) => String(c.cell) === n);
  if (paired) return `${paired.ornstein.name} / ${paired.smough.name}`;
  return null;
}

// ---------- dev fixture (?dsfix=<miniBossId>) ----------
// Verification harness: builds a legal boss fight through the real engine
// (cleared road -> enter_fog_gate) so arena, dial, and arc render without
// grinding a full game. Dev builds only.

function useFixtureView(): DsView | null {
  return useMemo(() => {
    const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
    if (!dev) return null;
    const fix = new URLSearchParams(window.location.search).get('dsfix');
    if (!fix) return null;
    try {
      if (fix === 'victory' || fix === 'defeat') {
        const s = createDarkSouls({
          scenarioId: 'standard', partySize: 4,
          classIds: ['knight', 'warrior', 'herald', 'assassin'], seed: 3,
        });
        s.winner = fix === 'victory';
        s.phase = 'gameOver';
        s.log.push({ text: 'The Dancer of the Boreal Valley falls. The party prevails.', kind: 'win' });
        return dsViewFor(s, null);
      }
      const tier = DS_BOSSES[fix]?.tier ?? 'mini';
      const s = createDarkSouls({
        scenarioId: 'standard', partySize: 4,
        classIds: ['knight', 'warrior', 'herald', 'assassin'],
        miniBoss: tier === 'mini' ? fix : 'gargoyle',
        mainBoss: tier === 'main' ? fix : 'dancer-of-the-boreal-valley',
        megaFinale: tier === 'mega' ? fix : null,
        seed: 11,
      });
      for (const t of s.tiles) { t.cleared = true; t.faceUp = true; }
      if (tier === 'main') { s.stage = 'postMini'; s.miniBossDefeated = true; }
      if (tier === 'mega') { s.stage = 'megaBoss'; s.partyAt = 'bonfire'; }
      else s.partyAt = s.fogGateTileId ?? 'bonfire';
      applyDarkSoulsAction(s, 0, { type: 'enter_fog_gate' });
      // answer only the setup pendings (lead character, order ties, arcs);
      // leave combat decisions open so the shot shows the round-one tableau
      const SETUP_KINDS = new Set(['leadCharacter', 'enemyTieOrder', 'enemyMoveTie', 'arcChoice']);
      let guard = 0;
      while (s.pendings.length > 0 && s.phase === 'bossEncounter' && guard++ < 12) {
        const head = s.pendings[0];
        if (!SETUP_KINDS.has(head.kind)) break;
        applyDarkSoulsAction(s, head.seat, { type: 'choose', pick: head.options[0]?.key ?? '' });
      }
      return dsViewFor(s, null);
    } catch (error) {
      console.warn('ds fixture failed', error);
      return null;
    }
  }, []);
}

// ---------- announcements (AI step playback with camera attention) ----------

function useAnnouncements(view: DsView, onFocus: (e: DsLogEntry) => void) {
  const [current, setCurrent] = useState<DsLogEntry | null>(null);
  const queue = useRef<DsLogEntry[]>([]);
  // the view's log is a sliding window (last 120), so diff by locating the
  // previous tail inside the new window rather than by length
  const tail = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(onFocus);
  cbRef.current = onFocus;

  useEffect(() => {
    const sig = (e: DsLogEntry) => JSON.stringify(e);
    const last = view.log[view.log.length - 1];
    if (tail.current === null) { tail.current = last ? sig(last) : ''; return; } // skip history on join
    if (last && sig(last) !== tail.current) {
      let from = -1;
      for (let i = view.log.length - 2; i >= 0; i--) {
        if (sig(view.log[i]) === tail.current) { from = i + 1; break; }
      }
      const fresh = from >= 0 ? view.log.slice(from) : view.log.slice(-3);
      queue.current.push(...fresh);
      tail.current = sig(last);
    }
    const pump = () => {
      if (timer.current || queue.current.length === 0) return;
      const next = queue.current.shift()!;
      setCurrent(next);
      playSfx(SFX_FOR_KIND[next.kind ?? ''] ?? null);
      cbRef.current(next);
      // fast-forward a long backlog so the table never lags far behind
      const dwell = queue.current.length > 6 ? 900 : 2300;
      timer.current = setTimeout(() => {
        timer.current = null;
        setCurrent(null);
        setTimeout(pump, 180);
      }, dwell);
    };
    pump();
  }, [view.log.length, view.log]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return current;
}

// ---------- HUD bits ----------

// endurance chip on the class's own healthbar tile: 10 boxes, black stamina
// cubes fill from the left, red damage cubes from the right (core p.20)
function CharChip({ view, seat }: { view: DsView; seat: number }) {
  const ch = view.characters[seat];
  if (!ch) return null;
  const art = DS_HEALTHBAR[ch.classId];
  const active = view.encounter?.turn === 'characters' && view.encounter.activeSeat === seat;
  // box centres measured on the 1500x152 healthbar art
  const boxes = Array.from({ length: 10 }, (_, i) => {
    const on = i < ch.stamina ? 'sta' : i >= 10 - ch.damage ? 'dmg' : null;
    return { left: ((163 + i * 92.6) / 1500) * 100, on };
  });
  return (
    <div className={`ds-chip${active ? ' on' : ''}`} style={{ ['--seat' as never]: DS_SEAT_HEX[seat % DS_SEAT_HEX.length] }}>
      <div className="ds-chip-head">
        <span className="ds-chip-name">{ch.className}</span>
        <span className="ds-chip-tags">
          {view.aggroSeat === seat && <img src={DS_AGGRO_TOKEN} alt="Aggro" title="Aggro" />}
          {view.firstActivationSeat === seat && <img src={DS_FIRST_ACT_TOKEN} alt="First activation" title="First activation" />}
          {ch.arc && <em>{ch.arc.toUpperCase()} ARC</em>}
          {ch.conditions.map((c) => <em key={c} className="ds-cond">{c.toUpperCase()}</em>)}
        </span>
      </div>
      <div className="ds-bar" style={{ backgroundImage: `url(${art})` }}>
        {boxes.map((b, i) => b.on && (
          <span key={i} className={`ds-cube ${b.on}`} style={{ left: `${b.left}%` }} />
        ))}
        {/* estus / luck / heroic slots printed on the right of the bar */}
        {[ch.estus, ch.luck, ch.heroic].map((have, i) => !have && (
          <span key={`t${i}`} className="ds-spent" style={{ left: `${((1188 + i * 119) / 1500) * 100}%` }} />
        ))}
        {ch.ember && <span className="ds-emberdot" title="Ember" />}
      </div>
    </div>
  );
}

// the mod's dial wheel turned by the engine: health reads at the notch
function BossDial({ label, mat, health, max }: { label: string; mat?: string; health: number; max: number }) {
  const frac = max > 0 ? health / max : 0;
  return (
    <div className="ds-dial">
      {mat && <img className="ds-dial-mat" src={mat} alt="" />}
      <div className="ds-dial-wheel">
        <img src={DS_DIAL_WHEEL} alt="" style={{ transform: `rotate(${(1 - frac) * 300}deg)` }} />
        <b className={frac <= 0.5 ? 'low' : ''}>{health}</b>
      </div>
      <div className="ds-dial-lab">
        <span className="ig-lab">{label}</span>
        <span className="ds-dial-max">/ {max}</span>
      </div>
    </div>
  );
}

function BossPanel({ view, manifest }: { view: DsView; manifest: DsManifest }) {
  const boss = view.boss;
  if (!boss) return null;
  const def = DS_BOSSES[boss.id];
  const top = boss.discard[0];
  const art: DsCardArt | null = top != null ? dsBossCardArt(manifest, boss.id, top) : null;
  const cardName = top != null ? bossCardName(def, String(top)) : null;
  const kings = boss.id === 'four-kings';
  return (
    <div className="ds-boss ig-glass">
      <div className="ds-boss-head">
        <span className="ig-lab">{def?.tier === 'mega' ? 'Mega boss' : def?.tier === 'mini' ? 'Mini boss' : 'Boss'}</span>
        <b>{def?.name ?? boss.id}</b>
        {boss.heatedUp && <em className="ds-heat">HEATED UP</em>}
      </div>
      <div className={`ds-dials${kings ? ' kings' : ''}`}>
        {boss.units.map((u, i) => (
          <BossDial
            key={u.key}
            label={u.key === 'boss' || u.key === 'mimic' ? 'HEALTH' : u.key.toUpperCase()}
            mat={kings ? DS_KING_MATS[i % 4] : undefined}
            health={Math.max(0, u.health)}
            max={u.maxHealth}
          />
        ))}
      </div>
      {boss.units.some((u) => u.inPlay && (u.conditions?.length ?? 0) > 0) && (
        <div className="ds-boss-conds">
          {boss.units.filter((u) => u.inPlay).flatMap((u) => (u.conditions ?? []).map((c) => (
            <em key={`${u.key}${c}`} className="ds-tag cond">
              {boss.units.length > 1 ? `${u.key.toUpperCase()} · ` : ''}{c.toUpperCase()}
            </em>
          )))}
        </div>
      )}
      <div className="ds-boss-deck">
        <span>DECK {boss.deckCount}</span>
        <span>DISCARD {boss.discard.length}</span>
      </div>
      {boss.revealed.length > 0 && (
        <div className="ds-boss-intel">
          <span className="ig-lab">GRAVESTONE INTEL</span>
          {boss.revealed.map((cell) => (
            <b key={cell}>{bossCardName(def, String(cell)) ?? `CARD ${cell}`}</b>
          ))}
        </div>
      )}
      {(cardName || art) && (
        <div className="ds-boss-card">
          {art && (
            <span
              className="ds-card-art"
              style={{
                backgroundImage: `url(${art.image})`,
                backgroundSize: `${art.cols * 100}% ${art.rows * 100}%`,
                backgroundPosition: `${art.cols > 1 ? (art.col / (art.cols - 1)) * 100 : 0}% ${art.rows > 1 ? (art.row / (art.rows - 1)) * 100 : 0}%`,
              }}
            />
          )}
          <div>
            <div className="ig-lab">Behaviour</div>
            <b>{cardName ?? `Card ${top}`}</b>
          </div>
        </div>
      )}
    </div>
  );
}

// exploration map strip: bonfire + the tile chain, encounter state, fog gate
function MapStrip({ view }: { view: DsView }) {
  return (
    <div className="ds-strip ig-glass">
      <button className={`ds-strip-tile bonfire${view.partyAt === 'bonfire' ? ' here' : ''}`} tabIndex={-1}>
        <img src={DS_BONFIRE_TOKEN} alt="" />
        <span>BONFIRE</span>
      </button>
      {view.tiles.map((t) => {
        const art = DS_FACE_ART[t.faceId];
        const state = t.completed || t.cleared ? 'CLEAR' : t.faceUp ? 'IN BATTLE' : 'UNKNOWN';
        return (
          <button key={t.id} className={`ds-strip-tile${view.partyAt === t.id ? ' here' : ''}${t.cleared || t.completed ? ' clear' : ''}`} tabIndex={-1}>
            <span className="ds-strip-art" style={art ? { backgroundImage: `url(${art.image})` } : undefined} />
            <span>L{t.level} · {state}</span>
            {view.fogGateTileId === t.id && <img className="ds-strip-fog" src={DS_FOG_WALL} alt="Fog gate" title="Fog gate" />}
          </button>
        );
      })}
    </div>
  );
}

// bonfire phase: party management summary + the shop activity feed
function BonfirePanel({ view }: { view: DsView }) {
  const feed = view.log.filter((e) => e.kind === 'bonfire' || e.kind === 'treasure').slice(-6);
  return (
    <div className="ds-bonfire ig-glass">
      <div className="ig-lab">Bonfire · party management</div>
      <div className="ds-bonfire-stats">
        <div><span className="ig-lab">Sparks</span><b className="ig-num">{view.sparks} / {view.sparksMax}</b></div>
        <div><span className="ig-lab">Souls</span><b className="ig-num">{view.soulCache}</b></div>
        <div><span className="ig-lab">Treasure deck</span><b className="ig-num">{view.treasureDeckCount}</b></div>
        <div><span className="ig-lab">Stash</span><b className="ig-num">{view.inventory.length}</b></div>
      </div>
      <div className="ds-feed">
        <div className="ig-lab">Shop activity</div>
        {feed.length === 0 && <div className="ds-feed-empty">No purchases yet. The party readies itself on their devices.</div>}
        {feed.map((e, i) => (
          <div key={i} className="ds-feed-row" style={e.seat != null ? { ['--seat' as never]: DS_SEAT_HEX[e.seat % DS_SEAT_HEX.length] } : undefined}>
            {e.seat != null && <span className="ds-feed-ring" />}
            {tidy(e.text)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- the board ----------

export function DsBoard({ view: liveView }: { view: DsView }) {
  const fixture = useFixtureView();
  const view = fixture ?? liveView;
  const manifest = useDsManifest();
  const ready = useDsSceneReady();
  const [focus, setFocus] = useState<DsFocus | null>(null);
  const faceId = activeFaceId(view);
  const atBonfire = !view.encounter && view.partyAt === 'bonfire';
  const space = useMemo(() => dsFaceSpace(atBonfire ? 'bonfire' : faceId), [atBonfire, faceId]);

  // ?cam=x,z,h pins the camera for verification close-ups (shoot.mjs)
  const camPin = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get('cam');
    if (!q) return null;
    const [x, z, h] = q.split(',').map(Number);
    return { x: x || 0, z: z || 0, dist: h || 10 } as DsFocus;
  }, []);
  useEffect(() => { if (camPin) setFocus(camPin); }, [camPin]);

  // announcement playback: each AI step lands here, aiming the camera at its node
  const caption = useAnnouncements(view, (e) => {
    if (camPin) return;
    if (e.nodeId && space.face) {
      const [x, z] = space.nodeXZ(e.nodeId);
      setFocus({ x, z, dist: 7.5 });
    }
  });

  // widen back out between encounters / on face changes
  useEffect(() => {
    if (camPin) return;
    setFocus({ x: 0, z: 0, dist: Math.max(space.renderW, space.renderH) * 1.02 });
  }, [faceId, atBonfire, camPin, space]);

  // turnover chime; win / defeat sting
  const turnKey = view.encounter ? `${view.encounter.turn}:${view.encounter.activeSeat}` : view.phase;
  const prevTurn = useRef(turnKey);
  useEffect(() => {
    if (prevTurn.current !== turnKey) { prevTurn.current = turnKey; if (view.encounter) playSfx('turn'); }
  }, [turnKey, view.encounter]);
  const ended = useRef(false);
  useEffect(() => {
    if (view.winner !== null && !ended.current) { ended.current = true; playSfx(view.winner ? 'win' : 'error'); }
  }, [view.winner]);

  // fog-gate transition when a new encounter face slides in
  const [fog, setFog] = useState<string | null>(null);
  const prevFace = useRef<string | null>(null);
  useEffect(() => {
    const cur = view.encounter ? `${view.phase}:${view.encounter.faceId}:${view.encounter.tileId ?? 'arena'}` : null;
    if (cur && cur !== prevFace.current && prevFace.current !== undefined) {
      if (view.phase === 'bossEncounter') {
        setFog(view.boss ? `${DS_BOSSES[view.boss.id]?.name ?? 'THE BOSS'} AWAITS` : 'THE FOG PARTS');
      } else {
        const card = view.encounter?.encounterId ? DS_ENCOUNTER_BY_ID[view.encounter.encounterId] : null;
        setFog(card ? card.name.toUpperCase() : 'THE ENCOUNTER BEGINS');
      }
      const t = setTimeout(() => setFog(null), 2100);
      prevFace.current = cur;
      return () => clearTimeout(t);
    }
    prevFace.current = cur;
  }, [view.phase, view.encounter?.faceId, view.encounter?.tileId]);

  const [muted, setMuted] = useState(!sfxEnabled());
  const toggleMute = () => { const next = !muted; setMuted(next); setSfxEnabled(!next); };

  if (!manifest) {
    return (
      <div className="ds-curtain">
        <div className="ig-lab">Dark Souls · The Board Game</div>
        <h2>READING THE MOD</h2>
        <div className="ds-curtain-bar"><span /></div>
      </div>
    );
  }

  const turnLine = view.phase === 'setup' ? 'CHOOSING CLASSES'
    : view.encounter
      ? view.encounter.turn === 'enemies' ? 'ENEMIES ACT'
        : `${view.characters[view.encounter.activeSeat]?.className ?? 'CHARACTER'} ACTS`.toUpperCase()
      : view.phase === 'bonfire' ? 'THE PARTY MANAGES' : '';

  return (
    <div className="ig ds-tv">
      <DsTable view={view} manifest={manifest} focus={focus} />
      {!ready && (
        <div className="ds-curtain" style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
          <div className="ig-lab">Dark Souls · The Board Game</div>
          <h2>SETTING THE TABLE</h2>
          <div className="ds-curtain-bar"><span /></div>
        </div>
      )}

      {/* stage plate */}
      <div className="ds-stage ig-glass">
        <div className="ig-lab">Dark Souls · The Board Game</div>
        <div className="ds-stage-line">{stageLabel(view)}</div>
        <div className="ds-stage-sub">
          <span>SPARKS <b className="ig-num">{view.sparks}/{view.sparksMax}</b></span>
          <span>SOULS <b className="ig-num">{view.soulCache}</b></span>
          {(view.encounter?.enemies.length ?? 0) > 0 && <span>ENEMIES <b className="ig-num">{view.encounter!.enemies.length}</b></span>}
        </div>
      </div>

      {/* whose activation */}
      {turnLine && view.winner === null && (
        <div className="ds-turn ig-glass" key={turnKey}>
          <span className="ig-prompt-ring" />
          <span>{turnLine}</span>
          {view.busy && <em>RESOLVING</em>}
        </div>
      )}

      {/* boss dials / bonfire panel */}
      {view.boss && view.phase === 'bossEncounter' && <BossPanel view={view} manifest={manifest} />}
      {view.phase === 'bonfire' && <BonfirePanel view={view} />}

      {/* map strip while exploring (hidden inside boss arenas) */}
      {view.phase !== 'bossEncounter' && view.tiles.length > 0 && <MapStrip view={view} />}

      {/* announcement */}
      {caption && (
        <div className="ds-announce" key={`${caption.text}${view.log.length}`}>
          <div className="ds-announce-card" style={caption.seat != null ? { ['--tint' as never]: DS_SEAT_HEX[caption.seat % DS_SEAT_HEX.length] } : undefined}>
            <span className="ds-announce-rule" />
            <div className="ds-announce-text">{tidy(caption.text)}</div>
            <span className="ds-announce-rule" />
          </div>
        </div>
      )}

      {/* character chips */}
      <div className="ds-chips">
        {view.characters.map((c) => <CharChip key={c.seat} view={view} seat={c.seat} />)}
        {view.phase === 'setup' && view.classPicks.map((p, i) => (
          <div key={`p${i}`} className="ds-chip" style={{ ['--seat' as never]: DS_SEAT_HEX[i % DS_SEAT_HEX.length] }}>
            <div className="ds-chip-head"><span className="ds-chip-name">{p ? DS_CLASSES[p].name : `SEAT ${i + 1} · PICKING`}</span></div>
          </div>
        ))}
      </div>

      {/* fog-gate transition */}
      {fog && (
        <div className="ds-fog">
          <div className="ds-fog-mist" />
          <div className="ds-fog-label">
            <div className="ig-lab">{view.phase === 'bossEncounter' ? 'The fog gate parts' : 'The card flips'}</div>
            <h2>{fog}</h2>
          </div>
        </div>
      )}

      {/* victory / defeat */}
      {view.winner !== null && (
        <div className={`ds-end${view.winner ? ' won' : ''}`}>
          <h1>{view.winner ? 'VICTORY' : 'YOU DIED'}</h1>
          <div className="ds-end-sub">
            {view.winner
              ? tidy([...view.log].reverse().find((e) => e.kind === 'win')?.text ?? 'The flame is kindled.')
              : 'The last spark is spent. The dark claims the party.'}
          </div>
        </div>
      )}

      {/* sound toggle */}
      <button className="ig-glass ds-mute" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          {muted
            ? <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
            : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
        </svg>
      </button>
    </div>
  );
}
