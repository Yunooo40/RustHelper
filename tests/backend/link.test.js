import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { config, resetDb, startTestServer } from '../helpers/testApp.js';
import * as Link from '../../backend/models/link.js';
import { LINK_STEAM } from '../fixtures/link-payloads.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });
beforeEach(() => { resetDb(); config.api.webhookSecret = ''; });

function post(path, body, headers = {}) {
  return fetch(server.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const get = (path) => fetch(server.url + path);

// ───────────────────────────── model ─────────────────────────────

test('model: createCode → claimCode lie discord↔steam et consomme le code', () => {
  const { code } = Link.createCode({ discordUserId: 'D1' });
  assert.match(code, /^[A-Z0-9]{6}$/);

  const r = Link.claimCode({ code, steamId: 'S1', steamName: 'Pete' });
  assert.equal(r.ok, true);
  assert.equal(r.link.discord_user_id, 'D1');
  assert.equal(r.link.steam_id, 'S1');

  // code consommé → 2e claim échoue
  const r2 = Link.claimCode({ code, steamId: 'S1', steamName: 'Pete' });
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, 'unknown');

  assert.equal(Link.findByDiscord('D1').steam_id, 'S1');
  assert.equal(Link.findBySteam('S1').discord_user_id, 'D1');
});

test('model: code inconnu / expiré', () => {
  assert.equal(Link.claimCode({ code: 'NOPE12', steamId: 'S', steamName: 'x' }).reason, 'unknown');

  const { code } = Link.createCode({ discordUserId: 'D2', ttlSeconds: -1 }); // déjà expiré
  const r = Link.claimCode({ code, steamId: 'S2', steamName: 'y' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'expired');
});

test('model: claim insensible à la casse du code', () => {
  const { code } = Link.createCode({ discordUserId: 'Dc' });
  const r = Link.claimCode({ code: code.toLowerCase(), steamId: 'Sc', steamName: 'z' });
  assert.equal(r.ok, true);
});

test('model: re-link remplace (1-to-1) + unlink', () => {
  Link.claimCode({ code: Link.createCode({ discordUserId: 'D3' }).code, steamId: 'S3', steamName: 'a' });
  // même discord, nouveau steam → remplace l'ancien
  Link.claimCode({ code: Link.createCode({ discordUserId: 'D3' }).code, steamId: 'S3b', steamName: 'a' });
  assert.equal(Link.findByDiscord('D3').steam_id, 'S3b');
  assert.equal(Link.findBySteam('S3'), undefined);

  assert.equal(Link.unlink('D3'), true);
  assert.equal(Link.findByDiscord('D3'), undefined);
  assert.equal(Link.unlink('D3'), false); // déjà délié
});

// ───────────────────────────── route ─────────────────────────────

test('route POST /link/claim: 200 + lien', async () => {
  const { code } = Link.createCode({ discordUserId: 'D5' });
  const res = await post('/link/claim', { code, steam_id: 'S5', steam_name: 'Joe' });
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.ok, true);
  assert.equal(b.link.discord_user_id, 'D5');
});

test('route: 400 champs manquants', async () => {
  const res = await post('/link/claim', { code: 'ABC234' }); // pas de steam_id
  assert.equal(res.status, 400);
});

test('route: 404 code inconnu, 410 code expiré', async () => {
  const r404 = await post('/link/claim', { code: 'ZZZ999', steam_id: 'S', steam_name: 'x' });
  assert.equal(r404.status, 404);

  const { code } = Link.createCode({ discordUserId: 'D6', ttlSeconds: -1 });
  const r410 = await post('/link/claim', { code, steam_id: 'S6', steam_name: 'x' });
  assert.equal(r410.status, 410);
});

test('route GET /link par discord / steam', async () => {
  const { code } = Link.createCode({ discordUserId: 'D7' });
  Link.claimCode({ code, steamId: 'S7', steamName: 'K' });

  assert.equal((await (await get('/link?discord=D7')).json()).link.steam_id, 'S7');
  assert.equal((await (await get('/link?steam=S7')).json()).link.discord_user_id, 'D7');
  assert.equal((await (await get('/link?discord=NOPE')).json()).link, null);
});

test('route auth: secret configuré + header faux → 401', async () => {
  config.api.webhookSecret = 'topsecret';
  const { code } = Link.createCode({ discordUserId: 'D8' });
  const res = await post('/link/claim', { code, steam_id: 'S8', steam_name: 'x' }, { 'x-webhook-secret': 'nope' });
  assert.equal(res.status, 401);
});

test('contrat: payload plugin (LINK_STEAM) accepté', async () => {
  const { code } = Link.createCode({ discordUserId: 'D9' });
  const res = await post('/link/claim', { code, ...LINK_STEAM });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).link.steam_id, LINK_STEAM.steam_id);
});
