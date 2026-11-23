import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { hasStaffRole } from "./security/permissions.js";
import { registerCommands } from "./commands/register.js";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`VEXORA: Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`VEXORA Bot online: ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "vexora-status") {
    try {
      // Fetch the current guild member from Discord, then check actual role IDs.
      // Never authorize based on nickname, display name, or a client-side button.
      const member = await interaction.guild?.members.fetch(interaction.user.id);

      if (!hasStaffRole(member)) {
        await interaction.reply({
          content: "Zugriff verweigert: Nur Mitglieder mit der konfigurierten Owner- oder Moderator-Rolle dürfen diese Funktion nutzen.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        content: "VEXORA Bot ist online. Die Rollenprüfung funktioniert.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("VEXORA: Rollenprüfung fehlgeschlagen:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Die Berechtigung konnte gerade nicht sicher geprüft werden. Bitte später erneut versuchen.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("VEXORA Discord-Verbindungsfehler:", error);
});

try {
  await registerCommands({
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  });
  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error("VEXORA konnte nicht gestartet werden:", error);
  process.exit(1);
}
