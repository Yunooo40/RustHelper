// Webhook authentication middleware.
//
// The Rust/Oxide plugin must send the shared secret in the `x-webhook-secret`
// header (or `Authorization: Bearer <secret>`). If WEBHOOK_SECRET is empty,
// auth is disabled so you can test freely with curl/Postman in local dev.
import crypto from 'node:crypto';
import { config } from '../../config.js';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false; // length leak is acceptable here
  return crypto.timingSafeEqual(ba, bb);
}

let warned = false;

export function verifyWebhookSecret(req, res, next) {
  const expected = config.api.webhookSecret;

  // Dev convenience: no secret configured -> allow everything (warn once).
  if (!expected) {
    if (!warned) {
      console.warn('[auth] WEBHOOK_SECRET is empty - webhook auth is DISABLED (dev mode only).');
      warned = true;
    }
    return next();
  }

  const headerSecret = req.get('x-webhook-secret');
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = headerSecret || bearer;

  if (provided && safeEqual(provided, expected)) return next();
  return res.status(401).json({ ok: false, error: 'Invalid or missing webhook secret' });
}
