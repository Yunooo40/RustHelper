// Tests for the smart_switches model (Phase 9).
import { db, resetDb } from '../helpers/testApp.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Switches from '../../backend/models/switch.js';

beforeEach(() => resetDb());

function srv(name = 'srv') {
  return db.prepare('INSERT INTO servers (name) VALUES (?)').run(name).lastInsertRowid;
}

test('add: insère et relabel (idempotent sur entity_id)', () => {
  const s = srv();
  Switches.add({ serverId: s, entityId: 1001, label: 'Base' });
  Switches.add({ serverId: s, entityId: 1001, label: 'Base2' });
  assert.equal(Switches.listByServer(s).length, 1);
  assert.equal(Switches.getByEntityId(s, 1001).label, 'Base2');
});

test('getByLabel: insensible à la casse', () => {
  const s = srv();
  Switches.add({ serverId: s, entityId: 1002, label: 'Airlock' });
  assert.ok(Switches.getByLabel(s, 'airlock'));
  assert.ok(Switches.getByLabel(s, 'AIRLOCK'));
});

test('listByServer: trié par label, isolé par serveur', () => {
  const s1 = srv('a'); const s2 = srv('b');
  Switches.add({ serverId: s1, entityId: 1, label: 'Z' });
  Switches.add({ serverId: s1, entityId: 2, label: 'A' });
  Switches.add({ serverId: s2, entityId: 3, label: 'X' });
  const rows = Switches.listByServer(s1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, 'A');
});

test('remove: renvoie 1 si trouvé, 0 sinon', () => {
  const s = srv();
  Switches.add({ serverId: s, entityId: 99, label: 'Test' });
  assert.equal(Switches.remove(s, 99), 1);
  assert.equal(Switches.remove(s, 99), 0);
});
