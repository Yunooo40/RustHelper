# Phase 7 — Socle Rust+ (companion app) — Design

Date : 2026-06-23 · Branche : `feat/phase7-rustplus`

## Problème

RustHelper ne sait parler à Rust que via le **plugin Oxide** (webhook entrant), donc
uniquement sur des serveurs où l'on est **admin** — l'utilisateur n'en a aucun. Or ~80 % de
la feuille de route (interrupteurs, alarmes, stockage, carte, infos serveur, statut d'équipe,
commandes in-game `!pop` `!time` `!online` …) vient du **protocole Rust+ officiel** (l'app
companion de Facepunch), accessible via la lib **`@liamcottle/rustplus.js`** — qui marche sur
**n'importe quel serveur sans être admin**. Il faut donc un socle : se connecter en Rust+,
maintenir la connexion, lire les infos serveur, et **répondre dans le chat in-game**.

## Décision

- Nouvelle dépendance **`@liamcottle/rustplus.js`**. Le plugin Oxide **reste** (mode « deep
  admin » : oil-rig auto, deaths précis) ; Rust+ devient la **colonne vertébrale universelle**.
- **Phase 7 = socle SEULEMENT.** On livre : modèle de pairing + gestionnaire de connexion
  persistante + la **plus petite tranche prouvable** : `!pop` et `!time`, **in-game ET Discord**.
  Aucun switch / alarme / stockage / carte ici (Phases 8-12).
- **Une connexion Rust+ par serveur Rust paired** (le bot se connecte EN TANT QUE le joueur
  dont on a le token). Au moins un pairing par serveur suffit pour lire le team chat / team info.
- **Pairing manuel (MVP).** La capture FCM (écoute des push de pairing + des Smart Alarms)
  est un sous-projet à part entière → reportée Phase 9. Ici l'utilisateur lance le CLI
  `@liamcottle/rustplus.js` lui-même et **fournit les creds au bot** via `/pair`.

## Pairing — réalité (hors-bot, MVP)

L'utilisateur exécute, **une fois par serveur**, sur sa machine :
1. `npx @liamcottle/rustplus.js fcm-register` → login Steam, génère les creds FCM/Expo.
2. `npx @liamcottle/rustplus.js fcm-listen` puis clic **« Pair »** en jeu (menu serveur Rust+).
3. La notif de pairing crache : `serverIp`, `appPort`, `steamId` (= playerId), `playerToken`.

Il colle ces 4 valeurs au bot. La commande **`/pair` est éphémère + admin-only** (le
`playerToken` est un secret = contrôle du compte sur ce serveur). Une alternative API
(`POST /pair`, protégée par `ADMIN_SECRET`) est fournie pour scripter / tester.

```json
// payload /pair (ou POST /pair)
{ "server": "Rustafied EU",   // doit exister (/setup) — relie le pairing à un canal Discord
  "serverIp": "1.2.3.4", "appPort": 28083,
  "steamId": "7656119...", "playerToken": "-1234567890" }
```

## Constats (lecture du code)

- `index.js` démarre API + bot dans **un seul process** et gère un shutdown gracieux
  (`SIGINT`/`SIGTERM` → `client.destroy()` + `httpServer.close()`). → on y branche
  `startManager()` au boot et `stopManager()` dans `shutdown()`.
- `shared/bus.js` (EventEmitter) relaie déjà API → bot (`RUST_EVENT`, `DEATH_EVENT`). Pour
  les push asynchrones futurs (alarmes, join/leave) le manager émettra sur ce bus, comme le
  webhook. **Phase 7 n'en a pas besoin** (`!pop`/`!time` sont en *pull*) → on garde minimal.
- `backend/models/server.js` : `resolve(guildId, name?)` + `findByName(name)` existent déjà →
  réutilisés pour relier un pairing à une row `servers` (donc à un `channel_id`).
- `bot/lib/resolveServer.js` : déjà utilisé par `/status` `/events` `/timer` pour l'option
  `server:` → réutilisé tel quel par `/pop` `/time`.
- `tests/helpers/testApp.js` : `resetDb()` doit lister la **nouvelle table** (sinon fuite
  entre tests). Pattern d'env muté **avant** import dynamique de la config : inchangé.
- **Interop module :** `@liamcottle/rustplus.js` (v2.5.0) est **CommonJS** et exporte la
  classe **directement** (`module.exports = RustPlus`) ; le projet est ESM (`type: module`)
  → import via `import RustPlus from '@liamcottle/rustplus.js'` (PAS de déstructuration).

## Modèle de données

Nouvelle table `rustplus_pairings`, reliée à `servers(id)` (cascade) :

```sql
CREATE TABLE IF NOT EXISTS rustplus_pairings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id    INTEGER NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  server_ip    TEXT NOT NULL,
  app_port     INTEGER NOT NULL,
  steam_id     TEXT NOT NULL,                 -- joueur dont on utilise le token
  player_token TEXT NOT NULL,                 -- secret
  is_active    INTEGER NOT NULL DEFAULT 1,    -- la connexion que le manager ouvre
  label        TEXT,                          -- ex. pseudo de celui qui a pairé
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(server_id, steam_id)
);
```

