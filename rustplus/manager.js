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
import { config } from '../config.js';
import { Connection } from './connection.js';

const connections = new Map(); // serverId -> Connection

function open(pairing) {
  if (connections.has(pairing.server_id)) return connections.get(pairing.server_id);
  const conn = new Connection(pairing);
  connections.set(pairing.server_id, conn);
  conn.start();
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
  if (!config.rustplus.enabled) return undefined;
  const active = Pairings.getActiveForServer(serverId);
  return active ? open(active) : undefined;
}

export function getConnection(serverId) {
  return connections.get(serverId);
}

export function stopManager() {
  for (const conn of connections.values()) conn.stop();
  connections.clear();
}
