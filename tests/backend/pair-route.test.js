// Route tests for POST/DELETE /pair (Rust+ companion credentials, admin-only).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, config, resetDb, startTestServer } from '../helpers/testApp.js';
import * as Pairings from '../../backend/models/pairing.js';

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

const seedServer = (name = 'Bouzlouf') =>
  db.prepare('INSERT INTO servers (guild_id, name, channel_id) VALUES (?, ?, ?)')
    .run('g1', name, 'c1').lastInsertRowid;

const validBody = (over = {}) => ({
  server: 'Bouzlouf',
  serverIp: '1.2.3.4',
  appPort: 28083,
  steamId: '76561190000000001',
  playerToken: 'secret-token',
  ...over,
});

test('POST /pair — sans secret quand ADMIN_SECRET est set → 401, rien stocké', async () => {
  config.api.adminSecret = 'shh';
  const id = seedServer();
  const res = await send('POST', '/pair', validBody());
  assert.equal(res.status, 401);
  assert.equal(Pairings.getByServer(id).length, 0);
});

test('POST /pair — le secret WEBHOOK ne suffit pas → 401', async () => {
  config.api.adminSecret = 'admin-shh';
  config.api.webhookSecret = 'plugin-shh';
  seedServer();
  const res = await send('POST', '/pair', validBody(), { 'x-webhook-secret': 'plugin-shh' });
  assert.equal(res.status, 401);
});

test('POST /pair — bon secret admin → 200, pairing stocké, token JAMAIS renvoyé', async () => {
  config.api.adminSecret = 'shh';
  const id = seedServer();
  const res = await send('POST', '/pair', validBody(), { 'x-admin-secret': 'shh' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.pairing.steam_id, '76561190000000001');
  assert.equal(body.pairing.player_token, undefined, 'le token secret ne fuit pas dans la réponse');
  // …mais il est bien persisté côté DB.
  assert.equal(Pairings.getActiveForServer(id).player_token, 'secret-token');
});

test('POST /pair — champ manquant → 400', async () => {
  seedServer();
  const res = await send('POST', '/pair', validBody({ playerToken: undefined }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /playerToken/);
});

test('POST /pair — serveur inconnu → 404', async () => {
  const res = await send('POST', '/pair', validBody({ server: 'Ghost' }));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test('DELETE /pair — retire le pairing du serveur → 200 + removed', async () => {
  config.api.adminSecret = 'shh';
  const id = seedServer();
  await send('POST', '/pair', validBody(), { 'x-admin-secret': 'shh' });
  const res = await send('DELETE', '/pair', { server: 'Bouzlouf' }, { 'x-admin-secret': 'shh' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, removed: 1 });
  assert.equal(Pairings.getByServer(id).length, 0);
});
