// Team presence watcher (Phase 8.4). One per live Connection: on a fixed interval it
// reads the watch list for the server (fresh from the DB, so /watch add takes effect
// without a restart), and if any are set, polls getTeamInfo, diffs online status, and
// fires `onChange` for each watched player who connected or disconnected.
//
// Thin and dependency-injected (connection + getWatched + onChange) so _tick() is
// unit-testable with fakes; the setInterval loop is the only untested I/O.
import { detectStatusChanges } from './teamWatch.js';

export class TeamWatcher {
  constructor(connection, { getWatched, onChange, intervalMs = 30_000 } = {}) {
    this.connection = connection;
    this.getWatched = getWatched; // () => string[] of watched steam ids for this server
    this.onChange = onChange; // (change) => void, change = { steamId, name, online }
    this.intervalMs = intervalMs;
    this.prevOnline = null; // null until the first poll with watches (seed, don't alert)
    this.timer = null;
    this.polling = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), this.intervalMs);
    this.timer.unref?.(); // never keep the process alive just to watch
  }

  // Poll once, diff, and alert on flips. Never throws. Resets the baseline when the
  // watch list becomes empty so re-adding a watch seeds cleanly instead of alerting.
  async _tick() {
    if (this.polling || !this.connection?.connected) return;
    const watched = (this.getWatched?.() ?? []).map(String);
    if (watched.length === 0) {
      this.prevOnline = null;
      return;
    }
    this.polling = true;
    try {
      const info = await this.connection.getTeamInfoAsync();
      const { online, changes } = detectStatusChanges(this.prevOnline, info?.members, watched);
      this.prevOnline = online;
      for (const ch of changes) {
        try {
          await this.onChange?.(ch);
        } catch (err) {
          console.error('[rustplus] watch onChange error:', err?.message ?? err);
        }
      }
    } catch (err) {
      console.error(`[rustplus] team watch failed (server #${this.connection?.serverId}):`, err?.message ?? err);
    } finally {
      this.polling = false;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default TeamWatcher;
