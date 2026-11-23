import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("vexora-status")
    .setDescription("Zeigt den Status des VEXORA-Bots (nur Team).")
    .toJSON(),
];

export async function registerCommands({ token, clientId, guildId }) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });
  console.log("VEXORA: Guild-Slash-Commands registriert.");
}
