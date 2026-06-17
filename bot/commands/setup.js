// /setup <server_name> [channel] — link this Discord guild to a Rust server
// and choose where notifications are posted. Requires "Manage Server".
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Link this Discord server to a Rust server and set the notification channel.')
    .addStringOption((o) =>
      o
        .setName('server_name')
        .setDescription('Exact Rust server name — must match the value sent by the webhook.')
        .setRequired(true),
    )
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel for event notifications (defaults to the current channel).')
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Run this inside a server, not in DMs.', flags: MessageFlags.Ephemeral });
    }

    const name = interaction.options.getString('server_name', true);
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    const server = Servers.upsertByGuild({ guildId: interaction.guildId, name, channelId: channel.id });

    const embed = new EmbedBuilder()
      .setColor(0xce422b)
      .setTitle('✅ RustLink configured')
      .setDescription(`Now tracking **${server.name}**.\nNotifications will be posted in <#${channel.id}>.`)
      .setFooter({ text: 'RustLink' });

    return interaction.reply({ embeds: [embed] });
  },
};
