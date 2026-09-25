const appRoot = document.getElementById("app");
const APP_VERSION = "2.0.0";
const LOTUS_DEPLOYMENT = Object.freeze({
  supabaseUrl: String(window.LOTUS_CONFIG?.LOTUS_SUPABASE_URL || "").trim().replace(/\/+$/, ""),
  vapidPublicKey: String(window.LOTUS_CONFIG?.LOTUS_VAPID_PUBLIC_KEY || "").trim()
});
const DB_NAME = "lotus-local-v2";
const STORE_NAME = "state";
const VAULT_KEY = "primary";
const LEGACY_DB_NAME = "lotus-local-vault";
const LEGACY_STORE_NAME = "encrypted-vault";
const PBKDF2_ITERATIONS = 150000;
const WATER_GOAL = 8;
const ENTRY_REMINDER_TEXT = "Take some time to pause and reflect.";
const FERTILE_WINDOW_DAYS = 5;
// Sohda et al. (JMIR 2017;19:e391) model the follicular phase as a linear
// function of the mean of the user's recent cycle lengths. These are their
// published coefficients for 1 through 8 prior cycles.
const OPTIMIZED_FOLLICULAR_MODELS = [
  { slope: 0.528, intercept: 0.039 },
  { slope: 0.528, intercept: 0.017 },
  { slope: 0.527, intercept: 0.012 },
  { slope: 0.526, intercept: 0.003 },
  { slope: 0.526, intercept: -0.002 },
  { slope: 0.525, intercept: -0.010 },
  { slope: 0.525, intercept: -0.011 },
  { slope: 0.525, intercept: -0.011 }
];
const SYMPTOMS = ["Cramps", "Headache", "Bloating", "Tender breasts", "Mood changes", "Fatigue", "Backache", "Nausea"];
const FLOW_OPTIONS = [
  ["none", "None"],
  ["spotting", "Spotting"],
  ["light", "Light"],
  ["medium", "Medium"],
  ["heavy", "Heavy"]
];
const SCALE_OPTIONS = [
  [1, "Very low"],
  [2, "Low"],
  [3, "Average"],
  [4, "High"],
  [5, "Very high"]
];
const SORENESS_OPTIONS = [
  ["none", "None"],
  ["mild", "Mild"],
  ["strong", "Strong"]
];
const PAIN_IMPACT_OPTIONS = [
  ["none", "None"],
  ["normal", "Continued normally"],
  ["reduced", "Reduced activities"],
  ["unable", "Unable"]
];
const CLOT_SIZE_OPTIONS = [
  ["none", "None"],
  ["small", "Under 2.5 cm"],
  ["large", "2.5 cm or larger"]
];
const PRODUCT_CHANGE_OPTIONS = [
  ["not-tracked", "Not tracked"],
  ["4-plus", "4 hours or longer"],
  ["2-to-4", "2–4 hours"],
  ["1-to-2", "1–2 hours"],
  ["under-1", "Under 1 hour"]
];
const MOOD_OPTIONS = [
  ["none", "None"],
  ["mild", "Mild"],
  ["moderate", "Moderate"],
  ["severe", "Severe"]
];
const EXERCISE_OPTIONS = [
  ["none", "None"],
  ["gentle", "Gentle"],
  ["strength", "Strength"],
  ["cardio", "Cardio"],
  ["yoga", "Yoga"]
];
const LH_OPTIONS = [["not-tested", "Not tested"], ["negative", "Negative"], ["positive", "Positive"], ["invalid", "Invalid"]];
const MUCUS_OPTIONS = [["not-observed", "Not observed"], ["dry", "Dry"], ["sticky", "Sticky"], ["creamy", "Creamy"], ["watery", "Watery"], ["clear-stretchy", "Clear and stretchy"]];
const OVULATION_SOURCE_OPTIONS = [["personal", "Personal estimate"], ["clinician", "Clinician confirmed"]];

let appState = null;
let activeView = "today";
let selectedDate = localDateString(new Date());
let calendarCursor = new Date();
let toastTimer = null;

