// Tests for the pure FCM pairing-notification parser (Phase 7.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePairingNotification } from '../../rustplus/fcmParser.js';
import { serverBody, entityBody, appDataShape, dataBodyShape } from '../fixtures/fcm-payloads.js';

test('appData shape (push-receiver 0.0.3) → champs serveur extraits', () => {
  const out = parsePairingNotification(appDataShape());
  assert.deepEqual(out, {
    name: 'Rustafied EU Main',
    ip: '203.0.113.7',
    port: 28017, // normalisé en Number
    playerId: '76561190000000001',
    playerToken: '123456789',
  });
});

test('data.body shape (chemin déchiffré) → mêmes champs', () => {
  const out = parsePairingNotification(dataBodyShape());
  assert.equal(out.ip, '203.0.113.7');
  assert.equal(out.port, 28017);
  assert.equal(out.playerToken, '123456789');
});

test('body déjà décodé (objet plat) → accepté', () => {
  const out = parsePairingNotification(serverBody);
  assert.equal(out.name, 'Rustafied EU Main');
});

test('pairing d’entité (type !== server) → null', () => {
  assert.equal(parsePairingNotification(appDataShape(entityBody)), null);
  assert.equal(parsePairingNotification(entityBody), null);
});

test('JSON de body cassé → null (jamais throw)', () => {
  const broken = { appData: [{ key: 'body', value: '{not json' }] };
  assert.equal(parsePairingNotification(broken), null);
});

test('champ de connexion manquant → null', () => {
  const noToken = { ...serverBody, playerToken: undefined };
  assert.equal(parsePairingNotification(noToken), null);
  const noIp = { ...serverBody, ip: '' };
  assert.equal(parsePairingNotification(noIp), null);
});

test('entrées non-objet → null', () => {
  for (const x of [null, undefined, 'x', 42, {}]) {
    assert.equal(parsePairingNotification(x), null);
  }
});
