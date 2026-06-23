// Data-access for the `rustplus_pairings` table (Phase 7). A pairing holds the
// credentials to open a Rust+ companion websocket for a tracked server: one row per
// (server, player whose token we connect with). The manager opens the `is_active` one.
//
// Routes/commands call these functions instead of writing SQL, so the storage engine
// can change later (same contract as the other models).
//
// SECURITY: player_token is a SECRET (companion control of that player on that server).
// Never log a pairing object as-is, and keep player_token out of any API/Discord output.
import { db } from '../db.js';

// ── Lookups ───────────────────────────────────────────────────────────────────

export function getByServer(serverId) {
  return db.prepare('SELECT * FROM rustplus_pairings WHERE server_id = ? ORDER BY id').all(serverId);
}

export function getByServerAndSteam(serverId, steamId) {
  return db
    .prepare('SELECT * FROM rustplus_pairings WHERE server_id = ? AND steam_id = ?')
    .get(serverId, steamId);
}

// The pairing the manager connects with for a server (the active one, oldest wins).
export function getActiveForServer(serverId) {
  return db
    .prepare('SELECT * FROM rustplus_pairings WHERE server_id = ? AND is_active = 1 ORDER BY id LIMIT 1')
    .get(serverId);
}

// Every active pairing across all servers — what the manager opens on boot.
export function listActive() {
  return db
    .prepare('SELECT * FROM rustplus_pairings WHERE is_active = 1 ORDER BY server_id, id')
    .all();
}

// ── Mutations ─────────────────────────────────────────────────────────────────

// Upsert a pairing for (server, steamId). Re-pairing the same player refreshes the
// ip/port/token (tokens rotate) and re-activates the row. Returns the stored row.
export function add({ serverId, serverIp, appPort, steamId, playerToken, label = null }) {
  db.prepare(
    `INSERT INTO rustplus_pairings (server_id, server_ip, app_port, steam_id, player_token, label)
       VALUES (@serverId, @serverIp, @appPort, @steamId, @playerToken, @label)
     ON CONFLICT(server_id, steam_id) DO UPDATE SET
       server_ip    = excluded.server_ip,
       app_port     = excluded.app_port,
       player_token = excluded.player_token,
       label        = excluded.label,
       is_active    = 1,
       updated_at   = datetime('now')`,
  ).run({ serverId, serverIp, appPort, steamId, playerToken, label });
  return getByServerAndSteam(serverId, steamId);
}

// Remove a specific pairing. Returns the number of rows deleted (0 if absent).
export function remove(serverId, steamId) {
  return db
    .prepare('DELETE FROM rustplus_pairings WHERE server_id = ? AND steam_id = ?')
    .run(serverId, steamId).changes;
}

// Remove every pairing of a server (used by /unpair). Returns rows deleted.
export function removeByServer(serverId) {
  return db.prepare('DELETE FROM rustplus_pairings WHERE server_id = ?').run(serverId).changes;
}
