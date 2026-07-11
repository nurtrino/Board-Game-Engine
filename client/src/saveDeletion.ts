export const SAVE_ADMIN_TOKEN_KEY = 'bge-admin-token';

export function saveOwnerTokenKey(roomId: string): string {
  return `bge-owner-${roomId.toUpperCase()}`;
}

export function playerTokenKey(roomId: string): string {
  return `bge-token-${roomId.toUpperCase()}`;
}

export interface TokenStorage {
  getItem(key: string): string | null;
}

export function deleteCredentialCandidates(roomId: string, storage: TokenStorage): string[] {
  const read = (key: string): string | null => {
    try { return storage.getItem(key); } catch { return null; }
  };
  const candidates = [
    read(saveOwnerTokenKey(roomId)),
    read(playerTokenKey(roomId)),
    read(SAVE_ADMIN_TOKEN_KEY),
  ];
  return [...new Set(candidates.filter((token): token is string => !!token?.trim()).map((token) => token.trim()))];
}

interface DeleteResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type DeleteFetch = (
  input: string,
  init: { method: 'DELETE'; headers: Record<string, string> },
) => Promise<DeleteResponse>;

async function serverMessage(response: DeleteResponse): Promise<string | null> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : null;
  } catch {
    return null;
  }
}

/** Delete only after the server confirms it; retry alternate local credentials on 401/403. */
export async function deleteSavedGame(
  roomId: string,
  credentials: readonly string[],
  request: DeleteFetch = fetch as unknown as DeleteFetch,
): Promise<void> {
  if (!credentials.length) {
    throw new Error('This device does not own this save. Delete it from the device that created it or the host player’s device.');
  }

  for (let i = 0; i < credentials.length; i++) {
    let response: DeleteResponse;
    try {
      response = await request(`/api/saves/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credentials[i]}`,
        },
      });
    } catch {
      throw new Error('Could not reach the server. The save was not deleted.');
    }

    if (response.ok || response.status === 404) return;
    if ((response.status === 401 || response.status === 403) && i + 1 < credentials.length) continue;

    const detail = await serverMessage(response);
    if (response.status === 401 || response.status === 403) {
      throw new Error('This device is not authorized to delete this save. Use the creator or host device.');
    }
    throw new Error(detail || `The server could not delete this save (HTTP ${response.status}).`);
  }
}
