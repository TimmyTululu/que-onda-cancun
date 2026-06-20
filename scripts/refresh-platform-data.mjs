#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const CANCUN_TIME_ZONE = "America/Cancun";
const CANCUN_OFFSET = "-05:00";
const STALE_HOURS_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_WORLDCUP_FIXTURE = ".firecrawl/espn-worldcup-schedule.md";
const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || "https://api.firecrawl.dev";
const ESPN_WORLD_CUP_URL = "https://www.espn.com/soccer/schedule/_/league/fifa.world";
const SECTION_CONFIG = {
  "hoy.hero": { timeSensitive: true, automated: false, source: "manual", status: "manual", notes: "Hero/sponsor item is preserved from manual editorial data." },
  "hoy.signals": { timeSensitive: true, automated: false, source: "preserved", status: "preserved", notes: "Signal seed data is preserved by this job; live signal fetches happen at runtime where available." },
  "hoy.worldCup": { timeSensitive: true, automated: true, source: "espn", status: "fresh", notes: "World Cup schedule is the required automated section while active." },
  "hoy.today": { timeSensitive: true, automated: false, source: "preserved", status: "preserved", notes: "Daily cards are preserved from editorial data; Cancun date labels are computed." },
  "hoy.week": { timeSensitive: true, automated: false, source: "preserved", status: "preserved", notes: "Weekly preview cards are preserved from editorial data." },
  "hoy.events": { timeSensitive: true, automated: false, source: "preserved", status: "preserved", notes: "Home event cards are lifecycle-filtered and otherwise preserved." },
  week: { timeSensitive: true, automated: false, source: "preserved", status: "preserved", notes: "Weekly route cards are preserved from editorial data." },
  promos: { timeSensitive: true, automated: false, source: "manual", status: "manual", notes: "Promo cards are preserved from manual/editorial data; unknown expiry requires review." },
  events: { timeSensitive: true, automated: false, source: "preserved", status: "preserved", notes: "Event route cards are lifecycle-filtered and otherwise preserved." }
};
const TRUSTED_HOST_SOURCE_TYPES = [
  ["espn.com", "official"],
  ["fifa.com", "official"],
  ["casapalma.mx", "partner"],
  ["open-meteo.com", "official"],
  ["frankfurter.app", "official"],
  ["semar.gob.mx", "official"],
  ["aquaworld.com.mx", "official"],
  ["cocobongo.com", "official"],
  ["rosanegra.com.mx", "official"],
  ["lahabichuela.com", "official"],
  ["mandalagroup.com", "official"],
  ["venturapark.com", "official"],
  ["selvatica.com.mx", "official"],
  ["senorfrogs.com", "official"],
  ["xoximilco.com", "official"],
  ["harrys.com.mx", "official"],
  ["vivoen.mx", "scraped"]
];
const WEEKDAY_INDEX = new Map([
  ["dom", 0],
  ["lun", 1],
  ["mar", 2],
  ["mie", 3],
  ["jue", 4],
  ["vie", 5],
  ["sab", 6]
]);
const ENGLISH_MONTHS = new Map([
  ["january", 0],
  ["february", 1],
  ["march", 2],
  ["april", 3],
  ["may", 4],
  ["june", 5],
  ["july", 6],
  ["august", 7],
  ["september", 8],
  ["october", 9],
  ["november", 10],
  ["december", 11]
]);
const SHORT_WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const TEAM_NAME_ES = new Map([
  ["Algeria", "Argelia"],
  ["Argentina", "Argentina"],
  ["Austria", "Austria"],
  ["Belgium", "Bélgica"],
  ["Bosnia-Herzegovina", "Bosnia y Herzegovina"],
  ["Brazil", "Brasil"],
  ["Canada", "Canadá"],
  ["Cape Verde", "Cabo Verde"],
  ["Colombia", "Colombia"],
  ["Congo DR", "RD Congo"],
  ["Croatia", "Croacia"],
  ["Curaçao", "Curazao"],
  ["Czechia", "Chequia"],
  ["Ecuador", "Ecuador"],
  ["Egypt", "Egipto"],
  ["England", "Inglaterra"],
  ["France", "Francia"],
  ["Germany", "Alemania"],
  ["Ghana", "Ghana"],
  ["Haiti", "Haití"],
  ["Iran", "Irán"],
  ["Iraq", "Irak"],
  ["Ivory Coast", "Costa de Marfil"],
  ["Japan", "Japón"],
  ["Jordan", "Jordania"],
  ["Mexico", "México"],
  ["Morocco", "Marruecos"],
  ["Netherlands", "Países Bajos"],
  ["New Zealand", "Nueva Zelanda"],
  ["Norway", "Noruega"],
  ["Panama", "Panamá"],
  ["Portugal", "Portugal"],
  ["Qatar", "Qatar"],
  ["Saudi Arabia", "Arabia Saudita"],
  ["Scotland", "Escocia"],
  ["Senegal", "Senegal"],
  ["South Africa", "Sudáfrica"],
  ["South Korea", "Corea del Sur"],
  ["Spain", "España"],
  ["Sweden", "Suecia"],
  ["Switzerland", "Suiza"],
  ["Tunisia", "Túnez"],
  ["Uruguay", "Uruguay"],
  ["Uzbekistan", "Uzbekistán"]
]);

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg, index, all) => {
    if (!arg.startsWith("--")) return;
    const key = arg.slice(2);
    const value = all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true;
    args[key] = value;
  });
  return args;
}

