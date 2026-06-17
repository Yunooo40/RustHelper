// Main entry point.
//
// Starts the REST API and (if a DISCORD_TOKEN is configured) the Discord bot
// in a single process, so the API can hand off notifications to the bot through
// the in-process event bus. Run the API alone with: `npm run api`.
import { config } from './config.js';
import { createApiServer } from './backend/server.js';
import { createBot } from './bot/bot.js';

const apiOnly = process.argv.includes('--api-only');

async function main() {
  // 1) Start the API.
  const app = createApiServer();
  const httpServer = app.listen(config.api.port, () => {
    console.log(`[api] listening on http://localhost:${config.api.port}`);
  });

  // 2) Start the bot (optional — needs a token).
  let client = null;
  if (apiOnly) {
    console.warn('[bot] --api-only flag set; Discord bot not started.');
  } else if (!config.discord.token) {
    console.warn('[bot] DISCORD_TOKEN missing; running API only. Fill .env to enable the bot.');
  } else {
    client = await createBot();
    await client.login(config.discord.token);
  }

  // 3) Graceful shutdown.
  const shutdown = (signal) => {
    console.log(`\n[app] ${signal} received, shutting down...`);
    httpServer.close();
    if (client) client.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[app] fatal startup error:', err);
  process.exit(1);
});
