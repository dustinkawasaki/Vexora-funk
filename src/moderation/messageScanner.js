import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";

const AI_ENDPOINT = process.env.VEXORA_AI_ENDPOINT
  || "https://vexora-discord.dustinleon11.workers.dev/api/moderation/classify";

function actionRow(channelId, messageId, userId, reportId) {
  const id = action => `vexmod:${action}:${channelId}:${messageId}:${userId}:${reportId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id("warn")).setLabel("Verwarnen").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id("ignore")).setLabel("Ignorieren").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id("kick")).setLabel("Kick").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id("ban")).setLabel("Bann").setStyle(ButtonStyle.Danger),
  );
}

async function classifyMessage(content) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN fehlt.");
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content.slice(0, 1200) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`KI-Prüfung HTTP ${response.status}`);
  const result = await response.json();
  if (typeof result.unsafe !== "boolean") throw new Error("Ungültige KI-Antwort.");
  return result;
}

export function attachMessageScanner(client) {
  client.on("messageCreate", async message => {
    if (!message.inGuild() || message.author.bot || !message.content?.trim()) return;

    const env = await getGuildEnv(message.guildId);
    if (env.VEXORA_FILTER_ENABLED !== "true" || !env.LOG_CHANNEL_ID) return;

    try {
      const verdict = await classifyMessage(message.content);
      if (!verdict.unsafe) return;

      const logChannel = await message.guild.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null);
      if (!logChannel?.isTextBased() || !logChannel.send) return;

      const safeContent = message.content.replace(/@/g, "@\u200b").slice(0, 1200);
      const categories = Array.isArray(verdict.categories) ? verdict.categories.join(", ") : "mögliche Beleidigung/Belästigung";
      const report = await logChannel.send({
        content: [
          "**VEXORA – KI-Prüfung: mögliche Beleidigung erkannt**",
          `Mitglied: <@${message.author.id}> (${message.author.id})`,
          `Kanal: <#${message.channelId}>`,
          `Zeit: <t:${Math.floor(message.createdTimestamp / 1000)}:F>`,
          `Kategorie: ${categories}`,
          `Nachricht: > ${safeContent.replace(/\n/g, "\n> ")}`,
          `Nachricht öffnen: ${message.url}`,
          "",
          "Dies ist nur ein KI-Hinweis. Es wurde **keine automatische Strafe** ausgelöst. Bitte prüft den Kontext manuell.",
        ].join("\n"),
        allowedMentions: { parse: [] },
      });
      await report.edit({ components: [actionRow(message.channelId, message.id, message.author.id, report.id)] });
    } catch (error) {
      console.error("VEXORA: KI-Nachrichtenprüfung fehlgeschlagen:", error.message);
    }
  });
}
