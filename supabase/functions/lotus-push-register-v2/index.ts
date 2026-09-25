// Public endpoint: only anonymous device subscriptions, never Lotus health data.
const TABLE = "lotus_push_v2";
const allowedOrigin = Deno.env.get("LOTUS_APP_ORIGIN") || "";
const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function respond(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type"
    }
  });
}

async function database(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceKey);
  if (!serviceKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${serviceKey}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (!response.ok) throw new Error(`Storage error (${response.status})`);
  return body;
}

async function digest(secret: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigin || origin !== allowedOrigin) return respond({ error: "Origin not allowed." }, 403, allowedOrigin || "null");
  if (request.method === "OPTIONS") return respond({ ok: true }, 200, origin);
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405, origin);
  if (!url || !serviceKey) return respond({ error: "Reminder service is not configured." }, 503, origin);
  try {
    if (Number(request.headers.get("content-length") || 0) > 8192) return respond({ error: "Request too large." }, 413, origin);
    const body = await request.json();
    const id = String(body.deviceId || "");
    const secret = String(body.deviceSecret || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return respond({ error: "Invalid device credentials." }, 400, origin);
    const hash = await digest(secret);
    const rows = await database(`${TABLE}?id=eq.${encodeURIComponent(id)}&select=id,secret_hash,endpoint`) as Array<{ id: string; secret_hash: string; endpoint: string }>;
    const existing = rows?.[0];
    if (existing && existing.secret_hash !== hash) return respond({ error: "Device access denied." }, 403, origin);
    if (body.action === "unregister") {
      if (existing) await database(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return respond({ ok: true }, 200, origin);
    }
    if (body.action !== "register") return respond({ error: "Unknown action." }, 400, origin);
    const endpoint = String(body.subscription?.endpoint || "");
    const p256dh = String(body.subscription?.p256dh || "");
    const auth = String(body.subscription?.auth || "");
    const timezone = String(body.timezone || "");
    if (!endpoint.startsWith("https://") || endpoint.length > 2048
      || !/^[A-Za-z0-9_-]{80,120}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,60}$/.test(auth)
      || timezone.length > 100) return respond({ error: "Invalid subscription." }, 400, origin);
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
    catch { return respond({ error: "Invalid timezone." }, 400, origin); }
    const row = { id, secret_hash: hash, endpoint, p256dh, auth, timezone, enabled: true, updated_at: new Date().toISOString() };
    if (existing) {
      await database(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(row) });
    } else {
      await database(TABLE, { method: "POST", body: JSON.stringify(row) });
    }
    return respond({ ok: true }, 200, origin);
  } catch {
    return respond({ error: "Reminder registration failed; retry in a moment." }, 500, origin);
  }
});
