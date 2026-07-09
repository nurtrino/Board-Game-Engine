// Dark Tower — action reducer. The electronic tower's brain mirrors the mod Lua
// exactly (line refs in docs/specs/dark-tower.md). Movement follows the 1981
// board rules (rulebook p15-19): on your turn you move your pawn ONE adjacent
// territory (or stay), and the SPACE you land on decides what happens — an
// empty territory rolls a MOVE event, a tomb/ruin searches, a bazaar opens, a
// sanctuary/citadel gives aid, a frontier crosses to the next kingdom, and your
// home Dark Tower space begins the siege. Kingdom-to-kingdom travel is one-way
// (CCW) and gated by the three keys.

import { mulberry32 } from '../brass/rng.js';
import { DT_RULES, type DtKey, type DtPlayer, type DtState, type DtStep } from './state.js';
import { DT_NODE, dtAdjacent, DT_FORWARD_FRONTIER, DT_FRONTIER_DIR, dtKingdomAt } from './territories.js';

export type DtAction =
  | { type: 'step'; to: string } // move the pawn to an adjacent territory (or stay: to === your node)
  | { type: 'pegasus' }
  | { type: 'battle_continue' }
  | { type: 'battle_bail' }
  | { type: 'bazaar_yes' }
  | { type: 'bazaar_no' }
  | { type: 'bazaar_haggle' }
  | { type: 'curse'; victim: number }
  | { type: 'riddle_guess'; key: DtKey }
  | { type: 'end_turn' };

export interface DtResult { ok: boolean; error?: string }
const err = (error: string): DtResult => ({ ok: false, error });

// seeded rng stream: every roll advances s.rolls so saves replay identically
function roll(s: DtState, lo: number, hi: number): number {
  s.rolls++;
  const r = mulberry32((s.seed ^ (s.rolls * 0x9e3779b9)) >>> 0)();
  return lo + Math.floor(r * (hi - lo + 1));
}

// ROM tables (global.lua L9-L93)
const d16 = <T,>(s: DtState, table: T[]): T => table[roll(s, 1, 16) - 1];
const MOVE_TABLE = ['lost', 'lost', 'lost', 'dragon', 'dragon', 'plague', 'plague', 'plague', 'battle', 'battle', 'battle', 'safe', 'safe', 'safe', 'safe', 'safe'];
const TOMB_TABLE = ['empty', 'empty', 'battle', 'battle', 'battle', 'battle', 'battle', 'battle', 'battle', 'battle', 'treasure', 'treasure', 'treasure', 'treasure', 'treasure', 'treasure'];
const ITEM_TABLE = ['key', 'key', 'key', 'key', 'key', 'key', 'key', 'key', 'key', 'key', 'sword', 'pegasus', 'wizard', 'nope', 'nope', 'nope'];

export function currentDtPlayer(s: DtState): DtPlayer { return s.players[s.turn]; }

let eventSeq = 1;
function event(s: DtState, p: DtPlayer, title: string, detail: string, steps: DtStep[]): void {
  s.lastEvent = { seq: eventSeq++, color: p.color, player: p.name, title, detail, steps };
  s.log.push(`${p.name}: ${title}${detail ? ` — ${detail}` : ''}`);
}
const step = (pic: string, lcd: string, sfx: string, ms = 1500): DtStep => ({ pic, lcd, sfx, ms });

function capGold(p: DtPlayer): void {
  p.gold = Math.min(p.gold, DT_RULES.goldCap(p));
  if (p.gold < 0) p.gold = 0;
}
const lcdN = (n: number) => String(Math.max(0, Math.min(99, n))).padStart(2, '0');

