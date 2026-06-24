// Team-state tracker (Phase 8.2). Polls getTeamInfo on a loop (driven by Connection),
// diffs consecutive snapshots, and announces team changes to Discord via the bus.
//
// The diff core (diffMembers, computeAfk) is PURE — no socket, no DB, no bus — so it is
// unit-tested directly. The TeamTracker class (Task 3) wires it to the bus + opt-in.
const memberMap = (members) => new Map((members ?? []).map((m) => [String(m.steamId), m]));
const lite = (m) => ({ steamId: String(m.steamId), name: m.name });

// Compare two member snapshots.
//   joined : online now, absent or offline before
//   left   : online before, absent or offline now
//   died   : present in both, online now, isAlive true→false
export function diffMembers(prev, curr) {
  const p = memberMap(prev);
  const c = memberMap(curr);
  const joined = [];
  const left = [];
  const died = [];
  for (const [id, m] of c) {
    const before = p.get(id);
    if (m.isOnline && (!before || !before.isOnline)) joined.push(lite(m));
    if (m.isOnline && before && before.isAlive === true && m.isAlive === false) died.push(lite(m));
  }
  for (const [id, m] of p) {
    const now = c.get(id);
    if (m.isOnline && (!now || !now.isOnline)) left.push(lite(m));
  }
  return { joined, left, died };
}

// Update AFK position state and detect transitions. `posState` is a
// Map<steamId, { x, y, since, afk }>. Returns the next posState plus transition lists.
//   nowAfk   : crossed the immobile threshold this tick (weren't flagged AFK before)
//   returned : were flagged AFK and moved (> epsilon) this tick
export function computeAfk(posState, members, now, { thresholdMs, epsilon }) {
  const next = new Map();
  const nowAfk = [];
  const returned = [];
  for (const m of members ?? []) {
    if (!m.isOnline) continue; // offline members drop out of the state
    const id = String(m.steamId);
    const prev = posState.get(id);
    if (!prev) {
      next.set(id, { x: m.x, y: m.y, since: now, afk: false });
      continue;
    }
    const moved = Math.hypot(m.x - prev.x, m.y - prev.y) > epsilon;
    if (moved) {
      if (prev.afk) returned.push(lite(m));
      next.set(id, { x: m.x, y: m.y, since: now, afk: false });
    } else {
      const isAfk = now - prev.since >= thresholdMs;
      if (isAfk && !prev.afk) nowAfk.push(lite(m));
      next.set(id, { x: prev.x, y: prev.y, since: prev.since, afk: isAfk });
    }
  }
  return { posState: next, nowAfk, returned };
}
