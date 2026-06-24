// Live event detection from Rust+ map markers (Phase 8.2). Pure & side-effect-free:
// given the previous and current marker snapshots, decide which Rust events to announce.
// No socket, no DB — driven by rustplus/connection.js, and unit-tested directly.
//
// Rust+ exposes getMapMarkers → AppMapMarkers.markers[], each an AppMarker with a stable
// `id` and a `type` (AppMarker.Type enum). We track a handful of types, diff by id between
// polls, and emit "spawned" when a marker appears / "left" when it disappears — so the bot
// announces Cargo / Heli / Chinook with NO Oxide plugin, on ANY server.

// AppMarker.Type values we map to our event keys (shared/events.js). Player(1),
// Explosion(2), VendingMachine(3), Crate(6) and GenericRadius(7) are intentionally
// ignored — too noisy / not a "server event" worth a notification.
export const MARKER_EVENT = {
  4: 'chinook', // CH47
  5: 'cargo', // CargoShip
  8: 'helicopter', // PatrolHelicopter
};

// protobufjs decodes enum fields as numbers, but be defensive and also accept the
// canonical string names in case a lib/version returns them.
const TYPE_BY_NAME = { CH47: 4, CargoShip: 5, PatrolHelicopter: 8 };
const typeNum = (t) => (typeof t === 'number' ? t : TYPE_BY_NAME[t]);

// Marker types that LINGER on the map, so their disappearance is a meaningful "left"
// (Cargo sails off, Heli leaves or is destroyed). CH47 only passes through to drop its
// crate, so we announce its arrival but never its departure.
const EMIT_LEFT = new Set(['cargo', 'helicopter']);

const eventFor = (marker) => MARKER_EVENT[typeNum(marker?.type)];
const interesting = (markers) => (Array.isArray(markers) ? markers : []).filter(eventFor);

// Diff two marker snapshots. Returns the events to announce:
//   { spawned: [{ eventType, marker }], left: [{ eventType, marker }] }
// Keyed by `${type}:${id}` so an id reused across marker types can't collide.
export function diffMarkers(prev, next) {
  const key = (m) => `${typeNum(m.type)}:${m.id}`;
  const prevMap = new Map(interesting(prev).map((m) => [key(m), m]));
  const nextMap = new Map(interesting(next).map((m) => [key(m), m]));

  const spawned = [];
  for (const [k, m] of nextMap) {
    if (!prevMap.has(k)) spawned.push({ eventType: eventFor(m), marker: m });
  }

  const left = [];
  for (const [k, m] of prevMap) {
    const eventType = eventFor(m);
    if (!nextMap.has(k) && EMIT_LEFT.has(eventType)) left.push({ eventType, marker: m });
  }

  return { spawned, left };
}

export default diffMarkers;
