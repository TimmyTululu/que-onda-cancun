#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const checks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function addCheck(name, pass, detail = '') {
  checks.push({ name, pass, detail });
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  return match ? match[1] : '';
}

const web = read('esta-semana/index.html');
const email = read('email.html');
const rules = read('NEWSLETTER_RULES.md');
const pdfMatch = web.match(/href="\/(assets\/newsletter\/[^"]+\.pdf)"/);

const heroBlocks = [
  cssBlock(web, '.hero-banner img'),
  ...[...web.matchAll(/\.hero-banner img\s*\{([\s\S]*?)\}/gm)].map((match) => match[1]),
].filter(Boolean);

addCheck(
  'web hero uses natural height',
  heroBlocks.length > 0 && heroBlocks.every((block) => /height:\s*auto\s*;/.test(block)),
  'All .hero-banner img blocks must use height:auto.'
);
addCheck(
  'web hero is not cropped',
  !/\.hero-banner img\s*\{[\s\S]*?object-fit\s*:\s*cover/i.test(web),
  'Do not use object-fit: cover on the hero image.'
);
addCheck(
  'email hero uses natural height',
  /class="hero-img"[\s\S]*height:auto/i.test(email),
  'Email hero must keep height:auto.'
);
addCheck(
  'removed politics badge stays removed',
  !/Poder local/i.test(web) && !/Poder local/i.test(email),
  'Do not reintroduce Poder local.'
);
addCheck(
  'removed radar badge stays removed',
  !/Lectura rápida/i.test(web) && !/Lectura rápida/i.test(email),
  'Do not reintroduce Lectura rápida.'
);
addCheck(
  'no placeholders',
  !/no publicar|mockup|placeholder|oferta ejemplo/i.test(web + email),
  'Production newsletter must not contain placeholders.'
);
addCheck(
  'rules include hero crop guard',
  /Hero image must render uncropped/i.test(rules),
  'NEWSLETTER_RULES.md must preserve the hero crop rule.'
);
addCheck(
  'web PDF download link exists',
  Boolean(pdfMatch) && /Descargar PDF/i.test(web),
  'Web edition must expose a Descargar PDF link.'
);
addCheck(
  'web PDF asset exists',
  Boolean(pdfMatch) && existsSync(pdfMatch[1]),
  'The linked PDF asset must exist in the repo.'
);

const failed = checks.filter((check) => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.pass ? '' : ` - ${check.detail}`}`);
}

if (failed.length) {
  process.exit(1);
}
