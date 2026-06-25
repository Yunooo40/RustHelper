// Team-state tracker (Phase 8.2). Polls getTeamInfo on a loop (driven by Connection),
// diffs consecutive snapshots, and announces team changes to Discord via the bus.
//
// The diff core (diffMembers, computeAfk) is PURE — no socket, no DB, no bus — so it is
// unit-tested directly. The TeamTracker class wires it to the bus + per-server opt-in.
import { bus, TEAM_EVENT } from '../shared/bus.js';
import { config } from '../config.js';
import * as Servers from '../backend/models/server.js';

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

export class TeamTracker {
  constructor(serverId) {
    this.serverId = serverId;
    this.primed = false;
    this.lastMembers = [];
    this.posState = new Map();
  }

  reset() {
    this.primed = false;
    this.lastMembers = [];
    this.posState = new Map();
  }

  // Feed one getTeamInfo result. The first call after (re)connect only primes the
  // baseline (emits nothing) so the whole team isn't announced as "joined".
  update(teamInfo, now) {
    const members = teamInfo?.members ?? [];
    const opts = { thresholdMs: config.rustplus.poll.afkThresholdMs, epsilon: config.rustplus.poll.afkEpsilon };

    if (!this.primed) {
      this.lastMembers = members;
      this.posState = computeAfk(new Map(), members, now, opts).posState;
      this.primed = true;
      return;
    }

    const { joined, left, died } = diffMembers(this.lastMembers, members);
    const { posState, nowAfk, returned } = computeAfk(this.posState, members, now, opts);
    this.lastMembers = members;
    this.posState = posState;

    const server = Servers.findById(this.serverId);
    if (!server?.channel_id) return; // not wired to Discord → track silently
    const prefs = Servers.getNotifyPrefs(this.serverId);
    const emit = (kind, member, extra) =>
      bus.emit(TEAM_EVENT, { channelId: server.channel_id, serverName: server.name, kind, member, ...extra });

    if (prefs.connections) {
      for (const m of joined) emit('join', m);
      for (const m of left) emit('leave', m);
    }
    if (prefs.deaths) for (const m of died) emit('death', m);
    if (prefs.afk) {
      for (const m of nowAfk) emit('afk', m, { afkMs: opts.thresholdMs });
      for (const m of returned) emit('back', m);
    }
  }

  // Members currently AFK (online + immobile ≥ threshold), for the !afk command.
  getAfk(now) {
    const threshold = config.rustplus.poll.afkThresholdMs;
    const byId = new Map(this.lastMembers.map((m) => [String(m.steamId), m]));
    const out = [];
    for (const [id, st] of this.posState) {
      const m = byId.get(id);
      if (m?.isOnline && now - st.since >= threshold) out.push({ steamId: id, name: m.name, afkMs: now - st.since });
    }
    return out.sort((a, b) => b.afkMs - a.afkMs);
  }
}

