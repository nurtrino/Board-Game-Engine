import assert from 'node:assert/strict';
import {
  deleteCredentialCandidates,
  deleteSavedGame,
  playerTokenKey,
  SAVE_ADMIN_TOKEN_KEY,
  saveOwnerTokenKey,
  type DeleteFetch,
} from './saveDeletion.js';

const values = new Map([
  [saveOwnerTokenKey('abcd'), ' owner '],
  [playerTokenKey('ABCD'), 'host'],
  [SAVE_ADMIN_TOKEN_KEY, 'host'],
]);
assert.deepEqual(
  deleteCredentialCandidates('abcd', { getItem: (key) => values.get(key) ?? null }),
  ['owner', 'host'],
  'local credentials are normalized and deduplicated',
);
assert.deepEqual(
  deleteCredentialCandidates('ABCD', { getItem: () => { throw new Error('storage disabled'); } }),
  [],
  'disabled browser storage degrades to an unauthenticated-device message',
);

{
  const auth: string[] = [];
  const request: DeleteFetch = async (_url, init) => {
    auth.push(init.headers.Authorization);
    return auth.length === 1
      ? { ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) }
      : { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  await deleteSavedGame('ABCD', ['stale-owner', 'host'], request);
  assert.deepEqual(auth, ['Bearer stale-owner', 'Bearer host'], 'a stale credential falls through to another valid local credential');
}

{
  let requests = 0;
  await deleteSavedGame('GONE', ['owner'], async () => {
    requests++;
    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  });
  assert.equal(requests, 1, 'an already-absent save is a successful idempotent outcome');
}

await assert.rejects(
  deleteSavedGame('NONE', [], async () => { throw new Error('must not run'); }),
  /does not own this save/,
  'missing credentials fail before making a destructive request',
);
await assert.rejects(
  deleteSavedGame('FAIL', ['owner'], async () => ({ ok: false, status: 500, json: async () => ({ error: 'Database unavailable' }) })),
  /Database unavailable/,
  'server failures remain visible to the player',
);
await assert.rejects(
  deleteSavedGame('NETX', ['owner'], async () => { throw new Error('offline'); }),
  /save was not deleted/,
  'network failures never masquerade as successful deletion',
);

console.log('save deletion client: all checks passed');
