// /setup <server_name> [channel] — add a Rust server to this Discord and choose where
// its notifications go. A guild can track several servers (Phase 6); the first one
// becomes the default. Requires "Manage Server".
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Track a Rust server on this Discord and set its notification channel.')
    .addStringOption((o) =>
      o
        .setName('server_name')
        .setDescription('Exact Rust server name — must match the value sent by the webhook.')
        .setRequired(true),
    )
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription("Channel for this server's notifications (defaults to the current channel).")
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Run this inside a server, not in DMs.', flags: MessageFlags.Ephemeral });
    }

    const name = interaction.options.getString('server_name', true);
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    let server;
    try {
      server = Servers.addServer({ guildId: interaction.guildId, name, channelId: channel.id });
    } catch (err) {
      if (err.code === 'SERVER_NAME_TAKEN') {
        return interaction.reply({
          content:
            `⚠️ ${err.message}\nServer names must be unique because the webhook routes events by ` +
            'name. Ask the Rust server to use a distinct name in its plugin config, then `/setup` again.',
          flags: MessageFlags.Ephemeral,
        });
      }
      throw err;
    }
    const isDefault = server.is_default === 1;

    const embed = new EmbedBuilder()
      .setColor(0xce422b)
      .setTitle('✅ RustLink configured')
      .setDescription(
        `Now tracking **${server.name}**${isDefault ? ' _(default server)_' : ''}.\n` +
          `Notifications will be posted in <#${channel.id}>.` +
          (isDefault ? '' : '\nMake it the default with `/server-default`, or list all with `/servers`.'),
      )
      .setFooter({ text: 'RustLink' });

    return interaction.reply({ embeds: [embed] });
  },
};
