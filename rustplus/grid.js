// Rust map grid helpers (Phase 8.5). Pure & side-effect-free — no socket, no DB —
// so the (fiddly) coordinate maths is unit-tested directly.
//
// Rust+ marker positions are world coordinates: x runs west→east, y runs south→north,
// origin at the south-west corner, range [0, mapSize] (mapSize = AppInfo.mapSize). The
// in-game map overlays a grid: lettered columns A,B,…,Z,AA,… run west→east, and row
// numbers run north→south starting at 0 (so the top-left cell is "A0").
//
// NOTE: the exact grid labelling is the community-standard formula (cell ≈ 146.29 world
// units); confirm against a live server, and flip the row origin here if a server differs.

const GRID_CELL = 1024 / 7; // ≈146.2857 world units per grid cell (community standard)

// Snap the world size to a whole number of cells, like Rust does internally.
function snap(mapSize) {
  const remainder = mapSize % GRID_CELL;
  return remainder < 120 ? mapSize - remainder : mapSize + (GRID_CELL - remainder);
}

// 0 → A, 25 → Z, 26 → AA, 27 → AB … (spreadsheet-style column, 0-indexed).
function columnLetters(index) {
  let s = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    s = String.fromCharCode(65 + (n % 26)) + s;
  }
  return s;
}

// World (x, y) → Rust grid ref like "G12", or null when off-grid / mapSize unknown.
export function worldToGrid(x, y, mapSize) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !mapSize) return null;
  const size = snap(mapSize);
  if (x < 0 || y < 0 || x > size || y > size) return null;
  const maxIdx = Math.max(0, Math.round(size / GRID_CELL) - 1);
  const col = Math.min(Math.floor(x / GRID_CELL), maxIdx);
  const row = Math.min(Math.floor((size - y) / GRID_CELL), maxIdx); // y inverted: north = row 0
  return `${columnLetters(col)}${row}`;
}

// Display labels for the live markers worth showing on /map (more types than the event
// poller cares about — e.g. raw crates/explosions still help when reading the map).
const MAP_LABELS = {
  2: '💥 Explosion',
  4: '🪖 CH47 Chinook',
  5: '🚢 Cargo Ship',
  6: '📦 Locked Crate',
  8: '🚁 Patrol Helicopter',
};
const TYPE_BY_NAME = { Explosion: 2, CH47: 4, CargoShip: 5, Crate: 6, PatrolHelicopter: 8 };
const typeNum = (t) => (typeof t === 'number' ? t : TYPE_BY_NAME[t]);

// One human line per interesting live marker, with its grid ref (omitted when off-grid):
//   "🚢 Cargo Ship — G7". Grouped by marker type for a stable display order.
export function describeMapMarkers(markers, mapSize) {
  const rows = [];
  for (const m of Array.isArray(markers) ? markers : []) {
    const type = typeNum(m?.type);
    const label = MAP_LABELS[type];
    if (!label) continue;
    const grid = worldToGrid(m.x, m.y, mapSize);
    rows.push({ type, text: grid ? `${label} — ${grid}` : label });
  }
  return rows.sort((a, b) => a.type - b.type).map((r) => r.text);
}

export default worldToGrid;
