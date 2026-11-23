import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField,
} from "discord.js";
import { hasStaffRole, isOwner } from "../security/permissions.js";

const PREFIX = "vexmod";
const ACTIONS = new Set(["warn", "ignore", "kick", "ban", "ban-confirm", "cancel"]);

function makeId(action, channelId, messageId, userId) {
  return [PREFIX, action, channelId, messageId, userId].join(":");
}

export function createModerationButtons({ channelId, messageId, userId }) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(makeId("warn", channelId, messageId, userId)).setLabel("Verwarnen").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(makeId("ignore", channelId, messageId, userId)).setLabel("Ignorieren").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(makeId("kick", channelId, messageId, userId)).setLabel("Kick").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(makeId("ban", channelId, messageId, userId)).setLabel("Bann").setStyle(ButtonStyle.Danger),
    ),
  ];
}

async function getAuthorizedMember(interaction) {
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  return member && hasStaffRole(member) ? member : null;
}

async function fetchOriginalMessage(guild, channelId, messageId) {
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.messages) throw new Error("Ursprungskanal nicht verfügbar.");
  return channel.messages.fetch(messageId);
}

export async function handleModerationButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${PREFIX}:`)) return false;

  const [prefix, action, channelId, messageId, userId] = interaction.customId.split(":");
  if (prefix !== PREFIX || !ACTIONS.has(action) || !channelId || !messageId || !userId) {
    await interaction.reply({ content: "Ungültige Moderationsaktion.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = await getAuthorizedMember(interaction).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "Zugriff verweigert. Nur konfigurierte Owner-/Moderator-Rollen dürfen diese Buttons nutzen.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "cancel") {
    await interaction.update({ content: "Bannvorgang abgebrochen.", components: [] });
    return true;
  }

  if (action === "ban" && !isOwner(member)) {
    await interaction.reply({ content: "Ein Bann muss von einem Owner bestätigt werden.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "ban") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(makeId("ban-confirm", channelId, messageId, userId)).setLabel("Ja, bannen").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(makeId("cancel", channelId, messageId, userId)).setLabel("Abbrechen").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ content: "Bist du sicher, dass dieser Spieler gebannt werden soll?", components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "ban-confirm" && !isOwner(member)) {
    await interaction.reply({ content: "Nur ein Owner darf den Bann bestätigen.", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const guild = interaction.guild;
    const target = await guild.members.fetch(userId).catch(() => null);
    const original = await fetchOriginalMessage(guild, channelId, messageId).catch(() => null);
    const reason = action === "warn" ? "Verwarnung nach manueller Teamprüfung" :
      action === "ignore" ? "Meldung nach manueller Prüfung ignoriert" :
      action === "kick" ? "Kick nach manueller Teamprüfung" : "Bann nach Owner-Bestätigung";

    if (action === "warn") {
      if (original) await original.delete().catch(() => null);
      if (target) await target.send("Du hast eine Verwarnung vom VEXORA-Team erhalten. Bitte beachte die Serverregeln.").catch(() => null);
      await interaction.message.edit({ content: `**Verwarnung ausgesprochen**\nSpieler-ID: ${userId}\nTeammitglied: <@${interaction.user.id}>\nGrund: ${reason}`, components: [], allowedMentions: { parse: [] } });
    } else if (action === "ignore") {
      if (original) await original.delete().catch(() => null);
      await interaction.message.edit({ content: `**Meldung wurde ignoriert**\nSpieler-ID: ${userId}\nGeprüft von: <@${interaction.user.id}>\nDie gemeldete Nachricht wurde gelöscht. Der ursprüngliche Hinweis bleibt oben im Teamverlauf erhalten.`, components: [], allowedMentions: { parse: [] } });
    } else if (action === "kick") {
      if (!target) throw new Error("Spieler ist nicht mehr auf dem Server.");
      if (!guild.members.me?.permissions.has(PermissionsBitField.Flags.KickMembers)) throw new Error("Dem Bot fehlt die Berechtigung Mitglieder kicken.");
      await target.kick(reason);
      if (original) await original.delete().catch(() => null);
      await interaction.message.edit({ content: `**Spieler gekickt**\nSpieler-ID: ${userId}\nAusgeführt von: <@${interaction.user.id}>\nGrund: ${reason}\nWiderruf: noch nicht eingerichtet.`, components: [], allowedMentions: { parse: [] } });
    } else if (action === "ban-confirm") {
      if (!guild.members.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) throw new Error("Dem Bot fehlt die Berechtigung Mitglieder bannen.");
      await guild.members.ban(userId, { reason });
      if (original) await original.delete().catch(() => null);
      await interaction.message.edit({ content: `**Spieler gebannt**\nSpieler-ID: ${userId}\nAusgeführt von: <@${interaction.user.id}>\nGrund: ${reason}\nWiderruf: noch nicht eingerichtet.`, components: [], allowedMentions: { parse: [] } });
    }
  } catch (error) {
    await interaction.followUp({ content: `Aktion fehlgeschlagen: ${error.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  return true;
}
