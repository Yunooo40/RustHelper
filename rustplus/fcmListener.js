// FCM Smart Alarm listener (Phase 9). Connects to Google's push service with the account's
// FCM credentials and forwards Rust+ Smart Alarm pushes to Discord via the bus.
//
// This is the integration layer (like rustplus/connection.js): the pure parsing/matching
// lives in rustplus/fcm.js and is unit-tested; the live receiver is validated at runtime.
// SAFE NO-OP: with no credentials configured it does nothing, so the current deployment is
// unaffected until the operator runs `npx @liamcottle/rustplus.js fcm-register` and sets
// RUSTPLUS_FCM_CREDENTIALS — exactly like the Rust+ manager is idle until a server is paired.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { config } from '../config.js';
import { classifyNotification, matchPairingServerId } from './fcm.js';
import { safePushView } from './diag.js';
import * as Servers from '../backend/models/server.js';
import * as Pairings from '../backend/models/pairing.js';
import { bus, ALARM_EVENT } from '../shared/bus.js';

// @liamcottle/push-receiver is CommonJS and exposes the raw client only via a deep path —
// the same one @liamcottle/rustplus.js's own CLI imports.
const require = createRequire(import.meta.url);

let client = null;

// Read the JSON written by `fcm-register` and pull out the GCM keys. Accept either the full
// rustplus CLI config ({ fcm_credentials: { gcm } }) or a bare credentials object ({ gcm }).
function loadGcmKeys(path) {
  const json = JSON.parse(fs.readFileSync(path, 'utf8'));
  const gcm = json.fcm_credentials?.gcm ?? json.gcm;
  if (!gcm?.androidId || !gcm?.securityToken) {
    throw new Error('missing gcm.androidId / gcm.securityToken — re-run `fcm-register`');
  }
  return gcm;
}

// Resolve which tracked server + channel an alarm belongs to, then emit for the bot.
// Exported so it can be unit-tested with the bus without a live FCM socket.
export function handleNotification(raw) {
  if (config.rustplus.diag) {
    console.log('[fcm][diag] push received:', JSON.stringify(safePushView(raw)));
  }
  const note = classifyNotification(raw);
  if (!note || note.kind !== 'alarm') return null; // only Smart Alarms reach Discord

  let server = null;
  const serverId = matchPairingServerId(note.server, Pairings.listActive());
  if (serverId) server = Servers.findById(serverId);
  if (!server && note.server.name) server = Servers.findByName(note.server.name);

  bus.emit(ALARM_EVENT, {
    serverName: server?.name ?? note.server.name ?? 'Rust server',
    channelId: server?.channel_id ?? null,
    title: note.title,
    message: note.message,
  });
  return note;
}

export function startFcmListener() {
  if (client) return client;
  const { enabled, credentialsPath } = config.rustplus.fcm;
  if (!enabled || !credentialsPath) {
    console.log('[fcm] no credentials configured; Smart Alarm listener idle (set RUSTPLUS_FCM_CREDENTIALS).');
    return null;
  }

  let gcm;
  try {
    gcm = loadGcmKeys(credentialsPath);
  } catch (err) {
    console.error('[fcm] failed to load credentials:', err?.message ?? err);
    return null;
  }

  const PushReceiverClient = require('@liamcottle/push-receiver/src/client');
  client = new PushReceiverClient(gcm.androidId, gcm.securityToken, []);
  const onPush = (raw) => {
    try {
      handleNotification(raw);
    } catch (err) {
      console.error('[fcm] notification handler error:', err?.message ?? err);
    }
  };
  // Unencrypted pushes arrive on ON_DATA_RECEIVED, encrypted ones on ON_NOTIFICATION_RECEIVED;
  // classifyNotification tolerates both shapes, so we listen to both.
  client.on('ON_DATA_RECEIVED', onPush);
  client.on('ON_NOTIFICATION_RECEIVED', onPush);
  client.connect().catch((err) => console.error('[fcm] connect failed:', err?.message ?? err));
  console.log('[fcm] Smart Alarm listener started.');
  return client;
}

export function stopFcmListener() {
  if (!client) return;
  try {
    client.destroy();
  } catch {
    /* best-effort; the process is exiting anyway */
  }
  client = null;
}
