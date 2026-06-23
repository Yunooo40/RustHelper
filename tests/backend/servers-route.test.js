// Route tests for the /servers endpoints (GET list + DELETE admin cleanup).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, config, resetDb, startTestServer } from '../helpers/testApp.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });

beforeEach(() => {
  resetDb();
  config.api.webhookSecret = ''; // auth off par défaut ; les tests la mutent à chaud
  config.api.adminSecret = ''; // DELETE est protégé par le secret ADMIN, pas le webhook
});

const req = (method, path, headers = {}) => fetch(server.url + path, { method, headers });

// Seed a server with an event + timer + death, to prove ON DELETE CASCADE.
function seedServer(name) {
  const id = db
    .prepare('INSERT INTO servers (guild_id, name, channel_id) VALUES (?, ?, ?)')
    .run('g1', name, 'c1').lastInsertRowid;
  db.prepare("INSERT INTO events (server_id, event_type) VALUES (?, 'cargo')").run(id);
  db.prepare("INSERT INTO timers (server_id, event_type, expires_at) VALUES (?, 'cargo', 123)").run(id);
  db.prepare('INSERT INTO deaths (server_id, victim_name) VALUES (?, ?)').run(id, 'v');
  return id;
}
const count = (table, id) => db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE server_id = ?`).get(id).n;

test('DELETE /servers/:name — sans secret quand ADMIN_SECRET est set → 401, rien supprimé', async () => {
  config.api.adminSecret = 'shh';
  const id = seedServer('Bouzlouf');
  const res = await req('DELETE', '/servers/Bouzlouf');
  assert.equal(res.status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM servers WHERE id = ?').get(id).n, 1);
});

test('DELETE /servers/:name — le secret WEBHOOK ne suffit PAS (séparation des privilèges) → 401', async () => {
  config.api.adminSecret = 'admin-shh';
  config.api.webhookSecret = 'plugin-shh';
  const id = seedServer('Bouzlouf');
  const res = await req('DELETE', '/servers/Bouzlouf', { 'x-webhook-secret': 'plugin-shh' });
  assert.equal(res.status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM servers WHERE id = ?').get(id).n, 1);
});

test('DELETE /servers/:name — bon secret admin → 200 + supprime + cascade events/timers/deaths', async () => {
  config.api.adminSecret = 'shh';
  const id = seedServer('Bouzlouf');
  const res = await req('DELETE', '/servers/Bouzlouf', { 'x-admin-secret': 'shh' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, removed: 1 });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM servers WHERE id = ?').get(id).n, 0);
  assert.equal(count('events', id), 0, 'events cascade');
  assert.equal(count('timers', id), 0, 'timers cascade');
  assert.equal(count('deaths', id), 0, 'deaths cascade');
});

test('DELETE /servers/:name — nom absent → 404', async () => {
  config.api.adminSecret = 'shh';
  const res = await req('DELETE', '/servers/Ghost', { 'x-admin-secret': 'shh' });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test('DELETE /servers/:name — auth off (dev) + nom encodé URL + insensible casse', async () => {
  const id = seedServer('Atlas EU');
  const res = await req('DELETE', '/servers/' + encodeURIComponent('atlas eu'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).removed, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM servers WHERE id = ?').get(id).n, 0);
});
