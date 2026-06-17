// Central configuration: reads the .env file once and exposes a typed object.
// Import `config` anywhere instead of touching process.env directly.
import 'dotenv/config';
import path from 'node:path';

const env = process.env;

export const config = {
  env: env.NODE_ENV ?? 'development',

  discord: {
    token: env.DISCORD_TOKEN ?? '',
    clientId: env.DISCORD_CLIENT_ID ?? '',
    // Optional guild for instant (guild-scoped) command registration in dev.
    guildId: env.DISCORD_GUILD_ID ?? '',
  },

  api: {
    port: Number(env.API_PORT ?? 3000),
    // Shared secret expected from the Rust plugin. Empty = auth disabled (dev only).
    webhookSecret: env.WEBHOOK_SECRET ?? '',
  },

  db: {
    path: path.resolve(env.DATABASE_PATH ?? './data/rustlink.sqlite'),
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
