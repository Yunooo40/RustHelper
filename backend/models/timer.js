// Data-access for the `timers` table (one active timer per server + event_type).
import { db } from '../db.js';
import { nowUnix } from '../../shared/time.js';

// Insert or refresh a timer. Called by the webhook (source='webhook')
// and by the /timer slash command (source='manual').
export function upsert({ serverId, eventType, expiresAt, status = null, source = 'webhook' }) {
  db.prepare(
    `INSERT INTO timers (server_id, event_type, expires_at, status, source)
     VALUES (@serverId, @eventType, @expiresAt, @status, @source)
     ON CONFLICT(server_id, event_type) DO UPDATE SET
       expires_at = excluded.expires_at,
       status     = excluded.status,
       source     = excluded.source,
       updated_at = datetime('now')`,
  ).run({ serverId, eventType, expiresAt, status, source });
  return db
    .prepare('SELECT * FROM timers WHERE server_id = ? AND event_type = ?')
    .get(serverId, eventType);
}

// The single timer for a server + event type (or undefined). Used by in-game
// queries (!cargo/!small/...) to answer with the current countdown.
export function getByType(serverId, eventType) {
  return db
    .prepare('SELECT * FROM timers WHERE server_id = ? AND event_type = ?')
    .get(serverId, eventType);
}

// All timers for a server, soonest first.
export function listByServer(serverId) {
  return db
    .prepare('SELECT * FROM timers WHERE server_id = ? ORDER BY expires_at ASC')
    .all(serverId);
}

// Only timers that have not expired yet.
export function upcomingByServer(serverId) {
  return db
    .prepare('SELECT * FROM timers WHERE server_id = ? AND expires_at > ? ORDER BY expires_at ASC')
    .all(serverId, nowUnix());
}

// Every timer across every server (for the global GET /timers).
export function listAll() {
  return db
    .prepare(
      `SELECT t.*, s.name AS server_name, s.guild_id
       FROM timers t JOIN servers s ON s.id = t.server_id
       ORDER BY t.expires_at ASC`,
    )
    .all();
}
