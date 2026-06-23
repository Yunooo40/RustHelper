// IMPORTANT: testApp.js must be imported first — it sets DATABASE_PATH=:memory:
// before any backend module loads config.
import { resetDb } from '../helpers/testApp.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Stats from '../../backend/models/stats.js';
import * as Death from '../../backend/models/death.js';
import * as Servers from '../../backend/models/server.js';

beforeEach(() => resetDb());

// Create a server row (deaths.server_id is a FK) and return its id.
function server(name = 'Atlas') {
  return Servers.findOrCreateByName(name).id;
}

// Record one death. `killer`/`victim` are Steam ids; names default to the id.
function kill(serverId, killer, victim, extra = {}) {
  return Death.insert({
    serverId,
    killerId: killer,
    killerName: extra.killerName ?? (killer ? `name-${killer}` : null),
    victimId: victim,
    victimName: extra.victimName ?? (victim ? `name-${victim}` : null),
    killerDiscordId: extra.killerDiscordId ?? null,
    victimDiscordId: extra.victimDiscordId ?? null,
  });
}

test('forPlayer: compte kills (en tant que tueur) et deaths (en tant que victime)', () => {
  const s = server();
  kill(s, 'A', 'B');
  kill(s, 'A', 'C');
  kill(s, 'D', 'A');

  const a = Stats.forPlayer({ steamId: 'A' });
  assert.equal(a.kills, 2);
  assert.equal(a.deaths, 1);

  const b = Stats.forPlayer({ steamId: 'B' });
  assert.equal(b.kills, 0);
  assert.equal(b.deaths, 1);
});

test('forPlayer: un suicide (killer == victim) ne compte pas comme kill mais compte comme death', () => {
  const s = server();
  kill(s, 'A', 'A'); // suicide

  const a = Stats.forPlayer({ steamId: 'A' });
  assert.equal(a.kills, 0, 'pas de kill auto-attribué');
  assert.equal(a.deaths, 1, 'le suicide compte comme une mort');
});

test('forPlayer: mort par NPC/environnement (killer null) → death sans kill attribué', () => {
  const s = server();
  kill(s, null, 'A'); // tué par l'environnement

  const a = Stats.forPlayer({ steamId: 'A' });
  assert.equal(a.deaths, 1);
  assert.equal(a.kills, 0);
});

test('forPlayer: K/D évite la division par zéro (deaths=0 → kd=kills)', () => {
  const s = server();
  kill(s, 'A', 'X');
  kill(s, 'A', 'Y');
  kill(s, 'A', 'Z'); // 3 kills, 0 mort

  const a = Stats.forPlayer({ steamId: 'A' });
  assert.equal(a.kd, 3);

  const ghost = Stats.forPlayer({ steamId: 'NOBODY' });
  assert.equal(ghost.kills, 0);
  assert.equal(ghost.deaths, 0);
  assert.equal(ghost.kd, 0, '0 kill / 0 mort → 0, pas NaN/Infinity');
});

test('forPlayer: K/D ratio standard', () => {
  const s = server();
  kill(s, 'A', 'X');
  kill(s, 'A', 'Y');
  kill(s, 'A', 'Z');
  kill(s, 'A', 'W'); // 4 kills
  kill(s, 'E', 'A');
  kill(s, 'F', 'A'); // 2 morts

  assert.equal(Stats.forPlayer({ steamId: 'A' }).kd, 2);
});

test('forPlayer: bestStreak = plus longue série de kills sans mourir', () => {
  const s = server();
  kill(s, 'A', 'X'); // streak 1
  kill(s, 'A', 'Y'); // streak 2
  kill(s, 'Z', 'A'); // mort → reset
  kill(s, 'A', 'W'); // streak 1
  kill(s, 'A', 'V'); // streak 2
  kill(s, 'A', 'U'); // streak 3

  assert.equal(Stats.forPlayer({ steamId: 'A' }).bestStreak, 3);
});

test('forPlayer: un suicide casse la série', () => {
  const s = server();
  kill(s, 'A', 'X'); // streak 1
  kill(s, 'A', 'A'); // suicide → reset (et n'ajoute pas de kill)
  kill(s, 'A', 'Y'); // streak 1

  const a = Stats.forPlayer({ steamId: 'A' });
  assert.equal(a.bestStreak, 1);
  assert.equal(a.kills, 2);
});

test('forPlayer: le filtre serverId isole les stats par serveur', () => {
  const s1 = server('Atlas');
  const s2 = server('Nomad');
  kill(s1, 'A', 'B');
  kill(s1, 'A', 'C');
  kill(s2, 'A', 'D');

  assert.equal(Stats.forPlayer({ steamId: 'A', serverId: s1 }).kills, 2);
  assert.equal(Stats.forPlayer({ steamId: 'A', serverId: s2 }).kills, 1);
  assert.equal(Stats.forPlayer({ steamId: 'A' }).kills, 3, 'sans serverId → tous serveurs');
});

test('forPlayer: name/discordId = la valeur la plus récente vue', () => {
  const s = server();
  kill(s, 'A', 'B', { killerName: 'OldName' });
  kill(s, 'A', 'C', { killerName: 'NewName', killerDiscordId: 'D123' });

  const a = Stats.forPlayer({ steamId: 'A' });
  assert.equal(a.name, 'NewName');
  assert.equal(a.discordId, 'D123');
});

test('leaderboard: trié par K/D puis kills, respecte la limite', () => {
  const s = server();
  // Morts de référence infligées par l'environnement (killer null) pour ne créer
  // aucun tueur parasite dans le classement.
  // A: 4 kills / 1 mort = 4.0
  kill(s, 'A', 'X'); kill(s, 'A', 'Y'); kill(s, 'A', 'Z'); kill(s, 'A', 'W'); kill(s, null, 'A');
  // B: 2 kills / 1 mort = 2.0
  kill(s, 'B', 'X'); kill(s, 'B', 'Y'); kill(s, null, 'B');
  // C: 1 kill / 1 mort = 1.0
  kill(s, 'C', 'X'); kill(s, null, 'C');

  const top = Stats.leaderboard({ limit: 2 });
  assert.equal(top.length, 2);
  assert.equal(top[0].steamId, 'A');
  assert.equal(top[1].steamId, 'B');
  assert.equal(top[0].kd, 4);
});

test('leaderboard: minKills filtre les petits échantillons', () => {
  const s = server();
  kill(s, 'A', 'X'); kill(s, 'A', 'Y'); kill(s, 'A', 'Z'); // 3 kills
  kill(s, 'B', 'X'); // 1 kill seulement

  const ranked = Stats.leaderboard({ minKills: 2 });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].steamId, 'A');
});

test('leaderboard: les suicides ne gonflent pas les kills', () => {
  const s = server();
  kill(s, 'A', 'A'); // suicide
  kill(s, 'A', 'B'); // vrai kill

  const ranked = Stats.leaderboard();
  const a = ranked.find((p) => p.steamId === 'A');
  assert.equal(a.kills, 1);
  assert.equal(a.deaths, 1);
});
