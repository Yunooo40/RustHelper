# Phase 5 — Déploiement (Railway + SQLite) — Plan

Date : 2026-06-22 · Sur `main` (push direct) · Spec :
[specs/2026-06-22-phase5-deploy-design.md](../specs/2026-06-22-phase5-deploy-design.md)

Changements infra/config uniquement (aucune logique métier). Vérifié par les tests
existants + un smoke-test réel du binding `PORT`.

## Checklist
- [x] `config.js` : `port: Number(env.PORT ?? env.API_PORT ?? 3000)` (PORT de l'hôte d'abord).
- [x] `package.json` : `engines.node` → `24.x` (aligné sur le prébuilt `better-sqlite3 ^12`).
- [x] `.nvmrc` (`24`) : Nixpacks/nvm choisissent la bonne version Node.
- [x] `railway.json` : builder Nixpacks, `npm start`, healthcheck `/health`, restart on-failure.
- [x] `Procfile` (`web: npm start`) : portabilité Render/VPS.
- [x] `.env.example` : notes PORT (injecté par l'hôte, lu en premier) + `DATABASE_PATH` volume.
- [x] `DEPLOY.md` : guide pas-à-pas Railway (volume `/data`, env vars, commandes, plugin) +
      dépannage + section autres hôtes.
- [x] `README` : roadmap → Phase 5, section « Deployment notes » pointant vers `DEPLOY.md`.
- [x] `npm test` → **51/51** (inchangé, défaut PORT=3000 préservé quand non défini).

## Vérif faite
- **Smoke-test** : `PORT=4999 node index.js --api-only` (avec `.env` `API_PORT=3000`) →
  l'app bind bien **4999** et `GET /health` renvoie `200 {"ok":true}`. Précédence PORT validée.

## Vérif restante (action utilisateur — non bloquant)
- Créer le projet Railway depuis le repo, monter le volume `/data`, poser les env vars,
  générer le domaine, lancer `npm run deploy-commands` une fois.
- Brancher le plugin sur l'URL publique + `WEBHOOK_SECRET`, tester via `rustlink.test`.
- ⚠️ Toujours en attente : validation du C# du plugin (Oil Rig auto, deaths, !commandes)
  sur un vrai serveur Rust — le déploiement rend l'API joignable mais ne teste pas le plugin.

## Reporté (Phase 6+)
- Migration PostgreSQL, multi-serveur réel, DM opt-in par utilisateur.
