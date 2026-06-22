# 🔌 RustLinkRelay (Oxide / Carbon plugin) — Phase 2 + 3

`RustLinkRelay.cs` runs on your **Rust server** and POSTs in-game events to the
RustLink Bot API (`POST /webhook/rust`). The bot then posts timers/notifications
to Discord. Since v0.2.0 players can also **report events** and **query timers**
straight from the Rust chat (see *In-game chat commands* below).

**Auto-relayed events:**

| Event | When it fires | `status` | Discord countdown? |
|---|---|---|---|
| `helicopter` | Patrol Helicopter spawns / is destroyed | `spawned` / `destroyed` | on destroy, if estimate set |
| `chinook` | CH47 spawns / flies away **or is shot down** | `spawned` / `left` | — |
| `cargo` | Cargo Ship spawns / leaves | `spawned` / `left` | on leave, if estimate set |
| `bradley` | Bradley APC spawns / is destroyed | `spawned` / `destroyed` | on destroy (default 60 min) |

> **Note:** the Discord countdown fires at the **end** of an event (destroy / leave),
> not on spawn. A CH47 that is **shot down** is reported as `left` (not `destroyed`).

> In-game `!commands` arrived in **v0.2.0** (Phase 3, below). **v0.5.0** adds **auto Oil
> Rig** detection: when the locked crate on the Small/Large Oil Rig starts being hacked,
> the plugin posts `oil_rig_small`/`oil_rig_large` with a countdown to unlock — no `!small`
> needed. ⚠️ This relies on Rust hook/monument names and is **not yet verified on a live
> server**; enable `Debug` to check it, or set `Auto-detect Oil Rig crate hacks` to `false`.
> Deep Sea Loot still has no auto-detection (report it with `!deep`).

---

## 💬 In-game chat commands (Phase 3)

Players interact with RustLink without leaving Rust. Both the `!` prefix (configurable)
and the standard `/` prefix work.

| Command | Does |
|---|---|
| `!rl` · `!timers` · `!next` | Replies in chat with the **active timers** (reads the API). |
| `!small` `!large` `!deep` | **Report** Oil Rig Small / Large / Deep Sea Loot (no auto-detection). |
| `!heli` `!cargo` `!bradley` `!chinook` | **Report** these events manually. |
| `!report <event>` | Report any event by key/alias (e.g. `!report patrol`). |
| `!link <code>` | Link your Steam account to Discord — get the code from `/link` in Discord (Phase 4). |

- A **report** is relayed to Discord exactly like an auto event (notification + timer),
  tagged *reported in-game* with the player's name. The timer length per event comes
  from `Reports: timer minutes per event` (Oil Rigs default to 15 min; `0` = announce only).
- **Anti-spam:** a per-player cooldown (default 60 s) and an optional `Reports: admin only`
  switch. Set `Chat commands enabled` to `false` to disable the whole feature.

---

## 📦 Install

The same `.cs` file works on **Oxide/uMod** and **Carbon** (Carbon is Oxide-API
compatible). Drop it into your server's plugin folder — it hot-loads, no restart needed.

| Framework | Plugin folder | Config folder |
|---|---|---|
| **Oxide/uMod** | `<server>/oxide/plugins/` | `<server>/oxide/config/` |
| **Carbon** | `<server>/carbon/plugins/` | `<server>/carbon/configs/` |

1. Copy `RustLinkRelay.cs` into the plugin folder.
2. The server compiles it and writes a default config (`RustLinkRelay.json`).
3. Edit the config (see below), then reload: `oxide.reload RustLinkRelay`
   (Carbon: `c.reload RustLinkRelay`).

---

## ⚙️ Configuration (`RustLinkRelay.json`)

```json
{
  "Webhook URL": "http://localhost:3000/webhook/rust",
  "API base URL (in-game queries; empty = derive from Webhook URL)": "",
  "Webhook secret (x-webhook-secret header, empty = none)": "",
  "Server name (MUST match /setup in Discord)": "My Rust Server",
  "Request timeout (seconds)": 10,
  "Debug logging": false,
  "Relay player deaths": false,
  "Chat commands enabled": true,
  "Chat prefix for '!' style (the '/' forms always work)": "!",
  "Reports: admin only": false,
  "Reports: per-player cooldown (seconds)": 60,
  "Reports: timer minutes per event (0 = announce only, no timer)": {
    "oil_rig_small": 15, "oil_rig_large": 15, "deep_sea": 0,
    "helicopter": 0, "cargo": 0, "bradley": 0, "chinook": 0
  },
  "Auto-detect Oil Rig crate hacks (verify on a live server)": true,
  "Events": {
    "helicopter": { "Enabled": true, "Respawn estimate (minutes)": 0 },
    "chinook":    { "Enabled": true, "Respawn estimate (minutes)": 0 },
    "cargo":      { "Enabled": true, "Respawn estimate (minutes)": 0 },
    "bradley":    { "Enabled": true, "Respawn estimate (minutes)": 60 }
  }
}
```

