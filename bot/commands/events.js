// /events [server] — list upcoming (not-yet-expired) events for a Rust server,
// soonest first (the guild's default when no server is given).
import { SlashCommandBuilder } from 'discord.js';
import * as Timers from '../../backend/models/timer.js';
import { eventsEmbed } from '../lib/embeds.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';

export default {
  data: new SlashCommandBuilder()
    .setName('events')
    .setDescription('List upcoming events, soonest first.')
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    ),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;
    const timers = Timers.upcomingByServer(server.id);
    return interaction.reply({ embeds: [eventsEmbed(server, timers)] });
  },
};
