import "dotenv/config";
import {
  Client, Events, GatewayIntentBits, MessageFlags, PermissionsBitField, EmbedBuilder
} from "discord.js";
import { hasStaffRole, isOwner, isModerator, isDispatcher, canManageTarget } from "./security/permissions.js";
import { registerCommands } from "./commands/register.js";
import { attachMessageScanner } from "./moderation/messageScanner.js";
import { handleModerationButton } from "./moderation/actions.js";
import { attachLogging } from "./events/logging.js";
import { getGuildEnv } from "./config/guildConfig.js";
import { attachActivityGuard } from "./moderation/activityGuard.js";
import { attachGlobalWarningAlerts, createGlobalWarning, isGlobalBotModerator } from "./moderation/globalWarnings.js";
import { callDutyRpc, getJobDefinition, formatDuration } from "./economy/duty.js";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) {
  console.error(`VEXORA: Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
] });

let commandsReady = false;
client.once(Events.ClientReady, async ready => {
  console.log(`VEXORA Bot online: ${ready.user.tag}`);
  try {
    const guildIds = [...ready.guilds.cache.keys()];
    if (!guildIds.length && process.env.DISCORD_GUILD_ID) guildIds.push(process.env.DISCORD_GUILD_ID);
    await registerCommands({ token: process.env.DISCORD_TOKEN, clientId: process.env.DISCORD_CLIENT_ID, guildIds });
    commandsReady = true;
  } catch (error) {
    console.error("VEXORA: Slash-Commands konnten nicht registriert werden:", error);
  }
});
client.on(Events.GuildCreate, async guild => {
  if (!commandsReady) return;
  try {
    await registerCommands({ token: process.env.DISCORD_TOKEN, clientId: process.env.DISCORD_CLIENT_ID, guildIds: [guild.id] });
  } catch (error) {
    console.error(`VEXORA: Slash-Commands für Server ${guild.id} konnten nicht registriert werden:`, error);
  }
});

attachMessageScanner(client);
attachLogging(client);
attachActivityGuard(client);
attachGlobalWarningAlerts(client);

const factionEnv = { police: "POLICE_ROLE_ID", ems: "EMS_ROLE_ID", fire: "FIRE_ROLE_ID", trucker: "TRUCKER_ROLE_ID" };
const factionNames = { police: "Polizei", ems: "Rettungsdienst", fire: "Feuerwehr", trucker: "LKW-Fahrer" };
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
    if (["job", "einstempeln", "ausstempeln", "balance"].includes(name)) {
      if (!interaction.guildId) return reply(interaction, "Das Wirtschaftssystem funktioniert nur innerhalb eines Discord-Servers.");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const baseArgs = { p_guild_id: interaction.guildId, p_user_id: interaction.user.id };
      const finish = content => interaction.editReply({ content });

      if (name === "job" || name === "balance") {
        const profile = await callDutyRpc("vexora_get_job_profile", baseArgs);
        if (!profile.has_job) {
          return finish(name === "job"
            ? "Du hast noch keinen Beruf. Die Leitstelle muss dich zuerst mit **/einstellen** einstellen."
            : "Du hast noch keinen Beruf und deshalb noch kein VEXORA-Konto.");
        }
        if (name === "balance") {
          return finish(`Dein Kontostand auf **diesem Server** beträgt **${profile.balance} €**.`);
        }
        const dutyText = profile.on_duty
          ? `Im Dienst seit <t:${Math.floor(Date.parse(profile.started_at) / 1000)}:R>`
          : "Aktuell nicht im Dienst";
        const activeText = profile.is_active ? "Beruf aktiv" : "Beruf inaktiv – bitte an die Leitstelle wenden";
        return finish(`**${getJobDefinition(profile.job)?.label || profile.job}** · Rang: ${profile.rank_name}\nStundenlohn: **${profile.hourly_rate} €**\nKontostand: **${profile.balance} €**\n${activeText}\n${dutyText}`);
      }
      if (name === "einstempeln") {
        const result = await callDutyRpc("vexora_start_shift", baseArgs);
        return finish(`Du bist jetzt als **${getJobDefinition(result.job)?.label || result.job}** eingestempelt. Dein Stundenlohn beträgt **${result.hourly_rate} €**.\nDienstbeginn: <t:${Math.floor(Date.parse(result.started_at) / 1000)}:F>`);
      }
      const result = await callDutyRpc("vexora_end_shift", baseArgs);
      return finish(`Dienst beendet: **${getJobDefinition(result.job)?.label || result.job}**\nDienstzeit: **${formatDuration(result.duration_minutes)}**\nVerdient: **+${result.earned} €**\nNeuer Kontostand: **${result.balance} €**`);
    }

    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
    const guildEnv = interaction.guildId ? await getGuildEnv(interaction.guildId) : process.env;

    if (name === "bot") {
      if (!interaction.guildId) return reply(interaction, "Dieser Befehl kann nur auf einem Discord-Server verwendet werden.");
      if (interaction.options.getSubcommand() === "warn") {
        if (!isGlobalBotModerator(interaction.user.id)) {
          return reply(interaction, "Zugriff verweigert. Nur freigegebene VEXORA-Developer und Bot-Moderatoren dürfen globale Verwarnungen erstellen.");
        }
        const userId = interaction.options.getString("discord_id", true).trim();
        const reason = interaction.options.getString("grund", true).trim();
        if (!/^\d{17,20}$/.test(userId)) return reply(interaction, "Bitte gib eine gültige Discord-ID mit 17 bis 20 Ziffern ein.");
        if (!reason || reason.length > 400) return reply(interaction, "Der Grund muss zwischen 1 und 400 Zeichen lang sein.");
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const warning = await createGlobalWarning({ userId, guildId: interaction.guildId, reason, issuedBy: interaction.user.id });
        if (!warning) throw new Error("Supabase hat keinen gespeicherten Verwarnungseintrag zurückgegeben.");
        return interaction.editReply({ content: `Globale Verwarnung gespeichert. Betroffene Discord-ID: ${userId}. Eintrag: ${warning.id}` });
      }
    }

    if (name === "vexora-status") {
      return reply(interaction, `VEXORA Bot ist online. Ping: ${client.ws.ping} ms. Rollenprüfung: ${hasStaffRole(member, guildEnv) ? "Team erkannt" : "kein Teamzugriff"}.`);
    }
    if (name === "vexora-hilfe") {
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2878ff).setTitle("VEXORA Bot – Hilfe").setDescription([
        "**Wirtschaft:** /job, /einstempeln, /ausstempeln, /balance",
        "**Moderation:** /warn, /kick, /ban, /clear",
        "**Globale Moderation:** /bot warn",
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

    const staffOnly = ["kick","ban","warn","clear","promote","demote"];
    if (staffOnly.includes(name) && !isModerator(member, guildEnv)) return reply(interaction, "Zugriff verweigert: Du brauchst eine konfigurierte Owner- oder Moderator-Rolle.");
    if (["einstellen","feuern"].includes(name) && !isDispatcher(interaction.user.id)) {
      return reply(interaction, "Nur die ausdrücklich konfigurierte Leitstelle darf Roleplay-Mitarbeiter einstellen oder entlassen.");
    }
    if (["promote", "demote"].includes(name)) {
      const requiredPermission = guildEnv.PROMOTE_PERMISSION === "administrator" ? PermissionsBitField.Flags.Administrator : PermissionsBitField.Flags.ManageRoles;
      if (!member?.permissions?.has(requiredPermission)) return reply(interaction, guildEnv.PROMOTE_PERMISSION === "administrator" ? "Nur Administratoren dürfen diese Aktion ausführen." : "Du brauchst die Discord-Berechtigung Rollen verwalten.");
    }

    if (["kick","ban","warn","promote","demote","einstellen","feuern"].includes(name)) {
      const user = interaction.options.getUser("mitglied", true);
      const target = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!target) return reply(interaction, "Mitglied wurde auf diesem Server nicht gefunden.");
      const botMember = interaction.guild.members.me;
      const employmentAction = ["einstellen","feuern"].includes(name);
      if (!employmentAction && !canManageTarget(member, target, botMember)) return reply(interaction, "Sicherheitsstopp: Dieses Mitglied steht auf gleicher/höherer Rollenebene oder kann nicht verwaltet werden.");
      if (employmentAction && (target.id === interaction.user.id || target.id === interaction.guild.ownerId || botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0)) {
        return reply(interaction, "Sicherheitsstopp: Dieses Mitglied kann durch die Leitstelle nicht verwaltet werden.");
      }
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
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) return reply(interaction, "Dem Bot fehlt die Berechtigung Rollen verwalten.");
        const hadRole = target.roles.cache.has(role.id);

        if (name === "einstellen") {
          if (!hadRole) await target.roles.add(role, `Einstellung in ${factionNames[faction]} durch ${interaction.user.tag}`);
          try {
            const definition = getJobDefinition(faction);
            await callDutyRpc("vexora_choose_job", {
              p_guild_id: interaction.guildId, p_user_id: user.id,
              p_job: faction, p_hourly_rate: definition.hourlyRate
            });
          } catch (error) {
            if (!hadRole) await target.roles.remove(role, "VEXORA: Einstellung wegen Datenbankfehler zurückgerollt.").catch(() => null);
            return reply(interaction, `Einstellung nicht gespeichert: ${String(error.message).slice(0,250)}`);
          }
        } else {
          try {
            const current = await callDutyRpc("vexora_get_job_profile", {
              p_guild_id: interaction.guildId, p_user_id: user.id
            });
            if (!current.has_job || current.job !== faction) {
              return reply(interaction, `Diese Person ist nicht bei ${factionNames[faction]} eingestellt.`);
            }
            await callDutyRpc("vexora_deactivate_job", { p_guild_id: interaction.guildId, p_user_id: user.id });
          } catch (error) {
            return reply(interaction, `Entlassung nicht möglich: ${String(error.message).slice(0,250)}`);
          }
          if (hadRole) await target.roles.remove(role, `Entlassung aus ${factionNames[faction]} durch ${interaction.user.tag}`);
        }

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
    const knownErrors = [
      "Du bist bereits eingestempelt.",
      "Du bist aktuell nicht eingestempelt.",
      "Die Leitstelle muss dich zuerst einstellen.",
      "Dein Beruf ist derzeit nicht aktiv.",
      "Die Person ist noch im Dienst und muss sich zuerst ausstempeln.",
      "Diese Person hat bereits einen anderen Beruf. Umschulung wird später ergänzt.",
      "Für diese Person ist kein Beruf hinterlegt."
    ];
    const message = knownErrors.find(text => String(error.message).includes(text))
      || (String(error.message).includes("SUPABASE_URL")
        ? "Die sichere Datenbankverbindung des Bots ist noch nicht eingerichtet."
        : "Die Aktion ist fehlgeschlagen. Prüfe Bot-Rechte, Rollenreihenfolge und Konfiguration.");
    if (interaction.isRepliable() && interaction.deferred) await interaction.editReply({ content: message }).catch(() => null);
    else if (interaction.isRepliable() && !interaction.replied) await reply(interaction, message).catch(() => null);
    else if (interaction.isRepliable()) await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
});

client.on(Events.Error, error => console.error("VEXORA Discord-Verbindungsfehler:", error));
try {
  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("VEXORA konnte nicht gestartet werden:", error);
  process.exit(1);
}
