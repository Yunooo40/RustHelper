// In-process event bus that bridges the API (publisher) and the bot (subscriber).
//
// When the API receives a Rust webhook, it emits RUST_EVENT on this bus.
// The Discord bot subscribes and posts a notification embed to the right channel.
//
// Because everything runs in a single Node process (see index.js), this avoids
// any inter-process plumbing. If you run the API alone (`npm run api`), nobody is
// subscribed and the events are simply ignored — which is fine for curl testing.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();

// Emitted by the webhook route, consumed by the bot.
// Payload shape: { serverName, eventType, status, spawnTime, nextRespawn }
export const RUST_EVENT = 'rust-event';

// Emitted by POST /webhook/death (Phase 4.2), consumed by the bot for the kill feed.
// Payload: { serverName, channelId, victimName, victimDiscordId, killerName,
//            killerDiscordId, cause, distance }
export const DEATH_EVENT = 'death-event';

// Emitted by the FCM Smart Alarm listener (Phase 9), consumed by the bot.
// Payload: { serverName, channelId, title, message }
export const ALARM_EVENT = 'alarm-event';

export default bus;
