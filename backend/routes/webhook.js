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
import * as Deaths from '../models/death.js';
import * as Link from '../models/link.js';
import { recordRustEvent } from '../ingest.js';
import { resolveEvent } from '../../shared/events.js';
import { toUnix } from '../../shared/time.js';
import { bus, DEATH_EVENT } from '../../shared/bus.js';

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
    // refresh the active timer, and notify the bot (no-op if it isn't running).
    const server = Servers.findOrCreateByName(serverName);
    recordRustEvent({ server, eventType, status, spawnTime, nextRespawn, source, reporter: reportedBy, payload: body });

    return res.json({
      ok: true,
      server: server.name,
      event: eventType,
      status,
      next_respawn: nextRespawn,
    });
  });

  // POST /webhook/death — a player died (Phase 4.2). Resolves linked Discord users
  // (victim/killer) for the kill feed, logs the death, and notifies the bot.
  router.post('/death', verifyWebhookSecret, (req, res) => {
    const body = req.body ?? {};
    if (!body.server || !body.victim_name) {
      return res.status(400).json({ ok: false, error: 'Missing "server" or "victim_name"' });
    }

    const server = Servers.findOrCreateByName(body.server);
    const victimDiscordId = body.victim_id ? Link.findBySteam(body.victim_id)?.discord_user_id ?? null : null;
    const killerDiscordId = body.killer_id ? Link.findBySteam(body.killer_id)?.discord_user_id ?? null : null;

    Deaths.insert({
      serverId: server.id,
      victimId: body.victim_id ?? null,
      victimName: body.victim_name,
      killerId: body.killer_id ?? null,
      killerName: body.killer_name ?? null,
      cause: body.cause ?? null,
      distance: body.distance ?? null,
      victimDiscordId,
      killerDiscordId,
      payload: body,
    });

    bus.emit(DEATH_EVENT, {
      serverName: server.name,
      channelId: server.channel_id,
      victimName: body.victim_name,
      victimDiscordId,
      killerName: body.killer_name ?? null,
      killerDiscordId,
      cause: body.cause ?? null,
      distance: body.distance ?? null,
    });

    return res.json({
      ok: true,
      death: { victim: body.victim_name, killer: body.killer_name ?? null, victimDiscordId },
    });
  });

  return router;
}
