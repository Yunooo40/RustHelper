import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, resetDb } from './helpers/testApp.js';

beforeEach(() => resetDb());

test('harness: DB :memory: opérationnelle + resetDb la vide', () => {
  db.prepare('INSERT INTO servers (name) VALUES (?)').run('Smoke');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM servers').get().c, 1);
  resetDb();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM servers').get().c, 0);
});
