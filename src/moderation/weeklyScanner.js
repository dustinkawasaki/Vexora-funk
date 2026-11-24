import { Events, PermissionsBitField, EmbedBuilder } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";
import { getLastWeeklyScan, recordWeeklyScan } from "../security/securityStore.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_CHANNEL = 500;
const BATCH = 100;

async function notifyDevelopers(client, guild, summary) {
  const ids = (process.env.BOT_DEVELOPER_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  const embed = new EmbedBuilder().setColor(summary.findings ? 0xf59e0b : 0x22c55e)
    .setTitle("VEXORA – wöchentlicher Sicherheitsbericht")
    .setDescription([
      `Server: **${guild.name}** (${guild.id})`,
      `Untersuchte Nachrichten: **${summary.scannedMessages}**`,
      `Treffer für konfigurierte Begriffe: **${summary.findings}**`,
      `Nicht vollständig durchsuchte Kanäle: **${summary.truncatedChannels}**`,
      summary.examples.length ? "**Beispiele zur manuellen Prüfung:**\n" + summary.examples.map(x => `• Nutzer ${x.userId} · Kanal ${x.channelId} · Begriff ${x.term}`).join("\n") : "Keine Treffer für die konfigurierten Begriffe.",
      "",
      "Dies ist ein regelbasierter Suchlauf, keine KI-Bewertung. Ein Treffer ist kein Beweis für einen Regelverstoß. Es wurde niemand automatisch bestraft.",
    ].join("\n")).setTimestamp();
  for (const id of ids) {
    const user = await client.users.fetch(id).catch(() => null);
    if (user) await user.send({ embeds: [embed] }).catch(() => null);
  }
}

async function scanGuild(client, guild) {
  const env = await getGuildEnv(guild.id);
  if (env.WEEKLY_SCAN_ENABLED !== "true") return;
  const last = await getLastWeeklyScan(process.env, guild.id).catch(() => null);
  if (last && Date.now() - new Date(last).getTime() < WEEK) return;

  const terms = (env.BLOCKED_TERMS || "").split(",").map(x => x.trim().toLocaleLowerCase("de-DE")).filter(Boolean);
  const cutoff = Date.now() - WEEK;
  const summary = { scannedMessages: 0, findings: 0, truncatedChannels: 0, examples: [] };
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (!channel?.isTextBased?.() || !channel.messages?.fetch) continue;
    const permissions = guild.members.me?.permissionsIn(channel);
    if (!permissions?.has(PermissionsBitField.Flags.ViewChannel) ||
        !permissions.has(PermissionsBitField.Flags.ReadMessageHistory)) continue;

    let before;
    let channelCount = 0;
    let reachedCutoff = false;
    while (channelCount < MAX_PER_CHANNEL) {
      const batch = await channel.messages.fetch({ limit: BATCH, ...(before ? { before } : {}) }).catch(() => null);
      if (!batch?.size) { reachedCutoff = true; break; }
      const ordered = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      for (const message of ordered) {
        if (message.createdTimestamp < cutoff) { reachedCutoff = true; continue; }
        if (message.author?.bot || !message.content) continue;
        summary.scannedMessages++;
        const lower = message.content.toLocaleLowerCase("de-DE");
        const term = terms.find(x => lower.includes(x));
        if (term) {
          summary.findings++;
          if (summary.examples.length < 12) summary.examples.push({
            userId: message.author.id, channelId: channel.id, term, timestamp: message.createdTimestamp,
          });
        }
      }
      before = ordered[0]?.id;
      if (reachedCutoff || batch.size < BATCH) { reachedCutoff = true; break; }
      channelCount += batch.size;
    }
    if (!reachedCutoff && channelCount >= MAX_PER_CHANNEL) summary.truncatedChannels++;
  }

  await recordWeeklyScan(process.env, guild.id, summary.findings, {
    scanned_messages: summary.scannedMessages,
    truncated_channels: summary.truncatedChannels,
  });
  await notifyDevelopers(client, guild, summary);
}

export function attachWeeklyScanner(client) {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      try { await scanGuild(client, guild); }
      catch (error) { console.error("VEXORA weekly scan failed:", guild.id, error.message); }
    }
  };
  client.once(Events.ClientReady, () => {
    run().catch(() => null);
    const timer = setInterval(() => run().catch(() => null), 60 * 60 * 1000);
    timer.unref?.();
  });
}
