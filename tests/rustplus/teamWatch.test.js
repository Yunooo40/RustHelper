// Tests for the pure presence-diff (Phase 8.4) and the TeamWatcher tick + announce.
import { resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { detectStatusChanges } from '../../rustplus/teamWatch.js';
import { TeamWatcher } from '../../rustplus/teamWatcher.js';
import { announceWatchEvent } from '../../rustplus/manager.js';
import * as Servers from '../../backend/models/server.js';

beforeEach(() => resetDb());

const member = (steamId, isOnline, name) => ({ steamId, isOnline, name });

test('detectStatusChanges: 1er poll → seed, aucune alerte', () => {
  const { online, changes } = detectStatusChanges(null, [member('1', true, 'Bob')], ['1']);
  assert.equal(online.get('1'), true);
  assert.deepEqual(changes, []);
});

test('detectStatusChanges: ne suit que les joueurs surveillés', () => {
  const prev = new Map([['1', true]]);
  const members = [member('1', false, 'Bob'), member('2', false, 'Carl')];
  const { changes } = detectStatusChanges(prev, members, ['1']);
  assert.equal(changes.length, 1, 'Carl non surveillé est ignoré');
  assert.equal(changes[0].steamId, '1');
  assert.equal(changes[0].online, false, 'Bob est passé hors ligne');
});

test('detectStatusChanges: pas de flip → aucune alerte', () => {
  const prev = new Map([['1', true]]);
  const { changes } = detectStatusChanges(prev, [member('1', true, 'Bob')], ['1']);
  assert.deepEqual(changes, []);
});

test('TeamWatcher: aucune surveillance → ne poll pas, reset baseline', async () => {
  const conn = { serverId: 1, connected: true, calls: 0, async getTeamInfoAsync() { this.calls++; return { members: [] }; } };
  const w = new TeamWatcher(conn, { getWatched: () => [], onChange: () => assert.fail('ne devrait pas alerter') });
  await w._tick();
  assert.equal(conn.calls, 0, 'pas d’appel getTeamInfo sans surveillance');
});

test('TeamWatcher: seed puis alerte sur déconnexion', async () => {
  let members = [member('1', true, 'Bob')];
  const conn = { serverId: 1, connected: true, async getTeamInfoAsync() { return { members }; } };
  const events = [];
  const w = new TeamWatcher(conn, { getWatched: () => ['1'], onChange: (c) => events.push(c) });

  await w._tick(); // seed (Bob en ligne)
  assert.deepEqual(events, []);
  members = [member('1', false, 'Bob')]; // Bob se déco
  await w._tick();
  assert.equal(events.length, 1);
  assert.equal(events[0].online, false);
  assert.equal(events[0].name, 'Bob');
});

test('announceWatchEvent: émet WATCH_EVENT vers le bon salon', () => {
  Servers.addServer({ guildId: 'g1', name: 'EU', channelId: 'chan-9' });
  const server = Servers.findByGuildName('g1', 'EU');
  const emitted = [];
  const payload = announceWatchEvent(server.id, { steamId: '1', name: 'Bob', online: false }, { emit: (ev, p) => emitted.push({ ev, p }) });
  assert.equal(payload.serverName, 'EU');
  assert.equal(payload.channelId, 'chan-9');
  assert.equal(payload.playerName, 'Bob');
  assert.equal(payload.online, false);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].ev, 'watch-event');
});

test('announceWatchEvent: serveur inconnu → null, rien émis', () => {
  const emitted = [];
  assert.equal(announceWatchEvent(9999, { name: 'x', online: true }, { emit: () => emitted.push(1) }), null);
  assert.equal(emitted.length, 0);
});
