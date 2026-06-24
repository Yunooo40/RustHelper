// Diagnostics helpers (Phase 10). Pure & side-effect-free: summarize raw Rust+ / FCM
// payloads so a single live session confirms (or corrects) the assumptions the marker,
// grid, oil-rig and FCM code is built on. No socket, no DB — unit-tested directly.
import { worldToGrid } from './grid.js';
import { extractData } from './fcm.js';

// Keys whose values are secrets (Rust+ player tokens, FCM security tokens…). Masked before
// anything is logged or dumped. Compared case-insensitively.
const SECRET_KEYS = new Set([
  'playertoken', 'player_token', 'token', 'securitytoken', 'security_token',
  'authtoken', 'auth_token', 'rustplus_auth_token', 'salt', 'secret', 'crypto-key',
]);

// Deep-clone with secret-looking values masked. Safe to log/attach the result.
export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? '***redacted***' : redactSecrets(v);
    }
    return out;
  }
  return value;
}

// A safe-to-log view of a raw FCM push: flatten it, parse the JSON `body` (so its fields are
// visible AND reachable by the redactor — a stringified body would hide a playerToken from
// masking), then redact secrets. Used by the FCM diag logging.
export function safePushView(raw) {
  const data = { ...extractData(raw) };
  if (typeof data.body === 'string') {
    try {
      data.body = JSON.parse(data.body);
    } catch {
      /* not JSON — leave the string as-is */
    }
  }
  return redactSecrets(data);
}

// Distinct marker types present (+ one sample each, with its computed grid ref) so a live
// capture confirms the AppMarker.Type enum values AND the grid formula at once.
export function summarizeMarkers(markers, mapSize) {
  const list = Array.isArray(markers) ? markers : [];
  const byType = {};
  for (const m of list) {
    const key = String(m?.type);
    if (!byType[key]) {
      byType[key] = {
        type: m?.type,
        count: 0,
        sample: { id: m?.id, type: m?.type, x: m?.x, y: m?.y, grid: worldToGrid(m?.x, m?.y, mapSize) },
      };
    }
    byType[key].count += 1;
  }
  return { total: list.length, types: [...new Set(list.map((m) => m?.type))], byType };
}

// Monuments with the oil-rig-ish ones flagged (token contains oil + rig) — confirms the
// real monument tokens the oil rig crate detection relies on.
export function summarizeMonuments(map) {
  const monuments = (map?.monuments ?? []).map((mo) => ({
    token: mo?.token,
    x: mo?.x,
    y: mo?.y,
    oilRig: /oil/i.test(mo?.token ?? '') && /rig/i.test(mo?.token ?? ''),
  }));
  return {
    count: monuments.length,
    oilRigs: monuments.filter((m) => m.oilRig),
    tokens: monuments.map((m) => m.token),
  };
}

// Full diagnostics bundle for /diag: server (name + mapSize for grid), markers and monuments.
export function buildDiagnostics({ info, map, markers } = {}) {
  const mapSize = info?.mapSize ?? null;
  return {
    capturedAt: new Date().toISOString(),
    server: {
      name: info?.name ?? null,
      mapSize,
      players: info?.players ?? null,
      maxPlayers: info?.maxPlayers ?? null,
    },
    markers: summarizeMarkers(markers, mapSize),
    monuments: summarizeMonuments(map),
  };
}
