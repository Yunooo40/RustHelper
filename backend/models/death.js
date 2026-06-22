// Data-access for the `deaths` table (Phase 4.2 kill feed + future stats).
import { db } from '../db.js';

export function insert({
  serverId, victimId = null, victimName = null, killerId = null, killerName = null,
  cause = null, distance = null, victimDiscordId = null, killerDiscordId = null, payload = null,
}) {
  const info = db
    .prepare(
      `INSERT INTO deaths
         (server_id, victim_id, victim_name, killer_id, killer_name, cause, distance,
          victim_discord_id, killer_discord_id, payload)
       VALUES
         (@serverId, @victimId, @victimName, @killerId, @killerName, @cause, @distance,
          @victimDiscordId, @killerDiscordId, @payload)`,
    )
    .run({
      serverId, victimId, victimName, killerId, killerName, cause,
      distance: distance == null ? null : Number(distance),
      victimDiscordId, killerDiscordId,
      payload: payload ? JSON.stringify(payload) : null,
    });
  return db.prepare('SELECT * FROM deaths WHERE id = ?').get(info.lastInsertRowid);
}

export function recent({ serverId = null, limit = 25 } = {}) {
  if (serverId) {
    return db
      .prepare('SELECT * FROM deaths WHERE server_id = ? ORDER BY id DESC LIMIT ?')
      .all(serverId, limit);
  }
  return db.prepare('SELECT * FROM deaths ORDER BY id DESC LIMIT ?').all(limit);
}
