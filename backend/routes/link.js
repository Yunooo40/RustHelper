// Player-linking routes (Phase 4):
//   POST /link/claim   -> in-game !link <code> claims a pending code (plugin, authed)
//   GET  /link?discord=<id> | ?steam=<id>  -> read a link (or null)
//
// Codes are minted by the Discord /link command (Link.createCode) inside the same
// process, so there is no public "create code" endpoint to abuse.
import { Router } from 'express';
import { verifyWebhookSecret } from '../middleware/auth.js';
import * as Link from '../models/link.js';

export function linkRouter() {
  const router = Router();

  router.post('/claim', verifyWebhookSecret, (req, res) => {
    const body = req.body ?? {};
    const code = body.code;
    const steamId = body.steam_id;
    if (!code || !steamId) {
      return res.status(400).json({ ok: false, error: 'Missing "code" or "steam_id"' });
    }

    const result = Link.claimCode({ code, steamId, steamName: body.steam_name ?? null });
    if (!result.ok) {
      const status = result.reason === 'expired' ? 410 : 404;
      return res.status(status).json({ ok: false, error: `Code ${result.reason}` });
    }

    return res.json({
      ok: true,
      link: {
        discord_user_id: result.link.discord_user_id,
        steam_id: result.link.steam_id,
        steam_name: result.link.steam_name,
      },
    });
  });

  router.get('/', (req, res) => {
    const { discord, steam } = req.query;
    let link = null;
    if (discord) link = Link.findByDiscord(String(discord));
    else if (steam) link = Link.findBySteam(String(steam));
    return res.json({ ok: true, link: link ?? null });
  });

  return router;
}
