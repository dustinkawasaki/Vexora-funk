import "dotenv/config";
import {
  Client, Events, GatewayIntentBits, MessageFlags, PermissionsBitField, EmbedBuilder
} from "discord.js";
import { hasStaffRole, isOwner, isModerator, canManageTarget } from "./security/permissions.js";
import { registerCommands } from "./commands/register.js";
import { attachMessageScanner } from "./moderation/messageScanner.js";
import { handleModerationButton } from "./moderation/actions.js";
import { attachLogging } from "./events/logging.js";
import { getGuildEnv } from "./config/guildConfig.js";
import { attachActivityGuard } from "./moderation/activityGuard.js";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`VEXORA: Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
] });

client.once(Events.ClientReady, ready => console.log(`VEXORA Bot online: ${ready.user.tag}`));
attachMessageScanner(client);
attachLogging(client);
attachActivityGuard(client);

const factionEnv = { police: "POLICE_ROLE_ID", ems: "EMS_ROLE_ID", fire: "FIRE_ROLE_ID" };
const factionNames = { police: "Polizei", ems: "Rettungsdienst", fire: "Feuerwehr" };
const logAction = async (guild, title, description) => {
  const env = await getGuildEnv(guild.id);
  if (env.VEXORA_LOGS_ENABLED !== "true") return;
  const channel = env.LOG_CHANNEL_ID ? await guild.channels.fetch(env.LOG_CHANNEL_ID).catch(() => null) : null;
  if (channel?.isTextBased()) await channel.send({ embeds: [new EmbedBuilder().setColor(0x2878ff).setTitle(title).setDescription(description).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => null);
};
const reply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && await handleModerationButton(interaction)) return;
    if (!interaction.isChatInputCommand()) return;
    const name = interaction.commandName;
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const guildEnv = interaction.guildId ? await getGuildEnv(interaction.guildId) : process.env;

    if (name === "vexora-status") {
      return reply(interaction, `VEXORA Bot ist online. Ping: ${client.ws.ping} ms. Rollenprüfung: ${hasStaffRole(member, guildEnv) ? "Team erkannt" : "kein Teamzugriff"}.`);
    }
    if (name === "vexora-hilfe") {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2878ff).setTitle("VEXORA Bot – Hilfe").setDescription([
        "**Moderation:** /warn, /kick, /ban, /clear",
        "**Personal:** /promote, /demote, /einstellen, /feuern",
        "**Fraktionen & Funk:** /fraktion, /funk",
        "**Status:** /vexora-status"
      ].join("\n"))], flags: MessageFlags.Ephemeral });
    }
    if (name === "fraktion") {
      const lines = Object.entries(factionEnv).map(([key, envKey]) => {
        const roleId = guildEnv[envKey];
        return `**${factionNames[key]}:** ${roleId ? `<@&${roleId}>` : "Noch nicht konfiguriert"}`;
      });
      return reply(interaction, lines.join("\n"));
    }
    if (name === "funk") {
      if (!isModerator(member, guildEnv)) return reply(interaction, "Dafür brauchst du eine konfigurierte Owner- oder Moderator-Rolle.");
      const channel = guildEnv.FUNK_CHANNEL_ID ? await interaction.guild.channels.fetch(guildEnv.FUNK_CHANNEL_ID).catch(() => null) : null;
      if (!channel?.isTextBased()) return reply(interaction, "Der Funkkanal ist nicht eingerichtet. Bitte FUNK_CHANNEL_ID beim Hoster setzen.");
      await channel.send({ content: `📻 **VEXORA FUNK** · <@${interaction.user.id}>\n${interaction.options.getString("nachricht")}`, allowedMentions: { parse: [] } });
      return reply(interaction, "Funkmeldung wurde gesendet.");
    }

    const staffOnly = ["kick","ban","warn","clear","promote","demote","einstellen","feuern"];
    if (staffOnly.includes(name) && !isModerator(member)) return reply(interaction, "Zugriff verweigert: Du brauchst eine konfigurierte Owner- oder Moderator-Rolle.");

    if (["kick","ban","warn","promote","demote","einstellen","feuern"].includes(name)) {
      const user = interaction.options.getUser("mitglied", true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return reply(interaction, "Mitglied wurde auf diesem Server nicht gefunden.");
      const botMember = interaction.guild.members.me;
      if (!canManageTarget(member, target, botMember)) return reply(interaction, "Sicherheitsstopp: Dieses Mitglied steht auf gleicher/höherer Rollenebene oder kann nicht verwaltet werden.");
      if (name === "ban" && !isOwner(member, guildEnv)) return reply(interaction, "Bannen ist nur Ownern erlaubt.");

      if (name === "kick" || name === "ban") {
        const permission = name === "kick" ? PermissionsBitField.Flags.KickMembers : PermissionsBitField.Flags.BanMembers;
        if (!botMember.permissions.has(permission)) return reply(interaction, `Dem Bot fehlt die Discord-Berechtigung: ${name === "kick" ? "Mitglieder kicken" : "Mitglieder bannen"}.`);
        const reason = interaction.options.getString("grund") || `VEXORA Moderation durch ${interaction.user.tag}`;
        if (name === "kick") await target.kick(reason);
        else await target.ban({ reason });
        await logAction(interaction.guild, name === "kick" ? "Mitglied gekickt" : "Mitglied gebannt", `Ziel: ${user.tag} (${user.id})\nTeam: <@${interaction.user.id}>\nGrund: ${reason}`);
        return reply(interaction, `${user.tag} wurde ${name === "kick" ? "gekickt" : "gebannt"}.`);
      }
      if (name === "warn") {
        const reason = interaction.options.getString("grund", true);
        await target.send(`Du hast eine Verwarnung auf **${interaction.guild.name}** erhalten. Grund: ${reason}`).catch(() => null);
        await logAction(interaction.guild, "Verwarnung", `Ziel: <@${user.id}>\nTeam: <@${interaction.user.id}>\nGrund: ${reason}`);
        return reply(interaction, `${user.tag} wurde verwarnt und der Vorgang protokolliert.`);
      }
      if (name === "promote" || name === "demote") {
        const role = interaction.options.getRole("rolle", true);
        if (role.managed || role.id === interaction.guild.id || botMember.roles.highest.comparePositionTo(role) <= 0) return reply(interaction, "Diese Rolle kann der Bot wegen Rollenrang oder Integration nicht verwalten.");
        if (member.id !== interaction.guild.ownerId && member.roles.highest.comparePositionTo(role) <= 0) return reply(interaction, "Du kannst keine Rolle auf gleicher oder höherer Ebene verwalten.");
        if (name === "promote") await target.roles.add(role, `Beförderung durch ${interaction.user.tag}`);
        else await target.roles.remove(role, `Degradierung durch ${interaction.user.tag}`);
        await logAction(interaction.guild, name === "promote" ? "Beförderung" : "Degradierung", `Mitglied: <@${user.id}>\nRolle: <@&${role.id}>\nDurch: <@${interaction.user.id}>`);
        return reply(interaction, `${role.name} wurde ${name === "promote" ? "vergeben" : "entfernt"}.`);
      }
      if (name === "einstellen" || name === "feuern") {
        const faction = interaction.options.getString("fraktion", true);
        const roleId = process.env[factionEnv[faction]];
        if (!roleId) return reply(interaction, `Die Rolle für ${factionNames[faction]} ist noch nicht konfiguriert.`);
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role || role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) return reply(interaction, "Die Fraktionsrolle fehlt oder liegt über der Bot-Rolle.");
        if (name === "einstellen") await target.roles.add(role, `Einstellung in ${factionNames[faction]} durch ${interaction.user.tag}`);
        else await target.roles.remove(role, `Entlassung aus ${factionNames[faction]} durch ${interaction.user.tag}`);
        await logAction(interaction.guild, name === "einstellen" ? "Fraktionseinstellung" : "Fraktionsentlassung", `Mitglied: <@${user.id}>\nFraktion: ${factionNames[faction]}\nDurch: <@${interaction.user.id}>`);
        return reply(interaction, `${user.tag} wurde ${name === "einstellen" ? "eingestellt" : "entlassen"}: ${factionNames[faction]}.`);
      }
    }

    if (name === "clear") {
      if (!interaction.channel?.isTextBased() || !interaction.channel.bulkDelete) return reply(interaction, "Dieser Kanal unterstützt das Löschen nicht.");
      const amount = interaction.options.getInteger("anzahl", true);
      if (!interaction.guild.members.me.permissionsIn(interaction.channel).has(PermissionsBitField.Flags.ManageMessages)) return reply(interaction, "Dem Bot fehlt Nachrichten verwalten.");
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await logAction(interaction.guild, "Nachrichten gelöscht", `${deleted.size} Nachrichten · Kanal <#${interaction.channelId}> · durch <@${interaction.user.id}>`);
      return reply(interaction, `${deleted.size} Nachrichten gelöscht. Ältere Nachrichten als 14 Tage überspringt Discord.`);
    }
  } catch (error) {
    console.error("VEXORA: Interaktion fehlgeschlagen:", error);
    const message = "Die Aktion ist fehlgeschlagen. Prüfe Bot-Rechte, Rollenreihenfolge und Konfiguration.";
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await reply(interaction, message).catch(() => null);
    else if (interaction.isRepliable()) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
});

client.on(Events.Error, error => console.error("VEXORA Discord-Verbindungsfehler:", error));
try {
  await registerCommands({ token: process.env.DISCORD_TOKEN, clientId: process.env.DISCORD_CLIENT_ID, guildId: process.env.DISCORD_GUILD_ID });
  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("VEXORA konnte nicht gestartet werden:", error);
  process.exit(1);
}
