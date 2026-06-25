// /fcm — register / remove FCM listener credentials for auto-pairing (Phase 7.2).
//
// Admin-only (ADMIN_SECRET). security_token grants receipt of that Steam account's Rust+
// push notifications, so it's kept OFF the operator-facing webhook secret and never echoed
// back. Obtain android_id + security_token locally with:
//   npx @liamcottle/rustplus.js fcm-register   (Steam login via browser, once)
// then read them from the generated rustplus.config.json (fcm_credentials.gcm.*).
//
// NOTE: like /pair, this endpoint only writes the DB (scripting / testing path). Starting
// the live listener without a restart is done by the Discord /fcm command, which also calls
// the FCM manager. See rustplus/fcmManager.js.
import { Router } from 'express';
import * as Fcm from '../models/fcmCredential.js';
import { verifyAdminSecret } from '../middleware/auth.js';

// Strip the secret token before returning a credential over the API.
function publicCredential(c) {
  if (!c) return c;
  const { security_token, ...safe } = c; // eslint-disable-line no-unused-vars
  return safe;
}

export function fcmRouter() {
  const router = Router();

  // POST /fcm { androidId, securityToken, guildId?, discordUserId?, label? }
  router.post('/', verifyAdminSecret, (req, res) => {
    const { androidId, securityToken, guildId, discordUserId, label } = req.body ?? {};
    const missing = [];
    if (!androidId) missing.push('androidId');
    if (!securityToken) missing.push('securityToken');
    if (missing.length) {
      return res.status(400).json({ ok: false, error: `Missing field(s): ${missing.join(', ')}` });
    }

    const credential = Fcm.add({
      androidId: String(androidId),
      securityToken: String(securityToken),
      guildId: guildId != null ? String(guildId) : null,
      discordUserId: discordUserId != null ? String(discordUserId) : null,
      label: label != null ? String(label) : null,
    });
    return res.json({ ok: true, credential: publicCredential(credential) });
  });

  // DELETE /fcm { androidId } — stop tracking one credential.
  router.delete('/', verifyAdminSecret, (req, res) => {
    const androidId = req.body?.androidId ?? req.query.androidId;
    if (!androidId) return res.status(400).json({ ok: false, error: 'Missing field: androidId' });
    const removed = Fcm.remove(String(androidId));
    return res.json({ ok: true, removed });
  });

  return router;
}

export default fcmRouter;
