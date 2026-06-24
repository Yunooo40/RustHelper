// /switch — manage and control smart switches via Rust+ (Phase 9).
// Register switches by entity id + label, then toggle them from Discord or in-game
// with !switch on/off/toggle <label>.
//
//   /switch add entity_id:<id> label:<name> [server:]   — admin
//   /switch remove entity_id:<id> [server:]             — admin
//   /switch list [server:]
//   /switch on|off|toggle label:<name> [server:]        — admin
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import * as Switches from '../../backend/models/switch.js';
import { getConnection } from '../../rustplus/manager.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

function serverOption(s) {
  return s.addStringOption((o) =>
    o.setName('server').setDescription("Tracked server (defaults to this Discord's default)."),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('switch')
    .setDescription('Manage and control Rust+ smart switches.')
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('add')
          .setDescription('Register a smart switch by entity id (admin).')
          .addIntegerOption((o) =>
            o.setName('entity_id').setDescription('Rust entity id (shown in the pairing / CCTV panel).').setRequired(true),
          )
          .addStringOption((o) =>
            o.setName('label').setDescription('Short name used in commands, e.g. "Base".').setRequired(true),
          ),
      ),
    )
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('remove')
          .setDescription('Unregister a smart switch (admin).')
          .addIntegerOption((o) =>
            o.setName('entity_id').setDescription('Entity id to remove.').setRequired(true),
          ),
      ),
    )
    .addSubcommand((s) => serverOption(s.setName('list').setDescription('List registered switches.')))
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('on')
          .setDescription('Turn a switch ON (admin).')
          .addStringOption((o) => o.setName('label').setDescription('Switch label.').setRequired(true)),
      ),
    )
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('off')
          .setDescription('Turn a switch OFF (admin).')
          .addStringOption((o) => o.setName('label').setDescription('Switch label.').setRequired(true)),
      ),
    )
    .addSubcommand((s) =>
      serverOption(
        s
          .setName('toggle')
          .setDescription('Toggle a switch ON→OFF or OFF→ON (admin).')
          .addStringOption((o) => o.setName('label').setDescription('Switch label.').setRequired(true)),
      ),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(ephemeral('Run this inside a server, not in DMs.'));
    }
    const sub = interaction.options.getSubcommand();
    const server = Servers.resolve(interaction.guildId, interaction.options.getString('server'));
    if (!server) {
      return interaction.reply(ephemeral('No tracked server here. Add one with `/setup`.'));
    }

    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

    if (sub === 'add') {
      if (!isAdmin) return interaction.reply(ephemeral('❌ Admin only.'));
      const entityId = interaction.options.getInteger('entity_id', true);
      const label = interaction.options.getString('label', true).trim();
      Switches.add({ serverId: server.id, entityId, label, addedBy: interaction.user.id });
      return interaction.reply(ephemeral(`⚡ Registered **${label}** (entity ${entityId}) on **${server.name}**.\nIn-game: \`!switch on ${label}\` / \`!switch off ${label}\``));
    }

    if (sub === 'remove') {
      if (!isAdmin) return interaction.reply(ephemeral('❌ Admin only.'));
      const entityId = interaction.options.getInteger('entity_id', true);
      const n = Switches.remove(server.id, entityId);
      return interaction.reply(ephemeral(n ? `🗑️ Removed entity ${entityId} from **${server.name}**.` : `Entity ${entityId} wasn't registered.`));
    }

    if (sub === 'list') {
      const rows = Switches.listByServer(server.id);
      if (!rows.length) return interaction.reply(ephemeral(`No switches registered on **${server.name}**. Add one with \`/switch add\`.`));
      const lines = rows.map((s) => `• **${s.label}** — entity \`${s.entity_id}\``);
      return interaction.reply(ephemeral(`⚡ Switches on **${server.name}** (${rows.length}):\n${lines.join('\n')}`));
    }

    // on / off / toggle — need an active Rust+ connection
    if (!isAdmin) return interaction.reply(ephemeral('❌ Admin only.'));
    const label = interaction.options.getString('label', true).trim();
    const sw = Switches.getByLabel(server.id, label);
    if (!sw) return interaction.reply(ephemeral(`❌ No switch named **${label}** on **${server.name}**. Use \`/switch list\`.`));
    const conn = getConnection(server.id);
    if (!conn?.connected) {
      return interaction.reply(ephemeral(`⚠️ Rust+ not connected for **${server.name}**. Run \`/pair\` or \`/fcm\` and try again.`));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (sub === 'on' || sub === 'off') {
        const value = sub === 'on';
        await conn.setEntityAsync(sw.entity_id, value);
        return interaction.editReply(`⚡ **${sw.label}** → ${value ? '🟢 ON' : '🔴 OFF'}`);
      }
      // toggle
      const info = await conn.getEntityAsync(sw.entity_id);
      const current = !!info?.payload?.value;
      await conn.setEntityAsync(sw.entity_id, !current);
      return interaction.editReply(`⚡ **${sw.label}** → ${!current ? '🟢 ON' : '🔴 OFF'}`);
    } catch (err) {
      return interaction.editReply(`❌ Rust+ error: ${err?.message ?? err}`);
    }
  },
};
