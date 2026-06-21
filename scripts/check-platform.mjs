import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const routes = [
  ["Hoy", "index.html", 'data-page="hoy"'],
  ["Esta semana", "esta-semana/index.html", 'data-page="esta-semana"'],
  ["Promos", "promos/index.html", 'data-page="promos"'],
  ["Eventos", "eventos/index.html", 'data-page="eventos"'],
  ["Party", "party/index.html", 'data-page="party"'],
  ["Newsletter", "newsletter/index.html", "Descargar PDF"],
  ["Boletín redirect", "boletin/index.html", "/newsletter/"],
  ["Restaurantes redirect", "restaurantes/index.html", "url=/"],
  ["Beach clubs redirect", "beach-clubs/index.html", "url=/"]
];

const requiredNav = ["Hoy", "Esta semana", "Promos", "Eventos", "Party", "Newsletter", "Contacto"];
const removedNav = ['label: "Inicio"', 'label: "Restaurantes"', 'label: "Beach clubs"', 'href="/restaurantes/"', 'href="/beach-clubs/"'];
const requiredFiles = [
  "scripts/validate-platform-content.mjs",
  "scripts/build-platform-data.mjs",
  "data/source-research.json",
  "data/platform-candidates.json",
  "data/platform-refresh-report.json",
  "api/claim-coupon.js",
  "api/track-interaction.js",
  "scripts/audit-platform-data.mjs",
  "scripts/apply-platform-lifecycle.mjs",
  "scripts/cache-platform-images.mjs",
  "scripts/refresh-platform-data.mjs",
  "scripts/generate-platform-snapshots.mjs",
  "scripts/generate-sponsor-report.mjs",
  ".github/workflows/daily-platform-refresh.yml",
  "llms.txt",
  "robots.txt",
  "sitemap.xml"
];
const platformShellRoutes = [
  "index.html",
  "esta-semana/index.html",
  "promos/index.html",
  "eventos/index.html",
  "party/index.html"
];
const platformVersionString = "20260620f";
const platformBootSrc = "platform-route-boot.js";
const platformVersionContractFiles = [
  "platform-route-boot.js",
  "app.js",
  "index.html",
  "esta-semana/index.html",
  "promos/index.html",
  "eventos/index.html",
  "party/index.html",
  "platform.css",
  "newsletter/index.html"
];
const forbidden = [
  "Lectura rápida",
  "Última referencia disponible",
  "no publicar",
  "data-channel=\"whatsapp\"",
  "WhatsApp</button>",
  "filter-chip",
  "renderFilters"
];
const inlineTransitionAndNavGuards = [
  "pageshow",
  "pagehide",
  "beforeunload",
  "sameOrigin",
  "qoc-route-transition",
  "window.location.assign",
  "site-logo-link",
  "brand-mark",
  "addEventListener(\"click\""
];
const CANCUN_TIME_ZONE = "America/Cancun";
const CANCUN_OFFSET = "-05:00";
const PLATFORM_STALE_HOURS_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const requiredFreshnessSections = [
  "hoy.hero",
  "hoy.signals",
  "hoy.worldCup",
  "hoy.today",
  "hoy.week",
  "hoy.events",
  "week",
  "promos",
  "events",
  "party"
];
const validSectionStatuses = new Set(["fresh", "preserved", "stale", "failed", "manual"]);
const validSourceTypes = new Set(["official", "partner", "scraped", "manual", "unknown"]);
const validConfidenceLevels = new Set(["high", "medium", "low"]);
const validImageFits = new Set(["cover", "contain"]);
const validImageKinds = new Set(["photo", "poster", "flyer", "logo", "banner", "text_art", "fallback", "unknown"]);
const validImageQualities = new Set(["good", "acceptable", "poor", "missing", "unknown"]);
const trustedHighConfidenceSourceTypes = new Set(["official", "partner", "manual"]);
const validPromoLifecycleStatuses = new Set(["active", "expired", "needs_review", "preserved", "manual"]);
const promoAlwaysOnSourceTypes = new Set(["official", "partner", "manual"]);
const weekdayIndex = new Map([
  ["dom", 0],
  ["lun", 1],
  ["mar", 2],
  ["mie", 3],
  ["jue", 4],
  ["vie", 5],
  ["sab", 6]
]);

function routeLabelFor(file) {
  if (file === "index.html") return "Hoy";
  if (file === "esta-semana/index.html") return "Esta semana";
  if (file === "promos/index.html") return "Promos";
  if (file === "eventos/index.html") return "Eventos";
  return file;
}

function assertBootShellContract() {
  for (const file of platformShellRoutes) {
    const html = read(file);
    const label = routeLabelFor(file);

    assert(
      /<html[^>]*class="[^"]*\bqoc-booting\b[^"]*"/i.test(html),
      `${label} shell must include class="qoc-booting" on <html>`
    );
    assert(
      html.includes("<script src=\"/platform-route-boot.js\"></script>"),
      `${label} shell must include shared route boot script`
    );
    assert(!/\/platform\.css\?v=/.test(html), `${label} shell must not hardcode versioned platform.css`);
    assert(!/\/app\.js\?v=/.test(html), `${label} shell must not hardcode versioned app.js`);

    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of inlineScripts) {
      const scriptBody = match[1] || "";
      for (const token of inlineTransitionAndNavGuards) {
        assert(
          !scriptBody.includes(token),
          `${label} shell contains duplicated boot/nav/BFCache logic in inline script (${token})`
        );
      }
    }
  }
}

