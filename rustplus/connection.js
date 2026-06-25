// One live Rust+ companion connection (Phase 7). Wraps a single RustPlus websocket for
// a paired server: connects, reconnects with exponential backoff, routes incoming team
// chat to the in-game command router, and exposes a small promisified API for the
// Discord commands.
//
// The underlying lib (@liamcottle/rustplus.js, CommonJS) exports the class as its default
// export. Its convenience methods are callback-based, but sendRequestAsync() is already
// promise-based (resolves the AppResponse, rejects on AppError/timeout) — so we build our
// async helpers on top of it.
import RustPlus from '@liamcottle/rustplus.js';
import { config } from '../config.js';
import { handleTeamMessage } from './router.js';
import { diffMarkers, oilRigsFromMap } from './markers.js';
import { summarizeMarkers, summarizeMonuments } from './diag.js';
import { TeamTracker } from './teamTracker.js';
import * as Servers from '../backend/models/server.js';
import { recordRustEvent } from '../backend/ingest.js';

export class Connection {
  constructor(pairing) {
    this.pairing = pairing;
    this.serverId = pairing.server_id;
    this.steamId = String(pairing.steam_id);
    this.rp = null;
    this.connected = false;
    this.stopped = false;
    this.reconnectDelay = config.rustplus.reconnect.minDelayMs;
    this.reconnectTimer = null;
    // Team-state poller (Phase 8.2): connect/leave/death/AFK announcements.
    this.tracker = new TeamTracker(this.serverId);
    this.teamTimer = null;
    // Map-marker poller (Phase 8.2–8.4): live Cargo/Heli/Chinook + Heli/Bradley destructions
    // + Oil Rig crate detection, no Oxide plugin.
    this.markers = [];        // last getMapMarkers snapshot, for diffing
    this.markersSeeded = false; // first poll after (re)connect only seeds — see _pollMarkers
    this.markerTimer = null;
    this.map = null;          // cached AppMap from getMap (image + monuments), refreshed per connect
    this.oilRigs = [];        // oil rig monument positions (from getMap), to place crate markers
  }

  start() {
    this.stopped = false;
    this._open();
  }

  _open() {
    const p = this.pairing;
    const rp = new RustPlus(p.server_ip, p.app_port, p.steam_id, p.player_token);
    this.rp = rp;

    rp.on('connected', () => {
      this.connected = true;
      this.reconnectDelay = config.rustplus.reconnect.minDelayMs; // reset backoff on success
      console.log(`[rustplus] connected (server #${this.serverId} ${p.server_ip}:${p.app_port})`);
      this._startPolling();
      this._loadMap(); // best-effort; crates stay unattributed (and /map image absent) until it lands
    });

    rp.on('message', (msg) => {
      const teamMessage = msg?.broadcast?.teamMessage;
      if (!teamMessage) return; // we only react to team chat in Phase 7
      handleTeamMessage(teamMessage, this, this.steamId).catch((err) =>
        console.error('[rustplus] command handler error:', err?.message ?? err),
      );
    });

    rp.on('error', (err) => {
      // The socket will also emit 'disconnected' right after, which drives the reconnect.
      console.error(`[rustplus] socket error (server #${this.serverId}):`, err?.message ?? err);
    });

    rp.on('disconnected', () => {
      this.connected = false;
      this._stopPolling();
      if (this.stopped) return;
      this._scheduleReconnect();
    });

    rp.connect();
  }