- **Webhook URL** — where the bot API listens. Same machine → `localhost`. Different
  machine → use the API host's LAN IP or public URL (e.g. `http://192.168.1.20:3000/webhook/rust`).
- **API base URL** — used by in-game queries (`!rl`) to read `GET /timers`. Leave empty to
  derive it from the Webhook URL (strips `/webhook/rust`).
- **Webhook secret** — must equal `WEBHOOK_SECRET` in the bot's `.env` (leave empty if the bot has none).
- **Server name** — must exactly match what you pass to `/setup <server_name>` in Discord,
  otherwise the bot can't route the notification to the right channel.
- **Chat commands / prefix / reports** — see *In-game chat commands* above.
- **Auto-detect Oil Rig crate hacks** — when `true` (default), the plugin posts an Oil Rig
  event automatically the moment its locked crate starts being hacked. Set `false` to rely
  on player `!small`/`!large` reports instead. *Needs live-server verification.*
- **Relay player deaths** — when `true`, every player death is POSTed to `/webhook/death`
  and shown in the Discord kill feed (linked players appear as mentions). Off by default
  because Rust deaths are frequent. *Needs live-server verification.*
- **Respawn estimate** — minutes used for the Discord countdown. Rust events are not
  fixed-interval, so these are *estimates* (Bradley ~60 min is a reasonable default).

---

## 🧪 Test it (no real events needed)

From the **server console** or **RCON**:

```
rustlink.test                      # sends bradley/destroyed -> creates a 60-min timer
rustlink.test helicopter spawned   # custom event/status
```

Then in Discord run `/status` (or `GET http://localhost:3000/timers`) — you should see
the timer appear. Turn on `"Debug logging"` to print each webhook + HTTP result to the
server console.

To trigger **real** events, connect as admin and use the F1 console (commands can vary
by Rust version):
```
spawn bradleyapc
spawn patrolhelicopter
spawn cargoship
```

---

## 🖥️ Set up a local dev Rust server (Windows)

You don't need a paid host to test. Run a server on your PC:

1. **Install SteamCMD** → <https://developer.valvesoftware.com/wiki/SteamCMD#Windows>
   (unzip to e.g. `C:\steamcmd`).

2. **Download the Rust dedicated server** (~12 GB):
   ```powershell
   C:\steamcmd\steamcmd.exe +force_install_dir C:\rustserver +login anonymous +app_update 258550 validate +quit
   ```

3. **Create `C:\rustserver\start.bat`:**
   ```bat
   @echo off
   RustDedicated.exe -batchmode -nographics ^
     +server.identity "rustlink-dev" ^
     +server.hostname "RustLink Dev" ^
     +server.maxplayers 10 ^
     +server.worldsize 3000 +server.seed 12345 ^
     +server.port 28015 +rcon.port 28016 +rcon.password "changeme" +rcon.web 1
   ```
   Run it once and let the world generate (first boot is slow), then `quit` in the console.

4. **Install a mod framework:**
   - **Oxide/uMod:** download *Oxide.Rust* (Windows) from <https://umod.org/games/rust>,
     unzip into `C:\rustserver` (merge folders). Or
   - **Carbon:** grab the Windows build from <https://github.com/CarbonCommunity/Carbon.Core/releases>
     and unzip into `C:\rustserver`.

5. **Start the server again** → it creates `oxide/` (or `carbon/`).

6. **Drop the plugin** into `oxide/plugins/` (or `carbon/plugins/`), edit
   `RustLinkRelay.json`, then `oxide.reload RustLinkRelay`.

7. **Run the bot API** on the same PC (`npm run api` in the repo) and fire `rustlink.test`.

> Tip: connect your Rust client with the in-game F1 console: `client.connect localhost:28015`.

---

## 🔧 Troubleshooting

- **`Webhook failed HTTP 401`** → secret mismatch (config vs bot `.env`).
- **`Webhook failed HTTP 400 Unknown event`** → the bot's event catalog
  (`shared/events.js`) doesn't know that key.
- **No timer in Discord** → the event had no `next_respawn` (set a respawn estimate),
  or the server name doesn't match `/setup`.
- **Connection refused** → API not running, wrong host/port, or a firewall is blocking
  the port between the game server and the API host.
- **Event never fires** → a Rust update may have renamed the entity/hook; check uMod docs.
