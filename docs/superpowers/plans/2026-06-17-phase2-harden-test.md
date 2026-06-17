# Phase 2 — Durcir + tester RustLinkRelay — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Couvrir le contrat plugin↔API par des tests `node:test` déterministes (DB `:memory:`, 0 dépendance) et durcir le plugin `RustLinkRelay.cs` par une review ciblée.

**Architecture:** Tests via le runner natif `node --test` + `fetch` global contre l'app Express montée sur un port éphémère (`app.listen(0)`), DB SQLite en mémoire. Un harness unique (`tests/helpers/testApp.js`) gère env/imports/reset. Une fixture "contrat" reproduit le payload exact du plugin. Le `.cs` est revu statiquement (pas de runtime Rust ici).

**Tech Stack:** Node 24, `node:test`, `node:assert/strict`, `fetch`, Express, better-sqlite3, plugin C# Oxide/Carbon.

**Spec:** `docs/superpowers/specs/2026-06-17-phase2-harden-test-design.md`

---

## File Structure

| Fichier | Rôle |
|---|---|
| `config.js` *(modify)* | Laisser passer `:memory:` / `""` sans `path.resolve` |
| `package.json` *(modify)* | Script `"test": "node --test"` |
| `tests/helpers/testApp.js` *(create)* | Harness : env `:memory:`, imports dynamiques, `app`, `db`, `resetDb`, `startTestServer` |
| `tests/config.test.js` *(create)* | Tweak `:memory:` (red→green) |
| `tests/smoke.test.js` *(create)* | Sanity harness/DB |
| `tests/shared/time.test.js` *(create)* | `toUnix` |
| `tests/shared/events.test.js` *(create)* | `resolveEvent` |
| `tests/fixtures/plugin-payloads.js` *(create)* | Payloads exacts émis par le plugin |
| `tests/backend/webhook.test.js` *(create)* | Webhook HTTP : codes, DB, bus, auth, alias, contrat |
| `plugin/RustLinkRelay.cs` *(modify)* | Fixes conservateurs validés (Volet B) |

---

## Setup (prérequis, une fois)

- [ ] **Installer les dépendances**

Run: `npm install`
Expected: installe `better-sqlite3`, `express`, `discord.js`, `dotenv` ; crée `node_modules/`. Pas d'erreur de build natif (`better-sqlite3` compile/télécharge un prebuild).

---

## Task 1: Tweak `:memory:` + script de test

**Files:**
- Create: `tests/config.test.js`
- Modify: `config.js:6` (après `const env = process.env;`) et la propriété `db.path`
- Modify: `package.json` (bloc `scripts`)

- [ ] **Step 1: Écrire le test qui échoue**

Create `tests/config.test.js`:

```js
// Le chemin DB ":memory:" (et "") ne doit PAS passer par path.resolve(),
// sinon SQLite reçoit un faux chemin (et sur Windows, ":" est illégal).
process.env.DATABASE_PATH = ':memory:';

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../config.js');

test('config: ":memory:" reste tel quel (pas de path.resolve)', () => {
  assert.equal(config.db.path, ':memory:');
});
```

- [ ] **Step 2: Lancer le test → échec attendu**

Run: `node --test tests/config.test.js`
Expected: FAIL — `config.db.path` vaut un chemin absolu (ex. `C:\...\:memory:`) ≠ `:memory:`.

- [ ] **Step 3: Appliquer le tweak `config.js`**

Après la ligne `const env = process.env;`, ajouter :

```js
const rawDbPath = env.DATABASE_PATH ?? './data/rustlink.sqlite';
```

Puis remplacer la propriété `db` :

```js
  db: {
    // ":memory:" et "" sont des modes SQLite spéciaux : ne pas les résoudre en chemin.
    path: rawDbPath === ':memory:' || rawDbPath === '' ? ':memory:' : path.resolve(rawDbPath),
  },
```

- [ ] **Step 4: Lancer le test → succès attendu**

