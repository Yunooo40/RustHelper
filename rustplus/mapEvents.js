// Pure map-marker logic (Phase 8.2). Given the markers from a Rust+ getMapMarkers
// response, decide which ones are trackable events and detect the ones that just
// APPEARED since the previous poll. No socket, no DB, no timers — fully unit-testable.
//
// AppMarker.type is an AppMarkerType enum (rustplus.proto):
//   1 Player · 2 Explosion · 3 VendingMachine · 4 CH47 · 5 CargoShip
//   6 Crate · 7 GenericRadius · 8 PatrolHelicopter
// We only announce the handful that map cleanly onto our event catalog — players,
// explosions, vending machines and generic radii are noise for our purposes.

// AppMarkerType -> canonical event key (see shared/events.js).
export const MARKER_EVENT = {
  4: 'chinook', // CH47
  5: 'cargo', // CargoShip
  8: 'helicopter', // PatrolHelicopter
};

// The event key for a marker, or null if it's not a marker we announce.
export function classifyMarker(marker) {
  if (!marker || marker.type == null) return null;
  return MARKER_EVENT[marker.type] ?? null;
}

// Diff a fresh markers array against the set of tracked marker ids seen last poll.
// Returns:
//   ids      — the Set of tracked marker ids present NOW (feed back in next call)
//   appeared — [{ id, eventType, marker }] for tracked markers not seen last time
//
// `prevIds` is null/undefined on the very first poll: we still compute `ids` but
// report no `appeared`, so connecting to a server with cargo already up doesn't
// spam a "spawned" notification for something that's been there for an hour.
export function detectAppeared(prevIds, markers) {
  const ids = new Set();
  const appeared = [];
  const seeding = prevIds == null;
  for (const marker of markers ?? []) {
    const eventType = classifyMarker(marker);
    if (!eventType) continue;
    const id = marker.id;
    ids.add(id);
    if (!seeding && !prevIds.has(id)) appeared.push({ id, eventType, marker });
  }
  return { ids, appeared };
}
