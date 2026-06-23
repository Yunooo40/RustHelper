// Smoke tests for the Rust+ manager: validates the import chain (incl. the CJS lib's
// default export interop) and the safe no-op path. Does NOT open real sockets — the live
// connect/reconnect is validated by hand at pairing time (like the Oxide plugin).
import { resetDb } from '../helpers/testApp.js'; // first: sets DATABASE_PATH=:memory:
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startManager, stopManager, getConnection } from '../../rustplus/manager.js';

beforeEach(() => resetDb());

test('startManager: sans aucun pairing → no-op, aucune connexion ouverte', () => {
  assert.doesNotThrow(() => startManager());
  assert.equal(getConnection(1), undefined);
  stopManager();
});

test('le module Connection (et la lib CJS @liamcottle/rustplus.js) s’importe sans erreur', async () => {
  const mod = await import('../../rustplus/connection.js');
  assert.equal(typeof mod.Connection, 'function');
});
