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

// Most recent display name + linked Discord id seen for a player (as killer or
// victim). `serverId` optional → all servers.
function latestIdentity({ steamId, serverId = null }) {
  const scope = serverId ? 'AND server_id = @serverId' : '';
  const row = db
    .prepare(
      `SELECT name, discord_id FROM (
         SELECT id, killer_name AS name, killer_discord_id AS discord_id
           FROM deaths WHERE killer_id = @steamId ${scope}
         UNION ALL
         SELECT id, victim_name AS name, victim_discord_id AS discord_id
           FROM deaths WHERE victim_id = @steamId ${scope}
       ) ORDER BY id DESC LIMIT 1`,
    )
    .get({ steamId, serverId });
  return { name: row?.name ?? null, discordId: row?.discord_id ?? null };
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

  const { name, discordId } = latestIdentity({ steamId, serverId });

  return {
    steamId,
    name,
    discordId,
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
//
// Counts are aggregated in SQL (GROUP BY) so we never load the whole `deaths` table
// into memory — the result set is one row per ranked player, not one per death. The
// (small) top-N rows are then decorated with each player's latest name/Discord id.
export function leaderboard({ serverId = null, limit = 10, minKills = 0 } = {}) {
  const scope = serverId ? 'AND server_id = @serverId' : '';
  const rows = db
    .prepare(
      `WITH k AS (
         SELECT killer_id AS sid, COUNT(*) AS kills
           FROM deaths
          WHERE killer_id IS NOT NULL
            AND (victim_id IS NULL OR victim_id <> killer_id) ${scope}
          GROUP BY killer_id
       ),
       d AS (
         SELECT victim_id AS sid, COUNT(*) AS deaths
           FROM deaths
          WHERE victim_id IS NOT NULL ${scope}
          GROUP BY victim_id
       ),
       ids AS (SELECT sid FROM k UNION SELECT sid FROM d)
       SELECT ids.sid                  AS steamId,
              COALESCE(k.kills, 0)     AS kills,
              COALESCE(d.deaths, 0)    AS deaths
         FROM ids
         LEFT JOIN k ON k.sid = ids.sid
         LEFT JOIN d ON d.sid = ids.sid
        WHERE COALESCE(k.kills, 0) >= @minKills
        ORDER BY (CASE WHEN COALESCE(d.deaths, 0) > 0
                       THEN CAST(COALESCE(k.kills, 0) AS REAL) / d.deaths
                       ELSE COALESCE(k.kills, 0) END) DESC,
                 kills DESC
        LIMIT @limit`,
    )
    .all({ serverId, minKills, limit });

  return rows.map((p) => ({
    ...p,
    kd: kd(p.kills, p.deaths),
    ...latestIdentity({ steamId: p.steamId, serverId }),
  }));
}
