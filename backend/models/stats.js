// Read-only analytics derived from the `deaths` table (Phase 4.3 K/D stats).
//
// Definitions used consistently here and in the leaderboard:
//  - A **kill** is a death row where `killer_id` is the player AND killer != victim
//    (self-inflicted deaths never count as kills).
//  - A **death** is any death row where `victim_id` is the player (PvP, NPC,
//    environment, or suicide all count — it's "times you died").
//  - **K/D** = deaths > 0 ? kills / deaths : kills  (no division-by-zero / no ∞;
//    an undefeated player's ratio is simply their kill count).
//  - **Best streak** = longest run of kills without dying, over the player's
//    chronological timeline of kills and deaths.
//
// Stats are keyed by Steam id (stable), so a player's full history counts even
// for deaths recorded before they linked their Discord account.
import { db } from '../db.js';

// kills / deaths as a ratio, capped to avoid Infinity when deaths === 0.
export function kd(kills, deaths) {
  return deaths > 0 ? kills / deaths : kills;
}

// Stats for a single player (by Steam id). `serverId` optional → all servers.
export function forPlayer({ steamId, serverId = null }) {
  if (!steamId) return null;
  const scope = serverId ? 'AND server_id = @serverId' : '';
  const params = { steamId, serverId };

  const kills = db
    .prepare(
      `SELECT COUNT(*) AS n FROM deaths
        WHERE killer_id = @steamId
          AND (victim_id IS NULL OR victim_id <> killer_id) ${scope}`,
    )
    .get(params).n;

  const deaths = db
    .prepare(`SELECT COUNT(*) AS n FROM deaths WHERE victim_id = @steamId ${scope}`)
    .get(params).n;

  // Most recent display name we've seen for this player (killer or victim).
  const nameRow = db
    .prepare(
      `SELECT name, discord_id FROM (
         SELECT id, killer_name AS name, killer_discord_id AS discord_id
           FROM deaths WHERE killer_id = @steamId ${scope}
         UNION ALL
         SELECT id, victim_name AS name, victim_discord_id AS discord_id
           FROM deaths WHERE victim_id = @steamId ${scope}
       ) ORDER BY id DESC LIMIT 1`,
    )
    .get(params);

  return {
    steamId,
    name: nameRow?.name ?? null,
    discordId: nameRow?.discord_id ?? null,
    kills,
    deaths,
    kd: kd(kills, deaths),
    bestStreak: bestStreakFor({ steamId, serverId }),
  };
}

// Longest run of consecutive kills with no death in between.
function bestStreakFor({ steamId, serverId = null }) {
  const scope = serverId ? 'AND server_id = @serverId' : '';
  const rows = db
    .prepare(
      `SELECT killer_id, victim_id FROM deaths
        WHERE (killer_id = @steamId OR victim_id = @steamId) ${scope}
        ORDER BY id ASC`,
    )
    .all({ steamId, serverId });

  let best = 0;
  let run = 0;
  for (const r of rows) {
    if (r.victim_id === steamId) {
      run = 0; // died (incl. suicide) → streak resets
    } else if (r.killer_id === steamId) {
      run += 1; // a kill on someone else
      if (run > best) best = run;
    }
  }
  return best;
}

// Server leaderboard, ranked by K/D (then kills). `serverId` optional → all servers.
// `minKills` filters out tiny sample sizes from the ranking.
export function leaderboard({ serverId = null, limit = 10, minKills = 0 } = {}) {
  const scope = serverId ? 'WHERE server_id = @serverId' : '';
  const rows = db
    .prepare(
      `SELECT killer_id, killer_name, killer_discord_id,
              victim_id, victim_name, victim_discord_id
         FROM deaths ${scope} ORDER BY id ASC`,
    )
    .all({ serverId });

  // Aggregate per Steam id in chronological order so the last name/discord wins.
  const players = new Map();
  const touch = (id) => {
    if (!players.has(id)) players.set(id, { steamId: id, name: null, discordId: null, kills: 0, deaths: 0 });
    return players.get(id);
  };

  for (const r of rows) {
    if (r.victim_id) {
      const p = touch(r.victim_id);
      p.deaths += 1;
      if (r.victim_name) p.name = r.victim_name;
      if (r.victim_discord_id) p.discordId = r.victim_discord_id;
    }
    if (r.killer_id && r.killer_id !== r.victim_id) {
      const p = touch(r.killer_id);
      p.kills += 1;
      if (r.killer_name) p.name = r.killer_name;
      if (r.killer_discord_id) p.discordId = r.killer_discord_id;
    }
  }

  return [...players.values()]
    .map((p) => ({ ...p, kd: kd(p.kills, p.deaths) }))
    .filter((p) => p.kills >= minKills)
    .sort((a, b) => b.kd - a.kd || b.kills - a.kills)
    .slice(0, limit);
}
