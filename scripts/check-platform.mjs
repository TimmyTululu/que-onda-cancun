import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const routes = [
  ["Hoy", "index.html", 'data-page="hoy"'],
  ["Esta semana", "esta-semana/index.html", 'data-page="esta-semana"'],
  ["Promos", "promos/index.html", 'data-page="promos"'],
  ["Eventos", "eventos/index.html", 'data-page="eventos"'],
  ["Newsletter", "newsletter/index.html", "Descargar PDF"],
  ["Boletín redirect", "boletin/index.html", "/newsletter/"],
  ["Restaurantes redirect", "restaurantes/index.html", "url=/"],
  ["Beach clubs redirect", "beach-clubs/index.html", "url=/"]
];

const requiredNav = ["Hoy", "Esta semana", "Promos", "Eventos", "Newsletter", "Contacto"];
const removedNav = ['label: "Inicio"', 'label: "Restaurantes"', 'label: "Beach clubs"', 'href="/restaurantes/"', 'href="/beach-clubs/"'];
const requiredFiles = [
  "scripts/validate-platform-content.mjs",
  "scripts/build-platform-data.mjs",
  "data/source-research.json",
  "data/platform-candidates.json",
  "api/claim-coupon.js",
  "api/track-interaction.js",
  "scripts/audit-platform-data.mjs",
  "scripts/apply-platform-lifecycle.mjs",
  "scripts/cache-platform-images.mjs",
  "scripts/generate-sponsor-report.mjs",
  "robots.txt",
  "sitemap.xml"
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

const seoRoutes = [
  ["Hoy", "index.html", "https://queondacancun.com/"],
  ["Esta semana", "esta-semana/index.html", "https://queondacancun.com/esta-semana/"],
  ["Promos", "promos/index.html", "https://queondacancun.com/promos/"],
  ["Eventos", "eventos/index.html", "https://queondacancun.com/eventos/"],
  ["Newsletter", "newsletter/index.html", "https://queondacancun.com/newsletter/"]
];

for (const [label, file, canonicalUrl] of seoRoutes) {
  const html = read(file);
  assert(html.includes(`<link rel="canonical" href="${canonicalUrl}">`), `${label} route is missing canonical URL`);
  assert(html.includes('property="og:title"'), `${label} route is missing OG title`);
  assert(html.includes('name="twitter:card"'), `${label} route is missing Twitter card metadata`);
  assert(html.includes('application/ld+json'), `${label} route is missing structured data`);
}

const robots = read("robots.txt");
assert(robots.includes("Sitemap: https://queondacancun.com/sitemap.xml"), "robots.txt must point to sitemap.xml");

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
assert(!app.includes('imageFit === "contain"'), "Shared platform hero must not support contain mode");
assert(!app.includes("featuredPartners"), "Homepage sponsorship experiments must not mutate the locked hero/card structure");
assert(!css.includes(".feature-media.contain"), "Discovery card images must not use contain/letterboxing");
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

const data = JSON.parse(read("data/platform.json"));
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
for (const collection of ["week", "promos", "events"]) {
  assert(Array.isArray(data[collection]) && data[collection].length > 0, `Missing data collection: ${collection}`);
  data[collection].forEach((item, index) => validateItem(item, `${collection}[${index}]`));
}
assert(data.hoy.today.length >= 8, "Hoy must have at least 8 live daily items");
assert(data.hoy.week.length >= 8, "Hoy weekly preview must have at least 8 items");
assert(data.week.length >= 10, "Esta semana must have at least 10 items");
assert(data.promos.length >= 20, "Promos must have at least 20 active opportunities");
assert(data.events.length >= 10, "Eventos must have at least 10 items");

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
