#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

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
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function runValidation(args) {
  const validatorPath = path.join(process.cwd(), "scripts/validate-platform-content.mjs");
  const source = args.source || "data/source-research.json";
  const candidates = args.candidates || "data/platform-candidates.json";
  const out = args["approved-output"] || "data/platform.approved.json";
  const result = spawnSync("node", [validatorPath, `--source`, source, `--candidates`, candidates, `--approved-output`, out], {
    stdio: "pipe",
    encoding: "utf8"
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

function run() {
  const args = parseArgs();
  const candidatesPath = args.candidates || "data/platform-candidates.json";
  const approvedPath = args["approved-output"] || "data/platform.approved.json";
  const outputPath = args.out || "data/platform.json";

  runValidation(args);
  const approved = readJson(approvedPath);
  writeJson(outputPath, approved);
  console.log(`wrote ${outputPath}`);
}

run();

