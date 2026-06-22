# 🛢️ RustLink Bot

A Discord bot + REST API that tracks **Rust** in-game events — Oil Rig crates, Patrol
Helicopter, Cargo Ship, and more — and posts live timers/notifications to your Discord.
RustLink-style companion, built with **discord.js + Express + SQLite**.

> **Status:** Phase 2 done — Discord bot, API, SQLite and the Oxide/Carbon plugin
> relay real Rust events end-to-end. Phase 3 (in-game chat commands: report + query)
> is in progress (see [Roadmap](#-roadmap)).

---

## ✨ Features

**Slash commands (Discord)**
| Command | Description |
|---|---|
| `/setup <server_name> [channel]` | Link this Discord server to a Rust server + pick the notification channel |
| `/timer <event> <minutes>` | Manually set a countdown (admin) |
| `/status` | Show all tracked event timers |
| `/events` | List upcoming events, soonest first |
| `/player <username>` | Player info (stub — needs plugin, later phase) |
| `/link` · `/unlink` | Link / unlink your Discord ↔ Rust (Steam) account |
| `/stats [player]` | K/D stats for a linked player (yours by default) |
| `/leaderboard` | Top players by K/D ratio |

**REST API (backend)**
| Method & Path | Description |
|---|---|
| `POST /webhook/rust` | Receive an event from the Rust/Oxide plugin |
| `POST /webhook/death` | Receive a player death for the kill feed |
| `GET  /timers?server=<name>` | List active timers |
| `POST /timers/set` | Manually create/refresh a timer |
| `GET  /events?server=<name>` | Recent event history |
| `GET  /servers` | List tracked servers |
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
  → later: multi-server, PostgreSQL migration, per-user DM opt-in

---

## 🚢 Deployment notes

**Full step-by-step guide: [`DEPLOY.md`](DEPLOY.md)** (Railway + SQLite on a volume).

- Set `NODE_ENV=production` and a strong `WEBHOOK_SECRET`.
- The app binds the host-injected `PORT` automatically; keep the SQLite file on a
  persistent volume (`DATABASE_PATH=/data/rustlink.sqlite`).
- SQLite is fine to start; switch the `backend/models` layer to PostgreSQL when you
  outgrow a single file.

## 📄 License

MIT © Yunooo40 — see [LICENSE](LICENSE).
