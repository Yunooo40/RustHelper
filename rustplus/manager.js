// Rust+ connection manager (Phase 7) — a process-wide singleton (like backend/db.js).
//
//  - startManager()  : on boot, open one connection per ACTIVE pairing.
//  - getConnection() : the live Connection for a server (used by /pop /time).
//  - syncServer()    : reconcile one server after /pair or /unpair (no restart needed).
//  - stopManager()   : close every connection (wired into index.js graceful shutdown).
//
// Safe no-op when disabled (RUSTPLUS_ENABLED=false) or when no pairing exists — so the
// current deployment is unaffected until the user pairs a server.
import * as Pairings from '../backend/models/pairing.js';
import * as Servers from '../backend/models/server.js';
import * as Events from '../backend/models/event.js';
import * as Watches from '../backend/models/watch.js';
import { bus, RUST_EVENT, WATCH_EVENT } from '../shared/bus.js';
import { nowUnix } from '../shared/time.js';
import { config } from '../config.js';
import { Connection } from './connection.js';
import { MarkerPoller } from './poller.js';
import { TeamWatcher } from './teamWatcher.js';

const connections = new Map(); // serverId -> Connection
const pollers = new Map(); // serverId -> MarkerPoller
const watchers = new Map(); // serverId -> TeamWatcher

// Log + announce a map-marker event (cargo / heli / chinook appearing) for one server.
// Mirrors the webhook route's notification path so these flow through the same embed.
// Exported (with an injectable emit) so it's unit-testable without a live bot/socket.
export function announceMapEvent(serverId, eventType, marker, { emit = bus.emit.bind(bus) } = {}) {
  const server = Servers.findById(serverId);
  if (!server) return null;
  const spawnTime = nowUnix();
  Events.insert({
    serverId,
    eventType,
    status: 'spawned',
    spawnTime,
    nextRespawn: null,
    payload: { source: 'rustplus', markerId: marker?.id },
  });
  const payload = {
    serverName: server.name,
    channelId: server.channel_id,
    eventType,
    status: 'spawned',
    spawnTime,
    nextRespawn: null,
    source: 'rustplus',
  };
  emit(RUST_EVENT, payload);
  return payload;
}

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
  if (config.rustplus.poll.enabled) {
    const poller = new MarkerPoller(conn, {
      intervalMs: config.rustplus.poll.intervalMs,
      onEvent: (eventType, marker) => announceMapEvent(pairing.server_id, eventType, marker),
    });
    pollers.set(pairing.server_id, poller);
    poller.start();
    const watcher = new TeamWatcher(conn, {
      intervalMs: config.rustplus.poll.intervalMs,
      getWatched: () => Watches.listByServer(pairing.server_id).map((w) => w.steam_id),
      onChange: (change) => announceWatchEvent(pairing.server_id, change),
    });
    watchers.set(pairing.server_id, watcher);
    watcher.start();
  }
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
  const poller = pollers.get(serverId);
  if (poller) {
    poller.stop();
    pollers.delete(serverId);
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
  for (const poller of pollers.values()) poller.stop();
  pollers.clear();
  for (const watcher of watchers.values()) watcher.stop();
  watchers.clear();
  for (const conn of connections.values()) conn.stop();
  connections.clear();
}
