# Deploying RustLink Bot

This guide deploys the **single-process** app (REST API **+** Discord bot in one
Node process) to **Railway**, keeping **SQLite** on a persistent volume. No
PostgreSQL needed at this scale — one bot instance handles plenty.

> Render or a plain VPS work the same way; see [Other hosts](#other-hosts) at the end.

---

## What gets deployed

`npm start` runs `index.js`, which:

- starts the **Express API** (binds the host-injected `PORT`), and
- logs the **Discord bot** in (because `DISCORD_TOKEN` is set).

The Rust/Oxide plugin then POSTs real events to your public
`https://<your-app>.up.railway.app/webhook/rust`, and the bot posts embeds to Discord.

---

## Prerequisites

- The repo on GitHub (`Yunooo40/RustHelper`) — already there.
- A **Discord application**: bot **token** + **application (client) ID**
  (https://discord.com/developers/applications).
- A [Railway](https://railway.com) account.
- (Eventually) a **Rust server** running Oxide/Carbon to install the plugin — the
  API deploys fine without it, you just can't test live events until then.

---

## Railway — step by step

### 1. Create the project
Railway → **New Project** → **Deploy from GitHub repo** → pick `Yunooo40/RustHelper`.
Railway reads [`railway.json`](railway.json): Nixpacks build, `npm start`, health check
on `/health`. The pinned Node version comes from [`.nvmrc`](.nvmrc) (`24`) +
`engines` in `package.json`, so the `better-sqlite3` prebuilt binary matches the ABI.

### 2. Add a persistent volume (so the DB survives redeploys)
Service → **Variables/Settings** → **Volumes** → **New Volume**, mount path **`/data`**.

> Without a volume the SQLite file lives on the ephemeral container filesystem and is
> **wiped on every redeploy**. The volume keeps `servers`, `links`, `deaths`, etc.

### 3. Set environment variables
Service → **Variables** → add:

| Variable            | Value                              | Notes |
|---------------------|------------------------------------|-------|
| `DISCORD_TOKEN`     | *your bot token*                   | required |
| `DISCORD_CLIENT_ID` | *your application ID*              | required |
| `DISCORD_GUILD_ID`  | *(empty)*                          | empty = **global** commands; set one guild id for **instant** registration |
| `WEBHOOK_SECRET`    | *a long random string*             | **must set in prod** — the plugin sends it as `x-webhook-secret` |
| `DATABASE_PATH`     | `/data/rustlink.sqlite`            | points SQLite at the mounted volume |
| `NODE_ENV`          | `production`                       | |

> **Do not set `PORT`** — Railway injects it and the app reads it automatically
> (verified: it overrides `API_PORT`).

### 4. Deploy & get a public URL
Railway deploys on push to `main`. Then Service → **Settings** → **Networking** →
**Generate Domain** to get `https://<app>.up.railway.app`.
Check it: opening `…/health` should return `{"ok":true,...}`.

### 5. Register the slash commands (one-off)
Slash commands are registered **once** with Discord, not on every boot. After the
first deploy, run from your machine (with the **production** token/client id in a local
`.env`, or via Railway's CLI):

```bash
npm run deploy-commands
# or, using Railway's env without copying secrets:  railway run npm run deploy-commands
```

Global commands can take up to ~1h to appear; a `DISCORD_GUILD_ID` makes them instant
for that one server (handy for testing).

### 6. Point the Rust plugin at the deploy
In the plugin config (`oxide/config/RustLinkRelay.json`), set the API base URL to your
Railway domain and the same `WEBHOOK_SECRET`. Then in the Rust server console:

```
rustlink.test
```

…which fires a test event at `POST /webhook/rust`. See [`plugin/README.md`](plugin/README.md)
for the full plugin setup.

### 7. (Optional) Verify the whole pipeline — no Rust server needed

Fire every event type **and** a sample kill feed at the deployed API, then read the
resulting timers/events back:

```bash
API_BASE=https://<app>.up.railway.app WEBHOOK_SECRET=<your-secret> npm run simulate
```

If the bot is running and you've `/setup` the same server name, the embeds show up in
Discord. Locally it's just `npm run simulate` (defaults to `http://localhost:3000`).

---

## Environment variables reference

All config is read from env (see [`config.js`](config.js) / [`.env.example`](.env.example)).
`PORT` is read first (cloud convention), then `API_PORT`, then `3000` for local dev.

---

## Persistence & backups

- Data lives in one SQLite file on the `/data` volume (WAL mode).
- To back up, copy `rustlink.sqlite` (+ `-wal`/`-shm` if present) off the volume.
- Migrating to PostgreSQL later only touches the models layer — routes/commands depend
  on model functions, not on SQL. Deferred until scale actually needs it.

---

## Other hosts

- **Render** — New **Web Service** from the repo, start command `npm start`, health
  check path `/health`, add a **Disk** mounted at `/data`, same env vars. The included
  [`Procfile`](Procfile) (`web: npm start`) is honoured here too.
- **VPS (systemd)** — `git clone`, `npm ci`, create `.env`, then a unit running
  `node index.js`. Put nginx/Caddy in front for HTTPS so the plugin can reach the webhook.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy healthcheck fails | App not binding `PORT`. It is read first in `config.js`; make sure you didn't hard-set a conflicting `API_PORT`/`PORT`. |
| `better-sqlite3` build error on deploy | Node version drifted from a version with prebuilds. `.nvmrc` + `engines` pin Node `24` (better-sqlite3 `^12` ships its ABI). |
| Data gone after redeploy | No volume mounted, or `DATABASE_PATH` not pointing at `/data`. |
| Slash commands missing | `npm run deploy-commands` not run, or global registration still propagating (~1h). |
| Bot crash-loops on boot | Bad/empty `DISCORD_TOKEN`. Process exits 1 on login failure by design; fix the token. |
