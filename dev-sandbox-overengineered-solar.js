
// [2026.10.29.1150] OverEngineered Dev Sandbox
/*
 * OverEngineered Solar: dev sandbox
 * Required Notice: Copyright (c) 2026 OverEngineered-Tech
 * Licensed under the PolyForm Noncommercial License 1.0.0
 * Source: https://github.com/OverEngineered-Tech/OverEngineered-Solar
 * Support: https://buymeacoffee.com/overengineeredtech
 */
// Shows the OverEngineered Solar widget with made-up numbers, one screen after another.
// Safe to run: it reads no settings, saves nothing, never logs in and never contacts Enphase.
// Not affiliated with or endorsed by Enphase Energy, Inc.
//
// WHAT IT IS FOR
// Trying a change without spending real Enphase requests, and seeing how the widget looks on days you
// would otherwise wait months for: a dirty array, a deficit, a winter day, a fault.
//
// HOW IT IS LAID OUT
// Everything down to the line "===== SANDBOX =====" is the widget's own code (widget 2026.10.28.1117),
// copied in by a build script, so what you see here is drawn exactly the way the real widget draws it.
// The part to play with is below that line: a table of made-up days, and the code that turns each row
// into the numbers the widget expects.
//
// HOW TO USE IT
// Run it in Scriptable and tap through the screens. To try your own day, copy a row in SCENARIOS and
// change a number. To try a layout change, edit the drawing code above and run again; when you like it,
// make the same edit in the real widget.
//
// The date on each screen is today's. Only the time of day and the numbers are made up.

// ===== SETTINGS: read from the file the setup script writes =====

// Shown in the debug report. Keep it the same as the stamp on the first line.
const WIDGET_VERSION = "2026.10.28.1117";

const fm = { documentsDirectory: () => "", joinPath: (a, b) => a + "/" + b, fileExists: () => false,
  readString: () => null, writeString: () => {}, createDirectory: () => {}, remove: () => {} };
const CONFIG_FILE_NAME = "overengineered-solar-config.json";
const TOKEN_FILE_NAME = "overengineered-solar-token.json";
const CONFIG_SCHEMA_VERSION = 1;
const configPath = fm.joinPath(fm.documentsDirectory(), CONFIG_FILE_NAME);
const tokenPath = fm.joinPath(fm.documentsDirectory(), TOKEN_FILE_NAME);

// Just checks the settings file is there and complete. A bad file shows "Run the setup script first".
function loadSettings() {
  if (!fm.fileExists(configPath)) return { cfg: null, problem: "No settings yet." };
  let raw;
  try { raw = JSON.parse(fm.readString(configPath)); } catch (e) { return { cfg: null, problem: "Settings file is damaged." }; }
  if (!raw || raw.schemaVersion !== CONFIG_SCHEMA_VERSION) return { cfg: null, problem: "Settings file is from a different version." };
  const missing = ["apiKey", "clientId", "clientSecret", "systemId", "lifetimeStartDate"].filter((k) => !String(raw[k] || "").trim());
  if (typeof raw.arrayObservedMaxKw !== "number" || !(raw.arrayObservedMaxKw > 0)) missing.push("arrayObservedMaxKw");
  if (missing.length) return { cfg: null, problem: "Settings are incomplete (" + missing.join(", ") + ")." };
  return { cfg: raw, problem: null };
}
const SETTINGS = loadSettings();
const CFG = SETTINGS.cfg;

const API_KEY = CFG ? String(CFG.apiKey).trim() : "";
const CLIENT_ID = CFG ? String(CFG.clientId).trim() : "";
const CLIENT_SECRET = CFG ? String(CFG.clientSecret).trim() : "";
const SYSTEM_ID = CFG ? String(CFG.systemId).trim() : "";

// Above zero = no consumption meters. Use this daily figure and never ask Enphase for consumption.
const ESTIMATED_DAILY_KWH = (CFG && typeof CFG.estimatedDailyKwh === "number") ? CFG.estimatedDailyKwh : 0;
const WEATHER_ZIP = CFG ? String(CFG.weatherZip || "").trim() : "";
// Outside the US there is no ZIP code, so setup takes a latitude and longitude. Used only when the ZIP is empty.
const WEATHER_LAT = (CFG && typeof CFG.weatherLat === "number") ? CFG.weatherLat : null;
const WEATHER_LON = (CFG && typeof CFG.weatherLon === "number") ? CFG.weatherLon : null;
const HAS_TYPED_COORDS = !WEATHER_ZIP && WEATHER_LAT !== null && WEATHER_LON !== null &&
  Math.abs(WEATHER_LAT) <= 90 && Math.abs(WEATHER_LON) <= 180;
const PANEL_TILT_DEG = (CFG && typeof CFG.panelTiltDeg === "number") ? CFG.panelTiltDeg : null;

// ===== OPERATIONAL MODES & BENCHMARKS =====

// On: the top-left box shows energy sent to the grid and taken from it, in place of Cons. Needs consumption meters.
let SHOW_EXPORTED_IMPORTED = false;
let WIDGET_TITLE = "OverEngineered Solar";
const LIFETIME_START_DATE = CFG ? CFG.lifetimeStartDate : "2026-01-01";
// Bump this when the saved history changes shape. Saved history from another version is fetched again.
const SCRIPT_VERSION = 12;

const BANK_BASELINE_KWH = (CFG && typeof CFG.bankBaselineKwh === "number") ? CFG.bankBaselineKwh : 0;

// With no bill date, the bank is counted from the system's start date.
let BANK_BASELINE_DATE = LIFETIME_START_DATE;
// The highest power the owner has seen, from setup. It seeds the dirty-panel check.
const ARRAY_OBSERVED_MAX_KW = CFG ? CFG.arrayObservedMaxKw : 1;
// False for net billing (such as California NEM 3): the box shows net since a chosen date, not a kWh bank.
// Settings files from before this switch count as true.
let BANKS_KWH_CREDITS = true;
// The month the utility resets banked credits (1 to 12), from setup. Used only to draw the 12-month bank line.
const TRUE_UP_MONTH = (CFG && Number.isInteger(CFG.trueUpMonth) && CFG.trueUpMonth >= 1 && CFG.trueUpMonth <= 12)
  ? CFG.trueUpMonth : null;
// The day of the month the utility bill usually arrives (1 to 31), from setup. With a kWh bank the Banked number
// follows the bills: on each bill day a bank below zero goes back to zero (a positive bank stays), and on the bill
// day of the true-up month the utility keeps any credits left over, so the bank goes to zero. A short month uses
// its last day. A settings file saved before this field existed falls back to the day of the entered bill date.
// With neither, the Banked number is the plain running sum it was before.
function validBillDay(d) { return Number.isInteger(d) && d >= 1 && d <= 31; }
const BILL_DAY_FROM_SETUP = (CFG && validBillDay(CFG.billDay)) ? CFG.billDay : null;
const BILL_DAY_FROM_DATE = (() => {
  const m = /^\d{4}-\d{2}-(\d{2})$/.exec(String((CFG && CFG.bankBaselineDate) || ""));
  const d = m ? parseInt(m[1], 10) : null;
  return validBillDay(d) ? d : null;
})();
const BILL_DAY = BILL_DAY_FROM_SETUP !== null ? BILL_DAY_FROM_SETUP : BILL_DAY_FROM_DATE;
const BILL_DAY_SOURCE = BILL_DAY_FROM_SETUP !== null ? "setup" : (BILL_DAY_FROM_DATE !== null ? "bill date" : "none");
// On (setup switch "12-month bank chart", on by default, and on for older settings files without it): the bank
// box shows today's Net beside the trend mark and a small 12-month bank line on the right. Off: the original layout.
const SHOW_BANK_CHART = !(CFG && CFG.showBankChart === false);
// At this share of the expected peak or more, the icon is the bright sun, whatever the weather service says.
const SUN_ICON_PEAK_RATIO = 0.85;
// Off on purpose. Set to true to show the newest power reading in small text beside the "Array Status"
// heading ("Latest 6.7 kW"). It fits, and it stops the big number being read as "right now", but it is one
// more number to explain, so it was left out. It is hidden when the reading is zero.
const SHOW_LATEST_KW = false;

// ===== PEAK POWER & DIRTY-PANEL CHECK =====
// Keeps the last five clear-day peaks and shows the highest, so it matches the peak the Enphase app shows.
// A freak reading is limited by the glitch ceiling below and falls out of the list after five days.
// A peak that falls on clear days most likely means dirt.
//
// Panels fade a little every year. The ceiling fades with them so aging isn't read as dirt.
const PEAK_ANNUAL_DECAY_PCT = 0.3;
// Percent under the ceiling that reads Dirty, and then Very Dirty.
const PEAK_ORANGE_PCT = 10.0;
const PEAK_RED_PCT = 16.0;
// How many clear-day peaks are kept.
const PEAK_FIFO_DEPTH = 5;
// A clear day needs at least 3 hours' worth of its own peak in energy. Rejects a cloudy day with one spike.
const GATE1_PSH_MULTIPLIER = 3000;
// Highest weather code that still counts as clear (0 clear, 1 mainly clear, 2 partly cloudy).
const GATE1_MAX_CLEAR_WEATHER_CODE = 2;
// Today's peak is judged only after 4 PM, when the peak is behind us and most of the day's energy is in.
const PEAK_EVAL_AFTER_HOUR = 16;
// Winter lockout. This is the cosine of the angle between the midday sun and the panel. Below it the sun
// is too low for a clean array to reach its summer peak, so peaks are neither recorded nor judged.
const GATE2_COS_CUTOFF = 0.88;
// Bump to throw away the saved list of peaks. The ceiling is kept.
const PEAK_CACHE_VERSION = 9;
// A peak this far above the entered maximum is a glitch. The ceiling can't rise past it either.
const PEAK_SANITY_BUFFER_PCT = 5;
const PEAK_SANITY_MAX_KW = ARRAY_OBSERVED_MAX_KW * (1 + PEAK_SANITY_BUFFER_PCT / 100);
const NAMEPLATE_AC_CEILING_KW = PEAK_SANITY_MAX_KW;

// ===== RATE LIMIT PROTECTIONS & TIMING CONSTANTS =====
// No requests between these hours. There is no sun and the owner is asleep, so requests are saved for the day.
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 5;
// Only used if MONTHLY_BUDGET_ENABLED is turned off.
const MAX_CALLS_PER_DAY = 30;
// Daily totals change once a day, so history is fetched once a day.
const MIN_HOURS_BETWEEN_HISTORY_CALLS = 24;
// After a failed history fetch, wait this long before retrying, so an outage can't eat the day's requests.
const HISTORY_RETRY_WAIT_MS = 3 * 60 * 60 * 1000;
// Renew the access token this long before it runs out, so a late run does not find it expired.
const TOKEN_REFRESH_BUFFER_MINUTES = 60;

// Enphase reports energy in 15-minute readings.
const MS_PER_INTERVAL = 15 * 60 * 1000;

// Fetch production after 4 new readings (hourly) and consumption after 8 (every 2 hours).
const PROD_INTERVALS_PER_PULL = 4;
const CONS_INTERVALS_PER_PULL = 8;

// In daylight, consumption only rides along with production (about every second fetch). A run of its own
// would use up a wake and delay the next production update.
const CONS_RIDE_ALONG_MIN_INTERVALS = 6;

// In the hourly window (see HOURLY CONSUMPTION WINDOW): with every production fetch by day, hourly after dark.
const CONS_HOURLY_RIDE_MIN_INTERVALS = 3;
const CONS_HOURLY_INTERVALS_PER_PULL = 4;
// A reading is not available the instant its 15 minutes end. Wait this long before expecting it.
const ENPHASE_CLOUD_LAG_MS = 4 * 60 * 1000;

// A reading shows up within minutes but only part filled; it is complete about 10 minutes after it ends.
// Younger than this, it is not used for "current power" (it would look like a sudden drop). Totals still count it.
const NEWEST_READING_MIN_AGE_MS = 10 * 60 * 1000;

// A background run never asks for a meter again sooner than this after the last fetch, even when Enphase's
// newest reading looks old. Without it, a stalled Enphase feed (its cloud stuck on one reading for hours) made
// every wake look due, and the widget spent its whole day of requests in about an hour.
const MIN_REFETCH_GAP_MS = 45 * 60 * 1000;
// A fetch that brings no newer reading stretches the wait to an hour, so a stalled feed costs no more than a
// normal day, and a recovered feed is picked up within the hour.
const STALL_MAX_GAP_MS = 60 * 60 * 1000;
// In daylight the time on the widget turns orange once the newest production reading is this old, so stale
// numbers never look current.
const STALE_READING_MS = 2 * 60 * 60 * 1000;
// Production is fetched only while the sun is up, so the last readings before sunset would never arrive.
// One extra production fetch this long after sunset picks them up (one request a day).
const PROD_TAIL_AFTER_SUNSET_MS = 30 * 60 * 1000;
// After dark, a production reading older than this no longer says what the array is making now: show 0 kW.
const NIGHT_KW_STALE_MS = 60 * 60 * 1000;

// The power curve is 24 hourly averages, ending now.
const HOURLY_BUCKET_COUNT = 24;

// ===== PERSISTENCE SETUP =====

// One folder for working data. Installs from before the rename keep their old folder.
const LEGACY_CACHE_DIR = fm.joinPath(fm.documentsDirectory(), "enphase-widget-cache");
const cacheDir = fm.fileExists(LEGACY_CACHE_DIR) ? LEGACY_CACHE_DIR : fm.joinPath(fm.documentsDirectory(), "overengineered-solar-data");
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

function loadJSONFile(path) {
  if (!fm.fileExists(path)) return null;
  try { return JSON.parse(fm.readString(path)); } catch (e) { return null; }
}
function saveJSONFile(path, obj) { fm.writeString(path, JSON.stringify(obj)); }

// ===== CONSOLIDATED STATE =====
const stateFile = fm.joinPath(cacheDir, "state.json");
// Everything lives in state.json. Older one-file-per-topic installs are merged in on the first run.
const LEGACY_CACHE_FILES = {
  calls: "call-counter.json",
  tokens: "token-cache.json",
  telemetry: "rolling24-cache.json",
  history: "history-cache.json",
  peak: "peak-cache.json",
  weather: "weather-cache.json",
  geo: "geocode-cache.json",
};

function loadState() {
  if (!fm.fileExists(stateFile)) {
    const migrated = {};
    for (const key in LEGACY_CACHE_FILES) {
      const legacyData = loadJSONFile(fm.joinPath(cacheDir, LEGACY_CACHE_FILES[key]));
      if (legacyData !== null) migrated[key] = legacyData;
    }
    saveJSONFile(stateFile, migrated);
    return migrated;
  }
  return loadJSONFile(stateFile) || {};
}

function readStateKey(key) {
  const state = loadState();
  return state[key] !== undefined ? state[key] : null;
}

function writeStateKey(key, value) {
  const state = loadState();
  state[key] = value;
  saveJSONFile(stateFile, state);
}

function loadHistoryCache() { return readStateKey("history"); }
function saveHistoryCache(data) { writeStateKey("history", { data: data, fetchedAt: Date.now() }); }

// Local time on purpose. toISOString() is UTC, which is already tomorrow on an American evening, and
// Enphase rejects a date in the future.
function dateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ===== MONTHLY CALL BUDGET =====

// Enphase's free plan allows 1,000 requests a month, and every request is counted here. Each remaining day
// first gets what its basic schedule needs. Only the leftover (the surplus) pays for extras and for runs
// from inside the app, so app runs can never starve the background widget.
const MONTHLY_BUDGET_ENABLED = true;
const MONTH_ALLOWANCE = 950;
const MONTH_HARD_STOP = 990;
// Backstop on background runs in one day.
const WIDGET_DAILY_CEILING = 34;
// Installed mid-month, the widget has no count for the earlier days, so it assumes this many on each.
const ASSUMED_CALLS_PER_UNTRACKED_DAY = 32;
// Daylight hours to assume until the location is known. Long on purpose, so the reserve errs high.
const BASICS_FALLBACK_DAYLIGHT_HOURS = 16;

