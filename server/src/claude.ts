// The Claude-played seat. One Messages API call per decision, structured output, no tools.
// Claude sees exactly what a human in that seat would see: its own role, what its role knows,
// its private intel, the public record and the table talk. If the call fails for any reason
// the seat falls back to the built-in bot for that one decision.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  CLAIM_VALUES, POWER_LABEL, TRACK_POWERS, describeShEvent,
  type ShAction, type ClaimSlot, type ShPrivateView, type StampedEvent,
} from '@bge/shared';

export const CLAUDE_MODEL = process.env.SH_CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = (process.env.SH_CLAUDE_EFFORT || 'low') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';

let client: Anthropic | null = null;
let disabledReason: string | null = null;

export function claudeLive(): boolean {
  if (disabledReason) return false;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}
export function claudeStatus(): { live: boolean; model: string | null; reason: string | null } {
  const live = claudeLive();
  return { live, model: live ? CLAUDE_MODEL : null, reason: live ? null : disabledReason ?? 'No ANTHROPIC_API_KEY set' };
}
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
  return client;
}

const Decision = z.object({
  choice: z.string().describe('The id of the option you choose, exactly as listed, for example "A".'),
  say: z.string().describe('One short line you say out loud to the table right now. Empty string to stay silent.'),
  notes: z.string().describe('Your private notes to carry to your next decision. Replaces your previous notes.'),
});

const SYSTEM = `You are a player in a live game of Secret Hitler, the hidden-role party game. You sit at a real table with friends: a shared screen shows the board and each human holds a phone. You are playing to win for your team and to make the game fun. Everyone at the table knows you are Claude, an AI, playing a seat.

THE GAME
- Roles: Liberals, Fascists, and one Hitler (who is on the fascist team). Liberals do not know anyone's role. Fascists know each other and know Hitler. Hitler knows the fascists only in 5 and 6 player games.
- Liberals win when 5 liberal policies are enacted or Hitler is executed. Fascists win when 6 fascist policies are enacted, or Hitler is elected Chancellor after 3 or more fascist policies are on the board.
- Each round: the presidency passes clockwise. The presidential candidate nominates a Chancellor. Everyone alive votes ja or nein in secret, revealed together. A majority of ja elects the government; ties fail.
- Term limits: the last elected Chancellor cannot be nominated. The last elected President cannot either, unless 5 or fewer players are alive.
- A failed election advances the election tracker. At 3 the top policy of the deck is enacted with no power, the tracker resets and term limits are forgotten.
- Legislative session: the President draws 3 policies, discards 1 face down, passes 2 to the Chancellor, who discards 1 and enacts the other. Nobody else ever sees the discards. Afterwards both may claim what they saw, and either may lie.
- The deck starts with 6 liberal and 11 fascist policies, so fascist draws are common even for honest governments.
- Fascist policies grant the sitting President powers depending on the track: investigate a player's party membership (Hitler shows as fascist), call a special election, peek at the top three policies, or execute a player. Executed players are out and their role stays hidden unless it was Hitler.
- After 5 fascist policies the Chancellor may propose a veto. If the President consents both policies are discarded and the tracker advances.
- After 3 fascist policies, a newly elected Chancellor who is not Hitler is publicly confirmed as not Hitler.

HOW TO PLAY WELL
- Reason from the public record: who nominated whom, who voted for governments that passed fascist policies, whose claims conflict. A President and Chancellor whose claims contradict each other means one of them is lying.
- As a liberal, tell the truth about what you saw, share what you learn, and be careful who gets power once 3 fascist policies are down.
- As a fascist, blend in. You may lie about your role, your draws, your investigations and your reasons. Protect Hitler without being obvious. Know when a fascist policy is worth the suspicion.
- As Hitler, look like a trustworthy liberal so the table will hand you the chancellorship late.
- Never state your secret role truthfully if you are on the fascist team. Never reveal information your seat would not have.

YOUR VOICE
- Table talk is spoken aloud by a voice at the table, so keep it to one natural sentence, plain words, no lists, no markdown, no emoji. Refer to players by name.
- Talk like a sharp, good-humoured friend at game night: accuse, defend, joke, pressure. Stay silent on routine moments; speaking on every action gets tiresome. Speak when you nominate, when you are accused or addressed, when you learn something, or when the table is about to make a mistake.

Each turn you get the full situation and a list of options. Reply with the id of exactly one option, your optional line of table talk, and private notes for your future self (suspicions, your own past claims so your story stays consistent, plans). The notes are never shown to anyone.`;

