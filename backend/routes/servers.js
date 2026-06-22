// /servers — list tracked Rust servers (GET) + admin delete (DELETE).
import { Router } from 'express';
import * as Servers from '../models/server.js';
import { verifyWebhookSecret } from '../middleware/auth.js';

export function serversRouter() {
  const router = Router();

  router.get('/', (_req, res) => res.json({ ok: true, servers: Servers.list() }));

  // DELETE /servers/:name — admin cleanup, protected by the webhook secret. Removes
  // every server row of that name (case-insensitive) and cascades its
  // events/timers/deaths. Mainly to purge orphan rows the webhook captured pre-/setup.
  router.delete('/:name', verifyWebhookSecret, (req, res) => {
    const removed = Servers.removeByName(req.params.name);
    if (removed === 0) {
      return res.status(404).json({ ok: false, error: `No server named "${req.params.name}"` });
    }
    return res.json({ ok: true, removed });
  });

  return router;
}
