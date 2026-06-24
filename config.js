// Central configuration: reads the .env file once and exposes a typed object.
// Import `config` anywhere instead of touching process.env directly.
import 'dotenv/config';
import path from 'node:path';

const env = process.env;
const rawDbPath = env.DATABASE_PATH ?? './data/rustlink.sqlite';

export const config = {
  env: env.NODE_ENV ?? 'development',

  discord: {
    token: env.DISCORD_TOKEN ?? '',
    clientId: env.DISCORD_CLIENT_ID ?? '',
    // Optional guild for instant (guild-scoped) command registration in dev.
    guildId: env.DISCORD_GUILD_ID ?? '',
  },

  api: {
    // Cloud hosts (Railway/Render/Heroku) inject PORT — honour it first, then the
    // local API_PORT override, then a dev default.
    port: Number(env.PORT ?? env.API_PORT ?? 3000),
    // Shared secret expected from the Rust plugin. Empty = auth disabled (dev only).
    webhookSecret: env.WEBHOOK_SECRET ?? '',
    // Separate secret for admin operations (e.g. DELETE /servers/:name). Kept apart
    // from WEBHOOK_SECRET, which is handed to every Rust server operator. Empty = the
    // admin endpoints are auth-disabled (dev only).
    adminSecret: env.ADMIN_SECRET ?? '',
    // Per-IP rate limiting (defence-in-depth on the public API). Disabled in tests.
    rateLimit: {
      windowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      max: Number(env.RATE_LIMIT_MAX ?? 300),
    },
  },

  db: {
    // ":memory:" et "" sont des modes SQLite spéciaux : ne pas les résoudre en chemin.
    path: rawDbPath === ':memory:' || rawDbPath === '' ? ':memory:' : path.resolve(rawDbPath),
  },

  rustplus: {
    // Companion Rust+ socket manager (Phase 7). On by default; it's a no-op until a
    // pairing exists. Set RUSTPLUS_ENABLED="false" as a kill-switch. Credentials
    // (ip/port/steamId/playerToken) live in the DB (rustplus_pairings), never in env.
    enabled: env.RUSTPLUS_ENABLED !== 'false',
    reconnect: {
      minDelayMs: Number(env.RUSTPLUS_RECONNECT_MIN_MS ?? 2_000),
      maxDelayMs: Number(env.RUSTPLUS_RECONNECT_MAX_MS ?? 60_000),
    },
    // Safety timeout for a single Rust+ request (getInfo/getTime/...) before we reject.
    requestTimeoutMs: Number(env.RUSTPLUS_REQUEST_TIMEOUT_MS ?? 10_000),
    // Team-state poller (Phase 8.2): how often to sample getTeamInfo, and the AFK rule.
    poll: {
      intervalMs: Number(env.RUSTPLUS_POLL_MS ?? 20_000),     // 3 req/min, well under rate limits
      afkThresholdMs: Number(env.RUSTPLUS_AFK_MS ?? 300_000), // 5 min immobile
      afkEpsilon: Number(env.RUSTPLUS_AFK_EPSILON ?? 1.5),    // metres; movement <= is "immobile"
    },
  },
};

export const isProd = config.env === 'production';

// Throws early with a clear message if the bot is started without its credentials.
export function assertBotConfig() {
  const missing = [];
  if (!config.discord.token) missing.push('DISCORD_TOKEN');
  if (!config.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (missing.length) {
    throw new Error(
      `Missing required environment variables for the bot: ${missing.join(', ')}.\n` +
        `Copy .env.example to .env and fill them in.`,
    );
  }
}

export default config;
