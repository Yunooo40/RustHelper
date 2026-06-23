// /pair — store Rust+ companion credentials for a tracked server and connect live.
// Admin-only (Manage Server). The player_token is a SECRET; the reply is ephemeral and
// never echoes it back. Get the four values by running, on your machine:
//   npx @liamcottle/rustplus.js fcm-register   (Steam login, once)
//   npx @liamcottle/rustplus.js fcm-listen     (then click "Pair" in-game on a server)
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Pairings from '../../backend/models/pairing.js';
import { syncServer } from '../../rustplus/manager.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pair')
    .setDescription('Pair a tracked Rust server with Rust+ (admin) so /pop, /time and in-game ! work.')
    .addStringOption((o) =>
      o.setName('server').setDescription('Tracked server name (run /setup first).').setRequired(true),
    )
    .addStringOption((o) => o.setName('server_ip').setDescription('Rust+ serverIp').setRequired(true))
    .addIntegerOption((o) => o.setName('app_port').setDescription('Rust+ appPort').setRequired(true))
    .addStringOption((o) => o.setName('steam_id').setDescription('Rust+ playerId (your steam id)').setRequired(true))
    .addStringOption((o) => o.setName('player_token').setDescription('Rust+ playerToken (keep secret!)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Run this inside a server, not in DMs.', flags: MessageFlags.Ephemeral });
    }

    const name = interaction.options.getString('server', true);
    const server = Servers.resolve(interaction.guildId, name);
    if (!server) {
      return interaction.reply({
        content: `No tracked server named **${name}**. Add it with \`/setup\` first.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    Pairings.add({
      serverId: server.id,
      serverIp: interaction.options.getString('server_ip', true),
      appPort: interaction.options.getInteger('app_port', true),
      steamId: interaction.options.getString('steam_id', true),
      playerToken: interaction.options.getString('player_token', true),
      label: interaction.user.username,
    });

    try {
      syncServer(server.id); // connect (or reconnect) live, no restart needed
    } catch (err) {
      console.error('[pair] syncServer failed:', err?.message ?? err);
    }

    return interaction.reply({
      content:
        `✅ Paired **${server.name}** with Rust+. Connecting… try \`/pop\` in a few seconds.\n` +
        '🔒 Keep your player token private — re-run `/pair` to refresh it if it rotates.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
