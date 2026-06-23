// Resolve a live, connected Rust+ connection for a server, or reply (ephemeral) with a
// helpful message and return null. Pattern, mirroring resolveServerOrReply:
//   const conn = await requireConnection(interaction, server); if (!conn) return;
import { MessageFlags } from 'discord.js';
import { getConnection } from '../../rustplus/manager.js';

export async function requireConnection(interaction, server) {
  const conn = getConnection(server.id);
  if (conn?.connected) return conn;
  await interaction.reply({
    content: conn
      ? `⏳ **${server.name}** is paired but the Rust+ socket isn't connected right now — try again in a few seconds.`
      : `🔌 **${server.name}** isn't paired with Rust+ yet. An admin can run \`/pair\`.`,
    flags: MessageFlags.Ephemeral,
  });
  return null;
}
