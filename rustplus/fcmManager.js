// FCM auto-pairing manager (Phase 7.2) — a process-wide singleton, like rustplus/manager.js.
//
//  - startFcmManager()           : on boot, open one push listener per ACTIVE credential.
//  - syncCredential(id)          : reconcile one listener after /fcm connect|forget (no restart).
//  - stopFcmManager()            : close every listener (wired into index.js shutdown).
//  - handlePairingNotification() : the testable core — parse a "Pair with Server"
//                                  notification, persist the pairing, bring the socket live.
//
// Safe no-op when disabled (RUSTPLUS_ENABLED / FCM_ENABLED = false) or when no credential
// exists. The heavy lifting reuses existing models (Servers/Pairings) and the Rust+
// manager's syncServer(), which is injected into the handler so tests need no live socket.
import * as Fcm from '../backend/models/fcmCredential.js';
import * as Servers from '../backend/models/server.js';
import * as Pairings from '../backend/models/pairing.js';
import { config } from '../config.js';
import { syncServer as defaultSyncServer } from './manager.js';
import { FcmListener } from './fcmListener.js';
import { parsePairingNotification } from './fcmParser.js';

const listeners = new Map(); // credentialId -> FcmListener

// Resolve (or create) the server row for an incoming pairing. A credential registered via
// Discord carries its guild_id → the server is added to / adopted by that guild (default
// logic applies). Without a guild (REST registration) we fall back to an orphan capture
// row, adopted later by /setup. A cross-guild name clash degrades to an orphan, never throws.
function resolveServerForPairing(credential, name) {
  if (credential.guild_id) {
    try {
      return Servers.addServer({ guildId: credential.guild_id, name });
    } catch (err) {
      if (err?.code === 'SERVER_NAME_TAKEN') {
        console.warn(`[fcm] "${name}" already tracked by another guild; capturing as orphan.`);
        return Servers.findOrCreateByName(name);
      }
      throw err;
    }
  }
  return Servers.findOrCreateByName(name);
}

// Core handler. Returns the stored pairing row (for logging/tests), or null when the
// notification is ignored (not a server pairing / malformed). Idempotent: replaying the
// same notification upserts the same server + pairing without creating duplicates.
export function handlePairingNotification(
  notification,
  credential,
  { syncServer = defaultSyncServer } = {},
) {
  const parsed = parsePairingNotification(notification);
  if (!parsed) return null;

  const server = resolveServerForPairing(credential, parsed.name);
  const pairing = Pairings.add({
    serverId: server.id,
    serverIp: parsed.ip,
    appPort: parsed.port,
    steamId: parsed.playerId,
    playerToken: parsed.playerToken,
    label: credential.label ?? null,
  });

  // Bring (or refresh) the live Rust+ socket. Never let a socket hiccup crash the listener.
  try {
    syncServer(server.id);
  } catch (err) {
    console.error(`[fcm] syncServer failed for server #${server.id}:`, err?.message ?? err);
  }

  console.log(`[fcm] auto-paired "${server.name}" (server #${server.id}) via pairing notification.`);
  return pairing;
}

function openListener(credential) {
  if (listeners.has(credential.id)) return listeners.get(credential.id);
  const listener = new FcmListener(credential, (notification) => {
    try {
      handlePairingNotification(notification, credential);
    } catch (err) {
      console.error('[fcm] handler error:', err?.message ?? err);
    }
  });
  listeners.set(credential.id, listener);
  listener
    .start()
    .catch((err) => console.error(`[fcm] listener #${credential.id} failed to start:`, err?.message ?? err));
  return listener;
}

export function startFcmManager() {
  if (!config.rustplus.enabled || !config.rustplus.fcm.enabled) {
    console.log('[fcm] disabled (RUSTPLUS_ENABLED/FCM_ENABLED=false); auto-pairing idle.');
    return;
  }
  const active = Fcm.listActive();
  if (active.length === 0) {
    console.log('[fcm] no credentials registered; auto-pairing idle (run /fcm connect).');
    return;
  }
  for (const credential of active) openListener(credential);
  console.log(`[fcm] manager started with ${listeners.size} listener(s).`);
}

// Bring one credential's listener in line with its current row (called by /fcm connect|forget).
export function syncCredential(credentialId) {
  const existing = listeners.get(credentialId);
  if (existing) {
    existing.stop();
    listeners.delete(credentialId);
  }
  if (!config.rustplus.enabled || !config.rustplus.fcm.enabled) return undefined;
  const credential = Fcm.getById(credentialId);
  return credential && credential.is_active ? openListener(credential) : undefined;
}

export function getListener(credentialId) {
  return listeners.get(credentialId);
}

export function stopFcmManager() {
  for (const l of listeners.values()) l.stop();
  listeners.clear();
}
