// Catalog of trackable Rust events.
//
// `key`      — canonical id stored in the database and sent by the webhook.
// `label`    — human-readable name shown in Discord.
// `emoji`    — decorates embeds and notifications.
// `aliases`  — accepted spellings (in-game "!small", "!heli", loose webhook values...).
export const EVENTS = {
  oil_rig_small: { label: 'Small Oil Rig', emoji: '🛢️', aliases: ['small', 'oilsmall', 'small_oil_rig'] },
  oil_rig_large: { label: 'Large Oil Rig', emoji: '🏭', aliases: ['large', 'oillarge', 'large_oil_rig'] },
  deep_sea: { label: 'Deep Sea Loot', emoji: '🌊', aliases: ['deep', 'deepsea', 'deep_sea_loot'] },
  helicopter: { label: 'Patrol Helicopter', emoji: '🚁', aliases: ['heli', 'patrol', 'patrol_helicopter'] },
  cargo: { label: 'Cargo Ship', emoji: '🚢', aliases: ['cargoship', 'cargo_ship'] },
  chinook: { label: 'Chinook (CH47)', emoji: '🪖', aliases: ['ch47', 'ch-47', 'crate'] },
};

export const EVENT_KEYS = Object.keys(EVENTS);

// Slash-command choice list: [{ name, value }, ...]
export const EVENT_CHOICES = EVENT_KEYS.map((key) => ({ name: EVENTS[key].label, value: key }));

// Resolve a user/webhook-provided string to a canonical event key (or null).
export function resolveEvent(input) {
  if (!input) return null;
  const needle = String(input).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (EVENTS[needle]) return needle;
  for (const [key, meta] of Object.entries(EVENTS)) {
    if (key === needle) return key;
    if (meta.aliases.some((a) => a.toLowerCase().replace(/[\s-]+/g, '_') === needle)) return key;
  }
  return null;
}

export function eventLabel(key) {
  return EVENTS[key]?.label ?? key;
}

export function eventEmoji(key) {
  return EVENTS[key]?.emoji ?? '📦';
}

export default EVENTS;
