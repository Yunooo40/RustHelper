// POST /webhook/rust — entry point for events sent by the Rust/Oxide plugin.
//
// Example payload (see README / scripts/):
//   {
//     "server": "Atlas - EU 2X Medium",
//     "event": "oil_rig_small",
//     "status": "spawned",
//     "spawn_time": 1718614800,
//     "next_respawn": 1718631200,
//     "timestamp": "2024-06-17T10:00:00Z"
//   }
import { Router } from 'express';
import { verifyWebhookSecret } from '../middleware/auth.js';
import * as Servers from '../models/server.js';
import * as Events from '../models/event.js';
import * as Timers from '../models/timer.js';
import { resolveEvent } from '../../shared/events.js';
import { toUnix } from '../../shared/time.js';
import { bus, RUST_EVENT } from '../../shared/bus.js';

export function webhookRouter() {
  const router = Router();

  router.post('/rust', verifyWebhookSecret, (req, res) => {
    const body = req.body ?? {};
    const serverName = body.server;
    if (!serverName) {
      return res.status(400).json({ ok: false, error: 'Missing "server" field' });
    }

    const eventType = resolveEvent(body.event);
    if (!eventType) {
      return res.status(400).json({ ok: false, error: `Unknown event "${body.event}"` });
    }

    const status = body.status ?? null;
    const spawnTime = toUnix(body.spawn_time);
    const nextRespawn = toUnix(body.next_respawn);

    // Origin of the event: auto plugin event ('webhook'), in-game player report
    // ('ingame'), or manual slash command ('manual'). Unknown values fall back to
    // 'webhook' so a typo never corrupts the timer's source tag.
    const source = ['ingame', 'manual', 'webhook'].includes(body.source) ? body.source : 'webhook';
    const reportedBy = body.reporter ?? null;

    // Capture the server (auto-created if /setup hasn't run yet), log the event,
    // and refresh the active timer.
    const server = Servers.findOrCreateByName(serverName);
    Events.insert({ serverId: server.id, eventType, status, spawnTime, nextRespawn, payload: body });
    if (nextRespawn) {
      Timers.upsert({ serverId: server.id, eventType, expiresAt: nextRespawn, status, source });
    }

    // Tell the bot to post a notification (ignored if the bot isn't running).
    bus.emit(RUST_EVENT, {
      serverName: server.name,
      channelId: server.channel_id,
      eventType,
      status,
      spawnTime,
      nextRespawn,
      source,
      reportedBy,
    });

    return res.json({
      ok: true,
      server: server.name,
      event: eventType,
      status,
      next_respawn: nextRespawn,
    });
  });

  return router;
}
