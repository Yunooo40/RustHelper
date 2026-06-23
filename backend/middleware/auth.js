// Authentication middleware.
//
//  - verifyWebhookSecret: the Rust/Oxide plugin must send WEBHOOK_SECRET in the
//    `x-webhook-secret` header (or `Authorization: Bearer <secret>`).
//  - verifyAdminSecret: admin-only endpoints (e.g. DELETE /servers/:name) require
//    ADMIN_SECRET in the `x-admin-secret` header. This is kept SEPARATE from the
//    webhook secret, which is distributed to every Rust server operator — so a
//    plugin secret can never be used to perform destructive admin actions.
//
// When the relevant secret is empty, auth is disabled so you can test freely with
// curl/Postman in local dev.
import crypto from 'node:crypto';
import { config } from '../../config.js';

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false; // length leak is acceptable here
  return crypto.timingSafeEqual(ba, bb);
}

// Builds a middleware that checks `provided secret === expected`. `expected` is read
// lazily on each request so tests (and hot config changes) take effect immediately.
function makeSecretGuard({ label, getExpected, getProvided }) {
  let warned = false;
  return function guard(req, res, next) {
    const expected = getExpected();

    // Dev convenience: no secret configured -> allow everything (warn once).
    if (!expected) {
      if (!warned) {
        console.warn(`[auth] ${label} is empty - auth is DISABLED (dev mode only).`);
        warned = true;
      }
      return next();
    }

    const provided = getProvided(req);
    if (provided && safeEqual(provided, expected)) return next();
    return res.status(401).json({ ok: false, error: `Invalid or missing ${label.toLowerCase()}` });
  };
}

export const verifyWebhookSecret = makeSecretGuard({
  label: 'WEBHOOK_SECRET',
  getExpected: () => config.api.webhookSecret,
  getProvided: (req) =>
    req.get('x-webhook-secret') || (req.get('authorization') || '').replace(/^Bearer\s+/i, ''),
});

export const verifyAdminSecret = makeSecretGuard({
  label: 'ADMIN_SECRET',
  getExpected: () => config.api.adminSecret,
  getProvided: (req) =>
    req.get('x-admin-secret') || (req.get('authorization') || '').replace(/^Bearer\s+/i, ''),
});
