#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const SNAPSHOT_START = "<!-- qoc-static-snapshot:start -->";
const SNAPSHOT_END = "<!-- qoc-static-snapshot:end -->";
const JSONLD_START = "<!-- qoc-generated-jsonld:start -->";
const JSONLD_END = "<!-- qoc-generated-jsonld:end -->";
const CANCUN_OFFSET = "-05:00";
const DAY_MS = 24 * 60 * 60 * 1000;

const routes = [
  {
    key: "home",
    file: "index.html",
    url: "https://queondacancun.com/",
    label: "Qué hacer hoy en Cancún",
    description: "Resumen diario de Qué Onda Cancún con planes, eventos, promociones, clima, sargazo y señales locales útiles."
  },
  {
    key: "week",
    file: "esta-semana/index.html",
    url: "https://queondacancun.com/esta-semana/",
    label: "Qué hacer en Cancún esta semana",
    description: "Agenda semanal de Cancún con planes, eventos, promociones y señales locales vigentes."
  },
  {
    key: "events",
    file: "eventos/index.html",
    url: "https://queondacancun.com/eventos/",
    label: "Eventos en Cancún",
    description: "Eventos actuales y no expirados en Cancún, filtrados por el ciclo de vida de la plataforma."
  },
  {
    key: "promos",
    file: "promos/index.html",
    url: "https://queondacancun.com/promos/",
    label: "Promociones en Cancún",
    description: "Promociones activas en Cancún con fuente y metadatos internos de revisión."
  }
];

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    check: args.has("--check")
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(path.resolve(root, filePath), "utf8"));
}

function readText(filePath) {
  return readFileSync(path.resolve(root, filePath), "utf8");
}

function writeText(filePath, value) {
  writeFileSync(path.resolve(root, filePath), value, "utf8");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanText(value, limit = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1).trimEnd();
  const end = clipped.lastIndexOf(" ");
  return `${end > 0 ? clipped.slice(0, end) : clipped}.`;
}

