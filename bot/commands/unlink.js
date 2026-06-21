// /unlink — remove the link between your Discord and Rust/Steam accounts.
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as Link from '../../backend/models/link.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Remove the link to your Rust (Steam) account.'),

  async execute(interaction) {
    const existing = Link.findByDiscord(interaction.user.id);
    if (!existing) {
      return interaction.reply({
        content: "You're not linked to any Rust account.",
        flags: MessageFlags.Ephemeral,
      });
    }

    Link.unlink(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0xce422b)
      .setTitle('🔓 Unlinked')
      .setDescription(`Removed the link to **${existing.steam_name ?? existing.steam_id}**.`)
      .setFooter({ text: 'RustLink' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