`backend/models/pairing.js` (façon `server.js`, **testable sans I/O réseau**) :
`add({serverId, serverIp, appPort, steamId, playerToken, label})`, `listActive()`,
`getByServer(serverId)`, `remove(serverId, steamId)`, `deactivate(...)`.

## Architecture du socle (nouveau dossier `rustplus/`)

Miroir des couches existantes (`backend/`, `bot/`, `shared/`, `plugin/`) :

- `rustplus/connection.js` — enveloppe **une** instance `RustPlus(ip, port, steamId, token)` :
  `.connect()`, reconnexion avec **backoff** sur `disconnected`/`error`, et **promisification**
  des appels callback de la lib (`getInfo`, `getTime`, `sendTeamMessage`) pour un code lisible.
- `rustplus/router.js` — **routeur de commandes in-game pur** : `(text, ctx) -> action`. Table
  de dispatch `{ '!pop': fn, '!time': fn }` (Phase 8 n'ajoute que des entrées). **Ignore les
  messages émis par notre propre `steam_id`** (sinon `sendTeamMessage` reboucle à l'infini).
- `rustplus/manager.js` — singleton (comme `db`) : `startManager()` charge `listActive()` et
  ouvre une connexion par pairing ; expose `getConnection(serverId)` (pour `/pop` `/time` côté
  bot) ; `stopManager()` ferme tout. Sur chaque `message` → `broadcast.teamMessage` → router.
- `bot/commands/pop.js` + `bot/commands/time.js` — slash commands (option `server:` via
  `resolveServer`) → `getConnection().getInfo()/getTime()` → embed.
- `backend/routes/pair.js` — `POST /pair` (auth `ADMIN_SECRET`) + `/pair` Discord (admin-only).

**Forme du team chat** (event `message` de la lib) : `broadcast.teamMessage.message` =
`{ steamId, name, message, color }`. Réponse : `sendTeamMessage("…")`.
**`getInfo()`** → `players`, `maxPlayers`, `queuedPlayers` (→ `!pop`). **`getTime()`** →
`time`, `sunrise`, `sunset` (→ `!time`).

## Stratégie de test (le nœud TDD)

`rustplus.js` ouvre de **vraies** websockets vers Facepunch → non unit-testable, comme le
plugin. On **isole le pur de l'I/O** :

- `tests/rustplus/router.test.js` — routeur avec un **faux client** (getInfo/getTime/
  sendTeamMessage = fakes) : `!pop` → bon texte ; `!time` → bon texte ; message de notre
  propre `steam_id` → **aucune** action (anti-boucle) ; commande inconnue → no-op.
- `tests/backend/pairing.test.js` — modèle CRUD + cascade (delete `servers` → pairings partent),
  `UNIQUE(server_id, steam_id)`, `listActive()` filtre `is_active`.
- `tests/backend/pair-route.test.js` — `POST /pair` : 200 (créé), 401 (mauvais `ADMIN_SECRET`),
  404 (serveur inconnu), 400 (champ manquant).
- `tests/bot/commands.test.js` — charge + `toJSON()` les **2 nouvelles** commandes (deploy-safety).
- `resetDb()` étendu avec `rustplus_pairings`.
- **Non couvert (vérif live, comme le plugin) :** connect/reconnect réel, vrai `getInfo`. Validé
  à la main au pairing (cf. critère 3).

## Critères d'acceptation

1. `/pair` (ou `POST /pair` avec `ADMIN_SECRET`) enregistre les creds pour un serveur existant ;
   `/unpair` les retire. Au boot, le manager ouvre **une connexion par pairing actif**.
2. Le manager reconnecte avec backoff sur coupure et **ferme proprement** sur `SIGTERM`
   (intégré au `shutdown()` de `index.js`, pas de socket fantôme).
3. **In-game** (vérif live) : `!pop` répond dans le team chat « X/Y joueurs (+Z en file) » ;
   `!time` répond l'heure en jeu. Le bot **ignore ses propres messages** (pas de boucle).
4. **Parité Discord** : `/pop` et `/time` (option `server:`) renvoient la même info en embed.
5. Routeur + modèles **unit-testés avec un client Rust+ mocké** (zéro socket live) ; suite
   verte ; `deploy-commands` sérialise les 2 nouvelles commandes ; `lint` clean.
6. **Zéro régression** : pipeline plugin/webhook intact ; **sans aucun pairing, le manager est
   un no-op** (le déploiement Railway actuel n'est pas affecté).

## Hors périmètre (phases suivantes)

- **Listener FCM intégré au bot** (capture auto du pairing + push Smart Alarm) → **Phase 9**.
- Toutes les autres commandes in-game (`!online/offline/afk/alive/prox/bot/leader/silence/
  resume/alarm/remain/stop/cargo/small/large/heli`) → **Phase 8**.
- Interrupteurs, alarmes, stockage, carte, distributeurs → **Phases 10-12**.
- Auto-réconciliation du nom de serveur via `getInfo()` (MVP : nom donné au `/setup`/`/pair`).
- Rafraîchissement / rotation du `playerToken` (MVP : re-`/pair` si expiré).
