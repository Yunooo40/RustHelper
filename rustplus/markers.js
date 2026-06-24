// Live event detection from Rust+ map markers (Phase 8.2/8.3/8.4). Pure & side-effect-free:
// given the previous and current marker snapshots (and the server's oil rig positions),
// decide which Rust events to announce. No socket, no DB — driven by rustplus/connection.js,
// and unit-tested directly.
//
// Rust+ exposes getMapMarkers → AppMapMarkers.markers[], each an AppMarker with a stable
// `id` and a `type` (AppMarker.Type enum). We track a handful of types, diff by id between
// polls, and emit events — so the bot announces Cargo / Heli / Chinook spawns, Heli / Bradley
// *destructions*, and locked-crate spawns at the *Oil Rigs*, with NO Oxide plugin, on ANY
// server.

// AppMarker.Type values mapped 1:1 to our event keys (shared/events.js). Explosion and Crate
// are handled specially below (they aren't a simple spawn/left). Player(1), VendingMachine(3)
// and GenericRadius(7) are intentionally ignored.
export const MARKER_EVENT = {
  4: 'chinook', // CH47
  5: 'cargo', // CargoShip
  8: 'helicopter', // PatrolHelicopter
};
const EXPLOSION = 2; // AppMarker.Type.Explosion — a downed Patrol Heli or Bradley APC
const CRATE = 6; // AppMarker.Type.Crate — a locked hackable crate (Oil Rig / CH47 drop / Cargo)

// A locked crate within this many metres of an oil rig monument is treated as THAT rig's
// crate (oil rigs sit isolated at sea, so there's no nearby monument to confuse it with).
const OIL_RIG_RADIUS = 100;

// protobufjs decodes enum fields as numbers, but be defensive and also accept the
// canonical string names in case a lib/version returns them.
const TYPE_BY_NAME = { Explosion: 2, CH47: 4, CargoShip: 5, Crate: 6, PatrolHelicopter: 8 };
const typeNum = (t) => (typeof t === 'number' ? t : TYPE_BY_NAME[t]);

// Marker types that LINGER on the map, so their disappearance is a meaningful "left"
// (Cargo sails off, Heli leaves). CH47 only passes through to drop its crate, so we
// announce its arrival but never its departure.
const EMIT_LEFT = new Set(['cargo', 'helicopter']);

const isExplosion = (m) => typeNum(m?.type) === EXPLOSION;
const isCrate = (m) => typeNum(m?.type) === CRATE;
const eventFor = (m) => MARKER_EVENT[typeNum(m?.type)];
const tracked = (m) => Boolean(eventFor(m)) || isExplosion(m) || isCrate(m);
const interesting = (markers) => (Array.isArray(markers) ? markers : []).filter(tracked);

// Pull the oil rig monuments out of an AppMap (getMap). Tokens are matched leniently
// (contains "oil" + "rig") to survive token drift; "large" picks the large rig, else small.
// Returns [{ eventType, x, y, token }] — fed back into diffMarkers() to place crates.
export function oilRigsFromMap(map) {
  const rigs = [];
  for (const mo of map?.monuments ?? []) {
    const token = String(mo?.token ?? '').toLowerCase();
    if (!token.includes('oil') || !token.includes('rig')) continue;
    rigs.push({
      eventType: token.includes('large') ? 'oil_rig_large' : 'oil_rig_small',
      x: mo.x,
      y: mo.y,
      token: mo.token,
    });
  }
  return rigs;
}

// The oil rig whose monument is within OIL_RIG_RADIUS of a crate marker (closest wins),
// or null when the crate is elsewhere (a Cargo / CH47 drop crate) — those we ignore.
function nearestOilRig(marker, oilRigs) {
  let best = null;
  let bestDist = OIL_RIG_RADIUS;
  for (const rig of oilRigs) {
    const d = Math.hypot(marker.x - rig.x, marker.y - rig.y);
    if (d <= bestDist) {
      best = rig;
      bestDist = d;
    }
  }
  return best;
}

// Diff two marker snapshots → a flat list of events to announce:
//   [{ eventType, status: 'spawned' | 'left' | 'destroyed', marker }]
// Keyed by `${type}:${id}` so an id reused across marker types can't collide. `oilRigs`
// (from oilRigsFromMap) lets us attribute locked-crate spawns to a rig; without it, crates
// are simply ignored.
export function diffMarkers(prev, next, oilRigs = []) {
  const key = (m) => `${typeNum(m.type)}:${m.id}`;
  const prevMap = new Map(interesting(prev).map((m) => [key(m), m]));
  const nextMap = new Map(interesting(next).map((m) => [key(m), m]));

  const appeared = [...nextMap].filter(([k]) => !prevMap.has(k)).map(([, m]) => m);
  const vanished = [...prevMap].filter(([k]) => !nextMap.has(k)).map(([, m]) => m);

  // A heli explodes when it's shot down; it just vanishes (no explosion) when it flies
  // off the map. We use that pairing to classify explosions and to suppress the duplicate
  // "left" of a heli that was actually destroyed.
  const heliVanished = vanished.some((m) => eventFor(m) === 'helicopter');
  const explosionAppeared = appeared.some(isExplosion);

  const events = [];

  for (const m of appeared) {
    if (isExplosion(m)) {
      // An explosion marker is a downed Patrol Heli or Bradley APC (both drop loot crates).
      // The marker alone doesn't say which, so: a heli vanishing this same poll means the
      // heli went down; otherwise it's the Bradley. Heuristic — verify on a live server.
      events.push({ eventType: heliVanished ? 'helicopter' : 'bradley', status: 'destroyed', marker: m });
    } else if (isCrate(m)) {
      // A locked crate that spawned ON an oil rig = that rig's crate is up. Crates elsewhere
      // (Cargo / CH47 drops) are too noisy to attribute, so we drop them.
      const rig = nearestOilRig(m, oilRigs);
      if (rig) events.push({ eventType: rig.eventType, status: 'spawned', marker: m });
    } else {
      events.push({ eventType: eventFor(m), status: 'spawned', marker: m });
    }
  }

  for (const m of vanished) {
    const eventType = eventFor(m);
    if (!EMIT_LEFT.has(eventType)) continue; // CH47 / crate: arrival only
    if (eventType === 'helicopter' && explosionAppeared) continue; // destroyed, not "left"
    events.push({ eventType, status: 'left', marker: m });
  }

  return events;
}

export default diffMarkers;
