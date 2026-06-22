// /servers — list the Rust servers this Discord tracks (⭐ marks the default).
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import { serverListEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('servers').setDescription('List the Rust servers this Discord tracks.'),

  async execute(interaction) {
    const servers = Servers.listByGuild(interaction.guildId);
    if (!servers.length) {
      return interaction.reply({
        content: 'No servers tracked yet. Add one with `/setup <server_name>`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({ embeds: [serverListEmbed(servers)] });
  },
};
