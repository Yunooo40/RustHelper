// IMPORTANT: testApp.js first — it sets DATABASE_PATH=:memory: before db.js loads.
import { db, resetDb } from '../helpers/testApp.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Servers from '../../backend/models/server.js';

beforeEach(() => resetDb());

const G = 'guild-1';

test('addServer: le 1er serveur du guild devient le défaut', () => {
  const s = Servers.addServer({ guildId: G, name: 'Atlas', channelId: 'c1' });
  assert.equal(s.name, 'Atlas');
  assert.equal(s.is_default, 1);
  assert.equal(Servers.getDefault(G).id, s.id);
});

test('addServer: les serveurs suivants ne sont pas défaut', () => {
  Servers.addServer({ guildId: G, name: 'Atlas', channelId: 'c1' });
  const s2 = Servers.addServer({ guildId: G, name: 'Nomad', channelId: 'c2' });
  assert.equal(s2.is_default, 0);
  assert.equal(Servers.getDefault(G).name, 'Atlas');
  assert.equal(Servers.listByGuild(G).length, 2);
});

test('addServer: ré-ajouter le même nom met à jour le canal, pas de doublon (insensible casse)', () => {
  Servers.addServer({ guildId: G, name: 'Atlas', channelId: 'c1' });
  const again = Servers.addServer({ guildId: G, name: 'atlas', channelId: 'c2' });
  assert.equal(again.channel_id, 'c2');
  assert.equal(Servers.listByGuild(G).length, 1);
});

test('addServer: adopte une row orpheline (guild NULL) capturée par le webhook', () => {
  const orphan = Servers.findOrCreateByName('Atlas');
  assert.equal(orphan.guild_id, null);
  const adopted = Servers.addServer({ guildId: G, name: 'Atlas', channelId: 'c1' });
  assert.equal(adopted.id, orphan.id, 'même row réutilisée → historique conservé');
  assert.equal(adopted.guild_id, G);
  assert.equal(adopted.is_default, 1);
  assert.equal(Servers.listByGuild(G).length, 1);
});

test('listByGuild: défaut en premier, puis alphabétique', () => {
  Servers.addServer({ guildId: G, name: 'Zulu' }); // défaut (1er)
  Servers.addServer({ guildId: G, name: 'Alpha' });
  Servers.addServer({ guildId: G, name: 'Mike' });
  const names = Servers.listByGuild(G).map((s) => s.name);
  assert.equal(names[0], 'Zulu');
  assert.deepEqual(names.slice(1), ['Alpha', 'Mike']);
});

test('setDefault: déplace le défaut, un seul à la fois', () => {
  Servers.addServer({ guildId: G, name: 'Atlas' });
  const b = Servers.addServer({ guildId: G, name: 'Nomad' });
  assert.ok(Servers.setDefault(G, b.id));
  assert.equal(Servers.getDefault(G).id, b.id);
  assert.equal(Servers.listByGuild(G).filter((s) => s.is_default).length, 1);
});

test('setDefault: refuse un serveur d’un autre guild', () => {
  const a = Servers.addServer({ guildId: G, name: 'Atlas' });
  const other = Servers.addServer({ guildId: 'guild-2', name: 'Foreign' });
  assert.equal(Servers.setDefault(G, other.id), null);
  assert.equal(Servers.getDefault(G).id, a.id);
});

test('removeByGuildName: retire le défaut et promeut un nouveau', () => {
  Servers.addServer({ guildId: G, name: 'Atlas' }); // défaut
  Servers.addServer({ guildId: G, name: 'Nomad' });
  const res = Servers.removeByGuildName(G, 'Atlas');
  assert.equal(res.removed, true);
  assert.ok(res.newDefault);
  assert.equal(Servers.getDefault(G).name, 'Nomad');
  assert.equal(Servers.listByGuild(G).length, 1);
});

test('removeByGuildName: retirer un non-défaut ne touche pas au défaut', () => {
  Servers.addServer({ guildId: G, name: 'Atlas' });
  Servers.addServer({ guildId: G, name: 'Nomad' });
  const res = Servers.removeByGuildName(G, 'Nomad');
  assert.equal(res.removed, true);
  assert.equal(res.newDefault, null);
  assert.equal(Servers.getDefault(G).name, 'Atlas');
});

test('removeByGuildName: nom absent → removed=false', () => {
  Servers.addServer({ guildId: G, name: 'Atlas' });
  assert.deepEqual(Servers.removeByGuildName(G, 'Ghost'), { removed: false, newDefault: null });
});

test('removeByName: supprime toutes les rows du nom (insensible casse) + orphelines', () => {
  Servers.addServer({ guildId: G, name: 'Atlas', channelId: 'c1' }); // row de guild
  db.prepare('INSERT INTO servers (name) VALUES (?)').run('Atlas');   // orpheline (guild NULL), même nom
  Servers.addServer({ guildId: G, name: 'Keep' });                   // ne doit PAS partir
  const removed = Servers.removeByName('atlas');
  assert.equal(removed, 2, 'la row du guild + l’orpheline du même nom');
  assert.deepEqual(Servers.list().map((s) => s.name), ['Keep']);
});

test('removeByName: nom absent → 0', () => {
  assert.equal(Servers.removeByName('Ghost'), 0);
});

test('resolve: nom explicite, sinon défaut, sinon undefined', () => {
  const a = Servers.addServer({ guildId: G, name: 'Atlas' });
  const b = Servers.addServer({ guildId: G, name: 'Nomad' });
  assert.equal(Servers.resolve(G, 'Nomad').id, b.id);
  assert.equal(Servers.resolve(G, 'nomad').id, b.id, 'insensible à la casse');
  assert.equal(Servers.resolve(G).id, a.id, 'sans nom → défaut');
  assert.equal(Servers.resolve(G, 'Ghost'), undefined);
  assert.equal(Servers.resolve('empty-guild'), undefined);
});

test('findByName: préfère une row configurée (canal/guild) à une orpheline', () => {
  db.prepare('INSERT INTO servers (name) VALUES (?)').run('Atlas'); // orpheline (guild NULL, pas de canal)
  db.prepare('INSERT INTO servers (guild_id, name, channel_id) VALUES (?, ?, ?)').run(G, 'Atlas', 'c1');
  const found = Servers.findByName('Atlas');
  assert.equal(found.channel_id, 'c1');
  assert.equal(found.guild_id, G);
});
