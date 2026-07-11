import crypto from 'node:crypto';

export interface SaveDeleteSubject {
  ownerToken?: string;
  players: readonly { token: string }[];
}

/** Parse exactly one RFC 6750-style bearer credential. */
export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^\s*Bearer\s+([^\s]+)\s*$/i.exec(authorization);
  return match?.[1] ?? null;
}

function tokenEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * A save may be destroyed by its creator, its original host (seat zero), or
 * the deployment administrator. Seat-zero fallback keeps pre-owner-token
 * saves manageable without exposing any credential in the save listing.
 */
export function canDeleteSave(
  room: SaveDeleteSubject,
  providedToken: string,
  adminToken?: string,
): boolean {
  const accepted = [room.ownerToken, room.players[0]?.token, adminToken]
    .filter((token): token is string => typeof token === 'string' && token.length > 0);
  return accepted.some((token) => tokenEquals(token, providedToken));
}
