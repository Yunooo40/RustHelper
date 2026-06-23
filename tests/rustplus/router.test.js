// Unit tests for the in-game command router — pure logic, fake Rust+ client, no socket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleTeamMessage, parseCommand, formatPop, formatTime } from '../../rustplus/router.js';

function fakeClient(over = {}) {
  const sent = [];
  return {
    sent,
    getInfoAsync: async () => ({ players: 120, maxPlayers: 200, queuedPlayers: 5, ...over.info }),
    getTimeAsync: async () => ({ time: 13.5, ...over.time }),
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

test('parseCommand: extrait le token en minuscules, null si pas une commande', () => {
  assert.equal(parseCommand('  !Pop  extra '), '!pop');
  assert.equal(parseCommand('hello'), null);
  assert.equal(parseCommand(null), null);
});

test('formatTime: minuit et midi', () => {
  assert.equal(formatTime({ time: 0 }), '🕑 Il est 00:00 en jeu');
  assert.equal(formatTime({ time: 12 }), '🕑 Il est 12:00 en jeu');
});

test('formatPop: direct', () => {
  assert.equal(formatPop({ players: 1, maxPlayers: 2, queuedPlayers: 0 }), '👥 1/2 joueurs');
});
