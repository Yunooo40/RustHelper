// /help — list everything the bot can do (Phase 9.1). Ephemeral so it doesn't clutter
// the channel. The reference embed lives in lib/embeds.js (helpEmbed).
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { helpEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List every command and what the bot can do.'),

  async execute(interaction) {
    return interaction.reply({ embeds: [helpEmbed()], flags: MessageFlags.Ephemeral });
  },
};
