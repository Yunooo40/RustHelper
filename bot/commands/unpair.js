// /unpair <server> — remove a tracked server's Rust+ credentials and drop the live
// connection. Admin-only (Manage Server).
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Pairings from '../../backend/models/pairing.js';
import { syncServer } from '../../rustplus/manager.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unpair')
    .setDescription('Remove a tracked Rust server from Rust+ (admin).')
    .addStringOption((o) =>
      o.setName('server').setDescription('Tracked server name.').setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Run this inside a server, not in DMs.', flags: MessageFlags.Ephemeral });
    }

    const name = interaction.options.getString('server', true);
    const server = Servers.resolve(interaction.guildId, name);
    if (!server) {
      return interaction.reply({
        content: `No tracked server named **${name}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const removed = Pairings.removeByServer(server.id);
    try {
      syncServer(server.id); // tears down the live connection
    } catch (err) {
      console.error('[unpair] syncServer failed:', err?.message ?? err);
    }

    return interaction.reply({
      content: removed
        ? `🔌 Unpaired **${server.name}** from Rust+.`
        : `**${server.name}** wasn't paired with Rust+.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
