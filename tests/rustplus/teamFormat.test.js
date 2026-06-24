// Unit tests for the pure Rust+ team formatters (Phase 8.1). No socket, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOnline, formatOffline, formatAlive, formatProx, formatAfk } from '../../rustplus/teamFormat.js';

const M = (over) => ({ steamId: 's', name: 'X', x: 0, y: 0, isOnline: true, isAlive: true, spawnTime: 0, ...over });

test('formatOnline: compte + noms ; personne en ligne', () => {
  const info = { members: [M({ name: 'Bob' }), M({ name: 'Carl', isOnline: false })] };
  assert.equal(formatOnline(info), '🟢 En ligne (1) : Bob');
  assert.equal(formatOnline({ members: [M({ isOnline: false })] }), '⚫ Personne en ligne');
});

test('formatOffline: compte + noms ; toute l’équipe en ligne', () => {
  const info = { members: [M({ name: 'Bob' }), M({ name: 'Carl', isOnline: false })] };
  assert.equal(formatOffline(info), '⚫ Hors ligne (1) : Carl');
  assert.equal(formatOffline({ members: [M()] }), '🟢 Toute l’équipe est en ligne');
});

test('formatAlive: plus petit spawnTime parmi les vivants, morts ignorés', () => {
  const now = 10_000;
  const info = {
    members: [
      M({ name: 'Bob', spawnTime: now - 3 * 3600 - 12 * 60 }), // 3h 12m
      M({ name: 'Alice', spawnTime: now - 60 }), // 1m
      M({ name: 'Carl', isAlive: false, spawnTime: 0 }), // mort → ignoré
    ],
  };
  assert.equal(formatAlive(info, now), '⏳ Plus longue vie : Bob (3h 12m)');
  assert.equal(formatAlive({ members: [M({ isAlive: false })] }, now), '💀 Personne en vie');
});

test('formatProx: distances m/km, trié, appelant exclu, hors ligne exclus', () => {
  const info = {
    members: [
      M({ steamId: 'me', x: 0, y: 0 }),
      M({ steamId: 'a', name: 'Alice', x: 100, y: 100 }), // 141m
      M({ steamId: 'c', name: 'Carl', x: 1000, y: 0 }), // 1.0km
      M({ steamId: 'd', name: 'Dan', x: 5000, y: 0, isOnline: false }), // exclu
    ],
  };
  assert.equal(formatProx(info, 'me'), '📍 Alice 141m · Carl 1.0km');
});

test('formatProx: appelant introuvable → erreur', () => {
  assert.match(formatProx({ members: [M({ steamId: 'a' })] }, 'me'), /introuvable/);
});

test('formatProx: aucun coéquipier en ligne', () => {
  const info = { members: [M({ steamId: 'me' }), M({ steamId: 'a', isOnline: false })] };
  assert.equal(formatProx(info, 'me'), '📍 Aucun coéquipier en ligne');
});

test('formatAfk: liste (minutes) déjà triée ; vide', () => {
  assert.equal(
    formatAfk([{ name: 'Bob', afkMs: 12 * 60000 }, { name: 'Alice', afkMs: 6 * 60000 }]),
    '💤 AFK (2) : Bob (12m), Alice (6m)',
  );
  assert.equal(formatAfk([]), '✅ Personne d’AFK');
});
