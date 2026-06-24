// /watch — alert the channel when a teammate goes offline / comes back (Phase 8.4).
// Add several players by their Steam id; the Rust+ getTeamInfo poll detects presence
// changes and posts a notification. Manage many, or clear them all.
//
//   /watch add steam_id:<id> [name:<label>] [server:<name>]
//   /watch list [server:<name>]
//   /watch remove steam_id:<id> [server:<name>]
//   /watch clear [server:<name>]
//
// Requires the server to be paired with Rust+ (/pair or /fcm) for alerts to fire.
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Pairings from '../../backend/models/pairing.js';
import * as Watches from '../../backend/models/watch.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

function serverOption(s) {
  return s.addStringOption((o) =>
    o.setName('server').setDescription('Tracked server (defaults to this Discord’s default).'),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('watch')
    .setDescription('Alert the channel when a watched teammate disconnects or reconnects.')
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('add')
          .setDescription('Watch a player — alert when they go offline / come back.')
          .addStringOption((o) =>
            o.setName('steam_id').setDescription('The player’s Steam id (17 digits).').setRequired(true),
          )
          .addStringOption((o) => o.setName('name').setDescription('Friendly name shown in alerts.')),
      ),
    )
    .addSubcommand((s) => serverOption(s.setName('list').setDescription('List watched players.')))
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('remove')
          .setDescription('Stop watching a player.')
          .addStringOption((o) =>
            o.setName('steam_id').setDescription('The Steam id to stop watching.').setRequired(true),
          ),
      ),
    )
    .addSubcommand((s) => serverOption(s.setName('clear').setDescription('Remove ALL watched players.'))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(ephemeral('Run this inside a server, not in DMs.'));
    }
    const sub = interaction.options.getSubcommand();
    const server = Servers.resolve(interaction.guildId, interaction.options.getString('server'));
    if (!server) {
      return interaction.reply(
        ephemeral('No tracked server here. Add one with `/setup` (and `/pair` for Rust+).'),
      );
    }

    if (sub === 'add') {
      const steamId = interaction.options.getString('steam_id', true).trim();
      const name = interaction.options.getString('name')?.trim() || null;
      Watches.add({ serverId: server.id, steamId, label: name, addedBy: interaction.user.id });
      const paired = Pairings.getActiveForServer(server.id);
      const warn = paired
        ? ''
        : '\n⚠️ This server isn’t paired with Rust+ yet — run `/pair` or `/fcm` so alerts can fire.';
      return interaction.reply(
        ephemeral(`👁️ Now watching ${name ? `**${name}**` : `\`${steamId}\``} on **${server.name}**.${warn}`),
      );
    }

    if (sub === 'list') {
      const rows = Watches.listByServer(server.id);
      if (rows.length === 0) {
        return interaction.reply(ephemeral(`No watched players on **${server.name}**. Add one with \`/watch add\`.`));
      }
      const lines = rows.map((w) => `• ${w.label ? `**${w.label}** — ` : ''}\`${w.steam_id}\``);
      return interaction.reply(ephemeral(`👁️ Watched on **${server.name}** (${rows.length}):\n${lines.join('\n')}`));
    }

    if (sub === 'remove') {
      const steamId = interaction.options.getString('steam_id', true).trim();
      const removed = Watches.remove(server.id, steamId);
      return interaction.reply(
        ephemeral(removed ? `🗑️ Stopped watching \`${steamId}\` on **${server.name}**.` : `\`${steamId}\` wasn’t watched on **${server.name}**.`),
      );
    }

    // clear
    const n = Watches.clear(server.id);
    return interaction.reply(ephemeral(`🧹 Cleared ${n} watched player(s) on **${server.name}**.`));
  },
};
