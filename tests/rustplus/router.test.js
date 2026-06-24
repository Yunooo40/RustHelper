// Unit tests for the in-game command router — pure logic, fake Rust+ client, no socket.
import { db } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Timers from '../../backend/models/timer.js';
import { handleTeamMessage, parseCommand, formatPop, formatTime, resetCooldowns } from '../../rustplus/router.js';

// Cooldowns are module-global per (server, command); clear them so each test starts fresh.
beforeEach(() => resetCooldowns());

function fakeClient(over = {}) {
  const sent = [];
  const promoted = [];
  return {
    sent,
    promoted,
    serverId: over.serverId,
    tracker: over.tracker,
    getInfoAsync: async () => ({ players: 120, maxPlayers: 200, queuedPlayers: 5, ...over.info }),
    getTimeAsync: async () => ({ time: 13.5, ...over.time }),
    getTeamInfoAsync: async () => over.teamInfo ?? { members: [] },
    promoteToLeaderAsync: async (steamId) => { promoted.push(steamId); },
    sendTeamMessageAsync: async (t) => { sent.push(t); },
  };
}

// AppMessage.broadcast.teamMessage shape: { message: { steamId, name, message } }.
const teamMsg = (text, steamId = 'player-1') => ({ message: { steamId, name: 'Bob', message: text } });

const SELF = 'self-steam-id';

test('!pop → répond joueurs/max (+ file)', async () => {
  const c = fakeClient();
  const cmd = await handleTeamMessage(teamMsg('!pop'), c, SELF);
  assert.equal(cmd, '!pop');
  assert.deepEqual(c.sent, ['👥 120/200 joueurs (+5 en file)']);
});

test('!pop → sans file d’attente, pas de suffixe', async () => {
  const c = fakeClient({ info: { players: 50, maxPlayers: 100, queuedPlayers: 0 } });
  await handleTeamMessage(teamMsg('!pop'), c, SELF);
  assert.deepEqual(c.sent, ['👥 50/100 joueurs']);
});

test('!time → répond HH:MM', async () => {
  const c = fakeClient({ time: { time: 13.5 } });
  const cmd = await handleTeamMessage(teamMsg('!time'), c, SELF);
  assert.equal(cmd, '!time');
  assert.deepEqual(c.sent, ['🕑 Il est 13:30 en jeu']);
});

test('insensible à la casse + arguments ignorés (!POP foo → !pop)', async () => {
  const c = fakeClient();
  const cmd = await handleTeamMessage(teamMsg('!POP foo bar'), c, SELF);
  assert.equal(cmd, '!pop');
  assert.equal(c.sent.length, 1);
});

test('ANTI-BOUCLE: un message de notre propre steamId est ignoré (0 action)', async () => {
  const c = fakeClient();
  const cmd = await handleTeamMessage(teamMsg('!pop', SELF), c, SELF);
  assert.equal(cmd, null);
  assert.deepEqual(c.sent, []);
});

test('commande inconnue → no-op', async () => {
  const c = fakeClient();
  assert.equal(await handleTeamMessage(teamMsg('!ghost'), c, SELF), null);
  assert.deepEqual(c.sent, []);
});

test('message normal (sans !) → no-op', async () => {
  const c = fakeClient();
  assert.equal(await handleTeamMessage(teamMsg('salut les gars'), c, SELF), null);
  assert.deepEqual(c.sent, []);
});

test('message malformé / vide → no-op (pas de crash)', async () => {
  const c = fakeClient();
  assert.equal(await handleTeamMessage(undefined, c, SELF), null);
  assert.equal(await handleTeamMessage({ message: {} }, c, SELF), null);
  assert.deepEqual(c.sent, []);
});

test('parseCommand: extrait { cmd, args }, null si pas une commande', () => {
  assert.deepEqual(parseCommand('  !Leader  Bob Marley '), { cmd: '!leader', args: 'Bob Marley' });
  assert.deepEqual(parseCommand('!pop'), { cmd: '!pop', args: '' });
  assert.equal(parseCommand('hello'), null);
  assert.equal(parseCommand(null), null);
});

// ── Phase 8.1 — équipe & events in-game ─────────────────────────────────────────

const team = {
  leaderSteamId: 'me', // Bob is the current team leader
  members: [
    { steamId: 'me', name: 'Bob', x: 0, y: 0, isOnline: true, isAlive: true, spawnTime: 1000 },
    { steamId: 'a', name: 'Alice', x: 100, y: 100, isOnline: true, isAlive: true, spawnTime: 2000 },
    { steamId: 'c', name: 'Carl', x: 3000, y: 4000, isOnline: false, isAlive: false, spawnTime: 500 },
  ],
};

test('!online → liste les membres en ligne', async () => {
  const c = fakeClient({ teamInfo: team });
  await handleTeamMessage(teamMsg('!online'), c, SELF);
  assert.deepEqual(c.sent, ['🟢 En ligne (2) : Bob, Alice']);
});

test('!offline → liste les membres hors ligne', async () => {
  const c = fakeClient({ teamInfo: team });
  await handleTeamMessage(teamMsg('!offline'), c, SELF);
  assert.deepEqual(c.sent, ['⚫ Hors ligne (1) : Carl']);
});

test('!prox → distances depuis l’appelant, trié, en m/km', async () => {
  const c = fakeClient({ teamInfo: team });
  // appelant = Bob (steamId 'me'); Alice à hypot(100,100)=141m
  await handleTeamMessage(teamMsg('!prox', 'me'), c, SELF);
  assert.deepEqual(c.sent, ['📍 Alice 141m']); // Carl hors ligne → exclu
});

