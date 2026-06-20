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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((entry) => entry.some((value) => String(value || "").trim()))
    .map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] || ""])));
}

function readRows(filePath) {
  if (!filePath || !existsSync(path.resolve(root, filePath))) return [];
  const content = readFileSync(path.resolve(root, filePath), "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.rows || [];
  }
  return parseCsv(content);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function includesNeedle(value, needle) {
  if (!needle) return true;
  return normalize(value).includes(normalize(needle));
}

function filterSponsorRows(rows, sponsor) {
  if (!sponsor) return rows;
  return rows.filter((row) =>
    includesNeedle(row.business, sponsor) ||
    includesNeedle(row.label, sponsor) ||
    includesNeedle(row.item_id, sponsor) ||
    includesNeedle(row.campaign_id, sponsor)
  );
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = String(row[key] || "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function topSearches(rows, limit = 10) {
  return countBy(rows, "query").slice(0, limit).map(([query, count]) => ({ query, count }));
}

function markdown(report) {
  const lines = [];
  lines.push(`# Sponsor Report: ${report.sponsor || "All Sponsors"}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Clicks: ${report.summary.clicks}`);
  lines.push(`- Coupon claims: ${report.summary.couponClaims}`);
  lines.push(`- Unique click sessions: ${report.summary.uniqueClickSessions}`);
  lines.push(`- Unique coupon emails: ${report.summary.uniqueCouponEmails}`);
  lines.push("");
  lines.push("## Click Actions");
  lines.push("");
  if (report.clickActions.length) {
    report.clickActions.forEach((item) => lines.push(`- ${item.action}: ${item.count}`));
  } else {
    lines.push("- No click rows for this sponsor.");
  }
  lines.push("");
  lines.push("## Top Search Queries");
  lines.push("");
  if (report.topSearches.length) {
    report.topSearches.forEach((item) => lines.push(`- ${item.query}: ${item.count}`));
  } else {
    lines.push("- No search rows supplied.");
  }
  lines.push("");
  lines.push("## Coupon Codes");
  lines.push("");
  if (report.couponCodes.length) {
    report.couponCodes.forEach((item) => lines.push(`- ${item.code}: ${item.count}`));
  } else {
    lines.push("- No coupon claim rows for this sponsor.");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildReport({ sponsor, clicks, searches, claims }) {
  const sponsorClicks = filterSponsorRows(clicks, sponsor);
  const sponsorClaims = filterSponsorRows(claims, sponsor);
  return {
    generatedAt: new Date().toISOString(),
    sponsor,
    summary: {
      clicks: sponsorClicks.length,
      couponClaims: sponsorClaims.length,
      uniqueClickSessions: uniqueCount(sponsorClicks, "session_id"),
      uniqueCouponEmails: uniqueCount(sponsorClaims, "email")
    },
    clickActions: countBy(sponsorClicks, "action").map(([action, count]) => ({ action, count })),
    topClickLabels: countBy(sponsorClicks, "label").slice(0, 10).map(([label, count]) => ({ label, count })),
    topSearches: topSearches(searches),
    couponCodes: countBy(sponsorClaims, "code").map(([code, count]) => ({ code, count }))
  };
}

function run() {
  const args = parseArgs();
  const sponsor = args.business || args.sponsor || "";
  const report = buildReport({
    sponsor,
    clicks: readRows(args.clicks),
    searches: readRows(args.searches),
    claims: readRows(args.claims)
  });

  if (args.json) {
    writeFileSync(path.resolve(root, args.json), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  const md = markdown(report);
  if (args.out) {
    writeFileSync(path.resolve(root, args.out), md, "utf8");
  }
  console.log(md);
}

run();
