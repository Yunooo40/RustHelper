// Tests for the pure map-marker logic (Phase 8.2): classify markers and detect the
// ones that appeared since the previous poll. No socket, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMarker, detectAppeared } from '../../rustplus/mapEvents.js';

test('classifyMarker mappe cargo / heli / chinook, ignore le reste', () => {
  assert.equal(classifyMarker({ id: 1, type: 5 }), 'cargo');
  assert.equal(classifyMarker({ id: 2, type: 8 }), 'helicopter');
  assert.equal(classifyMarker({ id: 3, type: 4 }), 'chinook');
  assert.equal(classifyMarker({ id: 4, type: 1 }), null, 'player → null');
  assert.equal(classifyMarker({ id: 5, type: 3 }), null, 'vending → null');
  assert.equal(classifyMarker(null), null);
  assert.equal(classifyMarker({ id: 6 }), null, 'type manquant → null');
});

test('premier poll (prevIds null) → seed, aucun "appeared"', () => {
  const markers = [{ id: 10, type: 5 }, { id: 11, type: 1 }];
  const { ids, appeared } = detectAppeared(null, markers);
  assert.deepEqual([...ids], [10], 'seul le cargo est suivi (le player est ignoré)');
  assert.deepEqual(appeared, [], 'rien annoncé au tout premier poll');
});

test('poll suivant → seuls les nouveaux marqueurs suivis remontent', () => {
  const prev = new Set([10]);
  const markers = [{ id: 10, type: 5 }, { id: 20, type: 8 }, { id: 21, type: 2 }];
  const { ids, appeared } = detectAppeared(prev, markers);
  assert.deepEqual([...ids].sort((a, b) => a - b), [10, 20]);
  assert.equal(appeared.length, 1, 'cargo déjà présent ignoré, explosion ignorée');
  assert.equal(appeared[0].id, 20);
  assert.equal(appeared[0].eventType, 'helicopter');
});

test('marqueur disparu puis réapparu → ré-annoncé (nouvel id)', () => {
  let { ids } = detectAppeared(null, [{ id: 30, type: 5 }]);
  ({ ids } = detectAppeared(ids, [])); // cargo parti
  const { appeared } = detectAppeared(ids, [{ id: 31, type: 5 }]); // nouveau cargo
  assert.equal(appeared.length, 1);
  assert.equal(appeared[0].eventType, 'cargo');
});

test('markers undefined → ne throw pas', () => {
  assert.doesNotThrow(() => detectAppeared(null, undefined));
});