/** Turn-start upkeep before the first action: curse resolution, then eating. */
function upkeep(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  if (p.fed) return;
  p.fed = true;
  if (p.cursed && s.curse) {
    p.warriors = Math.max(1, p.warriors - s.curse.warriors);
    p.gold -= s.curse.gold;
    capGold(p);
    p.cursed = 0;
    s.curse = null;
    p.node = s.turnNode; // the curse holds the pawn where it stood (L906)
    steps.push(step('cursed', '  ', 'die', 2200), step('warriors', lcdN(p.warriors), 'beep'), step('gold', lcdN(p.gold), 'beep'));
  }
  const eats = Math.ceil(p.warriors / DT_RULES.eatPer);
  p.food = Math.max(0, p.food - eats);
  if (p.food === 0) {
    p.warriors = Math.max(1, p.warriors - 1);
    capGold(p);
    steps.push(step('', '  ', 'starving', 2200), step('warriors', lcdN(p.warriors), 'beep'));
  } else if (p.food <= eats * 4) {
    steps.push(step('', '  ', 'starving', 1500)); // hungry warning
  }
}

function toTurnDone(s: DtState): void {
  s.phase = 'turnDone';
  s.battle = null;
  s.bazaar = null;
  s.riddlePhase = 0;
}

function beginAction(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  p.moves++;
  upkeep(s, p, steps);
}

// --- battles (oneBattle1 L1180) -------------------------------------------

function battleRound(s: DtState, p: DtPlayer, steps: DtStep[]): 'won' | 'lost' | 'ongoing' {
  const b = s.battle!;
  const wd4 = roll(s, 1, 4), bd4 = roll(s, 1, 4);
  const warriorsWin = p.warriors * wd4 >= b.brigands * bd4;
  if (warriorsWin) {
    b.brigands = Math.floor(b.brigands / 2);
    steps.push(step('warriors', lcdN(p.warriors), 'battlewin'), step('brigands', lcdN(b.brigands), 'beep'));
    if (b.brigands === 0) return 'won';
  } else {
    p.warriors -= 1;
    capGold(p);
    steps.push(step('warriors', lcdN(p.warriors), 'battlelose'), step('brigands', lcdN(b.brigands), 'beep'));
  }
  const nw = roll(s, 1, 4), nb = roll(s, 1, 4);
  const nextLoses = p.warriors * nw < b.brigands * nb;
  if (nextLoses && p.warriors <= 2) return 'lost';
  return 'ongoing';
}

function bailOut(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  p.warriors = Math.max(1, p.warriors - 1);
  capGold(p);
  steps.push(step('warriors', lcdN(p.warriors), 'die', 2500));
  toTurnDone(s);
}

// --- treasure (treasureOK L1304) -------------------------------------------

function awardTreasure(s: DtState, p: DtPlayer, steps: DtStep[]): string {
  const gold = roll(s, 13, 20);
  p.gold += gold;
  capGold(p);
  steps.push(step('gold', lcdN(p.gold), 'beep'));
  const item = d16(s, ITEM_TABLE);
  let got = 'none';
  if (item === 'key') {
    if (p.quad === 1 && !p.brasskey) { p.brasskey = 1; got = 'brasskey'; }
    else if (p.quad === 2 && !p.silverkey) { p.silverkey = 1; got = 'silverkey'; }
    else if (p.quad === 3 && !p.goldkey) { p.goldkey = 1; got = 'goldkey'; }
  } else if (item === 'sword' && !p.sword) { p.sword = 1; got = 'sword'; }
  else if (item === 'pegasus' && !p.pegasus) { p.pegasus = 1; got = 'pegasus'; }
  else if (item === 'wizard') {
    const anyCursed = s.players.some((q) => q.cursed);
    if (!anyCursed && s.players.length >= 2) got = 'wizard';
  }
  if (got !== 'none' && got !== 'wizard') steps.push(step(got, '  ', got === 'pegasus' ? 'pegasus' : 'beep', 2000));
  return got;
}

// --- per-space resolutions (called by `step` once the pawn has moved) --------

