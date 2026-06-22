// /status [server] — show all tracked event timers for a Rust server (the guild's
// default when no server is given).
import { SlashCommandBuilder } from 'discord.js';
import * as Timers from '../../backend/models/timer.js';
import { statusEmbed } from '../lib/embeds.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show the status of all tracked events.')
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    ),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;
    const timers = Timers.listByServer(server.id);
    return interaction.reply({ embeds: [statusEmbed(server, timers)] });
  },
};