function monthKeyFor(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function daysInMonthOf(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

// Hours of daylight for a date and latitude. Longer days need more production requests.
function daylightHoursFor(date, latDeg) {
  if (typeof latDeg !== "number") return BASICS_FALLBACK_DAYLIGHT_HOURS;
  const rad = Math.PI / 180;
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  const decl = 23.44 * Math.sin((360 / 365) * (dayOfYear - 81) * rad);
  const cosH = (Math.cos(90.833 * rad) - Math.sin(latDeg * rad) * Math.sin(decl * rad)) / (Math.cos(latDeg * rad) * Math.cos(decl * rad));
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 * Math.acos(cosH) / rad) / 15;
}

// Fewest requests a day needs: 3 for history, one per daylight hour for production, 8 for consumption
// (fewer with no consumption meters).
function basicsForDay(date, latDeg) {
  const wakingHours = 24 - ((QUIET_END_HOUR + 24 - QUIET_START_HOUR) % 24);
  const prodCalls = Math.min(Math.ceil(daylightHoursFor(date, latDeg)), wakingHours);
  return usingEstimatedConsumption() ? (2 + prodCalls) : (3 + prodCalls + 8);
}

function normalizedCallCounters(state, now) {
  const today = dateStr(now);
  const sc = state.calls;
  const c = (sc && sc.date === today)
    ? { date: today, calls: sc.calls || 0, widget: (typeof sc.widget === "number") ? sc.widget : (sc.calls || 0), app: sc.app || 0 }
    : { date: today, calls: 0, widget: 0, app: 0 };
  const mk = monthKeyFor(now);
  const sm = state.month;
  let m;
  if (!sm || !sm.key || typeof sm.used !== "number") {
    const untrackedDays = now.getDate() - 1;
    const assumedCalls = untrackedDays * ASSUMED_CALLS_PER_UNTRACKED_DAY;
    m = { key: mk, used: assumedCalls + c.calls, assumedCalls, assumedDays: untrackedDays };
  } else if (sm.key !== mk) {
    m = { key: mk, used: c.calls, assumedCalls: 0, assumedDays: 0 };
  } else {
    m = { key: sm.key, used: sm.used, assumedCalls: sm.assumedCalls || 0, assumedDays: sm.assumedDays || 0 };
  }
  return { c, m };
}

function callsUsedToday() {
  return normalizedCallCounters(loadState(), new Date()).c.calls;
}

// Counted before the request goes out, so a failed one still counts. Overcounting is the safe side.
// Requests made by this run, for the run log in the debug report.
let callsThisRun = 0;

function recordCalls(n) {
  callsThisRun += n;
  const state = loadState();
  const { c, m } = normalizedCallCounters(state, new Date());
  c.calls += n;
  if (config.runsInWidget) c.widget += n; else c.app += n;
  m.used += n;
  state.calls = c;
  state.month = m;
  saveJSONFile(stateFile, state);
}

// Today's runs, for the debug report: how many of each kind, and every run that spent requests. This is what
// shows where a day's requests went.
const RUN_LOG_DEPTH = 40;
function hhmm(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function recordRun(rollingResult, historyResult) {
  try {
    const now = new Date();
    const today = dateStr(now);
    const who = !config.runsInWidget ? "app" : (IS_LOCK_SCREEN ? "lock" : "home");
    const stored = readStateKey("runLog");
    const log = (stored && stored.date === today && stored.runs && Array.isArray(stored.spent))
      ? stored : { date: today, runs: { home: 0, lock: 0, app: 0 }, spent: [] };
    log.runs[who] = (log.runs[who] || 0) + 1;
    if (callsThisRun > 0) {
      const what = [];
      if (rollingResult && rollingResult.fetchedProd) what.push("prod");
      if (rollingResult && rollingResult.fetchedCons) what.push("cons");
      if (historyResult && historyResult.fromCache === false) what.push("history");
      log.spent.push({ t: now.getTime(), who: who, n: callsThisRun, what: what.join("+") || "failed" });
      while (log.spent.length > RUN_LOG_DEPTH) log.spent.shift();
    }
    writeStateKey("runLog", log);
  } catch (e) {
  }
}

function callBudget() {
  const now = new Date();
  const state = loadState();
  const { c, m } = normalizedCallCounters(state, now);
  const lat = (state.geo && typeof state.geo.latitude === "number") ? state.geo.latitude : null;
  const basicsToday = basicsForDay(now, lat);

  const plan = state.consPlan;
  const plannedExtrasToday = (plan && plan.date === dateStr(now) && typeof plan.hourlyHours === "number")
    ? Math.ceil(plan.hourlyHours * EXTRA_CALLS_PER_HOURLY_CONS_HOUR) : 0;
  const reserveToday = Math.max(0, basicsToday + plannedExtrasToday - c.widget);
  const lastDay = daysInMonthOf(now);
  let reserveFuture = 0;
  for (let d = now.getDate() + 1; d <= lastDay; d++) {
    reserveFuture += basicsForDay(new Date(now.getFullYear(), now.getMonth(), d, 12), lat);
  }
  const surplus = MONTH_ALLOWANCE - m.used - reserveToday - reserveFuture;
  return { today: c, month: m, basicsToday, plannedExtrasToday, reserveToday, reserveFuture, daysAfterToday: lastDay - now.getDate(), surplus, latKnown: lat !== null };
}

// ===== HOURLY CONSUMPTION WINDOW =====

// Basic pace is consumption every 2 hours. Spare requests buy hourly consumption at both ends of the day,
// when production is near zero and consumption is all that moves the numbers. Planned once a day.
//
// Each hour of hourly consumption costs half a request more than the basic pace.
const EXTRA_CALLS_PER_HOURLY_CONS_HOUR = 0.5;
// Keeps the window from ballooning in the last week of a month with a lot left over.
const HOURLY_WINDOW_CAP_ABOVE_EVEN_PACE_HOURS = 2;

function wakingHoursPerDay() { return 24 - ((QUIET_END_HOUR + 24 - QUIET_START_HOUR) % 24); }

function getConsPlan() {
  const now = new Date();
  const today = dateStr(now);
  const stored = readStateKey("consPlan");
  if (stored && stored.date === today && typeof stored.hourlyHours === "number") return stored;
  let hours = 0;
  let share = 0;
  if (MONTHLY_BUDGET_ENABLED && !usingEstimatedConsumption()) {
    const b = callBudget();
    share = b.surplus / (b.daysAfterToday + 1);
    const evenPaceHours = Math.floor((MONTH_ALLOWANCE / daysInMonthOf(now) - b.basicsToday) / EXTRA_CALLS_PER_HOURLY_CONS_HOUR);
    hours = Math.floor(share / EXTRA_CALLS_PER_HOURLY_CONS_HOUR);
    hours = Math.min(
      hours,
      evenPaceHours + HOURLY_WINDOW_CAP_ABOVE_EVEN_PACE_HOURS,
      Math.floor((WIDGET_DAILY_CEILING - b.basicsToday) / EXTRA_CALLS_PER_HOURLY_CONS_HOUR),
      wakingHoursPerDay()
    );
    hours = Math.max(0, hours);
  }
  const eveningHours = Math.ceil(hours / 2);
  const morningHours = hours - eveningHours;
  const plan = {
    date: today,
    hourlyHours: hours,
    morningEndHour: QUIET_END_HOUR + morningHours,
    eveningStartHour: QUIET_START_HOUR - eveningHours,
    share: Math.round(share * 10) / 10,
  };
  writeStateKey("consPlan", plan);
  return plan;
}

function inHourlyConsWindow(plan, ms) {
  const d = new Date(ms);
  const h = d.getHours() + d.getMinutes() / 60;
  return h < plan.morningEndHour || h >= plan.eveningStartHour;
}

function canSpendCalls(n) {
  if (!MONTHLY_BUDGET_ENABLED) return callsUsedToday() + n <= MAX_CALLS_PER_DAY;
  const { c, m } = normalizedCallCounters(loadState(), new Date());
  return (m.used + n <= MONTH_HARD_STOP) && (c.widget + n <= WIDGET_DAILY_CEILING);
}

function canAppRunSpend(n) {
  if (!MONTHLY_BUDGET_ENABLED) return true;
  const b = callBudget();
  return (b.month.used + n <= MONTH_HARD_STOP) && (n <= b.surplus);
}

function usingEstimatedConsumption() {
  return typeof ESTIMATED_DAILY_KWH === "number" && ESTIMATED_DAILY_KWH > 0;
}

function isQuietHours(d) {
  const h = d.getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

function daysBetweenDateStrs(dateStrA, dateStrB) {
  const dA = new Date(dateStrA + "T00:00:00Z");
  const dB = new Date(dateStrB + "T00:00:00Z");
  return Math.round((dB - dA) / 86400000);
}

// Whole kWh, with one decimal under 10. The bank and Net are always whole (wholeOnly): a decimal there
// would claim more accuracy than they have.
function kwh(wattHours, wholeOnly) {
  if (wattHours === undefined || wattHours === null) return "--";
  const v = wattHours / 1000;
  if (!wholeOnly && Math.abs(v) < 9.95) {
    const t = v.toFixed(1);
    return (t === "0.0" || t === "-0.0") ? "0" : t;
  }
  return Math.round(v).toString();
}

// Missing days come back as zero. Skip them so a gap doesn't drag the average down.
function averageNonZero(arr) {
  const nonZero = arr.filter((v) => v > 0);
  if (nonZero.length === 0) return null;
  return nonZero.reduce((sum, v) => sum + v, 0) / nonZero.length;
}

// ===== BANK TREND MARK =====

// The small mark beside "Banked Credits": average daily net over 28 days. Four whole weeks, so weekday
// habits cancel and one cloudy day doesn't flip it.
const BANK_TREND_WINDOW_DAYS = 28;
// Needs at least this many of the 28 days to have real data.
const BANK_TREND_MIN_DAYS = 21;
// Within this many kWh a day, either way, counts as flat.
const BANK_TREND_BAND_KWH_PER_DAY = 5;

function bankTrendDir(avgNetTrendWh) {
  if (typeof avgNetTrendWh !== "number" || !isFinite(avgNetTrendWh)) return null;
  const kwhPerDay = avgNetTrendWh / 1000;
  if (kwhPerDay > BANK_TREND_BAND_KWH_PER_DAY) return "up";
  if (kwhPerDay < -BANK_TREND_BAND_KWH_PER_DAY) return "down";
  return "flat";
}

// Net per day, only for days where both production and consumption have a reading.
// The bank for each of the last 12 months, for the small line in the bank box. Worked out from the daily
// history already fetched, so it costs no requests. From the bill date on it is the same sum as the Banked
// number. Before the bill date it is worked back from the bill, taking each day's net away again. Going back
// past a true-up (the 1st of the true-up month), the balance before it cannot be worked back, so it is
// counted up from zero instead, never below zero. Days before the history begins are left blank, so on a
// young system the line starts part way across. The top and bottom still come from every day. A day missing either meter counts as zero net, as it does
// for the Banked number. Returns null when there is too little to draw; the box then keeps its original layout.
const BANK_YEAR_DAYS = 365;
// Small dots on the bottom edge of the mini graphs for a sense of time, with no labels: quarter starts on the
// bank chart, the 1st of the month on the 30-day chart, midnight on the Array Status chart. Same in every
// country (no words, no clock format). The renderers can still draw very light vertical lines (markers), but
// none is used: the lines crossed the three boxes like a crosshair.
const CHART_MARKER_ALPHA = 0.16;
// One point every two weeks (27 across a year). At 58 points wide, weekly points sat about one per pixel and
// drew weather wobble, not the shape; on a small or break-even array that wobble could fill the box.
const BANK_YEAR_STEP_DAYS = 14;
function buildBankYear(prodDays, consDays, startDateStr, baselineWh, baselineDateStr, trueUpMonth, banksKwh, billDay) {
  try {
    const n = Math.min(prodDays.length, consDays.length);
    if (!(n >= 2)) return null;
    const net = (i) => (prodDays[i] > 0 && consDays[i] > 0) ? prodDays[i] - consDays[i] : 0;
    const start = new Date(startDateStr + "T00:00:00Z");
    if (isNaN(start.getTime())) return null;
    // With a bill day: the true-up forfeit is the bill day of the true-up month, and every other bill day
    // sends a negative bank back to zero (same rules as the Banked number). Without one: the old 1st of the month.
    const useBills = !!banksKwh && validBillDay(billDay) && Number.isInteger(trueUpMonth) && trueUpMonth >= 1 && trueUpMonth <= 12;
    const billOn = (i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      return d.getUTCDate() === Math.min(billDay, last);
    };
    const isResetDay = (i) => {
      if (!banksKwh || !trueUpMonth) return false;
      const d = new Date(start.getTime() + i * 86400000);
      if (useBills) return billOn(i) && d.getUTCMonth() + 1 === trueUpMonth;
      return d.getUTCDate() === 1 && d.getUTCMonth() + 1 === trueUpMonth;
    };
    let a = daysBetweenDateStrs(startDateStr, baselineDateStr);
    if (!isFinite(a) || a < -1) a = -1;
    if (a > n - 1) a = n - 1;
    const bank = new Array(n);
    let v = baselineWh;
    if (a >= 0) bank[a] = v;
    for (let i = a + 1; i < n; i++) {
      v += net(i);
      if (useBills && billOn(i)) {
        if (isResetDay(i)) v = 0;
        else if (v < 0) v = 0;
      }
      bank[i] = v;
    }
    let reset = -1;
    for (let i = a - 1; i >= 0; i--) {
      if (isResetDay(i + 1)) { reset = i + 1; break; }
      bank[i] = bank[i + 1] - net(i + 1);
    }
    if (reset > 0) {
      if (useBills && reset < a) bank[reset] = 0;
      let u = 0;
      for (let i = 0; i < reset; i++) {
        if (i > 0 && isResetDay(i)) u = 0;
        u = Math.max(0, u + net(i));
        bank[i] = u;
      }
    }
    const first = Math.max(0, n - BANK_YEAR_DAYS);
    let topWh = -Infinity;
    let lowWh = Infinity;
    for (let i = first; i < n; i++) {
      if (bank[i] > topWh) topWh = bank[i];
      if (bank[i] < lowWh) lowWh = bank[i];
    }
    const slots = Math.floor((BANK_YEAR_DAYS - 1) / BANK_YEAR_STEP_DAYS) + 1;
    const points = [];
    let firstIndex = -1;
    for (let k = slots - 1; k >= 0; k--) {
      const i = n - 1 - k * BANK_YEAR_STEP_DAYS;
      if (i < 0) { points.push(0); continue; }
      if (firstIndex === -1) firstIndex = points.length;
      points.push(Math.round(bank[i]));
    }
    if (firstIndex === -1 || points.length - firstIndex < 2) return null;
    if (!points.every((x) => isFinite(x)) || !isFinite(topWh) || !isFinite(lowWh)) return null;
    return { points, firstIndex, topWh: Math.round(topWh), lowWh: Math.round(lowWh), days: n - first };
  } catch (e) {
    return null;
  }
}

// The Banked number with the utility's rules: the balance from the bill, plus the net of each full day after the
// bill date (a day counts only if both meters have a reading, as everywhere else). On each bill day a bank below
// zero goes back to zero; a positive bank stays. On the bill day of the true-up month the utility keeps whatever
// is left, so the bank goes to zero. A bill day past the end of a short month falls on that month's last day.
// Works on copies and writes nothing, so a bad input only means "no answer": returns null and the caller keeps the
// plain running sum. Otherwise { bankWh, lastReset: { date, kind, fromWh } | null }.
function bankAfterBills(prodDays, consDays, startDateStr, baselineWh, baselineDateStr, billDay, trueUpMonth, banksKwh) {
  try {
    if (!banksKwh || !validBillDay(billDay)) return null;
    if (!Number.isInteger(trueUpMonth) || trueUpMonth < 1 || trueUpMonth > 12) return null;
    if (typeof baselineWh !== "number" || !isFinite(baselineWh)) return null;
    const n = Math.min(prodDays.length, consDays.length);
    const start = new Date(startDateStr + "T00:00:00Z");
    if (isNaN(start.getTime())) return null;
    const a = daysBetweenDateStrs(startDateStr, baselineDateStr);
    if (!isFinite(a) || a < 0) return null;
    let v = baselineWh;
    let lastReset = null;
    for (let i = a + 1; i < n; i++) {
      const p = prodDays[i], c = consDays[i];
      if (p > 0 && c > 0) v += p - c;
      const d = new Date(start.getTime() + i * 86400000);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      if (d.getUTCDate() !== Math.min(billDay, last)) continue;
      const when = d.toISOString().slice(0, 10);
      if (d.getUTCMonth() + 1 === trueUpMonth) {
        lastReset = { date: when, kind: "true-up", fromWh: v };
        v = 0;
      } else if (v < 0) {
        lastReset = { date: when, kind: "monthly", fromWh: v };
        v = 0;
      }
    }
    if (!isFinite(v)) return null;
    return { bankWh: v, lastReset };
  } catch (e) {
    return null;
  }
}

function buildPairedNets(prodArr, consArr) {
  const nets = [];
  const len = Math.min(prodArr.length, consArr.length);
  for (let i = 0; i < len; i++) {
    const p = prodArr[i];
    const c = consArr[i];
    if (p > 0 && c > 0) nets.push(p - c);
  }
  return nets;
}

function average(arr) {
  if (!arr.length) return null;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

// ===== SERVICE REQ (hardware fault detection) =====

// Most Enphase events are routine. Only these mean real hardware trouble and show "Service Req".
const SERVICE_REQ_WHITELIST = [
  "device_0w", "rgm_error",
  "cellmaxvoltageerror", "cellminvoltageerror", "cellmaxtemperror", "cellmintemperror",
  "bmumaxcurrentwarning", "bmusenseerror", "bmuhardwareerror", "bmuimageerror", "cibimageerror",
  "encharge_bmu_comm_failure", "encharge_high_temp_error", "encharge_low_temp_error",
  "encharge_high_voltage_error", "encharge_low_voltage_error", "enpower_com_voltage_imbalance",
  "ensemble_mod_gone", "enpower_mid_relay_fused", "enpower_ec1_relay_fused",
  "enpower_nft_relaysed_open", "enpower_mid_relay_open", "enpower_ec1_relay_open",
  "generator_stop_failed", "error_gid_fused", "error_gid_open",
];

function isServiceRequired(openEventsResp) {
  if (!openEventsResp || !Array.isArray(openEventsResp.events) || openEventsResp.events.length === 0) {
    return false;
  }
  return openEventsResp.events.some((ev) => {
    const key = (ev.event_type_key || ev.event_type_Key || "").toLowerCase();
    return SERVICE_REQ_WHITELIST.includes(key);
  });
}

function basicAuthHeader() {
  const pair = `${CLIENT_ID}:${CLIENT_SECRET}`;
  return "Basic " + Data.fromString(pair).toBase64String();
}

// ===== OAUTH AUTHENTICATION =====

// The access token lasts about a day and is renewed with the refresh token. Whatever comes back is saved
// at once. A renewal that fails for a passing reason (no signal) keeps the old token; a new login is asked
// for only when Enphase refused the renewal and the old token has run out.
//
// Only for the debug report, when the refresh token's own expiry can't be read.
const REFRESH_TOKEN_FALLBACK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function needsUserError(kind, message) {
  const e = new Error(message);
  e.needsUser = kind;
  return e;
}

// Tokens are JWTs, so the expiry time can be read from the middle part.
function jwtExpiryMs(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(Data.fromBase64String(b64).toRawString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

function loadTokens() {
  const fromFile = loadJSONFile(tokenPath);
  if (fromFile && fromFile.refresh_token) return { tokens: fromFile, source: "token file" };
  const legacy = readStateKey("tokens");
  if (legacy && legacy.refresh_token) return { tokens: legacy, source: "state.json (older install)" };
  return { tokens: null, source: "none" };
}

function saveTokens(tokenData) {
  fm.writeString(tokenPath, JSON.stringify(tokenData, null, 2));
}

let TOKEN_DEBUG = { source: "not loaded", renewed: false, note: "" };

// Enphase takes these parameters in the address, not in the request body.
async function refreshAccessToken(refreshToken, previous) {
  const url = `https://api.enphaseenergy.com/oauth/token?grant_type=refresh_token&refresh_token=${refreshToken}`;
  const req = new Request(url);
  req.method = "POST";
  req.headers = { "Authorization": basicAuthHeader() };
  const resp = await req.loadJSON();
  if (!resp || !resp.access_token || typeof resp.expires_in !== "number") {
    const e = new Error(`refreshAccessToken: bad response (code:${resp && resp.code}, msg:${resp && (resp.message || resp.error_description || resp.error)})`);
    e.rejectedByEnphase = true;
    throw e;
  }
  const now = Date.now();
  const newRefresh = resp.refresh_token || refreshToken;
  const refreshExp = jwtExpiryMs(newRefresh);
  const tokenData = {
    access_token: resp.access_token,
    refresh_token: newRefresh,
    expires_at: now + (resp.expires_in * 1000),
    refresh_expires_at: refreshExp !== null ? refreshExp : now + REFRESH_TOKEN_FALLBACK_LIFETIME_MS,
    refresh_expiry_source: refreshExp !== null ? "token" : "assumed 30 days",
    obtained_at: (previous && previous.obtained_at) || now,
    renewed_at: now,
  };
  saveTokens(tokenData);
  return tokenData;
}

async function getValidAccessToken() {
  const loaded = loadTokens();
  let tokenData = loaded.tokens;
  TOKEN_DEBUG = { source: loaded.source, renewed: false, note: "" };
  if (!tokenData) throw needsUserError("login", "Run the setup script and log in to Enphase.");

  const bufferMs = TOKEN_REFRESH_BUFFER_MINUTES * 60 * 1000;
  const expiresAt = typeof tokenData.expires_at === "number" ? tokenData.expires_at : 0;
  const needsRefresh = Date.now() > (expiresAt - bufferMs);
  if (needsRefresh) {
    try {
      tokenData = await refreshAccessToken(tokenData.refresh_token, tokenData);
      TOKEN_DEBUG.renewed = true;
    } catch (e) {
      const accessExpired = Date.now() > expiresAt;
      if (e && e.rejectedByEnphase && accessExpired) {
        throw needsUserError("login", "Run the setup script and tap Log in again.");
      }

      TOKEN_DEBUG.note = "renewal failed this run: " + ((e && e.message) ? e.message : String(e));
      return tokenData.access_token;
    }
  }
  return tokenData.access_token;
}

// ===== WEATHER TELEMETRY =====
// Background runs reuse a weather report up to this old. A run from inside the app fetches a fresh one.
const WEATHER_CACHE_MAX_AGE_MS = 20 * 60 * 1000;

// Flip the day/night icon this long before real sunrise or sunset, so a run just before one isn't wrong.
const EARLY_ICON_FLIP_MARGIN_MS = 10 * 60 * 1000;

// In daylight, ask for one extra run this long after each run, just for the icon. iOS only allows so many
// runs a day, so don't go lower. Skipped within WAKE_MIN_GAP_MS of a run that is already planned.
const WEATHER_ONLY_WAKE_MS = 30 * 60 * 1000;
// iOS runs each widget on its own timetable, so the Lock Screen widget can sit an hour behind the Home Screen
// even though the newer numbers are already saved. It asks to be run this often. A run with nothing
// due makes no Enphase request; it just redraws from what is saved.
const LOCK_TILE_WAKE_MS = 15 * 60 * 1000;
const WAKE_MIN_GAP_MS = 10 * 60 * 1000;

// Thin high cloud alone still lets most of the sun through. With low and mid cloud both under this, the
// icon shows partly cloudy. Only the icon changes.
const CIRRUS_ONLY_LOW_MID_MAX_PCT = 30;

function weatherBucket(code) {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 85 && code <= 86) return "snow";
  if (code >= 95) return "thunder";
  return "overcast";
}

function weatherSymbolName(bucket, isDay) {
  if (bucket === "clear") return isDay ? "sun.max.fill" : "moon.stars.fill";
  if (bucket === "partly-cloudy") return isDay ? "cloud.sun.fill" : "cloud.moon.fill";
  if (bucket === "overcast") return "smoke.fill";
  if (bucket === "fog") return "cloud.fog.fill";
  if (bucket === "rain") return "cloud.rain.fill";
  if (bucket === "snow") return "cloud.snow.fill";
  if (bucket === "thunder") return "cloud.bolt.rain.fill";
  return "cloud.fill";
}

function weatherIconColor(bucket, isDay) {
  if (bucket === "clear") return isDay ? new Color("#ffcc33") : new Color("#f0e9d2");
  if (bucket === "partly-cloudy") return isDay ? new Color("#f4d976") : new Color("#c3aeed");
  if (bucket === "overcast") return new Color("#9aa5b1");
  if (bucket === "fog") return new Color("#8295a8");
  if (bucket === "rain") return new Color("#8ecbfd");
  if (bucket === "snow") return new Color("#f5f9ff");
  if (bucket === "thunder") return new Color("#ffe066");
  return GREY;
}

// The ZIP code is turned into coordinates once and saved. A typed latitude and longitude is saved as it is.
async function resolveWeatherCoords() {
  const cached = readStateKey("geo");
  if (HAS_TYPED_COORDS) {
    if (!cached || cached.zip !== "" || cached.latitude !== WEATHER_LAT || cached.longitude !== WEATHER_LON) {
      writeStateKey("geo", { zip: "", latitude: WEATHER_LAT, longitude: WEATHER_LON, resolvedName: "typed in setup" });
    }
    return { latitude: WEATHER_LAT, longitude: WEATHER_LON };
  }
  if (cached && cached.zip === WEATHER_ZIP) {
    return { latitude: cached.latitude, longitude: cached.longitude };
  }
  if (!/^\d{5}$/.test(WEATHER_ZIP)) {
    throw new Error(`resolveWeatherCoords: WEATHER_ZIP "${WEATHER_ZIP}" isn't a 5-digit US zip`);
  }
  const url = `https://api.zippopotam.us/us/${WEATHER_ZIP}`;
  const req = new Request(url);
  req.timeoutInterval = 5;
  const resp = await req.loadJSON();
  const first = resp && resp.places && resp.places[0];
  const latitude = first && Number(first.latitude);
  const longitude = first && Number(first.longitude);
  if (!first || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new Error(`resolveWeatherCoords: zip "${WEATHER_ZIP}" didn't resolve`);
  }
  const resolved = { latitude, longitude };
  writeStateKey("geo", {
    zip: WEATHER_ZIP,
    ...resolved,
    resolvedName: `${first["place name"]}, ${first["state abbreviation"]}`,
  });
  return resolved;
}

function parseLocalDateTime(s) {
  if (!s) return null;
  const ms = new Date(s).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function resolveWeatherIcon(weatherCode, rawIsDay, sunriseMs, sunsetMs, cloudLow, cloudMid) {
  const isDay = (sunriseMs != null && sunsetMs != null)
    ? (Date.now() >= sunriseMs - EARLY_ICON_FLIP_MARGIN_MS && Date.now() < sunsetMs - EARLY_ICON_FLIP_MARGIN_MS)
    : rawIsDay;

  const cirrusOnlyOvercast = weatherCode === 3
    && typeof cloudLow === "number" && typeof cloudMid === "number"
    && cloudLow < CIRRUS_ONLY_LOW_MID_MAX_PCT && cloudMid < CIRRUS_ONLY_LOW_MID_MAX_PCT;
  const iconCode = cirrusOnlyOvercast ? 2 : weatherCode;
  const bucket = weatherBucket(iconCode);
  const symbolName = weatherSymbolName(bucket, isDay);
  const colorHex = weatherIconColor(bucket, isDay).hex;

  return { symbolName, colorHex, weatherCode, iconCode, isDay };
}

async function getWeatherIcon() {
  if (!WEATHER_ZIP && !HAS_TYPED_COORDS) return null;
  const cached = readStateKey("weather");
  if (config.runsInWidget && cached && cached.weatherCode != null && Date.now() - cached.fetchedAt < WEATHER_CACHE_MAX_AGE_MS) {
    const sunriseMs = cached.sunriseMs ?? null;
    const sunsetMs = cached.sunsetMs ?? null;
    return { ...resolveWeatherIcon(cached.weatherCode, cached.rawIsDay, sunriseMs, sunsetMs, cached.cloudLow, cached.cloudMid), sunriseMs, sunsetMs, cloudLow: cached.cloudLow, cloudMid: cached.cloudMid, cloudHigh: cached.cloudHigh };
  }
  try {
    const { latitude, longitude } = await resolveWeatherCoords();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,is_day,cloud_cover_low,cloud_cover_mid,cloud_cover_high&daily=sunrise,sunset&timezone=auto`;
    const req = new Request(url);
    req.timeoutInterval = 5;
    const resp = await req.loadJSON();
    if (!resp || !resp.current || typeof resp.current.weather_code !== "number") {
      throw new Error("weather: malformed response");
    }
    const rawIsDay = resp.current.is_day === 1;
    const weatherCode = resp.current.weather_code;
    const sunriseMs = resp.daily && Array.isArray(resp.daily.sunrise) ? parseLocalDateTime(resp.daily.sunrise[0]) : null;
    const sunsetMs = resp.daily && Array.isArray(resp.daily.sunset) ? parseLocalDateTime(resp.daily.sunset[0]) : null;
    const cloudLow = typeof resp.current.cloud_cover_low === "number" ? resp.current.cloud_cover_low : null;
    const cloudMid = typeof resp.current.cloud_cover_mid === "number" ? resp.current.cloud_cover_mid : null;
    const cloudHigh = typeof resp.current.cloud_cover_high === "number" ? resp.current.cloud_cover_high : null;
    writeStateKey("weather", { weatherCode, rawIsDay, sunriseMs, sunsetMs, cloudLow, cloudMid, cloudHigh, fetchedAt: Date.now() });
    return { ...resolveWeatherIcon(weatherCode, rawIsDay, sunriseMs, sunsetMs, cloudLow, cloudMid), sunriseMs, sunsetMs, cloudLow, cloudMid, cloudHigh, fresh: true };
  } catch (e) {
    if (!cached || cached.weatherCode == null) return null;
    const sunriseMs = cached.sunriseMs ?? null;
    const sunsetMs = cached.sunsetMs ?? null;
    return { ...resolveWeatherIcon(cached.weatherCode, cached.rawIsDay, sunriseMs, sunsetMs, cached.cloudLow, cached.cloudMid), sunriseMs, sunsetMs, cloudLow: cached.cloudLow, cloudMid: cached.cloudMid, cloudHigh: cached.cloudHigh };
  }
}

// Costs no requests. Saves each weather reading beside the array's power at that moment, for the status
// report. It shows how often the area forecast disagrees with this roof.
function recordWeatherReading(weatherIcon, prodKw) {
  try {
    if (!weatherIcon || !weatherIcon.fresh || typeof weatherIcon.weatherCode !== "number") return;
    const stored = readStateKey("weatherLog");
    const log = Array.isArray(stored) ? stored : [];
    log.push({
      at: Date.now(),
      code: weatherIcon.weatherCode,
      icon: weatherIcon.symbolName,
      low: weatherIcon.cloudLow, mid: weatherIcon.cloudMid, high: weatherIcon.cloudHigh,
      kw: (typeof prodKw === "number") ? Math.round(prodKw * 100) / 100 : null,
      app: !config.runsInWidget,
    });
    while (log.length > WEATHER_LOG_DEPTH) log.shift();
    writeStateKey("weatherLog", log);
  } catch (e) {
  }
}

// ===== ENPHASE DATA FETCHING & PARSING =====
// Works out the reading length from the data itself (normally 15 minutes).
function inferIntervalHours(intervals, tsField) {
  if (!intervals || intervals.length < 2) return 0.25;
  const times = intervals
    .map((iv) => {
      const t = iv[tsField];
      return t > 100000000000 ? t : t * 1000;
    })
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 0.25;
  gaps.sort((a, b) => a - b);
  const medianMs = gaps[Math.floor(gaps.length / 2)];
  return medianMs / 3600000;
}

function localMidnightMs(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Production since local midnight. Yesterday's figure is cleared at midnight. Until the first fetch of the
// new day the sun is down, so it is zero; that lets the bank and the Lock Screen widget count the night's use.
// Past noon with nothing fetched today, something is wrong: return null, not a zero that looks real.
function prodTodayWh(rd, nowMs) {
  if (!rd || !rd.prod) return null;
  const v = rd.prod.sinceCutoffWh;
  if (typeof v === "number" && isFinite(v)) return v;
  const beforeNoon = (nowMs - localMidnightMs(new Date(nowMs))) < 12 * 60 * 60 * 1000;
  return beforeNoon ? 0 : null;
}

// Averages the readings into 24 hourly values for the power curve, and notes the highest reading in the
// last hour (the dashed line on the chart).
function bucketHourlyKw(intervals, valField, tsField, intervalHours, anchorMs) {
  const sums = new Array(HOURLY_BUCKET_COUNT).fill(0);
  const counts = new Array(HOURLY_BUCKET_COUNT).fill(0);
  let recentPeakKw = 0;
  for (const iv of intervals) {
    const wh = iv[valField] || 0;
    const t = iv[tsField];
    const tMs = t > 100000000000 ? t : t * 1000;
    const hoursAgo = (anchorMs - tMs) / 3600000;
    let idx = HOURLY_BUCKET_COUNT - 1 - Math.floor(hoursAgo);
    if (idx < 0) idx = 0;
    if (idx > HOURLY_BUCKET_COUNT - 1) idx = HOURLY_BUCKET_COUNT - 1;
    sums[idx] += wh;
    counts[idx] += 1;
    if (idx === HOURLY_BUCKET_COUNT - 1 && intervalHours > 0) {
      const ivKw = (wh / 1000) / intervalHours;
      if (ivKw > recentPeakKw) recentPeakKw = ivKw;
    }
  }
  const hourlyKw = sums.map((sum, i) => {
    const n = counts[i];
    if (n === 0 || intervalHours <= 0) return 0;
    return (sum / 1000) / (n * intervalHours);
  });
  return { hourlyKw, recentPeakKw };
}

// Scriptable doesn't throw on a failed request. Enphase's error arrives as ordinary data with a message
// and a code, so check that first, or an error reads as an empty day.
function parseIntervals(raw, label, sinceMs, anchorMs, lookupMs) {
  if (raw && (raw.message || raw.code) && !raw.intervals) {
    throw new Error(`${label} code:${raw.code} msg:${raw.message}`);
  }
  const intervals = raw.intervals || raw.data || [];
  if (!Array.isArray(intervals) || intervals.length === 0) {
    throw new Error(`${label} no intervals, raw: ${JSON.stringify(raw).slice(0, 250)}`);
  }
  const valField = ["enwh", "wh_del", "energy_wh", "value", "wh"].find((f) => intervals[0][f] !== undefined);
  const tsField = ["end_at", "start_at", "interval_end_at", "timestamp"].find((f) => intervals[0][f] !== undefined);
  if (!valField || !tsField) {
    throw new Error(`${label} unknown interval keys: ${Object.keys(intervals[0]).join(",")}`);
  }
  const intervalHours = inferIntervalHours(intervals, tsField);
  let totalWh = 0;
  let maxWh = 0;
  let lastEndMs = 0;
  let lastWh = 0;
  let prevEndMs = 0;
  let prevWh = 0;
  let sinceCutoffWh = 0;
  let sinceCutoffMaxWh = 0;
  let lookupWh = null;
  // Each reading as [end time, Wh], kept so production and consumption can be compared reading by reading
  // (see gridFlowWh). 96 small pairs per meter.
  const readingsWh = [];
  for (const iv of intervals) {
    const wh = iv[valField] || 0;
    totalWh += wh;
    if (wh > maxWh) maxWh = wh;
    const t = iv[tsField];
    const tMs = t > 100000000000 ? t : t * 1000;
    readingsWh.push([tMs, Math.round(wh)]);
    if (lookupMs && tMs === lookupMs) lookupWh = wh;
    if (tMs > lastEndMs) {
      prevEndMs = lastEndMs;
      prevWh = lastWh;
      lastEndMs = tMs;
      lastWh = wh;
    } else if (tMs > prevEndMs && tMs < lastEndMs) {
      prevEndMs = tMs;
      prevWh = wh;
    }
    // A reading stamped with its END time that ends exactly at the cutoff covers the minutes before it, so it
    // belongs to the day before. A reading stamped with its START time at the cutoff belongs to the new day.
    const sinceIncludes = tsField === "start_at" ? tMs >= sinceMs : tMs > sinceMs;
    if (sinceMs !== undefined && sinceIncludes) {
      sinceCutoffWh += wh;
      if (wh > sinceCutoffMaxWh) sinceCutoffMaxWh = wh;
    }
  }
  const maxKw = intervalHours > 0 ? (maxWh / 1000) / intervalHours : maxWh / 1000 * 4;

  const whToKw = (wh) => (intervalHours > 0 ? (wh / 1000) / intervalHours : wh / 1000 * 4);
  const rawLatestKw = whToKw(lastWh);
  const newestAgeMs = (anchorMs || Date.now()) - lastEndMs;
  const latestHeldBack = prevEndMs > 0 && newestAgeMs < NEWEST_READING_MIN_AGE_MS;
  const latestKw = latestHeldBack ? whToKw(prevWh) : rawLatestKw;
  const latestFromEndMs = latestHeldBack ? prevEndMs : lastEndMs;
  const { hourlyKw, recentPeakKw } = bucketHourlyKw(intervals, valField, tsField, intervalHours, anchorMs || Date.now());
  // Highest reading since the cutoff (local midnight): today's peak, shown on the Lock Screen widget.
  const sinceCutoffMaxKw = sinceMs !== undefined ? whToKw(sinceCutoffMaxWh) : null;
  const lookupKw = lookupWh === null ? null : (intervalHours > 0 ? (lookupWh / 1000) / intervalHours : lookupWh / 1000 * 4);
  return { totalWh, maxWh, maxKw, latestKw, rawLatestKw, latestHeldBack, latestFromEndMs, newestAgeMs, intervalHours, lastEndMs, sinceCutoffWh, sinceCutoffMaxKw, count: intervals.length, hourlyKw, recentPeakKw, lookupKw, readingsWh };
}

// ===== EXPORTED AND IMPORTED =====

// Energy sent to the grid and taken from it over the last 24 hours. Production minus consumption for the
// whole day can't tell you this: a sunny morning and a hungry evening cancel out. So the two meters are
// compared one 15-minute reading at a time. More made than used in a reading counts as exported, less
// counts as imported.
//
// After dark production isn't fetched, so for consumption readings newer than the last production reading,
// production counts as zero. In daylight consumption can be an hour or two behind; those newest production
// readings are left out until their consumption arrives.
//
// It reads a little lower than a utility meter, which doesn't wait 15 minutes to net things out. With a
// home battery it isn't grid flow at all, because the battery sits between the house and the grid.
// Returns null when there isn't enough to go on (no consumption meters, or data saved by an older version).
const GRID_FLOW_MIN_READINGS = 60;
function gridFlowWh(rd, nowMs, startMs) {
  if (usingEstimatedConsumption()) return null;
  const prodList = rd && rd.prod && rd.prod.readingsWh;
  const consList = rd && rd.cons && rd.cons.readingsWh;
  if (!Array.isArray(prodList) || !Array.isArray(consList) || prodList.length === 0) return null;
  const prodAt = new Map(prodList);
  const prodNewestMs = prodList.reduce((mx, r) => Math.max(mx, r[0]), 0);
  // Past 24 hours, or from startMs (midnight, for the Today view) when given.
  const windowStartMs = (typeof startMs === "number") ? startMs : nowMs - 24 * 60 * 60 * 1000;
  let exportedWh = 0;
  let importedWh = 0;
  let used = 0;
  for (const r of consList) {
    const endMs = r[0];
    if (endMs <= windowStartMs) continue;
    let p = prodAt.get(endMs);
    if (p === undefined) {
      if (endMs <= prodNewestMs) continue;
      p = 0;
    }
    const net = p - r[1];
    if (net > 0) exportedWh += net; else importedWh -= net;
    used++;
  }
  if (used < GRID_FLOW_MIN_READINGS) return null;
  return { exportedWh, importedWh, readingsUsed: used };
}

// ===== NEWEST-READING CHECK (diagnostic) =====

// Costs no requests. When a later fetch returns the same reading again, both values are saved for the
// debug report. This is how the 10-minute hold-back was measured.
const LATEST_CHECK_LOG_DEPTH = 12;
// How many recent weather readings are kept for the debug report (see recordWeatherReading).
const WEATHER_LOG_DEPTH = 8;

function recordLatestReadingCheck(prevProd, prevFetchedAt, newProd) {
  try {
    if (!prevProd || typeof prevProd.latestKw !== "number" || !prevProd.lastEndMs) return;
    if (!newProd || typeof newProd.lookupKw !== "number") return;
    if (!(newProd.lastEndMs > prevProd.lastEndMs)) return;
    const stored = readStateKey("latestCheck");
    const log = Array.isArray(stored) ? stored : [];
    if (log.some((e) => e.endMs === prevProd.lastEndMs)) return;
    log.push({
      endMs: prevProd.lastEndMs,

      atFetchKw: (typeof prevProd.rawLatestKw === "number") ? prevProd.rawLatestKw : prevProd.latestKw,
      laterKw: newProd.lookupKw,
      fetchLagMs: (typeof prevFetchedAt === "number") ? prevFetchedAt - prevProd.lastEndMs : null,
    });
    while (log.length > LATEST_CHECK_LOG_DEPTH) log.shift();
    writeStateKey("latestCheck", log);
  } catch (e) {
  }
}

async function fetchMeter24h(accessToken, meterPath, sinceMs, lookupMs) {
  const nowSec = Math.floor(Date.now() / 1000);
  const nowMs = nowSec * 1000;
  const startAt = nowSec - 24 * 60 * 60;
  const url = `https://api.enphaseenergy.com/api/v4/systems/${SYSTEM_ID}/telemetry/${meterPath}?start_at=${startAt}&end_at=${nowSec}&key=${API_KEY}`;
  const req = new Request(url);
  req.headers = { "Authorization": `Bearer ${accessToken}` };
  recordCalls(1);
  const raw = await req.loadJSON();
  return parseIntervals(raw, meterPath, sinceMs, nowMs, lookupMs);
}

function meterIntervalsElapsed(meter, nowMs) {
  if (!meter || !meter.lastEndMs) return Infinity;
  return Math.floor((nowMs - (meter.lastEndMs + ENPHASE_CLOUD_LAG_MS)) / MS_PER_INTERVAL);
}

// How long to wait after a fetch before asking for that meter again. Longer while Enphase has nothing new.
function refetchGapMs(stalls) {
  const n = (typeof stalls === "number" && stalls > 0) ? stalls : 0;
  return Math.min(MIN_REFETCH_GAP_MS * Math.pow(2, n), STALL_MAX_GAP_MS);
}

// Earliest time the meter may be fetched again; 0 if it has never been fetched.
function meterRestedAtMs(fetchedAtMs, stalls) {
  return (typeof fetchedAtMs === "number" && fetchedAtMs > 0) ? fetchedAtMs + refetchGapMs(stalls) : 0;
}

// A fetch that brings no newer reading, when one was due, counts as a stall; a newer reading resets the count.
// A fetch too soon for a new reading (two app runs minutes apart) leaves the count alone.
function nextStalls(prevMeter, prevStalls, newMeter, nowMs) {
  const stalls = (typeof prevStalls === "number") ? prevStalls : 0;
  if (!prevMeter || !prevMeter.lastEndMs || !newMeter || !newMeter.lastEndMs) return 0;
  if (newMeter.lastEndMs > prevMeter.lastEndMs) return 0;
  return meterIntervalsElapsed(prevMeter, nowMs) >= 1 ? stalls + 1 : stalls;
}

// Daylight, awake hours, and the newest production reading is old: the numbers are not current.
function readingIsStale(rd, weatherIcon, nowMs) {
  if (!rd || !rd.prod || !rd.prod.lastEndMs) return false;
  if (!weatherIcon || weatherIcon.isDay !== true) return false;
  if (isQuietHours(new Date(nowMs))) return false;
  return nowMs - rd.prod.lastEndMs > STALE_READING_MS;
}

// Small dot on the bottom edge of the 30-day chart at the 1st of each month in the window, so the line has a sense of time.
// The 30 daily totals end on the day before the history was fetched, so point k is that many days back.
// Skipped when the 30 points are not 30 calendar days (a young system or a day with no production).
const Q2_MONTH_DOT = true;
const Q2_DASHED_USE_LINE = true;
function monthStartIndexes(pointCount, fetchedAtMs, gapless) {
  const out = [];
  if (pointCount !== 30 || gapless === false || !(fetchedAtMs > 0)) return out;
  const f = new Date(fetchedAtMs);
  for (let k = 0; k < pointCount; k++) {
    const d = new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1 - (pointCount - 1 - k));
    if (d.getDate() === 1) out.push(k);
  }
  return out;
}

// Small dots on the bottom edge of the bank chart at the start of each quarter (Jan, Apr, Jul, Oct 1).
// The same dot size and strength is used on the other two charts.
const BANK_QUARTER_TICKS = true;
// How much yesterday's part of the Array Status curve is faded (0 = not at all). 57% was picked on the phone
// from 35 to 65% at several times of day.
const YESTERDAY_FADE = 0.57;
const BANK_TICK_HEIGHT = 2;
const BANK_TICK_ALPHA = 0.4;
function bankChartQuarterTicks(pointCount, nowMs) {
  const out = [];
  if (!BANK_QUARTER_TICKS || !(pointCount >= 2)) return out;
  const today = new Date(nowMs);
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  for (const y of [today.getFullYear() - 1, today.getFullYear()]) {
    for (const m of [0, 3, 6, 9]) {
      const daysBack = Math.round((todayMs - new Date(y, m, 1).getTime()) / 86400000);
      if (daysBack >= 0 && daysBack <= 364) out.push((pointCount - 1) - daysBack * (pointCount - 1) / 364);
    }
  }
  return out;
}

// What the bank line needs: the saved 12-month points with today's balance as the last one, lifted so the
// lowest point is zero (a deficit still draws). Null when there is nothing sound to draw.
function bankChartInputs(bankYear, liveBankWh) {
  if (!bankYear || !Array.isArray(bankYear.points) || bankYear.points.length < 2) return null;
  if (typeof liveBankWh !== "number" || !isFinite(liveBankWh)) return null;
  const firstIndex = Number.isInteger(bankYear.firstIndex) ? bankYear.firstIndex : 0;
  if (firstIndex < 0 || bankYear.points.length - firstIndex < 2) return null;
  const pts = bankYear.points.slice(0, -1).concat([liveBankWh]);
  const real = pts.slice(firstIndex);
  const top = Math.max(typeof bankYear.topWh === "number" ? bankYear.topWh : -Infinity, ...real);
  const low = Math.min(0, typeof bankYear.lowWh === "number" ? bankYear.lowWh : 0, ...real);
  if (!isFinite(top) || !isFinite(low) || top - low <= 0) return null;
  return {
    values: pts.map((v, k) => (k < firstIndex ? 0 : v - low)),
    ceiling: top - low,
    now: liveBankWh - low,
    firstIndex,
  };
}

// After sunset: has the day's last production fetch happened before the readings up to sunset could exist?
// True once, about 30 minutes after sunset, until a fetch is made after that point.
function prodTailPending(meterData, prodFetchedAtMs, sunsetMs, nowMs) {
  if (!meterData || !meterData.lastEndMs || typeof sunsetMs !== "number") return false;
  if (dateStr(new Date(sunsetMs)) !== dateStr(new Date(nowMs))) return false;
  const tailAtMs = sunsetMs + PROD_TAIL_AFTER_SUNSET_MS;
  if (nowMs < tailAtMs) return false;
  if (typeof prodFetchedAtMs === "number" && prodFetchedAtMs >= tailAtMs) return false;
  return meterData.lastEndMs < sunsetMs;
}

// Latest power for the curve end and the weather log: after dark an old reading is shown as 0 kW.
function displayLatestKw(rd, weatherIcon, nowMs) {
  if (!rd || !rd.prod || typeof rd.prod.latestKw !== "number") return null;
  if (weatherIcon && weatherIcon.isDay === false && rd.prod.lastEndMs && nowMs - rd.prod.lastEndMs > NIGHT_KW_STALE_MS) return 0;
  return rd.prod.latestKw;
}

// When the next fetch is worth making: enough new readings, plus the cloud lag. In daylight only
// production sets the clock; consumption rides along.
function nextMeterDueMs(rd, isSunUp, sunsetMs) {
  const due = [];
  if (!isSunUp && rd && rd.prod && rd.prod.lastEndMs && typeof sunsetMs === "number" &&
      dateStr(new Date(sunsetMs)) === dateStr(new Date()) &&
      !(typeof rd.prodFetchedAt === "number" && rd.prodFetchedAt >= sunsetMs + PROD_TAIL_AFTER_SUNSET_MS) &&
      rd.prod.lastEndMs < sunsetMs) {
    due.push(Math.max(sunsetMs + PROD_TAIL_AFTER_SUNSET_MS, meterRestedAtMs(rd.prodFetchedAt, rd.prodStalls)));
  }
  if (isSunUp && rd && rd.prod && rd.prod.lastEndMs) {
    due.push(Math.max(
      rd.prod.lastEndMs + PROD_INTERVALS_PER_PULL * MS_PER_INTERVAL + ENPHASE_CLOUD_LAG_MS,
      meterRestedAtMs(rd.prodFetchedAt, rd.prodStalls)));
  }

  const prodClockOnly = isSunUp && rd && rd.prod && rd.prod.lastEndMs;
  if (!prodClockOnly && rd && rd.cons && rd.cons.lastEndMs && !usingEstimatedConsumption()) {
    const plan = getConsPlan();
    const dueHourly = rd.cons.lastEndMs + CONS_HOURLY_INTERVALS_PER_PULL * MS_PER_INTERVAL + ENPHASE_CLOUD_LAG_MS;
    const dueSlow = rd.cons.lastEndMs + CONS_INTERVALS_PER_PULL * MS_PER_INTERVAL + ENPHASE_CLOUD_LAG_MS;
    const consRestedMs = meterRestedAtMs(rd.consFetchedAt || rd.fetchedAt, rd.consStalls);
    if (inHourlyConsWindow(plan, dueHourly)) {
      due.push(Math.max(dueHourly, consRestedMs));
    } else {
      const d = new Date(dueHourly);

      const eveningOpensMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), plan.eveningStartHour, 0, 0, 0).getTime();
      due.push(Math.max((eveningOpensMs > dueHourly && eveningOpensMs < dueSlow) ? eveningOpensMs : dueSlow, consRestedMs));
    }
  }
  return due.length ? Math.min(...due) : null;
}

// The last 24 hours of production and consumption. Decides which is due, checks the budget, and otherwise
// answers from the saved copy. A failed fetch falls back to the saved copy.
async function getRolling24h(accessToken, weatherIcon) {
  const rawCached = readStateKey("telemetry");
  const now = new Date();
  const nowMs = now.getTime();
  const isManualRun = !config.runsInWidget;
  const todayMidnightMs = localMidnightMs(now);

  let cached = (rawCached && rawCached.prod && rawCached.prodFetchedAt &&
    dateStr(new Date(rawCached.prodFetchedAt)) !== dateStr(now))
    ? { ...rawCached, prod: { ...rawCached.prod, sinceCutoffWh: null, sinceCutoffMaxKw: null } }
    : rawCached;

  const rawConsFetchedAt = cached ? (cached.consFetchedAt || cached.fetchedAt) : null;
  if (cached && cached.cons && rawConsFetchedAt && dateStr(new Date(rawConsFetchedAt)) !== dateStr(now)) {
    cached = { ...cached, cons: { ...cached.cons, sinceCutoffWh: null } };
  }

  const quiet = isQuietHours(now) && !isManualRun;

  const isSunUp = weatherIcon && typeof weatherIcon.isDay === "boolean"
    ? weatherIcon.isDay
    : (now.getHours() >= 6 && now.getHours() < 20);

  // Rested: long enough since the last fetch of that meter. Stops a stalled Enphase feed from making every
  // wake look due.
  const prodRested = !cached || nowMs >= meterRestedAtMs(cached.prodFetchedAt, cached.prodStalls);
  const consRested = !cached || nowMs >= meterRestedAtMs(cached.consFetchedAt || cached.fetchedAt, cached.consStalls);
  const tailPending = !isSunUp && !quiet && prodTailPending(cached && cached.prod, cached && cached.prodFetchedAt,
    weatherIcon ? weatherIcon.sunsetMs : null, nowMs);
  const prodReady = (isSunUp && prodRested && meterIntervalsElapsed(cached && cached.prod, nowMs) >= PROD_INTERVALS_PER_PULL) ||
    (tailPending && prodRested);
  const consElapsed = meterIntervalsElapsed(cached && cached.cons, nowMs);
  const hourlyConsNow = inHourlyConsWindow(getConsPlan(), nowMs);
  const consReady = consRested && (isSunUp
    ? (prodReady && consElapsed >= (hourlyConsNow ? CONS_HOURLY_RIDE_MIN_INTERVALS : CONS_RIDE_ALONG_MIN_INTERVALS))
    : (consElapsed >= (hourlyConsNow ? CONS_HOURLY_INTERVALS_PER_PULL : CONS_INTERVALS_PER_PULL)));

  let needProd = !cached || !cached.prod || (isManualRun ? isSunUp : prodReady);
  let needCons = !usingEstimatedConsumption() && (!cached || !cached.cons || isManualRun || consReady);

  if (cached && !isManualRun && !canSpendCalls((needProd ? 1 : 0) + (needCons ? 1 : 0))) {
    if (needProd && canSpendCalls(1)) {
      needCons = false;
    } else {
      needProd = false;
      needCons = false;
    }
  }

  let appRunRefused = false;
  if (cached && isManualRun && (needProd || needCons) && !canAppRunSpend((needProd ? 1 : 0) + (needCons ? 1 : 0))) {
    if (needProd && needCons && canAppRunSpend(1)) {
      needCons = false;
    } else {
      needProd = false;
      needCons = false;
      appRunRefused = true;
    }
  }

  if (cached && (quiet || (!needProd && !needCons))) {
    return { data: cached, fromCache: true, fetchError: null, fetchedProd: false, fetchedCons: false, appRunRefused };
  }

  try {
    let prod = cached ? cached.prod : null;
    let prodFetchedAt = cached ? cached.prodFetchedAt : null;
    let prodStalls = cached && typeof cached.prodStalls === "number" ? cached.prodStalls : 0;
    if (needProd) {
      const prevProd = prod;
      const prevProdFetchedAt = prodFetchedAt;
      prod = await fetchMeter24h(accessToken, "production_meter", todayMidnightMs, prevProd ? prevProd.lastEndMs : undefined);
      prodFetchedAt = nowMs;
      prodStalls = nextStalls(prevProd, prodStalls, prod, nowMs);
      recordLatestReadingCheck(prevProd, prevProdFetchedAt, prod);
    }

    let cons = cached ? cached.cons : null;
    let consFetchedAt = cached ? (cached.consFetchedAt || cached.fetchedAt) : null;
    let consStalls = cached && typeof cached.consStalls === "number" ? cached.consStalls : 0;
    let consError = null;
    if (usingEstimatedConsumption()) {
      const dayFraction = Math.min(1, Math.max(0, (nowMs - todayMidnightMs) / 86400000));
      cons = {
        totalWh: ESTIMATED_DAILY_KWH * 1000,
        sinceCutoffWh: ESTIMATED_DAILY_KWH * 1000 * dayFraction,
        lastEndMs: prod ? prod.lastEndMs : nowMs,
        count: 0,
      };
      consFetchedAt = nowMs;
    } else if (needCons) {
      try {
        const prevCons = cons;
        cons = await fetchMeter24h(accessToken, "consumption_meter", todayMidnightMs);
        consFetchedAt = nowMs;
        consStalls = nextStalls(prevCons, consStalls, cons, nowMs);
      } catch (e) {
        // Don't throw away fresh production because consumption failed. Keep the older consumption and report
        // the problem. Only a first run, with nothing saved, stops here.
        const consMsg = "consumption_meter: " + ((e && e.message) ? e.message : String(e));
        if (!cons) throw new Error(consMsg);
        consError = consMsg;
      }
    }

    const result = { prod, cons, fetchedAt: nowMs, prodFetchedAt, consFetchedAt, prodStalls, consStalls };
    writeStateKey("telemetry", result);
    return { data: result, fromCache: false, fetchError: consError, fetchedProd: needProd, fetchedCons: needCons && !consError };
  } catch (e) {
    const errMsg = (e && e.message) ? e.message : String(e);
    return { data: cached || null, fromCache: !!cached, fetchError: errMsg };
  }
}

// Once a day: one total per day since the start date, for production and for consumption, plus the open
// faults. Every average and the banked-credit balance come from these.
async function getHistoryStats(accessToken) {
  const cached = loadHistoryCache();
  const now = Date.now();
  const minGapMs = MIN_HOURS_BETWEEN_HISTORY_CALLS * 60 * 60 * 1000;
  const isManualRun = !config.runsInWidget;

  const cacheIsSameCalendarDay = cached && dateStr(new Date(cached.fetchedAt)) === dateStr(new Date(now));
  const cacheIsFresh = cached && cacheIsSameCalendarDay && (now - cached.fetchedAt) < minGapMs;
  const cacheHasExpectedFields = cached && cached.data &&
    cached.data.todayProdWhFromHistory !== undefined &&
    cached.data.todayConsWhFromHistory !== undefined &&
    cached.data.avgNet30dWh !== undefined &&
    cached.data.avgProd30dWh !== undefined &&
    cached.data.avgCons30dWh !== undefined &&
    cached.data.lifetimeAvgConsWh !== undefined &&
    cached.data.estimatedBankWh !== undefined &&
    cached.data.last7ProdWh !== undefined &&
    cached.data.last30ProdWh !== undefined &&
    // Added in 1515: a history saved by an older version lacks it, so it is fetched once more, then daily as usual.
    cached.data.lastDayDate !== undefined &&
    cached.data.serviceReq !== undefined &&
    cached.data.scriptVersion === SCRIPT_VERSION &&
    cached.data.historyStartDate === LIFETIME_START_DATE &&
    cached.data.bankBaselineKwh === BANK_BASELINE_KWH &&
    cached.data.bankBaselineDate === BANK_BASELINE_DATE &&
    cached.data.trueUpMonth === TRUE_UP_MONTH &&
    cached.data.billDay === BILL_DAY &&
    !cached.data.debugInfo;

  if (cacheIsFresh && cacheHasExpectedFields) {
    return { data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt };
  }
  if (cached && cached.data && cacheHasExpectedFields && new Date().getHours() < QUIET_END_HOUR) {
    return { data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  if (cached && cached.data && cacheHasExpectedFields && !isManualRun && !canSpendCalls(usingEstimatedConsumption() ? 2 : 3)) {
    return { data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt };
  }

  if (cached && cached.data && cacheHasExpectedFields && isManualRun && !canAppRunSpend(usingEstimatedConsumption() ? 2 : 3)) {
    return { data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt, appRunRefused: true };
  }

  // A failed fetch never replaces good history. Show the last good copy and remember the failure, so
  // background runs don't retry on every wake.
  const goodCache = !!(cached && cached.data && cacheHasExpectedFields);
  const historyFailure = (msg) => {
    writeStateKey("historyFail", { at: now, msg: msg });
    return goodCache
      ? { data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt, fetchError: msg, stale: true }
      : { data: null, error: msg };
  };
  const lastFail = readStateKey("historyFail");
  if (goodCache && !isManualRun && lastFail && typeof lastFail.at === "number" && now - lastFail.at >= 0 && now - lastFail.at < HISTORY_RETRY_WAIT_MS) {
    return { data: cached.data, fromCache: true, fetchedAt: cached.fetchedAt, fetchError: lastFail.msg, stale: true };
  }

  const end = new Date();
  const endDate = dateStr(end);

  const prodUrl = `https://api.enphaseenergy.com/api/v4/systems/${SYSTEM_ID}/energy_lifetime?start_date=${LIFETIME_START_DATE}&end_date=${endDate}&key=${API_KEY}`;
  const consUrl = `https://api.enphaseenergy.com/api/v4/systems/${SYSTEM_ID}/consumption_lifetime?start_date=${LIFETIME_START_DATE}&end_date=${endDate}&key=${API_KEY}`;

  try {
    const prodReq = new Request(prodUrl);
    prodReq.headers = { "Authorization": `Bearer ${accessToken}` };
    recordCalls(1);
    const prodData = await prodReq.loadJSON();

    const completeDays = daysBetweenDateStrs(LIFETIME_START_DATE, endDate);
    const rawProdDays = prodData.production || [];
    const prodDays = rawProdDays.slice(0, completeDays);

    let consDays;
    let rawConsDays;
    let consData = null;
    if (usingEstimatedConsumption()) {
      rawConsDays = rawProdDays.map(() => ESTIMATED_DAILY_KWH * 1000);
      consDays = prodDays.map(() => ESTIMATED_DAILY_KWH * 1000);
    } else {
      const consReq = new Request(consUrl);
      consReq.headers = { "Authorization": `Bearer ${accessToken}` };
      recordCalls(1);
      consData = await consReq.loadJSON();
      rawConsDays = consData.consumption || [];
      consDays = rawConsDays.slice(0, completeDays);
    }

    let debugInfo = null;
    if (prodDays.length === 0 || consDays.length === 0) {
      const prodErr = prodData && (prodData.message || prodData.details || prodData.code)
        ? `code:${prodData.code} msg:${prodData.message} details:${prodData.details}`
        : `keys:${Object.keys(prodData || {}).join(",")}`;
      const consErr = usingEstimatedConsumption()
        ? "estimated (no CTs)"
        : consData && (consData.message || consData.details || consData.code)
        ? `code:${consData.code} msg:${consData.message} details:${consData.details}`
        : `keys:${Object.keys(consData || {}).join(",")}`;
      debugInfo = `PROD: ${prodErr} || CONS: ${consErr}`;
    }
    if (debugInfo) return historyFailure(debugInfo);

    const lifetimeAvgConsWh = averageNonZero(consDays);

    const ROLLING_WINDOW_DAYS = 30;
    const prod30 = prodDays.slice(-ROLLING_WINDOW_DAYS);
    const cons30 = consDays.slice(-ROLLING_WINDOW_DAYS);
    const rolling30Nets = buildPairedNets(prod30, cons30);
    const avgNet30dWh = average(rolling30Nets);
    const avgProd30dWh = averageNonZero(prod30);

    const trendNets = buildPairedNets(prodDays.slice(-BANK_TREND_WINDOW_DAYS), consDays.slice(-BANK_TREND_WINDOW_DAYS));
    const avgNetTrendWh = trendNets.length >= BANK_TREND_MIN_DAYS ? average(trendNets) : null;
    const trendDaysUsed = trendNets.length;

    const avgCons30dWh = averageNonZero(cons30);

    const prodOnlySeries = prodDays.filter((v) => v > 0);
    const last7ProdWh = prodOnlySeries.slice(-7);
    const last30ProdWh = prodOnlySeries.slice(-30);

    // Banked credits: the balance from the bill, plus the net of every full day after the bill date.
    const baselineOffsetDays = daysBetweenDateStrs(LIFETIME_START_DATE, BANK_BASELINE_DATE);
    const sinceBaselineProd = baselineOffsetDays < 0 ? [] : prodDays.slice(baselineOffsetDays + 1);
    const sinceBaselineCons = baselineOffsetDays < 0 ? [] : consDays.slice(baselineOffsetDays + 1);
    const sinceBaselineNets = buildPairedNets(sinceBaselineProd, sinceBaselineCons);
    const netSinceBaselineWh = sinceBaselineNets.reduce((sum, v) => sum + v, 0);
    const plainBankWh = (BANK_BASELINE_KWH * 1000) + netSinceBaselineWh;
    // With a bill day the bank follows the bills (see bankAfterBills); with no usable answer it stays the plain sum.
    const billRule = bankAfterBills(prodDays, consDays, LIFETIME_START_DATE, BANK_BASELINE_KWH * 1000,
      BANK_BASELINE_DATE, BILL_DAY, TRUE_UP_MONTH, BANKS_KWH_CREDITS);
    const estimatedBankWh = billRule ? billRule.bankWh : plainBankWh;
    const bankYear = buildBankYear(prodDays, consDays, LIFETIME_START_DATE, BANK_BASELINE_KWH * 1000,
      BANK_BASELINE_DATE, TRUE_UP_MONTH, BANKS_KWH_CREDITS, BILL_DAY);

    const todayProdRaw = rawProdDays[completeDays];
    const todayConsRaw = rawConsDays[completeDays];

    let serviceReq = false;
    try {
      const eventsUrl = `https://api.enphaseenergy.com/api/v4/systems/${SYSTEM_ID}/open_events?key=${API_KEY}`;
      const eventsReq = new Request(eventsUrl);
      eventsReq.headers = { "Authorization": `Bearer ${accessToken}` };
      recordCalls(1);
      const eventsData = await eventsReq.loadJSON();
      serviceReq = isServiceRequired(eventsData);
    } catch (e) {
      serviceReq = false;
    }

    const result = {
      avgNet30dWh,
      avgNetTrendWh,
      trendDaysUsed,
      avgProd30dWh,
      avgCons30dWh,
      lifetimeAvgConsWh,
      last7ProdWh,
      last30ProdWh,
      last30Gapless: prod30.length === 30 && prod30.every((v) => v > 0),
      serviceReq,
      estimatedBankWh,
      bankYear,
      trueUpMonth: TRUE_UP_MONTH,
      billDay: BILL_DAY,
      bankRule: {
        on: !!billRule,
        billDay: BILL_DAY,
        source: BILL_DAY_SOURCE,
        lastReset: billRule ? billRule.lastReset : null,
        plainWh: plainBankWh,
      },
      todayProdWhFromHistory: todayProdRaw !== undefined ? todayProdRaw : null,
      todayConsWhFromHistory: todayConsRaw !== undefined ? todayConsRaw : null,
      // Yesterday's whole-day totals, for the Today view's "ahead of yesterday at this time" colours.
      lastDayDate: (() => { const d = new Date(end); d.setDate(d.getDate() - 1); return dateStr(d); })(),
      lastDayProdWh: prodDays.length ? prodDays[prodDays.length - 1] : null,
      lastDayConsWh: consDays.length ? consDays[consDays.length - 1] : null,
      historyStartDate: LIFETIME_START_DATE,
      scriptVersion: SCRIPT_VERSION,
      bankBaselineKwh: BANK_BASELINE_KWH,
      bankBaselineDate: BANK_BASELINE_DATE,
      debugInfo,
    };
    saveHistoryCache(result);
    if (lastFail) writeStateKey("historyFail", null);
    return { data: result, fromCache: false, fetchedAt: now };
  } catch (e) {
    return historyFailure((e && e.message) ? e.message : String(e));
  }
}

// ===== UI CANVAS & DRAWING HELPERS =====

const GREEN = new Color("#4cae66");
const ORANGE = new Color("#c98a45");
// The worst states (Very Dirty, Service Req): a lighter red-orange, not a harsh red (Tim's preference).
const RED = new Color("#f2725f");
const GREY = new Color("#bcbcc0");

function netColor(wh) {
  if (wh === null || wh === undefined) return GREY;
  // Zero counts as green (Tim, 2026-10-15): breaking even is not a loss. Same on the small widget.
  return wh >= 0 ? GREEN : ORANGE;
}

// The 30-day trend line. The grey line is average consumption. The trend is green above it and orange
// below, split exactly where it crosses.
function renderLineSparkline(values, width, height, threshold, fallbackColor, markers, ticks) {
  if (!values || values.length < 2) return null;
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const hasThreshold = threshold !== null && threshold !== undefined;
  const rangeVals = hasThreshold ? values.concat([threshold]) : values;
  const maxVal = Math.max(...rangeVals);
  const minVal = Math.min(...rangeVals);
  const range = maxVal - minVal || 1;
  const padY = 2;
  const usableH = height - padY * 2;
  const stepX = width / (values.length - 1);
  const yFor = (v) => padY + (1 - (v - minVal) / range) * usableH;
  const toPoint = (v, i) => new Point(i * stepX, yFor(v));

  function strokeSeg(p0, p1, strokeColor) {
    const path = new Path();
    path.move(p0);
    path.addLine(p1);
    ctx.addPath(path);
    ctx.setStrokeColor(strokeColor);
    ctx.strokePath();
  }

  // Faint vertical lines under everything else.
  if (markers && markers.length) {
    ctx.setLineWidth(1);
    for (const k of markers) {
      const mx = Math.round(k * stepX) + 0.5;
      strokeSeg(new Point(mx, 0), new Point(mx, height), new Color("#ffffff", CHART_MARKER_ALPHA));
    }
  }

  // Small dots on the bottom edge (point numbers), same size and strength as on the bank chart.
  if (ticks && ticks.length) {
    ctx.setLineWidth(1);
    for (const k of ticks) {
      const tx = Math.round(k * stepX) + 0.5;
      strokeSeg(new Point(tx, height), new Point(tx, height - BANK_TICK_HEIGHT), new Color("#ffffff", BANK_TICK_ALPHA));
    }
  }

  if (hasThreshold) {
    const waterY = yFor(threshold);
    ctx.setLineWidth(1);

    if (Q2_DASHED_USE_LINE) {
      // Dashed like the reference lines on the other two charts.
      for (let dx = 0; dx < width; dx += 3.5) {
        strokeSeg(new Point(dx, waterY), new Point(Math.min(dx + 2, width), waterY), new Color("#ffffff", 0.3));
      }
    } else {
      strokeSeg(new Point(0, waterY), new Point(width, waterY), new Color("#8e8e93", 0.75));
    }
  }

  ctx.setLineWidth(1.5);
  for (let i = 0; i < values.length - 1; i++) {
    const v0 = values[i], v1 = values[i + 1];
    const p0 = toPoint(v0, i), p1 = toPoint(v1, i + 1);
    if (!hasThreshold || (v0 >= threshold) === (v1 >= threshold)) {
      strokeSeg(p0, p1, hasThreshold ? (v0 >= threshold ? GREEN : ORANGE) : fallbackColor);
    } else {
      const t = (threshold - v0) / (v1 - v0);
      const crossPt = new Point(p0.x + (p1.x - p0.x) * t, yFor(threshold));
      strokeSeg(p0, crossPt, v0 >= threshold ? GREEN : ORANGE);
      strokeSeg(crossPt, p1, v1 >= threshold ? GREEN : ORANGE);
    }
  }
  return ctx.getImage();
}

function renderMicroPowerBar(fillRatio, needleRatio, width, height) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  ctx.setFillColor(new Color("#333336"));
  ctx.fillRect(new Rect(0, 0, width, height));

  const clampedFillRatio = Math.max(0, Math.min(1, fillRatio));
  const fillW = width * clampedFillRatio;
  if (fillW > 0) {
    ctx.setFillColor(GREEN);
    ctx.fillRect(new Rect(0, 0, fillW, height));
  }

  const needleWidth = 2;
  const clampedNeedleRatio = Math.max(0, Math.min(1, needleRatio));
  const needleX = Math.min(width - needleWidth, width * clampedNeedleRatio);
  ctx.setFillColor(Color.white());
  ctx.fillRect(new Rect(Math.max(0, needleX), 0, needleWidth, height));

  return ctx.getImage();
}

// ===== ARRAY STATUS CHART =====

// The 24-hour power curve in the Array Status box. It is scaled to the expected ceiling, so its height
// means the same thing every day.
function renderMicroLineChart(hourlyKw, ceilingKw, width, height, currentKw, opts) {
  const smooth = !!(opts && opts.smooth);
  const fill = !!(opts && opts.fill);
  const skipZero = !!(opts && opts.skipZero);
  // Points before this index are not drawn (no data yet), so the line can start part way across.
  const firstIndex = (opts && Number.isInteger(opts.firstIndex) && opts.firstIndex > 0) ? opts.firstIndex : 0;
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const borderInset = 1;
  const plotX = borderInset;
  const plotY = borderInset;
  const plotW = width - borderInset * 2;
  const plotH = height - borderInset * 2;

  const n = hourlyKw.length;
  const stepX = plotW / (n - 1);
  const yFor = (kw) => {
    const ratio = Math.max(0, Math.min(1, kw / ceilingKw));
    return plotY + plotH * (1 - ratio);
  };
  const points = hourlyKw.map((kw, i) => new Point(plotX + i * stepX, yFor(kw)));

  function catmullRomControlPoints(p0, p1, p2, p3) {
    const cp1 = new Point(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6);
    const cp2 = new Point(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6);
    return [cp1, cp2];
  }

  function buildLinePath(pts, doSmooth) {
    const path = new Path();
    path.move(pts[0]);
    if (doSmooth && pts.length >= 3) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const [cp1, cp2] = catmullRomControlPoints(p0, p1, p2, p3);
        path.addCurve(p2, cp1, cp2);
      }
    } else {
      for (let i = 1; i < pts.length; i++) {
        path.addLine(pts[i]);
      }
    }
    return path;
  }

  function buildZeroSkipSegments() {
    const segments = [];
    let start = -1;
    for (let i = 0; i <= hourlyKw.length; i++) {
      const isPositive = i < hourlyKw.length && hourlyKw[i] > 0;
      if (isPositive && start === -1) {
        start = i;
      } else if (!isPositive && start !== -1) {
        const end = i - 1;
        const segStart = start > 0 ? start - 1 : start;
        const segEnd = end < hourlyKw.length - 1 ? end + 1 : end;
        const seg = [];
        for (let j = segStart; j <= segEnd; j++) seg.push(points[j]);
        segments.push(seg);
        start = -1;
      }
    }
    return segments;
  }

  // Marker lines (point numbers), drawn first so the curve sits on top.
  const markers = (opts && Array.isArray(opts.markers)) ? opts.markers : [];
  for (const mi of markers) {
    if (typeof mi !== "number" || !isFinite(mi) || mi < 0 || mi > n - 1) continue;
    const mx = plotX + mi * stepX;
    const markerPath = new Path();
    markerPath.move(new Point(mx, plotY));
    markerPath.addLine(new Point(mx, plotY + plotH));
    ctx.addPath(markerPath);
    ctx.setStrokeColor(new Color("#ffffff", CHART_MARKER_ALPHA));
    ctx.setLineWidth(1);
    ctx.strokePath();
  }

  ctx.setLineWidth(1);
  const ceilingPath = new Path();
  ceilingPath.move(new Point(plotX, plotY));
  ceilingPath.addLine(new Point(plotX + plotW, plotY));
  ctx.addPath(ceilingPath);
  ctx.setStrokeColor(new Color("#8e8e93", 0.55));
  ctx.strokePath();

  if (skipZero) {
    const segments = buildZeroSkipSegments();
    if (fill) {
      for (const seg of segments) {
        if (seg.length < 2) continue;
        const segFillPath = buildLinePath(seg, smooth);
        segFillPath.addLine(new Point(seg[seg.length - 1].x, plotY + plotH));
        segFillPath.addLine(new Point(seg[0].x, plotY + plotH));
        segFillPath.closeSubpath();
        ctx.addPath(segFillPath);
        ctx.setFillColor(new Color("#4cae66", 0.22));
        ctx.fillPath();
      }
    }
    for (const seg of segments) {
      if (seg.length < 2) {
        const dotR = 1;
        const dotPath = new Path();
        dotPath.addEllipse(new Rect(seg[0].x - dotR, seg[0].y - dotR, dotR * 2, dotR * 2));
        ctx.addPath(dotPath);
        ctx.setFillColor(GREEN);
        ctx.fillPath();
        continue;
      }
      const segLinePath = buildLinePath(seg, smooth);
      ctx.addPath(segLinePath);
      ctx.setStrokeColor(GREEN);
      ctx.setLineWidth(1.5);
      ctx.strokePath();
    }
  } else {
    const drawn = firstIndex > 0 ? points.slice(firstIndex) : points;
    if (fill) {
      const fillPath = buildLinePath(drawn, smooth);
      fillPath.addLine(new Point(drawn[drawn.length - 1].x, plotY + plotH));
      fillPath.addLine(new Point(drawn[0].x, plotY + plotH));
      fillPath.closeSubpath();
      ctx.addPath(fillPath);
      ctx.setFillColor(new Color("#4cae66", 0.22));
      ctx.fillPath();
    }
    const linePath = buildLinePath(drawn, smooth);
    ctx.addPath(linePath);
    ctx.setStrokeColor(GREEN);
    ctx.setLineWidth(1.5);
    ctx.strokePath();
  }

  // Yesterday's part of the curve (before the midnight point) faded: a rectangle of the widget's own background
  // colour laid over it, so the curve and its fill read as "not today". The midnight dot is drawn after, so it
  // stays bright.
  const dimBefore = (opts && typeof opts.dimBefore === "number" && isFinite(opts.dimBefore)) ? opts.dimBefore : null;
  const dimAlpha = (opts && typeof opts.dimAlpha === "number") ? opts.dimAlpha : 0;
  if (dimBefore !== null && dimAlpha > 0 && dimBefore > 0) {
    const dimW = Math.min(plotW, Math.max(0, dimBefore * stepX));
    const dimPath = new Path();
    dimPath.addRect(new Rect(plotX, plotY + 1, dimW, plotH - 1));
    ctx.addPath(dimPath);
    ctx.setFillColor(new Color("#1c1c1e", dimAlpha));
    ctx.fillPath();
  }

  if (typeof currentKw === "number" && currentKw > 0) {
    const nowRatio = ceilingKw > 0 ? Math.max(0, Math.min(1, currentKw / ceilingKw)) : 0;
    const nowYRaw = plotY + plotH * (1 - nowRatio);
    const edgeClearance = 2;
    const nowY = Math.min(Math.max(nowYRaw, plotY + edgeClearance), plotY + plotH - edgeClearance);
    const dashLen = 2;
    const gapLen = 1.5;
    ctx.setStrokeColor(new Color("#ffffff", 0.3));
    ctx.setLineWidth(1);
    for (let dx = plotX; dx < plotX + plotW; dx += dashLen + gapLen) {
      const segEnd = Math.min(dx + dashLen, plotX + plotW);
      const dashPath = new Path();
      dashPath.move(new Point(dx, nowY));
      dashPath.addLine(new Point(segEnd, nowY));
      ctx.addPath(dashPath);
      ctx.strokePath();
    }
  }

  const framePath = new Path();
  framePath.addRect(new Rect(plotX, plotY, plotW, plotH));
  ctx.addPath(framePath);
  ctx.setStrokeColor(new Color("#636366"));
  ctx.strokePath();

  const tickPos = (opts && Array.isArray(opts.ticks)) ? opts.ticks : [];
  for (const pos of tickPos) {
    if (pos < 0 || pos > n - 1) continue;
    const tx = plotX + pos * stepX;
    const tp = new Path();
    tp.move(new Point(tx, plotY + plotH));
    tp.addLine(new Point(tx, plotY + plotH - BANK_TICK_HEIGHT));
    ctx.addPath(tp);
    ctx.setStrokeColor(new Color("#ffffff", BANK_TICK_ALPHA));
    ctx.setLineWidth(1);
    ctx.strokePath();
  }

  return ctx.getImage();
}

function addDivider(w) {
  const line = w.addStack();
  line.layoutHorizontally();
  line.size = new Size(295, 1);
  line.backgroundColor = new Color("#333336");
  line.addSpacer(295);
}

// ===== PEAK DETECTOR & SOILING EVALUATION ENGINE =====
function freshPeakCache() {
  return {
    cacheVersion: PEAK_CACHE_VERSION,
    baselineKw: ARRAY_OBSERVED_MAX_KW,
    baselineSetAt: Date.now(),
    peaks: [],
    rejectedCount: 0,
    lastRejectedKw: null,
  };
}

function loadPeakCache() {
  const loaded = readStateKey("peak");
  if (!loaded) return freshPeakCache();
  if (loaded.cacheVersion !== PEAK_CACHE_VERSION) {
    return {
      cacheVersion: PEAK_CACHE_VERSION,
      baselineKw: typeof loaded.baselineKw === "number" ? loaded.baselineKw : ARRAY_OBSERVED_MAX_KW,
      baselineSetAt: loaded.baselineSetAt || Date.now(),
      peaks: [],
      rejectedCount: 0,
      lastRejectedKw: null,
    };
  }
  if (loaded.baselineKw === undefined || loaded.baselineKw === null) loaded.baselineKw = ARRAY_OBSERVED_MAX_KW;
  if (!loaded.baselineSetAt) loaded.baselineSetAt = Date.now();
  if (!Array.isArray(loaded.peaks)) loaded.peaks = [];
  if (loaded.rejectedCount === undefined) loaded.rejectedCount = 0;
  if (loaded.lastRejectedKw === undefined) loaded.lastRejectedKw = null;
  return loaded;
}

function savePeakCache(data) {
  data.cacheVersion = PEAK_CACHE_VERSION;
  writeStateKey("peak", data);
}

// Is today a clear day worth recording? Each test is explained with its constant near the top.
function evaluateGate1(now, maxKw, totalWh, weatherIcon, peakCache) {
  if (now.getHours() < PEAK_EVAL_AFTER_HOUR) return { admit: false, reason: "too early in the day" };
  if (!weatherIcon || typeof weatherIcon.weatherCode !== "number") return { admit: false, reason: "no weather data" };
  // A high peak can't be a false alarm, only low peaks can. So a peak at or above the saved highest (called P2
  // in the code) skips the weather test. It needs one saved peak. The energy test below still applies.
  let highPeakBypass = false;
  if (weatherIcon.weatherCode > GATE1_MAX_CLEAR_WEATHER_CODE) {
    const p2 = peakCache ? p2PeakKw(peakCache) : null;
    if (p2 === null || !(maxKw >= p2)) return { admit: false, reason: "weather not clear enough" };
    highPeakBypass = true;
  }
  if (!(maxKw > 0) || !(totalWh >= maxKw * GATE1_PSH_MULTIPLIER)) return { admit: false, reason: "energy ratio too low" };
  return { admit: true, reason: highPeakBypass ? "high peak, weather not clear" : "clear day" };
}

// Adds today's peak to the list (one entry per day, highest value wins) and drops the oldest past five.
function recordFifoPeak(peakCache, dateKey, peakKw, gate1) {
  if (!gate1.admit) return;
  if (peakKw > PEAK_SANITY_MAX_KW) {
    peakCache.rejectedCount = (peakCache.rejectedCount || 0) + 1;
    peakCache.lastRejectedKw = peakKw;
    return;
  }
  const existingIdx = peakCache.peaks.findIndex((p) => p.date === dateKey);
  if (existingIdx >= 0) {
    peakCache.peaks[existingIdx].peak = Math.max(peakCache.peaks[existingIdx].peak, peakKw);
  } else {
    peakCache.peaks.push({ date: dateKey, peak: peakKw });
  }
  peakCache.peaks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  while (peakCache.peaks.length > PEAK_FIFO_DEPTH) {
    peakCache.peaks.shift();
  }
}

// Highest of the saved peaks. (Named p2 because it was the second highest until 2026-10-19; the name is kept so
// every place that uses it stays the same.)
function p2PeakKw(peakCache) {
  if (!peakCache.peaks || peakCache.peaks.length < 1) return null;
  const sorted = peakCache.peaks.map((p) => p.peak).sort((a, b) => b - a);
  return sorted[0];
}

// The ceiling today: the baseline, faded for the time since it was set.
function expectedCeilingKw(peakCache) {
  if (peakCache.baselineKw === null) return null;
  const yearsElapsed = (Date.now() - peakCache.baselineSetAt) / (365.25 * 86400000);
  return peakCache.baselineKw * Math.pow(1 - PEAK_ANNUAL_DECAY_PCT / 100, yearsElapsed);
}

// If the array proves it can beat the ceiling, the ceiling moves up to match and the aging clock restarts.
function updatePeakBaseline(peakCache) {
  const p2 = p2PeakKw(peakCache);
  if (p2 === null) return;
  if (peakCache.baselineKw === null) {
    peakCache.baselineKw = Math.min(p2, NAMEPLATE_AC_CEILING_KW);
    peakCache.baselineSetAt = Date.now();
    return;
  }
  const expected = expectedCeilingKw(peakCache);
  if (expected !== null && p2 > expected) {
    peakCache.baselineKw = Math.min(p2, NAMEPLATE_AC_CEILING_KW);
    peakCache.baselineSetAt = Date.now();
  }
}

// Cosine of the angle between the midday sun and a line straight out of the panel, from the latitude,
// the tilt and the date. 1.0 means the sun is square on to the panel.
function getSolarNoonIncidentCos(latDeg, tiltDeg, date) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  const declination = 23.44 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));
  const solarNoonElevation = 90 - Math.abs(latDeg - declination);
  const incidentAngle = Math.abs((solarNoonElevation + tiltDeg) - 90);
  return Math.cos(incidentAngle * (Math.PI / 180));
}