/** Empty territory: the MOVE roll (safe / lost / plague / dragon / battle). */
function resolveMove(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  const res = d16(s, MOVE_TABLE);
  if (res === 'safe') {
    steps.push(step('', '  ', 'beep', 600));
    event(s, p, 'moved', 'safe trails', steps);
    toTurnDone(s);
  } else if (res === 'lost') {
    if (p.scout) {
      steps.push(step('lost', '  ', 'beep', 1500), step('scout', '  ', 'rotate2', 2000));
      event(s, p, 'got lost', 'the scout finds the way — take another action', steps);
      s.phase = 'playing';
      p.fed = true; // no second food charge (L556)
    } else {
      p.node = s.turnNode; // the pawn returns whence it came (L1669)
      steps.push(step('lost', '  ', 'failure', 2200));
      event(s, p, 'got lost', 'back where they started', steps);
      toTurnDone(s);
    }
  } else if (res === 'plague') {
    if (p.healer) {
      p.warriors = Math.min(99, p.warriors + 2);
      steps.push(step('plague', '  ', 'beep', 1600), step('healer', '  ', 'rotate2', 1600), step('warriors', lcdN(p.warriors), 'beep'));
      event(s, p, 'plague struck', 'the healer turns it — 2 warriors gained', steps);
    } else {
      p.warriors = Math.max(1, p.warriors - 2);
      capGold(p);
      steps.push(step('plague', '  ', 'die', 2200), step('warriors', lcdN(p.warriors), 'beep'));
      event(s, p, 'plague struck', '2 warriors lost', steps);
    }
    toTurnDone(s);
  } else if (res === 'dragon') {
    if (p.sword) {
      const dw = s.dragon.warriors, dg = s.dragon.gold;
      p.warriors = Math.min(99, p.warriors + dw);
      p.gold += dg;
      capGold(p);
      p.sword = 0;
      s.dragon = { warriors: 2, gold: 6 };
      steps.push(step('dragon', '  ', 'dragon', 1800), step('sword', '  ', 'dragondie', 2400), step('warriors', lcdN(p.warriors), 'beep'), step('gold', lcdN(p.gold), 'beep'));
      event(s, p, 'slew the dragon', `the sword shatters — hoard claimed: ${dw} warriors, ${dg} gold`, steps);
    } else {
      const tw = Math.floor(p.warriors / 4), tg = Math.floor(p.gold / 4);
      s.dragon.warriors = Math.min(99, s.dragon.warriors + tw);
      s.dragon.gold = Math.min(99, s.dragon.gold + tg);
      p.warriors -= tw;
      p.gold -= tg;
      capGold(p);
      steps.push(step('dragon', '  ', 'dragon', 2400), step('warriors', lcdN(p.warriors), 'beep'), step('gold', lcdN(p.gold), 'beep'));
      event(s, p, 'the dragon attacked', `it carried off ${tw} warriors and ${tg} gold`, steps);
    }
    toTurnDone(s);
  } else {
    s.battle = { brigands: Math.max(1, p.warriors + roll(s, -2, 2)), tower: false };
    s.phase = 'battle';
    steps.push(step('', '  ', 'battle', 1800), step('brigands', lcdN(s.battle.brigands), 'beep'));
    event(s, p, 'brigands attack', `${s.battle.brigands} brigands — fight or retreat`, steps);
  }
}

/** Tomb / Ruin space: empty / battle / treasure. */
function resolveTomb(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  p.citadelUsed = 0;
  const inside = d16(s, TOMB_TABLE);
  if (inside === 'empty') {
    steps.push(step('', '  ', 'tomb', 2500));
    event(s, p, 'searched the tomb', 'empty', steps);
    toTurnDone(s);
  } else if (inside === 'treasure') {
    steps.push(step('', '  ', 'tomb', 2000));
    const got = awardTreasure(s, p, steps);
    if (got === 'wizard') {
      s.phase = 'cursePick';
      steps.push(step('wizard', '  ', 'beep', 2000));
      event(s, p, 'found treasure', 'a wizard appears — choose a victim to curse', steps);
    } else {
      event(s, p, 'found treasure', got !== 'none' ? `gold and the ${got.replace('key', ' key')}` : 'a hoard of gold', steps);
      toTurnDone(s);
    }
  } else {
    s.battle = { brigands: Math.max(1, p.warriors + roll(s, -2, 2)), tower: false };
    s.phase = 'battle';
    steps.push(step('', '  ', 'tombbattle', 2200), step('brigands', lcdN(s.battle.brigands), 'beep'));
    event(s, p, 'brigands in the tomb', `${s.battle.brigands} brigands — fight or retreat`, steps);
  }
}

