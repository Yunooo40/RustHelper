// Pure presence-diff logic (Phase 8.4). Given the team members from a Rust+
// getTeamInfo response and the set of watched steam ids, detect which watched players
// changed online status since the previous poll. No socket, no DB — unit-testable.

// Diff fresh team members against the online state seen last poll, restricted to the
// watched steam ids. Returns:
//   online  — Map<steamId, boolean> for watched players present in this teamInfo
//             (feed back in next call as `prevOnline`)
//   changes — [{ steamId, name, online }] for watched players whose status flipped
//
// `prevOnline` is null/undefined on the first poll: we record state but report no
// changes, so adding a watch (or connecting) doesn't fire a spurious alert for a
// status that was already true.
export function detectStatusChanges(prevOnline, members, watchedIds) {
  const online = new Map();
  const changes = [];
  const seeding = prevOnline == null;
  const watched = watchedIds instanceof Set ? watchedIds : new Set((watchedIds ?? []).map(String));
  for (const m of members ?? []) {
    const id = String(m.steamId);
    if (!watched.has(id)) continue;
    const isOnline = !!m.isOnline;
    online.set(id, isOnline);
    if (!seeding && prevOnline.get(id) !== undefined && prevOnline.get(id) !== isOnline) {
      changes.push({ steamId: id, name: m.name ?? id, online: isOnline });
    }
  }
  return { online, changes };
}
