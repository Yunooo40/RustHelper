// /link — start linking your Discord account to your Rust/Steam account.
// Generates a short code; the player then types `!link <code>` in the Rust chat
// (the plugin claims it via POST /link/claim). Works in a server or in DMs.
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as Link from '../../backend/models/link.js';

const COLOR = 0xce422b;
const TTL_MINUTES = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your Rust (Steam) account.'),

  async execute(interaction) {
    const existing = Link.findByDiscord(interaction.user.id);
    if (existing) {
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('🔗 Already linked')
        .setDescription(
          `Your account is linked to **${existing.steam_name ?? existing.steam_id}**.\n` +
            'Use `/unlink` first if you want to link a different account.',
        )
        .setFooter({ text: 'RustLink' });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const { code } = Link.createCode({ discordUserId: interaction.user.id, ttlSeconds: TTL_MINUTES * 60 });
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('🔗 Link your account')
      .setDescription(
        `In the **Rust chat**, type:\n\`\`\`\n!link ${code}\n\`\`\`\n` +
          `This code expires in **${TTL_MINUTES} minutes**.`,
      )
      .setFooter({ text: 'RustLink' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
