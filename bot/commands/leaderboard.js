// /leaderboard — top players by K/D ratio (Phase 4.3).
import { SlashCommandBuilder } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Stats from '../../backend/models/stats.js';
import { leaderboardEmbed } from '../lib/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top players by K/D ratio.'),

  async execute(interaction) {
    const server = interaction.guildId ? Servers.findByGuild(interaction.guildId) : null;
    const rows = Stats.leaderboard({ limit: 10, minKills: 1 });
    const embed = leaderboardEmbed({ serverName: server?.name, rows });
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
