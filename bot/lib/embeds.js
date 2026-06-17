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
export function notificationEmbed({ serverName, eventType, status, nextRespawn }) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${eventEmoji(eventType)} ${eventLabel(eventType)}`)
    .setDescription(`**${(status ?? 'event').toUpperCase()}** on **${serverName}**`)
    .setFooter(FOOTER)
    .setTimestamp();

  if (nextRespawn) {
    embed.addFields({
      name: 'Next',
      value: `${discordTime(nextRespawn, 'R')} \`(${formatCountdown(nextRespawn)})\``,
    });
  }
  return embed;
}