/** Bazaar space: open the offer cycle. */
function resolveBazaar(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  p.citadelUsed = 0;
  s.bazaar = {
    offer: 'warrior',
    prices: { warrior: roll(s, 5, 8), beast: roll(s, 17, 26), scout: roll(s, 17, 26), healer: roll(s, 17, 26) },
    buying: 0, haggled: false,
  };
  s.phase = 'bazaar';
  steps.push(step('', '  ', 'bazaar', 3000), step('warrior', lcdN(s.bazaar.prices.warrior), 'beep'));
  event(s, p, 'entered the bazaar', `warriors offered at ${s.bazaar.prices.warrior} gold`, steps);
}

/** Sanctuary or (own) Citadel space: replenish; home citadel doubles at quad 4. */
function resolveSanctuary(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  let bw = 0, bg = 0, bf = 0;
  if (p.warriors <= 4) bw = roll(s, 5, 8);
  const homecoming = p.quad === 4 && p.warriors >= 5 && p.warriors <= 24 && !p.citadelUsed;
  if (homecoming) bw = p.warriors;
  if (p.gold <= 7) bg = roll(s, 9, 16);
  if (p.food <= 5) bf = roll(s, 9, 16);
  steps.push(step('', '  ', 'citadel', 2500));
  if (bw + bg + bf === 0) {
    event(s, p, 'rested at the sanctuary', 'no aid needed', steps);
  } else {
    if (homecoming) p.citadelUsed = 1;
    if (bw) { p.warriors = Math.min(99, p.warriors + bw); steps.push(step('warriors', lcdN(p.warriors), 'beep')); }
    if (bg) { p.gold += bg; capGold(p); steps.push(step('gold', lcdN(p.gold), 'beep')); }
    if (bf) { p.food = Math.min(99, p.food + bf); steps.push(step('food', lcdN(p.food), 'beep')); }
    const bits = [bw && `${bw} warriors`, bg && `${bg} gold`, bf && `${bf} food`].filter(Boolean);
    event(s, p, homecoming ? 'the citadel doubles the garrison' : 'aid at the sanctuary', bits.join(', '), steps);
  }
  toTurnDone(s);
}

/** Frontier space: cross to the next kingdom (key-gated). On success the pawn
 *  moves onto the frontier and quad advances; on a missing key it marches back. */
function resolveFrontier(s: DtState, p: DtPlayer, steps: DtStep[], frontierId: string): void {
  const needKey = (p.quad === 1 && !p.brasskey) || (p.quad === 2 && !p.silverkey) || (p.quad === 3 && !p.goldkey);
  if (needKey) {
    steps.push(step('missing', '  ', 'failure', 2500)); // pawn stays where it was (keyMissing L1972)
    event(s, p, 'turned back at the frontier', 'the frontier guard demands the key', steps);
  } else {
    p.quad++;
    p.node = frontierId; // carried onto the frontier, entering the next kingdom
    steps.push(step('', '  ', 'frontier', 2500));
    event(s, p, 'crossed the frontier', `kingdom ${p.quad} of 4`, steps);
  }
  toTurnDone(s);
}

/** Home Dark Tower space: begin the Riddle of the Keys. */
function resolveTower(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  p.citadelUsed = 0;
  s.phase = 'riddle';
  s.riddlePhase = 1;
  steps.push(step('', '  ', '1812', 3000), step('brasskey', '1 ', 'beep', 1500));
  event(s, p, 'the riddle of the keys', 'name the first key of the sequence', steps);
}

// --- reducer ----------------------------------------------------------------

