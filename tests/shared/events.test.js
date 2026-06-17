import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEvent } from '../../shared/events.js';

test('resolveEvent: clés canoniques', () => {
  assert.equal(resolveEvent('bradley'), 'bradley');
  assert.equal(resolveEvent('helicopter'), 'helicopter');
  assert.equal(resolveEvent('cargo'), 'cargo');
});

test('resolveEvent: alias reconnus', () => {
  assert.equal(resolveEvent('heli'), 'helicopter');
  assert.equal(resolveEvent('bradleyapc'), 'bradley');
  assert.equal(resolveEvent('ch47'), 'chinook');
  assert.equal(resolveEvent('cargoship'), 'cargo');
});

test('resolveEvent: normalisation case / espaces / tirets', () => {
  assert.equal(resolveEvent('Patrol-Helicopter'), 'helicopter');
  assert.equal(resolveEvent('  CARGO_SHIP  '), 'cargo');
});

test('resolveEvent: inconnu / vide / null → null', () => {
  assert.equal(resolveEvent('dragon'), null);
  assert.equal(resolveEvent(''), null);
  assert.equal(resolveEvent(null), null);
  assert.equal(resolveEvent(undefined), null);
});
