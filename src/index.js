import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import { hasStaffRole } from "./security/permissions.js";
import { registerCommands } from "./commands/register.js";
import { attachMessageScanner } from "./moderation/messageScanner.js";
import { handleModerationButton } from "./moderation/actions.js";

const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_GUILD_ID"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`VEXORA: Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`VEXORA Bot online: ${readyClient.user.tag}`);
});

attachMessageScanner(client);

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      const handled = await handleModerationButton(interaction);
      if (handled) return;
    }
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "vexora-status") {
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
    }
  } catch (error) {
    console.error("VEXORA: Interaktion fehlgeschlagen:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Die Aktion konnte nicht sicher ausgeführt werden. Bitte später erneut versuchen.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
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
