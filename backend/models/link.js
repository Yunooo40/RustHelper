// Data-access for player linking (Phase 4): Discord <-> Steam.
//
// Flow: /link (Discord) -> createCode() -> player runs !link <code> in-game ->
// plugin POSTs /link/claim -> claimCode() ties the two accounts together.
import { db } from '../db.js';
import { nowUnix } from '../../shared/time.js';

// Unambiguous alphabet (no 0/O/1/I/L) so codes are easy to read & type in-game.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

function randomCode() {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Create a fresh pending code for a Discord user (replacing any previous one).
// ttlSeconds defaults to 10 minutes.
export function createCode({ discordUserId, ttlSeconds = 600 }) {
  db.prepare('DELETE FROM link_codes WHERE discord_user_id = ?').run(discordUserId);

  const expiresAt = nowUnix() + ttlSeconds;
  // Retry on the (very unlikely) primary-key collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      db.prepare(
        'INSERT INTO link_codes (code, discord_user_id, expires_at) VALUES (?, ?, ?)',
      ).run(code, discordUserId, expiresAt);
      return { code, expiresAt };
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('Could not generate a unique link code');
}

// Claim a code from in-game. Returns { ok, reason?, link? }.
//   reason: 'unknown' (no such code) | 'expired'
export function claimCode({ code, steamId, steamName = null }) {
  const norm = String(code ?? '').trim().toUpperCase();
  const row = db.prepare('SELECT * FROM link_codes WHERE code = ?').get(norm);
  if (!row) return { ok: false, reason: 'unknown' };

  if (row.expires_at <= nowUnix()) {
    db.prepare('DELETE FROM link_codes WHERE code = ?').run(norm);
    return { ok: false, reason: 'expired' };
  }

  // Enforce one-to-one: drop any existing link for this Discord user OR this Steam id.
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM links WHERE discord_user_id = ? OR steam_id = ?').run(
      row.discord_user_id,
      steamId,
    );
    db.prepare(
      'INSERT INTO links (discord_user_id, steam_id, steam_name) VALUES (?, ?, ?)',
    ).run(row.discord_user_id, steamId, steamName);
    db.prepare('DELETE FROM link_codes WHERE code = ?').run(norm);
  });
  tx();

  return { ok: true, link: findByDiscord(row.discord_user_id) };
}

export function findByDiscord(discordUserId) {
  return db.prepare('SELECT * FROM links WHERE discord_user_id = ?').get(discordUserId);
}

export function findBySteam(steamId) {
  return db.prepare('SELECT * FROM links WHERE steam_id = ?').get(steamId);
}

// Remove a link. Returns true if a row was deleted.
export function unlink(discordUserId) {
  return db.prepare('DELETE FROM links WHERE discord_user_id = ?').run(discordUserId).changes > 0;
}

// Housekeeping: drop expired pending codes.
export function purgeExpired() {
  return db.prepare('DELETE FROM link_codes WHERE expires_at <= ?').run(nowUnix()).changes;
}
