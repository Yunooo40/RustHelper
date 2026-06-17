import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, config, resetDb, startTestServer } from '../helpers/testApp.js';
import { bus, RUST_EVENT } from '../../shared/bus.js';
import { PLUGIN_PAYLOADS } from '../fixtures/plugin-payloads.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });

beforeEach(() => {
  resetDb();
  config.api.webhookSecret = '';       // auth off par défaut
  bus.removeAllListeners(RUST_EVENT);  // pas de fuite de listeners entre tests
});

function post(path, body, headers = {}) {
  return fetch(server.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('400 si "server" manquant', async () => {
  const res = await post('/webhook/rust', { event: 'bradley', status: 'destroyed' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('400 si event inconnu', async () => {
  const res = await post('/webhook/rust', { server: 'S1', event: 'dragon' });
  assert.equal(res.status, 400);
});

test('event valide + next_respawn: 200, log, timer, bus émis', async () => {
  const now = Math.floor(Date.now() / 1000);
  const next = now + 3600;
  const emitted = new Promise((resolve) => bus.once(RUST_EVENT, resolve));

  const res = await post('/webhook/rust', {
    server: 'Atlas EU', event: 'bradley', status: 'destroyed',
    spawn_time: now, next_respawn: next,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.event, 'bradley');
  assert.equal(body.next_respawn, next);

  const evt = db.prepare("SELECT * FROM events WHERE event_type='bradley'").get();
  assert.ok(evt, 'event inséré');
  assert.equal(evt.status, 'destroyed');
  assert.equal(evt.next_respawn, next);

  const timer = db.prepare("SELECT * FROM timers WHERE event_type='bradley'").get();
  assert.ok(timer, 'timer upserté');
  assert.equal(timer.expires_at, next);

  const payload = await emitted;
  assert.equal(payload.eventType, 'bradley');
  assert.equal(payload.serverName, 'Atlas EU');
  assert.equal(payload.nextRespawn, next);
});

test('event valide sans next_respawn: 200, log, PAS de timer', async () => {
  const res = await post('/webhook/rust', { server: 'S2', event: 'helicopter', status: 'spawned' });
  assert.equal(res.status, 200);
  assert.ok(db.prepare("SELECT * FROM events WHERE event_type='helicopter'").get());
  assert.equal(db.prepare("SELECT * FROM timers WHERE event_type='helicopter'").get(), undefined);
});

test('alias en entrée → stocké en clé canonique', async () => {
  const res = await post('/webhook/rust', { server: 'S3', event: 'bradleyapc', status: 'destroyed' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).event, 'bradley');
  assert.ok(db.prepare("SELECT * FROM events WHERE event_type='bradley'").get());
});

test('auth: secret configuré + header correct → 200', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/rust',
    { server: 'S4', event: 'cargo', status: 'spawned' },
    { 'x-webhook-secret': 'topsecret' });
  assert.equal(res.status, 200);
});

test('auth: secret configuré + header faux → 401', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/rust',
    { server: 'S5', event: 'cargo' },
    { 'x-webhook-secret': 'nope' });
  assert.equal(res.status, 401);
});

test('auth: secret configuré + header absent → 401', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/rust', { server: 'S6', event: 'cargo' });
  assert.equal(res.status, 401);
});

test('contrat: tous les payloads du plugin sont acceptés', async () => {
  for (const p of PLUGIN_PAYLOADS) {
    const res = await post('/webhook/rust', p.body);
    assert.equal(res.status, 200, `${p.name} devrait passer (200)`);
    const body = await res.json();
    assert.equal(body.event, p.expectedEvent, `${p.name}: event canonique`);
    const timer = db.prepare('SELECT * FROM timers WHERE event_type = ?').get(p.expectedEvent);
    if (p.expectTimer) assert.ok(timer, `${p.name}: timer attendu`);
    else assert.equal(timer, undefined, `${p.name}: pas de timer attendu`);
  }
});
