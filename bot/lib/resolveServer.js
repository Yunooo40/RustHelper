// Resolve which tracked Rust server a command targets — an explicit `server` option,
// or the guild's default. On failure, replies with a helpful ephemeral message and
// returns null, so callers do: `const s = await resolveServerOrReply(i); if (!s) return;`
import { MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';

export async function resolveServerOrReply(interaction) {
  const requested = interaction.options.getString('server');
  const server = Servers.resolve(interaction.guildId, requested);
  if (server) return server;

  const all = Servers.listByGuild(interaction.guildId);
  const content = requested
    ? `No tracked server named **${requested}**. ` +
      (all.length ? `Tracked: ${all.map((s) => s.name).join(', ')}.` : 'Add one with `/setup`.')
    : 'Run `/setup <server_name>` first to track a Rust server.';
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  return null;
}
