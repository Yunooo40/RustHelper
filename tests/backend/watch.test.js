// Tests for the player_watches model (Phase 8.4): add/relabel, list, remove, clear.
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Watches from '../../backend/models/watch.js';

beforeEach(() => resetDb());

function makeServer(name = 'srv') {
  return db.prepare('INSERT INTO servers (name) VALUES (?)').run(name).lastInsertRowid;
}

test('add: insère puis relabel (idempotent sur server+steam)', () => {
  const s = makeServer();
  Watches.add({ serverId: s, steamId: '76561190000000001', label: 'Bob' });
  Watches.add({ serverId: s, steamId: '76561190000000001', label: 'Bobby' });
  const rows = Watches.listByServer(s);
  assert.equal(rows.length, 1, 'pas de doublon');
  assert.equal(rows[0].label, 'Bobby', 'label rafraîchi');
});

test('listByServer: isolé par serveur', () => {
  const s1 = makeServer('a');
  const s2 = makeServer('b');
  Watches.add({ serverId: s1, steamId: '1' });
  Watches.add({ serverId: s2, steamId: '2' });
  assert.equal(Watches.listByServer(s1).length, 1);
  assert.equal(Watches.listAll().length, 2);
});

test('remove: supprime une entrée, renvoie le nombre', () => {
  const s = makeServer();
  Watches.add({ serverId: s, steamId: '1' });
  assert.equal(Watches.remove(s, '1'), 1);
  assert.equal(Watches.remove(s, '1'), 0, 'déjà absent');
});

test('clear: vide tout le serveur, renvoie le nombre', () => {
  const s = makeServer();
  Watches.add({ serverId: s, steamId: '1' });
  Watches.add({ serverId: s, steamId: '2' });
  assert.equal(Watches.clear(s), 2);
  assert.equal(Watches.listByServer(s).length, 0);
});