Run: `node --test tests/config.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Ajouter le script `test` dans `package.json`**

Dans `"scripts"`, ajouter la ligne `test` (garder les autres) :

```json
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "api": "node index.js --api-only",
    "deploy-commands": "node deploy-commands.js",
    "test": "node --test"
  },
```

- [ ] **Step 6: Commit**

```bash
git add config.js package.json tests/config.test.js
git commit -m "test: harness :memory: + script npm test"
```

---

## Task 2: Harness de test + smoke

**Files:**
- Create: `tests/helpers/testApp.js`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Écrire le harness**

Create `tests/helpers/testApp.js`:

```js
// Harness de test partagé : DB SQLite en mémoire + app Express + helper HTTP.
//
// IMPORTANT : les variables d'env DOIVENT être posées AVANT le chargement des
// modules backend, car config.js lit process.env une seule fois à l'import.
// Les imports statiques ESM sont hoistés → on utilise import() dynamique APRÈS
// avoir muté process.env.
process.env.DATABASE_PATH = ':memory:';
process.env.WEBHOOK_SECRET = ''; // auth désactivée par défaut ; les tests la mutent à chaud

const { config } = await import('../../config.js');
const { createApiServer } = await import('../../backend/server.js');
const { db } = await import('../../backend/db.js');

export { config, db };
export const app = createApiServer();

// Vide les 3 tables entre les tests (la DB :memory: persiste sur tout le fichier).
export function resetDb() {
  db.exec('DELETE FROM timers; DELETE FROM events; DELETE FROM servers;');
}

// Démarre l'app sur un port éphémère. Retourne { url, close }.
export async function startTestServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
```

- [ ] **Step 2: Écrire le smoke test**

Create `tests/smoke.test.js`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, resetDb } from './helpers/testApp.js';

beforeEach(() => resetDb());

test('harness: DB :memory: opérationnelle + resetDb la vide', () => {
  db.prepare('INSERT INTO servers (name) VALUES (?)').run('Smoke');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM servers').get().c, 1);
  resetDb();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM servers').get().c, 0);
});
```

- [ ] **Step 3: Lancer → succès attendu**

Run: `node --test tests/smoke.test.js`
Expected: PASS (1 test). Prouve que `:memory:` s'ouvre, le schéma existe, et `resetDb` purge.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/testApp.js tests/smoke.test.js
git commit -m "test: harness app/db/resetDb + smoke :memory:"
```

---

## Task 3: Tests `shared/time.js` (`toUnix`)

**Files:**
- Create: `tests/shared/time.test.js`

- [ ] **Step 1: Écrire les tests**

Create `tests/shared/time.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUnix } from '../../shared/time.js';

test('toUnix: secondes telles quelles', () => {
  assert.equal(toUnix(1718614800), 1718614800);
});

test('toUnix: millisecondes (>1e12) → secondes', () => {
  assert.equal(toUnix(1718614800000), 1718614800);
});

test('toUnix: ISO string → secondes UTC', () => {
  // 2024-06-17T10:00:00Z = 1718618400
  assert.equal(toUnix('2024-06-17T10:00:00.000Z'), 1718618400);
});

test('toUnix: null/undefined/chaîne invalide → null', () => {
  assert.equal(toUnix(null), null);
  assert.equal(toUnix(undefined), null);
  assert.equal(toUnix('pas-une-date'), null);
});
```

- [ ] **Step 2: Lancer → succès attendu (caractérisation du code existant)**

Run: `node --test tests/shared/time.test.js`
Expected: PASS (4 tests). Verrouille le comportement actuel de `toUnix`.

- [ ] **Step 3: Commit**

```bash
git add tests/shared/time.test.js
git commit -m "test: couverture toUnix (secondes/ms/ISO/null)"
```

---

## Task 4: Tests `shared/events.js` (`resolveEvent`)

**Files:**
- Create: `tests/shared/events.test.js`

- [ ] **Step 1: Écrire les tests**

Create `tests/shared/events.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEvent } from '../../shared/events.js';

