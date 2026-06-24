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

// Emitted by the Rust+ team poller (Phase 8.2), consumed by the bot.
// Payload: { channelId, serverName, kind: 'join'|'leave'|'death'|'afk'|'back',
//            member: { steamId, name }, afkMs? }
export const TEAM_EVENT = 'team-event';

export default bus;
