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
import { TeamTracker } from './teamTracker.js';

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
    this.tracker = new TeamTracker(this.serverId);
    this.pollTimer = null;
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

  // ── Team-state poll loop (Phase 8.2) ───────────────────────────────────────────
  _startPolling() {
    this._stopPolling(); // fresh baseline on each (re)connect
    this.pollTimer = setInterval(() => {
      this._pollOnce().catch((err) =>
        console.error(`[rustplus] poll error (server #${this.serverId}):`, err?.message ?? err),
      );
    }, config.rustplus.poll.intervalMs);
    this.pollTimer.unref?.(); // never keep the process alive just to poll
  }

  _stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.tracker.reset();
  }

  async _pollOnce() {
    if (!this.connected) return;
    const teamInfo = await this.getTeamInfoAsync();
    this.tracker.update(teamInfo, Date.now());
  }

  // ── Promisified API (used by the router + Discord /pop /time) ──────────────────
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

  promoteToLeaderAsync(steamId) {
    return this.rp.sendRequestAsync({ promoteToLeader: { steamId } }, config.rustplus.requestTimeoutMs);
  }
}

export default Connection;
