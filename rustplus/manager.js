// Rust+ connection manager (Phase 7) — a process-wide singleton (like backend/db.js).
//
//  - startManager()  : on boot, open one connection per ACTIVE pairing.
//  - getConnection() : the live Connection for a server (used by /pop /time).
//  - syncServer()    : reconcile one server after /pair or /unpair (no restart needed).
//  - stopManager()   : close every connection (wired into index.js graceful shutdown).
//
// Each open connection also runs a TeamWatcher (Phase 8.4) that polls getTeamInfo to alert
// the channel when a watched player connects/disconnects. (Live event detection — cargo,
// heli, oil rigs — lives inside the Connection's own marker poller, not here.)
//
// Safe no-op when disabled (RUSTPLUS_ENABLED=false) or when no pairing exists — so the
// current deployment is unaffected until the user pairs a server.
import * as Pairings from '../backend/models/pairing.js';
import * as Servers from '../backend/models/server.js';
import * as Watches from '../backend/models/watch.js';
import { bus, WATCH_EVENT } from '../shared/bus.js';
import { config } from '../config.js';
import { Connection } from './connection.js';
import { TeamWatcher } from './teamWatcher.js';

const connections = new Map(); // serverId -> Connection
const watchers = new Map(); // serverId -> TeamWatcher

// Announce a watched player's presence change (Phase 8.4) into the server's channel.
// Injectable emit for unit tests. Returns the emitted payload (or null if no server).
export function announceWatchEvent(serverId, change, { emit = bus.emit.bind(bus) } = {}) {
  const server = Servers.findById(serverId);
  if (!server) return null;
  const payload = {
    serverName: server.name,
    channelId: server.channel_id,
    playerName: change?.name,
    online: !!change?.online,
  };
  emit(WATCH_EVENT, payload);
  return payload;
}

function open(pairing) {
  if (connections.has(pairing.server_id)) return connections.get(pairing.server_id);
  const conn = new Connection(pairing);
  connections.set(pairing.server_id, conn);
  conn.start();
  const watcher = new TeamWatcher(conn, {
    intervalMs: config.rustplus.poll.intervalMs,
    getWatched: () => Watches.listByServer(pairing.server_id).map((w) => w.steam_id),
    onChange: (change) => announceWatchEvent(pairing.server_id, change),
  });
  watchers.set(pairing.server_id, watcher);
  watcher.start();
  return conn;
}

export function startManager() {
  if (!config.rustplus.enabled) {
    console.log('[rustplus] disabled (RUSTPLUS_ENABLED=false); manager idle.');
    return;
  }
  const active = Pairings.listActive();
  if (active.length === 0) {
    console.log('[rustplus] no pairings configured; manager idle (run /pair to connect).');
    return;
  }
  for (const pairing of active) open(pairing);
  console.log(`[rustplus] manager started with ${connections.size} connection(s).`);
}

// Bring one server's connection in line with its current active pairing. Called by the
// /pair (connect/refresh) and /unpair (disconnect) commands so changes take effect live.
export function syncServer(serverId) {
  const existing = connections.get(serverId);
  if (existing) {
    existing.stop();
    connections.delete(serverId);
  }
  const watcher = watchers.get(serverId);
  if (watcher) {
    watcher.stop();
    watchers.delete(serverId);
  }
  if (!config.rustplus.enabled) return undefined;
  const active = Pairings.getActiveForServer(serverId);
  return active ? open(active) : undefined;
}

export function getConnection(serverId) {
  return connections.get(serverId);
}

export function stopManager() {
  for (const watcher of watchers.values()) watcher.stop();
  watchers.clear();
  for (const conn of connections.values()) conn.stop();
  connections.clear();
}
