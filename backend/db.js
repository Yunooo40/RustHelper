// SQLite connection + schema bootstrap.
//
// We use better-sqlite3: synchronous, fast, zero-config. The single `db` instance
// is shared by both the API routes and the bot commands (same process), and the
// schema is created on first import. Switch to PostgreSQL later by swapping the
// models layer — routes/commands only depend on the model functions, not on SQL.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// Make sure the folder for the .sqlite file exists.
fs.mkdirSync(path.dirname(config.db.path), { recursive: true });

export const db = new Database(config.db.path);

// WAL = better read/write concurrency (e.g. if you later split API and bot
// into two processes hitting the same file). FK = enforce relations / cascades.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Migrations ────────────────────────────────────────────────────────────────
// Phase 6 — multi-server per guild. The old schema had `guild_id UNIQUE` (one Rust
// server per Discord). We drop that constraint; SQLite can't drop an inline
// constraint, so we rebuild `servers` preserving ids (hence the events/timers/deaths
// foreign keys). Idempotent (no-op once `is_default` exists), exported for unit tests.
export function migrateServers(database) {
  const cols = database.prepare("PRAGMA table_info('servers')").all();
  if (cols.length === 0) return; // fresh DB — the schema below creates the new table
  if (cols.some((c) => c.name === 'is_default')) return; // already migrated

  database.pragma('foreign_keys = OFF');
  database.transaction(() => {
    database.exec(`
      CREATE TABLE servers_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id       TEXT,
        name           TEXT NOT NULL,
        channel_id     TEXT,
        webhook_secret TEXT,
        is_default     INTEGER NOT NULL DEFAULT 0,
        timezone       TEXT NOT NULL DEFAULT 'UTC',
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(guild_id, name)
      );
      INSERT INTO servers_new
        (id, guild_id, name, channel_id, webhook_secret, is_default, timezone, created_at, updated_at)
        SELECT id, guild_id, name, channel_id, webhook_secret,
               CASE WHEN guild_id IS NOT NULL THEN 1 ELSE 0 END,
               timezone, created_at, updated_at
        FROM servers;
      DROP TABLE servers;
      ALTER TABLE servers_new RENAME TO servers;
    `);
  })();
  database.pragma('foreign_keys = ON');
}

migrateServers(db);

