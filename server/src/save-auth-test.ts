import assert from 'node:assert/strict';
import { bearerToken, canDeleteSave } from './save-auth.js';

const current = {
  ownerToken: 'creator-secret',
  players: [
    { token: 'host-secret' },
    { token: 'guest-secret' },
  ],
};

assert.equal(bearerToken('Bearer creator-secret'), 'creator-secret');
assert.equal(bearerToken('bearer host-secret'), 'host-secret');
assert.equal(bearerToken('Basic abc'), null, 'other authentication schemes are rejected');
assert.equal(bearerToken('Bearer too many parts'), null, 'ambiguous bearer values are rejected');

assert.equal(canDeleteSave(current, 'creator-secret', 'admin-secret'), true, 'the creator owns the save');
assert.equal(canDeleteSave(current, 'host-secret', 'admin-secret'), true, 'seat zero is the host');
assert.equal(canDeleteSave(current, 'admin-secret', 'admin-secret'), true, 'deployment admin can delete');
assert.equal(canDeleteSave(current, 'guest-secret', 'admin-secret'), false, 'another player cannot delete');
assert.equal(canDeleteSave(current, 'wrong', 'admin-secret'), false, 'unknown credentials cannot delete');

const legacy = { players: [{ token: 'legacy-host' }] };
assert.equal(canDeleteSave(legacy, 'legacy-host'), true, 'old saves remain deletable by their original host');
assert.equal(canDeleteSave({ players: [] }, 'anything'), false, 'an ownerless legacy lobby requires admin auth');

console.log('save deletion auth: all checks passed');
