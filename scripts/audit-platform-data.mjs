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
  return JSON.parse(readFileSync(path.resolve(root, filePath), "utf8"));
}

function isRemote(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function isLocal(value) {
  return String(value || "").startsWith("/");
}

function localExists(value) {
  if (!isLocal(value)) return true;
  const local = String(value).split("?")[0].replace(/^\//, "");
  return existsSync(path.join(root, local));
}

function itemCollections(data) {
  return {
    "hoy.today": data.hoy?.today || [],
    "hoy.week": data.hoy?.week || [],
    "hoy.events": data.hoy?.events || [],
    week: data.week || [],
    promos: data.promos || [],
    events: data.events || []
  };
}

function allItems(data) {
  return Object.entries(itemCollections(data)).flatMap(([section, items]) =>
    items.map((item) => ({ section, item }))
  );
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const entry of items) {
    const key = getKey(entry);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function hasExpiry(item) {
  return Boolean(item.validUntil || item.activeUntil || item.endsAt);
}

function hasReviewDeadline(item) {
  return Boolean(item.reviewAfter || item.refreshAfter);
}

function maybeDate(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function audit(data) {
  const entries = allItems(data);
  const warnings = [];
  const errors = [];

  const localImageMissing = entries.filter(({ item }) => isLocal(item.image) && !localExists(item.image));
  localImageMissing.forEach(({ section, item }) => {
    errors.push(`${section}.${item.id}: missing local image ${item.image}`);
  });

  const remoteImages = entries.filter(({ item }) => isRemote(item.image));
  const promoLifecycleMissing = (data.promos || []).filter((item) => !hasExpiry(item) && !hasReviewDeadline(item));
  const eventExpiryMissing = [...(data.events || []), ...(data.hoy?.events || [])].filter((item) => !hasExpiry(item));

  promoLifecycleMissing.forEach((item) => {
    warnings.push(`promos.${item.id}: add validUntil if known, otherwise reviewAfter for unknown expiry`);
  });
  eventExpiryMissing.forEach((item) => {
    warnings.push(`events.${item.id}: add validUntil/endsAt for automatic cleanup`);
  });

  const staleDates = entries.filter(({ item }) => {
    const date = maybeDate(item.date);
    if (!date) return false;
    const ageMs = Date.now() - date.getTime();
    return ageMs > 21 * 24 * 60 * 60 * 1000;
  });
  staleDates.forEach(({ section, item }) => {
    warnings.push(`${section}.${item.id}: date is older than 21 days (${item.date})`);
  });

  const duplicateLocations = countBy(entries, ({ item }) => item.location)
    .filter(([, count]) => count >= 3)
    .map(([name, count]) => ({ name, count }));

  const genericCtas = countBy(entries, ({ item }) => item.ctaLabel)
    .filter(([label, count]) => /ver detalles|ver lugar/i.test(label) && count >= 3)
    .map(([label, count]) => ({ label, count }));

  const report = {
    generatedAt: new Date().toISOString(),
    file: "data/platform.json",
    totals: {
      cards: entries.length,
      remoteImages: remoteImages.length,
      localImages: entries.filter(({ item }) => isLocal(item.image)).length,
      missingLocalImages: localImageMissing.length,
      promosWithoutLifecycle: promoLifecycleMissing.length,
      eventsWithoutExpiry: eventExpiryMissing.length
    },
    sections: Object.fromEntries(
      Object.entries(itemCollections(data)).map(([section, items]) => [
        section,
        {
          count: items.length,
          remoteImages: items.filter((item) => isRemote(item.image)).length,
          localImages: items.filter((item) => isLocal(item.image)).length,
          missingExpiry: items.filter((item) => /event/i.test(section) && !hasExpiry(item)).length,
          missingLifecycle: items.filter((item) => /promo/i.test(section) && !hasExpiry(item) && !hasReviewDeadline(item)).length
        }
      ])
    ),
    duplicateLocations,
    genericCtas,
    warnings,
    errors
  };

  return report;
}

function printReport(report) {
  console.log(`Platform data audit: ${report.totals.cards} cards`);
  console.log(`Remote images: ${report.totals.remoteImages}`);
  console.log(`Promos without lifecycle: ${report.totals.promosWithoutLifecycle}`);
  console.log(`Events without expiry: ${report.totals.eventsWithoutExpiry}`);
  if (report.duplicateLocations.length) {
    console.log(`Repeated locations: ${report.duplicateLocations.map((item) => `${item.name} (${item.count})`).join(", ")}`);
  }
  if (report.genericCtas.length) {
    console.log(`Generic CTA labels: ${report.genericCtas.map((item) => `${item.label} (${item.count})`).join(", ")}`);
  }
  report.errors.forEach((entry) => console.log(`ERROR ${entry}`));
  report.warnings.slice(0, 30).forEach((entry) => console.log(`WARN ${entry}`));
  if (report.warnings.length > 30) {
    console.log(`WARN ... ${report.warnings.length - 30} more warnings`);
  }
}

function run() {
  const args = parseArgs();
  const file = args.file || "data/platform.json";
  const out = args.out;
  const strict = Boolean(args.strict);
  const report = audit(readJson(file));

  if (out) {
    writeFileSync(path.resolve(root, out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  printReport(report);

  if (report.errors.length || (strict && report.warnings.length)) {
    process.exit(1);
  }
}

run();