function isoDate(value) {
  const ts = Date.parse(value || "");
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

function parseTimeStart(value) {
  const match = String(value || "").match(/\b(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

function eventStartDate(item) {
  if (!item.date) return "";
  const start = parseTimeStart(item.time) || parseTimeStart(item.dateTime) || { hour: 12, minute: 0 };
  return `${item.date}T${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}:00${CANCUN_OFFSET}`;
}

function parseTimestamp(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : null;
}

function platformDate(data) {
  const fromData = isoDate(data.updatedAt || data.platformMeta?.generatedAt || "");
  if (fromData) return fromData;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Cancun",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentOrFutureDate(item, data) {
  const today = platformDate(data);
  const starts = isoDate(item.date || "");
  const ends = isoDate(item.endDate || item.activeUntil || "");
  return Boolean((ends && ends >= today) || (starts && starts >= today));
}

function activeWorldCup(data) {
  const module = data.hoy?.worldCup;
  const status = data.platformMeta?.sections?.["hoy.worldCup"]?.freshness?.status;
  if (!module || status !== "fresh") return null;
  const nowTs = Date.now();
  const activeFrom = parseTimestamp(module.activeFrom);
  const activeUntil = parseTimestamp(module.activeUntil);
  if (Number.isFinite(activeFrom) && nowTs < activeFrom) return null;
  if (Number.isFinite(activeUntil) && nowTs > activeUntil) return null;
  return module;
}

function currentEvents(data) {
  return (data.events || []).filter((item) =>
    item.lifecycleStatus === "active" &&
    currentOrFutureDate(item, data) &&
    item.title &&
    item.date &&
    item.location &&
    item.sourceUrl &&
    item.confidence !== "low"
  );
}

function activePromos(data) {
  return (data.promos || []).filter((item) =>
    item.lifecycleStatus === "active" &&
    item.title &&
    item.sourceUrl &&
    item.confidence !== "low" &&
    (item.validUntil || item.reviewAfter || item.alwaysOn === true)
  );
}

function currentWeek(data) {
  return (data.week || []).filter((item) =>
    currentOrFutureDate(item, data) &&
    item.title &&
    item.date &&
    item.sourceUrl &&
    item.confidence !== "low"
  );
}

function currentToday(data) {
  return (data.hoy?.today || []).filter((item) =>
    isoDate(item.date || "") === platformDate(data) &&
    item.title &&
    item.date &&
    item.sourceUrl &&
    item.confidence !== "low"
  );
}

function eligibleEventForJsonLd(item) {
  const trustedSource = ["official", "partner", "manual"].includes(item.sourceType) ||
    (item.sourceType === "scraped" && Boolean(item.verifiedAt));
  return Boolean(
    item.lifecycleStatus === "active" &&
    item.title &&
    item.date &&
    eventStartDate(item) &&
    item.location &&
    item.sourceUrl &&
    item.description &&
    ["medium", "high"].includes(item.confidence) &&
    trustedSource
  );
}

function itemLine(item, options = {}) {
  const pieces = [
    item.dateTime || item.time || "",
    item.location || "",
    item.neighborhood || ""
  ].filter(Boolean).join(" · ");
  const source = item.sourceName ? ` Fuente: ${item.sourceName}.` : "";
  const review = options.includeReview && item.reviewAfter ? ` Revisión interna después de ${isoDate(item.reviewAfter)}.` : "";
  return `<li><a href="${escapeHtml(item.sourceUrl || item.ctaUrl || "#")}">${escapeHtml(item.title)}</a>${pieces ? ` — ${escapeHtml(pieces)}.` : "."} ${escapeHtml(cleanText(item.description || "", 140))}${escapeHtml(source)}${escapeHtml(review)}</li>`;
}

function sectionHtml(title, items, options = {}) {
  if (!items.length) return "";
  return [
    `      <section>`,
    `        <h3>${escapeHtml(title)}</h3>`,
    `        <ul>`,
    ...items.map((item) => `          ${itemLine(item, options)}`),
    `        </ul>`,
    `      </section>`
  ].join("\n");
}

function worldCupHtml(module) {
  if (!module?.today?.matches?.length) return "";
  const today = module.today.matches.slice(0, 4).map((match) =>
    `          <li>${escapeHtml(match.time)} — ${escapeHtml(match.teams)}${match.channel ? ` (${escapeHtml(match.channel)})` : ""}</li>`
  ).join("\n");
  return [
    `      <section>`,
    `        <h3>Mundial en hora Cancún</h3>`,
    `        <p>${escapeHtml(module.today.label || "Hoy")}.</p>`,
    `        <ul>`,
    today,
    `        </ul>`,
    `      </section>`
  ].join("\n");
}

function routeItems(routeKey, data) {
  if (routeKey === "home") {
    return {
      today: currentToday(data).slice(0, 5),
      events: currentEvents(data).slice(0, 3),
      promos: activePromos(data).slice(0, 3),
      week: []
    };
  }
  if (routeKey === "week") {
    return {
      today: [],
      events: [],
      promos: [],
      week: currentWeek(data).slice(0, 10)
    };
  }
  if (routeKey === "events") {
    return {
      today: [],
      events: currentEvents(data),
      promos: [],
      week: []
    };
  }
  return {
    today: [],
    events: [],
    promos: activePromos(data),
    week: []
  };
}

function buildSnapshot(route, data) {
  const updatedAt = data.updatedAt || data.platformMeta?.generatedAt || "";
  const items = routeItems(route.key, data);
  const worldCup = route.key === "home" || route.key === "week" ? activeWorldCup(data) : null;
  const blocks = [
    `    <section class="qoc-static-snapshot" aria-label="${escapeHtml(route.label)} resumen estático">`,
    `      <h2>${escapeHtml(route.label)}</h2>`,
    `      <p>${escapeHtml(route.description)}</p>`,
    updatedAt ? `      <p>Última actualización: ${escapeHtml(updatedAt)}.</p>` : "",
    worldCupHtml(worldCup),
    sectionHtml("Hoy", items.today),
    sectionHtml("Esta semana", items.week),
    sectionHtml("Eventos actuales", items.events),
    sectionHtml("Promociones activas", items.promos, { includeReview: true }),
    `    </section>`
  ].filter(Boolean).join("\n");
  return `${SNAPSHOT_START}\n  <noscript>\n${blocks}\n  </noscript>\n${SNAPSHOT_END}`;
}

function itemListJsonLd(route, data) {
  const items = routeItems(route.key, data);
  const list = [
    ...items.today,
    ...items.week,
    ...items.events,
    ...items.promos
  ].map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.title,
    url: item.sourceUrl || item.ctaUrl || route.url,
    description: cleanText(item.description || "", 160)
  }));

  return {
    "@type": "ItemList",
    "@id": `${route.url}#itemlist`,
    name: `${route.label} - Qué Onda Cancún`,
    itemListElement: list
  };
}

function eventJsonLd(data) {
  return currentEvents(data).filter(eligibleEventForJsonLd).map((item) => ({
    "@type": "Event",
    name: item.title,
    startDate: eventStartDate(item),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: item.sourceUrl,
    description: cleanText(item.description, 240),
    location: {
      "@type": "Place",
      name: item.location,
      address: [item.location, item.neighborhood, "Cancún, Quintana Roo, México"].filter(Boolean).join(", ")
    },
    organizer: item.sourceName ? {
      "@type": "Organization",
      name: item.sourceName,
      url: item.sourceUrl
    } : undefined
  }));
}

function buildGeneratedJsonLd(route, data) {
  const graph = [itemListJsonLd(route, data)];
  if (route.key === "events" || route.key === "home") {
    graph.push(...eventJsonLd(data));
  }
  const payload = {
    "@context": "https://schema.org",
    "@graph": graph
  };
  return `${JSONLD_START}\n    <script type="application/ld+json">\n${JSON.stringify(payload, null, 6).split("\n").map((line) => `      ${line}`).join("\n")}\n    </script>\n${JSONLD_END}`;
}

function replaceMarkedBlock(html, start, end, replacement, fallbackPattern) {
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return `${html.slice(0, startIndex)}${replacement}${html.slice(endIndex + end.length)}`;
  }
  const match = html.match(fallbackPattern);
  if (!match) throw new Error(`Could not find insertion point for ${start}`);
  return html.replace(match[0], `${match[0]}\n${replacement}`);
}

function renderRoute(route, data) {
  let html = readText(route.file);
  html = replaceMarkedBlock(
    html,
    JSONLD_START,
    JSONLD_END,
    buildGeneratedJsonLd(route, data),
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/
  );
  html = replaceMarkedBlock(
    html,
    SNAPSHOT_START,
    SNAPSHOT_END,
    buildSnapshot(route, data),
    /<main\b[^>]*><\/main>/
  );
  return `${html.trimEnd()}\n`;
}

function run() {
  const args = parseArgs();
  const data = readJson("data/platform.json");
  readJson("data/platform-refresh-report.json");
  const changed = [];

  for (const route of routes) {
    const next = renderRoute(route, data);
    const current = readText(route.file);
    if (next !== current) {
      changed.push(route.file);
      if (!args.check) writeText(route.file, next);
    }
  }

  if (args.check && changed.length) {
    throw new Error(`Static platform snapshots are stale: ${changed.join(", ")}`);
  }

  if (changed.length) {
    console.log(`Updated static platform snapshots: ${changed.join(", ")}`);
  } else {
    console.log("Static platform snapshots are current.");
  }
}

run();
