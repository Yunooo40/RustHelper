// Builds and wires the Discord client:
//  - loads slash commands from ./commands
//  - loads gateway event handlers from ./events
//  - subscribes to the shared bus to turn Rust webhooks into Discord messages
//
// `createBot()` returns the client; the caller (index.js) logs it in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { bus, RUST_EVENT, DEATH_EVENT, ALARM_EVENT, TEAM_EVENT } from '../shared/bus.js';
import * as Servers from '../backend/models/server.js';
import { notificationEmbed, deathEmbed, alarmEmbed, teamEventEmbed } from './lib/embeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamically import every .js module in a folder (Windows-safe via pathToFileURL).
async function loadDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const mods = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    mods.push(mod.default ?? mod);
  }
  return mods;
}

export async function createBot() {
  // Only the Guilds intent is needed for slash commands (no privileged intents).
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.commands = new Collection();

  // Slash commands.
  for (const cmd of await loadDir(path.join(__dirname, 'commands'))) {
    if (cmd?.data?.name && typeof cmd.execute === 'function') {
      client.commands.set(cmd.data.name, cmd);
    } else {
      console.warn('[bot] skipped a command missing { data, execute }.');
    }
  }
  console.log(`[bot] loaded ${client.commands.size} command(s).`);

  // Gateway event handlers (ready, interactionCreate, ...).
  for (const evt of await loadDir(path.join(__dirname, 'events'))) {
    if (!evt?.name || typeof evt.execute !== 'function') continue;
    const handler = (...args) => evt.execute(...args, client);
    if (evt.once) client.once(evt.name, handler);
    else client.on(evt.name, handler);
  }

  // Bridge: API webhook -> Discord notification.
  const sendToChannel = async (payload, embed) => {
    const channelId = payload.channelId ?? Servers.findByName(payload.serverName)?.channel_id;
    if (!channelId) return; // no channel configured yet (run /setup)
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  };

  bus.on(RUST_EVENT, async (payload) => {
    try {
      await sendToChannel(payload, notificationEmbed(payload));
    } catch (err) {
      console.error('[bot] failed to deliver notification:', err);
    }
  });

  // Kill feed (Phase 4.2).
  bus.on(DEATH_EVENT, async (payload) => {
    try {
      await sendToChannel(payload, deathEmbed(payload));
    } catch (err) {
      console.error('[bot] failed to deliver death notification:', err);
    }
  });

  // Smart Alarm alerts (Phase 9, FCM).
  bus.on(ALARM_EVENT, async (payload) => {
    try {
      await sendToChannel(payload, alarmEmbed(payload));
    } catch (err) {
      console.error('[bot] failed to deliver alarm notification:', err);
    }
  });

  // Team poller announcements (Phase 8.2): connect/disconnect/death/AFK.
  bus.on(TEAM_EVENT, async (payload) => {
    try {
      await sendToChannel(payload, teamEventEmbed(payload));
    } catch (err) {
      console.error('[bot] failed to deliver team event:', err);
    }
  });

  return client;
}

export default createBot;
