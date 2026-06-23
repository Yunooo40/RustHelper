// /pop [server] — live player count (and queue) of a tracked Rust server, via Rust+.
import { SlashCommandBuilder } from 'discord.js';
import { popEmbed } from '../lib/embeds.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';
import { requireConnection } from '../lib/liveConn.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pop')
    .setDescription('Live player count (and queue) of a tracked Rust server.')
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    ),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;
    const conn = await requireConnection(interaction, server);
    if (!conn) return;

    await interaction.deferReply(); // getInfo can take a moment; ack within 3s
    try {
      const info = await conn.getInfoAsync();
      return interaction.editReply({ embeds: [popEmbed(server, info)] });
    } catch (err) {
      return interaction.editReply(
        `⚠️ Couldn't reach **${server.name}** over Rust+ (${err?.message ?? 'timeout'}).`,
      );
    }
  },
};
