// Tests for the map-marker poller (Phase 8.2) and announceMapEvent. The poller's
// _tick() is driven directly with a fake connection (no live socket); announceMapEvent
// runs against an in-memory DB with an injected emit (no live bot).
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MarkerPoller } from '../../rustplus/poller.js';
import { announceMapEvent } from '../../rustplus/manager.js';
import * as Servers from '../../backend/models/server.js';

beforeEach(() => resetDb());

function fakeConn(markersSeq) {
  let i = 0;
  return {
    serverId: 1,
    connected: true,
    calls: 0,
    async getMapMarkersAsync() {
      this.calls += 1;
      return markersSeq[Math.min(i++, markersSeq.length - 1)];
    },
  };
}

test('poller: 1er tick seed (rien), 2e tick annonce le nouveau cargo', async () => {
  const conn = fakeConn([
    [{ id: 1, type: 5 }], // cargo déjà là au connect
    [{ id: 1, type: 5 }, { id: 2, type: 8 }], // heli apparaît
  ]);
  const events = [];
  const poller = new MarkerPoller(conn, { onEvent: (t, m) => events.push({ t, id: m.id }) });

  await poller._tick();
  assert.deepEqual(events, [], 'rien annoncé au seed');
  await poller._tick();
  assert.deepEqual(events, [{ t: 'helicopter', id: 2 }], 'seul le heli apparu est annoncé');
});

test('poller: socket non connecté → tick no-op', async () => {
  const conn = fakeConn([[{ id: 1, type: 5 }]]);
  conn.connected = false;
  const poller = new MarkerPoller(conn, { onEvent: () => assert.fail('ne devrait pas poller') });
  await poller._tick();
  assert.equal(conn.calls, 0);
});

test('poller: getMapMarkers qui throw → avalé, prevIds intact', async () => {
  let throwNext = false;
  const conn = {
    serverId: 1,
    connected: true,
    async getMapMarkersAsync() {
      if (throwNext) throw new Error('socket reconnecting');
      return [{ id: 1, type: 5 }];
    },
  };
  const events = [];
  const poller = new MarkerPoller(conn, { onEvent: (t, m) => events.push({ t, id: m.id }) });
  await poller._tick(); // seed avec cargo id 1
  throwNext = true;
  await assert.doesNotReject(() => poller._tick()); // poll raté
  throwNext = false;
  await poller._tick(); // toujours le même cargo → pas de doublon
  assert.deepEqual(events, [], 'le poll raté ne réinitialise pas l’état');
});

test('announceMapEvent: insère un event + émet RUST_EVENT vers le bon salon', () => {
  Servers.addServer({ guildId: 'g1', name: 'EU Main', channelId: 'chan-1' });
  const server = Servers.findByGuildName('g1', 'EU Main');
  const emitted = [];
  const payload = announceMapEvent(server.id, 'cargo', { id: 42 }, { emit: (ev, p) => emitted.push({ ev, p }) });

  assert.equal(payload.serverName, 'EU Main');
  assert.equal(payload.channelId, 'chan-1');
  assert.equal(payload.eventType, 'cargo');
  assert.equal(payload.source, 'rustplus');
  assert.equal(emitted.length, 1, 'un seul RUST_EVENT émis');
  assert.equal(emitted[0].ev, 'rust-event');
  const row = db.prepare("SELECT * FROM events WHERE server_id = ?").get(server.id);
  assert.ok(row, 'un event est journalisé');
  assert.equal(row.event_type, 'cargo');
});

test('announceMapEvent: serveur inconnu → null, rien émis', () => {
  const emitted = [];
  const out = announceMapEvent(9999, 'cargo', { id: 1 }, { emit: () => emitted.push(1) });
  assert.equal(out, null);
  assert.equal(emitted.length, 0);
});