function $(selector, parent = document) {
  return parent.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(dateString, amount) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function daysBetween(startString, endString) {
  const start = parseDate(startString).getTime();
  const end = parseDate(endString).getTime();
  return Math.round((end - start) / 86400000);
}

function formatDate(dateString, options = { weekday: "long", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", options).format(parseDate(dateString));
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validChoice(options, value, fallback = null) {
  return options.find(([optionValue]) => String(optionValue) === String(value))?.[0] ?? fallback;
}

function choiceLabel(options, value, fallback = "Not logged") {
  return options.find(([optionValue]) => String(optionValue) === String(value))?.[1] || fallback;
}

function timestampsMatch(first, second) {
  const firstTime = Date.parse(first || "");
  const secondTime = Date.parse(second || "");
  return Number.isFinite(firstTime) && Number.isFinite(secondTime) && firstTime === secondTime;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function icon(name, size = 20) {
  if (name === "settings") {
    return `<svg id="settingsSectionIcon" class="header-svg settings-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M14.2703 4.54104C14.2703 3.68995 13.5803 3 12.7292 3H11.2706C10.4195 3 9.72953 3.68995 9.72953 4.54104C9.72953 5.19575 9.30667 5.76411 8.73133 6.07658C8.64137 6.12544 8.55265 6.17624 8.46522 6.22895C7.90033 6.56948 7.19241 6.65124 6.6199 6.32367C5.87282 5.89621 4.92082 6.15129 4.48754 6.89501L3.78312 8.10415C3.35155 8.84495 3.60624 9.79549 4.35038 10.2213C4.92043 10.5474 5.2042 11.1992 5.19031 11.8558C5.1893 11.9037 5.18879 11.9518 5.18879 12C5.18879 12.0482 5.1893 12.0963 5.19032 12.1443C5.20421 12.8009 4.92043 13.4526 4.3504 13.7787C3.60628 14.2045 3.35159 15.155 3.78315 15.8958L4.48759 17.105C4.92086 17.8487 5.87286 18.1038 6.61993 17.6763C7.19243 17.3488 7.90034 17.4305 8.46523 17.7711C8.55266 17.8238 8.64138 17.8746 8.73133 17.9234C9.30667 18.2359 9.72953 18.8042 9.72953 19.459C9.72953 20.3101 10.4195 21 11.2706 21H12.7292C13.5803 21 14.2703 20.3101 14.2703 19.459C14.2703 18.8042 14.6931 18.2359 15.2685 17.9234C15.3584 17.8746 15.4471 17.8238 15.5346 17.7711C16.0994 17.4305 16.8074 17.3488 17.3799 17.6763C18.1269 18.1038 19.0789 17.8487 19.5122 17.105L20.2167 15.8958C20.6482 15.1551 20.3935 14.2045 19.6494 13.7788C19.0794 13.4526 18.7956 12.8009 18.8095 12.1443C18.8105 12.0963 18.811 12.0482 18.811 12C18.811 11.9518 18.8105 11.9037 18.8095 11.8558C18.7956 11.1992 19.0794 10.5474 19.6494 10.2213C20.3936 9.79548 20.6482 8.84494 20.2167 8.10414L19.5123 6.89501C19.079 6.15128 18.127 5.8962 17.3799 6.32366C16.8074 6.65123 16.0995 6.56948 15.5346 6.22894C15.4471 6.17624 15.3584 6.12543 15.2685 6.07658C14.6931 5.76411 14.2703 5.19575 14.2703 4.54104Z" stroke="currentColor" stroke-width="1.5"></path>
    </svg>`;
  }
  const paths = {
    today: '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.5v4.8l3.1 1.8"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17"/>',
    insights: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 4-6"/>',
    settings: '<path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 6.2 12a1.7 1.7 0 0 0-1.2-2.9h-.2a1.7 1.7 0 0 1 0-3.4H5a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1A1.7 1.7 0 0 0 11.5.2h.2a1.7 1.7 0 0 1 3.4 0v.2A1.7 1.7 0 0 0 18 1.6l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1A1.7 1.7 0 0 0 19.2 7v.2a1.7 1.7 0 0 1 0 3.4H19a1.7 1.7 0 0 0 .4 4.4Z" transform="translate(-1.5 3.8) scale(.82)"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrowLeft: '<path d="m14.5 5-7 7 7 7M8 12h12"/>',
    arrowRight: '<path d="m9.5 5 7 7-7 7M16 12H4"/>',
    water: '<path d="M12 3.5S6.5 9.4 6.5 13.7a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3.5 12 3.5Z"/>',
    exercise: '<path d="M6 9v6M3.8 10v4M18 9v6M20.2 10v4M6 12h12"/>',
    stress: '<path d="M4 12h3l2-5 3 10 2-5h4"/>',
    heart: '<path d="M20.5 8.8c0 5.3-8.5 9.7-8.5 9.7S3.5 14.1 3.5 8.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8.5 1.8Z"/>',
    soreness: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    pain: '<path d="m13.5 2.8-7 10h5l-1 8.4 7-11h-5l1-7.4Z"/>',
    mood: '<circle cx="12" cy="12" r="8.5"/><path d="M8.7 10h.1M15.2 10h.1M8.5 15c1-.8 2.2-1.2 3.5-1.2s2.5.4 3.5 1.2"/>',
    check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
    download: '<path d="M12 4v10M8 10l4 4 4-4M5 19.5h14"/>',
    upload: '<path d="M12 14V4M8 8l4-4 4 4M5 19.5h14"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    drop: '<path d="M12 3.5S7 9 7 13a5 5 0 0 0 10 0c0-4-5-9.5-5-9.5Z"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.today}</svg>`;
}

function openDatabase(name = DB_NAME, storeName = STORE_NAME) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Lotus needs IndexedDB to save local data."));
      return;
    }
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local storage."));
  });
}

async function readStoredVault(name = DB_NAME, storeName = STORE_NAME) {
  const database = await openDatabase(name, storeName);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(VAULT_KEY);
    request.onsuccess = () => { database.close(); resolve(request.result || null); };
    request.onerror = () => { database.close(); reject(request.error || new Error("Unable to read local data.")); };
  });
}

async function writeStoredVault(state) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id: VAULT_KEY, data: state });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("Unable to save local data.")); };
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptEnvelope(envelope, password) {
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBytes(envelope.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function defaultState(name) {
  return {
    schemaVersion: 2,
    profile: {
      name,
      averageCycleLength: 28,
      periodLength: 5,
      createdAt: new Date().toISOString()
    },
    periodStarts: [],
    dailyLogs: {},
    backup: { lastBackupAt: null },
    notifications: {
      pushEnabled: false,
      deviceId: null,
      deviceSecret: null,
      endpoint: null,
      pendingDelete: false
    }
  };
}

function derivePeriodStarts(existingStarts = [], dailyLogs = {}) {
  const loggedFlowDates = Object.entries(dailyLogs)
    .filter(([date, log]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && log?.flow && log.flow !== "none")
    .map(([date]) => date);
  const preservedStarts = existingStarts
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && (!dailyLogs[date] || dailyLogs[date].flow !== "none"));
  const candidates = [...new Set([...loggedFlowDates, ...preservedStarts])].sort();
  const starts = [];
  candidates.forEach((date) => {
    const previousStart = starts.at(-1);
    if (!previousStart || daysBetween(previousStart, date) > 10) starts.push(date);
  });
  return starts;
}

function recalculatePeriodStarts() {
  appState.periodStarts = derivePeriodStarts(appState.periodStarts, appState.dailyLogs);
}

function normaliseState(state) {
  const profile = state.profile || {};
  const dailyLogs = state.dailyLogs || {};
  Object.values(dailyLogs).forEach((log) => {
    log.exercise = log.exercise || { type: "none", minutes: 0 };
    log.symptoms = Array.isArray(log.symptoms) ? log.symptoms : [];
    log.breastSoreness = validChoice(SORENESS_OPTIONS, log.breastSoreness);

    const pain = log.periodPain;
    if (pain && typeof pain === "object") {
      const intensity = numberOrNull(pain.intensity);
      log.periodPain = {
        intensity: intensity === null ? 0 : clamp(intensity, 0, 10),
        impact: validChoice(PAIN_IMPACT_OPTIONS, pain.impact, "none")
      };
    } else {
      log.periodPain = null;
    }

    const bleeding = log.bleedingImpact;
    log.bleedingImpact = bleeding && typeof bleeding === "object"
      ? {
          flooding: Boolean(bleeding.flooding),
          productChangeInterval: validChoice(PRODUCT_CHANGE_OPTIONS, bleeding.productChangeInterval, "not-tracked"),
          clotSize: validChoice(CLOT_SIZE_OPTIONS, bleeding.clotSize, "none"),
          activityImpact: Boolean(bleeding.activityImpact)
        }
      : null;

    const mood = log.moodPms;
    log.moodPms = mood && typeof mood === "object"
      ? {
          lowMood: validChoice(MOOD_OPTIONS, mood.lowMood, "none"),
          anxiety: validChoice(MOOD_OPTIONS, mood.anxiety, "none"),
          irritability: validChoice(MOOD_OPTIONS, mood.irritability, "none"),
          impact: validChoice(MOOD_OPTIONS, mood.impact, "none")
        }
      : null;
    const fertility = log.fertility || {};
    log.fertility = {
      lh: validChoice(LH_OPTIONS, fertility.lh, "not-tested"),
      lhTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(fertility.lhTime || "") ? fertility.lhTime : "",
      mucus: validChoice(MUCUS_OPTIONS, fertility.mucus, "not-observed"),
      ovulationDate: /^\d{4}-\d{2}-\d{2}$/.test(fertility.ovulationDate || "") ? fertility.ovulationDate : "",
      ovulationSource: validChoice(OVULATION_SOURCE_OPTIONS, fertility.ovulationSource, "personal")
    };
  });
  return {
    schemaVersion: 2,
    profile: {
      name: profile.name || "There",
      averageCycleLength: clamp(Number(profile.averageCycleLength) || 28, 21, 45),
      periodLength: clamp(Number(profile.periodLength) || 5, 2, 10),
      createdAt: profile.createdAt || new Date().toISOString()
    },
    periodStarts: derivePeriodStarts(state.periodStarts || [], dailyLogs),
    dailyLogs,
    backup: { lastBackupAt: state.backup?.lastBackupAt || null },
    notifications: {
      pushEnabled: Boolean(state.notifications?.pushEnabled && state.notifications?.deviceSecret),
      deviceId: state.notifications?.deviceId || null,
      deviceSecret: state.notifications?.deviceSecret || null,
      endpoint: state.notifications?.endpoint || null,
      pendingDelete: Boolean(state.notifications?.pendingDelete)
    }
  };
}

async function saveVault() {
  if (!appState) return;
  await writeStoredVault(appState);
}

function getLog(dateString) {
  return appState?.dailyLogs?.[dateString] || null;
}

function isPeriodDate(dateString) {
  return getLog(dateString)?.flow && getLog(dateString).flow !== "none";
}

function getLatestPeriodStart(dateString = localDateString(new Date())) {
  const starts = (appState?.periodStarts || []).filter((date) => date <= dateString);
  return starts.at(-1) || null;
}

function getCompletedCycles() {
  const starts = [...(appState?.periodStarts || [])].sort();
  return starts.slice(0, -1).map((start, index) => ({
    start,
    end: starts[index + 1],
    length: daysBetween(start, starts[index + 1])
  })).filter((cycle) => cycle.length >= 20 && cycle.length <= 45);
}

function getPredictionModel() {
  if (!appState?.periodStarts?.length) return null;
  const completedCycles = getCompletedCycles();
  const recentLengths = completedCycles.slice(-8).map((cycle) => cycle.length);
  const cycleLength = recentLengths.length
    ? Math.round(recentLengths.reduce((sum, length) => sum + length, 0) / recentLengths.length)
    : clamp(Number(appState.profile.averageCycleLength) || 28, 21, 45);
  const historyCount = recentLengths.length || 1;
  const model = OPTIMIZED_FOLLICULAR_MODELS[Math.min(historyCount, OPTIMIZED_FOLLICULAR_MODELS.length) - 1];
  const follicularPhaseDays = clamp(
    Math.round(model.slope * cycleLength + model.intercept),
    7,
    Math.max(8, cycleLength - 7)
  );
  const variation = recentLengths.length > 1
    ? Math.round(Math.sqrt(recentLengths.reduce((sum, length) => sum + (length - cycleLength) ** 2, 0) / recentLengths.length))
    : 0;
  return { cycleLength, historyCount: recentLengths.length, follicularPhaseDays, variation };
}

function estimateOvulationOffset(cycleLength, historyCount = 1) {
  const model = OPTIMIZED_FOLLICULAR_MODELS[Math.min(Math.max(historyCount, 1), OPTIMIZED_FOLLICULAR_MODELS.length) - 1];
  return clamp(
    Math.round(model.slope * cycleLength + model.intercept),
    7,
    Math.max(8, cycleLength - 7)
  );
}

function getLutealHistory() {
  const starts = [...appState.periodStarts].sort();
  const lengths = [];
  for (let index = 0; index < starts.length - 1; index += 1) {
    const dates = Object.values(appState.dailyLogs)
      .map((log) => log.fertility)
      .filter((item) => item?.ovulationSource === "clinician"
        && item.ovulationDate >= starts[index] && item.ovulationDate < starts[index + 1])
      .map((item) => item.ovulationDate).sort();
    if (!dates.length) continue;
    const length = daysBetween(dates.at(-1), starts[index + 1]);
    if (length >= 8 && length <= 20) lengths.push(length);
  }
  if (lengths.length < 2) return null;
  const recent = lengths.slice(-8).sort((a, b) => a - b);
  return { days: Math.round((recent[Math.floor((recent.length - 1) / 2)] + recent[Math.floor(recent.length / 2)]) / 2), count: lengths.length };
}

function getCycleEvidence(start) {
  const dates = Object.keys(appState.dailyLogs).filter((date) => date >= start
    && date <= localDateString(new Date())
    && !appState.periodStarts.some((next) => next > start && next <= date)).sort();
  const positives = dates.filter((date) => appState.dailyLogs[date].fertility?.lh === "positive");
  const separated = positives.some((date) => daysBetween(positives[0], date) > 4);
  const clinician = dates.map((date) => appState.dailyLogs[date].fertility)
    .filter((item) => item?.ovulationSource === "clinician" && item.ovulationDate >= start)
    .map((item) => item.ovulationDate).sort().at(-1) || null;
  const personal = dates.map((date) => appState.dailyLogs[date].fertility)
    .filter((item) => item?.ovulationSource === "personal" && item.ovulationDate >= start)
    .map((item) => item.ovulationDate).sort().at(-1) || null;
  const mucusDates = dates.filter((date) => ["watery", "clear-stretchy"].includes(appState.dailyLogs[date].fertility?.mucus));
  return { firstPositive: positives[0] || null, separated, clinician, personal, mucusDates };
}

function getPredictionDetails(dateString = localDateString(new Date())) {
  const latest = getLatestPeriodStart(dateString);
  const model = getPredictionModel();
  if (!latest || !model) return null;
  const baseline = addDays(latest, model.cycleLength);
  const baselineOvulation = addDays(latest, estimateOvulationOffset(model.cycleLength, model.historyCount || 1));
  const evidence = getCycleEvidence(latest);
  const luteal = getLutealHistory();
  const result = {
    baseline, center: baseline, rangeStart: null, rangeEnd: null,
    ovulationStart: baselineOvulation, ovulationEnd: baselineOvulation,
    source: "calendar", evidence, luteal
  };
  if (evidence.clinician) {
    result.source = "recorded";
    result.ovulationStart = evidence.clinician;
    result.ovulationEnd = evidence.clinician;
  } else if (evidence.firstPositive && !evidence.separated) {
    result.source = "lh";
    result.ovulationStart = addDays(evidence.firstPositive, 1);
    result.ovulationEnd = addDays(evidence.firstPositive, 2);
  } else if (evidence.personal) {
    result.source = "personal";
    result.ovulationStart = evidence.personal;
    result.ovulationEnd = evidence.personal;
  }
  if (result.source !== "calendar") {
    const lutealDays = luteal?.days || 14;
    result.center = addDays(result.ovulationStart, lutealDays + (result.source === "lh" ? 1 : 0));
    result.rangeStart = addDays(result.ovulationStart, 11);
    result.rangeEnd = addDays(result.ovulationEnd, 17);
  }
  return result;
}

function getNextPeriodStart(dateString = localDateString(new Date())) {
  return getPredictionDetails(dateString)?.center || null;
}

function currentCycleDay(dateString = localDateString(new Date())) {
  const latest = getLatestPeriodStart(dateString);
  return latest ? daysBetween(latest, dateString) + 1 : null;
}

function isPredictedPeriodDate(dateString) {
  const details = getPredictionDetails();
  const model = getPredictionModel();
  if (!details || !model || isPeriodDate(dateString)) return false;
  for (let index = 0; index < 6; index += 1) {
    const start = addDays(details.center, index * model.cycleLength);
    if (dateString >= start && dateString < addDays(start, appState.profile.periodLength)) return true;
  }
  return false;
}

function createCycleWindow(start, cycleLength, historyCount, projectedPeriod = false) {
  // Wilcox et al. (BMJ 2000) describe six fertile days: the five before
  // ovulation and the estimated ovulation day itself.
  const ovulationOffset = estimateOvulationOffset(cycleLength, historyCount);
  const ovulation = addDays(start, ovulationOffset);
  return {
    start,
    end: addDays(start, cycleLength),
    ovulation,
    fertileStart: addDays(ovulation, -FERTILE_WINDOW_DAYS),
    fertileEnd: ovulation,
    projectedPeriod
  };
}

function getCycleWindows() {
  const starts = [...(appState?.periodStarts || [])].sort();
  const model = getPredictionModel();
  if (!starts.length || !model) return [];
  const windows = [];

  for (let index = 0; index < starts.length - 1; index += 1) {
    const cycleLength = daysBetween(starts[index], starts[index + 1]);
    if (cycleLength >= 20 && cycleLength <= 45) {
      windows.push(createCycleWindow(starts[index], cycleLength, model.historyCount || 1));
    }
  }

  let cycleStart = starts.at(-1);
  for (let index = 0; index < 6; index += 1) {
    windows.push(createCycleWindow(cycleStart, model.cycleLength, model.historyCount || 1, index > 0));
    if (index === 0) {
      cycleStart = getPredictionDetails()?.center || addDays(cycleStart, model.cycleLength);
      continue;
    }
    cycleStart = addDays(cycleStart, model.cycleLength);
  }
  return windows;
}

function isPossibleFertileDate(dateString) {
  if (isPeriodDate(dateString)) return false;
  const details = getPredictionDetails();
  if (details && dateString >= getLatestPeriodStart() && details.evidence.mucusDates.includes(dateString)) return true;
  if (details?.source === "lh" && dateString >= addDays(details.ovulationStart, -5)
    && dateString <= details.ovulationEnd) return true;
  if (["recorded", "personal"].includes(details?.source) && dateString >= addDays(details.ovulationStart, -5)
    && dateString <= details.ovulationEnd) return true;
  return getCycleWindows().some((window) => dateString >= window.fertileStart && dateString <= window.fertileEnd);
}

function getNextFertileWindow(dateString = localDateString(new Date())) {
  const details = getPredictionDetails();
  if (details) {
    const baseline = getCycleWindows().find((window) => window.start === getLatestPeriodStart());
    const potential = details.source === "calendar" ? null : {
      fertileStart: addDays(details.ovulationStart, -5), fertileEnd: details.ovulationEnd
    };
    const observed = details.evidence.mucusDates;
    const starts = [baseline?.fertileStart, potential?.fertileStart, ...observed].filter(Boolean).sort();
    const ends = [baseline?.fertileEnd, potential?.fertileEnd, ...observed].filter(Boolean).sort();
    if (ends.at(-1) >= dateString) return { fertileStart: starts[0], fertileEnd: ends.at(-1) };
  }
  return getCycleWindows().find((window) => window.fertileEnd >= dateString) || null;
}

function formatDateRange(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const startLabel = formatDate(start, { month: "short", day: "numeric" });
  const endLabel = formatDate(end, { month: "short", day: "numeric" });
  return startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()
    ? `${startLabel}–${endDate.getDate()}`
    : `${startLabel}–${endLabel}`;
}

function isBackupDue() {
  const last = appState?.backup?.lastBackupAt;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > 30 * 86400000;
}

function notificationsAvailable() {
  return typeof window !== "undefined" && "Notification" in window;
}

function pushNotificationsAvailable() {
  return notificationsAvailable()
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

function clearReminderBadge() {
  if ("clearAppBadge" in navigator) navigator.clearAppBadge().catch(() => {});
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "lotus-clear-reminder-badge" });
    }).catch(() => {});
  }
}

function readyServiceWorker(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Lotus could not prepare notifications on this device.")), timeoutMs);
    navigator.serviceWorker.ready.then((registration) => {
      clearTimeout(timeout);
      resolve(registration);
    }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value.replaceAll("-", "+").replaceAll("_", "/")}${padding}`;
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function pushSubscriptionDetails(subscription) {
  const details = subscription.toJSON();
  if (!details?.endpoint || !details.keys?.p256dh || !details.keys?.auth) {
    throw new Error("This browser did not return a complete push subscription.");
  }
  return {
    endpoint: details.endpoint,
    p256dh: details.keys.p256dh,
    auth: details.keys.auth
  };
}

function applicationServerKeysMatch(subscription, expectedKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey) return true;
  const currentBytes = new Uint8Array(currentKey);
  return currentBytes.length === expectedKey.length
    && currentBytes.every((byte, index) => byte === expectedKey[index]);
}

function pushConfigured() {
  return Boolean(LOTUS_DEPLOYMENT.supabaseUrl && LOTUS_DEPLOYMENT.vapidPublicKey);
}

function randomDeviceSecret() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function pushApi(action, details = {}) {
  if (!pushConfigured()) throw new Error("The reminder service is not configured.");
  const response = await fetch(`${LOTUS_DEPLOYMENT.supabaseUrl}/functions/v1/lotus-push-register-v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      deviceId: appState.notifications.deviceId,
      deviceSecret: appState.notifications.deviceSecret,
      ...details
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The reminder service could not be reached.");
  return result;
}

async function flushPushRemoval() {
  if (!appState?.notifications?.pendingDelete || !navigator.onLine) return;
  try {
    await pushApi("unregister");
    appState.notifications.pendingDelete = false;
    appState.notifications.deviceId = null;
    appState.notifications.deviceSecret = null;
    appState.notifications.endpoint = null;
    await saveVault();
  } catch { /* The old subscription is also removed by the sender after push failure. */ }
}

async function enablePushNotifications() {
  if (!pushNotificationsAvailable()) {
    showToast("Push notifications are not available in this browser.");
    return;
  }
  if (!pushConfigured()) return showToast("The reminder service is not configured.");
  if (appState.notifications.pendingDelete) {
    await flushPushRemoval();
    if (appState.notifications.pendingDelete) return showToast("Reconnect to finish turning off the old subscription first.");
  }
  const publicKey = LOTUS_DEPLOYMENT.vapidPublicKey;
  if (!publicKey) {
    showToast("The reminder service is not configured for this deployment.");
    return;
  }

  try {
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    if (applicationServerKey.length !== 65) throw new Error("Enter a valid VAPID public key.");
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      showToast("Allow notifications in your browser to enable push reminders.");
      return;
    }

    const registration = await readyServiceWorker();
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !applicationServerKeysMatch(subscription, applicationServerKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }
    const details = pushSubscriptionDetails(subscription);
    if (!appState.notifications.deviceId || !appState.notifications.deviceSecret || appState.notifications.pendingDelete) {
      appState.notifications.deviceId = createUuid();
      appState.notifications.deviceSecret = randomDeviceSecret();
      appState.notifications.pendingDelete = false;
      await saveVault();
    }
    await pushApi("register", { subscription: details, timezone: browserTimeZone() });
    appState.notifications.pushEnabled = true;
    appState.notifications.endpoint = details.endpoint;
    await saveVault();
    renderApp();
    showToast("Reminders enabled from 10:00 to 22:00 every two hours.");
  } catch (error) {
    showToast(error.message || "Reminders could not be enabled.");
  }
}

async function disablePushNotifications({ silent = false } = {}) {
  let removalFailed = false;
  try {
    if (pushNotificationsAvailable()) {
      const registration = await readyServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
    }
  } catch (error) {
    removalFailed = true;
  }
  if (appState.notifications.deviceId && appState.notifications.deviceSecret) {
    try { await pushApi("unregister"); } catch { removalFailed = true; }
  }
  appState.notifications.pushEnabled = false;
  appState.notifications.pendingDelete = removalFailed;
  if (!removalFailed) {
    appState.notifications.deviceId = null;
    appState.notifications.deviceSecret = null;
    appState.notifications.endpoint = null;
  }
  await saveVault();
  clearReminderBadge();
  if (!silent) {
    renderApp();
    showToast(removalFailed ? "Reminders turned off here. Server cleanup will retry online." : "Reminders turned off.");
  }
}

async function testDeviceNotification() {
  if (!pushNotificationsAvailable() || Notification.permission !== "granted") {
    showToast("Enable reminders before testing this device.");
    return;
  }
  try {
    const registration = await readyServiceWorker();
    await registration.showNotification("Lotus", {
      body: "Notifications are ready on this device.",
      icon: "./assets/lotus-192.png",
      badge: "./assets/lotus-192.png",
      tag: "lotus-device-test",
      data: { url: "./#today" }
    });
    showToast("Test notification sent to this device.");
  } catch {
    showToast("This device could not display the test notification.");
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function renderChoiceGroup(group, options, selected, details = false) {
  return options.map(([value, label]) => `
    <button type="button" class="segment-button ${String(selected) === String(value) ? "selected" : ""}" data-select="${group}" data-value="${value}" aria-pressed="${String(selected) === String(value)}">
      ${escapeHtml(label)}${details ? `<span class="segment-detail">${value === 1 ? "Lowest" : value === 5 ? "Highest" : ""}</span>` : ""}
    </button>`).join("");
}

function renderSeverityRow(label, group, selected) {
  return `<div class="severity-row"><span class="subfield-label">${escapeHtml(label)}</span><div class="segmented-control four" role="group" aria-label="${escapeHtml(label)} severity">${renderChoiceGroup(group, MOOD_OPTIONS, selected)}</div></div>`;
}

function formatBleedingImpact(bleeding) {
  if (!bleeding) return "Not logged";
  if (bleeding.activityImpact) return "Affected activities";
  if (bleeding.flooding) return "Flooding or leakage";
  if (bleeding.productChangeInterval && bleeding.productChangeInterval !== "not-tracked") {
    const changeLabels = {
      "4-plus": "Changes 4+ hours apart",
      "2-to-4": "Changes 2–4 hours apart",
      "1-to-2": "Changes 1–2 hours apart",
      "under-1": "Changes under 1 hour apart"
    };
    return changeLabels[bleeding.productChangeInterval] || "Change timing saved";
  }
  if (bleeding.clotSize === "large") return "Larger clots";
  if (bleeding.clotSize === "small") return "Smaller clots";
  return "No impact";
}

function formatMoodPms(mood) {
  if (!mood) return "Not logged";
  const rank = { none: 0, mild: 1, moderate: 2, severe: 3 };
  const highest = [mood.lowMood, mood.anxiety, mood.irritability, mood.impact]
    .filter((value) => Object.prototype.hasOwnProperty.call(rank, value))
    .sort((first, second) => rank[second] - rank[first])[0] || "none";
  return choiceLabel(MOOD_OPTIONS, highest, "None");
}

function renderOnboarding(error = "") {
  appRoot.innerHTML = `
    <div class="onboarding">
      <section class="welcome-card" aria-labelledby="welcome-title">
        <img class="welcome-icon" src="./assets/lotus.svg" alt="" />
        <h1 id="welcome-title">LOTUS</h1>
        <p>A quiet place to notice your cycle and how you feel, day by day.</p>
        <form id="onboarding-form" class="form-stack">
          <div class="form-field">
            <label class="field-label" for="name">What should Lotus call you?</label>
            <input class="text-input" id="name" name="name" autocomplete="name" placeholder="Your name" required maxlength="60" />
          </div>
          <p class="helper-text">Your check-ins stay on this device. Lotus opens without a password.</p>
          ${error ? `<p class="error-message" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="button-primary" type="submit">Begin gently ${icon("arrowRight", 18)}</button>
        </form>
        <p class="welcome-version">v${APP_VERSION}</p>
      </section>
    </div>`;
}

function renderMigration(error = "") {
  appRoot.innerHTML = `
    <div class="lock-screen">
      <section class="welcome-card" aria-labelledby="migration-title">
        <img class="welcome-icon" src="./assets/lotus.svg" alt="" />
        <h1 id="migration-title">LOTUS</h1>
        <p>Bring your existing Lotus entries into this version. Enter the old master password once to unlock the previous data.</p>
        <form id="migration-form" class="form-stack">
          <div class="form-field">
            <label class="field-label" for="password">Old master password</label>
            <input class="text-input" id="password" name="password" type="password" autocomplete="current-password" required autofocus />
          </div>
          ${error ? `<p class="error-message" role="alert">${escapeHtml(error)}</p>` : ""}
          <button class="button-primary" type="submit">Import my entries ${icon("arrowRight", 18)}</button>
        </form>
        <button class="button-quiet" type="button" data-action="start-fresh" style="margin-top:18px;">Start fresh instead</button>
        <p class="helper-text">Starting fresh leaves your old encrypted data untouched in this browser.</p>
        <p class="welcome-version">v${APP_VERSION}</p>
      </section>
    </div>`;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <a class="brand-lockup" href="#today" data-nav="today" aria-label="Lotus today">
        <img class="brand-icon" src="./assets/lotus.svg" alt="" />
        <span class="brand-name">LOTUS</span>
      </a>
    </header>`;
}

function renderNav() {
  const items = [["today", "Today", "today"], ["calendar", "Calendar", "calendar"], ["insights", "Insights", "insights"], ["settings", "Settings", "settings"]];
  return `<nav class="bottom-nav" aria-label="Main navigation">${items.map(([view, label, iconName]) => `
    <button class="nav-button ${activeView === view ? "active" : ""}" type="button" data-nav="${view}" aria-current="${activeView === view ? "page" : "false"}">
      ${icon(iconName, 20)}<span>${label}</span>
    </button>`).join("")}</nav>`;
}

function renderApp() {
  appRoot.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      <main class="main-content">
        ${activeView === "today" ? renderToday() : ""}
        ${activeView === "calendar" ? renderCalendar() : ""}
        ${activeView === "checkin" ? renderCheckin() : ""}
        ${activeView === "insights" ? renderInsights() : ""}
        ${activeView === "settings" ? renderSettings() : ""}
      </main>
      ${renderNav()}
    </div>`;
}

function renderToday() {
  const today = localDateString(new Date());
  const log = getLog(today);
  const start = getLatestPeriodStart(today);
  const cycleDay = currentCycleDay(today);
  const prediction = getPredictionDetails(today);
  const predicted = prediction?.center;
  const periodActive = log?.flow && log.flow !== "none";
  const cycleLabel = !start ? "Your cycle" : periodActive ? `Period day ${cycleDay}` : `Cycle day ${cycleDay}`;
  const heroValue = !start ? "—" : cycleDay;
  const heroCaption = !start
    ? "When your next period begins, start here and Lotus will begin learning your rhythm."
    : predicted
      ? `Next period estimate · ${prediction.rangeStart ? formatDateRange(prediction.rangeStart, prediction.rangeEnd) : formatDate(predicted, { month: "short", day: "numeric" })} · ${prediction.source === "lh" ? "LH-informed" : prediction.source === "recorded" ? "Recorded ovulation" : prediction.source === "personal" ? "Your ovulation estimate" : "Calendar-based"}`
      : "Your cycle estimate will appear here.";
  const checkinStatus = log ? "Saved" : "Not logged";
  const exercise = log?.exercise?.type && log.exercise.type !== "none" ? `${log.exercise.minutes || 0} min` : "Not logged";
  const stress = log?.stress ? `${log.stress}/5` : "Not logged";
  const sexDrive = log?.sexDrive ? `${log.sexDrive}/5` : "Not logged";
  const water = `${log?.water || 0}/${WATER_GOAL}`;
  const breastSoreness = log?.breastSoreness ? choiceLabel(SORENESS_OPTIONS, log.breastSoreness) : "Not logged";
  const periodPain = log?.periodPain
    ? `${log.periodPain.intensity}/10${log.periodPain.impact === "unable" ? " · Unable" : log.periodPain.impact === "reduced" ? " · Reduced" : ""}`
    : "Not logged";
  const bleedingImpact = formatBleedingImpact(log?.bleedingImpact);
  const moodPms = formatMoodPms(log?.moodPms);
  const fertility = log?.fertility;
  const fertilitySummary = fertility?.lh === "positive" ? "Positive LH test"
    : fertility?.ovulationDate ? (fertility.ovulationSource === "clinician" ? "Recorded ovulation" : "Personal ovulation estimate")
      : ["watery", "clear-stretchy"].includes(fertility?.mucus) ? "Fertile-type mucus" : null;

  return `
    <div class="page-heading">
      <div>
        <h1>${escapeHtml(greeting())}, ${escapeHtml(appState.profile.name)}</h1>
        <p class="date-line">${formatDate(today)}</p>
      </div>
    </div>

    <section class="hero-card" aria-labelledby="cycle-title">
      <span class="eyebrow">${escapeHtml(cycleLabel)}</span>
      <div class="hero-content">
        <div>
          <h2 id="cycle-title" class="hero-value">${heroValue}</h2>
          <p class="hero-caption">${escapeHtml(heroCaption)}</p>
        </div>
        <img class="hero-lotus" src="./assets/lotus.svg" alt="" />
      </div>
    </section>

    <div class="section-heading">
      <h2>Today’s check-in</h2>
      <button class="button-quiet" type="button" data-action="open-checkin">${log ? "Edit" : "Begin"}</button>
    </div>
    <section class="card summary-card" aria-label="Today’s wellbeing summary">
      <div class="summary-card-top">
        <div>
          <span class="mini-label">${formatDate(today, { month: "long", day: "numeric" })}</span>
          <h3>A moment to notice how you are</h3>
        </div>
        <span class="status-chip ${log ? "strong" : ""}">${checkinStatus}</span>
      </div>
      <div class="metric-grid">
        ${renderMetricTile("water", "Water", `${water} glasses`, "water")}
        ${renderMetricTile("stress", "Stress", stress, "stress")}
        ${renderMetricTile("sex-drive", "Sex drive", sexDrive, "heart")}
        ${renderMetricTile("exercise", "Exercise", exercise, "exercise")}
        ${renderMetricTile("soreness", "Soreness", breastSoreness, "soreness")}
        ${renderMetricTile("period-pain", "Period pain", periodPain, "pain")}
        ${renderMetricTile("bleeding-impact", "Bleeding impact", bleedingImpact, "drop")}
        ${renderMetricTile("mood-pms", "Mood & PMS", moodPms, "mood")}
        ${fertilitySummary ? renderMetricTile("fertility", "Fertility observations", fertilitySummary, "drop") : ""}
      </div>
    </section>

    <div class="section-heading">
      <h2>Small next steps</h2>
    </div>
    <section class="quick-actions" aria-label="Quick actions">
      ${!start ? `<button class="action-row" type="button" data-action="start-period"><span class="action-row-copy">${icon("plus", 22)}<span><span class="action-row-title">Start a period</span><span class="action-row-subtitle">Mark today as day one</span></span></span>${icon("chevronRight", 18)}</button>` : ""}
      <button class="action-row" type="button" data-action="open-calendar"><span class="action-row-copy">${icon("calendar", 22)}<span><span class="action-row-title">See your calendar</span><span class="action-row-subtitle">Review patterns and estimates</span></span></span>${icon("chevronRight", 18)}</button>
    </section>
    ${isBackupDue() ? `<section class="card card-pad backup-card" style="margin-top:18px;"><div class="backup-row"><div><h3>Monthly backup reminder</h3><p class="helper-text">Save a JSON copy of your Lotus data somewhere private when you have a quiet moment.</p></div>${icon("download", 24)}</div><div class="form-actions"><button class="button-primary" type="button" data-action="export-backup">Export backup</button></div></section>` : ""}`;
}

function renderMetricTile(id, label, value, iconName) {
  return `<button class="metric-tile" id="metric-${id}" type="button" data-action="open-checkin" aria-label="Open today's ${escapeHtml(label)} entry"><span class="metric-tile-icon">${icon(iconName, 20)}</span><span class="metric-tile-label">${label}</span><strong class="metric-tile-value">${escapeHtml(value)}</strong></button>`;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const today = localDateString(new Date());
  const model = getPredictionModel();
  const nextFertile = getNextFertileWindow(today);
  const prediction = getPredictionDetails(today);
  const firstDay = new Date(year, month, 1, 12).getDay();
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const previousMonthDays = new Date(year, month, 0, 12).getDate();
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - firstDay + 1;
    let date;
    let outside = false;
    if (dayNumber < 1) {
      date = localDateString(new Date(year, month - 1, previousMonthDays + dayNumber, 12));
      outside = true;
    } else if (dayNumber > daysInMonth) {
      date = localDateString(new Date(year, month + 1, dayNumber - daysInMonth, 12));
      outside = true;
    } else {
      date = localDateString(new Date(year, month, dayNumber, 12));
    }
    const period = isPeriodDate(date);
    const predicted = !period && isPredictedPeriodDate(date);
    const fertile = !period && !predicted && isPossibleFertileDate(date);
    const observed = appState.dailyLogs[date]?.fertility || {};
    const lh = observed.lh === "positive";
    const mucus = ["watery", "clear-stretchy"].includes(observed.mucus);
    const recorded = Object.values(appState.dailyLogs).some((log) => log.fertility?.ovulationDate === date && log.fertility?.ovulationSource === "clinician");
    const personal = !recorded && Object.values(appState.dailyLogs).some((log) => log.fertility?.ovulationDate === date && log.fertility?.ovulationSource === "personal");
    const marker = period || predicted
      ? '<span class="day-dot"></span>'
      : fertile
        ? '<span class="day-dot fertile-dot"></span>'
        : "";
    const label = `${period ? ", period logged" : predicted ? ", estimated period" : fertile ? ", possible fertile window" : ""}${lh ? ", positive LH test" : ""}${mucus ? ", fertile-type mucus recorded" : ""}${recorded ? ", clinician-confirmed ovulation date recorded" : ""}${personal ? ", personal ovulation estimate" : ""}`;
    cells.push(`<button class="day-cell ${outside ? "outside" : ""} ${date === today ? "today" : ""} ${period ? "period" : ""} ${predicted ? "predicted" : ""} ${fertile ? "fertile" : ""} ${lh ? "lh-day" : ""} ${mucus ? "mucus-day" : ""} ${recorded ? "recorded-day" : ""} ${personal ? "personal-day" : ""}" type="button" data-date="${date}" aria-label="${formatDate(date)}${label}">${parseDate(date).getDate()}${marker}</button>`);
  }

  const latest = getLatestPeriodStart(today);
  const next = getNextPeriodStart(today);
  return `
    <div class="page-heading">
      <div>
        <h1>Calendar</h1>
        <p class="date-line">Tap any day to add or review a check-in.</p>
      </div>
    </div>
    <section class="card calendar-card" aria-labelledby="calendar-title">
      <div class="calendar-heading">
        <button class="plain-icon-button" type="button" data-calendar="previous" aria-label="Previous month">${icon("arrowLeft", 20)}</button>
        <h2 id="calendar-title">${formatMonth(calendarCursor)}</h2>
        <button class="plain-icon-button" type="button" data-calendar="next" aria-label="Next month">${icon("arrowRight", 20)}</button>
      </div>
      <div class="calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
      <div class="calendar-grid">${cells.join("")}</div>
      <div class="legend">
        <span class="legend-item"><span class="legend-marker period-marker"></span>Logged period</span>
        <span class="legend-item"><span class="legend-marker predicted-marker"></span>Estimate</span>
        <span class="legend-item"><span class="legend-marker fertile-marker"></span>Possible fertile window</span>
        <span class="legend-item"><span class="legend-marker lh-marker"></span>LH test</span>
        <span class="legend-item"><span class="legend-marker mucus-marker"></span>Fertile sign</span>
        <span class="legend-item"><span class="legend-marker recorded-marker"></span>Recorded ovulation</span>
        <span class="legend-item"><span class="legend-marker personal-marker"></span>Your estimate</span>
      </div>
    </section>
    <div class="section-heading"><h2>Cycle overview</h2></div>
    <section class="card card-pad overview-grid">
      <div class="stat-block"><span class="mini-label">Latest start</span><strong class="stat-value">${latest ? formatDate(latest, { month: "short", day: "numeric" }) : "Not logged"}</strong><span class="stat-detail">Tap a day to begin tracking.</span></div>
      <div class="stat-block"><span class="mini-label">Next estimate</span><strong class="stat-value">${prediction?.rangeStart ? formatDateRange(prediction.rangeStart, prediction.rangeEnd) : next ? formatDate(next, { month: "short", day: "numeric" }) : "Not available"}</strong><span class="stat-detail">${prediction?.source === "lh" ? "Possible range after LH surge; ovulation is not confirmed." : prediction?.source === "recorded" ? "Based on your recorded ovulation date." : prediction?.source === "personal" ? "Based on your personal ovulation estimate." : model?.historyCount ? `Calendar estimate from ${model.historyCount} completed cycle${model.historyCount === 1 ? "" : "s"}.` : "Based on your cycle setting after a start is logged."}</span></div>
      <div class="stat-block"><span class="mini-label">Possible fertile window</span><strong class="stat-value">${nextFertile ? formatDateRange(nextFertile.fertileStart, nextFertile.fertileEnd) : "Not available"}</strong><span class="stat-detail">A calendar estimate, not contraception.</span></div>
    </section>`;
}

function renderCheckin() {
  const log = getLog(selectedDate) || {};
  const fertility = log.fertility || { lh: "not-tested", lhTime: "", mucus: "not-observed", ovulationDate: "", ovulationSource: "personal" };
  const exercise = log.exercise || { type: "none", minutes: 0 };
  const water = clamp(Number(log.water) || 0, 0, 20);
  const breastSoreness = validChoice(SORENESS_OPTIONS, log.breastSoreness, "none");
  const periodPain = log.periodPain || { intensity: 0, impact: "none" };
  const bleeding = log.bleedingImpact || {
    flooding: false,
    productChangeInterval: "not-tracked",
    clotSize: "none",
    activityImpact: false
  };
  const mood = log.moodPms || { lowMood: "none", anxiety: "none", irritability: "none", impact: "none" };
  return `
    <div class="page-heading">
      <div>
        <h1>Check-in</h1>
        <p class="date-line">A few gentle signals from ${formatDate(selectedDate, { month: "long", day: "numeric" })}.</p>
      </div>
    </div>
    <section class="card card-pad">
      <div class="checkin-date-row">
        <div><span class="mini-label">Selected day</span><p class="date-line">${formatDate(selectedDate)}</p></div>
        <button class="button-quiet" type="button" data-action="today-date">Today</button>
      </div>
      <form id="checkin-form" class="form-stack" data-flow="${log.flow || "none"}" data-breast-soreness="${breastSoreness}" data-pain-impact="${periodPain.impact || "none"}" data-clot-size="${bleeding.clotSize || "none"}" data-mood-low="${mood.lowMood || "none"}" data-mood-anxiety="${mood.anxiety || "none"}" data-mood-irritability="${mood.irritability || "none"}" data-mood-impact="${mood.impact || "none"}" data-stress="${log.stress || ""}" data-sex-drive="${log.sexDrive || ""}" data-exercise="${exercise.type || "none"}" data-water="${water}">
        <input type="hidden" name="date" value="${selectedDate}" />
        <div class="form-field">
          <span class="field-label">Period flow</span>
          <div class="segmented-control" role="group" aria-label="Period flow">${renderChoiceGroup("flow", FLOW_OPTIONS, log.flow || "none")}</div>
        </div>
        <div class="form-field measurement-field">
          <span class="field-label">Fertility observations <span class="helper-text">Optional</span></span>
          <span class="helper-text">An LH surge can precede ovulation; it does not confirm it. These estimates are not contraception.</span>
          <label class="subfield-label" for="lh-result">Urine LH test</label>
          <select class="select-input" id="lh-result" name="lh-result">${LH_OPTIONS.map(([value, label]) => `<option value="${value}" ${fertility.lh === value ? "selected" : ""}>${label}</option>`).join("")}</select>
          <label class="subfield-label" for="lh-time">Test time (optional)</label>
          <input class="text-input" id="lh-time" name="lh-time" type="time" value="${escapeHtml(fertility.lhTime || "")}" />
          <label class="subfield-label" for="mucus">Cervical mucus</label>
          <select class="select-input" id="mucus" name="mucus">${MUCUS_OPTIONS.map(([value, label]) => `<option value="${value}" ${fertility.mucus === value ? "selected" : ""}>${label}</option>`).join("")}</select>
          <label class="subfield-label" for="ovulation-date">Ovulation date (optional)</label>
          <input class="text-input" id="ovulation-date" name="ovulation-date" type="date" max="${localDateString(new Date())}" value="${escapeHtml(fertility.ovulationDate || "")}" />
          <label class="subfield-label" for="ovulation-source">Source of that date</label>
          <select class="select-input" id="ovulation-source" name="ovulation-source">${OVULATION_SOURCE_OPTIONS.map(([value, label]) => `<option value="${value}" ${fertility.ovulationSource === value ? "selected" : ""}>${label}</option>`).join("")}</select>
          <span class="helper-text">Choose “Clinician confirmed” only when a clinician has supplied the date. Personal estimates stay labeled as estimates.</span>
        </div>
        <div class="form-field measurement-field">
          <span class="field-label">Bleeding impact</span>
          <span class="helper-text">Add details that describe how bleeding affected your day.</span>
          <div class="symptom-grid">
            <div class="check-option"><input id="bleeding-flooding" type="checkbox" name="bleeding-flooding" ${bleeding.flooding ? "checked" : ""} /><label for="bleeding-flooding">Flooding or leakage</label></div>
            <div class="check-option"><input id="bleeding-activity-impact" type="checkbox" name="bleeding-activity-impact" ${bleeding.activityImpact ? "checked" : ""} /><label for="bleeding-activity-impact">Affected daily activities</label></div>
          </div>
          <label class="subfield-label" for="product-change-interval">Shortest time between product changes</label>
          <select class="select-input" id="product-change-interval" name="product-change-interval">${PRODUCT_CHANGE_OPTIONS.map(([value, label]) => `<option value="${value}" ${bleeding.productChangeInterval === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>
          <span class="subfield-label">Largest clot</span>
          <div class="segmented-control three" role="group" aria-label="Largest blood clot">${renderChoiceGroup("clot-size", CLOT_SIZE_OPTIONS, bleeding.clotSize || "none")}</div>
        </div>
        <div class="form-field">
          <span class="field-label">Symptoms</span>
          <div class="symptom-grid">${SYMPTOMS.map((symptom) => `<div class="check-option"><input id="symptom-${symptom.toLowerCase().replaceAll(" ", "-")}" type="checkbox" name="symptoms" value="${escapeHtml(symptom)}" ${log.symptoms?.includes(symptom) ? "checked" : ""} /><label for="symptom-${symptom.toLowerCase().replaceAll(" ", "-")}">${escapeHtml(symptom)}</label></div>`).join("")}</div>
        </div>
        <div class="form-field measurement-field">
          <span class="field-label">Breast soreness</span>
          <div class="segmented-control three" role="group" aria-label="Breast soreness">${renderChoiceGroup("breast-soreness", SORENESS_OPTIONS, breastSoreness)}</div>
        </div>
        <div class="form-field measurement-field">
          <span class="field-label">Period pain</span>
          <label class="subfield-label" for="period-pain-intensity">Worst intensity today</label>
          <div class="range-row">
            <input class="range-input" id="period-pain-intensity" name="period-pain-intensity" type="range" min="0" max="10" step="1" value="${clamp(Number(periodPain.intensity) || 0, 0, 10)}" aria-label="Period pain intensity from 0 to 10" />
            <output class="range-value" id="period-pain-value" for="period-pain-intensity">${clamp(Number(periodPain.intensity) || 0, 0, 10)} / 10</output>
          </div>
          <span class="helper-text">0 is no pain. 10 is the worst pain imaginable.</span>
          <span class="subfield-label">Effect on daily activities</span>
          <div class="segmented-control four impact-control" role="group" aria-label="Effect of period pain on daily activities">${renderChoiceGroup("pain-impact", PAIN_IMPACT_OPTIONS, periodPain.impact || "none")}</div>
        </div>
        <div class="form-field measurement-field">
          <span class="field-label">Mood &amp; PMS</span>
          <span class="helper-text">Rate how each felt today.</span>
          <div class="severity-list">
            ${renderSeverityRow("Low mood", "mood-low", mood.lowMood || "none")}
            ${renderSeverityRow("Anxiety", "mood-anxiety", mood.anxiety || "none")}
            ${renderSeverityRow("Irritability", "mood-irritability", mood.irritability || "none")}
            ${renderSeverityRow("Daily-life impact", "mood-impact", mood.impact || "none")}
          </div>
        </div>
        <div class="form-field">
          <span class="field-label">Stress</span>
          <div class="segmented-control" role="group" aria-label="Stress level">${renderChoiceGroup("stress", SCALE_OPTIONS, log.stress || "", true)}</div>
        </div>
        <div class="form-field">
          <span class="field-label">Sex drive</span>
          <div class="segmented-control" role="group" aria-label="Sex drive level">${renderChoiceGroup("sex-drive", SCALE_OPTIONS, log.sexDrive || "", true)}</div>
        </div>
        <div class="form-field">
          <span class="field-label">Exercise</span>
          <div class="exercise-grid" role="group" aria-label="Exercise type">${EXERCISE_OPTIONS.map(([value, label]) => `<button class="segment-button ${exercise.type === value ? "selected" : ""}" type="button" data-select="exercise" data-value="${value}" aria-pressed="${exercise.type === value}">${label}</button>`).join("")}</div>
          <label class="helper-text" for="exercise-minutes">Minutes: <strong id="exercise-minutes-value">${exercise.minutes || 0}</strong></label>
          <input class="range-input" id="exercise-minutes" name="exercise-minutes" type="range" min="0" max="120" step="5" value="${exercise.minutes || 0}" aria-label="Exercise minutes" />
        </div>
        <div class="form-field">
          <span class="field-label">Water</span>
          <div class="water-control">
            <div class="water-value">${icon("water", 22)}<strong class="water-number" id="water-number">${water}</strong><span class="water-unit">glasses</span></div>
            <div class="stepper"><button type="button" data-step="water" data-change="-1" aria-label="Remove one glass">−</button><button type="button" data-step="water" data-change="1" aria-label="Add one glass">+</button></div>
          </div>
          <span class="helper-text">A glass is counted as roughly 250 ml.</span>
        </div>
        <div class="form-actions"><button class="button-secondary" type="button" data-action="cancel-checkin">Cancel</button><button class="button-primary" type="submit">Save check-in ${icon("check", 18)}</button></div>
      </form>
    </section>`;
}

function renderInsights() {
  const starts = [...(appState.periodStarts || [])].sort();
  const lengths = starts.slice(1).map((start, index) => daysBetween(starts[index], start));
  const calculatedAverage = lengths.length ? Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) : null;
  const average = calculatedAverage || appState.profile.averageCycleLength;
  const latest = starts.at(-1);
  const next = getNextPeriodStart();
  const prediction = getPredictionDetails();
  const luteal = getLutealHistory();
  const observations = Object.values(appState.dailyLogs).map((log) => log.fertility || {});
  const lhDays = observations.filter((item) => item.lh === "positive").length;
  const confirmedDates = new Set(observations.filter((item) => item.ovulationDate && item.ovulationSource === "clinician").map((item) => item.ovulationDate)).size;
  const loggedDays = Object.values(appState.dailyLogs).filter((log) => log.flow && log.flow !== "none").length;
  const exerciseDays = Object.values(appState.dailyLogs).filter((log) => log.exercise?.type && log.exercise.type !== "none").length;
  return `
    <div class="page-heading">
      <div>
        <h1>Insights</h1>
        <p class="date-line">Your patterns, gathered softly over time.</p>
      </div>
    </div>
    <section class="card card-pad insights-grid" aria-label="Cycle insights">
      <div class="stat-block"><span class="mini-label">Average cycle</span><strong class="stat-value">${average} days</strong><span class="stat-detail">${calculatedAverage ? "Calculated from your logged starts." : "Your starting estimate."}</span></div>
      <div class="stat-block"><span class="mini-label">Typical period</span><strong class="stat-value">${appState.profile.periodLength} days</strong><span class="stat-detail">You can adjust this in Settings.</span></div>
      <div class="stat-block"><span class="mini-label">Period days logged</span><strong class="stat-value">${loggedDays}</strong><span class="stat-detail">Across all your check-ins.</span></div>
      <div class="stat-block"><span class="mini-label">Exercise days</span><strong class="stat-value">${exerciseDays}</strong><span class="stat-detail">Across all your check-ins.</span></div>
    </section>
    <div class="section-heading"><h2>Cycle notes</h2></div>
    <section class="card card-pad">
      <div class="settings-list">
        <div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Latest period start</span><span class="settings-row-detail">${latest ? formatDate(latest) : "Nothing logged yet"}</span></div></div>
        <div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Next period estimate</span><span class="settings-row-detail">${prediction?.rangeStart ? `${formatDateRange(prediction.rangeStart, prediction.rangeEnd)} · possible range` : next ? `${formatDate(next)} · calendar estimate` : "Available after your first period is logged"}</span></div></div>
        <div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Logged cycles</span><span class="settings-row-detail">${starts.length} start${starts.length === 1 ? "" : "s"} recorded</span></div></div>
        <div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">LH and recorded ovulation</span><span class="settings-row-detail">${lhDays} positive LH day${lhDays === 1 ? "" : "s"} · ${confirmedDates} clinician-confirmed date${confirmedDates === 1 ? "" : "s"}</span></div></div>
        ${luteal ? `<div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Personal luteal estimate</span><span class="settings-row-detail">About ${luteal.days} days from ${luteal.count} cycles with a clinician-confirmed date.</span></div></div>` : ""}
      </div>
    </section>
    <div class="section-heading"><h2>Monthly backup</h2></div>
    <section class="card card-pad backup-card">
      <div class="backup-row"><div><h3>${isBackupDue() ? "A backup would be kind" : "Your backup is up to date"}</h3><p class="helper-text">${appState.backup.lastBackupAt ? `Last backup: ${formatDate(localDateString(new Date(appState.backup.lastBackupAt)), { month: "short", day: "numeric", year: "numeric" })}.` : "Save a JSON copy of your Lotus data once a month."}</p></div>${icon(isBackupDue() ? "download" : "check", 26)}</div>
      <div class="form-actions"><button class="button-primary" type="button" data-action="export-backup">Export JSON backup</button></div>
    </section>`;
}

function renderReminderSettings() {
  const pushSupported = pushNotificationsAvailable();
  const pushStored = Boolean(appState.notifications?.pushEnabled);
  const pushPermission = pushSupported ? Notification.permission : "unsupported";
  const pushActive = pushStored && pushPermission === "granted";
  const pushStatus = pushActive
    ? "On"
    : pushPermission === "denied"
      ? "Blocked"
      : !pushSupported
        ? "Unavailable"
        : !pushConfigured()
            ? "Needs public key"
            : "Off";
  return `
    <div class="section-heading"><h2>Reminders</h2></div>
    <section class="card card-pad">
      <div class="backup-row"><div><h3>Check-in reminders</h3><p class="helper-text">${ENTRY_REMINDER_TEXT}</p></div><span class="status-chip ${pushActive ? "strong" : ""}">${pushStatus}</span></div>
      <div class="reminder-facts">
        <div><span class="mini-label">Time</span><span>10:00–22:00 · every 2 hours</span></div>
        <div><span class="mini-label">Timezone</span><span>${escapeHtml(browserTimeZone())}</span></div>
        <div><span class="mini-label">Delivery</span><span>Works while Lotus is closed</span></div>
      </div>
      <div class="form-actions reminder-actions">
        ${pushActive ? `<button class="button-secondary" type="button" data-action="test-notification">Test this device</button>` : ""}
        <button class="${pushActive ? "button-quiet" : "button-primary"}" type="button" data-action="${pushActive ? "disable-push" : "enable-push"}" ${(!pushSupported || (!pushConfigured() && !pushStored)) ? "disabled" : ""}>${pushActive ? "Turn off reminders" : "Enable reminders"}</button>
      </div>
      ${pushActive ? '<p class="helper-text settings-guidance">On supported devices, the app icon shows how many reminders arrived since you last opened Lotus.</p>' : ""}
      ${pushPermission === "denied" ? '<p class="helper-text settings-guidance">Notifications are blocked for Lotus. Allow them in your device settings, then return here.</p>' : !pushSupported ? '<p class="helper-text settings-guidance">On iPhone, install Lotus on the Home Screen before enabling notifications.</p>' : !pushConfigured() ? '<p class="helper-text settings-guidance">The reminder service is unavailable until its public configuration is added.</p>' : ""}
    </section>`;
}

function renderSettings() {
  const lastBackup = appState.backup.lastBackupAt;
  const learnedCycles = getCompletedCycles().length;
  return `
    <div class="page-heading">
      <div>
        <h1>Settings</h1>
        <p class="date-line">Keep Lotus personal to you.</p>
      </div>
    </div>
    <section class="card card-pad">
      <h2>Profile &amp; cycle</h2>
      <p class="helper-text" style="margin-top:8px;">These starting values shape estimates until Lotus learns from your recorded cycles.</p>
      <form id="settings-form" class="form-stack" style="margin-top:22px;">
        <div class="form-field"><label class="field-label" for="profile-name">Name</label><input class="text-input" id="profile-name" name="name" value="${escapeHtml(appState.profile.name)}" required maxlength="60" /></div>
        <div class="form-field"><label class="field-label" for="average-cycle">Starting cycle length</label><input class="number-input" id="average-cycle" name="averageCycleLength" type="number" min="21" max="45" value="${appState.profile.averageCycleLength}" required /><span class="helper-text">${learnedCycles ? `Lotus is now learning from ${learnedCycles} completed cycle${learnedCycles === 1 ? "" : "s"}; this remains your fallback.` : "Counted from the first day of one period to the first day of the next."}</span></div>
        <div class="form-field"><label class="field-label" for="period-length">Typical period length</label><input class="number-input" id="period-length" name="periodLength" type="number" min="2" max="10" value="${appState.profile.periodLength}" required /></div>
        <div class="form-actions"><button class="button-primary" type="submit">Save preferences ${icon("check", 18)}</button></div>
      </form>
    </section>
    ${renderReminderSettings()}
    <div class="section-heading"><h2>Backup</h2></div>
    <section class="card card-pad backup-card">
      <h3>JSON backup</h3>
      <p class="helper-text" style="margin-top:8px;">Backups are readable JSON files with your period and wellbeing entries. Keep the downloaded file somewhere private.</p>
      <div class="settings-list" style="margin-top:12px;">
        <div class="settings-row backup-setting-row"><div class="settings-row-copy"><span class="settings-row-title">Last backup</span><span class="settings-row-detail">${lastBackup ? formatDate(localDateString(new Date(lastBackup)), { month: "long", day: "numeric", year: "numeric" }) : "Not yet backed up"}</span></div><button class="button-quiet" type="button" data-action="export-backup">${icon("download", 17)} Export</button></div>
        <div class="settings-row backup-setting-row"><div class="settings-row-copy"><span class="settings-row-title">Restore a backup</span><span class="settings-row-detail">This replaces the data currently on this device.</span></div><label class="button-quiet" for="restore-file">${icon("upload", 17)} Choose file</label><input class="screen-reader-only" id="restore-file" type="file" accept="application/json,.json" data-action="restore-backup" /></div>
      </div>
    </section>
    <div class="section-heading"><h2>Privacy</h2></div>
    <section class="card card-pad">
      <div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Local data</span><span class="settings-row-detail">Entries stay on this device and work offline. Only an anonymous device subscription is sent for reminders.</span></div>${icon("check", 22)}</div>
      <p class="helper-text">No app password or encryption. Someone with access to this device or an exported backup can read your entries.</p>
      <p class="helper-text">Lotus v${APP_VERSION}</p>
    </section>`;
}

function showToast(message) {
  document.querySelectorAll(".toast").forEach((toast) => toast.remove());
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 3200);
}

function renderError(message) {
  appRoot.innerHTML = `<div class="onboarding"><section class="welcome-card"><img class="welcome-icon" src="./assets/lotus.svg" alt="" /><h1>LOTUS</h1><p class="error-message">${escapeHtml(message)}</p></section></div>`;
}

async function createAccount(form) {
  const name = form.elements.name.value.trim();
  if (!name) return renderOnboarding("Please enter your name.");
  appState = defaultState(name);
  await saveVault();
  activeView = "today";
  renderApp();
}

async function migrateLegacy(form) {
  const password = form.elements.password.value;
  try {
    const envelope = await readStoredVault(LEGACY_DB_NAME, LEGACY_STORE_NAME);
    if (!envelope) {
      renderOnboarding("The previous Lotus data is no longer available here.");
      return;
    }
    appState = normaliseState(await decryptEnvelope(envelope, password));
    appState.notifications = defaultState("").notifications;
    await saveVault();
    const check = await readStoredVault();
    if (!check?.data?.profile) throw new Error("Could not verify the imported data.");
    if (pushNotificationsAvailable()) {
      try {
        const registration = await readyServiceWorker();
        const oldSubscription = await registration.pushManager.getSubscription();
        if (oldSubscription) await oldSubscription.unsubscribe();
      } catch { /* The stored entries have already migrated safely. */ }
    }
    activeView = "today";
    renderApp();
    showToast("Your Lotus entries are now on this device.");
  } catch (error) {
    appState = null;
    renderMigration("The old password could not import your entries. Please try again.");
  }
}

async function startPeriod() {
  const today = localDateString(new Date());
  if (!appState.periodStarts.includes(today)) appState.periodStarts.push(today);
  appState.periodStarts.sort();
  appState.dailyLogs[today] = {
    ...(appState.dailyLogs[today] || {}),
    id: appState.dailyLogs[today]?.id || `log_${today}`,
    date: today,
    flow: appState.dailyLogs[today]?.flow && appState.dailyLogs[today].flow !== "none" ? appState.dailyLogs[today].flow : "medium",
    symptoms: appState.dailyLogs[today]?.symptoms || [],
    breastSoreness: appState.dailyLogs[today]?.breastSoreness || null,
    periodPain: appState.dailyLogs[today]?.periodPain || null,
    bleedingImpact: appState.dailyLogs[today]?.bleedingImpact || null,
    moodPms: appState.dailyLogs[today]?.moodPms || null,
    stress: appState.dailyLogs[today]?.stress || null,
    sexDrive: appState.dailyLogs[today]?.sexDrive || null,
    exercise: appState.dailyLogs[today]?.exercise || { type: "none", minutes: 0 },
    water: appState.dailyLogs[today]?.water || 0,
    fertility: appState.dailyLogs[today]?.fertility || { lh: "not-tested", lhTime: "", mucus: "not-observed", ovulationDate: "", ovulationSource: "personal" },
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  recalculatePeriodStarts();
  await saveVault();
  showToast("Today is marked as the start of your period.");
  renderApp();
}

async function saveCheckin(form) {
  const date = form.elements.date.value;
  const existing = appState.dailyLogs[date] || {};
  const flow = form.dataset.flow || "none";
  const symptoms = [...form.querySelectorAll('input[name="symptoms"]:checked')].map((input) => input.value);
  const breastSoreness = validChoice(SORENESS_OPTIONS, form.dataset.breastSoreness, "none");
  const periodPainIntensity = clamp(Number(form.elements["period-pain-intensity"].value) || 0, 0, 10);
  const periodPainImpact = periodPainIntensity === 0
    ? "none"
    : validChoice(PAIN_IMPACT_OPTIONS, form.dataset.painImpact, "none");
  const bleedingImpact = {
    flooding: Boolean(form.elements["bleeding-flooding"].checked),
    productChangeInterval: validChoice(PRODUCT_CHANGE_OPTIONS, form.elements["product-change-interval"].value, "not-tracked"),
    clotSize: validChoice(CLOT_SIZE_OPTIONS, form.dataset.clotSize, "none"),
    activityImpact: Boolean(form.elements["bleeding-activity-impact"].checked)
  };
  const moodPms = {
    lowMood: validChoice(MOOD_OPTIONS, form.dataset.moodLow, "none"),
    anxiety: validChoice(MOOD_OPTIONS, form.dataset.moodAnxiety, "none"),
    irritability: validChoice(MOOD_OPTIONS, form.dataset.moodIrritability, "none"),
    impact: validChoice(MOOD_OPTIONS, form.dataset.moodImpact, "none")
  };
  const stress = numberOrNull(form.dataset.stress);
  const sexDrive = numberOrNull(form.dataset.sexDrive);
  const exerciseType = form.dataset.exercise || "none";
  const exerciseMinutes = clamp(Number($("#exercise-minutes", form)?.value || 0), 0, 120);
  const water = clamp(Number(form.dataset.water || 0), 0, 20);
  const ovulationDate = form.elements["ovulation-date"].value;
  if (date > localDateString(new Date()) && (form.elements["lh-result"].value !== "not-tested"
    || form.elements.mucus.value !== "not-observed" || ovulationDate)) {
    showToast("Fertility observations can only be logged for today or earlier.");
    return;
  }
  if (ovulationDate && (ovulationDate > localDateString(new Date()) || !/^\d{4}-\d{2}-\d{2}$/.test(ovulationDate))) {
    showToast("Ovulation date must be a valid past or current date.");
    return;
  }
  appState.dailyLogs[date] = {
    id: existing.id || `log_${date}`,
    date,
    flow,
    symptoms,
    breastSoreness,
    periodPain: { intensity: periodPainIntensity, impact: periodPainImpact },
    bleedingImpact,
    moodPms,
    stress,
    sexDrive,
    exercise: { type: exerciseType, minutes: exerciseMinutes },
    water,
    fertility: {
      lh: validChoice(LH_OPTIONS, form.elements["lh-result"].value, "not-tested"),
      lhTime: form.elements["lh-time"].value || "",
      mucus: validChoice(MUCUS_OPTIONS, form.elements.mucus.value, "not-observed"),
      ovulationDate,
      ovulationSource: validChoice(OVULATION_SOURCE_OPTIONS, form.elements["ovulation-source"].value, "personal")
    },
    updatedAt: new Date().toISOString(),
    deletedAt: null
  };
  recalculatePeriodStarts();
  await saveVault();
  activeView = "today";
  showToast("Check-in saved.");
  renderApp();
}

async function saveSettings(form) {
  const name = form.elements.name.value.trim();
  const averageCycleLength = clamp(Number(form.elements.averageCycleLength.value) || 28, 21, 45);
  const periodLength = clamp(Number(form.elements.periodLength.value) || 5, 2, 10);
  if (!name) return;
  appState.profile.name = name;
  appState.profile.averageCycleLength = averageCycleLength;
  appState.profile.periodLength = periodLength;
  await saveVault();
  showToast("Preferences saved.");
  renderApp();
}

async function exportBackup() {
  appState.backup.lastBackupAt = new Date().toISOString();
  await saveVault();
  const data = JSON.parse(JSON.stringify(appState));
  data.notifications = defaultState("").notifications;
  const backup = {
    app: "Lotus",
    format: "lotus-local-json",
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    data
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lotus-backup-${localDateString(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("JSON backup exported.");
  renderApp();
}

async function restoreBackup(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) return showToast("This backup is too large to import.");
  if (!window.confirm("Restore this backup? It will replace the Lotus data currently on this device.")) return;
  const previous = appState;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== "Lotus") throw new Error("Invalid backup");
    let data;
    if (backup.format === "lotus-local-json" && backup.formatVersion === 2) {
      data = backup.data;
    } else if (backup.format === "lotus-encrypted-json" && backup.vault) {
      const oldPassword = window.prompt("Enter the old Lotus master password once to import this encrypted backup.");
      if (!oldPassword) return;
      data = await decryptEnvelope(backup.vault, oldPassword);
    } else {
      throw new Error("Invalid backup");
    }
    if (!data || typeof data.profile?.name !== "string" || !data.dailyLogs
      || typeof data.dailyLogs !== "object" || Array.isArray(data.dailyLogs)
      || !Array.isArray(data.periodStarts)) throw new Error("Invalid data");
    appState = normaliseState(data);
    appState.notifications = previous.notifications;
    await saveVault();
    renderApp();
    showToast("Backup restored.");
  } catch (error) {
    appState = previous;
    showToast("This backup could not be restored.");
  }
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    activeView = nav.dataset.nav;
    renderApp();
    return;
  }

  const choice = event.target.closest("[data-select]");
  if (choice) {
    const form = choice.closest("form");
    if (!form) return;
    const group = choice.dataset.select;
    const datasetKey = group.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    form.dataset[datasetKey] = choice.dataset.value;
    form.querySelectorAll(`[data-select="${group}"]`).forEach((button) => {
      const selected = button === choice;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    return;
  }

  const step = event.target.closest("[data-step]");
  if (step) {
    const form = step.closest("form");
    if (!form) return;
    const current = Number(form.dataset.water || 0);
    const next = clamp(current + Number(step.dataset.change || 0), 0, 20);
    form.dataset.water = String(next);
    const waterNumber = $("#water-number", form);
    if (waterNumber) waterNumber.textContent = String(next);
    return;
  }

  const calendarButton = event.target.closest("[data-calendar]");
  if (calendarButton) {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + (calendarButton.dataset.calendar === "next" ? 1 : -1), 1, 12);
    renderApp();
    return;
  }

  const day = event.target.closest("[data-date]");
  if (day) {
    selectedDate = day.dataset.date;
    activeView = "checkin";
    renderApp();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;
  const actionName = action.dataset.action;
  if (actionName === "start-fresh") return renderOnboarding();
  if (actionName === "start-period") return startPeriod();
  if (actionName === "open-checkin") {
    selectedDate = localDateString(new Date());
    activeView = "checkin";
    renderApp();
    return;
  }
  if (actionName === "open-calendar") {
    activeView = "calendar";
    renderApp();
    return;
  }
  if (actionName === "today-date") {
    selectedDate = localDateString(new Date());
    renderApp();
    return;
  }
  if (actionName === "cancel-checkin") {
    activeView = "today";
    renderApp();
    return;
  }
  if (actionName === "enable-push") return enablePushNotifications();
  if (actionName === "disable-push") return disablePushNotifications();
  if (actionName === "test-notification") return testDeviceNotification();
  if (actionName === "export-backup") return exportBackup();
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === "onboarding-form") await createAccount(form);
    if (form.id === "migration-form") await migrateLegacy(form);
    if (form.id === "checkin-form") await saveCheckin(form);
    if (form.id === "settings-form") await saveSettings(form);
  } catch (error) {
    showToast("Lotus could not save that just now.");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "exercise-minutes") {
    const value = $("#exercise-minutes-value");
    if (value) value.textContent = event.target.value;
  }
  if (event.target.id === "period-pain-intensity") {
    const value = $("#period-pain-value");
    if (value) value.textContent = `${event.target.value} / 10`;
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.dataset.action === "restore-backup") await restoreBackup(event.target);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    clearReminderBadge();
    flushPushRemoval();
  }
});
window.addEventListener("online", flushPushRemoval);

async function boot() {
  if (!window.crypto?.subtle) {
    renderError("Lotus needs a secure browser context for its data migration and reminders. Open the installed PWA or use a local web server.");
    return;
  }
  try {
    const stored = await readStoredVault();
    if (stored?.data) {
      appState = normaliseState(stored.data);
      renderApp();
      flushPushRemoval();
    } else if (await readStoredVault(LEGACY_DB_NAME, LEGACY_STORE_NAME)) {
      renderMigration();
    } else {
      renderOnboarding();
    }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    clearReminderBadge();
  } catch (error) {
    renderError("Lotus could not prepare local storage in this browser.");
  }
}

boot();
