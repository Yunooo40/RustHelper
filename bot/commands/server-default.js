// /server-default <name> — choose the default Rust server (used by commands without a
// `server` argument). Requires "Manage Server".
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server-default')
    .setDescription('Set the default Rust server for commands without a server argument.')
    .addStringOption((o) => o.setName('name').setDescription('Name of a tracked server').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const name = interaction.options.getString('name', true);
    const target = Servers.findByGuildName(interaction.guildId, name);
    if (!target) {
      const all = Servers.listByGuild(interaction.guildId);
      return interaction.reply({
        content: `**${name}** isn't tracked here. ${all.length ? `Tracked: ${all.map((s) => s.name).join(', ')}.` : 'Add one with `/setup`.'}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    Servers.setDefault(interaction.guildId, target.id);
    return interaction.reply({ content: `⭐ Default server is now **${target.name}**.` });
  },
};
