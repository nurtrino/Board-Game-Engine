// Dark Tower — action reducer, mirroring the mod Lua exactly (line refs in
// docs/specs/dark-tower.md). One action per turn; sub-phases for battles,
// the bazaar, curse-victim picks and the riddle. Every resolution emits
// display steps (reel pic / LCD / sound) so clients replay the real tower.

import { mulberry32 } from '../brass/rng.js';
import { DT_RULES, clampToKingdom, currentKingdom, kingdomEntrySpot, type DtKey, type DtPlayer, type DtState, type DtStep } from './state.js';

export type DtAction =
  | { type: 'move' }
  | { type: 'tomb' }
  | { type: 'bazaar' }
  | { type: 'sanctuary' }
  | { type: 'frontier' }
  | { type: 'tower' }
  | { type: 'pegasus' }
  | { type: 'battle_continue' }
  | { type: 'battle_bail' }
  | { type: 'bazaar_yes' }
  | { type: 'bazaar_no' }
  | { type: 'bazaar_haggle' }
  | { type: 'curse'; victim: number }
  | { type: 'riddle_guess'; key: DtKey }
  | { type: 'move_token'; x: number; z: number } // place your own token on the board
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

/** Turn-start upkeep before the first action: curse resolution, then eating.
 *  (needsFood L642: cursed first, then eats=ceil(warriors/15); food 0 ->
 *  starve: -1 warrior/turn, floor 1 in multiplayer.) */
function upkeep(s: DtState, p: DtPlayer, steps: DtStep[]): void {
  if (p.fed) return;
  p.fed = true;
  if (p.cursed && s.curse) {
    p.warriors = Math.max(1, p.warriors - s.curse.warriors);
    p.gold -= s.curse.gold;
    capGold(p);
    p.cursed = 0;
    s.curse = null;
    p.spot = { ...s.turnSpot }; // the curse holds the token where it stood (L906)
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

function beginAction(s: DtState, p: DtPlayer, steps: DtStep[], clearsCitadel = false): void {
  p.moves++;
  if (clearsCitadel) p.citadelUsed = p.citadelUsed; // citadel flag clears on tomb/bazaar/tower (L1124 sets citadel=0)
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
  // pre-roll the next round: an unlucky roll with warriors at the floor
  // force-ends the battle (L1240)
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
      s.turnSpot = { ...q.spot }; // Lua tokenX/tokenZ (L580): lost/cursed snap back here
      event(s, q, 'to act', '', [step('', ' ' + q.color[0], 'done', 800)]);
      return { ok: true };
    }

    case 'move_token': {
      // slide your token within the kingdom you are actually in — you cannot
      // cross into another kingdom this way (only FRONTIER does that). Clamped
      // to the current kingdom's wedge and ring. Only on your turn.
      if (s.phase !== 'playing' && s.phase !== 'turnDone') return err('not now');
      if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) return err('bad spot');
      p.spot = clampToKingdom(currentKingdom(p.color, p.quad), a.x, a.z);
      return { ok: true }; // silent: no tower event, just a position sync
    }

    case 'pegasus': {
      if (s.phase !== 'playing') return err('not now');
      if (!p.pegasus) return err('no pegasus');
      p.pegasus = 0;
      s.phase = 'playing'; // free extra turn: stays on the same player
      event(s, p, 'flew the pegasus', 'takes another action', [step('pegasus', '  ', 'pegasus', 2200)]);
      return { ok: true };
    }

    case 'move': {
      if (s.phase !== 'playing') return err('not now');
      beginAction(s, p, steps);
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
          p.spot = { ...s.turnSpot }; // token returns whence it came (L1669)
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
        // battle
        s.battle = { brigands: Math.max(1, p.warriors + roll(s, -2, 2)), tower: false };
        s.phase = 'battle';
        steps.push(step('', '  ', 'battle', 1800), step('brigands', lcdN(s.battle.brigands), 'beep'));
        event(s, p, 'brigands attack', `${s.battle.brigands} brigands — fight or retreat`, steps);
      }
      return { ok: true };
    }

    case 'tomb': {
      if (s.phase !== 'playing') return err('not now');
      p.citadelUsed = 0;
      beginAction(s, p, steps);
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
      return { ok: true };
    }

    case 'battle_continue': {
      if (s.phase !== 'battle' || !s.battle) return err('no battle');
      const tower = s.battle.tower;
      const out = battleRound(s, p, steps);
      if (out === 'won') {
        if (tower) {
          const startW = s.battle!.startW ?? p.warriors; // warriors at turn start (Lua undoInventory L89)
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

    case 'bazaar': {
      if (s.phase !== 'playing') return err('not now');
      p.citadelUsed = 0;
      beginAction(s, p, steps);
      s.bazaar = {
        offer: 'warrior',
        prices: { warrior: roll(s, 5, 8), beast: roll(s, 17, 26), scout: roll(s, 17, 26), healer: roll(s, 17, 26) },
        buying: 0, haggled: false,
      };
      s.phase = 'bazaar';
      steps.push(step('', '  ', 'bazaar', 3000), step('warrior', lcdN(s.bazaar.prices.warrior), 'beep'));
      event(s, p, 'entered the bazaar', `warriors offered at ${s.bazaar.prices.warrior} gold`, steps);
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
        // complete the warrior/food purchase
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
      // next offer in the Lua cycle (L966-1005)
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

    case 'sanctuary': {
      if (s.phase !== 'playing') return err('not now');
      beginAction(s, p, steps);
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
      return { ok: true };
    }

    case 'frontier': {
      if (s.phase !== 'playing') return err('not now');
      beginAction(s, p, steps);
      const blocked = (p.quad === 1 && !p.brasskey) || (p.quad === 2 && !p.silverkey) || (p.quad === 3 && !p.goldkey) || p.quad >= 4;
      if (blocked) {
        if (p.quad < 4) p.spot = { ...s.turnSpot }; // marched back (keyMissing L1972)
        steps.push(step(p.quad >= 4 ? '' : 'missing', '  ', 'failure', 2500));
        event(s, p, 'turned back at the frontier', p.quad >= 4 ? 'home is the last stop — the tower awaits' : 'the frontier guard demands the key', steps);
      } else {
        p.quad++;
        p.spot = kingdomEntrySpot(currentKingdom(p.color, p.quad)); // carried into the new kingdom
        steps.push(step('', '  ', 'frontier', 2500));
        event(s, p, 'crossed the frontier', `kingdom ${p.quad} of 4`, steps);
      }
      toTurnDone(s);
      return { ok: true };
    }

    case 'tower': {
      if (s.phase !== 'playing') return err('not now');
      p.citadelUsed = 0;
      beginAction(s, p, steps);
      if (!p.goldkey || p.quad < 4) {
        steps.push(step('missing', '  ', 'failure', 2500));
        event(s, p, 'the tower stands sealed', p.quad < 4 ? 'circle all four kingdoms first' : 'the gold key is missing', steps);
        toTurnDone(s);
        return { ok: true };
      }
      s.phase = 'riddle';
      s.riddlePhase = 1;
      steps.push(step('', '  ', '1812', 3000), step('brasskey', '1 ', 'beep', 1500));
      event(s, p, 'the riddle of the keys', 'name the first key of the sequence', steps);
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
      // both right: tower battle (startW = warriors at turn start, for the score)
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
