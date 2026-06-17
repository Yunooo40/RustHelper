// /player <username> — MVP stub. Player tracking depends on the Rust/Oxide
// plugin reporting player data (Phase 2/3), so for now this returns a friendly
// "not linked yet" message instead of failing.
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Show info about a player (requires player tracking — later phase).')
    .addStringOption((o) => o.setName('username').setDescription('Player name').setRequired(true)),

  async execute(interaction) {
    const username = interaction.options.getString('username', true);
    const embed = new EmbedBuilder()
      .setColor(0xce422b)
      .setTitle(`👤 ${username}`)
      .setDescription(
        'Player tracking is not linked yet.\n' +
          'It will be available once the Rust/Oxide plugin reports player data (Phase 2/3).',
      )
      .setFooter({ text: 'RustLink' });

    return interaction.reply({ embeds: [embed] });
  },
};
