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

// ── Dispatch table ──────────────────────────────────────────────────────────────

const COMMANDS = {
  '!pop': async (client) => client.sendTeamMessageAsync(formatPop(await client.getInfoAsync())),
  '!time': async (client) => client.sendTeamMessageAsync(formatTime(await client.getTimeAsync())),
};

// Parse the leading token, lowercased. "!POP extra" -> "!pop". Non-command -> null.
export function parseCommand(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return null;
  return trimmed.split(/\s+/)[0].toLowerCase();
}

// Handle one incoming team-chat broadcast (= AppMessage.broadcast.teamMessage).
// `selfSteamId` is our pairing's steam id. Returns the command name handled (for
// logging/tests), or null when the message is ignored (our echo / not a command).
export async function handleTeamMessage(teamMessage, client, selfSteamId) {
  const msg = teamMessage?.message; // AppTeamMessage: { steamId, name, message, color }
  if (!msg || typeof msg.message !== 'string') return null;
  if (selfSteamId && String(msg.steamId) === String(selfSteamId)) return null; // ignore our own echo
  const cmd = parseCommand(msg.message);
  if (!cmd) return null;
  const handler = COMMANDS[cmd];
  if (!handler) return null;
  await handler(client, msg);
  return cmd;
}

// Exposed so Phase 8 can extend the table and tests can introspect it.
export const __commands = COMMANDS;
