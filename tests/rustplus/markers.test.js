// Unit tests for the Rust+ map-marker diff — pure logic, no socket, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMarkers, oilRigsFromMap, MARKER_EVENT } from '../../rustplus/markers.js';

// AppMarker types: 2=Explosion, 4=CH47, 5=CargoShip, 8=PatrolHelicopter; 1=Player, 3=Vending.
const cargo = (id) => ({ id, type: 5, x: 1, y: 2 });
const heli = (id) => ({ id, type: 8, x: 3, y: 4 });
const ch47 = (id) => ({ id, type: 4, x: 5, y: 6 });
const boom = (id) => ({ id, type: 2, x: 7, y: 8 });
const player = (id) => ({ id, type: 1, x: 0, y: 0 });

// Sorted "eventType:status" labels for order-independent assertions.
const labels = (events) => events.map((e) => `${e.eventType}:${e.status}`).sort();

test('marqueur cargo qui apparaît → cargo:spawned', () => {
  const events = diffMarkers([], [cargo(10)]);
  assert.deepEqual(labels(events), ['cargo:spawned']);
  assert.equal(events[0].marker.id, 10);
});

test('marqueur cargo qui disparaît → cargo:left', () => {
  assert.deepEqual(labels(diffMarkers([cargo(10)], [])), ['cargo:left']);
});

test('heli : apparition → spawned, disparition seule (sans explosion) → left', () => {
  assert.deepEqual(labels(diffMarkers([], [heli(1)])), ['helicopter:spawned']);
  assert.deepEqual(labels(diffMarkers([heli(1)], [])), ['helicopter:left']);
});

test('CH47 : apparition annoncée, MAIS disparition jamais (passe juste larguer sa caisse)', () => {
  assert.deepEqual(labels(diffMarkers([], [ch47(2)])), ['chinook:spawned']);
  assert.deepEqual(diffMarkers([ch47(2)], []), []); // pas de "left" pour le chinook
});

test('explosion + heli disparu le même poll → helicopter:destroyed (PAS de left en double)', () => {
  const events = diffMarkers([heli(1)], [boom(99)]);
  assert.deepEqual(labels(events), ['helicopter:destroyed']);
  assert.equal(events[0].marker.id, 99); // le marqueur porté est l’explosion
});

test('explosion sans heli disparu → bradley:destroyed', () => {
  assert.deepEqual(labels(diffMarkers([], [boom(99)])), ['bradley:destroyed']);
});

test('explosion + heli disparu + un autre heli reste → seulement destroyed', () => {
  // heli #1 abattu (explosion), heli #2 toujours là.
  const events = diffMarkers([heli(1), heli(2)], [heli(2), boom(99)]);
  assert.deepEqual(labels(events), ['helicopter:destroyed']);
});

test('marqueurs non pertinents (joueurs, vending) → ignorés', () => {
  const events = diffMarkers([player(1)], [player(1), player(2), { id: 9, type: 3 }]);
  assert.deepEqual(events, []);
});

test('snapshot identique d’un poll à l’autre → aucun événement', () => {
  const snap = [cargo(10), heli(20), player(1)];
  assert.deepEqual(diffMarkers(snap, snap), []);
});

test('entrées vides / nulles → pas de crash, résultat vide', () => {
  assert.deepEqual(diffMarkers(undefined, null), []);
  assert.deepEqual(labels(diffMarkers(null, [cargo(1)])), ['cargo:spawned']);
});

test('clé composite type:id → même id sur 2 types ne se confond pas', () => {
  // cargo #5 reste, l’ancien heli #5 part (sans explosion) et un CH47 #5 arrive.
  const events = diffMarkers([cargo(5), heli(5)], [cargo(5), ch47(5)]);
  assert.deepEqual(labels(events), ['chinook:spawned', 'helicopter:left']);
});

test('accepte aussi les noms d’enum en chaîne (CargoShip, Explosion)', () => {
  assert.deepEqual(labels(diffMarkers([], [{ id: 1, type: 'CargoShip' }])), ['cargo:spawned']);
  assert.deepEqual(labels(diffMarkers([], [{ id: 2, type: 'Explosion' }])), ['bradley:destroyed']);
});

test('événements simultanés : un heli part (sans boom) et un cargo arrive', () => {
  assert.deepEqual(labels(diffMarkers([heli(1)], [cargo(2)])), ['cargo:spawned', 'helicopter:left']);
});

test('MARKER_EVENT mappe les 3 types spawn/left vers les clés canoniques', () => {
  assert.deepEqual(MARKER_EVENT, { 4: 'chinook', 5: 'cargo', 8: 'helicopter' });
});

// ── Phase 8.4 — caisses verrouillées sur les Oil Rigs ────────────────────────────

const crate = (id, x, y) => ({ id, type: 6, x, y });
const MAP = {
  monuments: [
    { token: 'oil_rig_small', x: 1000, y: 2000 },
    { token: 'large_oil_rig', x: 5000, y: 6000 }, // ordre/format de token différents exprès
    { token: 'harbor_1', x: 100, y: 100 },
  ],
};
const RIGS = oilRigsFromMap(MAP);

test('oilRigsFromMap : extrait petit + grand rig (matching tolérant), ignore le reste', () => {
  assert.deepEqual(RIGS, [
    { eventType: 'oil_rig_small', x: 1000, y: 2000, token: 'oil_rig_small' },
    { eventType: 'oil_rig_large', x: 5000, y: 6000, token: 'large_oil_rig' },
  ]);
});

test('oilRigsFromMap : carte vide / nulle → []', () => {
  assert.deepEqual(oilRigsFromMap(null), []);
  assert.deepEqual(oilRigsFromMap({ monuments: [] }), []);
});

test('caisse qui apparaît SUR le petit rig (≤100m) → oil_rig_small:spawned', () => {
  const events = diffMarkers([], [crate(1, 1010, 2010)], RIGS); // ~14m du petit rig
  assert.deepEqual(labels(events), ['oil_rig_small:spawned']);
});

test('caisse sur le grand rig → oil_rig_large:spawned', () => {
  assert.deepEqual(labels(diffMarkers([], [crate(2, 5005, 5995)], RIGS)), ['oil_rig_large:spawned']);
});

test('caisse loin de tout rig (cargo / largage CH47) → ignorée', () => {
  assert.deepEqual(diffMarkers([], [crate(3, 9000, 9000)], RIGS), []);
});

test('caisse mais aucun rig connu (getMap pas encore chargé) → ignorée', () => {
  assert.deepEqual(diffMarkers([], [crate(1, 1010, 2010)]), []); // oilRigs défaut = []
});

test('caisse qui disparaît (lootée) → aucun event (annonce à l’apparition seulement)', () => {
  assert.deepEqual(diffMarkers([crate(1, 1010, 2010)], [], RIGS), []);
});

test('caisse déjà présente d’un poll à l’autre → aucun event', () => {
  const snap = [crate(1, 1010, 2010)];
  assert.deepEqual(diffMarkers(snap, snap, RIGS), []);
});
