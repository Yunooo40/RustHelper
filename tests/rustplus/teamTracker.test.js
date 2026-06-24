// Unit tests for the Rust+ team tracker. Pure diff core here; class tests added in Task 3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMembers, computeAfk } from '../../rustplus/teamTracker.js';

const M = (over) => ({ steamId: 's', name: 'X', x: 0, y: 0, isOnline: true, isAlive: true, ...over });

test('diffMembers: join (offline→online et absent→online)', () => {
  const prev = [M({ steamId: 'a', name: 'Alice', isOnline: false })];
  const curr = [M({ steamId: 'a', name: 'Alice', isOnline: true }), M({ steamId: 'b', name: 'Bob' })];
  assert.deepEqual(diffMembers(prev, curr).joined.map((m) => m.steamId).sort(), ['a', 'b']);
});

test('diffMembers: left (online→offline et online→absent)', () => {
  const prev = [M({ steamId: 'a', name: 'Alice' }), M({ steamId: 'b', name: 'Bob' })];
  const curr = [M({ steamId: 'a', name: 'Alice', isOnline: false })];
  assert.deepEqual(diffMembers(prev, curr).left.map((m) => m.steamId).sort(), ['a', 'b']);
});

test('diffMembers: died = isAlive true→false (online), mort offline ignorée', () => {
  const prev = [M({ steamId: 'a', isAlive: true }), M({ steamId: 'b', isAlive: true, isOnline: false })];
  const curr = [M({ steamId: 'a', isAlive: false }), M({ steamId: 'b', isAlive: false, isOnline: false })];
  assert.deepEqual(diffMembers(prev, curr).died.map((m) => m.steamId), ['a']);
});

test('diffMembers: aucun changement → listes vides', () => {
  const same = [M({ steamId: 'a' })];
  assert.deepEqual(diffMembers(same, same), { joined: [], left: [], died: [] });
});

test('computeAfk: immobile franchit le seuil → nowAfk', () => {
  const base = computeAfk(new Map(), [M({ steamId: 'a' })], 0, { thresholdMs: 1000, epsilon: 1 });
  const r = computeAfk(base.posState, [M({ steamId: 'a' })], 1000, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(r.nowAfk.map((m) => m.steamId), ['a']);
});

test('computeAfk: mouvement > epsilon reset le timer', () => {
  const base = computeAfk(new Map(), [M({ steamId: 'a', x: 0, y: 0 })], 0, { thresholdMs: 1000, epsilon: 1 });
  const r = computeAfk(base.posState, [M({ steamId: 'a', x: 100, y: 0 })], 5000, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(r.nowAfk, []);
  assert.equal(r.posState.get('a').since, 5000);
});

test('computeAfk: déjà AFK → pas de double nowAfk ; AFK qui bouge → returned', () => {
  let s = computeAfk(new Map(), [M({ steamId: 'a', x: 0, y: 0 })], 0, { thresholdMs: 1000, epsilon: 1 });
  s = computeAfk(s.posState, [M({ steamId: 'a', x: 0, y: 0 })], 2000, { thresholdMs: 1000, epsilon: 1 }); // devient AFK
  assert.deepEqual(s.nowAfk.map((m) => m.steamId), ['a']);
  const stay = computeAfk(s.posState, [M({ steamId: 'a', x: 0, y: 0 })], 3000, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(stay.nowAfk, []); // toujours AFK, pas ré-annoncé
  const moved = computeAfk(stay.posState, [M({ steamId: 'a', x: 50, y: 0 })], 3500, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(moved.returned.map((m) => m.steamId), ['a']);
});

test('computeAfk: membre offline retiré du posState', () => {
  let s = computeAfk(new Map(), [M({ steamId: 'a' })], 0, { thresholdMs: 1000, epsilon: 1 });
  s = computeAfk(s.posState, [M({ steamId: 'a', isOnline: false })], 100, { thresholdMs: 1000, epsilon: 1 });
  assert.equal(s.posState.has('a'), false);
});
