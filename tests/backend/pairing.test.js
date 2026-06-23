// IMPORTANT: testApp.js first — it sets DATABASE_PATH=:memory: before db.js loads.
import { db, resetDb } from '../helpers/testApp.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Servers from '../../backend/models/server.js';
import * as Pairings from '../../backend/models/pairing.js';

beforeEach(() => resetDb());

const G = 'guild-1';
const makeServer = (name = 'Atlas') => Servers.addServer({ guildId: G, name, channelId: 'c1' });
const creds = (over = {}) => ({
  serverIp: '1.2.3.4',
  appPort: 28083,
  steamId: '76561190000000001',
  playerToken: 'tok-1',
  ...over,
});

test('add: crée un pairing actif et le renvoie (token stocké)', () => {
  const s = makeServer();
  const p = Pairings.add({ serverId: s.id, ...creds() });
  assert.equal(p.server_id, s.id);
  assert.equal(p.steam_id, '76561190000000001');
  assert.equal(p.app_port, 28083);
  assert.equal(p.player_token, 'tok-1');
  assert.equal(p.is_active, 1);
});

test('add: re-pairing le même (server, steam) rafraîchit token/port et réactive, sans doublon', () => {
  const s = makeServer();
  const p1 = Pairings.add({ serverId: s.id, ...creds() });
  db.prepare('UPDATE rustplus_pairings SET is_active = 0 WHERE id = ?').run(p1.id); // simulate désactivé
  const p2 = Pairings.add({ serverId: s.id, ...creds({ playerToken: 'tok-2', appPort: 28084 }) });
  assert.equal(p2.player_token, 'tok-2');
  assert.equal(p2.app_port, 28084);
  assert.equal(p2.is_active, 1, 'le re-pairing réactive');
  assert.equal(Pairings.getByServer(s.id).length, 1, 'UNIQUE(server_id, steam_id) → pas de doublon');
});

test('UNIQUE: deux joueurs différents sur le même serveur = 2 rows', () => {
  const s = makeServer();
  Pairings.add({ serverId: s.id, ...creds({ steamId: 'p1' }) });
  Pairings.add({ serverId: s.id, ...creds({ steamId: 'p2' }) });
  assert.equal(Pairings.getByServer(s.id).length, 2);
});

test('listActive: ne renvoie que les actifs, tous serveurs confondus', () => {
  const a = makeServer('Atlas');
  const b = Servers.addServer({ guildId: G, name: 'Nomad', channelId: 'c2' });
  Pairings.add({ serverId: a.id, ...creds({ steamId: 'pa' }) });
  const inactive = Pairings.add({ serverId: b.id, ...creds({ steamId: 'pb' }) });
  db.prepare('UPDATE rustplus_pairings SET is_active = 0 WHERE id = ?').run(inactive.id);
  const active = Pairings.listActive();
  assert.equal(active.length, 1);
  assert.equal(active[0].server_id, a.id);
});

test('getActiveForServer: renvoie l’actif du serveur, sinon undefined', () => {
  const s = makeServer();
  assert.equal(Pairings.getActiveForServer(s.id), undefined);
  Pairings.add({ serverId: s.id, ...creds() });
  assert.equal(Pairings.getActiveForServer(s.id).steam_id, '76561190000000001');
});

test('cascade: supprimer le serveur supprime ses pairings', () => {
  const s = makeServer();
  Pairings.add({ serverId: s.id, ...creds() });
  db.prepare('DELETE FROM servers WHERE id = ?').run(s.id); // ON DELETE CASCADE
  assert.equal(Pairings.getByServer(s.id).length, 0);
});

test('remove: supprime un pairing précis, 0 si absent', () => {
  const s = makeServer();
  Pairings.add({ serverId: s.id, ...creds({ steamId: 'p1' }) });
  Pairings.add({ serverId: s.id, ...creds({ steamId: 'p2' }) });
  assert.equal(Pairings.remove(s.id, 'p1'), 1);
  assert.equal(Pairings.remove(s.id, 'ghost'), 0);
  assert.equal(Pairings.getByServer(s.id).length, 1);
});

test('removeByServer: supprime tous les pairings du serveur', () => {
  const s = makeServer();
  Pairings.add({ serverId: s.id, ...creds({ steamId: 'p1' }) });
  Pairings.add({ serverId: s.id, ...creds({ steamId: 'p2' }) });
  assert.equal(Pairings.removeByServer(s.id), 2);
  assert.equal(Pairings.getByServer(s.id).length, 0);
});
