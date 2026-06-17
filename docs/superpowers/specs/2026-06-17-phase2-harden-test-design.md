# Phase 2 — Durcir + tester le plugin RustLinkRelay

- **Date :** 2026-06-17
- **Statut :** livré — Volet A (19 tests verts) + Volet B (F1–F4 appliqués, plugin v0.1.1) le 2026-06-17
- **Scope :** durcir et tester l'intégration Phase 2 existante (plugin Oxide/Carbon ↔ API webhook)

## Contexte

Le commit "Add Phase 2 Oxide/Carbon plugin (RustLinkRelay)" a déjà livré :

- `plugin/RustLinkRelay.cs` (v0.1.0) — relaie `helicopter` / `chinook` / `cargo` /
  `bradley` vers `POST /webhook/rust`, avec warmup au boot, config par event, commande
  `rustlink.test`.
- `backend/routes/webhook.js` — valide `server` + `event`, log l'event, upsert le timer
  si `next_respawn`, émet `RUST_EVENT` sur le bus in-process.

**Problèmes adressés ici :**

1. Zéro test dans le repo, alors que le contrat plugin↔API est testable sans Rust.
2. Le plugin n'a jamais été relu/durci.

La **validation end-to-end** (serveur Rust dédié réel) et l'**extension** (Oil Rig /
deep-sea) sont hors scope (phases suivantes).

## Objectif

Un filet de sécurité automatisé sur le contrat plugin↔API, + une review ciblée du
plugin `.cs`, sans introduire de dépendance runtime.

---

## Volet A — Tests (`node:test`, zéro dépendance)

### Surface testée (bas en haut)

1. **`shared/events.js` → `resolveEvent`**
   - clés canoniques reconnues
   - alias résolus (`heli`→`helicopter`, `bradleyapc`→`bradley`, etc.)
   - normalisation case / espaces / tirets (`"Patrol-Helicopter"`)
   - inconnu → `null` ; `null`/`""`/`undefined` → `null`

2. **`shared/time.js` → `toUnix`**
   - secondes telles quelles ; millisecondes (`> 1e12`) → secondes
   - ISO string → secondes ; `null` → `null` ; chaîne invalide → `null`

3. **`backend/routes/webhook.js` (HTTP, stack Express complète)**
   - `server` manquant → **400**
   - `event` inconnu → **400**
   - event valide + `next_respawn` → **200**, ligne `events` insérée, timer **upserté**,
     `bus` émet `RUST_EVENT` avec `{ serverName, channelId, eventType, status, spawnTime, nextRespawn }`
   - event valide **sans** `next_respawn` → **200**, loggé, **aucun** timer
   - alias en entrée (`"heli"`, `"bradleyapc"`) → stocké en clé canonique
   - **auth** (`verifyWebhookSecret`) :
     - secret configuré + `x-webhook-secret` correct → **200**
     - secret configuré + header faux/absent → **401**
     - pas de secret configuré → **200** (mode dev)

4. **Fixture "contrat"** — un payload JSON *exactement* tel que `RustLinkRelay.cs`
   l'émet (ex. `bradley/destroyed` avec `next_respawn`, `helicopter/spawned` sans),
   passé dans le webhook → assert **200** + bonnes lignes DB. C'est le pont qui casse
   si le payload du plugin et les attentes de l'API divergent.

### Harness

- `tests/helpers/testApp.js` :
  - met `process.env.DATABASE_PATH = ':memory:'` **avant** import dynamique de
    `backend/server.js` + `backend/db.js` (ESM : import statique hoisté, donc on passe
    par `await import(...)`).
  - expose `app`, `db`, `resetDb()` (`DELETE FROM timers; events; servers;`),
    `startTestServer()` (`app.listen(0)` → base URL pour `fetch`) et un teardown qui
    ferme le serveur.
- Requêtes via `fetch` global (Node ≥ 18, ici v24).
- Assertions bus via `bus.once(RUST_EVENT, …)` posé avant la requête.
- Auth : `verifyWebhookSecret` lit `config.api.webhookSecret` à chaque appel → un test
  peut muter `config.api.webhookSecret` à chaud (pas besoin de 2 instances d'app).
- `resetDb()` en `beforeEach` (la DB `:memory:` persiste au sein d'un fichier de test).

### Tweak habilitant `config.js`

`path.resolve(':memory:')` produirait un faux chemin. Fix 1 ligne :

```js
const raw = env.DATABASE_PATH ?? './data/rustlink.sqlite';
// ...
db: { path: (raw === ':memory:' || raw === '') ? ':memory:' : path.resolve(raw) }
```

Utile aussi pour des exécutions éphémères.

### package.json

- ajouter `"test": "node --test"`.

---

## Volet B — Review du plugin `RustLinkRelay.cs`

Review statique + fixes **conservateurs**. Contrainte assumée : pas de runtime Rust ici
→ review-driven, pas test-verified (la vraie validation = serveur dédié, phase suivante).

Findings candidats à arbitrer avec l'utilisateur :

- `OnEntitySpawned` est le hook le plus sollicité de Rust (tous les spawns) → 4
  type-checks/entité. Note ou garde pour serveurs chargés.
- CH47 abattu remonte `left` (via `OnEntityKill`) et non `destroyed`. Voulu ?
- Bradley pose un compte à rebours 60 min au **spawn ET** à la **mort**. Sémantique OK ?
- Clé d'event retirée de la config → drop silencieux (robustesse mineure).

Sortie : liste des findings → l'utilisateur choisit lesquels appliquer → changements
conservateurs, bump version plugin + maj README si comportement modifié.

---

## Hors scope (explicite)

- Validation sur serveur Rust dédié réel (phase "end-to-end").
- Détection Oil Rig (small/large) + deep-sea (phase "extension", proximité monument).
- Tests des embeds Discord côté bot.

## Critères de succès

- `npm test` vert, sans dépendance runtime ajoutée.
- Le contrat webhook (codes, DB, bus, auth, alias) est couvert par des tests
  déterministes sur DB `:memory:`.
- La fixture "contrat" reflète fidèlement le payload du plugin.
- Findings plugin documentés ; fixes appliqués limités à ce que l'utilisateur valide.

## Décisions validées

- Runner : `node:test` natif (0 dépendance).
- HTTP : `fetch` + `app.listen(0)` (pas de `supertest`).
- Tweak `config.js` `:memory:` : accepté.
