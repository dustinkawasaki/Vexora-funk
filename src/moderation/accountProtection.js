import { EmbedBuilder, Events, PermissionsBitField } from "discord.js";
import { getGuildEnv } from "../config/guildConfig.js";
import {
  getActiveGlobalWarnings, saveQuarantine, getDueQuarantines, deleteQuarantine,
} from "../security/securityStore.js";

const DAY = 86_400_000;

async function sendDeveloperDm(client, title, description) {
  const ids = (process.env.BOT_DEVELOPER_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  for (const id of ids) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user) continue;
    await user.send({ embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle(title).setDescription(description.slice(0, 3500)).setTimestamp()] }).catch(() => null);
  }
}

async function sendGuildLog(guild, env, title, description) {
  if (!env.LOG_CHANNEL_ID) return;
  const channel = await guild.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle(title).setDescription(description.slice(0, 3500)).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => null);
  }
}

async function applyQuarantine(member, env) {
  const roleId = env.QUARANTINE_ROLE_ID;
  if (!roleId) throw new Error("Quarantäne-Rolle ist nicht im Dashboard ausgewählt.");
  const role = await member.guild.roles.fetch(roleId).catch(() => null);
  const botMember = member.guild.members.me;
  if (!role || role.managed || !botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
      botMember.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error("Quarantäne-Rolle fehlt oder kann wegen Bot-Rechten/Rollenrang nicht vergeben werden.");
  }
  await member.roles.add(role, "VEXORA Account-Altersprüfung");
  const days = Math.min(30, Math.max(1, Number(env.QUARANTINE_DAYS) || 7));
  const releaseAt = new Date(Date.now() + days * DAY);
  await saveQuarantine(process.env, { guildId: member.guild.id, userId: member.id, roleId, releaseAt: releaseAt.toISOString() });
  await member.send(
    `VEXORA-Sicherheitshinweis: Dein Discord-Konto erfüllt noch nicht die eingestellte Altersgrenze für diesen Server. Du bist nicht gekickt. Der Serverzugriff wird voraussichtlich am ${releaseAt.toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" })} freigegeben, sofern keine weitere Sicherheitsprüfung erforderlich ist.`
  ).catch(() => null);
  return releaseAt;
}

async function releaseDue(client) {
  let rows;
  try { rows = await getDueQuarantines(process.env); }
  catch (error) { console.error("VEXORA quarantine lookup failed:", error.message); return; }
  for (const row of rows || []) {
    const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
    const member = await guild?.members.fetch(row.user_id).catch(() => null);
    if (member) {
      const role = await guild.roles.fetch(row.role_id).catch(() => null);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "VEXORA Quarantänezeit abgelaufen").catch(error => {
          console.error("VEXORA quarantine release failed:", error.message);
        });
      }
      await member.send("Deine VEXORA-Wartezeit ist abgelaufen. Dein Serverzugriff wurde freigegeben.").catch(() => null);
    }
    await deleteQuarantine(process.env, row.guild_id, row.user_id).catch(error => {
      console.error("VEXORA quarantine cleanup failed:", error.message);
    });
  }
}

export function attachAccountProtection(client) {
  client.on(Events.GuildMemberAdd, async member => {
    const env = await getGuildEnv(member.guild.id);
    try {
      const warnings = await getActiveGlobalWarnings(process.env, member.id);
      if (warnings.length) {
        const details = warnings.slice(0, 5).map(w => `• ${w.reason} (ausgestellt von ${w.issued_by})`).join("\n");
        await sendGuildLog(member.guild, env, "Globale VEXORA-Verwarnung gefunden",
          `Mitglied: ${member.user.tag} (${member.id})\n${details}\nBitte Kontext prüfen; keine automatische Strafe.`);
      }
    } catch (error) {
      console.error("VEXORA global warning lookup failed:", error.message);
    }

    if (env.ACCOUNT_PROTECTION_ENABLED !== "true") return;
    const minimumDays = Math.min(30, Math.max(1, Number(env.MIN_ACCOUNT_AGE_DAYS) || 7));
    const ageDays = (Date.now() - member.user.createdTimestamp) / DAY;
    if (ageDays >= minimumDays) return;

    try {
      const releaseAt = await applyQuarantine(member, env);
      await sendGuildLog(member.guild, env, "Neues Konto in Wartebereich",
        `Mitglied: ${member.user.tag} (${member.id})\nKontoalter: ${ageDays.toFixed(1)} Tage\nMindestalter: ${minimumDays} Tage\nFreigabe frühestens: <t:${Math.floor(releaseAt.getTime() / 1000)}:F>`);
    } catch (error) {
      await sendGuildLog(member.guild, env, "Account-Schutz benötigt Einrichtung",
        `Mitglied ${member.id} liegt unter der Altersgrenze, konnte aber nicht in Quarantäne gesetzt werden: ${error.message}`);
    }
  });

  client.once(Events.ClientReady, () => {
    releaseDue(client).catch(() => null);
    const timer = setInterval(() => releaseDue(client).catch(() => null), 60_000);
    timer.unref?.();
  });
}
