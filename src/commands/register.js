import { REST, Routes, SlashCommandBuilder } from "discord.js";

const factionChoices = [
  { name: "Polizei", value: "police" },
  { name: "Rettungsdienst", value: "ems" },
  { name: "Feuerwehr", value: "fire" },
];

const commands = [
  new SlashCommandBuilder().setName("vexora-status").setDescription("Zeigt den Status von VEXORA Bot."),
  new SlashCommandBuilder().setName("kick").setDescription("Entfernt ein Mitglied vom Server.")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addStringOption(o => o.setName("grund").setDescription("Grund der Maßnahme").setMaxLength(400)),
  new SlashCommandBuilder().setName("ban").setDescription("Bannt ein Mitglied (nur Owner).")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addStringOption(o => o.setName("grund").setDescription("Grund der Maßnahme").setMaxLength(400)),
  new SlashCommandBuilder().setName("warn").setDescription("Verwarnt ein Mitglied und protokolliert den Vorgang.")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addStringOption(o => o.setName("grund").setDescription("Grund der Verwarnung").setRequired(true).setMaxLength(400)),
  new SlashCommandBuilder().setName("bot").setDescription("Globale VEXORA-Botverwaltung.")
    .addSubcommand(sub => sub.setName("warn").setDescription("Erstellt eine globale Verwarnung anhand der Discord-ID.")
      .addStringOption(o => o.setName("discord_id").setDescription("Discord-ID des betroffenen Kontos").setRequired(true).setMinLength(17).setMaxLength(20))
      .addStringOption(o => o.setName("grund").setDescription("Nachvollziehbarer Grund der Verwarnung").setRequired(true).setMaxLength(400))),
  new SlashCommandBuilder().setName("clear").setDescription("Löscht mehrere Nachrichten.")
    .addIntegerOption(o => o.setName("anzahl").setDescription("Anzahl (2–100)").setMinValue(2).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("promote").setDescription("Weist einem Mitglied eine höhere/ausgewählte Rangrolle zu.")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addRoleOption(o => o.setName("rolle").setDescription("Rolle, die vergeben werden soll").setRequired(true)),
  new SlashCommandBuilder().setName("demote").setDescription("Entfernt eine Rangrolle von einem Mitglied.")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addRoleOption(o => o.setName("rolle").setDescription("Rolle, die entfernt werden soll").setRequired(true)),
  new SlashCommandBuilder().setName("einstellen").setDescription("Stellt ein Mitglied in eine Fraktion ein.")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addStringOption(o => o.setName("fraktion").setDescription("Fraktion").setRequired(true).addChoices(...factionChoices)),
  new SlashCommandBuilder().setName("feuern").setDescription("Entlässt ein Mitglied aus einer Fraktion.")
    .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true))
    .addStringOption(o => o.setName("fraktion").setDescription("Fraktion").setRequired(true).addChoices(...factionChoices)),
  new SlashCommandBuilder().setName("fraktion").setDescription("Zeigt die eingerichteten VEXORA-Fraktionen."),
  new SlashCommandBuilder().setName("funk").setDescription("Sendet eine Nachricht in den konfigurierten Funkkanal.")
    .addStringOption(o => o.setName("nachricht").setDescription("Funkmeldung").setRequired(true).setMaxLength(1500)),
  new SlashCommandBuilder().setName("vexora-hilfe").setDescription("Zeigt die verfügbaren VEXORA-Befehle."),
];

export async function registerCommands({ token, clientId, guildIds }) {
  const ids = [...new Set((guildIds || []).filter(Boolean))];
  if (!ids.length) throw new Error("Keine Discord-Server zum Registrieren der Slash-Befehle gefunden.");
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map(command => command.toJSON());
  for (const guildId of ids) await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  console.log(`VEXORA: Slash-Commands in ${ids.length} Server(n) registriert.`);
}
