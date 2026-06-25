// Persist a Rust event, refresh its timer when a respawn is known, and notify the bot.
//
// Shared by the plugin webhook (POST /webhook/rust) and the Rust+ marker poller
// (rustplus/connection.js) so BOTH paths produce identical history rows, timers and
// Discord notifications. The emitted bus payload mirrors what the bot's bridge
// (bot/bot.js → sendToChannel) expects.
import * as Events from './models/event.js';
import * as Timers from './models/timer.js';
import { bus, RUST_EVENT } from '../shared/bus.js';

// `server` is an already-resolved row ({ id, name, channel_id }). `source` tags the
// origin ('webhook' | 'ingame' | 'manual' | 'rustplus'); `reporter` names the in-game
// player for source='ingame'. A timer is only (re)written when `nextRespawn` is known.
export function recordRustEvent({
  server,
  eventType,
  status = null,
  spawnTime = null,
  nextRespawn = null,
  source = 'webhook',
  reporter = null,
  payload = null,
}) {
  Events.insert({ serverId: server.id, eventType, status, spawnTime, nextRespawn, payload });
  if (nextRespawn) {
    Timers.upsert({ serverId: server.id, eventType, expiresAt: nextRespawn, status, source });
  }
  bus.emit(RUST_EVENT, {
    serverName: server.name,
    channelId: server.channel_id,
    eventType,
    status,
    spawnTime,
    nextRespawn,
    source,
    reportedBy: reporter,
  });
}

export default recordRustEvent;
