# Phase 7 — Socle Rust+ — Plan

Date : 2026-06-23 · Branche : `feat/phase7-rustplus` · Spec :
[specs/2026-06-23-phase7-rustplus-foundation-design.md](../specs/2026-06-23-phase7-rustplus-foundation-design.md)

Socle companion Rust+ : pairing manuel + gestionnaire de connexion + tranche prouvable
`!pop`/`!time` (in-game + Discord). Dép. `@liamcottle/rustplus.js@2.5.0` (CJS, `import RustPlus
from '...'` — la classe est l'export par défaut). TDD sur le **pur** (modèle + routeur), client
Rust+ **mocké** ; la websocket réelle se valide en live au pairing (comme le plugin).

## Checklist
- [x] `npm i @liamcottle/rustplus.js` (fait) + `.env.example` (rappel : creds en DB, pas en env).
- [x] `config.js` : section `rustplus` (`enabled` via `RUSTPLUS_ENABLED`, backoff min/max).
- [x] `backend/db.js` : table `rustplus_pairings` (FK `servers(id)` cascade, `UNIQUE(server_id,
      steam_id)`). `tests/helpers/testApp.js` : `resetDb()` inclut la table.
- [x] `backend/models/pairing.js` : `add`, `listActive`, `getByServer`, `remove`, `deactivate`.
- [x] `tests/backend/pairing.test.js` : add/get/listActive (filtre is_active), `UNIQUE`,
      cascade (delete `servers` → pairings partent), remove.
- [x] `backend/routes/pair.js` : `POST /pair` (auth `ADMIN_SECRET`, résout `server` via modèle)
      + `DELETE /pair`. Monté dans `backend/server.js`.
- [x] `tests/backend/pair-route.test.js` : 200 / 401 (mauvais secret) / 404 (serveur inconnu) /
      400 (champ manquant).
- [x] `rustplus/router.js` : routeur **pur** `(msg, client) -> Promise<void>`. Table dispatch
      `{'!pop','!time'}`. Ignore notre propre `steamId` (anti-boucle). Inconnu → no-op.
- [x] `tests/rustplus/router.test.js` : fake client (getInfo/getTime/sendTeamMessage) → `!pop`
      et `!time` répondent le bon texte ; self-message → 0 action ; inconnu → 0 action.
- [x] `rustplus/connection.js` : enveloppe 1 `RustPlus`, `connect()`, reconnexion backoff,
      promisification (`getInfoAsync`/`getTimeAsync`/`sendTeamMessageAsync`), branche `message`
      → router.
- [x] `rustplus/manager.js` : singleton. `startManager()` (ouvre 1 conn/pairing actif),
      `getConnection(serverId)`, `stopManager()` (ferme tout). No-op si aucun pairing.
- [x] `bot/commands/pop.js` + `bot/commands/time.js` : option `server:` via `resolveServer`,
      appellent `manager.getConnection(serverId)` → embed. Erreur claire si non paired/offline.
- [x] `bot/commands/pair.js` (admin-only) + `unpair.js` : ingestion creds via Discord.
- [x] `bot/lib/embeds.js` : `popEmbed` + `timeEmbed`.
- [x] `index.js` : `startManager()` au boot (après bot) ; `stopManager()` dans `shutdown()`.
      Sauter en `--api-only`.
- [x] `tests/bot/commands.test.js` : compte mis à jour, `toJSON()` OK pour les 4 nouvelles cmds.
- [x] `npm test` vert + `npm run lint` clean.
- [x] README roadmap Phase 7 + `DEPLOY.md` (note pairing) + mémoire + corriger ligne interop du spec.

## Notes
- **Anti-boucle** : `sendTeamMessage` renvoie aussi notre propre message via `message` → le
  routeur DOIT filtrer `broadcast.teamMessage.steamId === pairing.steam_id`.
- **Promisification** : la lib v2.5 prend des callbacks `(message) => {}` → on enveloppe en
  promesses dans `connection.js` (timeout de sécurité) pour des commandes lisibles.
- **No-op sûr** : sans pairing, `startManager()` ne fait rien → Railway actuel inchangé.
- **Sécurité** : `playerToken` = secret ; `/pair` éphémère + admin-only, `POST /pair` derrière
  `ADMIN_SECRET`. Ne jamais logguer le token.

## Hors périmètre (Phases 8-12)
- Listener FCM (auto-pairing + push Smart Alarm) → P9.
- Autres commandes in-game, switches, alarmes, stockage, carte → P8+.
- Reconnexion/refresh du token, auto-réconciliation du nom via `getInfo()`.
