// Map-marker poller (Phase 8.2). One per live Connection: on a fixed interval it
// calls getMapMarkers, diffs against the previous poll, and fires `onEvent` for each
// trackable marker that just appeared (cargo / patrol heli / chinook). This brings
// real-time events to ANY server we're paired with — no Oxide plugin or admin needed.
//
// Kept thin and dependency-injected (connection + onEvent + clock) so _tick() is
// unit-testable with a fake connection; the setInterval loop is the only untested I/O.
import { detectAppeared } from './mapEvents.js';

export class MarkerPoller {
  constructor(connection, { onEvent, intervalMs = 30_000 } = {}) {
    this.connection = connection;
    this.onEvent = onEvent;
    this.intervalMs = intervalMs;
    this.prevIds = null; // null until the first successful poll (seed, don't announce)
    this.timer = null;
    this.polling = false;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), this.intervalMs);
    this.timer.unref?.(); // never keep the process alive just to poll
  }

  // Poll once, diff, and announce newcomers. Never throws (a failed poll — e.g. the
  // socket is mid-reconnect — is logged and skipped; prevIds is left untouched so the
  // next good poll diffs against the last known-good state, not an empty map).
  async _tick() {
    if (this.polling || !this.connection?.connected) return;
    this.polling = true;
    try {
      const markers = await this.connection.getMapMarkersAsync();
      const { ids, appeared } = detectAppeared(this.prevIds, markers);
      this.prevIds = ids;
      for (const ev of appeared) {
        try {
          await this.onEvent?.(ev.eventType, ev.marker);
        } catch (err) {
          console.error('[rustplus] poll onEvent error:', err?.message ?? err);
        }
      }
    } catch (err) {
      console.error(`[rustplus] map poll failed (server #${this.connection?.serverId}):`, err?.message ?? err);
    } finally {
      this.polling = false;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default MarkerPoller;
