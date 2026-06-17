// GET /events?server=<name>&limit=25 — recent event history (audit log).
import { Router } from 'express';
import * as Servers from '../models/server.js';
import * as Events from '../models/event.js';

export function eventsRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 25) || 25, 200);
    if (req.query.server) {
      const s = Servers.findByName(req.query.server);
      if (!s) return res.json({ ok: true, events: [] });
      return res.json({ ok: true, events: Events.recent({ serverId: s.id, limit }) });
    }
    return res.json({ ok: true, events: Events.recent({ limit }) });
  });

  return router;
}
