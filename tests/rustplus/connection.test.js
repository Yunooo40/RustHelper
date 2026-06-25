// Connection poll wiring (Phase 8.2+). No live socket: we construct a Connection (the
// constructor opens nothing — only start() connects) and drive the poll helpers directly.
// Two loops coexist: the team-state poller (_pollTeam/teamTimer) and the map-marker poller
// (_pollMarkers/markerTimer); both are wired by _startPolling/_stopPolling.
import { resetDb } from '../helpers/testApp.js'; // first: :memory: before db.js loads
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from '../../rustplus/connection.js';

beforeEach(() => resetDb());

const pairing = { server_id: 1, server_ip: '127.0.0.1', app_port: 1, steam_id: 'self', player_token: 't' };

test('_pollTeam: feed le tracker avec getTeamInfo quand connecté', async () => {
  const c = new Connection(pairing);
  c.connected = true;
  let fed = null;
  c.getTeamInfoAsync = async () => ({ members: [{ steamId: 'a', name: 'Alice', isOnline: true }] });
  c.tracker = { update: (ti) => { fed = ti; }, reset() {} };
  await c._pollTeam();
  assert.equal(fed.members[0].name, 'Alice');
});

test('_pollTeam: ne fait rien si déconnecté', async () => {
  const c = new Connection(pairing);
  c.connected = false;
  let called = false;
  c.getTeamInfoAsync = async () => { called = true; return { members: [] }; };
  await c._pollTeam();
  assert.equal(called, false);
});

test('stop(): arrête les deux pollers et reset le tracker', () => {
  const c = new Connection(pairing);
  let didReset = false;
  c.tracker = { reset: () => { didReset = true; }, update() {} };
  c._startPolling();
  assert.ok(c.teamTimer, 'team poll loop running');
  assert.ok(c.markerTimer, 'marker poll loop running');
  c.stop();
  assert.equal(c.teamTimer, null);
  assert.equal(c.markerTimer, null);
  assert.equal(didReset, true);
});
