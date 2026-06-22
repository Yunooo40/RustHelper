// IMPORTANT: import testApp first so db.js loads against :memory:, not the real DB.
import '../helpers/testApp.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrateServers } from '../../backend/db.js';

// A DB with the OLD (pre-Phase-6) servers schema + a child timer (FK) to migrate.
function oldSchemaDb() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  d.exec(`
    CREATE TABLE servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT UNIQUE,
      name TEXT NOT NULL,
      channel_id TEXT,
      webhook_secret TEXT,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE timers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      UNIQUE(server_id, event_type)
    );
  `);
  return d;
}

test('migrateServers: ajoute is_default, conserve données + FK, retire UNIQUE(guild_id)', () => {
  const d = oldSchemaDb();
  d.prepare('INSERT INTO servers (id, guild_id, name, channel_id) VALUES (?,?,?,?)').run(1, 'g1', 'Atlas', 'c1');
  d.prepare('INSERT INTO servers (id, name) VALUES (?, ?)').run(2, 'OrphanCap'); // guild NULL
  d.prepare('INSERT INTO timers (server_id, event_type, expires_at) VALUES (?,?,?)').run(1, 'cargo', 123);

  migrateServers(d);

  const cols = d.prepare("PRAGMA table_info('servers')").all().map((c) => c.name);
  assert.ok(cols.includes('is_default'), 'colonne is_default ajoutée');

  assert.equal(d.prepare('SELECT is_default FROM servers WHERE id = 1').get().is_default, 1, 'row avec guild → défaut');
  assert.equal(d.prepare('SELECT is_default FROM servers WHERE id = 2').get().is_default, 0, 'orpheline → pas défaut');

  // FK conservée : le timer pointe toujours vers un serveur existant.
  assert.equal(d.prepare('SELECT server_id FROM timers').get().server_id, 1);

  // Le guild peut désormais avoir un 2e serveur (UNIQUE(guild_id) retiré).
  d.prepare('INSERT INTO servers (guild_id, name) VALUES (?, ?)').run('g1', 'Nomad');
  assert.equal(d.prepare('SELECT COUNT(*) c FROM servers WHERE guild_id = ?').get('g1').c, 2);

  // ... mais UNIQUE(guild_id, name) est appliqué.
  assert.throws(() => d.prepare('INSERT INTO servers (guild_id, name) VALUES (?, ?)').run('g1', 'Nomad'));

  d.close();
});

test('migrateServers: idempotent (2e appel = no-op)', () => {
  const d = oldSchemaDb();
  migrateServers(d);
  assert.doesNotThrow(() => migrateServers(d));
  assert.ok(d.prepare("PRAGMA table_info('servers')").all().some((c) => c.name === 'is_default'));
  d.close();
});

test('migrateServers: DB neuve sans table servers → no-op', () => {
  const d = new Database(':memory:');
  assert.doesNotThrow(() => migrateServers(d));
  d.close();
});