  _scheduleReconnect() {
    const delay = this.reconnectDelay;
    console.warn(`[rustplus] server #${this.serverId} disconnected; reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => this._open(), delay);
    this.reconnectTimer.unref?.(); // never keep the process alive just to reconnect
    this.reconnectDelay = Math.min(delay * 2, config.rustplus.reconnect.maxDelayMs);
  }

  stop() {
    this.stopped = true;
    this._stopPolling();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.rp) {
      try { this.rp.disconnect(); } catch { /* already gone */ }
    }
    this.connected = false;
  }

  // ── Pollers ────────────────────────────────────────────────────────────────────
  // Two independent loops run while connected: the team-state poller (join/leave/death/AFK)
  // and the map-marker poller (live server events). Both start on 'connected' and stop on
  // 'disconnected'/stop().
  _startPolling() {
    this._startTeamPoll();
    this._startMarkerPoll();
  }

  _stopPolling() {
    this._stopTeamPoll();
    this._stopMarkerPoll();
  }

  // Team-state poll loop (Phase 8.2): sample getTeamInfo and let the tracker diff + announce.
  _startTeamPoll() {
    this._stopTeamPoll(); // fresh baseline on each (re)connect
    this.teamTimer = setInterval(() => {
      this._pollTeam().catch((err) =>
        console.error(`[rustplus] team poll error (server #${this.serverId}):`, err?.message ?? err),
      );
    }, config.rustplus.poll.intervalMs);
    this.teamTimer.unref?.(); // never keep the process alive just to poll
  }

  _stopTeamPoll() {
    if (this.teamTimer) clearInterval(this.teamTimer);
    this.teamTimer = null;
    this.tracker.reset();
  }

  async _pollTeam() {
    if (!this.connected) return;
    const teamInfo = await this.getTeamInfoAsync();
    this.tracker.update(teamInfo, Date.now());
  }

  // Map-marker poll loop (Phase 8.2–8.4). Poll getMapMarkers and diff snapshots to announce
  // Cargo/Heli/Chinook spawns, Heli/Bradley destructions, and Oil Rig crate spawns — no Oxide
  // plugin. The first poll after every (re)connect only SEEDS state, so we never re-announce
  // an event already happening before we connected (or across a brief reconnect).
  _startMarkerPoll() {
    if (!config.rustplus.markers.enabled || this.markerTimer) return;
    this.markers = [];
    this.markersSeeded = false;
    const tick = () =>
      this._pollMarkers().catch((err) =>
        console.error(`[rustplus] marker poll failed (server #${this.serverId}):`, err?.message ?? err),
      );
    this.markerTimer = setInterval(tick, config.rustplus.markers.pollMs);
    this.markerTimer.unref?.(); // never keep the process alive just to poll
    tick(); // seed immediately, don't wait a full interval
  }

  _stopMarkerPoll() {
    if (this.markerTimer) {
      clearInterval(this.markerTimer);
      this.markerTimer = null;
    }
  }

  async _pollMarkers() {
    if (!this.connected) return;
    const markers = await this.getMapMarkersAsync();
    if (!this.markersSeeded) {
      this.markers = markers;
      this.markersSeeded = true;
      if (config.rustplus.diag) {
        console.log(`[rustplus][diag] markers (server #${this.serverId}):`, JSON.stringify(summarizeMarkers(markers)));
      }
      return;
    }
    const events = diffMarkers(this.markers, markers, this.oilRigs);
    this.markers = markers;
    if (!events.length) return;

    const server = Servers.findById(this.serverId);
    if (!server) return; // server row deleted (unpaired/removed) — nothing to notify
    for (const { eventType, status, marker } of events) this._announce(server, eventType, status, marker);
  }

  // Fetch the static map once per connect and cache it (image for /map + oil rig monument
  // positions so the diff can attribute locked-crate spawns to the Small/Large Oil Rig).
  // Best-effort: on failure the cache stays empty, crate markers are ignored and /map drops
  // the image — no crash.
  async _loadMap() {
    try {
      const map = await this.getMapAsync();
      this.map = map;
      this.oilRigs = oilRigsFromMap(map);
      if (this.oilRigs.length) {
        console.log(`[rustplus] mapped ${this.oilRigs.length} oil rig(s) (server #${this.serverId})`);
      }
      if (config.rustplus.diag) {
        console.log(`[rustplus][diag] monuments (server #${this.serverId}):`, JSON.stringify(summarizeMonuments(map)));
      }
    } catch (err) {
      console.error(`[rustplus] getMap failed (server #${this.serverId}):`, err?.message ?? err);
    }
  }

  _announce(server, eventType, status, marker) {
    console.log(`[rustplus] ${eventType} ${status} on "${server.name}" (server #${this.serverId})`);
    recordRustEvent({
      server,
      eventType,
      status,
      source: 'rustplus',
      payload: { source: 'rustplus', status, marker },
    });
  }

  // ── Promisified API (used by the router + Discord /pop /time /map) ─────────────
  // Each rejects on timeout / AppError / when the socket isn't open.

  async getInfoAsync() {
    const res = await this.rp.sendRequestAsync({ getInfo: {} }, config.rustplus.requestTimeoutMs);
    return res.info;
  }

  async getTimeAsync() {
    const res = await this.rp.sendRequestAsync({ getTime: {} }, config.rustplus.requestTimeoutMs);
    return res.time;
  }

  sendTeamMessageAsync(message) {
    return this.rp.sendRequestAsync({ sendTeamMessage: { message } }, config.rustplus.requestTimeoutMs);
  }

  async getTeamInfoAsync() {
    const res = await this.rp.sendRequestAsync({ getTeamInfo: {} }, config.rustplus.requestTimeoutMs);
    return res.teamInfo;
  }

  async getMapMarkersAsync() {
    const res = await this.rp.sendRequestAsync({ getMapMarkers: {} }, config.rustplus.requestTimeoutMs);
    return res.mapMarkers?.markers ?? [];
  }

  async getMapAsync() {
    const res = await this.rp.sendRequestAsync({ getMap: {} }, config.rustplus.requestTimeoutMs);
    return res.map;
  }

  promoteToLeaderAsync(steamId) {
    return this.rp.sendRequestAsync({ promoteToLeader: { steamId } }, config.rustplus.requestTimeoutMs);
  }
}

export default Connection;
