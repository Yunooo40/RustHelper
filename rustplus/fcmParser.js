// Pure parser for Rust+ FCM pairing notifications (Phase 7.2). No I/O — given a
// notification object (whatever shape push-receiver hands us), return the server
// connection details, or null when it isn't a usable *server* pairing.
//
// Shape notes (@liamcottle/push-receiver): the pairing payload is a JSON string carried
// either in `appData` (array of {key,value}, the 0.0.3 ON_DATA_RECEIVED path) or under
// `data.body` / `body` (decrypted ON_NOTIFICATION_RECEIVED path, and other forks). The
// decoded body looks like:
//   { img, port, ip, name, id, type:'server', url, desc, playerId, playerToken }
// Smart-switch/alarm pairings use type !== 'server' and are ignored here (Phase 7.2 is
// server pairings only). We never throw: malformed input → null, so the listener callback
// can't crash the process.

// Find the raw JSON body string inside any of the known notification shapes.
function extractBodyString(notification) {
  if (!notification || typeof notification !== 'object') return null;

  // 1) push-receiver 0.0.3: object.appData = [{ key, value }, ...] with a 'body' entry.
  if (Array.isArray(notification.appData)) {
    const entry = notification.appData.find((e) => e?.key === 'body');
    if (entry && typeof entry.value === 'string') return entry.value;
  }
  // 2) decrypted message: data.body is the JSON string.
  if (typeof notification.data?.body === 'string') return notification.data.body;
  // 3) some forks put it directly on body.
  if (typeof notification.body === 'string') return notification.body;
  return null;
}

// Resolve the decoded body object from a notification (parsing JSON if needed). Accepts an
// already-decoded object too (e.g. the README "Example Output" flat shape, or test input).
function resolveBody(notification) {
  const str = extractBodyString(notification);
  if (str != null) {
    try {
      return JSON.parse(str);
    } catch {
      return null; // malformed JSON → not usable
    }
  }
  // Already-decoded body passed straight in (has the fields we care about).
  if (notification && typeof notification === 'object' && 'playerToken' in notification) {
    return notification;
  }
  if (typeof notification?.data === 'object' && notification.data && 'playerToken' in notification.data) {
    return notification.data;
  }
  return null;
}

// Parse a pairing notification → { name, ip, port, playerId, playerToken } | null.
// Returns null for non-server pairings (smart devices) and anything missing a required
// connection field. `port` is normalised to a Number; the rest are returned as strings.
export function parsePairingNotification(notification) {
  const body = resolveBody(notification);
  if (!body || typeof body !== 'object') return null;
  if (body.type !== 'server') return null; // ignore entity/alarm pairings in Phase 7.2

  const ip = body.ip;
  const port = Number(body.port);
  const playerId = body.playerId != null ? String(body.playerId) : null;
  const playerToken = body.playerToken != null ? String(body.playerToken) : null;
  const name = body.name != null ? String(body.name) : null;

  if (!ip || !Number.isFinite(port) || !playerId || !playerToken || !name) return null;
  return { name, ip: String(ip), port, playerId, playerToken };
}

export default parsePairingNotification;
