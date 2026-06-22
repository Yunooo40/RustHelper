// Discord embed builders, kept in one place so every command/notification
// looks consistent.
import { EmbedBuilder } from 'discord.js';
import { eventLabel, eventEmoji } from '../../shared/events.js';
import { discordTime, formatCountdown } from '../../shared/time.js';

const COLOR = 0xce422b; // Rust signature orange-red
const FOOTER = { text: 'RustLink' };

// "🛢️ Small Oil Rig — in 2 hours (1h 59m)"
function timerLine(timer) {
  return `${eventEmoji(timer.event_type)} **${eventLabel(timer.event_type)}** — ${discordTime(
    timer.expires_at,
    'R',
  )} \`(${formatCountdown(timer.expires_at)})\``;
}

export function statusEmbed(server, timers) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`📡 Status — ${server?.name ?? 'Unknown server'}`)
    .setFooter(FOOTER)
    .setTimestamp();

  embed.setDescription(
    timers.length
      ? timers.map(timerLine).join('\n')
      : 'No active timers yet. They appear as events arrive, or set one with `/timer`.',
  );
  return embed;
}

export function eventsEmbed(server, timers) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`⏱️ Upcoming events — ${server?.name ?? 'Unknown server'}`)
    .setFooter(FOOTER)
    .setTimestamp();

  embed.setDescription(
    timers.length
      ? timers.map((t, i) => `\`${i + 1}.\` ${timerLine(t)}`).join('\n')
      : 'No upcoming events right now.',
  );
  return embed;
}

export function singleTimerEmbed(server, timer) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${eventEmoji(timer.event_type)} ${eventLabel(timer.event_type)}`)
    .setDescription(`Timer set on **${server.name}**.`)
    .addFields({
      name: 'Happens',
      value: `${discordTime(timer.expires_at, 'R')} \`(${formatCountdown(timer.expires_at)})\``,
    })
    .setFooter(FOOTER)
    .setTimestamp();
}

// Posted automatically when the webhook reports an event.
// `source` ('webhook' | 'ingame' | 'manual') and `reportedBy` (player name) are
// set for player reports relayed from the Rust chat (Phase 3).
export function notificationEmbed({ serverName, eventType, status, nextRespawn, source, reportedBy }) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${eventEmoji(eventType)} ${eventLabel(eventType)}`)
    .setDescription(`**${(status ?? 'event').toUpperCase()}** on **${serverName}**`)
    .setFooter(source === 'ingame' ? { text: 'RustLink · reported in-game' } : FOOTER)
    .setTimestamp();

  if (nextRespawn) {
    embed.addFields({
      name: 'Next',
      value: `${discordTime(nextRespawn, 'R')} \`(${formatCountdown(nextRespawn)})\``,
    });
  }
  if (reportedBy) {
    embed.addFields({ name: 'Reported by', value: String(reportedBy), inline: true });
  }
  return embed;
}

// Kill-feed entry (Phase 4.2). Linked players show as a (non-pinging) Discord
// mention so the link is visible without spamming notifications on every death.
export function deathEmbed({ serverName, victimName, victimDiscordId, killerName, killerDiscordId, cause, distance }) {
  const victim = victimDiscordId ? `<@${victimDiscordId}>` : `**${victimName}**`;
  const killer = killerName ? (killerDiscordId ? `<@${killerDiscordId}>` : `**${killerName}**`) : null;

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('☠️ Kill feed')
    .setDescription(killer ? `${victim} was killed by ${killer}` : `${victim} died`)
    .setFooter({ text: `RustLink · ${serverName}` })
    .setTimestamp();

  if (cause) embed.addFields({ name: 'Cause', value: String(cause), inline: true });
  if (distance != null && Number(distance) > 0) {
    embed.addFields({ name: 'Distance', value: `${Math.round(Number(distance))} m`, inline: true });
  }
  return embed;
}

// K/D stats card for a single player (Phase 4.3).
export function statsEmbed({ name, steamId, discordId, kills, deaths, kd, bestStreak, serverName }) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`👤 ${name ?? steamId} — stats`)
    .addFields(
      { name: 'Kills', value: String(kills), inline: true },
      { name: 'Deaths', value: String(deaths), inline: true },
      { name: 'K/D', value: kd.toFixed(2), inline: true },
      { name: 'Best streak', value: bestStreak > 0 ? `🔥 ${bestStreak}` : '—', inline: true },
    )
    .setFooter(serverName ? { text: `RustLink · ${serverName}` } : FOOTER)
    .setTimestamp();

  if (discordId) embed.setDescription(`<@${discordId}>`);
  return embed;
}

// Server K/D leaderboard (Phase 4.3). `rows` come from Stats.leaderboard().
const MEDALS = ['🥇', '🥈', '🥉'];
export function leaderboardEmbed({ serverName, rows }) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🏆 K/D Leaderboard${serverName ? ` — ${serverName}` : ''}`)
    .setFooter(FOOTER)
    .setTimestamp();

  embed.setDescription(
    rows.length
      ? rows
          .map((p, i) => {
            const rank = MEDALS[i] ?? `\`${i + 1}.\``;
            return `${rank} **${p.name ?? p.steamId}** — \`${p.kd.toFixed(2)}\` K/D · ${p.kills}–${p.deaths}`;
          })
          .join('\n')
      : 'No kills recorded yet. Stats appear as the kill feed fills up.',
  );
  return embed;
}

// List of the Rust servers a guild tracks (Phase 6). ⭐ marks the default.
export function serverListEmbed(servers) {
  const lines = servers.map((s) => {
    const star = s.is_default ? '⭐' : '•';
    const chan = s.channel_id ? ` → <#${s.channel_id}>` : ' _(no channel set)_';
    return `${star} **${s.name}**${chan}`;
  });
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🗂️ Tracked Rust servers')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'RustLink · ⭐ default · /server-default to change' })
    .setTimestamp();
}
