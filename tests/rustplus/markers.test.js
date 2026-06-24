// Unit tests for the Rust+ map-marker diff — pure logic, no socket, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMarkers, MARKER_EVENT } from '../../rustplus/markers.js';

// AppMarker types: 4=CH47, 5=CargoShip, 8=PatrolHelicopter; 1=Player, 3=VendingMachine.
const cargo = (id) => ({ id, type: 5, x: 1, y: 2 });
const heli = (id) => ({ id, type: 8, x: 3, y: 4 });
const ch47 = (id) => ({ id, type: 4, x: 5, y: 6 });
const player = (id) => ({ id, type: 1, x: 0, y: 0 });

const types = (list) => list.map((e) => e.eventType).sort();

test('marqueur cargo qui apparaît → spawned cargo', () => {
  const { spawned, left } = diffMarkers([], [cargo(10)]);
  assert.deepEqual(types(spawned), ['cargo']);
  assert.equal(spawned[0].marker.id, 10);
  assert.deepEqual(left, []);
});

test('marqueur cargo qui disparaît → left cargo', () => {
  const { spawned, left } = diffMarkers([cargo(10)], []);
  assert.deepEqual(spawned, []);
  assert.deepEqual(types(left), ['cargo']);
});

test('heli : apparition → spawned, disparition → left', () => {
  assert.deepEqual(types(diffMarkers([], [heli(1)]).spawned), ['helicopter']);
  assert.deepEqual(types(diffMarkers([heli(1)], []).left), ['helicopter']);
});

test('CH47 : apparition annoncée, MAIS disparition jamais (passe juste larguer sa caisse)', () => {
  assert.deepEqual(types(diffMarkers([], [ch47(2)]).spawned), ['chinook']);
  assert.deepEqual(diffMarkers([ch47(2)], []).left, []); // pas de "left" pour le chinook
});

test('marqueurs non pertinents (joueurs, etc.) → ignorés', () => {
  const { spawned, left } = diffMarkers([player(1)], [player(1), player(2), { id: 9, type: 3 }]);
  assert.deepEqual(spawned, []);
  assert.deepEqual(left, []);
});

test('snapshot identique d’un poll à l’autre → aucun événement', () => {
  const snap = [cargo(10), heli(20), player(1)];
  const { spawned, left } = diffMarkers(snap, snap);
  assert.deepEqual(spawned, []);
  assert.deepEqual(left, []);
});

test('entrées vides / nulles → pas de crash, résultat vide', () => {
  assert.deepEqual(diffMarkers(undefined, null), { spawned: [], left: [] });
  assert.deepEqual(diffMarkers(null, [cargo(1)]).spawned.map((e) => e.eventType), ['cargo']);
});

test('clé composite type:id → même id sur 2 types ne se confond pas', () => {
  // cargo #5 reste, mais l’ancien heli #5 part et un CH47 #5 arrive.
  const prev = [cargo(5), heli(5)];
  const next = [cargo(5), ch47(5)];
  const { spawned, left } = diffMarkers(prev, next);
  assert.deepEqual(types(spawned), ['chinook']);
  assert.deepEqual(types(left), ['helicopter']);
});

test('accepte aussi les noms d’enum en chaîne (CargoShip)', () => {
  const { spawned } = diffMarkers([], [{ id: 1, type: 'CargoShip' }]);
  assert.deepEqual(types(spawned), ['cargo']);
});

test('événements simultanés : un heli part et un cargo arrive dans le même diff', () => {
  const { spawned, left } = diffMarkers([heli(1)], [cargo(2)]);
  assert.deepEqual(types(spawned), ['cargo']);
  assert.deepEqual(types(left), ['helicopter']);
});

test('MARKER_EVENT mappe les 3 types suivis vers les clés canoniques', () => {
  assert.deepEqual(MARKER_EVENT, { 4: 'chinook', 5: 'cargo', 8: 'helicopter' });
});
