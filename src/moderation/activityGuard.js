import { EmbedBuilder } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";

const messageWindows = new Map();
const joinWindows = new Map();
const alertCooldowns = new Map();

async function alert(guild, env, title, description) {
  const channelId = env.LOG_CHANNEL_ID;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle(title).setDescription(description).setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch(() => null);
}

export function attachActivityGuard(client) {
  client.on("messageCreate", async message => {
    if (!message.inGuild() || message.author.bot) return;
    const env = await getGuildEnv(message.guildId);
    if (env.VEXORA_SPAM_ENABLED !== "true") return;

    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const recent = (messageWindows.get(key) || []).filter(time => now - time < 7000);
    recent.push(now);
    messageWindows.set(key, recent);
    if (recent.length < 6) return;

    const cooldownKey = `spam:${key}`;
    if (now - (alertCooldowns.get(cooldownKey) || 0) < 30_000) return;
    alertCooldowns.set(cooldownKey, now);
    await alert(message.guild, env, "VEXORA – möglicher Spam", `Mehrere Nachrichten in kurzer Zeit erkannt. Mitglied-ID: ${message.author.id}. Bitte manuell prüfen.`);
  });

  client.on("guildMemberAdd", async member => {
    const env = await getGuildEnv(member.guild.id);
    if (env.VEXORA_RAID_ENABLED !== "true") return;

    const now = Date.now();
    const recent = (joinWindows.get(member.guild.id) || []).filter(time => now - time < 15_000);
    recent.push(now);
    joinWindows.set(member.guild.id, recent);
    if (recent.length < 6) return;

    const cooldownKey = `raid:${member.guild.id}`;
    if (now - (alertCooldowns.get(cooldownKey) || 0) < 60_000) return;
    alertCooldowns.set(cooldownKey, now);
    await alert(member.guild, env, "VEXORA – möglicher Join-Raid", `${recent.length} Beitritte in 15 Sekunden erkannt. Es wurden keine Mitglieder automatisch bestraft. Bitte manuell prüfen.`);
  });
}
