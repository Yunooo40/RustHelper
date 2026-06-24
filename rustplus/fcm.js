// Pure parsing/classification of Rust+ FCM push notifications (Phase 9 — Smart Alarms).
// No socket, no fs — the live receiver (rustplus/fcmListener.js) feeds raw push-receiver
// events here. Kept side-effect-free so the whole module is unit-tested directly with
// fixtures (the live FCM connection is validated at runtime, like the Rust+ socket).
//
// A Rust+ push carries its fields either as @liamcottle/push-receiver `appData`
// ([{ key, value }] on ON_DATA_RECEIVED) or a decrypted `notification` object
// (ON_NOTIFICATION_RECEIVED). Both ultimately expose: channelId ('alarm' | 'pairing' |
// 'team' | 'player' …), title, message, and a `body` JSON string with server details
// (ip, port, name, desc, …). extractData() flattens any of those shapes to one object.

const fromArray = (arr) =>
  Array.isArray(arr)
    ? Object.fromEntries(arr.filter((e) => e && 'key' in e).map((e) => [e.key, e.value]))
    : null;

export function extractData(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  return (
    fromArray(raw.appData) ||
    fromArray(raw.object?.appData) ||
    fromArray(raw.notification?.appData) ||
    obj(raw.notification?.data) ||
    obj(raw.data) ||
    obj(raw.notification) ||
    {}
  );
}

// Normalize a raw push into { kind, title, message, server: { ip, port, name }, raw } or
// null if it carries no channelId. kind ∈ 'alarm' | 'pairing' | 'other'.
export function classifyNotification(raw) {
  const data = extractData(raw);
  const channelId = data.channelId ?? data.channel ?? null;
  if (!channelId) return null;

  let body = {};
  if (typeof data.body === 'string') {
    try {
      body = JSON.parse(data.body);
    } catch {
      body = {};
    }
  } else if (data.body && typeof data.body === 'object') {
    body = data.body;
  }

  const kind = channelId === 'alarm' ? 'alarm' : channelId === 'pairing' ? 'pairing' : 'other';
  return {
    kind,
    title: data.title ?? body.title ?? null,
    message: data.message ?? body.desc ?? body.message ?? null,
    server: {
      ip: body.ip ?? null,
      port: body.port != null ? String(body.port) : null,
      name: body.name ?? null,
    },
    raw: body,
  };
}

// Match a notification's server to a stored pairing → server_id, or null. Prefer an exact
// ip + app_port match, falling back to ip-only (the alarm's port can be the game port
// rather than the companion app port on some servers).
export function matchPairingServerId(server, pairings) {
  if (!server?.ip || !Array.isArray(pairings)) return null;
  const byIp = pairings.filter((p) => String(p.server_ip) === String(server.ip));
  if (!byIp.length) return null;
  const exact = server.port != null && byIp.find((p) => String(p.app_port) === String(server.port));
  return (exact || byIp[0]).server_id;
}
