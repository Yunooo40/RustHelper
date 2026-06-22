// /server-remove <name> — stop tracking a Rust server. If it was the default, another
// is promoted automatically. Requires "Manage Server".
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';

export default {
  data: new SlashCommandBuilder()
    .setName('server-remove')
    .setDescription('Stop tracking a Rust server.')
    .addStringOption((o) => o.setName('name').setDescription('Name of a tracked server').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const name = interaction.options.getString('name', true);
    const { removed, newDefault } = Servers.removeByGuildName(interaction.guildId, name);
    if (!removed) {
      return interaction.reply({ content: `**${name}** isn't tracked here.`, flags: MessageFlags.Ephemeral });
    }
    const extra = newDefault ? ` New default: **${newDefault.name}**.` : '';
    return interaction.reply({ content: `🗑️ Stopped tracking **${name}**.${extra}` });
  },
};
