// Unit tests for the shared event-ingestion helper used by BOTH the webhook and the
// Rust+ marker poller: persist the event, refresh the timer (only with a respawn),
// and emit RUST_EVENT for the bot.
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Servers from '../../backend/models/server.js';
import { recordRustEvent } from '../../backend/ingest.js';
import { bus, RUST_EVENT } from '../../shared/bus.js';

beforeEach(() => {
  resetDb();
  bus.removeAllListeners(RUST_EVENT);
});

test('avec next_respawn : event inséré, timer upserté (source), bus émis', async () => {
  const server = Servers.findOrCreateByName('Atlas EU');
  const next = Math.floor(Date.now() / 1000) + 3600;
  const emitted = new Promise((resolve) => bus.once(RUST_EVENT, resolve));

  recordRustEvent({ server, eventType: 'cargo', status: 'spawned', nextRespawn: next, source: 'rustplus' });

  const evt = db.prepare("SELECT * FROM events WHERE event_type='cargo'").get();
  assert.ok(evt, 'event inséré');
  assert.equal(evt.next_respawn, next);

  const timer = db.prepare("SELECT * FROM timers WHERE event_type='cargo'").get();
  assert.ok(timer, 'timer upserté');
  assert.equal(timer.expires_at, next);
  assert.equal(timer.source, 'rustplus');

  const payload = await emitted;
  assert.equal(payload.eventType, 'cargo');
  assert.equal(payload.serverName, 'Atlas EU');
  assert.equal(payload.source, 'rustplus');
  assert.equal(payload.nextRespawn, next);
});

test('sans next_respawn : event inséré, PAS de timer, bus émis (cas du poller live)', async () => {
  const server = Servers.findOrCreateByName('Atlas EU');
  const emitted = new Promise((resolve) => bus.once(RUST_EVENT, resolve));

  recordRustEvent({ server, eventType: 'helicopter', status: 'spawned', source: 'rustplus' });

  assert.ok(db.prepare("SELECT * FROM events WHERE event_type='helicopter'").get(), 'event inséré');
  assert.equal(db.prepare("SELECT * FROM timers WHERE event_type='helicopter'").get(), undefined, 'pas de timer');

  const payload = await emitted;
  assert.equal(payload.eventType, 'helicopter');
  assert.equal(payload.status, 'spawned');
  assert.equal(payload.nextRespawn, null);
  assert.equal(payload.reportedBy, null);
});

test('channelId du serveur propagé au bus (routage de la notif)', async () => {
  const server = Servers.findOrCreateByName('Atlas EU');
  db.prepare('UPDATE servers SET channel_id = ? WHERE id = ?').run('chan-123', server.id);
  const fresh = Servers.findById(server.id);
  const emitted = new Promise((resolve) => bus.once(RUST_EVENT, resolve));

  recordRustEvent({ server: fresh, eventType: 'chinook', status: 'spawned', source: 'rustplus' });

  const payload = await emitted;
  assert.equal(payload.channelId, 'chan-123');
});
