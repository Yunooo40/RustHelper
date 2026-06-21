# Phase 3 — Relais in-game (chat ↔ API) — Design

Date : 2026-06-21 · Branche : `feat/phase3-ingame`

## Objectif
Permettre aux joueurs d'interagir avec RustLink **depuis le chat Rust**, sans passer
par Discord :

1. **Report** — un joueur signale un event que le plugin ne peut pas auto-détecter
   (Oil Rig Small/Large, Deep Sea Loot) ou veut annoncer (heli inbound…). Le plugin
   relaie vers l'API → notification Discord + timer, exactement comme un event auto.
2. **Query** — un joueur demande les timers actifs (`!rl` / `!timers`) ; le plugin lit
   l'API et répond dans le chat in-game.

## Pourquoi ça tient en peu de code
Le pipeline existe déjà : `POST /webhook/rust` → log event + upsert timer → `bus.emit(RUST_EVENT)`
→ le bot poste l'embed. Et `GET /timers?server=<name>` existe déjà (routes/timers.js).
Donc côté **API** la Phase 3.1 est *additive* : on accepte deux champs optionnels
(`source`, `reporter`) sur le webhook et on les fait remonter. Tout le reste est côté plugin.

## Contrat plugin → API (report in-game)
`POST /webhook/rust` (mêmes auth/validation que les events auto) :
```json
{
  "server": "<ServerName, = /setup>",
  "event": "small",            // clé OU alias → resolveEvent()
  "status": "called",
  "source": "ingame",
  "reporter": "<pseudo joueur>",
  "spawn_time": 1718614800,
  "next_respawn": 1718615700,  // optionnel : now + minutes configurées
  "timestamp": "..."
}
```
- `source` accepté : `webhook` (défaut, events auto) | `ingame` | `manual`. Valeur inconnue → `webhook`.
- `reporter` : libre, optionnel. Stocké tel quel dans `events.payload`, remonté sur le bus.
- L'API ne connaît PAS la sémantique des durées : c'est le plugin qui calcule `next_respawn`
  (minutes configurables par event). L'API reste générique.

## Changements API (TDD)
1. `backend/routes/webhook.js`
   - Lire `body.source` → normaliser (`ingame`/`manual`/`webhook`), passer à `Timers.upsert({ source })`.
   - Émettre sur le bus `source` + `reportedBy: body.reporter ?? null` (en plus des champs actuels).
2. `bot/lib/embeds.js` — `notificationEmbed` : si `reportedBy`, ajouter un champ
   « Signalé par » ; si `source === 'ingame'`, suffixe discret (« via in-game »).
3. `bot/bot.js` — déjà transparent (forward du payload complet). Rien à changer si le bus
   transporte les nouveaux champs.

## Plugin `RustLinkRelay.cs` (v0.2.0) — non unit-testable (vérif serveur)
- Nouvelle config : `ChatCommands { Enabled, Prefix="!", AdminOnly=false, CooldownSeconds=60,
  ReportMinutes per event }`, `ApiBaseUrl` (pour le GET, dérivé du WebhookUrl si vide).
- `[ChatCommand("rl")]` + alias `timers`/`next` → GET `ApiBaseUrl/timers?server=<name>` →
  formate les timers actifs et les renvoie au joueur (PrintToChat).
- Report : `[ChatCommand("report")]` + raccourcis `small/large/deep/heli/cargo/bradley/chinook`
  → `SendEvent(event, "called", source:"ingame", reporter:player)` avec cooldown par joueur.
- `SendEvent` étendu : params optionnels `source` + `reporter` ajoutés au payload.

## Tests (node:test, comme Phase 2)
- `tests/fixtures/ingame-payloads.js` — payloads EXACTS émis par le plugin pour les reports.
- `tests/backend/webhook.test.js` — nouveaux cas :
  - report `ingame` + `reporter` → 200, event loggé (payload contient source+reporter),
    timer `source='ingame'`, bus émet `source='ingame'` + `reportedBy`.
  - alias in-game (`small` → `oil_rig_small`) accepté.
  - `source` inconnu → retombe sur `webhook`.
  - contrat : tous les `INGAME_PAYLOADS` passent (200, event canonique).

## Hors scope (Phase 3.2, serveur requis)
- Auto-détection du hack de crate Oil Rig (hooks `OnCrateHack`/`HackableLockedCrate`) — non
  unit-testable, à valider sur serveur live. Reporté volontairement.

## Défauts produit (modifiables en config)
- Reports ouverts à tous + cooldown 60s/joueur (`AdminOnly=true` pour restreindre).
- Préfixe `!`. Durées de report par défaut : oil_rig_small/large = 15 min, deep_sea = 0
  (pas de timer), heli/cargo/bradley/chinook = 0 (annonce sans timer).
