// Model tests for fcm_credentials (Phase 7.2 — FCM auto-pairing).
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Fcm from '../../backend/models/fcmCredential.js';

beforeEach(() => resetDb());

test('add → stocke + retrouvable par android_id et par discord user', () => {
  const row = Fcm.add({ androidId: 'a1', securityToken: 's1', guildId: 'g1', discordUserId: 'u1', label: 'Bob' });
  assert.equal(row.android_id, 'a1');
  assert.equal(row.security_token, 's1');
  assert.equal(row.guild_id, 'g1');
  assert.equal(row.is_active, 1);
  assert.equal(Fcm.getByAndroidId('a1').id, row.id);
  assert.deepEqual(Fcm.getByDiscordUser('u1').map((r) => r.android_id), ['a1']);
});

test('add → upsert sur android_id (rafraîchit le token, ré-active)', () => {
  Fcm.add({ androidId: 'a1', securityToken: 'old' });
  Fcm.deactivate('a1');
  const row = Fcm.add({ androidId: 'a1', securityToken: 'new', label: 'refreshed' });
  assert.equal(row.security_token, 'new');
  assert.equal(row.label, 'refreshed');
  assert.equal(row.is_active, 1, 're-pairing ré-active la ligne');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM fcm_credentials').get().c, 1, 'pas de doublon');
});

test('listActive → ne renvoie que les actifs', () => {
  Fcm.add({ androidId: 'a1', securityToken: 's1' });
  Fcm.add({ androidId: 'a2', securityToken: 's2' });
  Fcm.deactivate('a2');
  assert.deepEqual(Fcm.listActive().map((r) => r.android_id), ['a1']);
});

test('remove → supprime, renvoie le nombre de lignes', () => {
  Fcm.add({ androidId: 'a1', securityToken: 's1' });
  assert.equal(Fcm.remove('a1'), 1);
  assert.equal(Fcm.remove('a1'), 0, 'absent → 0');
  assert.equal(Fcm.getByAndroidId('a1'), undefined);
});
