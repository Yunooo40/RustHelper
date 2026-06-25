// Route tests for POST/DELETE /fcm (FCM listener credentials, admin-only, Phase 7.2).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config, resetDb, startTestServer } from '../helpers/testApp.js';
import * as Fcm from '../../backend/models/fcmCredential.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });

beforeEach(() => {
  resetDb();
  config.api.webhookSecret = '';
  config.api.adminSecret = '';
});

const send = (method, path, body, headers = {}) =>
  fetch(server.url + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body == null ? undefined : JSON.stringify(body),
  });

const validBody = (over = {}) => ({
  androidId: '1234567890',
  securityToken: 'super-secret-token',
  guildId: 'g1',
  label: 'Bob',
  ...over,
});

test('POST /fcm — sans secret quand ADMIN_SECRET est set → 401, rien stocké', async () => {
  config.api.adminSecret = 'shh';
  const res = await send('POST', '/fcm', validBody());
  assert.equal(res.status, 401);
  assert.equal(Fcm.listActive().length, 0);
});

test('POST /fcm — le secret WEBHOOK ne suffit pas → 401', async () => {
  config.api.adminSecret = 'admin-shh';
  config.api.webhookSecret = 'plugin-shh';
  const res = await send('POST', '/fcm', validBody(), { 'x-webhook-secret': 'plugin-shh' });
  assert.equal(res.status, 401);
});

test('POST /fcm — bon secret admin → 200, stocké, security_token JAMAIS renvoyé', async () => {
  config.api.adminSecret = 'shh';
  const res = await send('POST', '/fcm', validBody(), { 'x-admin-secret': 'shh' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.credential.android_id, '1234567890');
  assert.equal(body.credential.guild_id, 'g1');
  assert.equal(body.credential.security_token, undefined, 'le secret ne fuit pas dans la réponse');
  // …mais il est bien persisté côté DB.
  assert.equal(Fcm.getByAndroidId('1234567890').security_token, 'super-secret-token');
});

test('POST /fcm — champ manquant → 400', async () => {
  const res = await send('POST', '/fcm', validBody({ securityToken: undefined }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /securityToken/);
});

test('DELETE /fcm — retire le credential → 200 + removed', async () => {
  config.api.adminSecret = 'shh';
  await send('POST', '/fcm', validBody(), { 'x-admin-secret': 'shh' });
  const res = await send('DELETE', '/fcm', { androidId: '1234567890' }, { 'x-admin-secret': 'shh' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, removed: 1 });
  assert.equal(Fcm.getByAndroidId('1234567890'), undefined);
});

test('DELETE /fcm — androidId manquant → 400', async () => {
  const res = await send('DELETE', '/fcm', {});
  assert.equal(res.status, 400);
});
