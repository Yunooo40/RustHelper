// In-game command router (Phase 7). Given a Rust+ team-chat message and a connection
// client, dispatch "!" commands and reply IN-GAME. Phase 8+ just adds entries to
// COMMANDS — keep handlers small and pull-only here.
//
// ANTI-LOOP: sendTeamMessage echoes our own message back as a teamMessage broadcast, so
// we MUST ignore messages from our own steamId — otherwise every reply re-triggers us.
//
// The `client` is the promisified connection (rustplus/connection.js): it exposes
// getInfoAsync(), getTimeAsync(), sendTeamMessageAsync(text). Kept as an injected
// dependency so this whole module is unit-testable with a fake client (no live socket).
import { formatOnline, formatOffline, formatAlive, formatProx } from './teamFormat.js';
import * as Timers from '../backend/models/timer.js';
import * as Switches from '../backend/models/switch.js';
import { resolveEvent, eventEmoji, eventLabel } from '../shared/events.js';
import { nowUnix, formatCountdown } from '../shared/time.js';
import { config } from '../config.js';

// ── Reply formatters (pure — unit-tested directly) ──────────────────────────────

export function formatPop(info) {
  const queued = info.queuedPlayers ? ` (+${info.queuedPlayers} en file)` : '';
  return `👥 ${info.players}/${info.maxPlayers} joueurs${queued}`;
}

export function formatTime(time) {
  // Rust in-game day time is a float in [0, 24). Render it as HH:MM.
  const t = Number(time.time) || 0;
  const h = Math.floor(t);
  const m = Math.floor((t - h) * 60);
  return `🕑 Il est ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} en jeu`;
}

// Promote the caller (no arg) or the named member to team leader. Re-assigning
// leadership to SOMEONE ELSE is reserved to the current team leader; self-promotion
// stays open (the bot hands leadership over only if it is itself leader anyway).
async function handleLeader(client, msg, args) {
  if (!args) {
    await client.promoteToLeaderAsync(msg.steamId);
    return client.sendTeamMessageAsync(`👑 ${msg.name} est promu chef`);
  }
  const info = await client.getTeamInfoAsync();
  if (String(info?.leaderSteamId) !== String(msg.steamId)) {
    return client.sendTeamMessageAsync('❌ Seul le chef peut nommer un autre chef');
  }
  const target = (info?.members ?? []).find(
    (m) => (m.name ?? '').toLowerCase() === args.toLowerCase(),
  );
  if (!target) return client.sendTeamMessageAsync(`❌ Joueur « ${args} » introuvable`);
  await client.promoteToLeaderAsync(target.steamId);
  return client.sendTeamMessageAsync(`👑 ${target.name} est promu chef`);
}

// Answer with the active timer for an event (or "aucun timer actif"). serverId
// comes from the connection (client.serverId) so we read the right server's timers.
function eventHandler(alias) {
  return async (client) => {
    const key = resolveEvent(alias);
    const label = `${eventEmoji(key)} ${eventLabel(key)}`;
    const timer = key ? Timers.getByType(client.serverId, key) : null;
    if (!timer || timer.expires_at <= nowUnix()) {
      return client.sendTeamMessageAsync(`${label} — aucun timer actif`);
    }
    return client.sendTeamMessageAsync(`${label} — dans ${formatCountdown(timer.expires_at)}`);
  };
}

// Smart switch handlers — resolve by label, act, reply. Scope: leader (toggling
// electricity is a significant action; teammates can still use !switch list).
async function handleSwitch(client, msg, args) {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();
  const label = parts.slice(1).join(' ');

  if (!sub || sub === 'list') {
    const rows = Switches.listByServer(client.serverId);
    if (!rows.length) return client.sendTeamMessageAsync('⚡ Aucun switch enregistré — /switch add dans Discord');
    const lines = rows.map((s) => `• ${s.label} (id:${s.entity_id})`).join(', ');
    return client.sendTeamMessageAsync(`⚡ Switches : ${lines}`);
  }

  if (!label) return client.sendTeamMessageAsync(`Usage : !switch <on|off|toggle|list> [label]`);
  const sw = Switches.getByLabel(client.serverId, label);
  if (!sw) return client.sendTeamMessageAsync(`❌ Switch « ${label} » inconnu — !switch list`);

  if (sub === 'on' || sub === 'off') {
    const value = sub === 'on';
    await client.setEntityAsync(sw.entity_id, value);
    return client.sendTeamMessageAsync(`⚡ ${sw.label} → ${value ? '🟢 ON' : '🔴 OFF'}`);
  }
  if (sub === 'toggle') {
    const info = await client.getEntityAsync(sw.entity_id);
    const current = !!info?.payload?.value;
    await client.setEntityAsync(sw.entity_id, !current);
    return client.sendTeamMessageAsync(`⚡ ${sw.label} → ${!current ? '🟢 ON' : '🔴 OFF'}`);
  }
  return client.sendTeamMessageAsync(`Usage : !switch <on|off|toggle|list> [label]`);
}