function locationKnown() {
  if (!WEATHER_ZIP && !HAS_TYPED_COORDS) return false;
  const geo = readStateKey("geo");
  return !!(geo && typeof geo.latitude === "number");
}

// True when the sun is high enough to judge the panels. With no tilt or location it is always true.
function gate2Active(date) {
  if (PANEL_TILT_DEG === null || PANEL_TILT_DEG === undefined) return true;
  const geo = readStateKey("geo");
  if (!geo || typeof geo.latitude !== "number") return true;
  const cosTheta = getSolarNoonIncidentCos(geo.latitude, PANEL_TILT_DEG, date);
  return cosTheta >= GATE2_COS_CUTOFF;
}

// The number and verdict for the Array Status box. Until five clear days are saved it shows the entered
// maximum as "Max kW" with the plain "Array Status" heading, so a new install never starts with a false alarm.
function computePeakStats(peakCache, now) {
  const daysRecorded = peakCache.peaks.length;
  const ceilingKw = expectedCeilingKw(peakCache);

  if (!gate2Active(now)) {
    const heldKw = (peakCache.peaks.length >= PEAK_FIFO_DEPTH) ? p2PeakKw(peakCache) : peakCache.baselineKw;
    return {
      observedPeakKw: (typeof heldKw === "number" && heldKw > 0) ? heldKw : null,
      ceilingKw,
      daysRecorded,
      status: { word: "Winter Sun", color: GREY, pctUnder: null },
    };
  }

  const p2 = (peakCache.peaks.length >= PEAK_FIFO_DEPTH) ? p2PeakKw(peakCache) : null;
  if (p2 === null) {
    return {
      observedPeakKw: peakCache.baselineKw,
      ceilingKw,
      daysRecorded,
      status: { word: "Clean", color: GREEN, pctUnder: 0 },
    };
  }

  if (ceilingKw === null || ceilingKw === 0) {
    return { observedPeakKw: p2, ceilingKw, daysRecorded, status: { word: "--", color: GREY, pctUnder: null } };
  }

  // No ZIP code and no latitude and longitude means no location, so the Winter Sun check cannot run and a low winter sun would look like
  // dirt. Better to give no verdict than a wrong one.
  if (!locationKnown()) {
    return { observedPeakKw: p2, ceilingKw, daysRecorded, status: { word: "Clean", color: GREEN, pctUnder: null } };
  }

  const pctUnder = ((ceilingKw - p2) / ceilingKw) * 100;
  const status = pctUnder >= PEAK_RED_PCT
    ? { word: "Very Dirty", color: RED, pctUnder }
    : pctUnder >= PEAK_ORANGE_PCT
    ? { word: "Dirty", color: ORANGE, pctUnder }
    : { word: "Clean", color: GREEN, pctUnder };

  return { observedPeakKw: p2, ceilingKw, daysRecorded, status };
}

