# Phase 10 — Diagnostics / validation live — Plan

Date : 2026-06-24 · Branche : `claude/hopeful-hypatia-uyyjwp`.

Constat : les phases 8.2→9 reposent toutes sur des hypothèses **non vérifiées en live** (enums
de markers, tokens de monuments Oil Rig, formule de grille, forme des pushs FCM). Plutôt
qu'empiler une feature de plus, on outille la **validation** : capturer les payloads bruts pour
confirmer/corriger tout ça en **une seule** session live.

## Livrables
- **Module pur testé** `rustplus/diag.js` : `redactSecrets` (masque playerToken & co, casse-
  insensible, récursif), `safePushView` (aplati + body parsé + masqué — évite la fuite d'un
  token caché dans un body en chaîne), `summarizeMarkers` (types distincts + sample + grille),
  `summarizeMonuments` (flag oil rigs + tokens), `buildDiagnostics`.
- **Commande `/diag`** (admin, éphémère) : `getInfo` + `getMapMarkers` + `getMap` → bundle JSON
  redacté en pièce jointe + résumé (mapSize, types présents, tokens oil rig).
- **Logs one-shot** (si `RUSTPLUS_DIAG=true`) : `connection.js` logue markers (au seed) et
  monuments (au load) ; `fcmListener.js` logue chaque push via `safePushView`.
- **Checklist** [`docs/LIVE-VALIDATION.md`](../../LIVE-VALIDATION.md) : pas-à-pas pour la session.

## Checklist
- [x] `config.js` : `rustplus.diag` (`RUSTPLUS_DIAG`, défaut false).
- [x] `rustplus/diag.js` + `tests/rustplus/diag.test.js` (redact, safePushView **vérifie la non-
      fuite du token**, summarize markers/monuments, buildDiagnostics null-safe).
- [x] `bot/commands/diag.js` (admin, `redactSecrets(buildDiagnostics(...))`, fichier joint).
- [x] `rustplus/connection.js` : logs diag markers/monuments. `rustplus/fcmListener.js` : log
      diag des pushs (redacté).
- [x] `.env.example` + README (table `/diag` + roadmap 10) + `docs/LIVE-VALIDATION.md`.
- [x] `npm test` vert (169) + `npm run lint` clean + smoke : token bien masqué dans le log FCM.

## Notes
- **Bug évité** : un premier jet logait `redactSecrets(extractData(raw))` → le `body` étant une
  **chaîne** JSON, le playerToken n'était pas atteint par le masquage. Corrigé via `safePushView`
  (parse le body avant de masquer), couvert par un test dédié.
- **Sans bruit en prod** : `/diag` est à la demande ; les logs ne s'activent que sous le flag.

## Hors périmètre
- Persister les `persistentIds` FCM (anti-replay), capture vers fichier sur disque, `/diag` qui
  joint l'image `getMap`.
