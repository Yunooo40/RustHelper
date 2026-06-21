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

db.exec(`
  -- Rust servers being tracked. One Discord guild tracks one Rust server (MVP).
  CREATE TABLE IF NOT EXISTS servers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id       TEXT UNIQUE,                 -- Discord guild id (null until /setup)
    name           TEXT NOT NULL,               -- Rust server display name (match key for webhooks)
    channel_id     TEXT,                        -- Discord channel id for notifications
    webhook_secret TEXT,                        -- optional per-server secret (overrides global)
    timezone       TEXT NOT NULL DEFAULT 'UTC',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
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
`);

export default db;
