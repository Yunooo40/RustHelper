// Registers (or updates) the slash commands with Discord.
// Run once after changing any command definition:  npm run deploy-commands
//
// - If DISCORD_GUILD_ID is set -> commands register to that guild INSTANTLY (dev).
// - Otherwise they register GLOBALLY (can take up to ~1h to show up everywhere).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config, assertBotConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  assertBotConfig();

  const commandsDir = path.join(__dirname, 'bot', 'commands');
  const commands = [];
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
    const mod = await import(pathToFileURL(path.join(commandsDir, file)).href);
    const cmd = mod.default ?? mod;
    if (cmd?.data) commands.push(cmd.data.toJSON());
    else console.warn(`[deploy] ${file} has no "data" export, skipped.`);
  }

  const rest = new REST().setToken(config.discord.token);
  const { clientId, guildId } = config.discord;

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`✅ Registered ${commands.length} guild command(s) to ${guildId} (instant).`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Registered ${commands.length} global command(s) (allow up to ~1h to appear).`);
  }
}

main().catch((err) => {
  console.error('[deploy] failed to register commands:', err);
  process.exit(1);
});
