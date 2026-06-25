// Data-access for the `smart_switches` table (Phase 9). A smart switch is a registered
// Rust entity (smart switch / HBHF sensor etc.) identified by its entityId and a short
// label used in Discord commands and in-game team-chat commands.
import { db } from '../db.js';

export function add({ serverId, entityId, label, addedBy = null }) {
  db.prepare(
    `INSERT INTO smart_switches (server_id, entity_id, label, added_by)
       VALUES (@serverId, @entityId, @label, @addedBy)
     ON CONFLICT(server_id, entity_id) DO UPDATE SET label = excluded.label`,
  ).run({ serverId, entityId: Number(entityId), label: label.trim(), addedBy });
  return getByEntityId(serverId, entityId);
}

export function getByEntityId(serverId, entityId) {
  return db
    .prepare('SELECT * FROM smart_switches WHERE server_id = ? AND entity_id = ?')
    .get(serverId, Number(entityId));
}

// Case-insensitive label lookup (used by in-game commands).
export function getByLabel(serverId, label) {
  return db
    .prepare('SELECT * FROM smart_switches WHERE server_id = ? AND label = ? COLLATE NOCASE')
    .get(serverId, label.trim());
}

export function listByServer(serverId) {
  return db
    .prepare('SELECT * FROM smart_switches WHERE server_id = ? ORDER BY label')
    .all(serverId);
}

export function remove(serverId, entityId) {
  return db
    .prepare('DELETE FROM smart_switches WHERE server_id = ? AND entity_id = ?')
    .run(serverId, Number(entityId)).changes;
}
