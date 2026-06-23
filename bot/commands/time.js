// /time [server] — live in-game time of a tracked Rust server, via Rust+.
import { SlashCommandBuilder } from 'discord.js';
import { timeEmbed } from '../lib/embeds.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';
import { requireConnection } from '../lib/liveConn.js';

export default {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('Live in-game time of a tracked Rust server.')
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    ),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;
    const conn = await requireConnection(interaction, server);
    if (!conn) return;

    await interaction.deferReply();
    try {
      const time = await conn.getTimeAsync();
      return interaction.editReply({ embeds: [timeEmbed(server, time)] });
    } catch (err) {
      return interaction.editReply(
        `⚠️ Couldn't reach **${server.name}** over Rust+ (${err?.message ?? 'timeout'}).`,
      );
    }
  },
};
