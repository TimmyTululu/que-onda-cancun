#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const CANCUN_TIME_ZONE = "America/Cancun";
const CANCUN_OFFSET = "-05:00";
const STALE_HOURS_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || "https://api.firecrawl.dev";
const ESPN_WORLD_CUP_URL = "https://www.espn.com/soccer/schedule/_/league/fifa.world";
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
  const sourcePath = String(args.source || "data/source-research.json");
  const nowIso = cancunNowIso(now);
  const log = [];
  const worldCupMarkdown = await loadWorldCupMarkdown(args, log);
  const worldCupSchedule = worldCupMarkdown ? parseWorldCupScheduleMarkdown(worldCupMarkdown) : new Map();
  if (worldCupSchedule.size) {
    log.push(`Parsed World Cup schedule for ${worldCupSchedule.size} Cancun dates.`);
  }

  const candidates = readJson(candidatesPath);
  assertCandidateShape(candidates, candidatesPath);
  const worldCupActive = isTemporalFeatureActive(candidates.hoy.worldCup, now);
  if (worldCupActive && !worldCupSchedule.size) {
    throw new Error("World Cup module is active, but no fresh Firecrawl schedule was available.");
  }
  const candidateWorldCupUpdated = applyWorldCupSchedule(candidates.hoy.worldCup, worldCupSchedule, now, log);
  if (worldCupActive && !candidateWorldCupUpdated) {
    throw new Error("World Cup module is active, but parsed schedule was insufficient to refresh today's matches.");
  }
  updateGeneratedAt(candidates, "generatedAt", nowIso, log, candidatesPath);
  updateWorldCupToday(candidates.hoy.worldCup, now, log);
  assertFreshEnough(candidates, now, candidatesPath);
  writeJson(candidatesPath, candidates);

  const platform = readJson(platformPath);
  assertPlatformShape(platform, platformPath);
  const platformWorldCupUpdated = applyWorldCupSchedule(platform.hoy.worldCup, worldCupSchedule, now, log);
  if (worldCupActive && !platformWorldCupUpdated) {
    throw new Error("World Cup module is active, but platform data could not be refreshed from parsed schedule.");
  }
  updateGeneratedAt(platform, "updatedAt", nowIso, log, platformPath);
  updateWorldCupToday(platform.hoy.worldCup, now, log);
  assertFreshEnough(platform, now, platformPath);
  writeJson(platformPath, platform);

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
