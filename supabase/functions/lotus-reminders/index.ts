import webpush from "npm:web-push@3.6.7";

const PUSH_TABLE = "q4n8";
const REMINDER_TEXT = "Take some time to pause and reflect.";
const REMINDER_HOUR = 21;
const DEFAULT_TIMEZONE = Deno.env.get("LOTUS_DEFAULT_TIMEZONE") || "UTC";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string | null;
  last_sent_date: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function getRequiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function isAuthorized(request: Request) {
  const expected = getRequiredSecret("LOTUS_CRON_SECRET");
  const received = request.headers.get("x-cron-secret") || "";
  return received === expected;
}

async function supabaseRest(path: string, options: RequestInit = {}) {
  const supabaseUrl = getRequiredSecret("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(options.headers || {});
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${supabaseUrl}${path}`, { ...options, headers });
  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (!response.ok) {
    const detail = body as { message?: string; error?: string } | null;
    throw new Error(detail?.message || detail?.error || `Supabase request failed (${response.status}).`);
  }
  return body;
}

function localClock(timeZone: string | null, instant: Date) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(instant);
    const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
    let hour = Number(value("hour"));
    if (hour === 24) hour = 0;
    return {
      date: `${value("year")}-${value("month")}-${value("day")}`,
      hour,
      minute: Number(value("minute"))
    };
  } catch {
    return null;
  }
}

async function markSent(id: string, date: string) {
  await supabaseRest(`/rest/v1/${PUSH_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_sent_date: date, updated_at: new Date().toISOString() })
  });
}

async function removeSubscription(id: string) {
  await supabaseRest(`/rest/v1/${PUSH_TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok");

  try {
    if (!isAuthorized(request)) return json({ error: "Unauthorized" }, 401);

    const vapidPublicKey = getRequiredSecret("LOTUS_VAPID_PUBLIC_KEY");
    const vapidPrivateKey = getRequiredSecret("LOTUS_VAPID_PRIVATE_KEY");
    const vapidSubject = getRequiredSecret("LOTUS_VAPID_SUBJECT");
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const rows = await supabaseRest(
      `/rest/v1/${PUSH_TABLE}?enabled=eq.true&select=id,endpoint,p256dh,auth,timezone,last_sent_date`
    ) as PushSubscriptionRow[];
    const payload = JSON.stringify({
      title: "Lotus",
      body: REMINDER_TEXT,
      url: "./#today",
      tag: "lotus-daily-entry"
    });
    const now = new Date();
    let sent = 0;
    let expired = 0;
    const errors: string[] = [];

    for (const row of rows || []) {
      const clock = localClock(row.timezone, now);
      if (!clock || clock.hour !== REMINDER_HOUR || row.last_sent_date === clock.date) continue;
      try {
        await webpush.sendNotification({
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth }
        }, payload);
        await markSent(row.id, clock.date);
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(row.id);
          expired += 1;
        } else {
          errors.push(row.id);
        }
      }
    }

    return json({ ok: true, checked: rows?.length || 0, sent, expired, errors });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Push reminder failed." }, 500);
  }
});
