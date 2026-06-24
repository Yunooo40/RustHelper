# 🛢️ RustLink Bot

A Discord bot + REST API that tracks **Rust** in-game events — Oil Rig crates, Patrol
Helicopter, Cargo Ship, and more — and posts live timers/notifications to your Discord.
RustLink-style companion, built with **discord.js + Express + SQLite**.

> **Status:** Phases 1–8.2 done — Discord bot, API, SQLite, the Oxide/Carbon plugin,
> player linking, K/D stats, multi-server tracking, a live **Railway** deploy, and a
> **Rust+ companion** socket: pair any server with `/pair`, then a full set of in-game
> team-chat commands — **`!pop` `!time`** plus team info (**`!online` `!offline` `!alive`
> `!prox` `!afk`**), event timers (**`!cargo` `!small` `!large` `!heli`**), relay (**`!bot`**)
> and **`!leader`** — with **`/pop` `/time`** mirrored on Discord. A background **team poller**
> announces teammate **connects / disconnects / deaths / AFK** to your channel, toggled per
> server with **`/notify`**. 144 tests green, `helmet` + per-IP rate limiting. Rust+ works on
> *any* server without admin — pending a live pairing test. Next (8.3): `!silence` + `!alarm`
> scheduled timers (see [Deployment](DEPLOY.md) + [Roadmap](#-roadmap)).

---

## ✨ Features

**Slash commands (Discord)**
| Command | Description |
|---|---|
| `/setup <server_name> [channel]` | **Track a Rust server** + pick its channel — a Discord can track several (the first becomes the default) |
| `/servers` | List the Rust servers this Discord tracks (⭐ = default) |
| `/server-default <name>` · `/server-remove <name>` | Set the default / stop tracking a server (admin) |
| `/timer <event> <minutes> [server]` | Manually set a countdown (admin) |
| `/status [server]` | Show all tracked event timers |
| `/events [server]` | List upcoming events, soonest first |
| `/player <username>` | Player info (stub — needs plugin, later phase) |
| `/watch add\|list\|remove\|clear` | Alert the channel when a watched teammate disconnects / reconnects (Rust+, needs `/pair`) |
| `/switch add\|remove\|list\|on\|off\|toggle` | Register and control Rust+ smart switches from Discord or in-game (`!switch`) |
| `/link` · `/unlink` | Link / unlink your Discord ↔ Rust (Steam) account |
| `/stats [player]` | K/D stats for a linked player (yours by default) |
| `/leaderboard` | Top players by K/D ratio |
| `/pop [server]` · `/time [server]` | Live population / in-game time of a paired server (Rust+) |
| `/map [server]` | Live map image + current events with grid refs (Rust+) |
| `/notify [connections] [deaths] [afk] [server]` | Toggle team-poller announcements per server (admin) |
| `/pair` · `/unpair` | Pair / unpair a tracked server with Rust+ (admin) |
| `/diag [server]` | Capture raw Rust+ data to validate detection (admin; see [live validation](docs/LIVE-VALIDATION.md)) |

**REST API (backend)**
| Method & Path | Description |
|---|---|
| `POST /webhook/rust` | Receive an event from the Rust/Oxide plugin |
| `POST /webhook/death` | Receive a player death for the kill feed |
| `GET  /timers?server=<name>` | List active timers |
| `POST /timers/set` | Manually create/refresh a timer |
| `GET  /events?server=<name>` | Recent event history |
| `GET  /servers` | List tracked servers |
| `DELETE /servers/:name` | Admin: delete a server by name (+ cascade its events/timers/deaths) — needs the **admin** secret (`x-admin-secret`) |
| `POST /link/claim` | Claim a link code from in-game (`!link <code>`) |
| `GET  /link?discord=<id>` | Look up a Discord ↔ Steam link (also `?steam=`) |
| `GET  /health` | Health check |

**Auto notifications** — when the API receives an event, the bot posts a pretty embed
(with a Discord auto-updating relative timestamp) in the configured channel.

Tracked events: `oil_rig_small`, `oil_rig_large`, `deep_sea`, `helicopter`, `cargo`, `chinook`, `bradley`.

---

## 🏗️ Architecture

```
┌─────────────────────┐
│   Rust server       │
│  + Oxide plugin     │  ──POST /webhook/rust──┐   (Phase 2)
└─────────────────────┘                        │
                                               ▼
┌──────────────────────────────────────────────────────────┐
│                  RustLink (single Node process)            │
│                                                            │
│   Express API  ──(in-process event bus)──▶  Discord bot    │
│   + SQLite DB                                discord.js     │
└──────────────────────────────────────────────────────────┘
                                               │
                                               ▼
                                        Your Discord server
```

Everything runs in **one process** (`index.js`) so the API can hand events to the bot
with no extra infrastructure. You can also run the **API alone** for testing
(`npm run api`).

---

## 📁 Project structure

```
RustHelper/
├── index.js                 # main entry — starts API (+ bot if token set)
├── deploy-commands.js       # registers slash commands with Discord
├── config.js                # loads & validates .env
├── shared/
│   ├── bus.js               # in-process API → bot event bus
│   ├── events.js            # catalog of trackable Rust events
│   └── time.js              # unix/countdown/Discord-timestamp helpers
├── backend/
│   ├── server.js            # Express app factory
│   ├── db.js                # SQLite connection + schema
│   ├── middleware/auth.js   # webhook secret verification
│   ├── models/              # servers / events / timers data-access
│   └── routes/              # webhook, timers, events, servers
├── bot/
│   ├── bot.js               # client factory, command/event loader, bridge
│   ├── commands/            # setup, timer, status, events, player
│   ├── events/              # ready, interactionCreate
│   └── lib/embeds.js        # embed builders
└── scripts/                 # webhook test helpers (.ps1 / .sh / .http)
```

---

## 🚀 Getting started

### 1. Prerequisites
- **Node.js 18+** (tested on Node 24)
- A **Discord application + bot** — create one at
  <https://discord.com/developers/applications>

### 2. Create the Discord bot
1. New Application → **Bot** → **Reset Token** → copy the token.
2. Copy the **Application ID** (General Information).
3. Invite the bot with the **`applications.commands`** and **`bot`** scopes
   (OAuth2 → URL Generator). No privileged intents are required.

### 3. Install & configure
```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
```
Then edit `.env` and fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and (recommended for
dev) `DISCORD_GUILD_ID` for instant command registration.

### 4. Register the slash commands
```bash
npm run deploy-commands
```

### 5. Run
```bash
npm start        # API + bot
npm run dev      # same, auto-restart on file changes
npm run api      # API only (no Discord token needed) — handy for testing
```

You should see:
```
[api] listening on http://localhost:3000
[bot] loaded 5 command(s).
[bot] logged in as YourBot#1234 — serving 1 guild(s).
```

In Discord: run **`/setup <your server name>`**, then **`/timer heli 25`**, then
**`/status`**.

---

## 🧪 Testing the API (no Discord needed)

Start the API only:
```bash
npm run api
```

Send a sample event (pick one):
```bash
# Windows PowerShell
./scripts/test-webhook.ps1
# Linux/macOS
./scripts/test-webhook.sh
# or the VS Code "REST Client" file:
scripts/requests.http
```

Or with curl:
```bash
curl -X POST http://localhost:3000/webhook/rust \
  -H "Content-Type: application/json" \
  -d '{"server":"Atlas - EU 2X Medium","event":"oil_rig_small","status":"spawned","next_respawn":1918631200}'

curl "http://localhost:3000/timers"
```

> If `WEBHOOK_SECRET` is set in `.env`, add `-H "x-webhook-secret: <your-secret>"`.
> Leave it empty in dev to disable auth.

---

## 📥 Webhook payload (Phase 2)

The Rust/Oxide plugin should `POST /webhook/rust` with:

```json
{
  "server": "Atlas - EU 2X Medium",
  "event": "oil_rig_small",
  "status": "spawned",
  "spawn_time": 1718614800,
  "next_respawn": 1718631200,
  "timestamp": "2024-06-17T10:00:00Z"
}
```

- `server` **must match** the name used in `/setup` (that's how notifications find the channel).
  Because events route by name, a server name is **globally unique** — `/setup` rejects a
  name already tracked by another Discord, so give each Rust server a distinct name.
- `event` accepts the canonical keys or aliases (`small`, `large`, `deep`, `heli`, `cargo`, `ch47`).
- `spawn_time` / `next_respawn` accept unix **seconds**, **milliseconds**, or an ISO string.
- Send the secret in the `x-webhook-secret` header when `WEBHOOK_SECRET` is set.
- *(Phase 3, optional)* `source: "ingame"` + `reporter: "<player>"` mark a player report
  relayed from the Rust chat; the notification then shows *reported in-game*.

---

## 🗺️ Roadmap

- [x] **Phase 1 — MVP:** Discord bot, slash commands, Express API, SQLite, webhook endpoint
- [x] **Phase 2 — Plugin integration:** Oxide/Carbon plugin posts real events (Heli, Chinook,
  Cargo, Bradley) to the webhook, hardened + tested — see [`plugin/`](plugin/README.md)
- [~] **Phase 3 — In-game commands:** relay through the plugin chat
  → **3.1** done & merged: **report** (`!small` `!large` `!deep` `!heli` `!cargo` `!bradley`
    `!chinook`, `!report <event>`) + **query** (`!rl` / `!timers`)
  → **3.2** done & merged (plugin v0.5.0): **auto Oil Rig** crate-hack detection
    (`OnCrateHack` + monument filter) — ⚠️ pending live-server verification
- [~] **Phase 4 — Polish:**
  → **4.1** done: player linking — `/link` + in-game `!link <code>` ties Discord ↔ Steam
  → **4.2** done: death kill feed — opt-in plugin relay → `POST /webhook/death`, linked
    players shown as Discord mentions (`deaths` table, tested)
  → **4.3** done: K/D stats & leaderboard — `/stats` + `/leaderboard` computed from the
    `deaths` table (suicides/NPC handled, best streak, tested)
- [~] **Phase 5 — Deploy:** run the API + bot live 24/7 on **Railway**, SQLite on a
  persistent volume, so a real Rust server can reach the webhook — deploy config +
  guide done ([`DEPLOY.md`](DEPLOY.md)); pending an actual Railway project + live test
- [x] **Phase 6 — Multi-server:** one Discord can track **several Rust servers** —
  `/setup` adds servers (first = default), `/servers` lists them, `/server-default` &
  `/server-remove` manage them, and `/status` `/events` `/timer` take an optional
  `server:` argument (idempotent schema migration, model + commands tested)
- [x] **Phase 7 — Rust+ companion (socket foundation):** talk to **any** server via the
  official **Rust+** protocol (`@liamcottle/rustplus.js`) — no admin needed. `/pair` stores
  credentials, a reconnecting manager opens one socket per server, in-game **`!pop` / `!time`**
  reply in team chat, and **`/pop` `/time`** mirror them on Discord (model + route + in-game
  router unit-tested; live connect validated at pairing) — ⚠️ pending a live pairing test
- [x] **Phase 8.1 — In-game team & info commands:** stateless team-chat commands over Rust+ —
  team info (**`!online` `!offline` `!alive` `!prox`**), event timers (**`!cargo` `!small`
  `!large` `!heli`**), relay (**`!bot`**) and **`!leader`** promotion — all unit-tested
  (`teamFormat` + router)
- [x] **Phase 8.2 — Team-state poller:** a per-connection `getTeamInfo` loop diffs snapshots
  and announces teammate **connect / disconnect / death / AFK** to Discord, filtered by a
  per-server opt-in (**`/notify`**); plus an in-game **`!afk`** query. Pure diff core
  (`rustplus/teamTracker.js`) unit-tested
- [x] **Phase 8.3 — Plugin-free event detection (Rust+ map markers):** the companion polls
  `getMapMarkers` and diffs snapshots to announce **Cargo Ship**, **Patrol Helicopter** and
  **CH47 Chinook** live — on **any paired server, with NO Oxide plugin**. Same pipeline as the
  webhook (history + timers + Discord embed, footer _via Rust+_); the first poll after each
  (re)connect only seeds state so already-running events aren't re-announced (pure diff tested)
- [x] **Phase 8.4 — Heli & Bradley destructions (explosion markers):** the same poller reads
  **Explosion** markers (a downed Patrol Helicopter or Bradley APC dropping loot) and posts
  **`helicopter destroyed`** / **`bradley destroyed`**. Heli-vs-Bradley is inferred by pairing
  an explosion with a heli marker vanishing the same poll (and the duplicate "heli left" is
  suppressed). Heuristic — to confirm on a live server
- [x] **Phase 8.5 — Oil Rig locked crates (map + crate markers):** on connect the companion
  fetches `getMap` once to learn the **Small / Large Oil Rig** monument positions, then a
  **Crate** marker spawning within range of a rig is posted as **`oil_rig_small` / `oil_rig_large`
  spawned** — plugin-free. Crates elsewhere (Cargo / CH47 drops) are ignored. Rig positions
  passed into the pure diff, so the placement logic is unit-tested
- [x] **Phase 8.6 — `/map` command:** posts the server map image (cached `getMap`) plus the
  current live events (`getMapMarkers`) as a list with **grid references** (e.g. `🚢 Cargo
  Ship — G7`), computed from `getInfo().mapSize`. Grid maths is a pure, unit-tested module
  (community-standard formula; grid labelling to confirm live)
- [x] **Phase 9 — Smart Alarms → Discord (FCM):** an FCM listener receives Rust+ **Smart
  Alarm** pushes (raid alarms) and posts them as a red alert embed in the matching server's
  channel (matched by the alarm's ip/port against your pairings, else by name). Account-level
  creds via `npx @liamcottle/rustplus.js fcm-register` → `RUSTPLUS_FCM_CREDENTIALS`; **idle by
  default** so the deployment is unaffected until configured. Push parsing/classification/
  matching is a pure, unit-tested module; the live receiver is validated at runtime
- [x] **Phase 10 — Diagnostics / live validation:** a `/diag` admin command + opt-in
  `RUSTPLUS_DIAG` logging capture the **raw** Rust+ markers/monuments/map-size and FCM pushes
  (secrets redacted) so a single live session confirms the assumptions every "verify live"
  feature rests on — marker enum values, oil rig tokens, grid refs, FCM payload shape. See the
  step-by-step [live validation checklist](docs/LIVE-VALIDATION.md)
- [x] **Phase 8.7 — Cooldowns & permissions for in-game commands:** a per-command, per-server
  anti-spam window (`RUSTPLUS_CMD_COOLDOWN_MS`) drops repeated `!` commands silently, plus a
  `leader` scope (broadcasting via `!bot` is reserved to the current team leader). Unit-tested
  with an injected clock
- [x] **Phase 8.8 — Player presence watch (`/watch`):** `/watch add` a teammate's Steam id and
  the bot announces in the channel when they **disconnect / reconnect** (detected via the
  getTeamInfo poll). `/watch list` · `/watch remove` · `/watch clear`. Pure diff + watcher tick
  unit-tested
- [x] **Phase 8.9 — Smart switches (`/switch`):** `/switch add <entity_id> <label>` registers a
  Rust+ smart switch; `/switch on|off|toggle <label>` controls it from Discord, and `!switch
  list|on|off|toggle <label>` from in-game team chat (control is leader-only). `!help` lists
  every in-game command. `getEntityAsync` / `setEntityAsync` added to the Connection. Model +
  router handlers unit-tested

---

## 🚢 Deployment notes

**Full step-by-step guide: [`DEPLOY.md`](DEPLOY.md)** (Railway + SQLite on a volume).

- Set `NODE_ENV=production`, a strong `WEBHOOK_SECRET`, and a **separate** `ADMIN_SECRET`
  (the latter guards `DELETE /servers/:name`, so it must differ from the plugin secret).
- The API ships with `helmet` security headers and per-IP rate limiting
  (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`, default 300 req/60s).
- The app binds the host-injected `PORT` automatically; keep the SQLite file on a
  persistent volume (`DATABASE_PATH=/data/rustlink.sqlite`).
- SQLite is fine to start; switch the `backend/models` layer to PostgreSQL when you
  outgrow a single file.

## 📄 License

MIT © Yunooo40 — see [LICENSE](LICENSE).
