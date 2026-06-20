#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function writeJson(filePath, payload) {
  writeFileSync(path.resolve(root, filePath), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function isRemote(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function slug(value) {
  return String(value || "image")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "image";
}

function extensionFromContentType(contentType, fallbackUrl) {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("image/jpeg") || type.includes("image/jpg")) return ".jpg";
  if (type.includes("image/png")) return ".png";
  if (type.includes("image/webp")) return ".webp";
  if (type.includes("image/gif")) return ".gif";
  try {
    const parsed = new URL(fallbackUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  } catch {}
  return ".jpg";
}

function collectImageRefs(data) {
  const refs = [];
  const collections = [
    ["hoy.hero", data.hoy?.hero ? [data.hoy.hero] : []],
    ["hoy.today", data.hoy?.today || []],
    ["hoy.week", data.hoy?.week || []],
    ["hoy.events", data.hoy?.events || []],
    ["week", data.week || []],
    ["promos", data.promos || []],
    ["events", data.events || []]
  ];

  for (const [section, items] of collections) {
    for (const item of items) {
      if (isRemote(item.image)) {
        refs.push({ section, item, key: "image", url: item.image });
      }
      if (Array.isArray(item.gallery)) {
        item.gallery.forEach((slide, index) => {
          if (isRemote(slide.image)) {
            refs.push({ section: `${section}.gallery[${index}]`, item: slide, key: "image", url: slide.image, owner: item });
          }
        });
      }
    }
  }

  const seen = new Set();
  return refs.filter((ref) => {
    if (seen.has(ref.url)) return false;
    seen.add(ref.url);
    return true;
  });
}

async function cacheImage(ref, assetDir, index) {
  const response = await fetch(ref.url);
  if (!response.ok) {
    throw new Error(`download failed ${response.status} ${ref.url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`not an image: ${contentType} ${ref.url}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 12_000) {
    throw new Error(`image too small (${bytes.length} bytes): ${ref.url}`);
  }

  const base = slug(ref.owner?.id || ref.item.id || ref.item.title || ref.section);
  const ext = extensionFromContentType(contentType, ref.url);
  const fileName = `${base}-${String(index + 1).padStart(2, "0")}${ext}`;
  const relative = path.posix.join("/", assetDir.replace(/\\/g, "/"), fileName);
  const absolute = path.join(root, assetDir, fileName);
  writeFileSync(absolute, bytes);
  return relative;
}

function updateRefs(data, replacements) {
  const apply = (item) => {
    if (!item || typeof item !== "object") return;
    if (replacements.has(item.image)) item.image = replacements.get(item.image);
    if (Array.isArray(item.gallery)) {
      item.gallery.forEach((slide) => {
        if (replacements.has(slide.image)) slide.image = replacements.get(slide.image);
      });
    }
  };

  apply(data.hoy?.hero);
  ["today", "week", "events"].forEach((key) => (data.hoy?.[key] || []).forEach(apply));
  ["week", "promos", "events"].forEach((key) => (data[key] || []).forEach(apply));
}

async function run() {
  const args = parseArgs();
  const input = args.input || "data/platform-candidates.json";
  const output = args.output || input;
  const assetDir = args["asset-dir"] || "assets/platform-cache";
  const write = Boolean(args.write);
  const limit = Number(args.limit || 0);
  const data = readJson(input);
  const refs = collectImageRefs(data);
  const selected = limit > 0 ? refs.slice(0, limit) : refs;

  console.log(`Remote image refs found: ${refs.length}`);
  selected.forEach((ref, index) => console.log(`${index + 1}. ${ref.section} ${ref.url}`));

  if (!write) {
    console.log("Dry run only. Re-run with --write to download and update the candidate file.");
    return;
  }

  mkdirSync(path.join(root, assetDir), { recursive: true });
  const replacements = new Map();
  for (const [index, ref] of selected.entries()) {
    const localPath = await cacheImage(ref, assetDir, index);
    replacements.set(ref.url, localPath);
    console.log(`cached ${ref.url} -> ${localPath}`);
  }

  updateRefs(data, replacements);
  writeJson(output, data);
  console.log(`updated ${output}`);

  for (const localPath of replacements.values()) {
    if (!existsSync(path.join(root, localPath.replace(/^\//, "")))) {
      throw new Error(`missing cached file after write: ${localPath}`);
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
