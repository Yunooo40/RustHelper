// Unit tests for the Rust map grid maths — pure logic, no socket, no DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldToGrid, describeMapMarkers } from '../../rustplus/grid.js';

const SIZE = 4000; // world map size (AppInfo.mapSize)

test('coin nord-ouest → A0 (lettres O→E, numéros N→S à partir de 0)', () => {
  assert.equal(worldToGrid(10, 3900, SIZE), 'A0');
});

test('vers l’est → la colonne avance (A→B), vers le sud → le numéro augmente', () => {
  assert.equal(worldToGrid(200, 3900, SIZE), 'B0'); // +x → colonne B
  assert.equal(worldToGrid(10, 100, SIZE), 'A26'); // y bas (sud) → grand numéro
});

test('au-delà de Z, la colonne passe à AA', () => {
  assert.equal(worldToGrid(3900, 3900, SIZE), 'AA0'); // x très à l’est → colonne 26 = AA
});

test('hors carte (négatif / au-delà de la taille) → null', () => {
  assert.equal(worldToGrid(-5, 100, SIZE), null);
  assert.equal(worldToGrid(10, 5000, SIZE), null);
});

test('entrées invalides (NaN, mapSize 0) → null', () => {
  assert.equal(worldToGrid(NaN, 10, SIZE), null);
  assert.equal(worldToGrid(10, 10, 0), null);
});

test('describeMapMarkers : libellés + grille, triés par type, types inconnus ignorés', () => {
  const markers = [
    { id: 1, type: 8, x: 10, y: 100 }, // heli → A26
    { id: 2, type: 5, x: 200, y: 3900 }, // cargo → B0
    { id: 3, type: 1, x: 0, y: 0 }, // joueur → ignoré
  ];
  // tri par type → cargo (5) avant heli (8).
  assert.deepEqual(describeMapMarkers(markers, SIZE), [
    '🚢 Cargo Ship — B0',
    '🚁 Patrol Helicopter — A26',
  ]);
});

test('describeMapMarkers : marqueur hors grille → libellé sans case', () => {
  assert.deepEqual(describeMapMarkers([{ id: 1, type: 6, x: -5, y: 100 }], SIZE), ['📦 Locked Crate']);
});

test('describeMapMarkers : accepte les noms d’enum en chaîne', () => {
  assert.deepEqual(describeMapMarkers([{ id: 1, type: 'CargoShip', x: 200, y: 3900 }], SIZE), [
    '🚢 Cargo Ship — B0',
  ]);
});

test('describeMapMarkers : entrée nulle / vide → []', () => {
  assert.deepEqual(describeMapMarkers(null, SIZE), []);
  assert.deepEqual(describeMapMarkers([], SIZE), []);
});
