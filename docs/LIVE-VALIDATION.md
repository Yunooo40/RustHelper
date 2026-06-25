# 🔬 Live validation checklist

Almost every Rust+ feature (event detection, oil rigs, `/map` grid, Smart Alarms) is built on
assumptions that can only be confirmed against a **real server**: the `getMapMarkers` type
enum, the oil rig monument tokens, the grid formula, and the FCM push shape. This guide runs
through confirming them all in **one session** with the Phase 10 diagnostics.

> Until this is done, treat those features as **provisional** — the unit tests prove the logic,
> not that the live payloads match what the logic expects.

## 0. Prerequisites
- The bot deployed & running (see [`DEPLOY.md`](../DEPLOY.md)), commands registered (`npm run deploy-commands`).
- One Rust server tracked: `/setup "<exact server name>"`.
- That server paired over Rust+: `/pair` (needs `serverIp` / `appPort` / `playerId` / `playerToken`
  from `npx @liamcottle/rustplus.js fcm-register` → in-game **Pair**).
- `RUSTPLUS_DIAG=true` set in the environment (then restart).

## 1. Confirm the Rust+ socket basics
- [ ] `/pop` and `/time` reply with sane numbers → the socket + promisified API work.
- [ ] In team chat: `!pop`, `!time`, `!online` reply → the in-game router works.

## 2. Confirm markers, oil rigs and the grid — `/diag`
Run **`/diag`** (admin). It attaches `diag-<server>.json`. Check:
- [ ] `server.mapSize` looks right (e.g. 3000–4500) and `server.name` matches in-game.
- [ ] `markers.types` — note the numbers present. Expected mapping the code assumes:
  **5 = Cargo, 8 = Patrol Heli, 4 = CH47, 2 = Explosion, 6 = Crate**. If a live value differs,
  fix `MARKER_EVENT` / the type constants in [`rustplus/markers.js`](../rustplus/markers.js).
- [ ] `monuments.oilRigs` — confirm the small/large rig **tokens** were detected. If the list is
  empty but the map has oil rigs, copy the real tokens from `monuments.tokens` and adjust
  `oilRigsFromMap()` in `rustplus/markers.js`.
- [ ] Each marker `sample.grid` — compare against the in-game map grid. If the **letter is right
  but the number is mirrored**, flip the row origin in [`rustplus/grid.js`](../rustplus/grid.js)
  (one line). If columns are off, revisit `GRID_CELL`.

## 3. Confirm live event detection
With `RUSTPLUS_DIAG=true`, the logs print `markers` once per connect and `monuments` on map load.
- [ ] Wait for / trigger a **Cargo** or **Heli** → a Discord embed appears (footer *via Rust+*).
- [ ] Watch for double notifications if the **Oxide plugin** is also reporting — if so, set
  `RUSTPLUS_MARKERS_ENABLED=false` (or disable the plugin's auto events).

## 4. Confirm Smart Alarms (FCM)
- [ ] `RUSTPLUS_FCM_CREDENTIALS` points at the `fcm-register` JSON; logs show *Smart Alarm listener started*.
- [ ] Trigger an in-game Smart Alarm → a red 🚨 embed posts in the server's channel.
- [ ] In the logs, the `[fcm][diag] push received:` line shows the real shape — confirm
  `channelId: "alarm"` and that `body` has `ip`/`port`/`name`. (Secrets are redacted.) If the
  shape differs, adjust `classifyNotification()` in [`rustplus/fcm.js`](../rustplus/fcm.js).

## 5. Finish
- [ ] Set `RUSTPLUS_DIAG=false` and restart (stops the extra logging).
- [ ] Tick off the matching roadmap items in the [README](../README.md), or open issues for any
  assumption that needed fixing.

---

Paste the `/diag` JSON (or the `[fcm][diag]` lines) back into the project and the constants can be
corrected in minutes — that's the whole point of capturing them.
