const TABLE = "/rest/v1/";
function headers(env, extra = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase ist nicht konfiguriert.");
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
async function request(env, table, query = "", options = {}) {
  const url = new URL(TABLE + table, env.SUPABASE_URL);
  if (query) url.search = query;
  const response = await fetch(url, { ...options, headers: headers(env, options.headers) });
  if (!response.ok) throw new Error(`Supabase ${table}: HTTP ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}
export async function addGlobalWarning(env, { userId, guildId, reason, issuedBy }) {
  const rows = await request(env, "vexora_global_warnings", "select=id,user_id,reason,issued_by,issued_at,active", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, guild_id: guildId || null, reason, issued_by: issuedBy }),
  });
  return rows?.[0] || null;
}
export async function getActiveGlobalWarnings(env, userId) {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    active: "eq.true",
    select: "id,user_id,guild_id,reason,issued_by,issued_at",
    order: "issued_at.desc",
    limit: "20",
  });
  return request(env, "vexora_global_warnings", query.toString());
}
export async function saveQuarantine(env, record) {
  const query = new URLSearchParams({ on_conflict: "guild_id,user_id" });
  await request(env, "vexora_quarantine", query.toString(), {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      guild_id: record.guildId,
      user_id: record.userId,
      role_id: record.roleId,
      release_at: record.releaseAt,
    }),
  });
}
export async function getDueQuarantines(env) {
  const query = new URLSearchParams({
    release_at: `lte.${new Date().toISOString()}`,
    select: "guild_id,user_id,role_id,release_at",
    limit: "100",
  });
  return request(env, "vexora_quarantine", query.toString());
}
export async function deleteQuarantine(env, guildId, userId) {
  const query = new URLSearchParams({ guild_id: `eq.${guildId}`, user_id: `eq.${userId}` });
  return request(env, "vexora_quarantine", query.toString(), { method: "DELETE" });
}
export async function recordWeeklyScan(env, guildId, findingCount, summary) {
  return request(env, "vexora_weekly_scans", "", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ guild_id: guildId, finding_count: findingCount, summary }),
  });
}
export async function getLastWeeklyScan(env, guildId) {
  const query = new URLSearchParams({
    guild_id: `eq.${guildId}`,
    select: "scanned_at",
    order: "scanned_at.desc",
    limit: "1",
  });
  const rows = await request(env, "vexora_weekly_scans", query.toString());
  return rows?.[0]?.scanned_at || null;
}
