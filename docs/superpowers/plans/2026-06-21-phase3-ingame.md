# Phase 3.1 — Relais in-game — Plan d'implémentation

Date : 2026-06-21 · Branche : `feat/phase3-ingame` · Spec :
[specs/2026-06-21-phase3-ingame-design.md](../specs/2026-06-21-phase3-ingame-design.md)

Approche : TDD côté API (testable), contrat figé par fixture pour le plugin (non
unit-testable, comme en Phase 2).

## Checklist

- [x] Fixture `tests/fixtures/ingame-payloads.js` — payloads exacts des reports in-game.
- [x] Tests rouges `tests/backend/webhook.test.js` :
  - report `source:ingame` + `reporter` → timer `source='ingame'`, bus `source`+`reportedBy`.
  - `source` inconnu → retombe sur `webhook`.
  - event auto (sans source) → bus `reportedBy=null`, timer `source='webhook'`.
  - contrat : tous les `INGAME_PAYLOADS` passent (200, clé canonique, tag ingame).
- [x] `backend/routes/webhook.js` : lire+normaliser `source` (`ingame|manual|webhook`),
  passer à `Timers.upsert({source})`, émettre `source`+`reportedBy` sur le bus.
- [x] `bot/lib/embeds.js` : `notificationEmbed` affiche « Reported by <player> » +
  footer « reported in-game » quand `source==='ingame'`.
- [x] Plugin `RustLinkRelay.cs` v0.2.0 :
  - factorisation `PostEvent(...)` partagé par events auto et reports (préserve le
    comportement 0.1.1 : countdown seulement sur `withRespawn`).
  - commandes covalence `[Command]` (`/rl /timers /next`, `/report`, raccourcis) +
    parseur `OnUserChat` pour le préfixe `!` configurable.
  - `DoQuery` (GET `/timers?server=`) et `DoReport` (POST source=ingame) + cooldown
    par joueur + option admin-only.
- [x] Docs : `plugin/README.md` (section commandes + config), `README.md` (status,
  payload, roadmap).
- [x] `npm test` → **23/23 vert**. Smoke test live OK (POST report → GET timers `source=ingame`).

## Vérifs restantes (serveur Rust requis — non bloquant pour le merge)
- Charger le plugin sur un serveur Oxide/Carbon : confirmer que `[Command]` + `OnUserChat`
  se déclenchent (`/rl` et `!rl`), et que `player.Reply` rend le multi-ligne en chat.
- Confirmer la signature `OnUserChat(IPlayer, string)` sur la version courante de Rust.

## Reporté en Phase 3.2
- Auto-détection du hack de crate Oil Rig (`HackableLockedCrate` + proximité monument).
