// /notify [connections] [deaths] [afk] [server] — view or toggle the Rust+ team-poller
// announcements for a tracked server. With no boolean option it just shows the current
// state. Requires "Manage Server", like /timer.
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import * as Servers from '../../backend/models/server.js';
import { resolveServerOrReply } from '../lib/resolveServer.js';

const onoff = (b) => (b ? '✅ on' : '❌ off');

export default {
  data: new SlashCommandBuilder()
    .setName('notify')
    .setDescription('View or toggle team-poller announcements (connections / deaths / AFK).')
    .addBooleanOption((o) => o.setName('connections').setDescription('Announce teammate connect / disconnect'))
    .addBooleanOption((o) => o.setName('deaths').setDescription('Announce teammate deaths'))
    .addBooleanOption((o) => o.setName('afk').setDescription('Announce teammate AFK / back'))
    .addStringOption((o) => o.setName('server').setDescription("Which tracked server (defaults to this guild's default)."))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const server = await resolveServerOrReply(interaction);
    if (!server) return;

    let changed = false;
    for (const key of ['connections', 'deaths', 'afk']) {
      const val = interaction.options.getBoolean(key);
      if (val !== null) {
        Servers.setNotifyPref(server.id, key, val);
        changed = true;
      }
    }

    const prefs = Servers.getNotifyPrefs(server.id);
    const embed = new EmbedBuilder()
      .setColor(0xce422b)
      .setTitle(`🔔 Notifications — ${server.name}`)
      .setDescription(changed ? 'Mis à jour.' : 'Réglages actuels :')
      .addFields(
        { name: 'Connexions', value: onoff(prefs.connections), inline: true },
        { name: 'Morts', value: onoff(prefs.deaths), inline: true },
        { name: 'AFK', value: onoff(prefs.afk), inline: true },
      )
      .setFooter({ text: 'RustLink' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  },
};