// ===== WIDGET VIEW CONSTRUCTION =====
// True in daylight when current power is at least SUN_ICON_PEAK_RATIO of the expected peak.
function arrayProvesSun(weatherIcon, currentKw, ceilingKw) {
  const ceiling = (typeof ceilingKw === "number" && ceilingKw > 0) ? ceilingKw : ARRAY_OBSERVED_MAX_KW;
  return !!(weatherIcon && weatherIcon.isDay && typeof currentKw === "number" && ceiling > 0 && (currentKw / ceiling) >= SUN_ICON_PEAK_RATIO);
}

// Turns Enphase's raw error text into one plain sentence saying what to do.
function plainProblemHint(text) {
  const t = String(text || "").toLowerCase();
  if (/offline|network|timed out|connection|could not connect|hostname/.test(t)) return "No connection just now. The widget will try again on its own.";
  if (/401|403|not authori|scope/.test(t)) {
    return "Enphase refused the request. Check that every Access Control box is ticked on your Enphase application." +
      (/consumption_meter/.test(t) && !/production_meter/.test(t) ? " No consumption meters? Run setup and switch off \"Enphase shows consumption\"." : "");
  }
  if (/429|too many|rate limit|quota/.test(t)) return "Enphase is busy or the request limit was reached. The widget will try again on its own.";
  if (/consumption/.test(t)) return "Enphase returned no consumption data. If your system has no consumption meters, run setup and switch off \"Enphase shows consumption\".";
  if (/no intervals|keys:/.test(t)) return "Enphase returned no readings for this system. Check the System ID and turn-on date in setup.";
  if (/50\d|server/.test(t)) return "Enphase had a problem on its side. The widget will try again on its own.";
  return "Open Scriptable and run the widget script for a full report.";
}

