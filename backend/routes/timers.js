// Timer routes:
//   GET  /timers           -> list timers (all servers, or ?server=<name>)
//   POST /timers/set        -> manually create/refresh a timer (also /timer/set)
import { Router } from 'express';
import { verifyWebhookSecret } from '../middleware/auth.js';
import * as Servers from '../models/server.js';
import * as Timers from '../models/timer.js';
import { resolveEvent } from '../../shared/events.js';
import { nowUnix, toUnix } from '../../shared/time.js';

export function timersRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    const { server } = req.query;
    if (server) {
      const s = Servers.findByName(server);
      if (!s) return res.json({ ok: true, server, timers: [] });
      return res.json({ ok: true, server: s.name, timers: Timers.listByServer(s.id) });
    }
    return res.json({ ok: true, timers: Timers.listAll() });
  });

  // body: { server, event, minutes }  OR  { server, event, expires_at }
  router.post('/set', verifyWebhookSecret, (req, res) => {
    const body = req.body ?? {};
    if (!body.server) return res.status(400).json({ ok: false, error: 'Missing "server"' });

    const eventType = resolveEvent(body.event);
    if (!eventType) return res.status(400).json({ ok: false, error: `Unknown event "${body.event}"` });

    let expiresAt = toUnix(body.expires_at);
    if (!expiresAt && body.minutes != null) expiresAt = nowUnix() + Number(body.minutes) * 60;
    if (!expiresAt) return res.status(400).json({ ok: false, error: 'Provide "minutes" or "expires_at"' });

    const s = Servers.findOrCreateByName(body.server);
    const timer = Timers.upsert({ serverId: s.id, eventType, expiresAt, source: 'manual' });
    return res.json({ ok: true, timer });
  });

  return router;
}