db.exec(`
  -- Rust servers tracked. A Discord guild can track MANY Rust servers (Phase 6); one
  -- of them is the guild's default (is_default) for commands without a server arg.
  CREATE TABLE IF NOT EXISTS servers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id       TEXT,                        -- Discord guild id (null until /setup; not unique, many per guild)
    name           TEXT NOT NULL,               -- Rust server display name (match key for webhooks)
    channel_id     TEXT,                        -- Discord channel id for notifications
    webhook_secret TEXT,                        -- optional per-server secret (overrides global)
    is_default     INTEGER NOT NULL DEFAULT 0,  -- the guild's default server (one per guild)
    timezone       TEXT NOT NULL DEFAULT 'UTC',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(guild_id, name)
  );

  -- Append-only log of every event received (audit / history / debugging).
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id    INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,                 -- canonical key, see shared/events.js
    status       TEXT,                          -- spawned | despawned | entered | left ...
    spawn_time   INTEGER,                       -- unix seconds
    next_respawn INTEGER,                       -- unix seconds
    payload      TEXT,                          -- raw JSON received
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_server ON events(server_id, created_at);

  -- Current active timer: exactly one row per (server, event_type), upserted.
  CREATE TABLE IF NOT EXISTS timers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,               -- unix seconds when the event next happens
    status      TEXT,
    source      TEXT NOT NULL DEFAULT 'webhook', -- webhook | manual
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, event_type)
  );
  CREATE INDEX IF NOT EXISTS idx_timers_server ON timers(server_id, expires_at);

  -- Pending link codes (Phase 4): shown in Discord via /link, claimed in-game
  -- with !link <code>. Short-lived; one pending code per Discord user.
  CREATE TABLE IF NOT EXISTS link_codes (
    code            TEXT PRIMARY KEY,            -- short, non-ambiguous, uppercase
    discord_user_id TEXT NOT NULL,
    expires_at      INTEGER NOT NULL,            -- unix seconds
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Confirmed Discord <-> Steam links (MVP: one-to-one).
  CREATE TABLE IF NOT EXISTS links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT NOT NULL UNIQUE,
    steam_id        TEXT NOT NULL UNIQUE,
    steam_name      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Player death log (Phase 4.2): feeds the Discord kill feed + future stats.
  -- victim_discord_id / killer_discord_id are resolved from the links table at insert.
  CREATE TABLE IF NOT EXISTS deaths (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id         INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    victim_id         TEXT,                       -- steam id
    victim_name       TEXT,
    killer_id         TEXT,                       -- steam id, null if NPC/environment
    killer_name       TEXT,
    cause             TEXT,
    distance          REAL,
    victim_discord_id TEXT,
    killer_discord_id TEXT,
    payload           TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_deaths_server ON deaths(server_id, created_at);

  -- Rust+ companion pairings (Phase 7): credentials to open a RustPlus websocket for a
  -- tracked server. One row per (server, player whose token we connect with). is_active
  -- marks the pairing the manager actually connects with. player_token is a SECRET — it
  -- grants companion control of that player on that server; never log it.
  CREATE TABLE IF NOT EXISTS rustplus_pairings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id    INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    server_ip    TEXT NOT NULL,
    app_port     INTEGER NOT NULL,
    steam_id     TEXT NOT NULL,                 -- player id we connect as
    player_token TEXT NOT NULL,                 -- secret
    is_active    INTEGER NOT NULL DEFAULT 1,
    label        TEXT,                          -- optional, e.g. who paired
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, steam_id)
  );
  CREATE INDEX IF NOT EXISTS idx_pairings_active ON rustplus_pairings(is_active);

  -- FCM listener credentials (Phase 7.2): one row per registered Rust+ player. Used to
  -- receive "Pair with Server" push notifications from Facepunch and auto-create the
  -- rustplus_pairings above. The Steam OAuth (fcm-register) is done locally; only the
  -- android_id + security_token land here. security_token is a SECRET (it grants receipt
  -- of that account's push notifications) — never log it or return it over the API.
  -- guild_id (when registered via the Discord command) routes auto-paired servers into
  -- that guild; null (registered via REST) leaves them as orphan capture rows.
  CREATE TABLE IF NOT EXISTS fcm_credentials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT,                         -- Discord guild that owns auto-paired servers (nullable)
    discord_user_id TEXT,                         -- who registered it (nullable)
    label           TEXT,                         -- optional, e.g. the player name
    android_id      TEXT NOT NULL,                -- FCM gcm.androidId
    security_token  TEXT NOT NULL,                -- FCM gcm.securityToken (SECRET)
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(android_id)
  );
  CREATE INDEX IF NOT EXISTS idx_fcm_active ON fcm_credentials(is_active);

  -- Player presence watches (Phase 8.4): teammates to alert on when they go offline /
  -- come back online, detected via the Rust+ getTeamInfo poll. One row per (server,
  -- steam_id); label is an optional friendly name shown in the notification.
  CREATE TABLE IF NOT EXISTS player_watches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    steam_id    TEXT NOT NULL,                 -- watched player's steam id
    label       TEXT,                          -- optional friendly name
    added_by    TEXT,                          -- Discord user id who added it (nullable)
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, steam_id)
  );
  CREATE INDEX IF NOT EXISTS idx_watches_server ON player_watches(server_id);

  -- Smart switches (Phase 9): Rust+ entity ids registered by label so they can be
  -- toggled via Discord (/switch) or in-game team chat (!switch on/off/toggle).
  -- entityId is the Rust CCTV/switch entity id (integer printed in the pairing UI).
  CREATE TABLE IF NOT EXISTS smart_switches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id   INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    entity_id   INTEGER NOT NULL,               -- Rust entity id (from /pair or CCTV panel)
    label       TEXT NOT NULL,                  -- short name used in commands (!switch on Base)
    added_by    TEXT,                           -- Discord user id who registered it
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, entity_id),
    UNIQUE(server_id, label COLLATE NOCASE)
  );
  CREATE INDEX IF NOT EXISTS idx_switches_server ON smart_switches(server_id);
`);

export default db;
