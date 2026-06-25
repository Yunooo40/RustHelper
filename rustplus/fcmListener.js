// One live FCM push listener (Phase 7.2). Thin I/O wrapper around push-receiver's Client:
// connects with a credential's (androidId, securityToken) and forwards every incoming
// notification to a callback. Pure parsing/persistence lives in fcmParser.js / fcmManager.js
// so this module stays trivial and is validated by hand at pairing time (like connection.js
// and the Oxide plugin) — tests never open a real socket.
//
// We listen on BOTH events: push-receiver 0.0.3 emits unencrypted payloads via
// 'ON_DATA_RECEIVED' (the raw DataMessageStanza object), while the decrypted path uses
// 'ON_NOTIFICATION_RECEIVED' ({ notification, ... }). The parser tolerates either shape;
// double-delivery is harmless because auto-pairing is idempotent.
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';

export class FcmListener {
  constructor(credential, onNotification) {
    this.credential = credential;
    this.onNotification = onNotification; // (notification) => void
    this.client = null;
    this.stopped = false;
  }

  async start() {
    this.stopped = false;
    const client = new PushReceiverClient(
      this.credential.android_id,
      this.credential.security_token,
      [], // persistentIds: start fresh; replays are idempotent so we don't persist them
    );
    this.client = client;

    const forward = (payload) => {
      if (this.stopped) return;
      // ON_DATA_RECEIVED → raw object; ON_NOTIFICATION_RECEIVED → { notification, ... }.
      const notification = payload?.notification ?? payload;
      try {
        this.onNotification(notification);
      } catch (err) {
        console.error('[fcm] notification handler error:', err?.message ?? err);
      }
    };

    client.on('ON_DATA_RECEIVED', forward);
    client.on('ON_NOTIFICATION_RECEIVED', forward);
    client.on('connect', () => console.log(`[fcm] listener connected (credential #${this.credential.id})`));

    await client.connect();
  }

  stop() {
    this.stopped = true;
    try {
      this.client?.destroy?.();
    } catch {
      /* already gone */
    }
    this.client = null;
  }
}

export default FcmListener;
