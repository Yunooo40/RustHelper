// Live event detection from Rust+ map markers (Phase 8.2/8.3). Pure & side-effect-free:
// given the previous and current marker snapshots, decide which Rust events to announce.
// No socket, no DB — driven by rustplus/connection.js, and unit-tested directly.
//
// Rust+ exposes getMapMarkers → AppMapMarkers.markers[], each an AppMarker with a stable
// `id` and a `type` (AppMarker.Type enum). We track a handful of types, diff by id between
// polls, and emit events — so the bot announces Cargo / Heli / Chinook spawns, plus Heli /
// Bradley *destructions* (loot drops), with NO Oxide plugin, on ANY server.

// AppMarker.Type values mapped 1:1 to our event keys (shared/events.js). Explosion is
// handled separately (heli-vs-bradley, below) because it isn't a simple spawn/left.
// Player(1), VendingMachine(3), Crate(6) and GenericRadius(7) are intentionally ignored.
export const MARKER_EVENT = {
  4: 'chinook', // CH47
  5: 'cargo', // CargoShip
  8: 'helicopter', // PatrolHelicopter
};
const EXPLOSION = 2; // AppMarker.Type.Explosion — a downed Patrol Heli or Bradley APC

// protobufjs decodes enum fields as numbers, but be defensive and also accept the
// canonical string names in case a lib/version returns them.
const TYPE_BY_NAME = { Explosion: 2, CH47: 4, CargoShip: 5, PatrolHelicopter: 8 };
const typeNum = (t) => (typeof t === 'number' ? t : TYPE_BY_NAME[t]);

// Marker types that LINGER on the map, so their disappearance is a meaningful "left"
// (Cargo sails off, Heli leaves). CH47 only passes through to drop its crate, so we
// announce its arrival but never its departure.
const EMIT_LEFT = new Set(['cargo', 'helicopter']);

const isExplosion = (m) => typeNum(m?.type) === EXPLOSION;
const eventFor = (m) => MARKER_EVENT[typeNum(m?.type)];
const tracked = (m) => Boolean(eventFor(m)) || isExplosion(m);
const interesting = (markers) => (Array.isArray(markers) ? markers : []).filter(tracked);

// Diff two marker snapshots → a flat list of events to announce:
//   [{ eventType, status: 'spawned' | 'left' | 'destroyed', marker }]
// Keyed by `${type}:${id}` so an id reused across marker types can't collide.
export function diffMarkers(prev, next) {
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
    } else {
      events.push({ eventType: eventFor(m), status: 'spawned', marker: m });
    }
  }

  for (const m of vanished) {
    const eventType = eventFor(m);
    if (!EMIT_LEFT.has(eventType)) continue; // CH47: arrival only
    if (eventType === 'helicopter' && explosionAppeared) continue; // destroyed, not "left"
    events.push({ eventType, status: 'left', marker: m });
  }

  return events;
}

export default diffMarkers;
