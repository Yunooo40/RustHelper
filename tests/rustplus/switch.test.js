// Tests for the in-game !switch command handler + !help (Phase 9).
// Uses the existing fakeClient + router test harness pattern.
import { db, resetDb } from '../helpers/testApp.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleTeamMessage, resetCooldowns, formatHelp } from '../../rustplus/router.js';
import * as Switches from '../../backend/models/switch.js';

beforeEach(() => { resetDb(); resetCooldowns(); });

const SERVER_ID = 77;
const SELF = 'self';

function fakeClient(entityValue = false) {
  const sent = [];
  let storedValue = entityValue;
  return {
    sent,
    serverId: SERVER_ID,
    connected: true,
    getInfoAsync: async () => ({ players: 1, maxPlayers: 2, queuedPlayers: 0 }),
    getTimeAsync: async () => ({ time: 12 }),
    getTeamInfoAsync: async () => ({ leaderSteamId: 'leader', members: [] }),
    promoteToLeaderAsync: async () => {},
    sendTeamMessageAsync: async (t) => { sent.push(t); },
    getEntityAsync: async () => ({ payload: { value: storedValue } }),
    setEntityAsync: async (id, v) => { storedValue = v; },
  };
}

const teamMsg = (text, steamId = 'leader') => ({ message: { steamId, name: 'Chef', message: text } });

function setupServer() {
  db.prepare('INSERT OR IGNORE INTO servers (id, name) VALUES (?, ?)').run(SERVER_ID, 'srv');
}

test('!switch list sans switch → message aide', async () => {
  setupServer();
  const c = fakeClient();
  await handleTeamMessage(teamMsg('!switch list'), c, SELF);
  assert.match(c.sent[0], /Aucun switch/);
});

test('!switch list avec switches → liste', async () => {
  setupServer();
  Switches.add({ serverId: SERVER_ID, entityId: 1001, label: 'Base' });
  Switches.add({ serverId: SERVER_ID, entityId: 1002, label: 'Farm' });
  const c = fakeClient();
  await handleTeamMessage(teamMsg('!switch list'), c, SELF);
  assert.match(c.sent[0], /Base/);
  assert.match(c.sent[0], /Farm/);
});

test('!switch on Base → envoie ON', async () => {
  setupServer();
  Switches.add({ serverId: SERVER_ID, entityId: 1001, label: 'Base' });
  const c = fakeClient(false);
  await handleTeamMessage(teamMsg('!switch on Base'), c, SELF);
  assert.match(c.sent[0], /ON/);
});

test('!switch off Base → envoie OFF', async () => {
  setupServer();
  Switches.add({ serverId: SERVER_ID, entityId: 1001, label: 'Base' });
  const c = fakeClient(true);
  await handleTeamMessage(teamMsg('!switch off Base'), c, SELF);
  assert.match(c.sent[0], /OFF/);
});

test('!switch toggle Base: OFF→ON', async () => {
  setupServer();
  Switches.add({ serverId: SERVER_ID, entityId: 1001, label: 'Base' });
  const c = fakeClient(false);
  await handleTeamMessage(teamMsg('!switch toggle Base'), c, SELF);
  assert.match(c.sent[0], /ON/);
});

test('!switch on label inconnu → erreur', async () => {
  setupServer();
  const c = fakeClient();
  await handleTeamMessage(teamMsg('!switch on Ghost'), c, SELF);
  assert.match(c.sent[0], /inconnu/);
});

test('!help → liste toutes les commandes', async () => {
  const c = fakeClient();
  await handleTeamMessage(teamMsg('!help'), c, SELF);
  assert.match(c.sent[0], /switch/);
  assert.match(c.sent[0], /pop/);
});

test('formatHelp est une string non vide', () => {
  assert.ok(typeof formatHelp() === 'string' && formatHelp().length > 0);
});
