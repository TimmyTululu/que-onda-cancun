#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

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
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const content = readFileSync(absolutePath, "utf8");
  return { absolutePath, data: JSON.parse(content), source: content };
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateImageReference(value, tag, field, results) {
  const image = String(value || "").trim();
  if (!image) {
    pushIssue(results, "errors", tag, field, "missing");
    return;
  }
  if (image.startsWith("/")) {
    const localPath = image.split("?")[0].replace(/^\//, "");
    if (!existsSync(path.join(root, localPath))) {
      pushIssue(results, "errors", tag, field, `missing local asset (${image})`);
    }
    return;
  }
  if (!isHttpUrl(image)) {
    pushIssue(results, "errors", tag, field, "must be a local absolute path or valid URL");
  }
}

function validateGallery(gallery, tag, results) {
  if (!Array.isArray(gallery)) return;
  if (gallery.length < 2) {
    pushIssue(results, "errors", tag, "gallery", "must contain at least two slides");
    return;
  }
  const imageKeys = gallery.map((slide) => String(slide.image || "").split("?")[0]);
  if (new Set(imageKeys).size !== gallery.length) {
    pushIssue(results, "errors", tag, "gallery", "must use distinct image assets");
  }
  gallery.forEach((slide, index) => {
    const slideTag = `${tag}.gallery[${index}]`;
    validateImageReference(slide.image, slideTag, "image", results);
    if (String(slide.imageFit || "").toLowerCase() === "contain") {
      pushIssue(results, "errors", slideTag, "imageFit", "must not be contain");
    }
  });
}

function formatError(tag, field, message) {
  return `${tag}.${field} -> ${message}`;
}

function pushIssue(results, level, tag, field, message) {
  results[level].push(formatError(tag, field, message));
}

function isGenericCopy(value) {
  const patterns = [
    /restaurante\s+premium\s+para\s+una\s+comida\s+cuidada/i,
    /mesa\s+recomendada/i,
    /plan\s+completo/i,
    /algo\s+que\s+hacer\s+siempre/i,
    /opción\s+versátil\s+de\s+fondo/i
  ];
  return patterns.some((pattern) => pattern.test(String(value || "")));
}

function invalidHours(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (/\btbd\b|\bpendiente\b|\bsin\s+definir\b|\bn\/a\b|\bna\b|por\s+confirmar/.test(text)) return true;
  if (text.length > 80) return true;
  return false;
}

function validateCard(item, tag, results) {
  const requiredFields = [
    "id", "title", "category", "date", "time", "dateTime", "location",
    "neighborhood", "image", "sourceUrl", "sourceName", "freshness",
    "ctaLabel", "ctaUrl", "description", "priority"
  ];

  for (const field of requiredFields) {
    if (!item || item[field] === undefined || item[field] === "") {
      pushIssue(results, "errors", tag, field, "missing required field");
    }
  }

  if (String(item.imageFit || "").toLowerCase() === "contain") {
    pushIssue(results, "errors", tag, "imageFit", "must be cover-or-unset, not contain");
  }

  if ((item.title || "").length > 58) {
    pushIssue(results, "errors", tag, "title", `too long (${String(item.title || "").length})`);
  }

  if ((item.description || "").length > 120) {
    pushIssue(results, "errors", tag, "description", `too long (${String(item.description || "").length})`);
  }

  if (isGenericCopy(item.title) || isGenericCopy(item.description)) {
    pushIssue(results, "errors", tag, "copy", "generic/low-signal wording");
  }

  if (invalidHours(item.time)) {
    pushIssue(results, "errors", tag, "time", `invalid hour format/value (${item.time})`);
  }

  if (invalidHours(item.dateTime)) {
    pushIssue(results, "errors", tag, "dateTime", `invalid hour format/value (${item.dateTime})`);
  }

  if (!item.ctaLabel || !item.ctaUrl) {
    pushIssue(results, "errors", tag, "cta", "missing action label or URL");
  }

  if (item.ctaUrl && !isHttpUrl(item.ctaUrl)) {
    pushIssue(results, "errors", tag, "ctaUrl", "must be a valid http/https URL");
  }
  if (item.sourceUrl && !isHttpUrl(item.sourceUrl)) {
    pushIssue(results, "errors", tag, "sourceUrl", "must be a valid http/https URL");
  }

  if ((item.ctaLabel || "").toLowerCase() === "reservar" &&
      item.mapUrl &&
      item.ctaUrl === item.mapUrl
  ) {
    pushIssue(results, "errors", tag, "ctaUrl", "Reserva action cannot be map URL");
  }

  validateImageReference(item.image, tag, "image", results);
  validateGallery(item.gallery, tag, results);
}

function validateSignals(signals, tag, results) {
  if (!Array.isArray(signals)) {
    pushIssue(results, "errors", tag, "signals", "must be an array");
    return;
  }

  if (signals.length !== 3) {
    pushIssue(results, "errors", tag, "signals", "must contain exactly 3 signal cards");
  }

  for (const [index, signal] of signals.entries()) {
    const signalTag = `${tag}[${index}]`;
    ["id", "label", "value", "tone", "sourceUrl"].forEach((field) => {
      if (!signal || !signal[field]) {
        pushIssue(results, "errors", signalTag, field, "missing");
      }
    });

    if (!/^(green|yellow|red|blue)$/.test(String(signal.tone || "").trim().toLowerCase())) {
      pushIssue(results, "errors", signalTag, "tone", "invalid value");
    }
    if (!signal.sourceUrl || !isHttpUrl(signal.sourceUrl)) {
      pushIssue(results, "errors", signalTag, "sourceUrl", "invalid URL");
    }
  }
}

function validateWorldCup(module, tag, results) {
  if (!module || typeof module !== "object") {
    pushIssue(results, "errors", tag, "module", "missing world cup module");
    return;
  }

  if (!module.title) {
    pushIssue(results, "errors", tag, "title", "missing");
  }
  if (!module.activeFrom || Number.isNaN(Date.parse(module.activeFrom))) {
    pushIssue(results, "errors", tag, "activeFrom", "invalid or missing");
  }
  if (!module.activeUntil || Number.isNaN(Date.parse(module.activeUntil))) {
    pushIssue(results, "errors", tag, "activeUntil", "invalid or missing");
  }
  if (!module.sourceUrl || !isHttpUrl(module.sourceUrl)) {
    pushIssue(results, "errors", tag, "sourceUrl", "invalid or missing");
  }

  const today = module.today || {};
  if (!Array.isArray(today.matches) || !today.matches.length) {
    pushIssue(results, "errors", tag, "today.matches", "must have at least one match");
  } else {
    for (const [matchIndex, match] of today.matches.entries()) {
      if (!match.time || !match.teams || !match.teams.includes(" vs ")) {
        pushIssue(results, "errors", `${tag}.today.matches[${matchIndex}]`, "match", "invalid match format");
      }
    }
  }

  if (!Array.isArray(module.days) || !module.days.length) {
    pushIssue(results, "errors", tag, "days", "must contain weekly schedule");
  } else {
    for (const [dayIndex, day] of module.days.entries()) {
      if (!day.label) {
        pushIssue(results, "errors", `${tag}.days[${dayIndex}]`, "label", "missing");
      }
      if (!Array.isArray(day.matches) || !day.matches.length) {
        pushIssue(results, "errors", `${tag}.days[${dayIndex}]`, "matches", "must contain matches");
        continue;
      }
      for (const [matchIndex, match] of day.matches.entries()) {
        if (!match.time || !match.teams || !match.teams.includes(" vs ")) {
          pushIssue(results, "errors", `${tag}.days[${dayIndex}].matches[${matchIndex}]`, "match", "invalid match format");
        }
      }
    }
  }
}

function validateCampaign(campaign, tag, results) {
  if (!campaign) return;
  for (const field of [
    "id",
    "status",
    "type",
    "business",
    "label",
    "badgeText",
    "modalTitle",
    "modalCopy",
    "submitLabel",
    "successTitle",
    "code",
    "activeFrom",
    "activeUntil",
    "terms"
  ]) {
    if (!campaign[field]) {
      pushIssue(results, "errors", tag, field, "missing campaign field");
    }
  }
  if (campaign.type && campaign.type !== "coupon") {
    pushIssue(results, "errors", tag, "type", "unsupported campaign type");
  }
  if (campaign.activeFrom && Number.isNaN(Date.parse(campaign.activeFrom))) {
    pushIssue(results, "errors", tag, "activeFrom", "invalid date");
  }
  if (campaign.activeUntil && Number.isNaN(Date.parse(campaign.activeUntil))) {
    pushIssue(results, "errors", tag, "activeUntil", "invalid date");
  }
  if (campaign.code && !/^[A-Z0-9-]{6,14}$/.test(String(campaign.code))) {
    pushIssue(results, "errors", tag, "code", "must be short and waiter-friendly");
  }
}

function addDuplicateLinkChecks(items, section, results) {
  const sourceMap = new Map();
  const ctaMap = new Map();
  for (const item of items) {
    if (item.sourceUrl) {
      const normalized = String(item.sourceUrl).trim().toLowerCase();
      sourceMap.set(normalized, (sourceMap.get(normalized) || 0) + 1);
      if (sourceMap.get(normalized) > 3) {
        pushIssue(results, "warnings", `${section}[${item.id}]`, "sourceUrl", `high repetition (${sourceMap.get(normalized)}x)`);
      }
    }
    if (item.ctaUrl) {
      const normalized = String(item.ctaUrl).trim().toLowerCase();
      ctaMap.set(normalized, (ctaMap.get(normalized) || 0) + 1);
      if (ctaMap.get(normalized) > 3) {
        pushIssue(results, "warnings", `${section}[${item.id}]`, "ctaUrl", `high repetition (${ctaMap.get(normalized)}x)`);
      }
    }
  }
}

function addDuplicateCardCheck(items, section, results) {
  const seen = new Map();
  for (const item of items) {
    const key = `${String(item.title || "").trim().toLowerCase()}|${String(item.location || "").trim().toLowerCase()}`;
    if (!key.includes("|")) continue;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      pushIssue(results, "errors", section, "item", `duplicated title+location (${key})`);
    }
  }
}

