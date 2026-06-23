// Data-access for the `servers` table. Routes and bot commands call these
// functions instead of writing SQL, so the storage engine can change later.
//
// Phase 6 — a Discord guild can track MANY Rust servers (one row per guild_id+name).
// Exactly one server per guild is `is_default`, used by commands that omit a server
// argument. Rows captured by the webhook before /setup have a NULL guild_id
// ("orphans") and get adopted by addServer() so their history carries over.
import { db } from '../db.js';

// ── Lookups ───────────────────────────────────────────────────────────────────

export function findById(id) {
  return db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
}

// One server of a guild, by name (case-insensitive).
export function findByGuildName(guildId, name) {
  return db
    .prepare('SELECT * FROM servers WHERE guild_id = ? AND name = ? COLLATE NOCASE')
    .get(guildId, name);
}

// Route an incoming webhook/name to a server row. Prefer a configured row (has a
// channel, then has a guild) over an unconfigured "orphan" capture row of the name.
export function findByName(name) {
  return db
    .prepare(
      `SELECT * FROM servers WHERE name = ? COLLATE NOCASE
       ORDER BY (channel_id IS NULL), (guild_id IS NULL), id
       LIMIT 1`,
    )
    .get(name);
}

// Used by the webhook: ensure a server row exists for an incoming server name,
// even before anyone ran /setup (so data is captured and visible via the API).
export function findOrCreateByName(name) {
  const existing = findByName(name);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO servers (name) VALUES (?)').run(name);
  return findById(info.lastInsertRowid);
}

// All servers of a guild — default first, then alphabetical.
export function listByGuild(guildId) {
  return db
    .prepare(
      'SELECT * FROM servers WHERE guild_id = ? ORDER BY is_default DESC, name COLLATE NOCASE',
    )
    .all(guildId);
}

export function getDefault(guildId) {
  return db.prepare('SELECT * FROM servers WHERE guild_id = ? AND is_default = 1').get(guildId);
}

// Backwards-compatible alias: a guild's "current" server is its default.
export function findByGuild(guildId) {
  return getDefault(guildId);
}

export function list() {
  return db.prepare('SELECT * FROM servers ORDER BY name').all();
}

// ── Mutations ─────────────────────────────────────────────────────────────────

// Add a Rust server to a guild (or update its channel if already there). The guild's
// FIRST server becomes its default. If a NULL-guild "orphan" row of the same name
// exists (captured by the webhook before /setup), adopt it instead of duplicating.
export function addServer({ guildId, name, channelId = null }) {
  // Webhooks route by name only (findByName), so a given name must map to a single
  // guild — otherwise events for "Rust EU 2x" could land in the wrong Discord. Reject
  // a name already tracked by a DIFFERENT guild. (Orphan rows have guild_id NULL and
  // are adopted below, not blocked; re-adding within the same guild is an update.)
  const conflict = db
    .prepare(
      `SELECT guild_id FROM servers
        WHERE name = ? COLLATE NOCASE AND guild_id IS NOT NULL AND guild_id <> ?
        LIMIT 1`,
    )
    .get(name, guildId);
  if (conflict) {
    const err = new Error(`The server name "${name}" is already tracked by another Discord.`);
    err.code = 'SERVER_NAME_TAKEN';
    throw err;
  }

  const existing = findByGuildName(guildId, name);
  if (existing) {
    db.prepare(`UPDATE servers SET channel_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      channelId,
      existing.id,
    );
  } else {
    const orphan = db
      .prepare('SELECT * FROM servers WHERE guild_id IS NULL AND name = ? COLLATE NOCASE ORDER BY id LIMIT 1')
      .get(name);
    if (orphan) {
      db.prepare(
        `UPDATE servers SET guild_id = ?, channel_id = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(guildId, channelId, orphan.id);
    } else {
      db.prepare('INSERT INTO servers (guild_id, name, channel_id) VALUES (?, ?, ?)').run(
        guildId,
        name,
        channelId,
      );
    }
  }

  // Guarantee exactly one default per guild.
  if (!getDefault(guildId)) {
    setDefault(guildId, findByGuildName(guildId, name).id);
  }
  return findByGuildName(guildId, name);
}

// Make `serverId` the guild's only default. Returns the updated row, or null if the
// server doesn't belong to that guild.
export function setDefault(guildId, serverId) {
  const target = db.prepare('SELECT id FROM servers WHERE id = ? AND guild_id = ?').get(serverId, guildId);
  if (!target) return null;
  db.transaction(() => {
    db.prepare('UPDATE servers SET is_default = 0 WHERE guild_id = ?').run(guildId);
    db.prepare(`UPDATE servers SET is_default = 1, updated_at = datetime('now') WHERE id = ?`).run(serverId);
  })();
  return findById(serverId);
}

// Remove a guild's server by name. If it was the default and others remain, promote
// the oldest one. Returns { removed, newDefault } (removed=false when the name is absent).
export function removeByGuildName(guildId, name) {
  const target = findByGuildName(guildId, name);
  if (!target) return { removed: false, newDefault: null };
  db.prepare('DELETE FROM servers WHERE id = ?').run(target.id);

  let newDefault = null;
  if (target.is_default) {
    const next = db.prepare('SELECT id FROM servers WHERE guild_id = ? ORDER BY id LIMIT 1').get(guildId);
    if (next) newDefault = setDefault(guildId, next.id);
  }
  return { removed: true, newDefault };
}

// Admin/API removal by name, with NO guild context (used by DELETE /servers/:name):
// deletes EVERY server row matching `name` (case-insensitive) and — via ON DELETE
// CASCADE — their events/timers/deaths. Returns the count of server rows removed.
// Handy to purge orphan capture rows (NULL guild_id) the webhook made before /setup.
export function removeByName(name) {
  return db.prepare('DELETE FROM servers WHERE name = ? COLLATE NOCASE').run(name).changes;
}

// Resolve which server a command targets: an explicit name (case-insensitive), or
// the guild's default when no name is given. Returns the row or undefined.
export function resolve(guildId, name) {
  if (name) return findByGuildName(guildId, name);
  return getDefault(guildId);
}