export function formatHelp() {
  return (
    '📋 Commandes bot : ' +
    '!pop !time !online !offline !alive !prox — infos serveur/équipe | ' +
    '!cargo !heli !small !large — timers events | ' +
    '!switch list/on/off/toggle <label> — smart switches (chef) | ' +
    "!leader [nom] — chef d'equipe (chef) | " +
    '!bot <texte> — message bot (chef)'
  );
}

// ── Dispatch table ──────────────────────────────────────────────────────────────
// Each entry is a SPEC: { handler, cooldownMs, scope }. Handlers receive
// (client, msg, args): `msg` is the AppTeamMessage, `args` the text after the command
// token. Pull-only — each replies via sendTeamMessageAsync.
//   cooldownMs — anti-spam window per command per server (config default; 0 disables).
//   scope      — 'all' (any teammate) | 'leader' (only the current team leader).
function cmd(handler, { cooldownMs = config.rustplus.commandCooldownMs, scope = 'all' } = {}) {
  return { handler, cooldownMs, scope };
}

const COMMANDS = {
  '!pop': cmd(async (client) => client.sendTeamMessageAsync(formatPop(await client.getInfoAsync()))),
  '!time': cmd(async (client) => client.sendTeamMessageAsync(formatTime(await client.getTimeAsync()))),
  '!online': cmd(async (client) => client.sendTeamMessageAsync(formatOnline(await client.getTeamInfoAsync()))),
  '!offline': cmd(async (client) => client.sendTeamMessageAsync(formatOffline(await client.getTeamInfoAsync()))),
  '!alive': cmd(async (client) => client.sendTeamMessageAsync(formatAlive(await client.getTeamInfoAsync()))),
  '!prox': cmd(async (client, msg) => client.sendTeamMessageAsync(formatProx(await client.getTeamInfoAsync(), msg.steamId))),
  // Broadcasting arbitrary text through the bot is leader-only (anti-abuse / anti-spam).
  '!bot': cmd(async (client, msg, args) => client.sendTeamMessageAsync(args || 'Usage : !bot <message>'), { scope: 'leader' }),
  '!leader': cmd(handleLeader),
  // !switch list is open to all; on/off/toggle are leader-only (handled inside the sub-handler).
  '!switch': cmd(handleSwitch),
  '!help': cmd(async (client) => client.sendTeamMessageAsync(formatHelp()), { cooldownMs: 0 }),
};
COMMANDS['!proximity'] = COMMANDS['!prox']; // alias
for (const alias of ['cargo', 'small', 'large', 'heli']) {
  COMMANDS[`!${alias}`] = cmd(eventHandler(alias));
}

// Per-command rate-limit state: `${serverId}|${cmd}` -> last-run epoch ms.
const lastRun = new Map();

// Clear all cooldown windows (used by tests; harmless in prod).
export function resetCooldowns() {
  lastRun.clear();
}

async function isLeader(client, steamId) {
  const info = await client.getTeamInfoAsync();
  return String(info?.leaderSteamId) === String(steamId);
}

// Parse a "!" command: { cmd, args } with cmd lowercased and args = text after the
// first token (trimmed). "!Leader Bob" -> { cmd:'!leader', args:'Bob' }. Non-command -> null.
export function parseCommand(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return null;
  const token = trimmed.split(/\s+/)[0];
  return { cmd: token.toLowerCase(), args: trimmed.slice(token.length).trim() };
}

// Handle one incoming team-chat broadcast (= AppMessage.broadcast.teamMessage).
// `selfSteamId` is our pairing's steam id. Returns the command name handled (for
// logging/tests), or null when the message is ignored — our echo, not a command,
// rate-limited, or refused by the command's permission scope.
export async function handleTeamMessage(teamMessage, client, selfSteamId, { now = Date.now() } = {}) {
  const msg = teamMessage?.message; // AppTeamMessage: { steamId, name, message, color }
  if (!msg || typeof msg.message !== 'string') return null;
  if (selfSteamId && String(msg.steamId) === String(selfSteamId)) return null; // ignore our own echo
  const parsed = parseCommand(msg.message);
  if (!parsed) return null;
  const command = COMMANDS[parsed.cmd];
  if (!command) return null;

  // Anti-spam: one run per command per server within the cooldown window — silently
  // dropped (no reply) so spam can't be amplified. The stamp is set once we commit to
  // acting, so even a permission-refused reply is rate-limited.
  if (command.cooldownMs > 0) {
    const key = `${client.serverId}|${parsed.cmd}`;
    const last = lastRun.get(key);
    if (last != null && now - last < command.cooldownMs) return null;
    lastRun.set(key, now);
  }

  // Permission scope: 'leader' commands only run for the current team leader.
  if (command.scope === 'leader' && !(await isLeader(client, msg.steamId))) {
    await client.sendTeamMessageAsync("❌ Réservé au chef d’équipe");
    return null;
  }

  await command.handler(client, msg, parsed.args);
  return parsed.cmd;
}

// Exposed so Phase 8 can extend the table and tests can introspect it.
export const __commands = COMMANDS;