test('resolveEvent: clés canoniques', () => {
  assert.equal(resolveEvent('bradley'), 'bradley');
  assert.equal(resolveEvent('helicopter'), 'helicopter');
  assert.equal(resolveEvent('cargo'), 'cargo');
});

test('resolveEvent: alias reconnus', () => {
  assert.equal(resolveEvent('heli'), 'helicopter');
  assert.equal(resolveEvent('bradleyapc'), 'bradley');
  assert.equal(resolveEvent('ch47'), 'chinook');
  assert.equal(resolveEvent('cargoship'), 'cargo');
});

test('resolveEvent: normalisation case / espaces / tirets', () => {
  assert.equal(resolveEvent('Patrol-Helicopter'), 'helicopter');
  assert.equal(resolveEvent('  CARGO_SHIP  '), 'cargo');
});

test('resolveEvent: inconnu / vide / null → null', () => {
  assert.equal(resolveEvent('dragon'), null);
  assert.equal(resolveEvent(''), null);
  assert.equal(resolveEvent(null), null);
  assert.equal(resolveEvent(undefined), null);
});
```

- [ ] **Step 2: Lancer → succès attendu**

Run: `node --test tests/shared/events.test.js`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/shared/events.test.js
git commit -m "test: couverture resolveEvent (canon/alias/normalisation/null)"
```

---

## Task 5: Tests webhook HTTP + fixture contrat

**Files:**
- Create: `tests/fixtures/plugin-payloads.js`
- Create: `tests/backend/webhook.test.js`

- [ ] **Step 1: Écrire la fixture "contrat"**

Create `tests/fixtures/plugin-payloads.js`:

```js
// Payloads EXACTEMENT tels que plugin/RustLinkRelay.cs les émet (POST /webhook/rust).
// Champs : server, event, status, spawn_time, [next_respawn], timestamp.
// Si ce fichier diverge du plugin, le contrat plugin↔API est rompu → le test casse.
const now = 1718614800;

export const PLUGIN_PAYLOADS = [
  {
    name: 'bradley/destroyed (respawn 60min)',
    body: {
      server: 'My Rust Server', event: 'bradley', status: 'destroyed',
      spawn_time: now, next_respawn: now + 3600, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'bradley',
    expectTimer: true,
  },
  {
    name: 'helicopter/spawned (sans respawn)',
    body: {
      server: 'My Rust Server', event: 'helicopter', status: 'spawned',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'helicopter',
    expectTimer: false,
  },
  {
    name: 'cargo/left',
    body: {
      server: 'My Rust Server', event: 'cargo', status: 'left',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'cargo',
    expectTimer: false,
  },
  {
    name: 'chinook/left',
    body: {
      server: 'My Rust Server', event: 'chinook', status: 'left',
      spawn_time: now, timestamp: '2024-06-17T10:00:00.000Z',
    },
    expectedEvent: 'chinook',
    expectTimer: false,
  },
];
```

- [ ] **Step 2: Écrire les tests webhook**

Create `tests/backend/webhook.test.js`:

```js
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, config, resetDb, startTestServer } from '../helpers/testApp.js';
import { bus, RUST_EVENT } from '../../shared/bus.js';
import { PLUGIN_PAYLOADS } from '../fixtures/plugin-payloads.js';

let server;
before(async () => { server = await startTestServer(); });
after(async () => { await server.close(); });

beforeEach(() => {
  resetDb();
  config.api.webhookSecret = '';            // auth off par défaut
  bus.removeAllListeners(RUST_EVENT);        // pas de fuite de listeners entre tests
});

function post(path, body, headers = {}) {
  return fetch(server.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('400 si "server" manquant', async () => {
  const res = await post('/webhook/rust', { event: 'bradley', status: 'destroyed' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

test('400 si event inconnu', async () => {
  const res = await post('/webhook/rust', { server: 'S1', event: 'dragon' });
  assert.equal(res.status, 400);
});

test('event valide + next_respawn: 200, log, timer, bus émis', async () => {
  const now = Math.floor(Date.now() / 1000);
  const next = now + 3600;
  const emitted = new Promise((resolve) => bus.once(RUST_EVENT, resolve));

  const res = await post('/webhook/rust', {
    server: 'Atlas EU', event: 'bradley', status: 'destroyed',
    spawn_time: now, next_respawn: next,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.event, 'bradley');
  assert.equal(body.next_respawn, next);

  const evt = db.prepare("SELECT * FROM events WHERE event_type='bradley'").get();
  assert.ok(evt, 'event inséré');
  assert.equal(evt.status, 'destroyed');
  assert.equal(evt.next_respawn, next);

  const timer = db.prepare("SELECT * FROM timers WHERE event_type='bradley'").get();
  assert.ok(timer, 'timer upserté');
  assert.equal(timer.expires_at, next);

  const payload = await emitted;
  assert.equal(payload.eventType, 'bradley');
  assert.equal(payload.serverName, 'Atlas EU');
  assert.equal(payload.nextRespawn, next);
});

test('event valide sans next_respawn: 200, log, PAS de timer', async () => {
  const res = await post('/webhook/rust', { server: 'S2', event: 'helicopter', status: 'spawned' });
  assert.equal(res.status, 200);
  assert.ok(db.prepare("SELECT * FROM events WHERE event_type='helicopter'").get());
  assert.equal(db.prepare("SELECT * FROM timers WHERE event_type='helicopter'").get(), undefined);
});

test('alias en entrée → stocké en clé canonique', async () => {
  const res = await post('/webhook/rust', { server: 'S3', event: 'bradleyapc', status: 'destroyed' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).event, 'bradley');
  assert.ok(db.prepare("SELECT * FROM events WHERE event_type='bradley'").get());
});

test('auth: secret configuré + header correct → 200', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/rust',
    { server: 'S4', event: 'cargo', status: 'spawned' },
    { 'x-webhook-secret': 'topsecret' });
  assert.equal(res.status, 200);
});

test('auth: secret configuré + header faux → 401', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/rust',
    { server: 'S5', event: 'cargo' },
    { 'x-webhook-secret': 'nope' });
  assert.equal(res.status, 401);
});

test('auth: secret configuré + header absent → 401', async () => {
  config.api.webhookSecret = 'topsecret';
  const res = await post('/webhook/rust', { server: 'S6', event: 'cargo' });
  assert.equal(res.status, 401);
});

test('contrat: tous les payloads du plugin sont acceptés', async () => {
  for (const p of PLUGIN_PAYLOADS) {
    const res = await post('/webhook/rust', p.body);
    assert.equal(res.status, 200, `${p.name} devrait passer (200)`);
    const body = await res.json();
    assert.equal(body.event, p.expectedEvent, `${p.name}: event canonique`);
    const timer = db.prepare('SELECT * FROM timers WHERE event_type = ?').get(p.expectedEvent);
    if (p.expectTimer) assert.ok(timer, `${p.name}: timer attendu`);
    else assert.equal(timer, undefined, `${p.name}: pas de timer attendu`);
  }
});
```

- [ ] **Step 3: Lancer → succès attendu**

Run: `node --test tests/backend/webhook.test.js`
Expected: PASS (9 tests). Note : la console peut afficher un warning `[auth] WEBHOOK_SECRET is empty` et des logs `[api] ...` — c'est normal.

- [ ] **Step 4: Lancer toute la suite**

