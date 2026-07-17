// Saved-state discriminator checks live outside the server entrypoint so the
// compatibility contract can be tested without booting an HTTP server.

const UNTAGGED_STATE_GAMES = new Set(['brass', 'ttr', 'trek', 'darktower']);

export function stateMatchesGame(game: string, state: unknown): boolean {
  if (state == null) return true;
  if (typeof state !== 'object') return false;
  const tagged = (state as { game?: unknown }).game;
  if (typeof tagged === 'string') return tagged === game;
  return UNTAGGED_STATE_GAMES.has(game);
}
