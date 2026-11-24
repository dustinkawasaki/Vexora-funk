import { Events, EmbedBuilder } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";

async function sendLog(guild, title, description, color = 0x2878ff) {
  const env = await getGuildEnv(guild.id);
  if (env.VEXORA_LOGS_ENABLED !== "true" || !env.LOG_CHANNEL_ID) return;
  const channel = await guild.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description.slice(0, 4000)).setTimestamp();
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

export function attachLogging(client) {
  client.on(Events.GuildMemberAdd, async member => {
    const env = await getGuildEnv(member.guild.id);
    if (env.VEXORA_WELCOME_ENABLED === "true" && env.WELCOME_CHANNEL_ID) {
      const channel = await member.guild.channels.fetch(env.WELCOME_CHANNEL_ID).catch(() => null);
      if (channel?.isTextBased()) await channel.send({ content: `Willkommen auf **VEXORA** <@${member.id}>! Bitte lies die Serverregeln.`, allowedMentions: { users: [member.id] } }).catch(() => null);
    }
    await sendLog(member.guild, "Mitglied beigetreten", `<@${member.id}> · ${member.user.tag} · ID: ${member.id}`, 0x22c55e);
  });
  client.on(Events.GuildMemberRemove, async member => {
    const env = await getGuildEnv(member.guild.id);
    if (env.VEXORA_WELCOME_ENABLED === "true" && env.GOODBYE_CHANNEL_ID) {
      const channel = await member.guild.channels.fetch(env.GOODBYE_CHANNEL_ID).catch(() => null);
      if (channel?.isTextBased()) await channel.send({ content: `<@${member.id}> hat den Server verlassen.`, allowedMentions: { parse: [] } }).catch(() => null);
    }
    await sendLog(member.guild, "Mitglied hat verlassen", `${member.user?.tag ?? "Unbekannt"} · ID: ${member.id}`, 0xf59e0b);
  });
  client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) return;
    await sendLog(message.guild, "Nachricht gelöscht", `Autor: ${message.author?.tag ?? "Unbekannt"}\nKanal: <#${message.channelId}>\nInhalt: ${(message.content || "[kein Text/Cache]").slice(0, 1500)}`, 0xef4444);
  });
  client.on(Events.MessageUpdate, async (before, after) => {
    if (!after.guild || after.author?.bot || before.content === after.content) return;
    await sendLog(after.guild, "Nachricht bearbeitet", `Autor: ${after.author?.tag ?? "Unbekannt"}\nKanal: <#${after.channelId}>\nVorher: ${(before.content || "[nicht im Cache]").slice(0, 700)}\nNachher: ${(after.content || "[leer]").slice(0, 700)}`, 0x64748b);
  });
  client.on(Events.GuildBanAdd, async ban => sendLog(ban.guild, "Mitglied gebannt", `${ban.user.tag} · ID: ${ban.user.id}\nGrund: ${ban.reason ?? "Nicht angegeben"}`, 0xdc2626));
  client.on(Events.GuildRoleCreate, async role => sendLog(role.guild, "Rolle erstellt", `Rolle: ${role.name} · ID: ${role.id}`));
  client.on(Events.GuildRoleDelete, async role => sendLog(role.guild, "Rolle gelöscht", `Rolle: ${role.name} · ID: ${role.id}`, 0xef4444));
  client.on(Events.ChannelCreate, async channel => { if (channel.guild) await sendLog(channel.guild, "Kanal erstellt", `Kanal: ${channel.name} · ID: ${channel.id}`); });
  client.on(Events.ChannelDelete, async channel => { if (channel.guild) await sendLog(channel.guild, "Kanal gelöscht", `Kanal: ${channel.name} · ID: ${channel.id}`, 0xef4444); });
}
