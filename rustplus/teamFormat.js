// Pure formatters for Rust+ team info (Phase 8.1). No socket, no DB — given a
// `teamInfo` object (rustplus.proto AppTeamInfo) they return the string we send back
// in team chat. Kept side-effect-free so the whole module is unit-testable directly.
//
// AppTeamInfo.members[i] = { steamId, name, x, y, isOnline, spawnTime, isAlive, deathTime }
//   x,y       — world position in metres
//   spawnTime — unix seconds of the member's current spawn (smaller = alive longer)
import { nowUnix } from '../shared/time.js';

// Compact elapsed/duration, e.g. "3h 12m", "5m", "2j 1h 0m". Always shows minutes.
function formatDuration(seconds) {
  let s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// "142m" under 1km, "1.2km" otherwise.
function formatDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

const members = (teamInfo) => (teamInfo?.members ?? []);

export function formatOnline(teamInfo) {
  const on = members(teamInfo).filter((m) => m.isOnline);
  if (!on.length) return '⚫ Personne en ligne';
  return `🟢 En ligne (${on.length}) : ${on.map((m) => m.name).join(', ')}`;
}

export function formatOffline(teamInfo) {
  const off = members(teamInfo).filter((m) => !m.isOnline);
  if (!off.length) return '🟢 Toute l’équipe est en ligne';
  return `⚫ Hors ligne (${off.length}) : ${off.map((m) => m.name).join(', ')}`;
}

export function formatAlive(teamInfo, now = nowUnix()) {
  const alive = members(teamInfo).filter((m) => m.isAlive);
  if (!alive.length) return '💀 Personne en vie';
  // Smallest spawnTime = spawned earliest = alive the longest.
  const longest = alive.reduce((a, b) => (a.spawnTime <= b.spawnTime ? a : b));
  return `⏳ Plus longue vie : ${longest.name} (${formatDuration(now - longest.spawnTime)})`;
}

export function formatProx(teamInfo, fromSteamId) {
  const all = members(teamInfo);
  const me = all.find((m) => String(m.steamId) === String(fromSteamId));
  if (!me) return '❌ Appelant introuvable dans l’équipe';
  const others = all.filter((m) => String(m.steamId) !== String(fromSteamId) && m.isOnline);
  if (!others.length) return '📍 Aucun coéquipier en ligne';
  const parts = others
    .map((m) => ({ name: m.name, dist: Math.hypot(m.x - me.x, m.y - me.y) }))
    .sort((a, b) => a.dist - b.dist)
    .map((p) => `${p.name} ${formatDistance(p.dist)}`);
  return `📍 ${parts.join(' · ')}`;
}
