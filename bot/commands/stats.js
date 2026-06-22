// /stats [joueur] — show a linked player's K/D stats (Phase 4.3).
// Without an argument, shows your own. The target must have linked their Discord
// account to Steam (/link), since stats are keyed by Steam id.
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import * as Link from '../../backend/models/link.js';
import * as Stats from '../../backend/models/stats.js';
import { statsEmbed } from '../lib/embeds.js';

const COLOR = 0xce422b;

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show K/D stats for a linked player (yours by default).')
    .addUserOption((o) =>
      o.setName('joueur').setDescription('The linked player to look up (defaults to you).').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('joueur') ?? interaction.user;
    const isSelf = target.id === interaction.user.id;

    const link = Link.findByDiscord(target.id);
    if (!link) {
      const who = isSelf
        ? 'You have not linked your account yet. Use `/link` to get started.'
        : `**${target.username}** has not linked their Rust account yet.`;
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('🔗 Not linked')
        .setDescription(who)
        .setFooter({ text: 'RustLink' });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const stats = Stats.forPlayer({ steamId: link.steam_id });
    const embed = statsEmbed({
      ...stats,
      name: stats.name ?? link.steam_name ?? link.steam_id,
      discordId: target.id,
    });
    // parse: [] → the mention in the embed renders without pinging anyone.
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