function readJson(filePath) {
  const absolutePath = path.resolve(root, filePath);
  if (!existsSync(absolutePath)) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function writeJson(filePath, payload) {
  writeFileSync(path.resolve(root, filePath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function fileExists(filePath) {
  return existsSync(path.resolve(root, filePath));
}

function runMode() {
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  if (eventName === "schedule") return "scheduled";
  if (eventName === "workflow_dispatch") return "manual";
  if (process.env.GITHUB_ACTIONS === "true") return "unknown";
  return "local";
}

function cancunParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CANCUN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    isoDate: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function cancunStartOfDayMs(isoDate) {
  return Date.parse(`${isoDate}T00:00:00${CANCUN_OFFSET}`);
}

function isoDateFromCancunDayOffset(isoDate, offset) {
  return cancunParts(new Date(cancunStartOfDayMs(isoDate) + offset * DAY_MS + 12 * 60 * 60 * 1000)).isoDate;
}

function cancunNowIso(now = new Date()) {
  const { isoDate } = cancunParts(now);
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: CANCUN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return `${isoDate}T${timeFormatter.format(now)}${CANCUN_OFFSET}`;
}

function cancunDateLabel(isoDate, style = "long") {
  const date = new Date(`${isoDate}T12:00:00${CANCUN_OFFSET}`);
  const formatted = new Intl.DateTimeFormat("es-MX", {
    timeZone: CANCUN_TIME_ZONE,
    weekday: style,
    day: "numeric",
    month: "long"
  }).format(date);
  const normalized = formatted.replace(",", "");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function shortCancunDateLabel(isoDate) {
  const date = new Date(`${isoDate}T12:00:00${CANCUN_OFFSET}`);
  return `${SHORT_WEEKDAYS[date.getUTCDay()]} ${Number(isoDate.slice(8, 10))}`;
}

function normalizeDateLabel(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sourceTypeForItem(item = {}) {
  if (!item.sourceUrl && !item.sourceName) return "unknown";
  const haystack = `${item.sourceUrl || ""} ${item.sourceName || ""}`.toLowerCase();
  for (const [needle, type] of TRUSTED_HOST_SOURCE_TYPES) {
    if (haystack.includes(needle)) return type;
  }
  if (/manual|editorial/i.test(item.sourceName || "")) return "manual";
  if (/oficial|official/i.test(item.freshness || "")) return "official";
  return "unknown";
}

function confidenceForSourceType(sourceType) {
  if (sourceType === "official" || sourceType === "partner" || sourceType === "manual") return "high";
  if (sourceType === "scraped") return "medium";
  return "low";
}

function trustFieldsForItem(item, extractionMethod = "manual") {
  const sourceType = item.sourceType || sourceTypeForItem(item);
  return {
    sourceType,
    confidence: item.confidence || confidenceForSourceType(sourceType),
    extractionMethod: item.extractionMethod || extractionMethod
  };
}

function applyTrustFieldsToItem(item, extractionMethod = "manual") {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    ...trustFieldsForItem(item, extractionMethod)
  };
}

function itemCollections(data) {
  return {
    "hoy.hero": data.hoy?.hero ? [data.hoy.hero] : [],
    "hoy.signals": data.hoy?.signals || [],
    "hoy.today": data.hoy?.today || [],
    "hoy.week": data.hoy?.week || [],
    "hoy.events": data.hoy?.events || [],
    week: data.week || [],
    promos: data.promos || [],
    events: data.events || []
  };
}

function setCollection(data, section, items) {
  if (section === "hoy.hero") data.hoy.hero = items[0] || data.hoy.hero;
  if (section === "hoy.signals") data.hoy.signals = items;
  if (section === "hoy.today") data.hoy.today = items;
  if (section === "hoy.week") data.hoy.week = items;
  if (section === "hoy.events") data.hoy.events = items;
  if (section === "week") data.week = items;
  if (section === "promos") data.promos = items;
  if (section === "events") data.events = items;
}

function applyTrustFields(data) {
  for (const [section, items] of Object.entries(itemCollections(data))) {
    setCollection(data, section, items.map((item) => applyTrustFieldsToItem(item, section.includes("signals") ? "static" : "manual")));
  }
  if (data.hoy?.worldCup) {
    data.hoy.worldCup.sourceType = "official";
    data.hoy.worldCup.confidence = "high";
    data.hoy.worldCup.extractionMethod = data.hoy.worldCup.extractionMethod || "firecrawl";
  }
}

function parseTimeRangeEnd(value) {
  const matches = [...String(value || "").matchAll(/\b(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?/g)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  return {
    hour: Number(last[3] || last[1]),
    minute: Number(last[4] || last[2]),
    singleTime: !last[3]
  };
}

function weekdayFromIso(isoDate) {
  return new Date(`${isoDate}T12:00:00${CANCUN_OFFSET}`).getUTCDay();
}

function eventRangeEndOffset(item) {
  const prefix = String(item.dateTime || "").split("·")[0] || "";
  const match = normalizeKey(prefix).match(/\b(dom|lun|mar|mie|jue|vie|sab)\s*-\s*(dom|lun|mar|mie|jue|vie|sab)\b/);
  if (!match || !item.date) return 0;
  const startWeekday = weekdayFromIso(item.date);
  const endWeekday = WEEKDAY_INDEX.get(match[2]);
  if (endWeekday === undefined) return 0;
  return (endWeekday - startWeekday + 7) % 7;
}

function eventEndTimestamp(item) {
  const explicit = Date.parse(item.validUntil || item.endsAt || item.activeUntil || "");
  if (Number.isFinite(explicit)) return explicit;
  if (!item.date) return null;
  const rangeOffset = eventRangeEndOffset(item);
  const endTime = parseTimeRangeEnd(item.time) || parseTimeRangeEnd(item.dateTime) || { hour: 23, minute: 59, singleTime: false };
  const cleanupMinutes = endTime.singleTime ? 180 : 180;
  const baseMs = cancunStartOfDayMs(item.date) + rangeOffset * DAY_MS;
  return baseMs + endTime.hour * 60 * 60 * 1000 + endTime.minute * 60 * 1000 + cleanupMinutes * 60 * 1000;
}

function updateTodayCardDates(data, now, log, sectionOps) {
  const todayIso = cancunParts(now).isoDate;
  const todayItems = data.hoy?.today || [];
  let updated = 0;
  for (const item of todayItems) {
    if (item.date && item.date !== todayIso) {
      item.date = todayIso;
      item.dateDerivedFrom = "america-cancun-current-date";
      updated += 1;
    }
    if (/^hoy\b/i.test(String(item.dateTime || ""))) {
      item.dateLabelDerivedFrom = "america-cancun-current-date";
    }
  }
  if (updated) {
    sectionOps["hoy.today"].itemsUpdated += updated;
    sectionOps["hoy.today"].warnings.push(`Updated ${updated} hoy.today date fields from America/Cancun current date; source content remains preserved.`);
    log.push(`Updated ${updated} hoy.today date fields to ${todayIso}.`);
  }
}

function filterExpiredEvents(data, now, log, sectionOps) {
  for (const section of ["hoy.events", "events"]) {
    const items = section === "hoy.events" ? data.hoy?.events || [] : data.events || [];
    const kept = [];
    const removed = [];
    const preservedForReview = [];

    for (const item of items) {
      const endTs = eventEndTimestamp(item);
      if (!Number.isFinite(endTs)) {
        preservedForReview.push(item);
        kept.push({ ...item, lifecycleStatus: "review", lifecycleReason: "event_missing_reliable_end" });
        continue;
      }
      if (now.getTime() > endTs) {
        removed.push({ id: item.id, title: item.title, endedAt: new Date(endTs).toISOString() });
        continue;
      }
      kept.push({ ...item, lifecycleStatus: "active", lifecycleEndsAt: new Date(endTs).toISOString() });
    }

    if (removed.length && kept.length) {
      setCollection(data, section, kept);
      sectionOps[section].itemsRemoved += removed.length;
      sectionOps[section].warnings.push(`Removed ${removed.length} expired event item(s): ${removed.map((item) => item.id).join(", ")}.`);
      log.push(`Removed ${removed.length} expired item(s) from ${section}.`);
    } else if (removed.length && !kept.length) {
      sectionOps[section].status = "stale";
      sectionOps[section].errors.push(`All ${removed.length} event item(s) looked expired; preserved prior section for manual review instead of emptying it.`);
      log.push(`Preserved ${section}; every item looked expired and emptying the section would be unsafe.`);
    }

    if (preservedForReview.length) {
      sectionOps[section].warnings.push(`${preservedForReview.length} event item(s) had ambiguous lifecycle and were preserved for review.`);
    }
  }
}

function reviewPromoLifecycle(data, sectionOps) {
  const promos = data.promos || [];
  const missingLifecycle = promos.filter((item) => !item.validUntil && !item.endsAt && !item.activeUntil && !item.reviewAfter && !item.refreshAfter);
  if (missingLifecycle.length) {
    sectionOps.promos.warnings.push(`${missingLifecycle.length} promo item(s) do not have explicit expiry/reviewAfter metadata.`);
  }
}

function createSectionOps() {
  return Object.fromEntries(Object.keys(SECTION_CONFIG).map((section) => [section, {
    status: SECTION_CONFIG[section].status,
    itemsAdded: 0,
    itemsUpdated: 0,
    itemsRemoved: 0,
    warnings: [],
    errors: []
  }]));
}

function sectionSources(data, section) {
  if (section === "hoy.worldCup") {
    return [data.hoy?.worldCup?.sourceName || "ESPN / FIFA"].filter(Boolean);
  }
  return [...new Set((itemCollections(data)[section] || []).map((item) => item.sourceName || item.sourceUrl).filter(Boolean))];
}

function addPlatformMeta(data, nowIso, sectionOps, worldCupUpdated) {
  const previousSections = data.platformMeta?.sections || {};
  const sections = {};
  for (const [section, config] of Object.entries(SECTION_CONFIG)) {
    const previous = previousSections[section]?.freshness || {};
    const ops = sectionOps[section];
    const status = section === "hoy.worldCup"
      ? (worldCupUpdated ? "fresh" : ops.status === "failed" ? "failed" : "preserved")
      : ops.status;
    const expiresAt = section === "hoy.worldCup" ? data.hoy?.worldCup?.activeUntil || null : null;
    sections[section] = {
      timeSensitive: config.timeSensitive,
      automated: config.automated,
      freshness: {
        updatedAt: status === "fresh" || ops.itemsUpdated || ops.itemsRemoved ? nowIso : previous.updatedAt || data.updatedAt || data.generatedAt || nowIso,
        source: status === "fresh" && section === "hoy.worldCup" ? "espn" : config.source,
        status,
        lastSuccessfulRefreshAt: status === "fresh" ? nowIso : previous.lastSuccessfulRefreshAt || null,
        expiresAt,
        notes: config.notes
      }
    };
  }
  data.platformMeta = {
    schemaVersion: 1,
    generatedAt: nowIso,
    timeZone: CANCUN_TIME_ZONE,
    sections
  };
}

function buildRefreshReport(data, nowIso, mode, sectionOps, worldCupUpdated, log) {
  const sections = {};
  for (const section of Object.keys(SECTION_CONFIG)) {
    const meta = data.platformMeta.sections[section].freshness;
    const items = section === "hoy.worldCup" ? data.hoy?.worldCup?.today?.matches || [] : itemCollections(data)[section] || [];
    const ops = sectionOps[section];
    const status = meta.status;
    sections[section] = {
      status,
      updatedAt: meta.updatedAt,
      lastSuccessfulRefreshAt: meta.lastSuccessfulRefreshAt,
      sources: sectionSources(data, section),
      itemsAdded: ops.itemsAdded,
      itemsUpdated: ops.itemsUpdated,
      itemsRemoved: ops.itemsRemoved,
      itemsPreserved: Math.max(0, items.length - ops.itemsAdded - ops.itemsUpdated),
      warnings: ops.warnings,
      errors: ops.errors
    };
  }
  const errors = Object.values(sections).flatMap((section) => section.errors || []);
  const requiredFailure = data.hoy?.worldCup && isTemporalFeatureActive(data.hoy.worldCup) && !worldCupUpdated;
  return {
    generatedAt: nowIso,
    runMode: mode,
    overallStatus: errors.length || requiredFailure ? "failed" : "success",
    sections,
    log
  };
}

function assertPlatformShape(data, label) {
  if (!data || typeof data !== "object") throw new Error(`${label} must be a JSON object`);
  if (!data.hoy || typeof data.hoy !== "object") throw new Error(`${label}.hoy is missing`);
  if (!data.hoy.hero) throw new Error(`${label}.hoy.hero is missing`);
  if (!Array.isArray(data.hoy.signals) || data.hoy.signals.length !== 3) {
    throw new Error(`${label}.hoy.signals must contain exactly 3 signals`);
  }
  for (const section of ["today", "week", "promos", "events"]) {
    const items = section === "today" ? data.hoy.today : data[section];
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(`${label}.${section} must be a non-empty array`);
    }
  }
}

function assertCandidateShape(data, label) {
  if (!data || typeof data !== "object") throw new Error(`${label} must be a JSON object`);
  if (!data.hoy || typeof data.hoy !== "object") throw new Error(`${label}.hoy is missing`);
  if (!data.hoy.hero) throw new Error(`${label}.hoy.hero is missing`);
  if (!Array.isArray(data.hoy.signals) || data.hoy.signals.length !== 3) {
    throw new Error(`${label}.hoy.signals must contain exactly 3 signals`);
  }
  if (!Array.isArray(data.hoy.today) || data.hoy.today.length === 0) {
    throw new Error(`${label}.hoy.today must be a non-empty array`);
  }
  for (const section of ["week", "promos", "events"]) {
    if (!Array.isArray(data[section]) || data[section].length === 0) {
      throw new Error(`${label}.${section} must be a non-empty array`);
    }
  }
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function linkTexts(value) {
  const clean = String(value || "").replace(/!\[[^\]]*]\([^)]+\)/g, "");
  return [...clean.matchAll(/\[([^\]]+)]\([^)]+\)/g)]
    .map((match) => stripMarkdown(match[1]))
    .filter(Boolean);
}

function extractTeam(cell, fallbackIndex = 0) {
  const texts = linkTexts(cell).filter((text) => !/^v$/i.test(text));
  const team = texts[texts.length - 1] || stripMarkdown(cell).split(/\s+/)[fallbackIndex] || "";
  return TEAM_NAME_ES.get(team) || team;
}

function parseEnglishScheduleDate(line) {
  const match = String(line || "").match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;
  const month = ENGLISH_MONTHS.get(match[2].toLowerCase());
  if (month === undefined) return null;
  return {
    year: Number(match[4]),
    month,
    day: Number(match[3])
  };
}

function extractTimeText(cell) {
  const text = stripMarkdown(cell);
  const match = text.match(/\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i);
  return match ? match[0].toUpperCase().replace(/\s+/, " ") : "";
}

function extractChannel(cell) {
  const text = stripMarkdown(cell);
  if (/\bFS1\b/.test(text)) return "FS1";
  if (/\bFOX\b/.test(text)) return "FOX";
  return text.split(/\s+/)[0] || "";
}

function convertEasternTimeToCancun(dateParts, timeText) {
  const match = String(timeText || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;

  const utcMs = Date.UTC(dateParts.year, dateParts.month, dateParts.day, hour + 4, minute, 0);
  const timeParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: CANCUN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
  const isoDate = `${timeParts.year}-${timeParts.month}-${timeParts.day}`;
  const time = `${timeParts.hour}:${timeParts.minute}`;
  return {
    isoDate,
    time,
    kickoff: `${isoDate}T${time}:00${CANCUN_OFFSET}`
  };
}

function parseWorldCupScheduleMarkdown(markdown) {
  const grouped = new Map();
  let currentDate = null;

  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const dateParts = parseEnglishScheduleDate(line);
    if (dateParts) {
      currentDate = dateParts;
      continue;
    }

    if (!currentDate || !line.startsWith("|") || line.includes("---") || /\|\s*MATCH\s*\|/i.test(line)) {
      continue;
    }

    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 4) continue;

    const firstTeam = extractTeam(cells[0]);
    const secondTeam = extractTeam(cells[1]);
    const timeText = extractTimeText(cells[2]);
    const converted = convertEasternTimeToCancun(currentDate, timeText);
    if (!firstTeam || !secondTeam || !converted) continue;

    const match = {
      time: converted.time,
      teams: `${firstTeam} vs ${secondTeam}`,
      channel: extractChannel(cells[3]),
      kickoff: converted.kickoff
    };
    const items = grouped.get(converted.isoDate) || [];
    items.push(match);
    grouped.set(converted.isoDate, items);
  }

  return grouped;
}

async function loadWorldCupMarkdown(args, log) {
  if (args["worldcup-markdown"]) {
    const file = String(args["worldcup-markdown"]);
    log.push(`Loaded World Cup schedule markdown from ${file}.`);
    return readFileSync(path.resolve(root, file), "utf8");
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    if (process.env.GITHUB_ACTIONS !== "true" && fileExists(LOCAL_WORLDCUP_FIXTURE)) {
      log.push(`Loaded local World Cup schedule fixture from ${LOCAL_WORLDCUP_FIXTURE}; no secret value was read.`);
      return readFileSync(path.resolve(root, LOCAL_WORLDCUP_FIXTURE), "utf8");
    }
    log.push("Skipped Firecrawl World Cup ingestion because FIRECRAWL_API_KEY is not configured.");
    return "";
  }

  const response = await fetch(`${FIRECRAWL_API_URL.replace(/\/$/, "")}/v2/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url: ESPN_WORLD_CUP_URL,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 60000
    })
  });

  if (!response.ok) {
    throw new Error(`Firecrawl World Cup scrape failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  const markdown = payload?.data?.markdown || payload?.markdown || "";
  if (!payload?.success || markdown.length < 1000) {
    throw new Error("Firecrawl World Cup scrape returned no usable markdown");
  }
  log.push(`Loaded World Cup schedule through Firecrawl from ${ESPN_WORLD_CUP_URL}.`);
  return markdown;
}

function applyWorldCupSchedule(worldCup, schedule, now, log) {
  if (!worldCup || typeof worldCup !== "object" || !(schedule instanceof Map) || !schedule.size) return false;
  const todayIso = cancunParts(now).isoDate;
  const todayMatches = schedule.get(todayIso) || [];
  const dayGroups = [];

  for (let offset = 0; offset < 14 && dayGroups.length < 6; offset += 1) {
    const isoDate = isoDateFromCancunDayOffset(todayIso, offset);
    const matches = schedule.get(isoDate);
    if (matches?.length) {
      dayGroups.push({
        label: shortCancunDateLabel(isoDate),
        matches
      });
    }
  }

  if (!todayMatches.length || dayGroups.length < 6) {
    log.push(
      `Preserved existing World Cup module; parsed schedule had ${todayMatches.length} today matches and ${dayGroups.length} future day groups.`
    );
    return false;
  }

  worldCup.sourceName = "ESPN / FIFA";
  worldCup.sourceUrl = ESPN_WORLD_CUP_URL;
  worldCup.sourceType = "official";
  worldCup.confidence = "high";
  if (process.env.FIRECRAWL_API_KEY) {
    worldCup.verifiedAt = cancunNowIso(now);
    worldCup.extractionMethod = "firecrawl";
  } else {
    delete worldCup.verifiedAt;
    worldCup.extractionMethod = "firecrawl_fixture";
  }
  worldCup.today = {
    label: cancunDateLabel(todayIso),
    matches: todayMatches
  };
  worldCup.days = dayGroups;
  log.push(`Updated World Cup module from parsed schedule: ${todayMatches.length} matches today, ${dayGroups.length} day groups.`);
  return true;
}

function isTemporalFeatureActive(module = {}, now = new Date()) {
  const startTs = Date.parse(module.activeFrom || "");
  const untilTs = Date.parse(module.activeUntil || "");
  const nowTs = now.getTime();
  if (Number.isFinite(startTs) && nowTs < startTs) return false;
  if (Number.isFinite(untilTs) && nowTs > untilTs) return false;
  return true;
}

function sameCancunDate(a, b) {
  return cancunParts(a).isoDate === cancunParts(b).isoDate;
}

function updateWorldCupToday(worldCup, now, log) {
  if (!worldCup || typeof worldCup !== "object") return;
  const todayIso = cancunParts(now).isoDate;
  const expectedLabel = cancunDateLabel(todayIso);
  const currentLabel = worldCup.today?.label || "";
  const currentMatches = Array.isArray(worldCup.today?.matches) ? worldCup.today.matches : [];
  const matchingKickoffRows = currentMatches.filter((match) => {
    const kickoffTs = Date.parse(match.kickoff || "");
    return Number.isFinite(kickoffTs) && sameCancunDate(new Date(kickoffTs), now);
  });

  if (!worldCup.today || typeof worldCup.today !== "object") {
    worldCup.today = { label: expectedLabel, matches: [] };
    log.push("Created missing worldCup.today container.");
    return;
  }

  if (currentMatches.length && matchingKickoffRows.length === currentMatches.length) {
    if (currentLabel !== expectedLabel) {
      worldCup.today.label = expectedLabel;
      log.push(`Updated worldCup.today.label to ${expectedLabel}.`);
    } else {
      log.push("World Cup today label already matches Cancun date.");
    }
    return;
  }

  if (!currentMatches.length) {
    worldCup.today.label = expectedLabel;
    log.push(`Updated empty worldCup.today label to ${expectedLabel}; no matches were added automatically.`);
    return;
  }

  const normalizedExpected = normalizeDateLabel(expectedLabel);
  const normalizedCurrent = normalizeDateLabel(currentLabel);
  if (normalizedCurrent !== normalizedExpected) {
    log.push(
      `Preserved worldCup.today.label (${currentLabel}) because today's approved matches do not all match ${todayIso}.`
    );
  } else {
    log.push("Preserved World Cup today matches after date check.");
  }
}

function updateGeneratedAt(data, field, nowIso, log, label) {
  if (data[field] !== nowIso) {
    data[field] = nowIso;
    log.push(`Updated ${label}.${field} to ${nowIso}.`);
  }
}

function assertFreshEnough(data, now, label) {
  const updatedAt = Date.parse(data.updatedAt || data.generatedAt || "");
  if (!Number.isFinite(updatedAt)) {
    throw new Error(`${label} is missing a valid updatedAt/generatedAt timestamp`);
  }
  const ageHours = (now.getTime() - updatedAt) / (60 * 60 * 1000);
  if (ageHours > STALE_HOURS_LIMIT) {
    throw new Error(`${label} is stale: ${ageHours.toFixed(1)} hours old`);
  }
}

async function run() {
  const args = parseArgs();
  const now = args.now ? new Date(String(args.now)) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${args.now}`);

  const candidatesPath = String(args.candidates || "data/platform-candidates.json");
  const platformPath = String(args.out || "data/platform.json");
  const reportPath = String(args.report || "data/platform-refresh-report.json");
  const sourcePath = String(args.source || "data/source-research.json");
  const nowIso = cancunNowIso(now);
  const log = [];
  const candidateSectionOps = createSectionOps();
  const platformSectionOps = createSectionOps();
  const worldCupMarkdown = await loadWorldCupMarkdown(args, log);
  const worldCupSchedule = worldCupMarkdown ? parseWorldCupScheduleMarkdown(worldCupMarkdown) : new Map();
  if (worldCupSchedule.size) {
    log.push(`Parsed World Cup schedule for ${worldCupSchedule.size} Cancun dates.`);
  }

  const candidates = readJson(candidatesPath);
  assertCandidateShape(candidates, candidatesPath);
  const worldCupActive = isTemporalFeatureActive(candidates.hoy.worldCup, now);
  if (worldCupActive && !worldCupSchedule.size) {
    if (process.env.GITHUB_ACTIONS === "true") {
      throw new Error("World Cup module is active, but no fresh Firecrawl schedule was available.");
    }
    candidateSectionOps["hoy.worldCup"].status = "preserved";
    candidateSectionOps["hoy.worldCup"].warnings.push("Local run preserved World Cup data because no Firecrawl key or fixture schedule was available.");
  }
  const candidateWorldCupUpdated = applyWorldCupSchedule(candidates.hoy.worldCup, worldCupSchedule, now, log);
  if (worldCupActive && !candidateWorldCupUpdated) {
    if (process.env.GITHUB_ACTIONS === "true") {
      throw new Error("World Cup module is active, but parsed schedule was insufficient to refresh today's matches.");
    }
    candidateSectionOps["hoy.worldCup"].status = "preserved";
    candidateSectionOps["hoy.worldCup"].warnings.push("Local run preserved World Cup data because parsed schedule was insufficient.");
  }
  updateGeneratedAt(candidates, "generatedAt", nowIso, log, candidatesPath);
  updateWorldCupToday(candidates.hoy.worldCup, now, log);
  updateTodayCardDates(candidates, now, log, candidateSectionOps);
  filterExpiredEvents(candidates, now, log, candidateSectionOps);
  reviewPromoLifecycle(candidates, candidateSectionOps);
  applyTrustFields(candidates);
  addPlatformMeta(candidates, nowIso, candidateSectionOps, candidateWorldCupUpdated);
  assertFreshEnough(candidates, now, candidatesPath);
  writeJson(candidatesPath, candidates);

  const platform = readJson(platformPath);
  assertPlatformShape(platform, platformPath);
  const platformWorldCupUpdated = applyWorldCupSchedule(platform.hoy.worldCup, worldCupSchedule, now, log);
  if (worldCupActive && !platformWorldCupUpdated) {
    if (process.env.GITHUB_ACTIONS === "true") {
      throw new Error("World Cup module is active, but platform data could not be refreshed from parsed schedule.");
    }
    platformSectionOps["hoy.worldCup"].status = "preserved";
    platformSectionOps["hoy.worldCup"].warnings.push("Local run preserved World Cup data because parsed schedule was insufficient.");
  }
  updateGeneratedAt(platform, "updatedAt", nowIso, log, platformPath);
  updateWorldCupToday(platform.hoy.worldCup, now, log);
  updateTodayCardDates(platform, now, log, platformSectionOps);
  filterExpiredEvents(platform, now, log, platformSectionOps);
  reviewPromoLifecycle(platform, platformSectionOps);
  applyTrustFields(platform);
  addPlatformMeta(platform, nowIso, platformSectionOps, platformWorldCupUpdated);
  assertFreshEnough(platform, now, platformPath);
  writeJson(platformPath, platform);
  writeJson(reportPath, buildRefreshReport(platform, nowIso, runMode(), platformSectionOps, platformWorldCupUpdated, log));

  console.log("Daily platform refresh complete.");
  for (const entry of log) console.log(`- ${entry}`);
  console.log("Preserved existing non-World-Cup content sections.");
  console.log(`Candidate source file preserved for later ingestion review: ${sourcePath}.`);
  console.log("TODO: expand Firecrawl-backed ingestion into data/source-research.json for cards/promos/events.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
