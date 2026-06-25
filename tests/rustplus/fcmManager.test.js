// Tests for the FCM auto-pairing manager (Phase 7.2). The handler is exercised with an
// in-memory DB and an injected fake syncServer — no real push/Rust+ socket is opened (the
// live listener is validated by hand at pairing time, like connection.js / the plugin).
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handlePairingNotification, startFcmManager, stopFcmManager, getListener } from '../../rustplus/fcmManager.js';
import * as Servers from '../../backend/models/server.js';
import * as Pairings from '../../backend/models/pairing.js';
import { appDataShape, entityBody, serverBody } from '../fixtures/fcm-payloads.js';

beforeEach(() => resetDb());

const credWithGuild = { id: 1, guild_id: 'g1', label: 'Bob', android_id: 'a1', security_token: 's1' };
const credNoGuild = { id: 2, guild_id: null, label: null, android_id: 'a2', security_token: 's2' };

function fakeSync() {
  const calls = [];
  return { fn: (serverId) => calls.push(serverId), calls };
}

test('notif serveur (guild connu) → serveur adopté dans le guild (défaut) + pairing + syncServer', () => {
  const sync = fakeSync();
  const pairing = handlePairingNotification(appDataShape(), credWithGuild, { syncServer: sync.fn });

  const server = Servers.findByGuildName('g1', 'Rustafied EU Main');
  assert.ok(server, 'le serveur est créé dans le guild');
  assert.equal(server.is_default, 1, '1er serveur du guild → défaut');
  assert.equal(pairing.server_id, server.id);
  assert.equal(pairing.server_ip, '203.0.113.7');
  assert.equal(pairing.app_port, 28017);
  assert.equal(pairing.steam_id, '76561190000000001');
  assert.equal(pairing.player_token, '123456789');
  assert.equal(pairing.label, 'Bob');
  assert.deepEqual(sync.calls, [server.id], 'syncServer appelé 1× avec le bon id');
});

test('notif serveur (sans guild) → ligne orpheline (guild_id NULL)', () => {
  const sync = fakeSync();
  handlePairingNotification(appDataShape(), credNoGuild, { syncServer: sync.fn });
  const server = Servers.findByName('Rustafied EU Main');
  assert.ok(server);
  assert.equal(server.guild_id, null, 'capturée comme orpheline, adoptée plus tard par /setup');
});

test('rejouer la même notif → idempotent (0 doublon)', () => {
  const sync = fakeSync();
  handlePairingNotification(appDataShape(), credWithGuild, { syncServer: sync.fn });
  handlePairingNotification(appDataShape(), credWithGuild, { syncServer: sync.fn });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM servers WHERE name = 'Rustafied EU Main'").get().c, 1);
  const server = Servers.findByGuildName('g1', 'Rustafied EU Main');
  assert.equal(Pairings.getByServer(server.id).length, 1, 'un seul pairing (upsert)');
});

test('notif d’entité (smart switch) → ignorée, rien stocké', () => {
  const sync = fakeSync();
  const out = handlePairingNotification(appDataShape(entityBody), credWithGuild, { syncServer: sync.fn });
  assert.equal(out, null);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM servers').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM rustplus_pairings').get().c, 0);
  assert.deepEqual(sync.calls, [], 'pas de socket pour une notif ignorée');
});

test('clash de nom inter-guild → dégrade en orpheline, ne throw pas', () => {
  // g2 possède déjà "Rustafied EU Main" → addServer lèverait SERVER_NAME_TAKEN pour g1.
  Servers.addServer({ guildId: 'g2', name: serverBody.name });
  const sync = fakeSync();
  assert.doesNotThrow(() =>
    handlePairingNotification(appDataShape(), credWithGuild, { syncServer: sync.fn }),
  );
  // Le pairing est tout de même créé (sur une ligne orpheline), socket monté.
  assert.equal(sync.calls.length, 1);
});

test('startFcmManager: sans credential → no-op, aucun listener', () => {
  assert.doesNotThrow(() => startFcmManager());
  assert.equal(getListener(1), undefined);
  stopFcmManager();
});
