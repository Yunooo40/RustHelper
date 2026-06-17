// Time helpers. We store all timestamps as UNIX seconds (UTC) in the database
// and let Discord render them in each user's local timezone via <t:...> tags.

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

// Accepts a unix value (seconds OR milliseconds) or an ISO string -> unix seconds.
export function toUnix(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    // Heuristic: values larger than ~year 33658 in seconds are actually milliseconds.
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

export function secondsUntil(targetUnix) {
  return targetUnix - nowUnix();
}

// Compact human countdown, e.g. "1j 2h 5m", "12m", or "now".
export function formatCountdown(targetUnix) {
  let s = targetUnix - nowUnix();
  if (s <= 0) return 'now';
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const parts = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// Discord auto-rendering timestamp tag.
//   R -> relative ("in 5 minutes" / "2 minutes ago")
//   t -> short time, T -> long time, f -> short date+time
export function discordTime(unix, style = 'R') {
  return `<t:${Math.floor(unix)}:${style}>`;
}
