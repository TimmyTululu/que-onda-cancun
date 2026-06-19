import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const routes = [
  ["Hoy", "index.html", 'data-page="hoy"'],
  ["Esta semana", "esta-semana/index.html", "Descargar PDF"],
  ["Promos", "promos/index.html", 'data-page="promos"'],
  ["Eventos", "eventos/index.html", 'data-page="eventos"'],
  ["Restaurantes", "restaurantes/index.html", 'data-page="restaurantes"'],
  ["Beach clubs", "beach-clubs/index.html", 'data-page="beach-clubs"'],
  ["Boletín", "boletin/index.html", 'data-page="boletin"']
];

const requiredNav = ["Hoy", "Esta semana", "Promos", "Eventos", "Restaurantes", "Beach clubs", "Boletín"];
const forbidden = ["Lectura rápida", "Última referencia disponible", "no publicar"];

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

for (const [label, file, marker] of routes) {
  const html = read(file);
  assert(html.includes(marker), `${label} route is missing marker: ${marker}`);
  assert(html.includes("<title>"), `${label} route is missing <title>`);
}

const app = read("app.js");
for (const item of requiredNav) {
  assert(app.includes(`label: "${item}"`), `App nav is missing ${item}`);
}

const newsletter = read("esta-semana/index.html");
for (const item of requiredNav) {
  assert(newsletter.includes(`>${item}<`), `Newsletter nav is missing ${item}`);
}
assert(newsletter.includes("que-onda-cancun-semana-22-28-junio.pdf"), "Newsletter PDF link is missing");
assert(
  existsSync(path.join(root, "assets/newsletter/que-onda-cancun-semana-22-28-junio.pdf")),
  "Newsletter PDF asset is missing"
);
assert(!newsletter.includes("object-fit: cover"), "Newsletter hero images must not be cropped with object-fit cover");

const data = JSON.parse(read("data/platform.json"));
for (const collection of ["today", "promos", "events", "restaurants", "beachClubs"]) {
  assert(Array.isArray(data[collection]) && data[collection].length > 0, `Missing data collection: ${collection}`);
  for (const [index, item] of data[collection].entries()) {
    for (const field of ["title", "summary", "image", "url", "cta", "verified"]) {
      assert(item[field], `${collection}[${index}] is missing ${field}`);
    }
    if (item.image.startsWith("/")) {
      const localImage = item.image.split("?")[0].replace(/^\//, "");
      assert(existsSync(path.join(root, localImage)), `Missing local image: ${item.image}`);
    }
  }
}

for (const file of ["index.html", "app.js", "data/platform.json", "esta-semana/index.html"]) {
  const content = read(file);
  for (const phrase of forbidden) {
    assert(!content.includes(phrase), `${file} contains forbidden phrase: ${phrase}`);
  }
}

console.log("platform checks passed");
