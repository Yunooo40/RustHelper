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
    // Live event detection by polling getMapMarkers (Cargo/Heli/Chinook) — no Oxide
    // plugin required. Disable if the plugin already reports these (avoids double
    // notifications). pollMs: markers change slowly, so 30s is gentle on the server.
    markers: {
      enabled: env.RUSTPLUS_MARKERS_ENABLED !== 'false',
      pollMs: Number(env.RUSTPLUS_MARKER_POLL_MS ?? 30_000),
    },
    // Anti-spam cooldown (ms) per in-game "!" command, per server: a command can only
    // run once within this window however many teammates fire it. 0 disables cooldowns.
    commandCooldownMs: Number(env.RUSTPLUS_CMD_COOLDOWN_MS ?? 5_000),
    // Team-state poller (Phase 8.2): how often to sample getTeamInfo, and the AFK rule.
    poll: {
      intervalMs: Number(env.RUSTPLUS_POLL_MS ?? 20_000),     // 3 req/min, well under rate limits
      afkThresholdMs: Number(env.RUSTPLUS_AFK_MS ?? 300_000), // 5 min immobile
      afkEpsilon: Number(env.RUSTPLUS_AFK_EPSILON ?? 1.5),    // metres; movement <= is "immobile"
    },
    // FCM Smart Alarm listener (Phase 9). Forwards Rust+ Smart Alarm pushes to Discord.
    // credentialsPath points at the JSON written by `npx @liamcottle/rustplus.js fcm-register`
    // (account-level push creds, NOT per-server). Empty/missing = listener stays idle.
    fcm: {
      enabled: env.RUSTPLUS_FCM_ENABLED !== 'false',
      credentialsPath: env.RUSTPLUS_FCM_CREDENTIALS ?? '',
    },
    // Diagnostics (Phase 10). When on, log raw Rust+ markers/monuments once per connect and
    // raw FCM pushes (secrets redacted) — to confirm the 'verify live' assumptions (marker
    // enum values, oil rig tokens, grid, FCM shape) on a real server. Opt-in; off by default.
    diag: env.RUSTPLUS_DIAG === 'true',
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
