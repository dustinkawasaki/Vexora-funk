import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";

const alertCooldown = new Map();

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

async function alertDeveloper(client, message, matchedTerm) {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (alertCooldown.get(key) || 0) < 5 * 60_000) return;
  alertCooldown.set(key, now);
  const ids = (process.env.BOT_DEVELOPER_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  for (const id of ids) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user) continue;
    const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle("VEXORA – Sofortiger Sicherheits-Hinweis")
      .setDescription([
        `Server: ${message.guild.name} (${message.guildId})`,
        `Mitglied: ${message.author.tag} (${message.author.id})`,
        `Kanal: ${message.channelId}`,
        `Treffer: ${matchedTerm}`,
        `Nachricht: ${message.url}`,
        "",
        "Ein konfigurierter Begriff wurde gefunden. Bitte Kontext manuell prüfen; dies ist kein automatisches Urteil.",
      ].join("\n")).setTimestamp();
    await user.send({ embeds: [embed] }).catch(() => null);
  }
}

export function attachMessageScanner(client) {
  client.on("messageCreate", async message => {
    if (!message.inGuild() || message.author.bot || !message.content) return;
    const env = await getGuildEnv(message.guildId);
    if (env.VEXORA_FILTER_ENABLED !== "true") return;
    const terms = (env.BLOCKED_TERMS || "").split(",").map(term => term.trim().toLocaleLowerCase("de-DE")).filter(Boolean);
    if (!terms.length) return;

    const matchedTerm = findMatchedTerm(message.content, terms);
    if (!matchedTerm) return;

    try {
      await alertDeveloper(client, message, matchedTerm);
      if (!env.LOG_CHANNEL_ID) return;
      const logChannel = await message.guild.channels.fetch(env.LOG_CHANNEL_ID);
      if (!logChannel?.isTextBased() || !logChannel.send) return;
      const safeContent = message.content.replace(/@/g, "@\\u200b").slice(0, 1200);
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
