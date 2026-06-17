// /timer <event> <minutes> — manually set a countdown (admin / for testing
// before the live plugin is wired up). Requires "Manage Server".
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Timers from '../../backend/models/timer.js';
import { EVENT_CHOICES } from '../../shared/events.js';
import { nowUnix } from '../../shared/time.js';
import { singleTimerEmbed } from '../lib/embeds.js';

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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const server = Servers.findByGuild(interaction.guildId);
    if (!server) {
      return interaction.reply({ content: 'Run `/setup <server_name>` first.', flags: MessageFlags.Ephemeral });
    }

    const eventType = interaction.options.getString('event', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const expiresAt = nowUnix() + minutes * 60;

    const timer = Timers.upsert({ serverId: server.id, eventType, expiresAt, source: 'manual' });
    return interaction.reply({ embeds: [singleTimerEmbed(server, timer)] });
  },
};
