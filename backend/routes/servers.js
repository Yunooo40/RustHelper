// GET /servers — list every tracked Rust server.
import { Router } from 'express';
import * as Servers from '../models/server.js';

export function serversRouter() {
  const router = Router();
  router.get('/', (_req, res) => res.json({ ok: true, servers: Servers.list() }));
  return router;
}
