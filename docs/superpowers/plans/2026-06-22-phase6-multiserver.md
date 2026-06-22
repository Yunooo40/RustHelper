# Phase 6 — Multi-serveur — Plan

Date : 2026-06-22 · Sur `main` (push direct) · Spec :
[specs/2026-06-22-phase6-multiserver-design.md](../specs/2026-06-22-phase6-multiserver-design.md)

Interprétation (B) : un guild suit N serveurs Rust, serveur par défaut réglable. TDD côté
modèle + migration ; commandes validées par chargement (`createBot` + `data.toJSON()`).

## Checklist
- [ ] `backend/db.js` : nouveau schéma `servers` (`UNIQUE(guild_id,name)` + `is_default`) +
      `migrateServers(db)` exporté (rebuild idempotent, FK préservées).
- [ ] `tests/backend/server-migration.test.js` : ancien schéma → migré (is_default, données +
      FK conservées, 2e serveur même guild OK, `UNIQUE(guild_id,name)` appliqué).
- [ ] `backend/models/server.js` : `addServer` (adoption orpheline + 1er=défaut), `listByGuild`,
      `getDefault`, `setDefault`, `removeByGuildName` (promotion défaut), `findByGuildName`,
      `resolve(guildId,name?)`. `findByName` préfère une row configurée. `findByGuild`→défaut.
      Retirer `upsertByGuild` + `setChannel`.
- [ ] `tests/backend/server.test.js` : add/adopt/défaut, list, setDefault, remove+promotion,
      resolve (nom/défaut/absent), findByName préfère configurée.
- [ ] `bot/commands/setup.js` : `addServer` au lieu d'`upsertByGuild` (message « défaut »).
- [ ] `bot/commands/servers.js` (`/servers`), `server-default.js`, `server-remove.js`.
- [ ] `bot/commands/{status,events,timer}.js` : option `serveur:` → `Servers.resolve`.
- [ ] `bot/lib/embeds.js` : `serverListEmbed` (liste + marqueur défaut). Reste déjà taggé.
- [ ] `npm test` vert ; `createBot` charge N commandes ; `deploy-commands` sérialise.
- [ ] README roadmap Phase 6 + mémoire + docs.

## Notes
- `findOrCreateByName` conservé (capture webhook → row `guild_id NULL`), adoptée par `/setup`.
- Toujours un défaut tant qu'il reste ≥1 serveur (promotion au remove) → `resolve` sans nom
  ne tombe jamais dans l'ambigu.

## Hors périmètre
- stats/leaderboard par-serveur, secret webhook par-serveur, multi-tenant strict, autocomplete.