test('!leader sans arg → promeut l’appelant', async () => {
  const c = fakeClient({ teamInfo: team });
  await handleTeamMessage(teamMsg('!leader', 'me'), c, SELF);
  assert.deepEqual(c.promoted, ['me']);
});

test('!leader Alice → promeut le steamId d’Alice', async () => {
  const c = fakeClient({ teamInfo: team });
  await handleTeamMessage(teamMsg('!leader Alice', 'me'), c, SELF);
  assert.deepEqual(c.promoted, ['a']);
});

test('!leader nom inconnu → erreur, aucune promotion', async () => {
  const c = fakeClient({ teamInfo: team });
  await handleTeamMessage(teamMsg('!leader Ghost', 'me'), c, SELF);
  assert.deepEqual(c.promoted, []);
  assert.match(c.sent[0], /introuvable/);
});

test('!bot foo bar (par le chef) → relaie le texte tel quel', async () => {
  const c = fakeClient({ teamInfo: team }); // appelant 'me' = chef
  await handleTeamMessage(teamMsg('!bot foo bar', 'me'), c, SELF);
  assert.deepEqual(c.sent, ['foo bar']);
});

// ── Phase 8.3 — cooldowns & permissions ─────────────────────────────────────────

test('cooldown: 2e !pop dans la fenêtre → ignoré (1 seul envoi)', async () => {
  const c = fakeClient({ serverId: 1 });
  assert.equal(await handleTeamMessage(teamMsg('!pop'), c, SELF, { now: 1000 }), '!pop');
  assert.equal(await handleTeamMessage(teamMsg('!pop'), c, SELF, { now: 3000 }), null);
  assert.equal(c.sent.length, 1, 'le spam est silencieusement ignoré');
});

test('cooldown: après la fenêtre → de nouveau autorisé', async () => {
  const c = fakeClient({ serverId: 1 });
  await handleTeamMessage(teamMsg('!pop'), c, SELF, { now: 1000 });
  assert.equal(await handleTeamMessage(teamMsg('!pop'), c, SELF, { now: 10_000 }), '!pop');
  assert.equal(c.sent.length, 2);
});

test('cooldown: indépendant par serveur', async () => {
  const a = fakeClient({ serverId: 1 });
  const b = fakeClient({ serverId: 2 });
  await handleTeamMessage(teamMsg('!pop'), a, SELF, { now: 1000 });
  assert.equal(await handleTeamMessage(teamMsg('!pop'), b, SELF, { now: 1000 }), '!pop', 'autre serveur non bloqué');
});

test('scope leader: !bot par un non-chef → refusé', async () => {
  const c = fakeClient({ teamInfo: team }); // chef = 'me'
  const out = await handleTeamMessage(teamMsg('!bot coucou', 'a'), c, SELF); // Alice ≠ chef
  assert.equal(out, null);
  assert.deepEqual(c.sent, ['❌ Réservé au chef d’équipe']);
});

test('!leader <nom> par un non-chef → refusé, aucune promotion', async () => {
  const c = fakeClient({ teamInfo: team }); // chef = 'me'
  await handleTeamMessage(teamMsg('!leader Alice', 'a'), c, SELF); // Alice ≠ chef
  assert.deepEqual(c.promoted, []);
  assert.match(c.sent[0], /Seul le chef/);
});

test('!cargo avec timer actif → compte à rebours', async () => {
  db.exec('DELETE FROM timers; DELETE FROM servers;');
  db.prepare("INSERT INTO servers (id, name) VALUES (7, 'srv')").run();
  Timers.upsert({ serverId: 7, eventType: 'cargo', expiresAt: Math.floor(Date.now() / 1000) + 720 });
  const c = fakeClient({ serverId: 7 });
  await handleTeamMessage(teamMsg('!cargo'), c, SELF);
  assert.match(c.sent[0], /🚢 Cargo Ship — dans \d+m/);
});

test('!small sans timer → aucun timer actif', async () => {
  db.exec('DELETE FROM timers;');
  const c = fakeClient({ serverId: 7 });
  await handleTeamMessage(teamMsg('!small'), c, SELF);
  assert.deepEqual(c.sent, ['🛢️ Small Oil Rig — aucun timer actif']);
});

test('formatTime: minuit et midi', () => {
  assert.equal(formatTime({ time: 0 }), '🕑 Il est 00:00 en jeu');
  assert.equal(formatTime({ time: 12 }), '🕑 Il est 12:00 en jeu');
});

test('formatPop: direct', () => {
  assert.equal(formatPop({ players: 1, maxPlayers: 2, queuedPlayers: 0 }), '👥 1/2 joueurs');
});

test('!afk → liste les AFK depuis le tracker', async () => {
  const c = fakeClient({ tracker: { getAfk: () => [{ name: 'Bob', afkMs: 6 * 60000 }] } });
  const cmd = await handleTeamMessage(teamMsg('!afk'), c, SELF);
  assert.equal(cmd, '!afk');
  assert.deepEqual(c.sent, ['💤 AFK (1) : Bob (6m)']);
});

test('!afk → personne d’AFK', async () => {
  const c = fakeClient({ tracker: { getAfk: () => [] } });
  await handleTeamMessage(teamMsg('!afk'), c, SELF);
  assert.deepEqual(c.sent, ['✅ Personne d’AFK']);
});
