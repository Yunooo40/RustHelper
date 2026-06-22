# Phase 5 — Déploiement (Railway + SQLite) — Design

Date : 2026-06-22 · Sur `main` (push direct)

## Problème

Tout le cœur est codé et testé (51/51 vert) mais le bot **n'a jamais tourné en vrai** :
pas d'URL publique → le plugin Rust ne peut pas atteindre `POST /webhook/rust`, et
personne ne peut utiliser les commandes. Il faut un hébergement 24/7 joignable.

## Décision

Déployer le **processus unique** (API + bot dans un seul `node index.js`) sur **Railway**,
en gardant **SQLite** sur un **volume persistant**. Pas de PostgreSQL : sur-ingénierie pour
une charge mono-instance. La migration Postgres reste possible plus tard (elle ne touche que
`backend/models`, les routes/commandes en dépendent, pas du SQL).

## Contraintes & constats (lecture du code)

- `config.api.port` lisait `API_PORT` → **ne lit pas le `PORT` injecté par Railway**.
  Seul vrai changement de code nécessaire.
- Le reste est déjà piloté par env : `DATABASE_PATH`, secrets Discord, `WEBHOOK_SECRET`.
- `backend/db.js` fait déjà `mkdirSync(dirname(path), {recursive:true})` → un chemin de
  volume type `/data/rustlink.sqlite` fonctionne au premier boot.
- `/health` existe déjà (→ healthcheck). `engines.node` était `>=18` (trop lâche → risque
  que Nixpacks choisisse une version sans binaire prébuilt `better-sqlite3`).
- Les commandes slash se déclarent **une fois** (`deploy-commands.js`), pas à chaque boot.

## Critères d'acceptation

1. L'app écoute sur le `PORT` fourni par l'hôte (et garde `API_PORT` en repli local).
2. Version Node épinglée (local == prod) cohérente avec le prébuilt `better-sqlite3 ^12`.
3. Config de déploiement présente : build Nixpacks, `npm start`, healthcheck `/health`,
   politique de redémarrage.
4. La DB SQLite persiste entre redéploiements (volume `/data`).
5. Guide de déploiement reproductible (env vars, volume, enregistrement des commandes,
   branchement du plugin) + dépannage.
6. 51/51 tests toujours verts (aucune logique métier touchée).

## Hors périmètre (Phase 5)

- Création réelle du projet Railway + test sur serveur Rust live (action utilisateur).
- Migration PostgreSQL, multi-serveur réel, DM opt-in par utilisateur (→ plus tard).