function assertPlatformVersionContract() {
  const boot = read(platformBootSrc);
  const app = read("app.js");
  const bootVersionMatch = boot.match(/PLATFORM_VERSION\s*=\s*["']([^"']+)["']/);
  assert(bootVersionMatch, `platform-route-boot.js must declare PLATFORM_VERSION`);
  assert(bootVersionMatch[1] === platformVersionString, `platform-route-boot.js PLATFORM_VERSION must be ${platformVersionString}`);

  for (const file of platformVersionContractFiles) {
    if (file === platformBootSrc) continue;
    const content = read(file);
    const count = (content.match(new RegExp(platformVersionString, "g")) || []).length;
    assert(
      count === 0,
      `Platform version string ${platformVersionString} should be centralized in ${platformBootSrc} only (found in ${file})`
    );
  }

  assert(
    /const\s+DATA_VERSION\s*=\s*["']/.test(app) === false,
    "app.js must not hardcode DATA_VERSION; it should resolve dynamically"
  );
  assert(app.includes("function resolvePlatformVersion()"), "app.js must resolve DATA_VERSION dynamically");
  assert(app.includes('const DATA_VERSION_QUERY = DATA_VERSION ? `?v=${encodeURIComponent(DATA_VERSION)}` : "";'),
    "app.js must build DATA_VERSION_QUERY from resolved platform version"
  );
  assert(app.includes("return `/data/platform.json${DATA_VERSION_QUERY}`"), "data/platform.json fetch URL must include platform version query");
  assert(!/fetch\(["']\/data\/platform\.json["']/.test(app), "app.js must use versioned platform data fetch path");
  assert(app.includes("window.__qocPlatform"), "app.js must consume centralized boot version metadata fallback");
}

function assertBootDuplicationContract() {
  const platformBoot = read(platformBootSrc);
  const bootPageshow = platformBoot.match(/pageshow|pagehide|beforeunload|sameOrigin|qoc-route-transition/g);
  assert(bootPageshow, "platform boot script must include nav transition / BFCache guard logic");

  for (const file of [...platformShellRoutes, "app.js", "newsletter/index.html"]) {
    const content = read(file);
    const label = routeLabelFor(file) || file;

    assert(!/window\.addEventListener\(\s*["']pageshow["']/.test(content), `${label} must not register pageshow handler outside boot`);
    assert(!/window\.addEventListener\(\s*["']pagehide["']/.test(content), `${label} must not register pagehide handler outside boot`);
    assert(!/window\.addEventListener\(\s*["']beforeunload["']/.test(content), `${label} must not register beforeunload handler outside boot`);
    assert(!/sameOrigin\(/.test(content), `${label} must not contain duplicated same-origin nav hardening`);
    if (!file.endsWith(".js")) {
      assert(!/qoc-route-transition/.test(content), `${label} must not contain duplicated qoc-route-transition handling`);
    }
    if (file === "app.js") {
      assert(!/window\.location\.assign\(/.test(content), "app.js must not implement boot-style same-origin nav hardening");
      assert(
        !/classList\.add\(\s*["']qoc-route-transition["']/.test(content),
        "app.js must not own qoc-route-transition transition add/remove logic"
      );
    }
  }

  const newsletter = read("newsletter/index.html");
  assert(!/qoc-booting/.test(newsletter), "Newsletter must not use route boot class state");
}

function assertLoadingContract() {
  for (const file of ["app.js", "platform.css", ...platformShellRoutes]) {
    const content = read(file);
    assert(!/loading-card/.test(content), `${file} must not reference removed .loading-card UI`);
  }
}

function assertNewsletterIsolation() {
  const newsletter = read("newsletter/index.html");
  assert(!newsletter.includes("/platform-route-boot.js"), "newsletter should not include platform-route-boot.js");
  assert(!newsletter.includes("qoc-booting"), "newsletter should not include route boot shielding class");
  assert(!newsletter.includes("qoc-route-transition"), "newsletter should not include qoc route transition shielding");
  assert(!newsletter.includes("pageshow"), "newsletter should not include pageshow logic");
  assert(!newsletter.includes("pagehide"), "newsletter should not include pagehide logic");
  assert(!newsletter.includes("beforeunload"), "newsletter should not include beforeunload logic");
}

function assertDailyAutomationContract() {
  const workflow = read(".github/workflows/daily-platform-refresh.yml");
  const refreshScript = read("scripts/refresh-platform-data.mjs");

  assert(workflow.includes('cron: "0 6 * * *"'), "Daily refresh must run at 06:00 UTC / 01:00 Cancun");
  assert(workflow.includes("workflow_dispatch:"), "Daily refresh must allow manual workflow_dispatch runs");
  assert(workflow.includes("node scripts/refresh-platform-data.mjs"), "Daily workflow must run the refresh script");
  assert(workflow.includes("node scripts/generate-platform-snapshots.mjs"), "Daily workflow must generate static platform snapshots after refresh");
  assert(workflow.includes("node --check app.js"), "Daily workflow must syntax-check app.js");
  assert(workflow.includes("node --check scripts/generate-platform-snapshots.mjs"), "Daily workflow must syntax-check snapshot generator");
  assert(workflow.includes("node scripts/check-platform.mjs"), "Daily workflow must run platform checks");
  assert(workflow.includes("node scripts/check-newsletter.mjs"), "Daily workflow must run newsletter checks");
  assert(workflow.includes("git add data/platform.json data/platform-candidates.json data/platform-refresh-report.json index.html esta-semana/index.html eventos/index.html promos/index.html party/index.html"), "Daily workflow must commit intended data/report/snapshot files only");
  assert(workflow.includes("data/platform-refresh-report.json"), "Daily workflow must include platform refresh report in diff/commit path");
  assert(workflow.includes("FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}"), "Daily workflow must read FIRECRAWL_API_KEY from Actions secrets");
  assert(!/echo\s+["']?\$FIRECRAWL_API_KEY/.test(workflow), "Daily workflow must not print FIRECRAWL_API_KEY");
  assert(!/secrets\.FIRECRAWL_API_KEY[^}\n]*>>/.test(workflow), "Daily workflow must not write FIRECRAWL_API_KEY to logs/files");
  assert(!/git add \./.test(workflow), "Daily workflow must not blindly commit the whole repo");

  assert(refreshScript.includes("FIRECRAWL_API_KEY"), "Refresh script must gate Firecrawl ingestion on FIRECRAWL_API_KEY");
  assert(refreshScript.includes("/v2/scrape"), "Refresh script must use Firecrawl scrape for source gathering");
  assert(refreshScript.includes("ESPN_WORLD_CUP_URL"), "Refresh script must keep the World Cup source URL explicit");
  assert(refreshScript.includes("Preserved existing non-World-Cup content sections"), "Refresh script must preserve non-World-Cup content");
  assert(refreshScript.includes("assertPlatformShape"), "Refresh script must validate platform data shape before writing");
  assert(refreshScript.includes("assertFreshEnough"), "Refresh script must enforce freshness before publishing data");
  assert(refreshScript.includes("platform-refresh-report.json"), "Refresh script must write platform-refresh-report.json");
  assert(refreshScript.includes("platformMeta"), "Refresh script must write section-level platformMeta freshness data");
  assert(refreshScript.includes("sourceType") && refreshScript.includes("confidence"), "Refresh script must add source trust metadata");
  assert(refreshScript.includes("World Cup module is active, but no fresh Firecrawl schedule was available"), "Refresh script must fail safely when active World Cup data cannot be refreshed");
}

function assertSnapshotContract() {
  const result = spawnSync(process.execPath, ["scripts/generate-platform-snapshots.mjs", "--check"], {
    cwd: root,
    encoding: "utf8"
  });
  assert(result.status === 0, `Static platform snapshots are stale or invalid: ${result.stderr || result.stdout}`);

  const data = readJson("data/platform.json");
  const dataDate = parseTimestamp(data.updatedAt) ? cancunParts(new Date(data.updatedAt)).isoDate : cancunParts().isoDate;
  for (const file of platformShellRoutes) {
    const html = read(file);
    assert(html.includes("qoc-static-snapshot:start"), `${file} is missing static snapshot start marker`);
    assert(html.includes("qoc-static-snapshot:end"), `${file} is missing static snapshot end marker`);
    assert(html.includes("qoc-generated-jsonld:start"), `${file} is missing generated JSON-LD start marker`);
    assert(html.includes("qoc-generated-jsonld:end"), `${file} is missing generated JSON-LD end marker`);
    assert(html.includes("<noscript>"), `${file} static snapshot must live in noscript to avoid visible UI changes`);
    assert(!html.includes('"@type": "Offer"'), `${file} must not emit Offer JSON-LD in this pass`);

    const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert(jsonLdBlocks.length >= 2, `${file} should include base and generated JSON-LD blocks`);
    for (const block of jsonLdBlocks) {
      const parsed = JSON.parse(block[1]);
      if (parsed["@graph"]) {
        for (const node of parsed["@graph"]) {
          assert(node["@type"] !== "Offer", `${file} generated JSON-LD must not include Offer`);
          if (node["@type"] === "Event") {
            const event = data.events.find((item) => item.title === node.name);
            assert(event, `${file} Event JSON-LD ${node.name} is not backed by platform data`);
            assert(event.lifecycleStatus === "active", `${file} Event JSON-LD ${node.name} is not active`);
            assert(["medium", "high"].includes(event.confidence), `${file} Event JSON-LD ${node.name} lacks confidence`);
            assert(["official", "partner", "manual"].includes(event.sourceType) || (event.sourceType === "scraped" && event.verifiedAt),
              `${file} Event JSON-LD ${node.name} lacks trusted source eligibility`);
          }
        }
      }
    }
  }

  const snapshotText = platformShellRoutes.map((file) => read(file)).join("\n");
  for (const item of data.events || []) {
    if (item.lifecycleStatus === "expired") {
      assert(!snapshotText.includes(item.title), `Expired event appears in static snapshot: ${item.title}`);
    }
  }
  for (const collectionName of ["events", "week"]) {
    for (const item of data[collectionName] || []) {
      const startDate = String(item.date || "").slice(0, 10);
      const endDate = String(item.endDate || item.activeUntil || "").slice(0, 10);
      if (startDate && startDate < dataDate && (!endDate || endDate < dataDate)) {
        assert(!snapshotText.includes(item.title), `Past-dated ${collectionName} item appears in static snapshot: ${item.title}`);
      }
    }
  }
  for (const item of data.promos || []) {
    if (item.lifecycleStatus === "active") {
      assert(item.validUntil || item.reviewAfter || item.alwaysOn === true, `Active promo lacks lifecycle metadata in snapshot source: ${item.id}`);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    isoDate: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function cancunDateLabel(isoDate) {
  const date = new Date(`${isoDate}T12:00:00${CANCUN_OFFSET}`);
  const formatted = new Intl.DateTimeFormat("es-MX", {
    timeZone: CANCUN_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
  const normalized = formatted.replace(",", "");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeDateLabel(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function assertFreshPlatformData(data) {
  const updatedAtTs = Date.parse(data.updatedAt || "");
  assert(Number.isFinite(updatedAtTs), "Platform data must include a valid updatedAt timestamp");
  const ageHours = (Date.now() - updatedAtTs) / (60 * 60 * 1000);
  assert(
    ageHours <= PLATFORM_STALE_HOURS_LIMIT,
    `Platform data is stale: updatedAt is ${ageHours.toFixed(1)} hours old`
  );
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function parseTimestamp(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : null;
}

function ageHours(value) {
  const ts = parseTimestamp(value);
  if (!Number.isFinite(ts)) return Infinity;
  return (Date.now() - ts) / (60 * 60 * 1000);
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cancunStartOfDayMs(isoDate) {
  return Date.parse(`${isoDate}T00:00:00${CANCUN_OFFSET}`);
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
  const endWeekday = weekdayIndex.get(match[2]);
  if (endWeekday === undefined) return 0;
  return (endWeekday - startWeekday + 7) % 7;
}

function eventEndTimestamp(item) {
  const explicit = parseTimestamp(item.validUntil || item.endsAt || item.activeUntil);
  if (Number.isFinite(explicit)) return explicit;
  if (!item.date) return null;
  const rangeOffset = eventRangeEndOffset(item);
  const endTime = parseTimeRangeEnd(item.time) || parseTimeRangeEnd(item.dateTime) || { hour: 23, minute: 59, singleTime: false };
  const cleanupMinutes = endTime.singleTime ? 180 : 180;
  return cancunStartOfDayMs(item.date) + rangeOffset * DAY_MS + endTime.hour * 60 * 60 * 1000 + endTime.minute * 60 * 1000 + cleanupMinutes * 60 * 1000;
}

function visibleItemCollections(data) {
  return {
    "hoy.hero": data.hoy?.hero ? [data.hoy.hero] : [],
    "hoy.signals": data.hoy?.signals || [],
    "hoy.today": data.hoy?.today || [],
    "hoy.week": data.hoy?.week || [],
    "hoy.events": data.hoy?.events || [],
    week: data.week || [],
    promos: data.promos || [],
    events: data.events || [],
    party: data.party || []
  };
}

function assertPlatformMeta(data, report) {
  assert(data.platformMeta && typeof data.platformMeta === "object", "Platform data must include platformMeta");
  assert(data.platformMeta.schemaVersion === 1, "platformMeta.schemaVersion must be 1");
  assert(data.platformMeta.timeZone === CANCUN_TIME_ZONE, "platformMeta must use America/Cancun time zone");
  assert(data.platformMeta.sections && typeof data.platformMeta.sections === "object", "platformMeta.sections is missing");

  assert(report && typeof report === "object", "platform refresh report must be a JSON object");
  assert(Number.isFinite(parseTimestamp(report.generatedAt)), "platform-refresh-report generatedAt is invalid");
  assert(ageHours(report.generatedAt) <= PLATFORM_STALE_HOURS_LIMIT, "platform-refresh-report is stale");
  assert(["success", "partial", "failed"].includes(report.overallStatus), "platform-refresh-report overallStatus is invalid");
  assert(["scheduled", "manual", "local", "unknown"].includes(report.runMode), "platform-refresh-report runMode is invalid");
  assert(report.sections && typeof report.sections === "object", "platform-refresh-report sections are missing");

  for (const section of requiredFreshnessSections) {
    const meta = data.platformMeta.sections[section];
    const reportSection = report.sections[section];
    assert(meta, `platformMeta.sections.${section} is missing`);
    assert(reportSection, `platform-refresh-report.sections.${section} is missing`);
    assert(meta.timeSensitive === true, `${section} must be marked timeSensitive`);
    assert(meta.freshness && typeof meta.freshness === "object", `${section} freshness metadata is missing`);
    assert(validSectionStatuses.has(meta.freshness.status), `${section} freshness status is invalid: ${meta.freshness.status}`);
    assert(validSectionStatuses.has(reportSection.status), `${section} report status is invalid: ${reportSection.status}`);
    assert(Number.isFinite(parseTimestamp(meta.freshness.updatedAt)), `${section} freshness.updatedAt is invalid`);
    if (meta.freshness.status === "fresh") {
      assert(ageHours(meta.freshness.updatedAt) <= PLATFORM_STALE_HOURS_LIMIT, `${section} is marked fresh but updatedAt is stale`);
      assert(Number.isFinite(parseTimestamp(meta.freshness.lastSuccessfulRefreshAt)), `${section} fresh status requires lastSuccessfulRefreshAt`);
    }
    if (meta.freshness.expiresAt) {
      assert(Number.isFinite(parseTimestamp(meta.freshness.expiresAt)), `${section} freshness.expiresAt is invalid`);
    }
    for (const counter of ["itemsAdded", "itemsUpdated", "itemsRemoved", "itemsPreserved"]) {
      assert(Number.isInteger(reportSection[counter]) && reportSection[counter] >= 0, `${section} report ${counter} must be a non-negative integer`);
    }
    assert(Array.isArray(reportSection.warnings), `${section} report warnings must be an array`);
    assert(Array.isArray(reportSection.errors), `${section} report errors must be an array`);
  }

  const worldCup = data.hoy?.worldCup;
  if (isTemporalFeatureActive(worldCup)) {
    const worldCupMeta = data.platformMeta.sections["hoy.worldCup"].freshness;
    assert(worldCupMeta.status === "fresh", "Active World Cup section must be freshly refreshed");
    assert(ageHours(worldCupMeta.lastSuccessfulRefreshAt) <= PLATFORM_STALE_HOURS_LIMIT, "Active World Cup refresh is stale");
    assert(report.sections["hoy.worldCup"].status === "fresh", "Active World Cup report status must be fresh");
  }

  if (report.overallStatus === "success") {
    for (const [section, sectionReport] of Object.entries(report.sections)) {
      assert(!sectionReport.errors.length, `Report claims success but ${section} has errors`);
      assert(sectionReport.status !== "failed", `Report claims success but ${section} failed`);
    }
  }
}

function assertLifecycleIntegrity(data) {
  const todayIso = cancunParts().isoDate;
  for (const item of data.hoy?.today || []) {
    assert(item.date === todayIso, `hoy.today.${item.id} date must match Cancun today (${todayIso})`);
    if (/^hoy\b/i.test(String(item.dateTime || ""))) {
      assert(item.dateDerivedFrom === "america-cancun-current-date" || item.dateLabelDerivedFrom === "america-cancun-current-date",
        `hoy.today.${item.id} uses Hoy label without Cancun date derivation metadata`);
    }
  }

  for (const section of ["hoy.events", "events"]) {
    const items = section === "hoy.events" ? data.hoy?.events || [] : data.events || [];
    for (const item of items) {
      const endTs = eventEndTimestamp(item);
      assert(Number.isFinite(endTs), `${section}.${item.id} needs reliable event lifecycle end metadata`);
      assert(Date.now() <= endTs, `${section}.${item.id} is expired but still visible`);
      assert(item.lifecycleStatus === "active", `${section}.${item.id} must be explicitly marked lifecycleStatus=active`);
    }
  }

  for (const item of data.promos || []) {
    const explicitEnd = parseTimestamp(item.validUntil || item.endsAt || item.activeUntil);
    if (Number.isFinite(explicitEnd)) {
      assert(Date.now() <= explicitEnd, `promos.${item.id} has expired explicit lifecycle metadata`);
    } else {
      assert(item.confidence !== "high" || item.sourceType === "official" || item.sourceType === "partner" || item.sourceType === "manual",
        `promos.${item.id} has high confidence without trusted sourceType`);
    }
  }
}

function assertPromoLifecycle(data, report) {
  const promos = data.promos || [];
  const reportPromos = report.sections?.promos;
  assert(reportPromos, "platform-refresh-report.sections.promos is missing");
  assert(reportPromos.lifecycleCounts && typeof reportPromos.lifecycleCounts === "object", "promos report must include lifecycleCounts");
  for (const key of ["active", "expired", "needs_review", "alwaysOn", "missingLifecycleMetadata", "preserved"]) {
    assert(Number.isInteger(reportPromos.lifecycleCounts[key]) && reportPromos.lifecycleCounts[key] >= 0,
      `promos lifecycleCounts.${key} must be a non-negative integer`);
  }

  let active = 0;
  let needsReview = 0;
  let alwaysOn = 0;
  let missingLifecycleMetadata = 0;
  for (const item of promos) {
    const hasLifecycle = Boolean(item.validUntil || item.reviewAfter || item.alwaysOn === true);
    if (!hasLifecycle) missingLifecycleMetadata += 1;
    assert(hasLifecycle, `promos.${item.id} must include validUntil, reviewAfter, or alwaysOn=true`);
    assert(validPromoLifecycleStatuses.has(item.lifecycleStatus), `promos.${item.id} lifecycleStatus is invalid`);

    const sourceType = item.sourceType || "unknown";
    if (item.alwaysOn === true) {
      alwaysOn += 1;
      assert(promoAlwaysOnSourceTypes.has(sourceType), `promos.${item.id} alwaysOn is not allowed for sourceType=${sourceType}`);
    }
    assert(!(item.alwaysOn === true && (sourceType === "scraped" || sourceType === "unknown")),
      `promos.${item.id} scraped/unknown promos cannot be alwaysOn`);

    const validUntilTs = parseTimestamp(item.validUntil);
    if (Number.isFinite(validUntilTs)) {
      assert(Date.now() <= validUntilTs, `promos.${item.id} is expired but still visible`);
      assert(item.lifecycleStatus !== "expired", `promos.${item.id} must not be visible with lifecycleStatus=expired`);
    }

    const reviewAfterTs = parseTimestamp(item.reviewAfter);
    if (!item.alwaysOn && !Number.isFinite(validUntilTs)) {
      assert(Number.isFinite(reviewAfterTs), `promos.${item.id} without validUntil must include reviewAfter`);
    }
    if (Number.isFinite(reviewAfterTs) && Date.now() > reviewAfterTs && item.alwaysOn !== true) {
      assert(item.lifecycleStatus === "needs_review", `promos.${item.id} reviewAfter is past but lifecycleStatus is not needs_review`);
    }

    if (item.lifecycleStatus === "active") active += 1;
    if (item.lifecycleStatus === "needs_review") needsReview += 1;
  }

  assert(missingLifecycleMetadata === 0, "Visible promos still have missing lifecycle metadata after normalization");
  assert(reportPromos.lifecycleCounts.preserved === promos.length, "promos lifecycle report preserved count must match visible promos");
  assert(reportPromos.lifecycleCounts.active === active, "promos lifecycle report active count does not match platform data");
  assert(reportPromos.lifecycleCounts.needs_review === needsReview, "promos lifecycle report needs_review count does not match platform data");
  assert(reportPromos.lifecycleCounts.alwaysOn === alwaysOn, "promos lifecycle report alwaysOn count does not match platform data");
}

function assertSourceTrust(data) {
  const placeholderUrl = /example\.com|placeholder|todo|tbd|localhost|your-url/i;
  for (const [section, items] of Object.entries(visibleItemCollections(data))) {
    for (const item of items) {
      if (item.sourceUrl) {
        assert(/^https?:\/\//i.test(item.sourceUrl), `${section}.${item.id || item.label} sourceUrl must be http(s)`);
        assert(!placeholderUrl.test(item.sourceUrl), `${section}.${item.id || item.label} sourceUrl looks like a placeholder`);
      }
      assert(validSourceTypes.has(item.sourceType || "unknown"), `${section}.${item.id || item.label} sourceType is invalid`);
      assert(validConfidenceLevels.has(item.confidence || "low"), `${section}.${item.id || item.label} confidence is invalid`);
      if (item.confidence === "high") {
        assert(
          trustedHighConfidenceSourceTypes.has(item.sourceType) || item.verifiedAt,
          `${section}.${item.id || item.label} high confidence requires official/partner/manual sourceType or verifiedAt`
        );
      }
      if (item.sourceType === "scraped") {
        assert(item.confidence !== "high", `${section}.${item.id || item.label} scraped unknown content must not default to high confidence`);
      }
    }
  }

  const worldCup = data.hoy?.worldCup;
  assert(worldCup.sourceType === "official", "World Cup sourceType must be official");
  assert(worldCup.confidence === "high", "World Cup confidence must be high after successful parse");
  assert(["firecrawl", "firecrawl_fixture"].includes(worldCup.extractionMethod), "World Cup extractionMethod must be explicit");
}

function assertCurrentWorldCupLabel(worldCup) {
  if (!isTemporalFeatureActive(worldCup)) return;
  if (!worldCup?.today?.label) return;
  const todayIso = cancunParts().isoDate;
  const expectedLabel = normalizeDateLabel(cancunDateLabel(todayIso));
  const actualLabel = normalizeDateLabel(worldCup.today.label);
  const currentMatches = Array.isArray(worldCup.today.matches) ? worldCup.today.matches : [];
  const allMatchesHaveTodayKickoff = currentMatches.length > 0 && currentMatches.every((match) => {
    const kickoffTs = Date.parse(match.kickoff || "");
    return Number.isFinite(kickoffTs) && cancunParts(new Date(kickoffTs)).isoDate === todayIso;
  });

  if (allMatchesHaveTodayKickoff) {
    assert(
      actualLabel === expectedLabel,
      `World Cup today label is stale: expected ${cancunDateLabel(todayIso)}, found ${worldCup.today.label}`
    );
  }
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(existsSync(absolutePath), `Missing file: ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
}

function validateImage(image) {
  if (!image || !image.startsWith("/")) return;
  const localImage = image.split("?")[0].replace(/^\//, "");
  assert(existsSync(path.join(root, localImage)), `Missing local image: ${image}`);
}

function validateItem(item, pathLabel, options = {}) {
  const maxDescriptionLength = options.maxDescriptionLength || 120;
  for (const field of [
    "id",
    "title",
    "category",
    "date",
    "time",
    "dateTime",
    "location",
    "neighborhood",
    "image",
    "sourceUrl",
    "sourceName",
    "freshness",
    "ctaLabel",
    "ctaUrl",
    "description",
    "priority"
  ]) {
    assert(item[field] !== undefined && item[field] !== "", `${pathLabel} is missing ${field}`);
  }
  assert(item.description.length <= maxDescriptionLength, `${pathLabel} description exceeds ${maxDescriptionLength} characters`);
  validateImage(item.image);
  if (item.imageFit !== undefined) {
    assert(validImageFits.has(String(item.imageFit).toLowerCase()), `${pathLabel} imageFit must be cover or contain`);
  }
  if (item.imageKind !== undefined) {
    assert(validImageKinds.has(String(item.imageKind).toLowerCase()), `${pathLabel} imageKind is invalid`);
  }
  if (item.imageQuality !== undefined) {
    assert(validImageQualities.has(String(item.imageQuality).toLowerCase()), `${pathLabel} imageQuality is invalid`);
  }
  if (item.imagePosition !== undefined) {
    assert(/^[a-z0-9.%\s-]+$/i.test(String(item.imagePosition)), `${pathLabel} imagePosition has unsafe characters`);
  }
  if (Array.isArray(item.gallery)) {
    assert(item.gallery.length >= 2, `${pathLabel} gallery must have at least two images`);
    const galleryImages = item.gallery.map((slide) => String(slide.image || "").split("?")[0]);
    const uniqueGalleryImages = new Set(galleryImages);
    assert(
      uniqueGalleryImages.size === item.gallery.length,
      `${pathLabel} gallery must use distinct images; repeated assets create fake carousel flashes`
    );
    item.gallery.forEach((slide, index) => {
      assert(slide.image, `${pathLabel}.gallery[${index}] is missing image`);
      validateImage(slide.image);
      assert(String(slide.imageFit || "").toLowerCase() !== "contain", `${pathLabel}.gallery[${index}] must not use contain`);
    });
  }
}

function validateCampaign(campaign, pathLabel) {
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
    assert(campaign[field], `${pathLabel}.campaign is missing ${field}`);
  }
  assert(campaign.type === "coupon", `${pathLabel}.campaign type must be coupon`);
  assert(Number.isFinite(Date.parse(campaign.activeFrom)), `${pathLabel}.campaign activeFrom is invalid`);
  assert(Number.isFinite(Date.parse(campaign.activeUntil)), `${pathLabel}.campaign activeUntil is invalid`);
  assert(/^[A-Z0-9-]{6,14}$/.test(campaign.code), `${pathLabel}.campaign code must be short, stable, and waiter-friendly`);
  assert(/descuento|beneficio|cup[oó]n/i.test(campaign.label), `${pathLabel}.campaign label must clearly describe the benefit`);
}

function isTemporalFeatureActive(module = {}, now = new Date()) {
  const startTs = Date.parse(module.activeFrom || "") || null;
  const untilTs = Date.parse(module.activeUntil || "") || null;
  const nowTs = now.getTime();
  const matches = [
    ...((module.today && module.today.matches) || []),
    ...((module.days && module.days.flatMap((day) => day.matches || [])) || [])
  ];

  if (Number.isFinite(startTs) && nowTs < startTs) return false;
  if (Number.isFinite(untilTs) && nowTs > untilTs) return false;

  const hasFreshKickoff = matches.some((match) => {
    const kickoffTs = Date.parse(match.kickoff || "");
    if (!Number.isFinite(kickoffTs)) return false;
    return kickoffTs > nowTs - (90 * 60 * 1000);
  });

  if (hasFreshKickoff) return true;
  if (Number.isFinite(untilTs)) return true;
  return matches.length > 0;
}

for (const [label, file, marker] of routes) {
  const html = read(file);
  assert(html.includes(marker), `${label} route is missing marker: ${marker}`);
  assert(html.includes("<title>"), `${label} route is missing <title>`);
}

assertBootShellContract();
assertPlatformVersionContract();
assertBootDuplicationContract();
assertLoadingContract();
assertNewsletterIsolation();
assertDailyAutomationContract();
assertSnapshotContract();

const seoRoutes = [
  ["Hoy", "index.html", "https://queondacancun.com/"],
  ["Esta semana", "esta-semana/index.html", "https://queondacancun.com/esta-semana/"],
  ["Promos", "promos/index.html", "https://queondacancun.com/promos/"],
  ["Eventos", "eventos/index.html", "https://queondacancun.com/eventos/"],
  ["Party", "party/index.html", "https://queondacancun.com/party/"],
  ["Newsletter", "newsletter/index.html", "https://queondacancun.com/newsletter/"]
];

for (const [label, file, canonicalUrl] of seoRoutes) {
  const html = read(file);
  assert(html.includes(`<link rel="canonical" href="${canonicalUrl}">`), `${label} route is missing canonical URL`);
  assert(html.includes('<meta name="robots" content="index, follow, max-image-preview:large">'), `${label} route is missing robots index/follow metadata`);
  assert(html.includes('property="og:title"'), `${label} route is missing OG title`);
  assert(html.includes('name="twitter:card"'), `${label} route is missing Twitter card metadata`);
  assert(html.includes('application/ld+json'), `${label} route is missing structured data`);
}

const robots = read("robots.txt");
assert(robots.includes("Sitemap: https://queondacancun.com/sitemap.xml"), "robots.txt must point to sitemap.xml");

const llms = read("llms.txt");
for (const [, , canonicalUrl] of seoRoutes) {
  assert(llms.includes(canonicalUrl), `llms.txt is missing ${canonicalUrl}`);
}
assert(llms.includes("https://queondacancun.com/data/platform.json"), "llms.txt must point crawlers to current platform data");
assert(llms.includes("Freshness:"), "llms.txt must document platform freshness");

const sitemap = read("sitemap.xml");
for (const [, , canonicalUrl] of seoRoutes) {
  assert(sitemap.includes(`<loc>${canonicalUrl}</loc>`), `sitemap.xml is missing ${canonicalUrl}`);
}

const app = read("app.js");
const css = read("platform.css");
for (const item of requiredNav) {
  assert(app.includes(`label: "${item}"`), `App nav is missing ${item}`);
}
for (const file of requiredFiles) {
  assert(existsSync(path.join(root, file)), `Missing required file for pipeline: ${file}`);
}
for (const item of removedNav) {
  assert(!app.includes(item), `App still includes removed nav/page item: ${item}`);
}
assert(app.includes("worldcup-today-labelline"), "World Cup panel must show today's label in-panel");
assert(app.includes("renderCardMeta") && app.includes("compactDescription"), "App must use unified editorial card metadata and compact descriptions");
assert(app.includes('fetch("/api/claim-coupon"'), "Coupon claims must be logged through /api/claim-coupon before revealing the code");
assert(app.includes("/api/track-interaction"), "High-intent interactions must be logged through /api/track-interaction");
assert(app.includes("data-track-action"), "Trackable CTAs must use explicit data-track-action attributes");
assert(app.includes("scheduleSearchTracking"), "Search queries must be logged through a debounced search tracker");
assert(app.includes("shouldUseServerlessEndpoint"), "Local static preview must avoid fake serverless API errors");
assert(!app.includes("feature-topline"), "Cards must not use the old scattered feature-topline layout");
assert(app.includes("resolveImagePresentation"), "Cards must resolve image presentation metadata");
assert(app.includes("data-image-fit"), "Card media must expose image fit for QA/debugging");
assert(!app.includes("featuredPartners"), "Homepage sponsorship experiments must not mutate the locked hero/card structure");
assert(css.includes(".feature-media--fit-contain"), "Discovery cards must support intentional contained media for posters/logos/banners");
assert(css.includes("object-fit: contain"), "Contained card media must use object-fit contain");
assert(!css.includes(".live-hero-media.contain"), "Homepage hero must not use contain/letterboxing");
assert(css.includes("object-fit: cover"), "Discovery card images must use object-fit cover");
assert(!css.includes("worldcup-next"), "World Cup panel must not use legacy next-match block");
assert(css.includes("margin-top: auto"), "Card CTA area must align to the bottom");

const newsletter = read("newsletter/index.html");
for (const item of requiredNav) {
  assert(newsletter.includes(`>${item}<`), `Newsletter nav is missing ${item}`);
}
assert(!newsletter.includes('href="/restaurantes/"'), "Newsletter nav still links to Restaurantes");
assert(!newsletter.includes('href="/beach-clubs/"'), "Newsletter nav still links to Beach clubs");
assert(newsletter.includes("que-onda-cancun-semana-22-28-junio.pdf"), "Newsletter PDF link is missing");
assert(
  existsSync(path.join(root, "assets/newsletter/que-onda-cancun-semana-22-28-junio.pdf")),
  "Newsletter PDF asset is missing"
);
assert(!newsletter.includes("object-fit: cover"), "Newsletter hero images must not be cropped with object-fit cover");

const data = readJson("data/platform.json");
const refreshReport = readJson("data/platform-refresh-report.json");
assertFreshPlatformData(data);
assertPlatformMeta(data, refreshReport);
assertLifecycleIntegrity(data);
assertPromoLifecycle(data, refreshReport);
assertSourceTrust(data);
const claimCouponApi = read("api/claim-coupon.js");
const trackInteractionApi = read("api/track-interaction.js");
assert(claimCouponApi.includes("Coupon Claims"), "Claim endpoint must write to Coupon Claims sheet");
assert(claimCouponApi.includes("loadPlatformData"), "Claim endpoint must validate campaign from platform data");
assert(claimCouponApi.includes("ensureClaimsSheet"), "Claim endpoint must ensure the claims sheet exists");
assert(claimCouponApi.includes(":append?valueInputOption=RAW"), "Claim endpoint must append claim rows instead of calculating row positions");
assert(trackInteractionApi.includes("Interaction Clicks"), "Interaction endpoint must keep clicks in Interaction Clicks");
assert(trackInteractionApi.includes("Search Queries"), "Interaction endpoint must keep searches in Search Queries");
assert(trackInteractionApi.includes(":append?valueInputOption=RAW"), "Interaction endpoint must append rows instead of calculating row positions");
assert(!/body\.email|email\s*,/i.test(trackInteractionApi), "Interaction endpoint must not collect subscriber identity fields");
const cachePlatformImages = read("scripts/cache-platform-images.mjs");
const auditPlatformData = read("scripts/audit-platform-data.mjs");
const lifecycleScript = read("scripts/apply-platform-lifecycle.mjs");
const sponsorReport = read("scripts/generate-sponsor-report.mjs");
assert(cachePlatformImages.includes("Dry run only"), "Image cache script must default to dry-run before writing data/assets");
assert(cachePlatformImages.includes("--write"), "Image cache script must require explicit --write for mutations");
assert(auditPlatformData.includes("Promos without lifecycle"), "Platform audit must surface promo lifecycle gaps");
assert(lifecycleScript.includes("event_date_passed"), "Lifecycle script must infer removal for passed dated events");
assert(lifecycleScript.includes("promo_missing_valid_until_or_review_after"), "Lifecycle script must review unknown-expiry promos instead of deleting blindly");
assert(lifecycleScript.includes("Dry run only"), "Lifecycle script must default to dry-run before deleting expired content");
assert(sponsorReport.includes("Interaction Clicks") || sponsorReport.includes("Click Actions"), "Sponsor report must summarize click intent data");
assert(!JSON.stringify(data).includes("ACIER"), "Platform data must not include ACIER sponsor content");
assert(data.editorialNote && data.schema, "Platform data must document manual editorial fallback and schema");
assert(data.hoy && data.hoy.hero, "Hoy must have one real hero item");
validateItem(data.hoy.hero, "hoy.hero", { maxDescriptionLength: 180 });
const hero = data.hoy.hero;
validateCampaign(hero.campaign, "hoy.hero");
assert(hero.title.length <= 42, `Hoy hero title is too long for the locked hero: ${hero.title}`);
assert(!/de la semana/i.test(hero.title), `Hoy hero title repeats weekly framing already handled by eyebrow: ${hero.title}`);
assert(
  !/Restaurante premium para una comida cuidada|Mesa recomendada|plan completo/i.test(hero.description),
  `Hoy hero description is generic and must use specific sourced brand language: ${hero.description}`
);
if (hero.heroTone === "gold") {
  assert(hero.description.length <= 180, `Gold hero description is too long and risks clipping CTAs: ${hero.description}`);
}
const worldCup = data.hoy && data.hoy.worldCup;
assert(worldCup && typeof worldCup === "object", "Hoy should keep a worldCup module entry for campaign scheduling");
assert(Array.isArray(worldCup.days), "World Cup module should expose days schedule data");
assertCurrentWorldCupLabel(worldCup);
if (worldCup.activeFrom) {
  assert(Number.isFinite(Date.parse(worldCup.activeFrom)), `worldCup.activeFrom is not a valid date: ${worldCup.activeFrom}`);
}
if (worldCup.activeUntil) {
  assert(Number.isFinite(Date.parse(worldCup.activeUntil)), `worldCup.activeUntil is not a valid date: ${worldCup.activeUntil}`);
}

if (isTemporalFeatureActive(worldCup)) {
  assert(worldCup.today && Array.isArray(worldCup.today.matches), "World Cup module must show today's matches");
  assert(worldCup.today.matches.length >= 1, "World Cup module needs at least one today match");
  for (const [matchIndex, match] of worldCup.today.matches.entries()) {
    assert(match.time && match.teams && match.kickoff, `worldCup.today.matches[${matchIndex}] is incomplete`);
    assert(match.teams.includes(" vs "), `World Cup today match must use vs: ${match.teams}`);
  }
  assert(worldCup.days.length >= 6, "World Cup module should cover the active week");
  for (const [dayIndex, day] of worldCup.days.entries()) {
    assert(day.label && Array.isArray(day.matches) && day.matches.length > 0, `worldCup.days[${dayIndex}] is incomplete`);
    for (const [matchIndex, match] of day.matches.entries()) {
      assert(match.time && match.teams, `worldCup.days[${dayIndex}].matches[${matchIndex}] is incomplete`);
      assert(match.teams.includes(" vs "), `World Cup match must use vs: ${match.teams}`);
    }
  }
}
assert(Array.isArray(data.hoy.signals) && data.hoy.signals.length === 3, "Hoy must have exactly three compact utility signals");
for (const signal of data.hoy.signals) {
  for (const field of ["id", "label", "value", "tone", "sourceUrl"]) {
    assert(signal[field], `hoy.signals item is missing ${field}`);
  }
  if (signal.label === "Clima") {
    assert(/lluvia/i.test(signal.summary || ""), "Clima signal must show rain percentage");
  }
  if (signal.label === "USD/MXN" || signal.label === "Sargazo") {
    assert(!signal.summary, `${signal.label} signal must stay compact without extra copy`);
  }
}
for (const collection of ["today", "week", "events"]) {
  assert(Array.isArray(data.hoy[collection]) && data.hoy[collection].length > 0, `Hoy is missing ${collection}`);
  data.hoy[collection].forEach((item, index) => validateItem(item, `hoy.${collection}[${index}]`));
}
for (const collection of ["week", "promos", "events", "party"]) {
  assert(Array.isArray(data[collection]) && data[collection].length > 0, `Missing data collection: ${collection}`);
  data[collection].forEach((item, index) => validateItem(item, `${collection}[${index}]`));
}
assert(data.hoy.today.length >= 8, "Hoy must have at least 8 live daily items");
assert(data.hoy.week.length >= 8, "Hoy weekly preview must have at least 8 items");
assert(data.week.length >= 10, "Esta semana must have at least 10 items");
assert(data.promos.length >= 20, "Promos must have at least 20 active opportunities");
assert(data.events.length >= 6, "Eventos must keep at least 6 non-expired items after lifecycle filtering");
assert(data.party.length >= 8, "Party must keep at least 8 source-backed nightlife listings");

const nonPromoData = JSON.stringify({
  hoy: data.hoy,
  week: data.week,
  events: data.events
});
assert(!nonPromoData.includes("Xoximilco"), "Xoximilco must only appear on the Promos page");
for (const collection of [data.hoy.week, data.week]) {
  for (const item of collection) {
    assert(item.ctaUrl !== "/newsletter/" && item.sourceUrl !== "/newsletter/", `Weekly discovery card links back to newsletter: ${item.id}`);
    assert(!/Brasilia|Brasília|conectividad/i.test(`${item.title} ${item.description}`), `Newsletter connectivity item leaked into discovery: ${item.id}`);
    assert(!/Mundial: calendario/i.test(item.title), `World Cup calendar must be standalone, not a card: ${item.id}`);
  }
}

for (const file of ["index.html", "app.js", "data/platform.json", "esta-semana/index.html", "newsletter/index.html"]) {
  const content = read(file);
  for (const phrase of forbidden) {
    assert(!content.includes(phrase), `${file} contains forbidden phrase: ${phrase}`);
  }
}

console.log("platform checks passed");
