// Data-access for the `events` table (append-only history log).
import { db } from '../db.js';

export function insert({ serverId, eventType, status, spawnTime, nextRespawn, payload }) {
  const info = db
    .prepare(
      `INSERT INTO events (server_id, event_type, status, spawn_time, next_respawn, payload)
       VALUES (@serverId, @eventType, @status, @spawnTime, @nextRespawn, @payload)`,
    )
    .run({
      serverId,
      eventType,
      status: status ?? null,
      spawnTime: spawnTime ?? null,
      nextRespawn: nextRespawn ?? null,
      payload: payload ? JSON.stringify(payload) : null,
    });
  return db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
}

// Recent events, optionally scoped to one server.
export function recent({ serverId = null, limit = 25 } = {}) {
  if (serverId) {
    return db
      .prepare('SELECT * FROM events WHERE server_id = ? ORDER BY id DESC LIMIT ?')
      .all(serverId, limit);
  }
  return db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
}