Run: `npm test`
Expected: tous les fichiers PASS (config + smoke + time + events + webhook). 0 fail.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/plugin-payloads.js tests/backend/webhook.test.js
git commit -m "test: webhook HTTP (codes, DB, bus, auth, alias) + fixture contrat plugin"
```

---

## Task 6: Review + fixes conservateurs du plugin (Volet B)

**Files:**
- Modify (si validé): `plugin/RustLinkRelay.cs`, `plugin/README.md`

**Contrainte assumée :** pas de runtime Rust ici → review statique, pas test-verified. Validation réelle = serveur dédié (phase suivante).

- [ ] **Step 1: Présenter les findings et demander quoi appliquer**

| # | Finding | Reco |
|---|---|---|
| F1 | `OnEntitySpawned` est le hook le plus chaud de Rust ; `Classify` fait 4 type-checks/entité | Documenter (commentaire) ; pas de changement de code. Acceptable petit serveur. |
| F2 | CH47 **abattu** remonte `left` (via `OnEntityKill`), pas `destroyed` | Documenter dans README ; pas de changement (chinook rarement abattu). |
| F3 | `RespawnMinutes` pose un compte à rebours **au spawn ET** à la mort/départ ; au spawn c'est sémantiquement faux (l'event vient d'arriver) | **Recommandé** : ne poser le countdown que sur `withRespawn` (mort/départ). Diff ci-dessous. |
| F4 | Clé d'event retirée de la config → drop silencieux | Acceptable (= désactivation volontaire) ; pas de changement. |

→ **Demander à l'utilisateur** lesquels appliquer. Par défaut : F3 (code) + F2 (doc), F1/F4 laissés tels quels.

- [ ] **Step 2: [si F3 validé] Appliquer le fix dans `plugin/RustLinkRelay.cs`**

Remplacer (dans `SendEvent`) :

```csharp
            if (opt.RespawnMinutes > 0 && (withRespawn || status == "spawned"))
                nextRespawn = now + opt.RespawnMinutes * 60L;
```

par :

```csharp
            // Le countdown estime la PROCHAINE occurrence : on ne le pose qu'à la
            // fin d'un event (mort/départ, withRespawn), pas au spawn.
            if (opt.RespawnMinutes > 0 && withRespawn)
                nextRespawn = now + opt.RespawnMinutes * 60L;
```

Puis bumper la version : `[Info("RustLink Relay", "Yunooo40", "0.1.0")]` → `"0.1.1"`.

- [ ] **Step 3: [si F3/F2 validés] Mettre à jour `plugin/README.md`**

Dans le tableau des events, préciser que le countdown se déclenche **à la fin** de l'event (mort/départ), et noter (F2) qu'un CH47 abattu est rapporté comme `left`.

- [ ] **Step 4: Commit**

```bash
git add plugin/RustLinkRelay.cs plugin/README.md
git commit -m "fix(plugin): countdown uniquement en fin d'event (mort/départ) + doc"
```

> Si aucun fix n'est validé : pas de commit, noter la décision dans le résumé final.

---

## Task 7: Finalisation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-17-phase2-harden-test-design.md` (statut)

- [ ] **Step 1: Suite complète verte**

Run: `npm test`
Expected: 0 fail. Compter les tests (≈ 1+1+4+4+9 = 19, +/- selon F3).

- [ ] **Step 2: Marquer le spec comme livré**

Passer la ligne `- **Statut :**` à `livré (tests verts le 2026-06-17)`.

- [ ] **Step 3: Commit final**

```bash
git add docs/superpowers/specs/2026-06-17-phase2-harden-test-design.md
git commit -m "docs: Phase 2 durcissement/tests livré"
```

---

## Self-Review (rempli par l'auteur du plan)

- **Couverture spec :** Volet A surface 1→4 = Tasks 3,4,5 (+ fixture contrat = Task 5 step 1-2). Harness + tweak = Tasks 1,2. Volet B = Task 6. Hors-scope respecté (pas de serveur réel, pas d'Oil Rig, pas d'embeds bot). ✅
- **Placeholders :** aucun TODO/TBD ; tout le code est fourni. ✅
- **Cohérence des noms :** `resetDb`, `startTestServer`, `config.api.webhookSecret`, `RUST_EVENT`, `PLUGIN_PAYLOADS` identiques entre harness, fixture et tests. ✅
- **Risque connu :** `better-sqlite3` doit compiler/prebuild au `npm install` (Setup). Si échec build natif sous Windows → installer les Build Tools VS, hors scope tests.
