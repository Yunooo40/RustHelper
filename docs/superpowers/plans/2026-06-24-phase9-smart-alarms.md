# Phase 9 — Smart Alarms → Discord (FCM) — Plan

Date : 2026-06-24 · Branche : `claude/hopeful-hypatia-uyyjwp`.

Objectif : recevoir les **Smart Alarm** Rust+ (alarmes de raid) et les poster dans Discord.
C'est *la* feature signature de Rust+. Mécanisme : push **FCM** (Google) reçus par
`@liamcottle/push-receiver` (déjà présent en transitif via `rustplus.js`), avec des
credentials **au niveau du compte** (pas par serveur).

## Architecture (comme la socket Rust+)
- **Cœur pur & testé** : `rustplus/fcm.js` (`extractData` / `classifyNotification` /
  `matchPairingServerId`) — aucune socket, aucun fs. Testé avec fixtures.
- **Intégration validée au runtime** : `rustplus/fcmListener.js` enveloppe le
  `PushReceiverClient`, branche `ON_DATA_RECEIVED` + `ON_NOTIFICATION_RECEIVED`, résout le
  serveur et émet `ALARM_EVENT`. **No-op sûr** sans credentials → déploiement actuel inchangé.

## Points clés
- **API faisant autorité** (relevée dans le CLI `fcm-listen` de rustplus.js) :
  `new PushReceiverClient(gcm.androidId, gcm.securityToken, [])`, events `ON_DATA_RECEIVED` /
  `ON_NOTIFICATION_RECEIVED`, `await connect()`, `destroy()`.
- **Forme du push défensive** : champs en `appData` (`[{key,value}]`) OU `notification.data`.
  `extractData` aplatit les deux ; `body` = JSON string → parsé (ip/port/name/desc).
- **Routage** : alarme `ip/port` → match sur `rustplus_pairings` → `server_id` → salon ;
  repli sur `Servers.findByName(body.name)` ; sinon `channelId` null (le bot no-op).
- **Seules les alarmes** atteignent Discord (`pairing`/`team`/`player` ignorés en v1).

## Checklist
- [x] `shared/bus.js` : `ALARM_EVENT`.
- [x] `config.js` : `rustplus.fcm { enabled (RUSTPLUS_FCM_ENABLED), credentialsPath
      (RUSTPLUS_FCM_CREDENTIALS) }`.
- [x] `rustplus/fcm.js` (pur) : extract/classify/match.
- [x] `rustplus/fcmListener.js` : `startFcmListener` (no-op si pas de creds), `handleNotification`
      (exporté, testable), `stopFcmListener` (`destroy()`). `require` profond via `createRequire`.
- [x] `bot/lib/embeds.js` : `alarmEmbed` (rouge alerte 0xB71C1C). `bot/bot.js` : abonnement
      `ALARM_EVENT`. `index.js` : start au boot (sauté en `--api-only`) + stop au shutdown.
- [x] `package.json` : `@liamcottle/push-receiver` en dép directe (déjà au lock) ; lock resync.
- [x] `tests/rustplus/fcm.test.js` : extract/classify (2 formes, pairing/team/null, body cassé),
      match (exact/repli/null), `handleNotification` (émet + résout, non-alarme → null, repli nom).
- [x] `.env.example` + README (roadmap 9). Smoke : no-op sans creds, require résout, pas de crash.
- [x] `npm test` vert (162) + `npm run lint` clean.

## Sécurité
- `playerToken` des pushes pairing **non stocké** (pas d'auto-pairing en v1 — surprise + secret).
- Credentials lues depuis un fichier hors repo (`RUSTPLUS_FCM_CREDENTIALS`), jamais loggées.

## Hors périmètre (suite)
- Auto-pairing depuis les pushes `pairing` (créer la pairing + token), opt-in DM par joueur,
  dédup via `persistentIds` persistés, alarmes → mentions de rôle.
