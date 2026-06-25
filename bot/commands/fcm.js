// /fcm — manage FCM auto-pairing credentials (Phase 7.2). Admin-only (Manage Server),
// ephemeral. Once connected, the bot listens for this player's "Pair with Server"
// notifications and auto-creates the Rust+ pairing — no more manual /pair.
//
// Get the two values ONCE, locally (the Steam login needs a browser):
//   npx @liamcottle/rustplus.js fcm-register
// then read fcm_credentials.gcm.androidId and .securityToken from the generated
// rustplus.config.json. The security token is a SECRET — the reply never echoes it back.
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import * as Fcm from '../../backend/models/fcmCredential.js';
import { syncCredential } from '../../rustplus/fcmManager.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName('fcm')
    .setDescription('Auto-pair Rust+ servers from in-game "Pair" notifications (admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('connect')
        .setDescription('Register your FCM credentials so servers auto-pair when you click "Pair" in game.')
        .addStringOption((o) =>
          o.setName('android_id').setDescription('fcm_credentials.gcm.androidId').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('security_token')
            .setDescription('fcm_credentials.gcm.securityToken (keep secret!)')
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName('status').setDescription('Show the FCM listeners registered in this server.'),
    )
    .addSubcommand((s) =>
      s
        .setName('forget')
        .setDescription('Stop auto-pairing for a registered credential.')
        .addStringOption((o) =>
          o.setName('android_id').setDescription('The androidId to forget').setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply(ephemeral('Run this inside a server, not in DMs.'));
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'connect') {
      const androidId = interaction.options.getString('android_id', true);
      const securityToken = interaction.options.getString('security_token', true);
      const credential = Fcm.add({
        androidId,
        securityToken,
        guildId: interaction.guildId,
        discordUserId: interaction.user.id,
        label: interaction.user.username,
      });
      try {
        syncCredential(credential.id); // start the listener live, no restart needed
      } catch (err) {
        console.error('[fcm] syncCredential failed:', err?.message ?? err);
      }
      return interaction.reply(
        ephemeral(
          '✅ FCM connected. Listening for your "Pair with Server" notifications — open the ' +
            'Rust+ menu in game and click **Pair**, then try `/pop` a few seconds later.\n' +
            '🔒 Keep your security token private. Re-run `/fcm connect` if it changes.',
        ),
      );
    }

    if (sub === 'status') {
      const mine = Fcm.listActive().filter((c) => c.guild_id === interaction.guildId);
      if (mine.length === 0) {
        return interaction.reply(
          ephemeral('No FCM credentials registered here. Use `/fcm connect` to enable auto-pairing.'),
        );
      }
      const lines = mine.map(
        (c) => `• \`${c.android_id}\`${c.label ? ` — ${c.label}` : ''} (since ${c.created_at})`,
      );
      return interaction.reply(ephemeral(`📡 Active FCM listener(s):\n${lines.join('\n')}`));
    }

    // forget
    const androidId = interaction.options.getString('android_id', true);
    const existing = Fcm.getByAndroidId(androidId);
    if (!existing || existing.guild_id !== interaction.guildId) {
      return interaction.reply(ephemeral(`No FCM credential \`${androidId}\` registered here.`));
    }
    Fcm.remove(androidId);
    try {
      syncCredential(existing.id); // row is gone → stops the live listener
    } catch (err) {
      console.error('[fcm] syncCredential failed:', err?.message ?? err);
    }
    return interaction.reply(ephemeral(`🗑️ Forgot FCM credential \`${androidId}\`. Auto-pairing stopped.`));
  },
};
