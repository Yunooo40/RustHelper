// Connection poll wiring (Phase 8.2). No live socket: we construct a Connection (the
// constructor opens nothing — only start() connects) and drive the poll helpers directly.
import { resetDb } from '../helpers/testApp.js'; // first: :memory: before db.js loads
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from '../../rustplus/connection.js';

beforeEach(() => resetDb());

const pairing = { server_id: 1, server_ip: '127.0.0.1', app_port: 1, steam_id: 'self', player_token: 't' };

test('_pollOnce: feed le tracker avec getTeamInfo quand connecté', async () => {
  const c = new Connection(pairing);
  c.connected = true;
  let fed = null;
  c.getTeamInfoAsync = async () => ({ members: [{ steamId: 'a', name: 'Alice', isOnline: true }] });
  c.tracker = { update: (ti) => { fed = ti; }, reset() {} };
  await c._pollOnce();
  assert.equal(fed.members[0].name, 'Alice');
});

test('_pollOnce: ne fait rien si déconnecté', async () => {
  const c = new Connection(pairing);
  c.connected = false;
  let called = false;
  c.getTeamInfoAsync = async () => { called = true; return { members: [] }; };
  await c._pollOnce();
  assert.equal(called, false);
});

test('stop(): arrête le polling et reset le tracker', () => {
  const c = new Connection(pairing);
  let didReset = false;
  c.tracker = { reset: () => { didReset = true; }, update() {} };
  c._startPolling();
  assert.ok(c.pollTimer);
  c.stop();
  assert.equal(c.pollTimer, null);
  assert.equal(didReset, true);
});
