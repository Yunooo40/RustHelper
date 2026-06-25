// Data-access for the `fcm_credentials` table (Phase 7.2). A row holds the FCM listener
// credentials for one registered Rust+ player: with android_id + security_token we open a
// push-receiver socket and receive that player's "Pair with Server" notifications, then
// auto-create the rustplus_pairings. The manager opens one listener per is_active row.
//
// Routes/commands call these instead of writing SQL (same contract as the other models).
//
// SECURITY: security_token is a SECRET — it grants receipt of that account's push
// notifications. Never log a credential row as-is, and keep security_token out of any
// API/Discord output (see publicCredential in the route).
import { db } from '../db.js';

// ── Lookups ───────────────────────────────────────────────────────────────────

export function getById(id) {
  return db.prepare('SELECT * FROM fcm_credentials WHERE id = ?').get(id);
}

export function getByAndroidId(androidId) {
  return db.prepare('SELECT * FROM fcm_credentials WHERE android_id = ?').get(androidId);
}

export function getByDiscordUser(discordUserId) {
  return db
    .prepare('SELECT * FROM fcm_credentials WHERE discord_user_id = ? ORDER BY id')
    .all(discordUserId);
}

// Every active credential — what the FCM manager opens a listener for on boot.
export function listActive() {
  return db.prepare('SELECT * FROM fcm_credentials WHERE is_active = 1 ORDER BY id').all();
}

// ── Mutations ─────────────────────────────────────────────────────────────────

// Upsert a credential keyed by android_id. Re-registering the same device refreshes the
// security_token (and metadata) and re-activates the row. Returns the stored row.
export function add({ androidId, securityToken, guildId = null, discordUserId = null, label = null }) {
  db.prepare(
    `INSERT INTO fcm_credentials (android_id, security_token, guild_id, discord_user_id, label)
       VALUES (@androidId, @securityToken, @guildId, @discordUserId, @label)
     ON CONFLICT(android_id) DO UPDATE SET
       security_token  = excluded.security_token,
       guild_id        = excluded.guild_id,
       discord_user_id = excluded.discord_user_id,
       label           = excluded.label,
       is_active       = 1,
       updated_at      = datetime('now')`,
  ).run({ androidId, securityToken, guildId, discordUserId, label });
  return getByAndroidId(androidId);
}

// Remove a credential by android_id. Returns rows deleted (0 if absent).
export function remove(androidId) {
  return db.prepare('DELETE FROM fcm_credentials WHERE android_id = ?').run(androidId).changes;
}

// Soft-disable a credential without deleting it (e.g. repeated auth failures). Returns
// rows changed.
export function deactivate(androidId) {
  return db
    .prepare(`UPDATE fcm_credentials SET is_active = 0, updated_at = datetime('now') WHERE android_id = ?`)
    .run(androidId).changes;
}
