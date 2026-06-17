// Data-access for the `servers` table. Routes and bot commands call these
// functions instead of writing SQL, so the storage engine can change later.
import { db } from '../db.js';

// Create or update the server linked to a Discord guild (used by /setup).
export function upsertByGuild({ guildId, name, channelId }) {
  db.prepare(
    `INSERT INTO servers (guild_id, name, channel_id)
     VALUES (@guildId, @name, @channelId)
     ON CONFLICT(guild_id) DO UPDATE SET
       name       = excluded.name,
       channel_id = excluded.channel_id,
       updated_at = datetime('now')`,
  ).run({ guildId, name, channelId: channelId ?? null });
  return findByGuild(guildId);
}

export function findByGuild(guildId) {
  return db.prepare('SELECT * FROM servers WHERE guild_id = ?').get(guildId);
}

export function findByName(name) {
  return db.prepare('SELECT * FROM servers WHERE name = ? COLLATE NOCASE').get(name);
}

export function findById(id) {
  return db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
}

// Used by the webhook: ensure a server row exists for an incoming server name,
// even before anyone ran /setup (so data is captured and visible via the API).
export function findOrCreateByName(name) {
  const existing = findByName(name);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO servers (name) VALUES (?)').run(name);
  return findById(info.lastInsertRowid);
}

export function setChannel(guildId, channelId) {
  db.prepare(
    `UPDATE servers SET channel_id = ?, updated_at = datetime('now') WHERE guild_id = ?`,
  ).run(channelId, guildId);
  return findByGuild(guildId);
}

export function list() {
  return db.prepare('SELECT * FROM servers ORDER BY name').all();
}