export function applyDtAction(s: DtState, seat: number, a: DtAction): DtResult {
  if (s.phase === 'ended') return err('game over');
  const p = s.players[seat];
  if (!p) return err('bad seat');
  if (s.turn !== seat) return err('not your turn');
  const steps: DtStep[] = [];

  switch (a.type) {
    case 'end_turn': {
      if (s.phase !== 'turnDone') return err('finish your action first');
      const n = s.players.length;
      s.turn = (s.turn + 1) % n;
      s.totalMoves++;
      const q = s.players[s.turn];
      q.fed = false;
      s.phase = 'playing';
      s.turnNode = q.node; // lost/cursed snap back here
      event(s, q, 'to act', '', [step('', ' ' + q.color[0], 'done', 800)]);
      return { ok: true };
    }

    case 'step': {
      if (s.phase !== 'playing') return err('not now');
      const from = DT_NODE.get(p.node), to = DT_NODE.get(a.to);
      if (!from || !to) return err('bad territory');
      const stay = a.to === p.node;
      if (!stay && !dtAdjacent(p.node).includes(a.to)) return err('that territory is not adjacent');
      const home = p.color; // a player's home kingdom is their colour
      const kNow = dtKingdomAt(p.color, p.quad); // authoritative current kingdom

      // legality by destination + direction of travel
      if (to.kind === 'citadel' && to.kingdom !== home) return err('you may never enter a foreign citadel');
      if (to.kind === 'darktower' && !(to.kingdom === home && p.quad >= 4 && p.goldkey)) return err('the Dark Tower is sealed until you return home with all three keys');
      if (to.kind === 'frontier' && (DT_FORWARD_FRONTIER.get(kNow) !== a.to || p.quad >= 4)) return err('you may only cross the frontier that lies ahead');
      if (from.kind === 'frontier') {
        // stepping off a frontier: only into the kingdom you are entering
        const dir = DT_FRONTIER_DIR.get(p.node)!;
        if (to.kind !== 'frontier' && to.kingdom !== dir.to) return err('step forward into the new kingdom');
      } else if (to.kind !== 'frontier' && to.kingdom && to.kingdom !== kNow) {
        return err('kingdoms are crossed only through a frontier');
      }

      beginAction(s, p, steps); // moves++ and turn-start upkeep

      if (to.kind === 'frontier') {
        resolveFrontier(s, p, steps, a.to);
      } else {
        p.node = a.to; // the pawn moves onto the chosen space
        if (to.kind === 'tomb' || to.kind === 'ruin') resolveTomb(s, p, steps);
        else if (to.kind === 'bazaar') resolveBazaar(s, p, steps);
        else if (to.kind === 'sanctuary' || to.kind === 'citadel') resolveSanctuary(s, p, steps);
        else if (to.kind === 'darktower') resolveTower(s, p, steps);
        else resolveMove(s, p, steps); // empty
      }
      return { ok: true };
    }

    case 'pegasus': {
      if (s.phase !== 'playing') return err('not now');
      if (!p.pegasus) return err('no pegasus');
      p.pegasus = 0;
      s.phase = 'playing'; // free extra action, same player
      p.fed = true; // no second food charge on the re-turn
      event(s, p, 'flew the pegasus', 'takes another action', [step('pegasus', '  ', 'pegasus', 2200)]);
      return { ok: true };
    }

    case 'battle_continue': {
      if (s.phase !== 'battle' || !s.battle) return err('no battle');
      const tower = s.battle.tower;
      const out = battleRound(s, p, steps);
      if (out === 'won') {
        if (tower) {
          const startW = s.battle!.startW ?? p.warriors;
          s.phase = 'ended';
          s.winner = p.color;
          s.score = Math.max(0, Math.min(99, (176 + Math.floor(s.dtBrigands * 1.25)) - ((p.moves + startW) * 4)));
          steps.push(step('victory', '  ', 'intro', 6000), step('victory', lcdN(s.score), '1812', 4000));
          event(s, p, 'THE DARK TOWER FALLS', `${p.name} triumphs — rating ${s.score}`, steps);
          s.log.push(`Game over — ${p.name} defeats the Dark Tower (rating ${s.score})`);
        } else {
          const got = awardTreasure(s, p, steps);
          if (got === 'wizard') {
            s.phase = 'cursePick';
            steps.push(step('wizard', '  ', 'beep', 2000));
            event(s, p, 'victory and treasure', 'a wizard appears — choose a victim to curse', steps);
          } else {
            event(s, p, 'won the battle', got !== 'none' ? `treasure and the ${got.replace('key', ' key')}` : 'treasure taken', steps);
            toTurnDone(s);
          }
        }
      } else if (out === 'lost') {
        bailOut(s, p, steps);
        event(s, p, 'beaten by the brigands', 'the survivors flee', steps);
      } else {
        event(s, p, 'the battle rages', `${p.warriors} warriors vs ${s.battle.brigands} brigands`, steps);
      }
      return { ok: true };
    }

    case 'battle_bail': {
      if (s.phase !== 'battle') return err('no battle');
      bailOut(s, p, steps);
      event(s, p, 'retreated', 'one warrior lost in the escape', steps);
      return { ok: true };
    }

    case 'curse': {
      if (s.phase !== 'cursePick') return err('no curse to cast');
      const v = s.players[a.victim];
      if (!v || v.seat === seat) return err('bad victim');
      const cw = Math.floor(v.warriors / 4), cg = Math.floor(v.gold / 4);
      p.warriors = Math.min(99, p.warriors + cw);
      p.gold += cg;
      capGold(p);
      v.cursed = 1;
      s.curse = { warriors: cw, gold: cg };
      steps.push(step('wizard', 'C' + v.color[0], 'beep', 1800), step('warriors', lcdN(p.warriors), 'beep'), step('gold', lcdN(p.gold), 'beep'));
      event(s, p, `cursed ${v.name}`, `stole ${cw} warriors and ${cg} gold`, steps);
      toTurnDone(s);
      return { ok: true };
    }

    case 'bazaar_yes': {
      if (s.phase !== 'bazaar' || !s.bazaar) return err('not shopping');
      const bz = s.bazaar;
      if (bz.offer === 'warrior' || bz.offer === 'food') {
        const price = bz.offer === 'warrior' ? bz.prices.warrior : 1;
        if ((bz.buying + 1) * price > p.gold) return closeShop(s, p, steps, 'the merchant sees an empty purse');
        bz.buying++;
        event(s, p, 'buying', `${bz.buying} ${bz.offer}${bz.buying > 1 ? 's' : ''} — YES for more, NO to pay`, [step(bz.offer, lcdN(bz.buying), 'tick', 700)]);
      } else {
        const price = bz.prices[bz.offer];
        if (price > p.gold) return closeShop(s, p, steps, 'not enough gold');
        p.gold -= price;
        if (bz.offer === 'beast') p.beast = 1;
        if (bz.offer === 'scout') p.scout = 1;
        if (bz.offer === 'healer') p.healer = 1;
        capGold(p);
        steps.push(step(bz.offer, '  ', 'beep', 1300), step('gold', lcdN(p.gold), 'beep'));
        event(s, p, `bought the ${bz.offer}`, `${price} gold`, steps);
        toTurnDone(s);
      }
      return { ok: true };
    }

    case 'bazaar_no': {
      if (s.phase !== 'bazaar' || !s.bazaar) return err('not shopping');
      const bz = s.bazaar;
      if (bz.buying > 0) {
        const price = bz.offer === 'warrior' ? bz.prices.warrior : 1;
        p.gold -= bz.buying * price;
        if (bz.offer === 'warrior') p.warriors = Math.min(99, p.warriors + bz.buying);
        else p.food = Math.min(99, p.food + bz.buying);
        capGold(p);
        steps.push(step(bz.offer, lcdN(bz.buying), 'beep', 1300), step('gold', lcdN(p.gold), 'beep'));
        event(s, p, `bought ${bz.buying} ${bz.offer}${bz.buying > 1 ? 's' : ''}`, `${bz.buying * price} gold`, steps);
        toTurnDone(s);
        return { ok: true };
      }
      const next = bz.offer === 'warrior' ? 'food'
        : bz.offer === 'food' ? (!p.beast ? 'beast' : !p.scout ? 'scout' : !p.healer ? 'healer' : 'warrior')
        : bz.offer === 'beast' ? (!p.scout ? 'scout' : !p.healer ? 'healer' : 'warrior')
        : bz.offer === 'scout' ? (!p.healer ? 'healer' : 'warrior')
        : 'warrior';
      bz.offer = next as typeof bz.offer;
      const shown = next === 'food' ? 1 : bz.prices[next as 'warrior' | 'beast' | 'scout' | 'healer'];
      event(s, p, 'the merchant offers', `${next} at ${shown} gold`, [step(next, lcdN(shown), 'tick', 900)]);
      return { ok: true };
    }

    case 'bazaar_haggle': {
      if (s.phase !== 'bazaar' || !s.bazaar) return err('not shopping');
      const bz = s.bazaar;
      if (bz.offer === 'food') return closeShop(s, p, steps, 'you cannot haggle a 1-gold price');
      if (bz.buying > 0) return err('finish buying first');
      const failOn = bz.haggled ? 8 : 12; // deal on <= failOn of 16 (L71)
      const dealt = roll(s, 1, 16) <= failOn;
      bz.haggled = true;
      if (bz.prices[bz.offer] === 1 || !dealt) return closeShop(s, p, steps, 'the merchant slams the shutters');
      bz.prices[bz.offer] -= 1;
      event(s, p, 'haggled', `${bz.offer} now ${bz.prices[bz.offer]} gold`, [step(bz.offer, lcdN(bz.prices[bz.offer]), 'tick', 900)]);
      return { ok: true };
    }

    case 'riddle_guess': {
      if (s.phase !== 'riddle' || !s.riddlePhase) return err('no riddle');
      const want = s.riddle[s.riddlePhase - 1];
      if (a.key !== want) {
        steps.push(step(a.key, '  ', 'beep', 1200), step('', '  ', 'failure', 2200));
        event(s, p, 'the tower rejects the key', 'the riddle can be tried again another turn', steps);
        toTurnDone(s);
        return { ok: true };
      }
      if (s.riddlePhase === 1) {
        s.riddlePhase = 2;
        event(s, p, 'the first lock turns', 'name the second key', [step(a.key, '2 ', 'beep', 1500)]);
        return { ok: true };
      }
      s.battle = { brigands: s.dtBrigands, tower: true, startW: p.warriors };
      s.phase = 'battle';
      s.riddlePhase = 0;
      steps.push(step(a.key, '  ', 'beep', 1200), step('', '  ', 'battle', 2000), step('brigands', lcdN(s.dtBrigands), 'beep'));
      event(s, p, 'the gates open', `${s.dtBrigands} brigands defend the Dark Tower`, steps);
      return { ok: true };
    }
  }
  return err('unknown action');
}

