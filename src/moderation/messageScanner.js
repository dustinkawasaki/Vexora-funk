import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";

function findMatchedTerm(content, terms) {
  const normalized = content.toLocaleLowerCase("de-DE");
  return terms.find(term => normalized.includes(term));
}

function actionRow(channelId, messageId, userId, reportId) {
  const id = action => `vexmod:${action}:${channelId}:${messageId}:${userId}:${reportId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id("warn")).setLabel("Verwarnen").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id("ignore")).setLabel("Ignorieren").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id("kick")).setLabel("Kick").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id("ban")).setLabel("Bann").setStyle(ButtonStyle.Danger),
  );
}

export function attachMessageScanner(client) {
  client.on("messageCreate", async message => {
    if (!message.inGuild() || message.author.bot || !message.content) return;
    const env = await getGuildEnv(message.guildId);
    if (env.VEXORA_FILTER_ENABLED !== "true" || !env.LOG_CHANNEL_ID) return;
    const terms = (env.BLOCKED_TERMS || "").split(",").map(term => term.trim().toLocaleLowerCase("de-DE")).filter(Boolean);
    if (!terms.length) return;

    const matchedTerm = findMatchedTerm(message.content, terms);
    if (!matchedTerm) return;

    try {
      const logChannel = await message.guild.channels.fetch(env.LOG_CHANNEL_ID);
      if (!logChannel?.isTextBased() || !logChannel.send) return;
      const safeContent = message.content.replace(/@/g, "@\u200b").slice(0, 1200);
      const report = await logChannel.send({
        content: [
          "**VEXORA – Verdächtige Aktivität erkannt**",
          `Spieler: <@${message.author.id}> (${message.author.id})`,
          `Kanal: <#${message.channelId}>`,
          `Zeit: <t:${Math.floor(message.createdTimestamp / 1000)}:F>`,
          "Trefferkategorie: konfigurierter Begriff",
          `Erkannter Begriff: ||${matchedTerm}||`,
          `Nachricht: > ${safeContent.replace(/\n/g, "\n> ")}`,
          `Nachricht öffnen: ${message.url}`,
          "",
          "Es wurde **keine automatische Strafe** ausgelöst. Bitte prüft den Kontext manuell.",
        ].join("\n"),
        allowedMentions: { parse: [] },
      });
      await report.edit({ components: [actionRow(message.channelId, message.id, message.author.id, report.id)] });
    } catch (error) {
      console.error("VEXORA: Moderationshinweis konnte nicht gesendet werden:", error);
    }
  });
}
