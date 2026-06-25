// /map [server] — live map snapshot of a tracked Rust server, via Rust+: the server map
// image plus the current events (cargo, heli, CH47, crates…) with their grid refs.
import { SlashCommandBuilder } from 'discord.js';
import { mapEmbed } from '../lib/embeds.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';
import { requireConnection } from '../lib/liveConn.js';

export default {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Live map of a tracked server: events (cargo, heli, rigs…) with grid refs.')
    .addStringOption((o) =>
      o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."),
    ),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;
    const conn = await requireConnection(interaction, server);
    if (!conn) return;

    await interaction.deferReply(); // getInfo/getMapMarkers can take a moment; ack within 3s
    try {
      const [info, markers] = await Promise.all([conn.getInfoAsync(), conn.getMapMarkersAsync()]);
      // The map image is static for a wipe and already cached on connect; fall back to a
      // live fetch, and to no image at all, so /map still works if getMap is unavailable.
      const map = conn.map ?? (await conn.getMapAsync().catch(() => null));
      const { embed, files } = mapEmbed(server, { mapSize: info.mapSize, markers, image: map?.jpgImage });
      return interaction.editReply({ embeds: [embed], files });
    } catch (err) {
      return interaction.editReply(
        `⚠️ Couldn't reach **${server.name}** over Rust+ (${err?.message ?? 'timeout'}).`,
      );
    }
  },
};
