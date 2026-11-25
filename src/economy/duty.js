const JOBS = {
  police: { label: "Polizei", hourlyRate: 15 },
  fire: { label: "Feuerwehr", hourlyRate: 15 },
  ems: { label: "Rettungsdienst", hourlyRate: 15 },
  trucker: { label: "LKW-Fahrer", hourlyRate: 14 },
};

export async function callDutyRpc(functionName, payload) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error("Die sichere Supabase-Verbindung fehlt. SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen beim Bot-Hoster gesetzt sein.");
  }

  const url = new URL(`/rest/v1/rpc/${functionName}`, base);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data?.message || data?.details || data?.hint || `Supabase HTTP ${response.status}`;
    throw new Error(String(message).slice(0, 350));
  }
  return data;
}

export function getJobDefinition(job) {
  return JOBS[job] || null;
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} Std. ${rest} Min.` : `${rest} Min.`;
}
