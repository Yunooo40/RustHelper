// /pair — register / remove Rust+ companion credentials for a tracked server (Phase 7).
//
// Admin-only (ADMIN_SECRET). A pairing's player_token grants companion control of that
// player on that server, so this is kept OFF the operator-facing webhook secret. The
// token is never echoed back in responses.
//
// NOTE: this endpoint only writes the DB (scripting / testing path). Bringing the live
// socket online without a restart is done by the Discord /pair command, which also calls
// the Rust+ manager. See rustplus/manager.js.
import { Router } from 'express';
import * as Servers from '../models/server.js';
import * as Pairings from '../models/pairing.js';
import { verifyAdminSecret } from '../middleware/auth.js';

// Strip the secret token before returning a pairing over the API.
function publicPairing(p) {
  if (!p) return p;
  const { player_token, ...safe } = p; // eslint-disable-line no-unused-vars
  return safe;
}

export function pairRouter() {
  const router = Router();

  // POST /pair { server, serverIp, appPort, steamId, playerToken, label? }
  router.post('/', verifyAdminSecret, (req, res) => {
    const { server, serverIp, appPort, steamId, playerToken, label } = req.body ?? {};
    const missing = [];
    if (!server) missing.push('server');
    if (!serverIp) missing.push('serverIp');
    if (appPort == null) missing.push('appPort');
    if (!steamId) missing.push('steamId');
    if (!playerToken) missing.push('playerToken');
    if (missing.length) {
      return res.status(400).json({ ok: false, error: `Missing field(s): ${missing.join(', ')}` });
    }

    const row = Servers.findByName(server);
    if (!row) {
      return res
        .status(404)
        .json({ ok: false, error: `No server named "${server}" (run /setup first)` });
    }

    const pairing = Pairings.add({
      serverId: row.id,
      serverIp: String(serverIp),
      appPort: Number(appPort),
      steamId: String(steamId),
      playerToken: String(playerToken),
      label: label != null ? String(label) : null,
    });
    return res.json({ ok: true, pairing: publicPairing(pairing) });
  });

  // DELETE /pair { server, steamId? } — remove one pairing (steamId given) or all of a server.
  router.delete('/', verifyAdminSecret, (req, res) => {
    const server = req.body?.server ?? req.query.server;
    const steamId = req.body?.steamId ?? req.query.steamId;
    if (!server) return res.status(400).json({ ok: false, error: 'Missing field: server' });

    const row = Servers.findByName(server);
    if (!row) return res.status(404).json({ ok: false, error: `No server named "${server}"` });

    const removed = steamId
      ? Pairings.remove(row.id, String(steamId))
      : Pairings.removeByServer(row.id);
    return res.json({ ok: true, removed });
  });

  return router;
}

export default pairRouter;
