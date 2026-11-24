import { EmbedBuilder, Events, PermissionsBitField } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";

const DISCORD_ID = /^\d{17,20}$/;

function configuredIds(value = "") {
  return new Set(value.split(",").map(value => value.trim()).filter(id => DISCORD_ID.test(id)));
}

export function isGlobalBotModerator(userId) {
  const allowed = new Set([
    ...configuredIds(process.env.VEXORA_DEVELOPER_IDS),
    ...configuredIds(process.env.VEXORA_BOT_MODERATOR_IDS),
  ]);
  return allowed.has(userId);
}

function getSupabaseConfig() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  return { base, key };
}

async function requestWarnings({ method = "GET", query = {}, body }) {
  const { base, key } = getSupabaseConfig();
  const url = new URL("/rest/v1/vexora_global_warnings", base);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);

  const response = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { Prefer: "return=representation" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase global warnings HTTP ${response.status}: ${detail}`);
  }
  if (response.status === 204) return [];
  return response.json();
}

export async function createGlobalWarning({ userId, guildId, reason, issuedBy }) {
  if (!DISCORD_ID.test(userId) || !DISCORD_ID.test(issuedBy) || !DISCORD_ID.test(guildId)) {
    throw new Error("Ungültige Discord-ID.");
  }
  const cleanReason = reason.trim();
  if (!cleanReason || cleanReason.length > 400) throw new Error("Der Grund muss 1 bis 400 Zeichen lang sein.");

  const rows = await requestWarnings({
    method: "POST",
    body: { user_id: userId, guild_id: guildId, reason: cleanReason, issued_by: issuedBy, active: true },
  });
  return rows[0] || null;
}

async function getActiveWarnings(userId) {
  return requestWarnings({
    query: {
      select: "id,user_id,guild_id,reason,issued_by,issued_at,active",
      user_id: `eq.${userId}`,
      active: "eq.true",
      order: "issued_at.desc",
      limit: "10",
    },
  });
}

export function attachGlobalWarningAlerts(client) {
  client.on(Events.GuildMemberAdd, async member => {
    try {
      const warnings = await getActiveWarnings(member.id);
      if (!warnings.length) return;

      const env = await getGuildEnv(member.guild.id);
      if (!env.LOG_CHANNEL_ID) {
        console.warn(`VEXORA: Globaler Warnhinweis für ${member.id} nicht gesendet: kein Moderations-Logkanal konfiguriert.`);
        return;
      }

      const channel = await member.guild.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null);
      if (!channel?.isTextBased() || !channel.send) return;

      // Global warnings are confidential: only use a channel hidden from @everyone.
      const everyoneCanView = channel.permissionsFor(member.guild.roles.everyone)
        ?.has(PermissionsBitField.Flags.ViewChannel);
      if (everyoneCanView !== false) {
        console.warn(`VEXORA: Globaler Warnhinweis für ${member.id} übersprungen: Der Logkanal ist nicht nachweislich privat.`);
        return;
      }

      const entries = warnings.slice(0, 5).map((warning, index) => {
        const timestamp = Math.floor(new Date(warning.issued_at).getTime() / 1000);
        const when = Number.isFinite(timestamp) ? `<t:${timestamp}:R>` : "Zeitpunkt unbekannt";
        const reason = String(warning.reason || "Kein Grund hinterlegt").replace(/@/g, "@\u200b");
        return `**${index + 1}. Verwarnung** · ${when}\nGrund: ${reason}\nVerwarnt durch ID: ${warning.issued_by}`;
      });

      const description = [
        `VEXORA hat ${warnings.length} aktive globale Verwarnung(en) für dieses Mitglied gefunden.`,
        "",
        ...entries,
        warnings.length > 5 ? `Weitere Einträge: ${warnings.length - 5}` : "",
        "",
        "Vertraulicher Hinweis zur manuellen Prüfung. Es wurde keine automatische Strafe ausgelöst.",
      ].join("\n").slice(0, 4000);

      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle("VEXORA – Globale Verwarnung erkannt")
          .setDescription(description)
          .setFooter({ text: `Mitglied-ID: ${member.id}` })
          .setTimestamp()],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error("VEXORA: Globaler Warnhinweis konnte nicht verarbeitet werden:", error);
    }
  });
}
