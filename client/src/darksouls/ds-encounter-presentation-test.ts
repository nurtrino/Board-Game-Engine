import { strict as assert } from 'node:assert';
import { dsNearestPoint, dsNodeIdForOption, dsPieceIdForOption, dsYawToward } from './dsEncounterPresentation';
import { dsMiniForwardCorrection } from './ds-assets';

assert.equal(dsPieceIdForOption('uid:17'), 'enemy:17');
assert.equal(dsPieceIdForOption('enemy:17'), 'enemy:17');
assert.equal(dsPieceIdForOption('unit:smough'), 'boss:smough');
assert.equal(dsPieceIdForOption('seat:2'), 'character:2');
assert.equal(dsPieceIdForOption('char:2'), 'character:2');
assert.equal(dsPieceIdForOption('node:n4'), null);

assert.equal(dsNodeIdForOption('node:n4'), 'n4');
assert.equal(dsNodeIdForOption('node:n4:front'), null);
assert.equal(dsNodeIdForOption('stay'), null);

assert.ok(Math.abs(dsYawToward({ x: 0, z: 0 }, { x: 0, z: 1 })) < 1e-9);
assert.ok(Math.abs(dsYawToward({ x: 0, z: 0 }, { x: 1, z: 0 }) - Math.PI / 2) < 1e-9);
assert.ok(Math.abs(dsYawToward({ x: 0, z: 0 }, { x: 0, z: -1 }) - Math.PI) < 1e-9);
assert.deepEqual(dsNearestPoint({ x: 0, z: 0 }, [{ x: 4, z: 0 }, { x: 1, z: 1 }]), { x: 1, z: 1 });

assert.equal(dsMiniForwardCorrection('knight'), Math.PI);
assert.equal(dsMiniForwardCorrection('hollow-soldier'), -Math.PI / 2);
assert.equal(dsMiniForwardCorrection('boreal-outrider-knight'), Math.PI / 2);
assert.equal(dsMiniForwardCorrection('executioner-smough'), 0);

console.log('Dark Souls encounter presentation tests passed.');