// ===== LOCK SCREEN WIDGET =====

// The same script draws a small Lock Screen widget (wide size): today's production, peak and net,
// counted from midnight. It uses numbers already saved, so a second widget adds no Enphase requests.
function lockTileTexts(rd, nowMs) {
  if (!rd || !rd.prod || !rd.cons) return null;
  const num = (v) => (typeof v === "number" && isFinite(v));
  // Zero from midnight until the first fetch of the day (see prodTodayWh).
  const prodKnown = num(rd.prod.sinceCutoffWh);
  const prodWh = prodTodayWh(rd, nowMs);
  const beforeNoon = prodWh === 0 && !prodKnown;
  // Today's peak not known yet? Show the high of the last 24 hours. A real number beats "--" on a Lock Screen.
  const peakKw = num(rd.prod.sinceCutoffMaxKw) ? rd.prod.sinceCutoffMaxKw
    : ((!prodKnown && beforeNoon) ? 0 : (num(rd.prod.maxKw) ? rd.prod.maxKw : null));
  const consWh = num(rd.cons.sinceCutoffWh) ? rd.cons.sinceCutoffWh : null;
  const netWh = (prodWh !== null && consWh !== null) ? prodWh - consWh : null;

  let netText = "--";
  if (netWh !== null) {
    const mag = kwh(Math.abs(netWh));
    netText = (mag === "0" ? "" : (netWh > 0 ? "+" : "-")) + mag;
  }
  // The time is the end of the newest reading, not the time of this run.
  const consFetchedAtMs = rd.consFetchedAt || rd.fetchedAt || 0;
  const asOfMs = ((rd.prodFetchedAt || 0) >= consFetchedAtMs) ? rd.prod.lastEndMs : rd.cons.lastEndMs;
  let timeText = "";
  if (num(asOfMs) && asOfMs > 0) {
    const d = new Date(asOfMs);
    const f = new DateFormatter();
    f.dateFormat = "h:mm";
    // "2:15p", not "2:15 PM": the Lock Screen widget is only about 143 points wide.
    timeText = f.string(d) + (d.getHours() >= 12 ? "p" : "a");
  }
  return {
    // Numbers only. The units are drawn separately, smaller, so the numbers can all stay one size.
    today: prodWh !== null ? kwh(prodWh) : "--",
    peak: peakKw !== null ? (peakKw > 0 ? peakKw.toFixed(1) : "0") : "--",
    net: netText,
    time: timeText,
  };
}

// Sizes were settled on a real Lock Screen with the widest numbers. Scriptable's preview is wider than
// the real one (about 143 points), so it cannot be trusted for fit.
function lockLine(parent, label, value, unit, size) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  // Fixed-width label so the three values line up under each other.
  const labelBox = row.addStack();
  labelBox.size = new Size(LOCK_LABEL_WIDTH, 0);
  const l = labelBox.addText(label);
  l.font = Font.systemFont(12);
  l.textColor = Color.white();
  l.textOpacity = 0.7;
  l.lineLimit = 1;
  l.minimumScaleFactor = 0.8;
  labelBox.addSpacer();
  // The three numbers share one size that is picked to fit (see lockValueSize), because iOS shrinks each
  // line separately and that left them at three slightly different sizes. The small shrink allowed here
  // is only a safety net: a slightly smaller number beats one cut off as "+...".
  const v = row.addText(value);
  v.font = Font.boldSystemFont(size);
  v.textColor = Color.white();
  v.lineLimit = 1;
  v.minimumScaleFactor = 0.8;
  row.addSpacer(2);
  // The unit is small and plain, which leaves room for the number. If a line ever runs out of room, the
  // unit is the part that gives.
  const u = row.addText(unit);
  u.font = Font.systemFont(10);
  u.textColor = Color.white();
  u.lineLimit = 1;
  u.minimumScaleFactor = 0.7;
}

// Width of the label column, and the room left on a line for the number, the gap and the unit. Both were
// settled on a real Lock Screen, which is narrower than Scriptable's preview: "+12 kWh" at 14 points was
// cut off as "+..." when the label column was 44 wide, and at 52 here "+4.7 kWh" pushed the time to "12:0...".
const LOCK_LABEL_WIDTH = 38;
const LOCK_VALUE_ROOM = 49.5;

// Rough width of a bold number at a font size. Digits are all one width; the signs and the point are not.
function lockTextWidth(text, size) {
  let em = 0;
  for (const ch of String(text)) {
    em += ch === "." ? 0.3 : ch === "-" ? 0.46 : 0.64;
  }
  return em * size;
}

// One size for all three numbers: the largest at which the widest line still fits, unit included.
function lockValueSize(tx) {
  const lines = [[tx.today, 22.5], [tx.peak, 16.8], [tx.net, 22.5]];
  for (const size of [14, 13, 12, 11]) {
    if (lines.every(([text, unitWidth]) => lockTextWidth(text, size) + unitWidth <= LOCK_VALUE_ROOM)) return size;
  }
  return 11;
}

