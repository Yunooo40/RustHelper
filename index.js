// Main entry point.
//
// Starts the REST API and (if a DISCORD_TOKEN is configured) the Discord bot
// in a single process, so the API can hand off notifications to the bot through
// the in-process event bus. Run the API alone with: `npm run api`.
import { config } from './config.js';
import { createApiServer } from './backend/server.js';
import { createBot } from './bot/bot.js';
import * as Link from './backend/models/link.js';
import { startManager, stopManager } from './rustplus/manager.js';
import { startFcmManager, stopFcmManager } from './rustplus/fcmManager.js';

const apiOnly = process.argv.includes('--api-only');
const PURGE_INTERVAL_MS = 10 * 60 * 1000; // drop expired link codes every 10 min

async function main() {
  // 1) Start the API.
  const app = createApiServer();
  const httpServer = app.listen(config.api.port, () => {
    console.log(`[api] listening on http://localhost:${config.api.port}`);
  });

  // Housekeeping: periodically purge expired pending link codes. unref() so the
  // timer never keeps the process alive on its own.
  const purgeTimer = setInterval(() => {
    try {
      Link.purgeExpired();
    } catch (err) {
      console.error('[app] link code purge failed:', err);
    }
  }, PURGE_INTERVAL_MS);
  purgeTimer.unref();

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

  // 2b) Start the Rust+ companion manager (in-game ! commands + /pop /time). No-op until
  // a server is paired (/pair). Skipped in --api-only (curl/testing) mode.
  if (!apiOnly) {
    startManager();
    // 2c) FCM listener manager: auto-pairing + Smart Alarms. No-op until /fcm connect
    // registers a credential.
    startFcmManager();
  }

  // 3) Graceful shutdown: stop accepting connections and wait for in-flight requests
  // to drain before exiting (with a hard 10s fallback so we never hang).
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[app] ${signal} received, shutting down...`);
    clearInterval(purgeTimer);
    stopManager();
    stopFcmManager();
    if (client) client.destroy();
    const hard = setTimeout(() => process.exit(0), 10_000);
    hard.unref();
    httpServer.close(() => {
      clearTimeout(hard);
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[app] fatal startup error:', err);
  process.exit(1);
});
