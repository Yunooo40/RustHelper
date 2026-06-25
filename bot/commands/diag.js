// /diag [server] — capture raw Rust+ data (markers, monuments, map size) from a paired
// server into an ephemeral JSON file, to confirm the detection assumptions (marker enum
// values, oil rig tokens, grid refs) on a live server. Admin-only; secrets are redacted.
import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder, MessageFlags } from 'discord.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';
import { requireConnection } from '../lib/liveConn.js';
import { buildDiagnostics, redactSecrets } from '../../rustplus/diag.js';

export default {
  data: new SlashCommandBuilder()
    .setName('diag')
    .setDescription('Capture raw Rust+ data (markers, monuments, map size) to validate detection. Admin.')
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;
    const conn = await requireConnection(interaction, server);
    if (!conn) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // keep raw data private
    try {
      const [info, markers] = await Promise.all([conn.getInfoAsync(), conn.getMapMarkersAsync()]);
      const map = conn.map ?? (await conn.getMapAsync().catch(() => null));
      const diag = redactSecrets(buildDiagnostics({ info, map, markers }));

      const file = new AttachmentBuilder(Buffer.from(JSON.stringify(diag, null, 2)), {
        name: `diag-${server.name.replace(/[^\w.-]+/g, '_')}.json`,
      });
      const summary = [
        `🔎 **Diagnostics — ${server.name}**`,
        `Map **${diag.server.name ?? '?'}** · size **${diag.server.mapSize ?? '?'}** · ${diag.server.players ?? '?'}/${diag.server.maxPlayers ?? '?'}`,
        `Markers: **${diag.markers.total}** · types present: \`${diag.markers.types.join(', ') || 'none'}\``,
        `Oil rig monuments: ${diag.monuments.oilRigs.map((m) => `\`${m.token}\``).join(', ') || '_none found_'}`,
        '_Full raw capture attached — paste it back to confirm marker enums, tokens & grid refs._',
      ].join('\n');
      return interaction.editReply({ content: summary, files: [file] });
    } catch (err) {
      return interaction.editReply(
        `⚠️ Couldn't reach **${server.name}** over Rust+ (${err?.message ?? 'timeout'}).`,
      );
    }
  },
};