export interface ClaudeDecision {
  kind: 'action' | 'claim' | 'reply';
  action?: ShAction;
  say: string;
  notes: string;
}

interface Option {
  id: string;
  label: string;
  action?: ShAction;
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cards = (v: string | string[]) => (Array.isArray(v) ? v : v.split('')).map((c) => (c === 'L' ? 'Liberal' : 'Fascist')).join(', ');

function actionOptions(v: ShPrivateView): { prompt: string; options: Option[] } | null {
  const acts = v.actions;
  if (!acts.length) return null;
  const name = (i: number) => v.names[i];
  const options: Option[] = [];
  let prompt = '';
  for (const a of acts) {
    const id = letters[options.length];
    switch (a.type) {
      case 'ready': return null;
      case 'nominate':
        prompt = 'You are the presidential candidate. Nominate your Chancellor.';
        options.push({ id, label: `Nominate ${name(a.target)}`, action: a });
        break;
      case 'vote':
        prompt = `Vote on the proposed government: ${name(v.president)} as President, ${name(v.chancellor!)} as Chancellor.`;
        options.push({ id, label: a.ja ? 'Vote JA (yes)' : 'Vote NEIN (no)', action: a });
        break;
      case 'discard':
        prompt = `You are President. You drew: ${cards(v.hand)}. Discard one face down. The other two go to Chancellor ${name(v.chancellor!)}.`;
        options.push({ id, label: `Discard card ${a.index + 1} (${cards([v.hand[a.index]])})`, action: a });
        break;
      case 'enact':
        prompt = `You are Chancellor. President ${name(v.president)} passed you: ${cards(v.hand)}. Enact one. The other is discarded face down.`;
        options.push({ id, label: `Enact card ${a.index + 1} (${cards([v.hand[a.index]])})`, action: a });
        break;
      case 'veto':
        options.push({ id, label: 'Propose a veto of this agenda (the President must consent)', action: a });
        break;
      case 'veto_response':
        prompt = `Chancellor ${name(v.chancellor!)} wants to veto the agenda. If you consent both policies are discarded and the election tracker advances.`;
        options.push({ id, label: a.consent ? 'Consent to the veto' : 'Refuse the veto', action: a });
        break;
      case 'investigate':
        prompt = 'Presidential power: investigate one player. You will secretly see their party membership.';
        options.push({ id, label: `Investigate ${name(a.target)}`, action: a });
        break;
      case 'special_election':
        prompt = 'Presidential power: choose the next presidential candidate.';
        options.push({ id, label: `Give the candidacy to ${name(a.target)}`, action: a });
        break;
      case 'execute':
        prompt = 'Presidential power: you must execute one player.';
        options.push({ id, label: `Execute ${name(a.target)}`, action: a });
        break;
      case 'peek_ack':
        prompt = `Presidential power: you looked at the top three policies. In draw order: ${cards(v.peek ?? [])}.`;
        options.push({ id, label: 'Continue', action: a });
        break;
    }
  }
  return { prompt, options };
}

function claimOptions(v: ShPrivateView, slot: ClaimSlot): { prompt: string; options: Option[] } {
  const gov = v.governments[slot.gov];
  const held = [...v.intel].reverse().find((i) => i.kind === slot.kind && i.round === gov?.round);
  let prompt = '';
  if (slot.kind === 'drew') prompt = `You were President this session and actually drew: ${cards(held?.cards ?? [])}. Tell the table what you drew. You may lie.`;
  else if (slot.kind === 'got') prompt = `You were Chancellor this session and actually received: ${cards(held?.cards ?? [])}. Tell the table what you received. You may lie.`;
  else if (slot.kind === 'peek') {
    const peek = [...v.intel].reverse().find((i) => i.kind === 'peek');
    prompt = `You peeked at the top three policies, in order: ${cards(peek?.cards ?? [])}. Tell the table what you saw. You may lie.`;
  } else {
    const inv = [...v.intel].reverse().find((i) => i.kind === 'investigate' && i.target === slot.target);
    prompt = `You investigated ${v.names[slot.target ?? 0]} and saw party membership: ${inv?.party ?? 'unknown'}. Tell the table what you saw. You may lie.`;
  }
  const options = CLAIM_VALUES[slot.kind].map((value, i) => ({
    id: letters[i],
    label: slot.kind === 'inv' ? `Claim ${value}` : `Claim ${cards(value)}`,
    action: { type: 'claim', kind: slot.kind, value } as ShAction,
  }));
  return { prompt, options };
}

function situation(v: ShPrivateView, events: StampedEvent[], notes: string): string {
  const lines: string[] = [];
  const name = (i: number) => v.names[i];
  lines.push(`YOU ARE: ${name(v.seat)}.`);
  lines.push(`YOUR SECRET ROLE: ${v.role.toUpperCase()} (party: ${v.party}).`);
  if (v.known.length) lines.push(`YOU KNOW: ${v.known.map((k) => `${name(k.seat)} is ${k.role === 'hitler' ? 'Hitler' : 'a fascist'}`).join('; ')}.`);
  else if (v.role === 'hitler') lines.push('YOU KNOW: nothing about who the fascists are. They know you.');
  else if (v.role === 'liberal') lines.push('YOU KNOW: nobody else\'s role.');
  lines.push('');
  lines.push('TABLE, clockwise (presidency passes in this order):');
  v.names.forEach((n, i) => {
    const tags = [
      v.alive[i] ? null : 'EXECUTED',
      v.ai[i] ? 'AI' : null,
      i === v.seat ? 'you' : null,
      v.notHitler[i] && v.alive[i] ? 'confirmed not Hitler' : null,
      v.investigated[i] ? 'has been investigated' : null,
    ].filter(Boolean);
    lines.push(`  ${i + 1}. ${n}${tags.length ? ` (${tags.join(', ')})` : ''}`);
  });
  lines.push('');
  const powers = TRACK_POWERS[v.bracket].map((p, i) => `${i + 1}: ${p ? POWER_LABEL[p].toLowerCase() : i === 5 ? 'fascists win' : 'no power'}`).join(', ');
  lines.push(`BOARD: Liberal ${v.liberal} of 5. Fascist ${v.fascist} of 6. Election tracker ${v.tracker} of 3. Draw pile ${v.deck}. Discard pile ${v.discard}.`);
  lines.push(`FASCIST TRACK POWERS BY SLOT: ${powers}.`);
  if (v.vetoUnlocked) lines.push('Veto power is unlocked.');
  if (v.fascist >= 3) lines.push('DANGER: three or more fascist policies are down. If Hitler is elected Chancellor the fascists win at once.');
  if (v.lastGov) lines.push(`LAST ELECTED GOVERNMENT: ${name(v.lastGov.president)} + ${name(v.lastGov.chancellor)}.`);
  const intel = v.intel.filter((i) => i.kind === 'investigate' || i.kind === 'peek');
  if (intel.length) {
    lines.push('');
    lines.push('YOUR PRIVATE INTEL:');
    for (const i of intel) {
      if (i.kind === 'investigate') lines.push(`  Round ${i.round}: you investigated ${name(i.target!)} and saw party ${i.party}.`);
      else lines.push(`  Round ${i.round}: you peeked at the top three: ${cards(i.cards ?? [])}.`);
    }
  }
  const drew = v.intel.filter((i) => i.kind === 'drew' || i.kind === 'got');
  if (drew.length) {
    lines.push('');
    lines.push('WHAT YOU ACTUALLY HELD IN PAST SESSIONS:');
    for (const i of drew) lines.push(`  Round ${i.round}: as ${i.kind === 'drew' ? 'President you drew' : 'Chancellor you received'} ${cards(i.cards ?? [])}.`);
  }
  lines.push('');
  lines.push('PUBLIC HISTORY AND TABLE TALK, oldest first:');
  const history = events.map((s) => describeShEvent(s.e, v.names)).filter(Boolean) as string[];
  for (const h of history.slice(-160)) lines.push(`  ${h}`);
  lines.push('');
  lines.push(`YOUR PRIVATE NOTES FROM EARLIER: ${notes || '(none yet)'}`);
  return lines.join('\n');
}

async function ask(v: ShPrivateView, events: StampedEvent[], notes: string, prompt: string, options: Option[]): Promise<{ option: Option; say: string; notes: string } | null> {
  const body = `${situation(v, events, notes)}\n\nDECISION: ${prompt}\nOPTIONS:\n${options.map((o) => `  ${o.id}: ${o.label}`).join('\n')}`;
  try {
    const response = await getClient().messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: body }],
      output_config: { format: zodOutputFormat(Decision), effort: EFFORT },
    });
    if (response.stop_reason === 'refusal') {
      console.warn('[claude] declined a decision, using the bot for this move');
      return null;
    }
    const out = response.parsed_output;
    if (!out) return null;
    const id = out.choice.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    const option = options.find((o) => o.id === id);
    if (!option) {
      console.warn(`[claude] returned an unknown option "${out.choice}"`);
      return null;
    }
    const say = out.say.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return { option, say, notes: out.notes.slice(0, 2000) };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      disabledReason = 'The Anthropic API rejected the credentials';
      console.error(`[claude] ${disabledReason}. Claude seats now use the built-in bot.`);
    } else if (err instanceof Anthropic.RateLimitError) {
      console.warn('[claude] rate limited, using the bot for this move');
    } else if (err instanceof Anthropic.APIError) {
      console.warn(`[claude] API error ${err.status}: ${err.message}`);
    } else {
      console.warn('[claude] request failed:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}

// A blocking game decision (nominate, vote, discard, power...).
export async function decideAction(v: ShPrivateView, events: StampedEvent[], notes: string): Promise<ClaudeDecision | null> {
  const o = actionOptions(v);
  if (!o) return null;
  const r = await ask(v, events, notes, o.prompt, o.options);
  if (!r) return null;
  return { kind: 'action', action: r.option.action, say: r.say, notes: r.notes };
}

// What to tell the table about a session, investigation or peek.
export async function decideClaim(v: ShPrivateView, slot: ClaimSlot, events: StampedEvent[], notes: string): Promise<ClaudeDecision | null> {
  const o = claimOptions(v, slot);
  const r = await ask(v, events, notes, o.prompt, o.options);
  if (!r) return null;
  return { kind: 'claim', action: r.option.action, say: r.say, notes: r.notes };
}

// A human just spoke. Reply or stay quiet.
export async function decideReply(v: ShPrivateView, events: StampedEvent[], notes: string, speaker: string, text: string): Promise<ClaudeDecision | null> {
  const prompt = `${speaker} just said to the table: "${text}". Decide whether to answer. Answer when you are addressed, accused or asked something, or when you have a point worth making.`;
  const options: Option[] = [
    { id: 'A', label: 'Reply (put your reply in say)' },
    { id: 'B', label: 'Stay silent (leave say empty)' },
  ];
  const r = await ask(v, events, notes, prompt, options);
  if (!r) return null;
  return { kind: 'reply', say: r.option.id === 'A' ? r.say : '', notes: r.notes };
}