// A two-line message on the Lock Screen, for when there are no numbers to show.
function createLockNote(line1, line2) {
  const tile = new ListWidget();
  tile.setPadding(0, 0, 0, 0);
  tile.spacing = 1;
  const a = tile.addText(line1);
  a.font = Font.boldSystemFont(13);
  a.textColor = Color.white();
  a.lineLimit = 1;
  a.minimumScaleFactor = 0.75;
  if (line2) {
    const b = tile.addText(line2);
    b.font = Font.systemFont(11);
    b.textColor = Color.white();
    b.textOpacity = 0.7;
    b.lineLimit = 1;
    b.minimumScaleFactor = 0.75;
  }
  return tile;
}

// A thin bar on the left (so the numbers don't float), the three lines, then the time with the weather
// icon under it. tx is { today, peak, net, time }; iconName is an SF Symbol name, or null for no icon.
function drawLockTile(tx, iconName) {
  const tile = new ListWidget();
  // iOS tints the whole thing, so no colour and no background.
  tile.setPadding(0, 0, 0, 0);
  const outer = tile.addStack();
  outer.layoutHorizontally();
  outer.topAlignContent();
  const bar = outer.addStack();
  bar.size = new Size(3, 48);
  bar.backgroundColor = Color.white();
  bar.cornerRadius = 1.5;
  outer.addSpacer(4);
  const col = outer.addStack();
  col.layoutVertically();
  col.spacing = 1;
  const size = lockValueSize(tx);
  lockLine(col, "Today", tx.today, "kWh", size);
  lockLine(col, "Peak", tx.peak, "kW", size);
  lockLine(col, "Net", tx.net, "kWh", size);
  outer.addSpacer();
  const right = outer.addStack();
  right.layoutVertically();
  // Fixed width. Left to size itself, this column squeezed the numbers to "7.4...".
  // 34 wide with the time at 9 points: at 36 and 10 points "12:30p" was cut off on a real phone.
  right.size = new Size(34, 0);
  const timeRow = right.addStack();
  timeRow.layoutHorizontally();
  timeRow.addSpacer();
  const tm = timeRow.addText(tx.time || "");
  // Full brightness: at 70% the time was unreadable on a light wallpaper.
  tm.font = Font.mediumSystemFont(9);
  tm.textColor = Color.white();
  tm.lineLimit = 1;
  tm.minimumScaleFactor = 0.65;
  if (iconName) {
    right.addSpacer(5);
    const iconRow = right.addStack();
    iconRow.layoutHorizontally();
    iconRow.addSpacer();
    const sym = SFSymbol.named(iconName);
    sym.applyFont(Font.systemFont(18));
    const img = iconRow.addImage(sym.image);
    img.imageSize = new Size(20, 20);
    img.tintColor = Color.white();
  }
  return tile;
}

// Same icon as the Home Screen, as an outline (the name without ".fill"). In one tint an outline reads better.
function lockIconName(weatherIcon, rd, peakStats) {
  if (!weatherIcon || !weatherIcon.symbolName) return null;
  const kwNow = (rd && rd.prod && typeof rd.prod.latestKw === "number") ? rd.prod.latestKw : null;
  const filled = arrayProvesSun(weatherIcon, kwNow, peakStats ? peakStats.ceilingKw : null)
    ? weatherSymbolName("clear", true)
    : weatherIcon.symbolName;
  return filled.replace(/\.fill$/, "");
}

function createLockTile(rollingResult, weatherIcon, peakStats) {
  const rd = rollingResult && rollingResult.data ? rollingResult.data : null;
  const tx = lockTileTexts(rd, Date.now());
  if (!tx) return createLockNote("No solar data yet", "Run it in Scriptable");
  return drawLockTile(tx, lockIconName(weatherIcon, rd, peakStats));
}

// Draws the Home Screen widget from the data it is handed. It makes no requests, so made-up numbers work too.
async function createWidget(rollingResult, historyResult, peakStats, weatherIcon) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#1c1c1e");
  w.setPadding(10, 12, 8, 12);

  const outerH = w.addStack();
  outerH.layoutHorizontally();
  outerH.addSpacer(9);
  const body = outerH.addStack();
  body.layoutVertically();

  const rd = rollingResult && rollingResult.data ? rollingResult.data : null;
  const hd = historyResult && historyResult.data ? historyResult.data : {};
  const pd = peakStats || { observedPeakKw: null, ceilingKw: null, status: { word: "--", color: GREY, pctUnder: null } };

  // Data missing: show a plain error screen. Error text squeezed into the normal layout gets cut off.
  const rollingProblem = !rd || !rd.cons || !rd.prod;
  const historyProblem = (historyResult && historyResult.error) || hd.debugInfo || !historyResult;
  if (rollingProblem || historyProblem) {
    const errTitle = body.addText(WIDGET_TITLE);
    errTitle.font = Font.mediumSystemFont(13);
    errTitle.textColor = new Color("#a8a8ad");
    body.addSpacer(6);
    const parts = [];
    if (rollingProblem) parts.push(`24h: ${rollingResult ? rollingResult.fetchError : "no result"}`);
    if (historyProblem) {
      parts.push(historyResult
        ? `history: ${historyResult.error ? historyResult.error : hd.debugInfo}`
        : "history: no result");
    }
    const rawText = parts.join(" | ");
    const errHead = body.addText("No data from Enphase yet");
    errHead.font = Font.mediumSystemFont(14);
    errHead.textColor = Color.orange();
    body.addSpacer(3);
    const errHint = body.addText(plainProblemHint(rawText));
    errHint.font = Font.systemFont(10);
    errHint.textColor = GREY;
    body.addSpacer(3);
    // One line of the raw text is enough here. The full text is in the debug report.
    const errRaw = body.addText("Run the widget in Scriptable for the full report.");
    errRaw.font = Font.systemFont(8);
    errRaw.textColor = new Color("#8e8e93");
    errRaw.lineLimit = 1;
    return w;
  }

  const prodSinceMidnightWh = prodTodayWh(rd, Date.now());
  const consSinceMidnightWh = (rd.cons && typeof rd.cons.sinceCutoffWh === "number") ? rd.cons.sinceCutoffWh : null;
  // Today view (Parameter "today"): the top-left numbers count from midnight. If they can't be worked out yet,
  // the past 24 hours are shown, with their own heading.
  const showToday = VIEW_TODAY && prodSinceMidnightWh !== null && consSinceMidnightWh !== null;
  const todayProducedWh = showToday ? prodSinceMidnightWh : rd.prod.totalWh;
  const todayConsumedWh = showToday ? consSinceMidnightWh : rd.cons.totalWh;
  const rollingNetWh = todayProducedWh - todayConsumedWh;
  const currentProdKw = (rd.prod && typeof rd.prod.latestKw === "number") ? rd.prod.latestKw : null;
  const todayCalendarNetWh = (prodSinceMidnightWh !== null && consSinceMidnightWh !== null)
    ? prodSinceMidnightWh - consSinceMidnightWh
    : null;

  const consFetchedAtMs = rd.consFetchedAt || rd.fetchedAt || 0;
  // The time shown is the end of the newest reading, not the time of this run.
  const asOfMs = ((rd.prodFetchedAt || 0) >= consFetchedAtMs) ? rd.prod.lastEndMs : rd.cons.lastEndMs;

  const titleRow = body.addStack();
  titleRow.layoutHorizontally();
  titleRow.centerAlignContent();
  titleRow.size = new Size(295, 0);
  titleRow.addSpacer(0);

  if (weatherIcon) {
    const iconStack = titleRow.addStack();
    iconStack.layoutVertically();
    iconStack.topAlignContent();

    // The forecast covers the area, not this roof. If the array is near its peak, the sky over it is clear,
    // so show the sun. This only ever corrects toward sunny.
    const isPeakSun = arrayProvesSun(weatherIcon, currentProdKw, pd.ceilingKw);
    const weatherSymbol = SFSymbol.named(isPeakSun ? weatherSymbolName("clear", true) : weatherIcon.symbolName);
    weatherSymbol.applyFont(Font.systemFont(17));
    const weatherIconWidget = iconStack.addImage(weatherSymbol.image);
    weatherIconWidget.imageSize = new Size(20, 20);
    weatherIconWidget.tintColor = new Color(isPeakSun ? "#ffd60a" : weatherIcon.colorHex);

    titleRow.addSpacer(8);
  }
  const title = titleRow.addText(WIDGET_TITLE);
  title.font = Font.mediumSystemFont(17);
  title.textColor = new Color("#a8a8ad");
  titleRow.addSpacer();
  const tf = new DateFormatter();
  tf.dateFormat = "MMM d, h:mm a";
  const stamp = titleRow.addText(tf.string(new Date(asOfMs)));
  stamp.font = Font.systemFont(9);
  stamp.textColor = (rollingResult.fetchError || (historyResult && historyResult.fetchError) || readingIsStale(rd, weatherIcon, Date.now())) ? ORANGE : GREY;
  body.addSpacer(4);

  const avgNet30dWh = hd.avgNet30dWh ?? null;
  const avgProd30dWh = hd.avgProd30dWh ?? null;
  const last7ProdWh = hd.last7ProdWh ?? [];
  const last30ProdWh = hd.last30ProdWh ?? [];
  const estimatedBankWh = hd.estimatedBankWh ?? null;

  const useThreshold = hd.avgCons30dWh ?? null;

  // The saved bank stops at yesterday. Add today's net so it moves through the day and the night.
  const liveBankWh = (estimatedBankWh !== null && todayCalendarNetWh !== null)
    ? estimatedBankWh + todayCalendarNetWh
    : estimatedBankWh;

  const topRow = body.addStack();
  topRow.layoutHorizontally();
  body.addSpacer(2);
  addDivider(body);
  body.addSpacer(3);
  const bottomRow = body.addStack();
  bottomRow.layoutHorizontally();
  // Where the four boxes sit: top-left, top-right, bottom-left, bottom-right.
  const q4Order = ["today", "trend", "life", "bank"];
  const q4Slots = {};
  const q4Pair = (row, a, b, dividerH) => {
    q4Slots[a] = row.addStack();
    row.addSpacer(14);
    const vd = row.addStack();
    vd.size = new Size(1, dividerH);
    vd.backgroundColor = new Color("#333336");
    row.addSpacer(14);
    q4Slots[b] = row.addStack();
  };
  q4Pair(topRow, q4Order[0], q4Order[1], 50);
  q4Pair(bottomRow, q4Order[2], q4Order[3], 52);

  const todayCol = q4Slots.today;
  todayCol.layoutVertically();
  // Columns do not share a row's width on their own. Each of the four boxes gets the same fixed width.
  todayCol.size = new Size(133, 0);

  // Drawn like the small widget: heading "Prod 24h", Prod big on the left (the hero number, larger than the
  // other three boxes), Cons (or Exp and Imp) and Net on the right in fixed-width boxes. No unit under Prod:
  // it crowded the box, and the other boxes already say kWh.
  const todayLbl = todayCol.addText(showToday ? "Prod Today" : "Prod 24h");
  todayLbl.font = Font.systemFont(9);
  todayLbl.textColor = GREY;
  todayCol.addSpacer(0);

  const avgProdThreshold = avgProd30dWh ? Math.round(avgProd30dWh / 1000) : null;
  const avgConsThreshold = useThreshold ? Math.round(useThreshold / 1000) : null;
  const prodValNum = Math.round(todayProducedWh / 1000);
  const consValNum = Math.round(todayConsumedWh / 1000);
  // Today view: against this time yesterday, not a whole day's average (see TODAY_NEUTRAL).
  const vsY = showToday ? todayVsYesterday(rd, hd, Date.now()) : null;
  const prodColor = showToday
    ? (vsY ? (todayProducedWh >= vsY.prodWh ? GREEN : ORANGE) : TODAY_NEUTRAL)
    : (avgProdThreshold === null) ? GREY : (prodValNum < avgProdThreshold ? ORANGE : GREEN);
  const consColor = showToday
    ? (vsY ? (todayConsumedWh <= vsY.consWh ? GREEN : ORANGE) : TODAY_NEUTRAL)
    : (avgConsThreshold === null) ? GREY : (consValNum > avgConsThreshold ? ORANGE : GREEN);

  const gridFlow = SHOW_EXPORTED_IMPORTED ? gridFlowWh(rd, Date.now(), showToday ? localMidnightMs(new Date()) : undefined) : null;
  const q1ProdKwh = Number(kwh(todayProducedWh));
  const q1ConsKwh = Number(kwh(todayConsumedWh));
  const q1NetKwh = gridFlow
    ? (Math.round(Number(kwh(gridFlow.exportedWh)) - Number(kwh(gridFlow.importedWh))) || 0)
    : (isFinite(q1ProdKwh) && isFinite(q1ConsKwh))
    ? (Math.round(q1ProdKwh - q1ConsKwh) || 0)
    : Math.round(rollingNetWh / 1000);

  // Same widths as the small widget, which were tried on the phone up to Prod 250 and Net -110.
  const Q1_VAL_W = 37;
  const Q1_LABEL_W = 29;
  const Q1_RIGHT_W = Q1_VAL_W + 4 + Q1_LABEL_W;
  const Q1_PROD_W = 133 - Q1_RIGHT_W;

  const todayRow = todayCol.addStack();
  todayRow.layoutHorizontally();
  todayRow.centerAlignContent();
  const q1ProdCol = todayRow.addStack();
  q1ProdCol.layoutVertically();
  q1ProdCol.size = new Size(Q1_PROD_W, 0);
  const todayProdVal = q1ProdCol.addText(kwh(todayProducedWh));
  todayProdVal.font = Font.boldSystemFont(MEDIUM_PROD_SIZE);
  todayProdVal.textColor = prodColor;
  todayProdVal.lineLimit = 1;
  const q1RightCol = todayRow.addStack();
  q1RightCol.layoutVertically();
  q1RightCol.size = new Size(Q1_RIGHT_W, 0);
  const q1Line = (valueText, label, color) => {
    const line = q1RightCol.addStack();
    line.layoutHorizontally();
    line.bottomAlignContent();
    const valBox = line.addStack();
    valBox.size = new Size(Q1_VAL_W, 0);
    valBox.addSpacer();
    const v = valBox.addText(valueText);
    v.font = Font.mediumSystemFont(12);
    v.textColor = color;
    v.lineLimit = 1;
    // 4 pt between the number and its label (2 looked cramped); the label box stays 29 (27 cut "Cons" off).
    line.addSpacer(4);
    const lblBox = line.addStack();
    lblBox.size = new Size(Q1_LABEL_W, 0);
    const u = lblBox.addText(label);
    u.font = Font.systemFont(8);
    u.textColor = GREY;
    u.lineLimit = 1;
    lblBox.addSpacer();
  };
  if (gridFlow) {
    q1Line(kwh(gridFlow.exportedWh), "Exp", GREEN);
    q1Line(kwh(gridFlow.importedWh), "Imp", ORANGE);
    q1Line(String(q1NetKwh), "Net", netColor(q1NetKwh));
  } else {
    q1Line(kwh(todayConsumedWh), "Cons", consColor);
    q1RightCol.addSpacer(2);
    q1Line(String(q1NetKwh), "Net", netColor(q1NetKwh));
  }

  todayCol.centerAlignContent();

  const trendCol = q4Slots.trend;
  trendCol.layoutVertically();
  trendCol.size = new Size(133, 0);

  const trendLbl = trendCol.addText("30d Prod vs Use");
  trendLbl.font = Font.systemFont(9);
  trendLbl.textColor = GREY;
  trendCol.addSpacer(2);

  // Number with "kWh/d" under it on the left; the 30-day line framed in a 58 x 24 box on the right, like the
  // charts in the bottom row. The line stays two-coloured: green on days at or above average use, orange below.
  const trendRow = trendCol.addStack();
  trendRow.layoutHorizontally();
  trendRow.centerAlignContent();

  const aboveUse = (avgProd30dWh !== null && useThreshold !== null)
    ? (Math.round(avgProd30dWh / 1000) >= Math.round(useThreshold / 1000) ? GREEN : ORANGE)
    : GREY;

  const trendValText = kwh(avgProd30dWh);
  const trendNumVal = avgProd30dWh !== null ? Math.round(avgProd30dWh / 1000) : 0;
  // Text that does not fit is cut off silently, so long numbers drop to a smaller size.
  const trendNeedsShrink = trendValText.length >= 4 || trendNumVal >= 200;
  const trendNumCol = trendRow.addStack();
  trendNumCol.layoutVertically();
  const trendVal = trendNumCol.addText(trendValText);
  trendVal.font = Font.boldSystemFont(trendNeedsShrink ? 18 : 22);
  trendVal.textColor = aboveUse;
  trendVal.lineLimit = 1;
  const trendUnit = trendNumCol.addText("kWh/d");
  trendUnit.font = Font.systemFont(9);
  trendUnit.textColor = GREY;
  trendRow.addSpacer();

  const monthDots = Q2_MONTH_DOT ? monthStartIndexes(last30ProdWh.length, historyResult && historyResult.fetchedAt, hd.last30Gapless) : [];
  const miniSpark = renderLineSparkline(last30ProdWh, 56, 22, useThreshold, aboveUse, [], monthDots);
  if (miniSpark) {
    const framed = new DrawContext();
    framed.size = new Size(58, 24);
    framed.opaque = false;
    framed.respectScreenScale = true;
    framed.drawImageInRect(miniSpark, new Rect(1, 1, 56, 22));
    const sparkFrame = new Path();
    sparkFrame.addRect(new Rect(1, 1, 56, 22));
    framed.addPath(sparkFrame);
    framed.setStrokeColor(new Color("#636366"));
    framed.setLineWidth(1);
    framed.strokePath();
    const miniSparkWidget = trendRow.addImage(framed.getImage());
    miniSparkWidget.imageSize = new Size(58, 24);
  }

  trendCol.centerAlignContent();
  topRow.centerAlignContent();

  const bankCol = q4Slots.bank;
  bankCol.layoutVertically();
  bankCol.size = new Size(133, 0);

  // Net comes from Prod and Cons as shown, so the three always agree (never "117 Prod, 118 Cons, 0 Net").
  // When Exported and Imported are the numbers on show, Net is their difference, for the same reason.
  const shownProdKwh = Number(kwh(todayProducedWh));
  const shownConsKwh = Number(kwh(todayConsumedWh));
  const shownNetKwh = gridFlow
    ? (Math.round(Number(kwh(gridFlow.exportedWh)) - Number(kwh(gridFlow.importedWh))) || 0)
    : (isFinite(shownProdKwh) && isFinite(shownConsKwh))
    ? (Math.round(shownProdKwh - shownConsKwh) || 0)
    : Math.round(rollingNetWh / 1000);
  // Bank chart layout only when the setting is on and there is a line to draw; otherwise the original layout.
  const bankChart = SHOW_BANK_CHART ? bankChartInputs(hd.bankYear, liveBankWh) : null;
  // With the bank chart on, the label rows and chart rows of both bottom boxes get the same fixed heights, so
  // the two small charts sit at exactly the same height side by side. Each chart is centred in its row,
  // and the rows otherwise differ (one line of big number on the left, two lines on the right).
  const BOTTOM_LABEL_ROW_H = 12;
  const BOTTOM_CHART_ROW_H = 38;

  const bankLblRow = bankCol.addStack();
  if (bankChart) bankLblRow.size = new Size(0, BOTTOM_LABEL_ROW_H);
  bankLblRow.layoutHorizontally();
  bankLblRow.centerAlignContent();
  let bankLabelText = liveBankWh !== null && liveBankWh < 0 ? "Credit Deficit" : "Banked Credits";
  if (!BANKS_KWH_CREDITS) {
    const sinceParts = String(BANK_BASELINE_DATE || "").split("-").map(Number);
    const sinceFmt = new DateFormatter();
    sinceFmt.dateFormat = "MMM d";
    bankLabelText = sinceParts.length === 3 && sinceParts.every((n) => n > 0)
      ? `Net Since ${sinceFmt.string(new Date(sinceParts[0], sinceParts[1] - 1, sinceParts[2]))}`
      : "Net Energy";
  }
  const bankLbl = bankLblRow.addText(bankLabelText);
  // No trend mark beside the label (widget 1255): the 12-month bank chart already shows which way it is going.
  bankLbl.font = Font.systemFont(9);
  bankLbl.textColor = GREY;

  if (bankChart) {
    // Net is in the top-left box (widget 1255), so this row holds only the label.
    bankLblRow.addSpacer();
    bankCol.addSpacer(4);

    const bankRow = bankCol.addStack();
    bankRow.layoutHorizontally();
    bankRow.centerAlignContent();
    bankRow.size = new Size(0, BOTTOM_CHART_ROW_H);
    // 22, the same as the Prod and 30-day numbers; smaller only for five characters or more. No
    // shrink-to-fit: beside a flexible gap iOS shrinks or cuts text even when it fits.
    const bankValText = kwh(liveBankWh, true);
    const bankNumCol = bankRow.addStack();
    bankNumCol.layoutVertically();
    const bankVal = bankNumCol.addText(bankValText);
    bankVal.font = Font.boldSystemFont(bankValText.length <= 4 ? 22 : (bankValText.length === 5 ? 20 : 17));
    bankVal.textColor = netColor(liveBankWh);
    bankVal.lineLimit = 1;
    const bankUnit = bankNumCol.addText("kWh");
    bankUnit.font = Font.systemFont(9);
    bankUnit.textColor = GREY;
    bankRow.addSpacer();
    // Top of the box: the highest balance in the last 12 months. Dotted line: today's balance, so it meets
    // the right end of the line. Below zero, the floor drops so a deficit still fits.
    const bankChartImg = renderMicroLineChart(bankChart.values, bankChart.ceiling, 58, 24, bankChart.now,
      { smooth: true, fill: true, firstIndex: bankChart.firstIndex,
        ticks: bankChartQuarterTicks(bankChart.values.length, Date.now()) });
    const bankChartWidget = bankRow.addImage(bankChartImg);
    bankChartWidget.imageSize = new Size(58, 24);
  } else {
    // Original layout: the bank number with today's Net beside it.
    bankCol.addSpacer(0);
    const bankRow = bankCol.addStack();
    bankRow.layoutHorizontally();
    bankRow.centerAlignContent();

    const bankValText = kwh(liveBankWh, true);
    const bankVal = bankRow.addText(bankValText);
    bankVal.font = Font.boldSystemFont(bankValText.length >= 5 ? 22 : 26);
    bankVal.textColor = netColor(liveBankWh);

    bankRow.addSpacer(6);

    const storedSubCol = bankRow.addStack();
    storedSubCol.layoutHorizontally();
    storedSubCol.topAlignContent();
    const storedVal = storedSubCol.addText(String(shownNetKwh));
    storedVal.font = Font.mediumSystemFont(14);
    storedVal.textColor = netColor(shownNetKwh);
    storedSubCol.addSpacer(3);
    const storedLbl = storedSubCol.addText("Net");
    storedLbl.font = Font.systemFont(9);
    storedLbl.textColor = GREY;
  }

  bankCol.centerAlignContent();

  const lifeCol = q4Slots.life;
  lifeCol.layoutVertically();
  lifeCol.size = new Size(133, 0);

  // The heading names the array's condition when something is off ("Array Dirty", "Service Required"), in
  // the status colour; otherwise "Array Status". The line under the number always reads "Max kW".
  const serviceReqActive = hd.serviceReq === true;
  const peakIsNeutral = !serviceReqActive &&
    (pd.status.word === "Clean" || pd.status.word === "--" || pd.status.word === "Winter Sun");
  const peakStatusDisplayColor = serviceReqActive ? RED : pd.status.color;
  const arrayHeading = serviceReqActive ? "Service Required"
    : pd.status.word === "Very Dirty" ? "Array Very Dirty"
    : pd.status.word === "Dirty" ? "Array Dirty"
    : pd.status.word === "Winter Sun" ? "Winter Sun"
    : "Array Status";

  const lifeHead = lifeCol.addStack();
  if (bankChart) lifeHead.size = new Size(0, BOTTOM_LABEL_ROW_H);
  lifeHead.layoutHorizontally();
  lifeHead.bottomAlignContent();
  // Same as the bank label row beside it, so the two headings line up.
  if (bankChart) lifeHead.centerAlignContent();
  // "Status: [word] [today's kWh]". No word on a normal day ("Status: 101 kWh"); "Winter" in winter-sun months;
  // "Dirty" for Dirty and Very Dirty (orange or red shows how bad); "Service Required" stands alone with no figure.
  // Today's kWh is green or orange against production up to this time yesterday (green until yesterday's totals are saved, TODAY_NEUTRAL),
  // and takes the status colour on Dirty days so the whole line is one colour. The longest line is 24 characters, which fits.
  const q4Winter = !serviceReqActive && pd.status.word === "Winter Sun";
  const q4Normal = !serviceReqActive && (pd.status.word === "Clean" || pd.status.word === "--");
  const q4Fault = !serviceReqActive && !q4Winter && !q4Normal;
  const q4TodayText = prodSinceMidnightWh === null ? "--"
    : (Math.round(prodSinceMidnightWh / 100) / 10 >= 100 ? String(Math.round(prodSinceMidnightWh / 1000)) : (prodSinceMidnightWh / 1000).toFixed(1));
  const q4VsY = todayVsYesterday(rd, hd, Date.now());
  const q4TodayColor = (q4VsY && prodSinceMidnightWh !== null) ? (prodSinceMidnightWh >= q4VsY.prodWh ? GREEN : ORANGE) : TODAY_NEUTRAL;
  const q4Head = lifeHead.addText("Status:");
  q4Head.font = Font.systemFont(9); q4Head.textColor = GREY; q4Head.lineLimit = 1;
  lifeHead.addSpacer(3);
  if (!q4Normal) {
    const q4Word = lifeHead.addText(serviceReqActive ? "Service Required" : q4Winter ? "Winter" : "Dirty");
    q4Word.font = Font.systemFont(9); q4Word.textColor = (serviceReqActive || q4Fault) ? peakStatusDisplayColor : GREY; q4Word.lineLimit = 1;
  }
  if (!serviceReqActive) {
    if (!q4Normal) lifeHead.addSpacer(3);
    const q4Fig = lifeHead.addText(q4TodayText + " kWh");
    q4Fig.font = Font.systemFont(9); q4Fig.textColor = q4Fault ? peakStatusDisplayColor : q4TodayColor; q4Fig.lineLimit = 1;
  }
  if (SHOW_LATEST_KW && currentProdKw !== null && currentProdKw > 0.05) {
    lifeHead.addSpacer();
    const lifeNow = lifeHead.addText("Latest " + currentProdKw.toFixed(1) + " kW");
    lifeNow.font = Font.systemFont(8);
    lifeNow.textColor = GREY;
    lifeNow.lineLimit = 1;
  }
  lifeCol.addSpacer(4);

  const latestKw = displayLatestKw(rd, weatherIcon, Date.now());
  const maxKwToday = (rd.prod && typeof rd.prod.maxKw === "number") ? rd.prod.maxKw : null;

  const hourlyKw = (rd.prod && Array.isArray(rd.prod.hourlyKw) && rd.prod.hourlyKw.length === HOURLY_BUCKET_COUNT)
    ? rd.prod.hourlyKw
    : null;

  const recentPeakKw = (rd.prod && typeof rd.prod.recentPeakKw === "number") ? rd.prod.recentPeakKw : latestKw;

  // Overnight the saved curve is hours old, so slide it left to keep the right edge at "now". The hours
  // added on the right are night, so zero is correct.
  const hoursSinceProdFetch = (typeof rd.prodFetchedAt === "number")
    ? Math.max(0, Math.floor((Date.now() - rd.prodFetchedAt) / 3600000))
    : 0;

  const liveEndHourlyKw = (hourlyKw && latestKw !== null)
    ? hourlyKw.slice(0, -1).concat([latestKw])
    : hourlyKw;
  const shiftedHourlyKw = (hourlyKw && hoursSinceProdFetch > 0)
    ? hourlyKw.slice(Math.min(hoursSinceProdFetch, HOURLY_BUCKET_COUNT))
        .concat(new Array(Math.min(hoursSinceProdFetch, HOURLY_BUCKET_COUNT)).fill(0))
    : liveEndHourlyKw;

  const shiftedRecentPeakKw = hoursSinceProdFetch > 0 ? 0 : recentPeakKw;

  const histRow = lifeCol.addStack();
  if (bankChart) histRow.size = new Size(0, BOTTOM_CHART_ROW_H);
  histRow.layoutHorizontally();
  histRow.centerAlignContent();

  const peakCol = histRow.addStack();
  peakCol.layoutVertically();
  // Set like the bank number: the same font, with its unit line under it.
  // The big number is the highest power seen (Max kW), always green: the heading line carries the status colour.
  const peakNumText = pd.observedPeakKw !== null ? pd.observedPeakKw.toFixed(1) : "--";
  const peakVal = peakCol.addText(peakNumText);
  peakVal.font = Font.boldSystemFont(peakNumText.length <= 4 ? 22 : 20);
  peakVal.textColor = GREEN;
  peakVal.lineLimit = 1;
  const peakLbl = peakCol.addText("Max kW");
  peakLbl.font = Font.systemFont(9);
  peakLbl.textColor = GREY;

  histRow.addSpacer();

  if (hourlyKw) {
    const histWidth = 58;
    const histHeight = 24;
    const histCeilingKw = (typeof pd.ceilingKw === "number" && pd.ceilingKw > 0) ? pd.ceilingKw : ARRAY_OBSERVED_MAX_KW;
    // Midnight on the curve. Each point is one hour ending at the fetch time (moved on by the overnight
    // slide), so the boundary between yesterday and today sits half a point before the hour it starts.
    const curveEndMs = ((typeof rd.prodFetchedAt === "number") ? rd.prodFetchedAt : Date.now()) + hoursSinceProdFetch * 3600000;
    const midnightIndex = (HOURLY_BUCKET_COUNT - 0.5) - (curveEndMs - localMidnightMs(new Date(curveEndMs))) / 3600000;
    const histImg = renderMicroLineChart(shiftedHourlyKw, histCeilingKw, histWidth, histHeight, shiftedRecentPeakKw,
      { smooth: true, fill: true, skipZero: true, ticks: [midnightIndex], dimBefore: midnightIndex, dimAlpha: YESTERDAY_FADE });
    const histWidget = histRow.addImage(histImg);
    histWidget.imageSize = new Size(histWidth, histHeight);
  } else {
    // No daily curve data: an EMPTY mini graph (frame and top line only), same size as the real one.
    const emptyW = 58;
    const emptyH = 24;
    const emptyImg = renderMicroLineChart(new Array(HOURLY_BUCKET_COUNT).fill(0), 1, emptyW, emptyH, null, { smooth: true, fill: true, skipZero: true });
    const emptyWidget = histRow.addImage(emptyImg);
    emptyWidget.imageSize = new Size(emptyW, emptyH);
  }

  lifeCol.centerAlignContent();
  bottomRow.topAlignContent();

  body.addSpacer(2);
  outerH.addSpacer(9);

  return w;
}

