// Fired once when the bot has connected to Discord.
import { Events, ActivityType } from 'discord.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[bot] logged in as ${client.user.tag} — serving ${client.guilds.cache.size} guild(s).`);
    client.user.setActivity('Rust events 🛢️', { type: ActivityType.Watching });
  },
};
