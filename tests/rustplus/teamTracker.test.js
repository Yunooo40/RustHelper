// Unit tests for the Rust+ team tracker.
import { db, resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bus, TEAM_EVENT } from '../../shared/bus.js';
import { config } from '../../config.js';
import { diffMembers, computeAfk, TeamTracker } from '../../rustplus/teamTracker.js';

const M = (over) => ({ steamId: 's', name: 'X', x: 0, y: 0, isOnline: true, isAlive: true, ...over });

test('diffMembers: join (offline→online et absent→online)', () => {
  const prev = [M({ steamId: 'a', name: 'Alice', isOnline: false })];
  const curr = [M({ steamId: 'a', name: 'Alice', isOnline: true }), M({ steamId: 'b', name: 'Bob' })];
  assert.deepEqual(diffMembers(prev, curr).joined.map((m) => m.steamId).sort(), ['a', 'b']);
});

test('diffMembers: left (online→offline et online→absent)', () => {
  const prev = [M({ steamId: 'a', name: 'Alice' }), M({ steamId: 'b', name: 'Bob' })];
  const curr = [M({ steamId: 'a', name: 'Alice', isOnline: false })];
  assert.deepEqual(diffMembers(prev, curr).left.map((m) => m.steamId).sort(), ['a', 'b']);
});

test('diffMembers: died = isAlive true→false (online), mort offline ignorée', () => {
  const prev = [M({ steamId: 'a', isAlive: true }), M({ steamId: 'b', isAlive: true, isOnline: false })];
  const curr = [M({ steamId: 'a', isAlive: false }), M({ steamId: 'b', isAlive: false, isOnline: false })];
  assert.deepEqual(diffMembers(prev, curr).died.map((m) => m.steamId), ['a']);
});

test('diffMembers: aucun changement → listes vides', () => {
  const same = [M({ steamId: 'a' })];
  assert.deepEqual(diffMembers(same, same), { joined: [], left: [], died: [] });
});

test('computeAfk: immobile franchit le seuil → nowAfk', () => {
  const base = computeAfk(new Map(), [M({ steamId: 'a' })], 0, { thresholdMs: 1000, epsilon: 1 });
  const r = computeAfk(base.posState, [M({ steamId: 'a' })], 1000, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(r.nowAfk.map((m) => m.steamId), ['a']);
});

test('computeAfk: mouvement > epsilon reset le timer', () => {
  const base = computeAfk(new Map(), [M({ steamId: 'a', x: 0, y: 0 })], 0, { thresholdMs: 1000, epsilon: 1 });
  const r = computeAfk(base.posState, [M({ steamId: 'a', x: 100, y: 0 })], 5000, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(r.nowAfk, []);
  assert.equal(r.posState.get('a').since, 5000);
});

test('computeAfk: déjà AFK → pas de double nowAfk ; AFK qui bouge → returned', () => {
  let s = computeAfk(new Map(), [M({ steamId: 'a', x: 0, y: 0 })], 0, { thresholdMs: 1000, epsilon: 1 });
  s = computeAfk(s.posState, [M({ steamId: 'a', x: 0, y: 0 })], 2000, { thresholdMs: 1000, epsilon: 1 }); // devient AFK
  assert.deepEqual(s.nowAfk.map((m) => m.steamId), ['a']);
  const stay = computeAfk(s.posState, [M({ steamId: 'a', x: 0, y: 0 })], 3000, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(stay.nowAfk, []); // toujours AFK, pas ré-annoncé
  const moved = computeAfk(stay.posState, [M({ steamId: 'a', x: 50, y: 0 })], 3500, { thresholdMs: 1000, epsilon: 1 });
  assert.deepEqual(moved.returned.map((m) => m.steamId), ['a']);
});

test('computeAfk: membre offline retiré du posState', () => {
  let s = computeAfk(new Map(), [M({ steamId: 'a' })], 0, { thresholdMs: 1000, epsilon: 1 });
  s = computeAfk(s.posState, [M({ steamId: 'a', isOnline: false })], 100, { thresholdMs: 1000, epsilon: 1 });
  assert.equal(s.posState.has('a'), false);
});

// ── TeamTracker class (bus + per-server opt-in, DB :memory:) ─────────────────────

beforeEach(() => resetDb());

function seedServer({ channelId = 'chan-1', afk = false } = {}) {
  return db
    .prepare("INSERT INTO servers (guild_id, name, channel_id, notify_afk) VALUES ('g', 'Srv', ?, ?)")
    .run(channelId, afk ? 1 : 0).lastInsertRowid;
}

function collect() {
  const events = [];
  const handler = (p) => events.push(p);
  bus.on(TEAM_EVENT, handler);
  return { events, stop: () => bus.off(TEAM_EVENT, handler) };
}

test('TeamTracker: 1er update = baseline silencieuse', () => {
  const t = new TeamTracker(seedServer());
  const sink = collect();
  t.update({ members: [M({ steamId: 'a', name: 'Alice' })] }, 0);
  sink.stop();
  assert.deepEqual(sink.events, []);
  assert.equal(t.primed, true);
});

test('TeamTracker: un join après baseline → 1 TEAM_EVENT join', () => {
  const t = new TeamTracker(seedServer());
  t.update({ members: [] }, 0); // baseline vide
  const sink = collect();
  t.update({ members: [M({ steamId: 'a', name: 'Alice' })] }, 100);
  sink.stop();
  assert.equal(sink.events.length, 1);
  assert.equal(sink.events[0].kind, 'join');
  assert.equal(sink.events[0].member.name, 'Alice');
  assert.equal(sink.events[0].channelId, 'chan-1');
});

test('TeamTracker: pref afk=OFF → passage AFK non émis', () => {
  const t = new TeamTracker(seedServer({ afk: false }));
  t.update({ members: [M({ steamId: 'a', x: 0, y: 0 })] }, 0); // baseline
  const sink = collect();
  t.update({ members: [M({ steamId: 'a', x: 0, y: 0 })] }, config.rustplus.poll.afkThresholdMs + 1);
  sink.stop();
  assert.deepEqual(sink.events.filter((e) => e.kind === 'afk'), []);
});

test('TeamTracker: sans canal (/setup absent) → n’émet rien', () => {
  const t = new TeamTracker(seedServer({ channelId: null }));
  t.update({ members: [] }, 0);
  const sink = collect();
  t.update({ members: [M({ steamId: 'a', name: 'Alice' })] }, 100);
  sink.stop();
  assert.deepEqual(sink.events, []);
});

test('TeamTracker.getAfk: immobiles online, triés par durée desc', () => {
  const t = new TeamTracker(seedServer());
  const th = config.rustplus.poll.afkThresholdMs;
  t.update({ members: [M({ steamId: 'a', name: 'Alice', x: 0, y: 0 }), M({ steamId: 'b', name: 'Bob', x: 0, y: 0 })] }, 0);
  const afk = t.getAfk(th + 5000);
  assert.deepEqual(afk.map((m) => m.name), ['Alice', 'Bob']);
  assert.ok(afk[0].afkMs >= th);
});

test('TeamTracker.reset: re-baseline (le prochain update n’émet rien)', () => {
  const t = new TeamTracker(seedServer());
  t.update({ members: [] }, 0);
  t.reset();
  assert.equal(t.primed, false);
  const sink = collect();
  t.update({ members: [M({ steamId: 'a', name: 'Alice' })] }, 100);
  sink.stop();
  assert.deepEqual(sink.events, []); // baseline again
});
