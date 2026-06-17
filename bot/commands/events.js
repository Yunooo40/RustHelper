// /events — list upcoming (not-yet-expired) events, soonest first.
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Timers from '../../backend/models/timer.js';
import { eventsEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('events').setDescription('List upcoming events, soonest first.'),

  async execute(interaction) {
    const server = Servers.findByGuild(interaction.guildId);
    if (!server) {
      return interaction.reply({ content: 'Run `/setup <server_name>` first.', flags: MessageFlags.Ephemeral });
    }
    const timers = Timers.upcomingByServer(server.id);
    return interaction.reply({ embeds: [eventsEmbed(server, timers)] });
  },
};
