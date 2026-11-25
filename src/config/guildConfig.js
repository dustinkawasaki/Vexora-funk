const cache = new Map();
const CACHE_MS = 10_000;

export async function getGuildSettings(guildId) {
  if (!guildId) return {};
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return {};

  try {
    const url = new URL("/rest/v1/vexora_guild_settings", base);
    url.searchParams.set("guild_id", `eq.${guildId}`);
    url.searchParams.set("select", "settings");
    const response = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    const rows = await response.json();
    const settings = rows[0]?.settings && typeof rows[0].settings === "object" ? rows[0].settings : {};
    cache.set(guildId, { settings, expiresAt: Date.now() + CACHE_MS });
    return settings;
  } catch (error) {
    console.error("VEXORA: Server-Einstellungen konnten nicht geladen werden:", error.message);
    cache.set(guildId, { settings: {}, expiresAt: Date.now() + CACHE_MS });
    return {};
  }
}

export async function getGuildEnv(guildId) {
  const settings = await getGuildSettings(guildId);
  return {
    ...process.env,
    LOG_CHANNEL_ID: settings.logChannel || process.env.LOG_CHANNEL_ID || "",
    WELCOME_CHANNEL_ID: settings.welcomeChannel || process.env.WELCOME_CHANNEL_ID || "",
    GOODBYE_CHANNEL_ID: settings.goodbyeChannel || process.env.GOODBYE_CHANNEL_ID || "",
    FUNK_CHANNEL_ID: settings.funkChannel || process.env.FUNK_CHANNEL_ID || "",
    MODERATOR_ROLE_IDS: settings.moderatorRole || process.env.MODERATOR_ROLE_IDS || "",
    VEXORA_DISPATCHER_ROLE_IDS: settings.dispatcherRole || process.env.VEXORA_DISPATCHER_ROLE_IDS || "",
    VEXORA_LOGS_ENABLED: settings.logsEnabled === false ? "false" : "true",
    VEXORA_FILTER_ENABLED: settings.filterEnabled === true ? "true" : "false",
    VEXORA_SPAM_ENABLED: settings.spamEnabled === true ? "true" : "false",
    VEXORA_RAID_ENABLED: settings.raidEnabled === true ? "true" : "false",
    VEXORA_WELCOME_ENABLED: settings.welcomeEnabled === true ? "true" : "false",
    PROMOTE_PERMISSION: settings.promotePermission === "administrator" ? "administrator" : "manage_roles",
  };
}

export async function saveGuildSettings(guildId, settings, updatedBy = null) {
  if (!guildId) throw new Error("Server-ID fehlt.");
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase ist nicht konfiguriert.");
  const url = new URL("/rest/v1/vexora_guild_settings", base);
  url.searchParams.set("on_conflict", "guild_id");
  const response = await fetch(url, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ guild_id: guildId, settings, updated_by: updatedBy, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new Error(`Server-Einstellungen konnten nicht gespeichert werden (HTTP ${response.status}).`);
  const rows = await response.json();
  cache.delete(guildId);
  return rows[0]?.settings || settings;
}