function closeShop(s: DtState, p: DtPlayer, steps: DtStep[], why: string): DtResult {
  steps.push(step('closed', '  ', 'failure', 2500));
  event(s, p, 'the bazaar closed', why, steps);
  toTurnDone(s);
  return { ok: true };
}

// --- helpers for clients: the legal destinations from a pawn's node ---------

/** The territories a player may step to this turn (adjacent + rules), excluding
 *  illegal ones. Staying put (their own node) is legal too but not listed. */
export function dtLegalSteps(s: DtState, seat: number): string[] {
  const p = s.players[seat];
  if (!p || s.turn !== seat || s.phase !== 'playing') return [];
  const from = DT_NODE.get(p.node);
  if (!from) return [];
  const home = p.color, kNow = dtKingdomAt(p.color, p.quad);
  const out: string[] = [];
  for (const id of dtAdjacent(p.node)) {
    const to = DT_NODE.get(id)!;
    if (to.kind === 'citadel' && to.kingdom !== home) continue;
    if (to.kind === 'darktower' && !(to.kingdom === home && p.quad >= 4 && p.goldkey)) continue;
    if (to.kind === 'frontier') { if (DT_FORWARD_FRONTIER.get(kNow) !== id || p.quad >= 4) continue; }
    else if (from.kind === 'frontier') { const dir = DT_FRONTIER_DIR.get(p.node)!; if (to.kingdom !== dir.to) continue; }
    else if (to.kingdom && to.kingdom !== kNow) continue;
    out.push(id);
  }
  return out;
}

