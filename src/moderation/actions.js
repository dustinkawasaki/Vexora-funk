import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";
import { hasStaffRole, isOwner, canManageTarget } from "../security/permissions.js";
import { getGuildEnv } from "../config/guildConfig.js";

const PREFIX = "vexmod";
const VALID_ACTIONS = new Set(["warn", "ignore", "kick", "ban", "ban-confirm", "cancel"]);

function makeId(action, channelId, messageId, userId, reportId) {
  return [PREFIX, action, channelId, messageId, userId, reportId].join(":");
}

async function authorizedMember(interaction) {
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  const env = await getGuildEnv(interaction.guildId);
  return member && hasStaffRole(member, env) ? { member, env } : null;
}

async function editReport(interaction, reportId, content) {
  const report = await interaction.channel.messages.fetch(reportId);
  await report.edit({ content, components: [], allowedMentions: { parse: [] } });
}

export async function handleModerationButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${PREFIX}:`)) return false;

  const [prefix, action, channelId, messageId, userId, reportId] = interaction.customId.split(":");
  if (prefix !== PREFIX || !VALID_ACTIONS.has(action) || !channelId || !messageId || !userId || !reportId) {
    await interaction.reply({ content: "Ungültige Moderationsaktion.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const authorization = await authorizedMember(interaction).catch(() => null);
  const member = authorization?.member;
  const env = authorization?.env || process.env;
  if (!member) {
    await interaction.reply({ content: "Zugriff verweigert. Nur konfigurierte Owner-/Moderator-Rollen dürfen diese Buttons nutzen.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "cancel") {
    await interaction.update({ content: "Bannvorgang abgebrochen.", components: [] });
    return true;
  }

  if ((action === "ban" || action === "ban-confirm") && !isOwner(member, env)) {
    await interaction.reply({ content: "Ein Bann darf nur von einem Owner bestätigt werden.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "ban") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(makeId("ban-confirm", channelId, messageId, userId, reportId)).setLabel("Ja, bannen").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(makeId("cancel", channelId, messageId, userId, reportId)).setLabel("Abbrechen").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ content: "Bist du sicher, dass dieser Spieler gebannt werden soll?", components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const guild = interaction.guild;
    if (action === "kick" || action === "ban-confirm") {
      const target = await guild.members.fetch(userId).catch(() => null);
      const botMember = guild.members.me;
      if (!target || !canManageTarget(member, target, botMember)) {
        await interaction.followUp({ content: "Sicherheitsstopp: Dieses Mitglied kann wegen Rollenrang oder Berechtigungen nicht verwaltet werden.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (action === "kick" && !botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        await interaction.followUp({ content: "Dem Bot fehlt die Berechtigung Mitglieder kicken.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (action === "ban-confirm" && !botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        await interaction.followUp({ content: "Dem Bot fehlt die Berechtigung Mitglieder bannen.", flags: MessageFlags.Ephemeral });
        return true;
      }
    }
    const reason = action === "warn" ? "Verwarnung nach manueller Teamprüfung" :
      action === "ignore" ? "Meldung nach manueller Prüfung ignoriert" :
      action === "kick" ? "Kick nach manueller Teamprüfung" : "Bann nach Owner-Bestätigung";

    if (action === "warn") {
      const target = await guild.members.fetch(userId).catch(() => null);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      const original = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (original) await original.delete();
      if (target) await target.send("Du hast eine Verwarnung vom VEXORA-Team erhalten. Bitte beachte die Serverregeln.").catch(() => null);
      await editReport(interaction, reportId, `**Verwarnung ausgesprochen**\nSpieler-ID: ${userId}\nTeammitglied: <@${interaction.user.id}>\nGrund: ${reason}`);
    } else if (action === "ignore") {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      const original = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (original) await original.delete();
      await editReport(interaction, reportId, `**Meldung wurde ignoriert**\nSpieler-ID: ${userId}\nGeprüft von: <@${interaction.user.id}>\nDie gemeldete Nachricht wurde gelöscht; der ursprüngliche Hinweis bleibt im Teamkanal erhalten.`);
    } else if (action === "kick") {
      const target = await guild.members.fetch(userId);
      if (!guild.members.me?.permissions.has(PermissionsBitField.Flags.KickMembers)) throw new Error("Dem Bot fehlt die Berechtigung Mitglieder kicken.");
      await target.kick(reason);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      const original = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (original) await original.delete().catch(() => null);
      await editReport(interaction, reportId, `**Spieler gekickt**\nSpieler-ID: ${userId}\nAusgeführt von: <@${interaction.user.id}>\nGrund: ${reason}\nWiderruf wird in einem späteren Schritt ergänzt.`);
    } else if (action === "ban-confirm") {
      if (!guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) throw new Error("Dem Bot fehlt die Berechtigung Mitglieder bannen.");
      await guild.members.ban(userId, { reason });
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      const original = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (original) await original.delete().catch(() => null);
      await editReport(interaction, reportId, `**Spieler gebannt**\nSpieler-ID: ${userId}\nAusgeführt von: <@${interaction.user.id}>\nGrund: ${reason}\nWiderruf wird in einem späteren Schritt ergänzt.`);
    }
  } catch (error) {
    await interaction.followUp({ content: `Aktion fehlgeschlagen: ${error.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  return true;
}
