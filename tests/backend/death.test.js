import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, config, resetDb, startTestServer } from '../helpers/testApp.js';
import { bus, DEATH_EVENT } from '../../shared/bus.js';
import * as Link from '../../backend/models/link.js';
import { DEATH_PAYLOAD } from '../fixtures/death-payloads.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });

beforeEach(() => {
  resetDb();
  config.api.webhookSecret = '';
  bus.removeAllListeners(DEATH_EVENT);
});

function post(path, body, headers = {}) {
  return fetch(server.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// Helper: link a Discord id to a Steam id through the real model flow.
function link(discordId, steamId, name = 'X') {
  const { code } = Link.createCode({ discordUserId: discordId });
  Link.claimCode({ code, steamId, steamName: name });
}

test('death: victime liée → bus.victimDiscordId résolu + persisté', async () => {
  link('DV', 'SV', 'Vic');
  const emitted = new Promise((r) => bus.once(DEATH_EVENT, r));

  const res = await post('/webhook/death', {
    server: 'Atlas', victim_id: 'SV', victim_name: 'Vic', killer_name: 'Bot', cause: 'Bullet', distance: 10,
  });
  assert.equal(res.status, 200);

  const p = await emitted;
  assert.equal(p.victimDiscordId, 'DV');
  assert.equal(p.victimName, 'Vic');
  assert.equal(p.killerName, 'Bot');

  const row = db.prepare("SELECT * FROM deaths WHERE victim_id='SV'").get();
  assert.ok(row, 'death persistée');
  assert.equal(row.victim_discord_id, 'DV');
  assert.equal(row.cause, 'Bullet');
});

test('death: victime non liée → victimDiscordId null (persistée quand même)', async () => {
  const emitted = new Promise((r) => bus.once(DEATH_EVENT, r));
  const res = await post('/webhook/death', { server: 'Atlas', victim_name: 'Rando', victim_id: 'SX' });
  assert.equal(res.status, 200);
  const p = await emitted;
  assert.equal(p.victimDiscordId, null);
  assert.ok(db.prepare("SELECT * FROM deaths WHERE victim_name='Rando'").get());
});

test('death: tueur lié → killerDiscordId résolu', async () => {
  link('DK', 'SK', 'Kill');
  const emitted = new Promise((r) => bus.once(DEATH_EVENT, r));
  await post('/webhook/death', { server: 'Atlas', victim_name: 'V', victim_id: 'SV2', killer_id: 'SK', killer_name: 'Kill' });
  const p = await emitted;
  assert.equal(p.killerDiscordId, 'DK');
});

test('death: 400 si server ou victim_name manquant', async () => {
  assert.equal((await post('/webhook/death', { victim_name: 'V' })).status, 400);
  assert.equal((await post('/webhook/death', { server: 'Atlas' })).status, 400);
});

test('death auth: secret configuré + header faux → 401', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/death', { server: 'Atlas', victim_name: 'V' }, { 'x-webhook-secret': 'nope' });
  assert.equal(res.status, 401);
});

test('contrat: payload death du plugin est accepté', async () => {
  const res = await post('/webhook/death', DEATH_PAYLOAD);
  assert.equal(res.status, 200);
  assert.ok(db.prepare('SELECT * FROM deaths').get());
});