// BFS the graph (through same-kingdom territories) to the nearest goal; return
// the first hop if it is a legal step this turn.
function navHop(start: string, isGoal: (id: string) => boolean, legal: string[], kNow: string): string | null {
  const prev = new Map<string, string | null>([[start, null]]);
  const q = [start]; let goal: string | null = null;
  while (q.length) {
    const c = q.shift()!;
    if (c !== start && isGoal(c)) { goal = c; break; }
    for (const nb of dtAdjacent(c)) {
      if (prev.has(nb)) continue;
      const n = DT_NODE.get(nb)!;
      if (isGoal(nb) || (n.kingdom === kNow && n.kind !== 'frontier' && n.kind !== 'darktower')) { prev.set(nb, c); q.push(nb); }
    }
  }
  if (!goal) return null;
  let cur = goal, hop = goal;
  while (prev.get(cur) !== start && prev.get(cur) != null) { cur = prev.get(cur)!; hop = cur; }
  return legal.includes(hop) ? hop : null;
}

/** A CPU player's chosen destination on the `playing` phase: find this kingdom's
 *  key at the tombs, cross the forward frontier, and once home with all keys
 *  build the garrison and step onto the Dark Tower. Used by the server bot. */
export function dtBotStep(s: DtState, seat: number): string {
  const p = s.players[seat];
  const legal = dtLegalSteps(s, seat);
  if (!legal.length) return p.node;
  const kindOf = (id: string) => DT_NODE.get(id)!.kind;
  const kNow = dtKingdomAt(p.color, p.quad);
  const haveKey = p.quad === 0 || (p.quad === 1 && !!p.brasskey) || (p.quad === 2 && !!p.silverkey) || (p.quad === 3 && !!p.goldkey);
  const armyReady = p.warriors >= Math.min(44, s.dtBrigands);
  const goTo = (g: (id: string) => boolean): string | null => legal.find(g) ?? navHop(p.node, g, legal, kNow);
  const isTomb = (id: string) => kindOf(id) === 'tomb' || kindOf(id) === 'ruin';
  const isRest = (id: string) => kindOf(id) === 'sanctuary' || kindOf(id) === 'citadel';
  const isBazaar = (id: string) => kindOf(id) === 'bazaar';
  const wander = () => legal.find((id) => kindOf(id) === 'empty') ?? legal[0];

  if (p.warriors <= 4 || p.food <= 4) { const h = goTo(isRest); if (h) return h; if (p.gold >= 3) { const hb = goTo(isBazaar); if (hb) return hb; } }
  if (p.quad >= 4 && p.goldkey) {
    if (armyReady) { const h = goTo((id) => kindOf(id) === 'darktower'); if (h) return h; }
    if (p.gold >= 8) { const h = goTo(isBazaar); if (h) return h; }
    if (p.warriors <= 6 || p.food <= 6) { const h = goTo(isRest); if (h) return h; }
    if (isTomb(p.node)) return p.node;
    return goTo(isTomb) ?? wander();
  }
  if (haveKey) { const h = goTo((id) => id === DT_FORWARD_FRONTIER.get(kNow)); if (h) return h; }
  if (p.warriors < 12 && p.gold >= 12) { const h = goTo(isBazaar); if (h) return h; }
  if (isTomb(p.node)) return p.node;
  { const h = goTo(isTomb); if (h) return h; }
  if (p.gold >= 20) { const h = goTo(isBazaar); if (h) return h; }
  return wander();
}
