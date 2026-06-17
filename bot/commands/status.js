// /status — show all tracked event timers for this guild's Rust server.
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Timers from '../../backend/models/timer.js';
import { statusEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('status').setDescription('Show the status of all tracked events.'),

  async execute(interaction) {
    const server = Servers.findByGuild(interaction.guildId);
    if (!server) {
      return interaction.reply({ content: 'Run `/setup <server_name>` first.', flags: MessageFlags.Ephemeral });
    }
    const timers = Timers.listByServer(server.id);
    return interaction.reply({ embeds: [statusEmbed(server, timers)] });
  },
};
