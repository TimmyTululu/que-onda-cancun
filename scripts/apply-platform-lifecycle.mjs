#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const CANCUN_OFFSET = "-05:00";
const DAY_MS = 24 * 60 * 60 * 1000;

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

function writeJson(filePath, payload) {
  writeFileSync(path.resolve(root, filePath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseDate(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : null;
}

function cleanupAfterDate(date) {
  const start = parseDate(`${date}T03:00:00${CANCUN_OFFSET}`);
  return Number.isFinite(start) ? start + DAY_MS : null;
}

function sectionEntries(data) {
  return [
    ["hoy.today", data.hoy?.today || []],
    ["hoy.week", data.hoy?.week || []],
    ["hoy.events", data.hoy?.events || []],
    ["week", data.week || []],
    ["promos", data.promos || []],
    ["events", data.events || []]
  ];
}

function setSection(data, section, items) {
  if (section === "hoy.today") data.hoy.today = items;
  if (section === "hoy.week") data.hoy.week = items;
  if (section === "hoy.events") data.hoy.events = items;
  if (section === "week") data.week = items;
  if (section === "promos") data.promos = items;
  if (section === "events") data.events = items;
}

function isEventSection(section) {
  return section === "events" || section === "hoy.events";
}

function explicitExpiry(item) {
  return parseDate(item.validUntil || item.endsAt || item.activeUntil);
}

function inferredEventExpiry(item, section) {
  if (!isEventSection(section)) return null;
  if (!item.date) return null;
  return cleanupAfterDate(item.date);
}

function reviewDeadline(item) {
  return parseDate(item.reviewAfter || item.refreshAfter);
}

function itemDateAgeDays(item, nowTs) {
  const ts = parseDate(item.date ? `${item.date}T12:00:00${CANCUN_OFFSET}` : "");
  if (!Number.isFinite(ts)) return null;
  return Math.floor((nowTs - ts) / DAY_MS);
}

function classifyItem(item, section, nowTs) {
  const explicit = explicitExpiry(item);
  const inferredEvent = inferredEventExpiry(item, section);
  const review = reviewDeadline(item);
  const ageDays = itemDateAgeDays(item, nowTs);

  if (Number.isFinite(explicit) && nowTs > explicit) {
    return {
      status: "remove",
      reason: "explicit_expiry_passed",
      until: new Date(explicit).toISOString()
    };
  }

  if (Number.isFinite(inferredEvent) && nowTs > inferredEvent) {
    return {
      status: "remove",
      reason: "event_date_passed",
      until: new Date(inferredEvent).toISOString()
    };
  }

  if (Number.isFinite(review) && nowTs > review) {
    return {
      status: "review",
      reason: "review_after_passed",
      reviewAfter: new Date(review).toISOString()
    };
  }

  if (section === "promos" && !Number.isFinite(explicit) && !Number.isFinite(review)) {
    return {
      status: "review",
      reason: "promo_missing_valid_until_or_review_after"
    };
  }

  if ((section === "hoy.today" || section === "hoy.week" || section === "week") && Number.isFinite(ageDays) && ageDays > 7) {
    return {
      status: "review",
      reason: "stale_platform_date",
      ageDays
    };
  }

  if (isEventSection(section) && !item.date && !Number.isFinite(explicit)) {
    return {
      status: "review",
      reason: "event_missing_date_or_ends_at"
    };
  }

  return {
    status: "keep",
    reason: "active"
  };
}

function applyLifecycle(data, nowTs) {
  const report = {
    generatedAt: new Date().toISOString(),
    now: new Date(nowTs).toISOString(),
    summary: {
      keep: 0,
      review: 0,
      remove: 0
    },
    review: [],
    remove: [],
    sections: {}
  };

  for (const [section, items] of sectionEntries(data)) {
    const kept = [];
    const sectionReport = { before: items.length, after: 0, review: 0, remove: 0 };

    for (const item of items) {
      const result = classifyItem(item, section, nowTs);
      report.summary[result.status] += 1;

      if (result.status === "remove") {
        sectionReport.remove += 1;
        report.remove.push({ section, id: item.id, title: item.title, ...result });
        continue;
      }

      kept.push(item);
      if (result.status === "review") {
        sectionReport.review += 1;
        report.review.push({ section, id: item.id, title: item.title, ...result });
      }
    }

    sectionReport.after = kept.length;
    report.sections[section] = sectionReport;
    setSection(data, section, kept);
  }

  return { data, report };
}

function printReport(report, write) {
  console.log(`Platform lifecycle ${write ? "write" : "dry run"}: ${report.now}`);
  console.log(`Keep: ${report.summary.keep}`);
  console.log(`Review: ${report.summary.review}`);
  console.log(`Remove: ${report.summary.remove}`);
  report.remove.slice(0, 30).forEach((item) => {
    console.log(`REMOVE ${item.section}.${item.id} -> ${item.reason}`);
  });
  if (report.remove.length > 30) console.log(`REMOVE ... ${report.remove.length - 30} more`);
  report.review.slice(0, 30).forEach((item) => {
    console.log(`REVIEW ${item.section}.${item.id} -> ${item.reason}`);
  });
  if (report.review.length > 30) console.log(`REVIEW ... ${report.review.length - 30} more`);
}

function run() {
  const args = parseArgs();
  const input = args.input || "data/platform-candidates.json";
  const output = args.output || input;
  const reportOut = args.report;
  const write = Boolean(args.write);
  const nowTs = parseDate(args.now) || Date.now();
  const data = readJson(input);
  const { data: nextData, report } = applyLifecycle(data, nowTs);

  printReport(report, write);

  if (reportOut) writeJson(reportOut, report);
  if (write) {
    writeJson(output, nextData);
    console.log(`updated ${output}`);
  } else {
    console.log("Dry run only. Re-run with --write to remove expired items.");
  }
}

run();