function buildApprovedPayload(candidates) {
  return {
    updatedAt: new Date().toISOString(),
    editorialNote: "Approved content generated by validation pipeline",
    schema: candidates.schema,
    hoy: {
      hero: candidates.hoy.hero,
      signals: candidates.hoy.signals,
      worldCup: candidates.hoy.worldCup,
      today: candidates.hoy.today
    },
    week: candidates.week,
    promos: candidates.promos,
    events: candidates.events
  };
}

function validatePipeline(candidateData, sourceData, results) {
  if (!candidateData || typeof candidateData !== "object") {
    pushIssue(results, "errors", "candidate", "root", "must be a JSON object");
    return;
  }

  if (!candidateData.schema) {
    pushIssue(results, "warnings", "candidate", "schema", "missing schema metadata");
  }

  const hero = candidateData.hoy && candidateData.hoy.hero;
  if (!hero) {
    pushIssue(results, "errors", "candidate.hoy", "hero", "missing");
  } else {
    if (!hero.title || !hero.kicker || !hero.ctaUrl || !hero.ctaLabel || !hero.image) {
      pushIssue(results, "errors", "candidate.hoy.hero", "hero", "missing hero critical fields");
    }
    if (hero.title && /de la semana/i.test(hero.title) && /Recomendación de la semana/i.test(hero.kicker || "")) {
      pushIssue(results, "errors", "candidate.hoy.hero.title", "content", "title repeats weekly framing from kicker");
    }
    if (String(hero.imageFit || "").toLowerCase() === "contain") {
      pushIssue(results, "errors", "candidate.hoy.hero", "imageFit", "must not be contain");
    }
    validateImageReference(hero.image, "candidate.hoy.hero", "image", results);
    validateGallery(hero.gallery, "candidate.hoy.hero", results);
    validateCampaign(hero.campaign, "candidate.hoy.hero.campaign", results);
  }

  validateSignals(candidateData.hoy?.signals || [], "candidate.hoy.signals", results);
  validateWorldCup(candidateData.hoy?.worldCup, "candidate.hoy.worldCup", results);

  const hoyCards = Array.isArray(candidateData.hoy?.today) ? candidateData.hoy.today : [];
  const weekCards = Array.isArray(candidateData.week) ? candidateData.week : [];
  const promoCards = Array.isArray(candidateData.promos) ? candidateData.promos : [];
  const eventCards = Array.isArray(candidateData.events) ? candidateData.events : [];

  hoyCards.forEach((item, index) => validateCard(item, `candidate.hoy.today[${index}]`, results));
  weekCards.forEach((item, index) => validateCard(item, `candidate.week[${index}]`, results));
  promoCards.forEach((item, index) => validateCard(item, `candidate.promos[${index}]`, results));
  eventCards.forEach((item, index) => validateCard(item, `candidate.events[${index}]`, results));

  addDuplicateCardCheck(hoyCards, "candidate.hoy.today", results);
  addDuplicateCardCheck(weekCards, "candidate.week", results);
  addDuplicateCardCheck(promoCards, "candidate.promos", results);
  addDuplicateCardCheck(eventCards, "candidate.events", results);

  addDuplicateLinkChecks(hoyCards, "candidate.hoy.today", results);
  addDuplicateLinkChecks(weekCards, "candidate.week", results);
  addDuplicateLinkChecks(promoCards, "candidate.promos", results);
  addDuplicateLinkChecks(eventCards, "candidate.events", results);

  if (!sourceData || !Array.isArray(sourceData.items) || sourceData.items.length === 0) {
    pushIssue(results, "warnings", "source-research", "items", "no raw rows in this run");
  }
  if (Array.isArray(sourceData?.items)) {
    for (const [index, row] of sourceData.items.entries()) {
      if (!row.sourceUrl || !isHttpUrl(row.sourceUrl)) {
        pushIssue(results, "errors", `source-research.items[${index}]`, "sourceUrl", "invalid or missing");
      }
    }
  }
}

function print(results) {
  if (results.errors.length) {
    for (const entry of results.errors) {
      console.log(`ERROR ${entry}`);
    }
  }
  if (results.warnings.length) {
    for (const entry of results.warnings) {
      console.log(`WARN ${entry}`);
    }
  }
}

function run() {
  const args = parseArgs();
  const candidatePath = String(args.candidates || "data/platform-candidates.json");
  const sourcePath = String(args.source || "data/source-research.json");
  const approvedPath = args["approved-output"];
  const source = readJson(sourcePath).data;
  const candidates = readJson(candidatePath).data;
  const results = { errors: [], warnings: [] };

  validatePipeline(candidates, source, results);
  print(results);

  const approved = buildApprovedPayload(candidates);
  if (approvedPath && !results.errors.length) {
    writeFileSync(approvedPath, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
    console.log(`wrote ${approvedPath}`);
  }

  if (results.errors.length > 0) {
    process.exit(1);
  }
}

run();
