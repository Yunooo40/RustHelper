// /timer <event> <minutes> [server] — manually set a countdown (admin / for testing
// before the live plugin is wired up). Uses the guild's default server unless `server`
// is given. Requires "Manage Server".
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as Timers from '../../backend/models/timer.js';
import { EVENT_CHOICES } from '../../shared/events.js';
import { nowUnix } from '../../shared/time.js';
import { singleTimerEmbed } from '../lib/embeds.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';

export default {
  data: new SlashCommandBuilder()
    .setName('timer')
    .setDescription('Manually set a countdown for an event.')
    .addStringOption((o) =>
      o.setName('event').setDescription('Which event').setRequired(true).addChoices(...EVENT_CHOICES),
    )
    .addIntegerOption((o) =>
      o
        .setName('minutes')
        .setDescription('Minutes from now until the event happens')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(1440),
    )
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;

    const eventType = interaction.options.getString('event', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const expiresAt = nowUnix() + minutes * 60;

    const timer = Timers.upsert({ serverId: server.id, eventType, expiresAt, source: 'manual' });
    return interaction.reply({ embeds: [singleTimerEmbed(server, timer)] });
  },
};