// Today view colours: production and consumption up to this time yesterday. Yesterday's whole-day total (from
// the daily history) minus the readings after this time yesterday (the start of the 24-hour readings, up to
// midnight). Null when it can't be worked out honestly; the Today numbers then stay neutral.
function yesterdaySoFarWh(meter, dayTotalWh, nowMs) {
  const list = meter && meter.readingsWh;
  if (!Array.isArray(list) || list.length < 90 || typeof dayTotalWh !== "number") return null;
  const Q = 15 * 60 * 1000;
  const DAY = 24 * 60 * 60 * 1000;
  const midnightMs = localMidnightMs(new Date(nowMs));
  const yMidnightMs = localMidnightMs(new Date(midnightMs - 12 * 60 * 60 * 1000));
  // Where today's number stops: the newest reading if there is one from today. Overnight, production is not
  // fetched, so its newest reading is from yesterday evening and today's production is taken as zero up to
  // now; then "now" (to the 15 minutes) is the point to compare at.
  const endMs = (meter && typeof meter.lastEndMs === "number" && meter.lastEndMs > midnightMs)
    ? meter.lastEndMs
    : Math.floor(nowMs / Q) * Q;
  const cutoffMs = endMs - DAY;                // this time yesterday
  let firstEndMs = Infinity, lastEndMs = -Infinity;
  for (const r of list) { if (r[0] < firstEndMs) firstEndMs = r[0]; if (r[0] > lastEndMs) lastEndMs = r[0]; }
  if (firstEndMs <= yMidnightMs + Q) {
    // The readings reach back to the start of yesterday (early in the day): add yesterday up directly.
    if (lastEndMs < cutoffMs) return null;
    let v = 0;
    for (const r of list) if (r[0] > yMidnightMs && r[0] <= cutoffMs) v += r[1];
    return v;
  }
  // Later in the day: yesterday's whole-day total minus the readings after this time yesterday. Enphase often
  // sends 95 readings instead of 96, leaving out the first one after that point; that one slice is filled with
  // its neighbour (off by a fraction of a kWh at most). With more than one missing there is no comparison.
  if (firstEndMs > cutoffMs + 2 * Q) return null;
  let afterThisTimeWh = 0;
  let firstWh = 0;
  for (const r of list) {
    if (r[0] > cutoffMs && r[0] <= midnightMs) afterThisTimeWh += r[1];
    if (r[0] === firstEndMs) firstWh = r[1];
  }
  if (firstEndMs > cutoffMs + Q && firstEndMs <= midnightMs) afterThisTimeWh += firstWh;
  const v = dayTotalWh - afterThisTimeWh;
  return v >= 0 ? v : null;
}
function todayVsYesterday(rd, hd, nowMs) {
  const y = new Date(localMidnightMs(new Date(nowMs)) - 12 * 60 * 60 * 1000);
  if (!hd || hd.lastDayDate !== dateStr(y)) return null;
  const prodWh = yesterdaySoFarWh(rd && rd.prod, hd.lastDayProdWh, nowMs);
  const consWh = yesterdaySoFarWh(rd && rd.cons, hd.lastDayConsWh, nowMs);
  return (prodWh === null || consWh === null) ? null : { prodWh, consWh };
}

// Type "today" in the widget's Parameter box (Edit Widget) and the top-left numbers count from midnight
// instead of the past 24 hours, on the medium and small sizes. Blank, the default, is the past 24 hours.
let VIEW_TODAY = (typeof args !== "undefined" && args && typeof args.widgetParameter === "string")
  && args.widgetParameter.trim().toLowerCase() === "today";
// Prod and Cons in the Today view are coloured against this time yesterday (green ahead, orange behind),
// because part of a day can't be judged against a whole day's average. Until yesterday's totals are saved
// (early each morning until the first daily history fetch after 5 AM), they show green. Net keeps its colour.
// No comparison yet (early each morning): green. Tim, 2026-10-16: grey was not obvious and sowed confusion; the
// day is most likely on track, the same call as Array Status before its first check.
const TODAY_NEUTRAL = GREEN;

// The Prod number in the medium widget's top-left box: the hero, larger than the 22 pt of the other boxes.
// Tried on the phone up to "250" with Net "-110" and "210".
const MEDIUM_PROD_SIZE = 30;

// ===== SMALL WIDGET =====
// The Small Home Screen size: Past 24 Hours on top (Prod big on the left; Cons, or Exp and Imp, and Net on the
// right), the Array Status box on the bottom. Same data as the medium widget. Widths are fixed so iOS never
// squeezes one side for the other; tried on the phone with Prod up to "250" and Net down to "-110".
const SMALL_PROD_SIZE = 30;
async function createSmallWidget(rollingResult, historyResult, peakStats, weatherIcon) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#1c1c1e");
  w.setPadding(10, 12, 8, 12);

  const rd = rollingResult && rollingResult.data ? rollingResult.data : null;
  const hd = historyResult && historyResult.data ? historyResult.data : {};
  const pd = peakStats || { observedPeakKw: null, ceilingKw: null, status: { word: "--", color: GREY, pctUnder: null } };
  if (!rd || !rd.cons || !rd.prod) {
    const t = w.addText("No data yet");
    t.font = Font.mediumSystemFont(12);
    t.textColor = Color.orange();
    return w;
  }

  // Today view (Parameter "today"), as on the medium widget.
  const prodMidWh = prodTodayWh(rd, Date.now());
  const consMidWh = (rd.cons && typeof rd.cons.sinceCutoffWh === "number") ? rd.cons.sinceCutoffWh : null;
  const showToday = VIEW_TODAY && prodMidWh !== null && consMidWh !== null;
  const prodWh = showToday ? prodMidWh : rd.prod.totalWh;
  const consWh = showToday ? consMidWh : rd.cons.totalWh;
  const gridFlow = SHOW_EXPORTED_IMPORTED ? gridFlowWh(rd, Date.now(), showToday ? localMidnightMs(new Date()) : undefined) : null;
  const shownProdKwh = Number(kwh(prodWh));
  const shownConsKwh = Number(kwh(consWh));
  const netKwh = gridFlow
    ? (Math.round(Number(kwh(gridFlow.exportedWh)) - Number(kwh(gridFlow.importedWh))) || 0)
    : (isFinite(shownProdKwh) && isFinite(shownConsKwh))
    ? (Math.round(shownProdKwh - shownConsKwh) || 0)
    : Math.round((prodWh - consWh) / 1000);

  const avgProdThreshold = hd.avgProd30dWh ? Math.round(hd.avgProd30dWh / 1000) : null;
  const useThreshold = hd.avgCons30dWh ?? null;
  const avgConsThreshold = useThreshold ? Math.round(useThreshold / 1000) : null;
  const vsY = showToday ? todayVsYesterday(rd, hd, Date.now()) : null;
  const prodColor = showToday
    ? (vsY ? (prodWh >= vsY.prodWh ? GREEN : ORANGE) : TODAY_NEUTRAL)
    : (avgProdThreshold === null) ? GREY : (Math.round(prodWh / 1000) < avgProdThreshold ? ORANGE : GREEN);
  const consColor = showToday
    ? (vsY ? (consWh <= vsY.consWh ? GREEN : ORANGE) : TODAY_NEUTRAL)
    : (avgConsThreshold === null) ? GREY : (Math.round(consWh / 1000) > avgConsThreshold ? ORANGE : GREEN);

  // As-of time = end of the newest reading, like the medium widget.
  const consFetchedAtMs = rd.consFetchedAt || rd.fetchedAt || 0;
  const asOfMs = ((rd.prodFetchedAt || 0) >= consFetchedAtMs) ? rd.prod.lastEndMs : rd.cons.lastEndMs;
  const tf = new DateFormatter();
  tf.dateFormat = "h:mm a";

  // ---- Title row: weather icon + widget title ----
  const titleRow = w.addStack();
  titleRow.layoutHorizontally();
  titleRow.centerAlignContent();
  if (weatherIcon) {
    const isPeakSun = arrayProvesSun(weatherIcon, (rd.prod && typeof rd.prod.latestKw === "number") ? rd.prod.latestKw : null, pd.ceilingKw);
    const sym = SFSymbol.named(isPeakSun ? weatherSymbolName("clear", true) : weatherIcon.symbolName);
    sym.applyFont(Font.systemFont(13));
    const iconImg = titleRow.addImage(sym.image);
    iconImg.imageSize = new Size(15, 15);
    iconImg.tintColor = new Color(isPeakSun ? "#ffd60a" : weatherIcon.colorHex);
    titleRow.addSpacer(5);
  }
  // The small box has room for about 14 characters ("OverEngineered" is the longest), so a longer title is
  // cut back to whole words that fit, and the font can be larger.
  const SMALL_TITLE_MAX = 14;
  let smallTitle = String(WIDGET_TITLE);
  if (smallTitle.length > SMALL_TITLE_MAX) {
    const cut = smallTitle.slice(0, SMALL_TITLE_MAX + 1).lastIndexOf(" ");
    smallTitle = (cut > 0 ? smallTitle.slice(0, cut) : smallTitle.slice(0, SMALL_TITLE_MAX)).trim();
  }
  const title = titleRow.addText(smallTitle);
  title.font = Font.mediumSystemFont(14);
  title.textColor = new Color("#a8a8ad");
  title.lineLimit = 1;
  title.minimumScaleFactor = 0.8;
  w.addSpacer(3);

  // Fixed widths for the two sides of the row, so iOS never squeezes one side to make room for the other.
  // Measured on the phone: "250" at 30 pt needs a bit over 60 pt, "Cons" at 8 pt needs a 29 pt box, so the
  // right side uses the medium widget's Exp/Imp sizes (12 pt numbers, 8 pt labels) and leaves Prod 64 pt.
  const SMALL_INNER_W = 134;
  const SMALL_VAL_W = 37;
  const SMALL_LABEL_W = 29;
  const SMALL_RIGHT_W = SMALL_VAL_W + 4 + SMALL_LABEL_W;
  const SMALL_PROD_W = SMALL_INNER_W - SMALL_RIGHT_W;
  const prodText = kwh(prodWh);
  const prodSize = SMALL_PROD_SIZE;

  // ---- Top: Past 24 Hours ----
  const lblRow = w.addStack();
  lblRow.layoutHorizontally();
  const lbl = lblRow.addText(showToday ? "Prod Today" : "Prod 24h");
  lbl.font = Font.systemFont(9);
  lbl.textColor = GREY;
  lblRow.addSpacer();
  const asOf = lblRow.addText(tf.string(new Date(asOfMs)));
  asOf.font = Font.systemFont(9);
  asOf.textColor = readingIsStale(rd, weatherIcon, Date.now()) ? ORANGE : GREY;
  w.addSpacer(1);

  // Production big on the left. On the right, a small column: Exp / Imp / Net, or Cons / Net.

  const mainRow = w.addStack();
  mainRow.layoutHorizontally();
  mainRow.centerAlignContent();
  const prodCol = mainRow.addStack();
  prodCol.layoutVertically();
  prodCol.size = new Size(SMALL_PROD_W, 0);
  const prodVal = prodCol.addText(prodText);
  prodVal.font = Font.boldSystemFont(prodSize);
  prodVal.textColor = prodColor;
  prodVal.lineLimit = 1;
  const rightCol = mainRow.addStack();
  rightCol.layoutVertically();
  rightCol.size = new Size(SMALL_RIGHT_W, 0);
  const rightLine = (valueText, label, color, size) => {
    const line = rightCol.addStack();
    line.layoutHorizontally();
    line.bottomAlignContent();
    const valBox = line.addStack();
    valBox.size = new Size(SMALL_VAL_W, 0);
    valBox.addSpacer();
    const v = valBox.addText(valueText);
    v.font = Font.mediumSystemFont(size);
    v.textColor = color;
    v.lineLimit = 1;
    // 4 pt between the number and its label (2 looked cramped); the label box stays 29 (27 cut "Cons" off).
    line.addSpacer(4);
    const lblBox = line.addStack();
    lblBox.size = new Size(SMALL_LABEL_W, 0);
    const u = lblBox.addText(label);
    u.font = Font.systemFont(8);
    u.textColor = GREY;
    u.lineLimit = 1;
    lblBox.addSpacer();
  };
  const netColor = netKwh >= 0 ? GREEN : ORANGE;
  if (gridFlow) {
    rightLine(kwh(gridFlow.exportedWh), "Exp", GREEN, 12);
    rightLine(kwh(gridFlow.importedWh), "Imp", ORANGE, 12);
    rightLine(String(netKwh), "Net", netColor, 12);
  } else {
    rightLine(kwh(consWh), "Cons", consColor, 12);
    rightCol.addSpacer(2);
    rightLine(String(netKwh), "Net", netColor, 12);
  }

  w.addSpacer(3);
  const div = w.addStack();
  div.layoutHorizontally();
  div.size = new Size(134, 1);
  div.backgroundColor = new Color("#333336");
  div.addSpacer(134);
  w.addSpacer(4);

  // ---- Bottom: the Array Status box (same as the medium's bottom right) ----
  const serviceReqActive = hd.serviceReq === true;
  const peakIsNeutral = !serviceReqActive &&
    (pd.status.word === "Clean" || pd.status.word === "--" || pd.status.word === "Winter Sun");
  const peakStatusDisplayColor = serviceReqActive ? RED : pd.status.color;
  const arrayHeading = serviceReqActive ? "Service Required"
    : pd.status.word === "Very Dirty" ? "Array Very Dirty"
    : pd.status.word === "Dirty" ? "Array Dirty"
    : pd.status.word === "Winter Sun" ? "Winter Sun"
    : "Array Status";
  const head = w.addStack();
  head.layoutHorizontally();
  const headLbl = head.addText(arrayHeading);
  headLbl.font = Font.systemFont(9);
  headLbl.textColor = peakIsNeutral ? GREY : peakStatusDisplayColor;
  headLbl.lineLimit = 1;
  w.addSpacer(3);

  const latestKw = displayLatestKw(rd, weatherIcon, Date.now());
  const hourlyKw = (rd.prod && Array.isArray(rd.prod.hourlyKw) && rd.prod.hourlyKw.length === HOURLY_BUCKET_COUNT)
    ? rd.prod.hourlyKw : null;
  const recentPeakKw = (rd.prod && typeof rd.prod.recentPeakKw === "number") ? rd.prod.recentPeakKw : latestKw;
  const hoursSinceProdFetch = (typeof rd.prodFetchedAt === "number")
    ? Math.max(0, Math.floor((Date.now() - rd.prodFetchedAt) / 3600000)) : 0;
  const liveEndHourlyKw = (hourlyKw && latestKw !== null) ? hourlyKw.slice(0, -1).concat([latestKw]) : hourlyKw;
  const shiftedHourlyKw = (hourlyKw && hoursSinceProdFetch > 0)
    ? hourlyKw.slice(Math.min(hoursSinceProdFetch, HOURLY_BUCKET_COUNT))
        .concat(new Array(Math.min(hoursSinceProdFetch, HOURLY_BUCKET_COUNT)).fill(0))
    : liveEndHourlyKw;
  const shiftedRecentPeakKw = hoursSinceProdFetch > 0 ? 0 : recentPeakKw;

  const histRow = w.addStack();
  histRow.layoutHorizontally();
  histRow.centerAlignContent();
  const peakCol = histRow.addStack();
  peakCol.layoutVertically();
  const peakNumText = pd.observedPeakKw !== null ? pd.observedPeakKw.toFixed(1) : "--";
  const peakVal = peakCol.addText(peakNumText);
  peakVal.font = Font.boldSystemFont(peakNumText.length <= 4 ? 22 : 20);
  peakVal.textColor = peakStatusDisplayColor;
  peakVal.lineLimit = 1;
  const peakLbl = peakCol.addText("Max kW");
  peakLbl.font = Font.systemFont(9);
  peakLbl.textColor = GREY;
  histRow.addSpacer();

  if (hourlyKw) {
    const histCeilingKw = (typeof pd.ceilingKw === "number" && pd.ceilingKw > 0) ? pd.ceilingKw : ARRAY_OBSERVED_MAX_KW;
    const curveEndMs = ((typeof rd.prodFetchedAt === "number") ? rd.prodFetchedAt : Date.now()) + hoursSinceProdFetch * 3600000;
    const midnightIndex = (HOURLY_BUCKET_COUNT - 0.5) - (curveEndMs - localMidnightMs(new Date(curveEndMs))) / 3600000;
    const histImg = renderMicroLineChart(shiftedHourlyKw, histCeilingKw, 52, 24, shiftedRecentPeakKw,
      { smooth: true, fill: true, skipZero: true, ticks: [midnightIndex], dimBefore: midnightIndex, dimAlpha: YESTERDAY_FADE });
    const histWidget = histRow.addImage(histImg);
    histWidget.imageSize = new Size(52, 24);
  }
  return w;
}

