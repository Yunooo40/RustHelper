// IMPORTANT: testApp first — loading a command pulls in models/db.js, which must
// open :memory: (not the real DB). This mirrors what deploy-commands.js does at runtime.
import '../helpers/testApp.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as Servers from '../../backend/models/server.js';
import { resetDb } from '../helpers/testApp.js';
import notify from '../../bot/commands/notify.js';

const commandsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bot', 'commands');

async function loadCommands() {
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));
  const cmds = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(commandsDir, file)).href);
    cmds.push({ file, cmd: mod.default ?? mod });
  }
  return cmds;
}

test('chaque commande expose { data, execute } et se sérialise (deploy-commands)', async () => {
  const cmds = await loadCommands();
  assert.ok(cmds.length >= 19, `attendu >=19 commandes, vu ${cmds.length}`);
  for (const { file, cmd } of cmds) {
    assert.ok(cmd?.data?.name, `${file}: data.name manquant`);
    assert.equal(typeof cmd.execute, 'function', `${file}: execute() manquant`);
    assert.doesNotThrow(() => cmd.data.toJSON(), `${file}: data.toJSON() a échoué`);
  }
});

test('noms de commande uniques + commandes multi-serveur présentes', async () => {
  const cmds = await loadCommands();
  const names = cmds.map((c) => c.cmd.data.name);
  assert.equal(new Set(names).size, names.length, 'noms de commande dupliqués');
  for (const n of ['setup', 'servers', 'server-default', 'server-remove', 'status', 'events', 'timer', 'pop', 'time', 'pair', 'unpair', 'notify', 'watch', 'switch']) {
    assert.ok(names.includes(n), `commande /${n} absente`);
  }
});

test('/notify: toggle afk puis affiche l’état du serveur', async () => {
  resetDb();
  const s = Servers.addServer({ guildId: 'g', name: 'Srv', channelId: 'c' });
  let replied = null;
  const interaction = {
    guildId: 'g',
    options: {
      getString: () => null,                       // pas de server: → défaut du guild
      getBoolean: (n) => (n === 'afk' ? true : null),
    },
    reply: async (payload) => { replied = payload; },
  };
  await notify.execute(interaction);
  assert.equal(Servers.getNotifyPrefs(s.id).afk, true);
  assert.equal(replied.embeds.length, 1);
});
