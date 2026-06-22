# Phase 6 — Multi-serveur (1 Discord → N serveurs Rust) — Design

Date : 2026-06-22 · Sur `main` (push direct)

## Problème

Le MVP impose **1 serveur Rust par Discord** : `servers.guild_id` est `UNIQUE` et `/setup`
fait un `ON CONFLICT(guild_id)` (il écrase). Or un clan joue souvent sur plusieurs serveurs
(Rustafied EU + Atlas + Rusticated…) et veut tous les suivre depuis le même Discord.

## Décision — interprétation (B)

Un **guild peut suivre plusieurs serveurs Rust**. Chaque serveur a son canal. Un serveur
**« par défaut » réglable** sert aux commandes sans argument. On NE fait PAS du multi-tenant
strict (collision de noms entre guilds différents) : le routage webhook reste **par nom**,
le secret par-serveur (colonne `webhook_secret` déjà présente) viendra plus tard.

## Constats (lecture du code)

- `upsertByGuild` (→ `ON CONFLICT(guild_id)`) : seul appelant = `setup.js`. À remplacer.
- `findByGuild` : `status/events/timer/leaderboard`. Renvoie aujourd'hui l'unique row du guild.
- `setChannel` : **mort** (aucun appelant) → supprimé.
- `findOrCreateByName` (webhook x2, route timers, test stats) : crée une row **guild_id NULL**
  si le serveur est inconnu (capture avant `/setup`). À conserver → ces rows « orphelines »
  seront **adoptées** par `/setup`.
- `findByName` (routage bot, routes events/timers) : `.get()` une row par nom → à rendre
  robuste (préférer une row configurée : `channel_id`/`guild_id` non nuls).
- Retirer `UNIQUE(guild_id)` impose un **rebuild** de la table `servers` (SQLite ne sait pas
  DROP une contrainte inline) → migration.

## Modèle de données

`servers` : `guild_id UNIQUE` → `guild_id` (non unique) + `UNIQUE(guild_id, name)` +
colonne `is_default INTEGER NOT NULL DEFAULT 0` (un seul défaut par guild).

**Migration idempotente** (dans `db.js`, fonction exportée `migrateServers(db)` testable) :
détecte l'ancien schéma (`is_default` absent) → reconstruit la table en préservant les `id`
(donc les FK events/timers/deaths), `foreign_keys=OFF` le temps du rebuild, `is_default=1`
pour les rows ayant un `guild_id` (l'ancien `UNIQUE(guild_id)` garantit 1 serveur/guild).

## Critères d'acceptation

1. `/setup <serveur> [canal]` **ajoute** un serveur (le 1er du guild devient défaut), adopte
   une row orpheline du même nom si elle existe (historique conservé).
2. `/servers` liste les serveurs du guild (défaut marqué) ; `/server-default <s>` change le
   défaut ; `/server-remove <s>` retire (et promeut automatiquement un nouveau défaut).
3. `/status` `/events` `/timer` acceptent une option `serveur:` ; sans argument → défaut du
   guild (ou l'unique). Erreur claire si le guild n'a aucun serveur, ou si le nom est inconnu.
4. Migration : données préservées, FK intactes, idempotente, schéma neuf identique côté DB
   fraîche et DB migrée. Test dédié.
5. Suite verte (étendue), `createBot` charge toutes les commandes, `deploy-commands`
   sérialise (les nouvelles commandes incluses).

## Hors périmètre (plus tard)

- `/stats` `/leaderboard` par-serveur (restent globaux pour l'instant — déjà le cas).
- Secret webhook par-serveur, multi-tenant strict (collisions de noms entre guilds).
- Autocomplétion du nom de serveur dans les options de commande.
- `/player` (stub, aucune logique serveur) : inchangé.