// ===== SANDBOX =====
// Everything above this line is the widget. Everything below is made up.

// Set this to true to put each scenario's name where the widget's title goes, so you can tell the screens
// apart while you tap through. Left false, every screen looks exactly like the real widget.
const LABEL_SCREENS = false;

// Twenty screens is a lot to tap through. To look at just a few, list their row numbers here, in the order
// you want them (1 is the first row), for example [1, 7]. Leave it empty to show them all.
const SHOW_ONLY = [];

// One row is one screen. You only describe the day; the code further down works out the numbers.
//
//   name      what the row is there to show (used as the title when LABEL_SCREENS is true)
//   arrayKw   the most the array makes on a clear day, in kW
//   hour      the time of day the screen pretends it is (14.5 is 2:30 PM)
//   sky       the shape of the day's power curve: "clear", "choppy", "passing-cloud", "overcast", "rain"
//             or "winter". The weather icon follows it unless you set  weather  yourself.
//   cons      kWh the house used in the last 24 hours
//   avgProd   30-day average production, kWh a day. Today's Prod is green at or above it, orange below.
//   avgCons   30-day average consumption, kWh a day. Today's Cons is orange above it, green below.
//   bank      the banked balance in kWh. Negative shows "Credit Deficit".
//   bankTrend kWh a day over the last 28 days. Above 5 draws the up mark, below -5 the down mark.
//
// Optional:
//   trend      shape of the 30-day line: "mixed" (the default), "steady", "rising", "falling"
//   status     "Dirty", "Very Dirty" or "Winter Sun" for the Array Status label (default is "Max Power")
//   serviceReq true to show "Service Req", the label for a hardware fault
//   banksKwh   false for a utility that does not bank kWh; the box then reads "Net Since <since>"
//   since      the date for that label, as "2026-09-04"
//   stale      true to show what a failed refresh looks like: last good numbers, time in orange
//   error      any text, to show the screen you get when there is no data at all
//   expImp     true to show Exported and Imported in place of Cons (the "Show Exported / Imported" setting)
//   lock       true to show the Lock Screen widget for that day instead of the Home Screen widget
const SCENARIOS = [
  // An ordinary good day on a typical array. Start here.
  { name: "8 kW, clear afternoon",  arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 26,  avgProd: 40,  avgCons: 30,  bank: 412,  bankTrend: 6 },
  // Clouds coming and going: a ragged curve, and production under its 30-day average (orange).
  { name: "8 kW, broken cloud",     arrayKw: 8,   hour: 15,    sky: "choppy",        cons: 34,  avgProd: 40,  avgCons: 30,  bank: 380,  bankTrend: -2 },
  // A cloud right now on an otherwise clear day. The curve's end dips; the dashed line holds the last hour's high.
  { name: "8 kW, passing cloud",    arrayKw: 8,   hour: 12.75, sky: "passing-cloud", cons: 29,  avgProd: 40,  avgCons: 30,  bank: 405,  bankTrend: 4 },
  // A flat grey day. Low curve, orange Prod, and a bank that has been shrinking.
  { name: "8 kW, overcast",         arrayKw: 8,   hour: 13,    sky: "overcast",      cons: 33,  avgProd: 40,  avgCons: 30,  bank: 95,   bankTrend: -8, trend: "falling" },
  // Rain, and a balance that has gone below zero. The label changes to "Credit Deficit".
  { name: "8 kW, rain, in deficit", arrayKw: 8,   hour: 11,    sky: "rain",          cons: 36,  avgProd: 38,  avgCons: 31,  bank: -64,  bankTrend: -9, trend: "falling" },
  // A small array. Numbers under 10 kWh get one decimal; the bank and Net stay whole.
  { name: "1.6 kW, small array",    arrayKw: 1.6, hour: 15.5,  sky: "clear",         cons: 8.4, avgProd: 8.9, avgCons: 9.1, bank: 4,    bankTrend: 1 },
  // A large array near midday. Three-digit numbers and a four-digit bank must still fit.
  { name: "25 kW, clear midday",    arrayKw: 25,  hour: 12.5,  sky: "clear",         cons: 118, avgProd: 118, avgCons: 106, bank: 5364, bankTrend: 12, trend: "rising" },
  // After dark. The moon icon, and the curve has slid left: the right edge is always "now".
  { name: "8 kW, evening",          arrayKw: 8,   hour: 20.5,  sky: "clear",         cons: 31,  avgProd: 40,  avgCons: 30,  bank: 418,  bankTrend: 6 },
  // Before sunrise. Yesterday's whole curve sits in the middle of the chart.
  { name: "8 kW, before sunrise",   arrayKw: 8,   hour: 6,     sky: "clear",         cons: 30,  avgProd: 40,  avgCons: 30,  bank: 409,  bankTrend: 6 },
  // The clear-day peak has dropped about 12 percent. Orange number, "Dirty" label.
  { name: "8 kW, dirty panels",     arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 27,  avgProd: 40,  avgCons: 30,  bank: 398,  bankTrend: 3,  status: "Dirty" },
  // Down about 20 percent. Red number, "Very Dirty" label.
  { name: "8 kW, very dirty",       arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 27,  avgProd: 40,  avgCons: 30,  bank: 371,  bankTrend: -3, status: "Very Dirty" },
  // Midwinter: a short, low day. The panels are not judged; the label reads "Winter Sun".
  { name: "8 kW, winter",           arrayKw: 8,   hour: 13,    sky: "winter",        cons: 38,  avgProd: 17,  avgCons: 36,  bank: 120,  bankTrend: -14, trend: "steady", status: "Winter Sun" },
  // Enphase is reporting a hardware fault. "Service Req" takes over the label.
  { name: "8 kW, service needed",   arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 26,  avgProd: 40,  avgCons: 30,  bank: 412,  bankTrend: 6,  serviceReq: true },
  // A utility that pays for exports in money, with no kWh bank. The box is a plain running total.
  { name: "8 kW, no kWh bank",      arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 26,  avgProd: 40,  avgCons: 30,  bank: 212,  bankTrend: 6,  banksKwh: false, since: "2026-09-04" },
  // The "Show Exported / Imported" setting: energy sent to the grid and taken from it, in place of Cons.
  { name: "8 kW, exported/imported", arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 26,  avgProd: 40,  avgCons: 30,  bank: 412,  bankTrend: 6,  expImp: true },
  // The last refresh failed. The widget keeps its last good numbers and the time turns orange.
  { name: "8 kW, refresh failed",   arrayKw: 8,   hour: 16,    sky: "clear",         cons: 28,  avgProd: 40,  avgCons: 30,  bank: 415,  bankTrend: 6,  stale: true },
  // Nothing saved and nothing coming back: the plain error screen.
  { name: "No data at all",         error: "The Internet connection appears to be offline." },
  // The Lock Screen widget: three numbers counted from midnight, not the last 24 hours.
  { name: "Lock Screen, afternoon", arrayKw: 8,   hour: 14.5,  sky: "clear",         cons: 26,  avgProd: 40,  avgCons: 30,  bank: 412,  bankTrend: 6,  lock: true },
  { name: "Lock Screen, cloudy",    arrayKw: 8,   hour: 11.5,  sky: "choppy",        cons: 34,  avgProd: 40,  avgCons: 30,  bank: 380,  bankTrend: -2, lock: true },
  { name: "Lock Screen, 25 kW",     arrayKw: 25,  hour: 17,    sky: "clear",         cons: 131, avgProd: 118, avgCons: 106, bank: 5364, bankTrend: 12, lock: true },
  // The widest the Lock Screen widget has to hold: a wet evening with a big deficit.
  { name: "Lock Screen, deficit",   arrayKw: 25,  hour: 19,    sky: "rain",          cons: 160, avgProd: 118, avgCons: 106, bank: 5120, bankTrend: -9, lock: true },
];

// ----- How a day's shape is made -----

// Sunrise and sunset, as hours of the day, for an autumn day and for midwinter.
const SANDBOX_DAY = { rise: 7.25, set: 18.75 };
const SANDBOX_WINTER_DAY = { rise: 8.25, set: 16.5 };

// The clear-sky curve, from 0 to 1. Squaring the sine gives the narrow bell a real array draws: a slow
// start, a peak around midday, a slow finish.
function sandboxSun(h, day) {
  if (h <= day.rise || h >= day.set) return 0;
  const s = Math.sin(Math.PI * (h - day.rise) / (day.set - day.rise));
  return s * s;
}

// How much of the clear-sky curve gets through, for each kind of sky, at hour h.
const SANDBOX_CLOUD_PATTERN = [1, 0.55, 0.9, 0.35, 1, 0.7, 0.4, 0.95, 0.6, 1, 0.45, 0.85];
function sandboxSkyFraction(sky, h) {
  if (sky === "winter") return 0.62 * sandboxSun(h, SANDBOX_WINTER_DAY);
  const clear = 0.97 * sandboxSun(h, SANDBOX_DAY);
  if (sky === "choppy") return clear * SANDBOX_CLOUD_PATTERN[Math.floor(h * 2) % SANDBOX_CLOUD_PATTERN.length];
  if (sky === "overcast") return 0.22 * clear;
  if (sky === "rain") return 0.1 * clear;
  return clear; // "clear" and "passing-cloud"
}

// Thirty daily factors for the 30-day line. Each is scaled so the line averages out to avgProd.
const SANDBOX_TRENDS = {
  mixed: [1.08, 0.96, 1.12, 0.55, 1.05, 1.1, 0.9, 1.15, 1.02, 0.7, 1.09, 1.13, 0.98, 1.04, 0.62,
    1.1, 1.06, 0.93, 1.14, 1.0, 0.8, 1.11, 1.07, 0.95, 1.12, 0.58, 1.03, 1.09, 0.97, 1.16],
  steady: Array.from({ length: 30 }, (_, i) => 1 + ((i % 3) - 1) * 0.04),
  rising: Array.from({ length: 30 }, (_, i) => 0.6 + i * 0.028),
  falling: Array.from({ length: 30 }, (_, i) => 1.4 - i * 0.028),
};

// The weather icon that goes with each sky, as the weather codes the widget understands.
const SANDBOX_WEATHER_CODE = { "clear": 0, "partly-cloudy": 2, "overcast": 3, "fog": 45, "rain": 61, "snow": 71, "thunder": 95 };
const SANDBOX_SKY_WEATHER = { "clear": "clear", "choppy": "partly-cloudy", "passing-cloud": "partly-cloudy",
  "overcast": "overcast", "rain": "rain", "winter": "clear" };

// A household's day, as a weight for each hour: quiet overnight, a bump at breakfast, a bigger one in the
// evening. It is only used to spread the row's  cons  figure across the day, so that Exported and Imported
// come out the way they would in a real house.
function sandboxUseWeight(h) {
  if (h >= 17 && h < 22) return 1.7;
  if (h >= 6 && h < 9) return 1.4;
  if (h >= 22 || h < 6) return 0.6;
  return 0.9;
}

// ----- Turning a row into what the widget expects -----

// The times on these screens are pretend, so measured against the real clock they would look hours old and
// the widget's stale rule (time turns orange after 2 hours) would fire. It is switched off here. The
// "refresh failed" row still shows the orange time.
readingIsStale = () => false;

// The real widget gets four things: the last 24 hours of readings, the daily history, the dirty-panel
// verdict and the weather. This builds the same four from one row of the table. Production is added up
// from the curve, so the big Prod number, the chart and the Lock Screen widget always agree with each other.
function sandboxInputs(s) {
  const realNow = Date.now();
  const day = s.sky === "winter" ? SANDBOX_WINTER_DAY : SANDBOX_DAY;
  const status = s.status || "Clean";
  // A dirty array peaks lower, so its whole curve is scaled down to match its label.
  const peakShare = status === "Dirty" ? 0.88 : (status === "Very Dirty" ? 0.8 : 0.97);
  const dirt = peakShare / 0.97;
  const kwAt = (h) => s.arrayKw * dirt * sandboxSkyFraction(s.sky, ((h % 24) + 24) % 24);

  // 96 quarter-hour readings ending at the pretend time, just like Enphase sends.
  const quarters = [];
  for (let q = 95; q >= 0; q--) {
    const mid = s.hour - q * 0.25 - 0.125;
    quarters.push({ hoursAgo: q * 0.25, sinceMidnight: mid >= 0, kw: kwAt(mid) });
  }
  // "passing-cloud": the newest reading drops, the ones before it do not.
  if (s.sky === "passing-cloud") quarters[95].kw *= 0.3;

  const hourlyKw = [];
  for (let b = 0; b < HOURLY_BUCKET_COUNT; b++) {
    const four = quarters.slice(b * 4, b * 4 + 4);
    hourlyKw.push(four.reduce((sum, r) => sum + r.kw, 0) / 4);
  }
  const totalWh = quarters.reduce((sum, r) => sum + r.kw * 250, 0);
  const today = quarters.filter((r) => r.sinceMidnight);
  const sinceMidnightProdWh = today.reduce((sum, r) => sum + r.kw * 250, 0);
  const todayPeakKw = today.reduce((mx, r) => Math.max(mx, r.kw), 0);
  const latestKw = quarters[95].kw;
  const recentPeakKw = quarters.slice(92).reduce((mx, r) => Math.max(mx, r.kw), 0);
  const maxKw = quarters.reduce((mx, r) => Math.max(mx, r.kw), 0);

  // The time printed on the widget is the end of the newest reading, so place that at the pretend time.
  const stampDate = new Date(realNow);
  stampDate.setHours(Math.floor(s.hour), Math.floor((s.hour % 1) * 4) * 15, 0, 0);
  const lastEndMs = stampDate.getTime();

  // The same 96 readings for consumption, plus a time for each one, so the widget can compare the two
  // meters reading by reading for Exported and Imported.
  const newestEndMs = Math.floor(realNow / 900000) * 900000;
  const weights = quarters.map((r) => sandboxUseWeight((((s.hour - r.hoursAgo - 0.125) % 24) + 24) % 24));
  const weightSum = weights.reduce((x, y) => x + y, 0);
  const prodReadings = quarters.map((r, i) => [newestEndMs - (95 - i) * 900000, Math.round(r.kw * 250)]);
  const consReadings = quarters.map((r, i) => [newestEndMs - (95 - i) * 900000, Math.round(s.cons * 1000 * weights[i] / weightSum)]);

  const sinceMidnightConsWh = s.cons * 1000 * Math.min(1, s.hour / 24);
  const rollingResult = {
    fetchError: s.stale ? "The Internet connection appears to be offline." : null,
    data: {
      fetchedAt: realNow, prodFetchedAt: realNow, consFetchedAt: realNow,
      prod: { totalWh: totalWh, sinceCutoffWh: sinceMidnightProdWh, sinceCutoffMaxKw: todayPeakKw, lastEndMs: lastEndMs,
        latestKw: latestKw, maxKw: maxKw, recentPeakKw: recentPeakKw, hourlyKw: hourlyKw, readingsWh: prodReadings },
      cons: { totalWh: s.cons * 1000, sinceCutoffWh: sinceMidnightConsWh, lastEndMs: lastEndMs, readingsWh: consReadings },
    },
  };

  const shape = SANDBOX_TRENDS[s.trend || "mixed"];
  const shapeAvg = shape.reduce((x, y) => x + y, 0) / shape.length;
  const last30ProdWh = shape.map((f) => Math.round(s.avgProd * 1000 * f / shapeAvg));
  // The widget adds today's net to the saved balance. Take it back out here so the screen lands on
  // exactly the bank number in the table.
  const historyResult = {
    data: {
      avgProd30dWh: s.avgProd * 1000, avgCons30dWh: s.avgCons * 1000, avgNet30dWh: (s.avgProd - s.avgCons) * 1000,
      last7ProdWh: last30ProdWh.slice(-7), last30ProdWh: last30ProdWh,
      estimatedBankWh: s.bank * 1000 - (sinceMidnightProdWh - sinceMidnightConsWh),
      avgNetTrendWh: s.bankTrend * 1000, serviceReq: s.serviceReq === true,
    },
  };

  const statusColor = status === "Dirty" ? ORANGE : (status === "Very Dirty" ? RED : (status === "Winter Sun" ? GREY : GREEN));
  const peakStats = { observedPeakKw: s.arrayKw * peakShare, ceilingKw: s.arrayKw, daysRecorded: PEAK_FIFO_DEPTH,
    status: { word: status, color: statusColor, pctUnder: null } };

  const bucket = s.weather || SANDBOX_SKY_WEATHER[s.sky] || "clear";
  const isDay = s.hour > day.rise && s.hour < day.set;
  const code = SANDBOX_WEATHER_CODE[bucket] !== undefined ? SANDBOX_WEATHER_CODE[bucket] : 0;
  const weatherIcon = { symbolName: weatherSymbolName(bucket, isDay), colorHex: weatherIconColor(bucket, isDay).hex,
    weatherCode: code, iconCode: code, isDay: isDay };

  return { rollingResult, historyResult, peakStats, weatherIcon };
}

// Draws one row. asLockTile forces the Lock Screen widget, whatever the row says.
async function sandboxDraw(s, asLockTile) {
  WIDGET_TITLE = LABEL_SCREENS ? s.name : "OverEngineered Solar";
  BANKS_KWH_CREDITS = s.banksKwh !== false;
  BANK_BASELINE_DATE = s.since || "2026-09-04";
  SHOW_EXPORTED_IMPORTED = s.expImp === true;
  if (s.error) {
    if (asLockTile) return createLockTile({ data: null, fetchError: s.error }, null, null);
    return await createWidget({ data: null, fetchError: s.error }, { data: null, error: s.error }, null, null);
  }
  const inp = sandboxInputs(s);
  if (asLockTile) return createLockTile(inp.rollingResult, inp.weatherIcon, inp.peakStats);
  return await createWidget(inp.rollingResult, inp.historyResult, inp.peakStats, inp.weatherIcon);
}

// ----- Running it -----

if (config.runsInWidget) {
  // Placed on the Home Screen or Lock Screen, it shows one row. Type a row number in the widget's
  // Parameter box to choose which (1 is the first row). Left empty, it shows the first row listed in
  // SHOW_ONLY, or row 1.
  const fallbackRow = SHOW_ONLY.length ? SHOW_ONLY[0] : 1;
  const asked = parseInt((typeof args !== "undefined" && args.widgetParameter) || String(fallbackRow), 10);
  const pick = SCENARIOS[(asked >= 1 && asked <= SCENARIOS.length) ? asked - 1 : 0];
  const family = config.widgetFamily || "";
  if (family.indexOf("accessory") === 0 && family !== "accessoryRectangular") {
    Script.setWidget(createLockNote("Use the wide size", null));
  } else {
    Script.setWidget(await sandboxDraw(pick, family === "accessoryRectangular"));
  }
} else {
  // Run from the Scriptable app: show each row in turn. Close one screen to see the next.
  const rows = SHOW_ONLY.length ? SHOW_ONLY.map((n) => SCENARIOS[n - 1]).filter(Boolean) : SCENARIOS;
  for (const s of rows) {
    const shown = await sandboxDraw(s, s.lock === true);
    if (s.lock === true) await shown.presentAccessoryRectangular();
    else await shown.presentMedium();
  }
}
Script.complete();
