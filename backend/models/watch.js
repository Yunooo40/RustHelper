// Data-access for the `player_watches` table (Phase 8.4). A watch is a teammate we
// alert on when their Rust+ presence flips (online <-> offline), detected by the
// getTeamInfo poll (rustplus/teamWatcher.js). One row per (server, steam_id).
//
// Routes/commands call these instead of writing SQL (same contract as the other models).
import { db } from '../db.js';

// Add (or relabel) a watch for a player on a server. Idempotent: re-adding the same
// (server, steam_id) just refreshes the label. Returns the stored row.
export function add({ serverId, steamId, label = null, addedBy = null }) {
  db.prepare(
    `INSERT INTO player_watches (server_id, steam_id, label, added_by)
       VALUES (@serverId, @steamId, @label, @addedBy)
     ON CONFLICT(server_id, steam_id) DO UPDATE SET label = excluded.label`,
  ).run({ serverId, steamId: String(steamId), label, addedBy });
  return get(serverId, steamId);
}

export function get(serverId, steamId) {
  return db
    .prepare('SELECT * FROM player_watches WHERE server_id = ? AND steam_id = ?')
    .get(serverId, String(steamId));
}

export function listByServer(serverId) {
  return db.prepare('SELECT * FROM player_watches WHERE server_id = ? ORDER BY id').all(serverId);
}

export function listAll() {
  return db.prepare('SELECT * FROM player_watches ORDER BY server_id, id').all();
}

// Remove one watch. Returns rows deleted (0 if absent).
export function remove(serverId, steamId) {
  return db
    .prepare('DELETE FROM player_watches WHERE server_id = ? AND steam_id = ?')
    .run(serverId, String(steamId)).changes;
}

// Clear every watch on a server. Returns rows deleted.
export function clear(serverId) {
  return db.prepare('DELETE FROM player_watches WHERE server_id = ?').run(serverId).changes;
}
