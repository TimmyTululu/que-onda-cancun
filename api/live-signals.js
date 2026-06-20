const SIGNAL_TTL_MS = 8 * 60 * 1000;
const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=21.1619&longitude=-86.8515&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FCancun&forecast_days=1";
const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=USD&to=MXN";
const EXCHANGERATE_HOST_URL = "https://api.exchangerate.host/latest?base=USD&symbols=MXN";
const SARGASSO_LIST_URL = "https://diredimoat.semar.gob.mx/OpSargazo/SargazoBoletinDiario.html";

let cache = {
  data: null,
  at: 0
};

function nowMs() {
  return Date.now();
}

function toneFromSargazo(level) {
  const normalized = String(level || "").toLowerCase();

  if (normalized.includes("bajo")) return "green";
  if (normalized.includes("medio") || normalized.includes("moderado")) return "yellow";
  if (normalized.includes("alto")) return "red";
  return "yellow";
}

function classifySargazoFromText(rawText) {
  const text = String(rawText || "").toLowerCase();

  if (!text) {
    return {
      level: "Medio",
      tone: "yellow"
    };
  }

  const hasCancunMention = /(canc[úu]n|zona hotelera|puerto morelos|playa del carmen|akumal)/i.test(text);
  const noArrival = /(sin\s+posibilidad\s+de\s+arribo|sin\s+arribo|sin\s+acceso)/i.test(text);
  const highArrival = /(arribos\s+en\s+vivo|arribos\s+altos|alto\s+riesgo|muy\s+alto|alto\s+impacto|alto\s+nivel)/i.test(text);
  const arrival = /(con\s+posibilidad\s+de\s+arribo|posibilidad\s+de\s+arribo|posible\s+arribo|arribo\s+esperado|arribo\s+probable|riesgo\s+de\s+arribo)/i.test(text);

  if (noArrival && hasCancunMention) {
    return {
      level: "Bajo",
      tone: "green"
    };
  }

  if (highArrival && hasCancunMention) {
    return {
      level: "Alto",
      tone: "red"
    };
  }

  if (arrival && hasCancunMention) {
    return {
      level: "Medio",
      tone: "yellow"
    };
  }

  return {
    level: "Medio",
    tone: "yellow"
  };
}

function toTextFromBuffer(buffer) {
  const latin1 = new TextDecoder("latin1").decode(buffer);
  if (/[\u00e1\u00e9\u00ed\u00f3\u00fa\u00fc\u00f1]/i.test(latin1)) {
    return latin1;
  }
  try {
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return latin1;
  }
}

function extractSargazoPdfUrl(html, baseUrl) {
  const regex = /href\s*=\s*["']([^"']*BoletinesDiarios[^"']+\.pdf)["']/gi;
  const match = regex.exec(html);
  if (!match?.[1]) return null;
  return new URL(match[1], baseUrl).href;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request_failed:${url}:${response.status}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request_failed:${url}:${response.status}`);
  }
  return response.text();
}

async function fetchLiveClimate() {
  const weather = await fetchJson(OPEN_METEO_URL);
  const min = weather?.daily?.temperature_2m_min?.[0];
  const max = weather?.daily?.temperature_2m_max?.[0];

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      id: "clima-2026-06-19",
      value: "Sin lectura",
      tone: "green",
      sourceName: "Open-Meteo",
      sourceUrl: "https://open-meteo.com/",
      summary: ""
    };
  }

  const rain = weather?.daily?.precipitation_probability_max?.[0];
  const details = [];
  const rainPercent = Number.isFinite(rain) ? Math.round(rain) : null;
  if (rainPercent !== null) details.push(`${rainPercent}%`);
  const detailText = details.length ? ` (${details.join(" · ")})` : "";

  return {
    id: "clima-2026-06-19",
    value: `${Math.round(min)}-${Math.round(max)} C`,
    tone: "green",
    sourceName: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
    summary: detailText ? `Lluvia${detailText}` : ""
  };
}

async function fetchLiveUsdMxn() {
  const fx = await fetchJson(FRANKFURTER_URL).catch(() => null);
  const directRate = Number(fx?.rates?.MXN);

  if (Number.isFinite(directRate)) {
    return {
      id: "usd-mxn-2026-06-18",
      value: directRate.toFixed(4),
      tone: "green",
      sourceName: "Frankfurter",
      sourceUrl: "https://www.frankfurter.app/",
      summary: ""
    };
  }

  const fxFallback = await fetchJson(EXCHANGERATE_HOST_URL).catch(() => null);
  const fallbackRate = Number(fxFallback?.rates?.MXN);

  if (Number.isFinite(fallbackRate)) {
    return {
      id: "usd-mxn-2026-06-18",
      value: fallbackRate.toFixed(4),
      tone: "green",
      sourceName: "exchangerate.host",
      sourceUrl: "https://exchangerate.host/",
      summary: ""
    };
  }

  return {
    id: "usd-mxn-2026-06-18",
    value: "Sin lectura",
    tone: "green",
    sourceName: "Frankfurter",
    sourceUrl: "https://www.frankfurter.app/",
    summary: ""
  };
}

async function fetchLiveSargazo() {
  const listing = await fetchText(SARGASSO_LIST_URL);
  const pdfUrl = extractSargazoPdfUrl(listing, SARGASSO_LIST_URL);

  if (!pdfUrl) {
    return {
      id: "sargazo-regional",
      value: "Medio",
      tone: toneFromSargazo("medio"),
      sourceName: "SEMAR",
      sourceUrl: SARGASSO_LIST_URL,
      summary: ""
    };
  }

  const pdfResponse = await fetch(pdfUrl);
  if (!pdfResponse.ok) {
    throw new Error(`sargazo_pdf:${pdfResponse.status}`);
  }

  const buffer = await pdfResponse.arrayBuffer();
  const rawText = toTextFromBuffer(buffer);
  const classified = classifySargazoFromText(rawText);

  return {
    id: "sargazo-regional",
    value: classified.level,
    tone: classified.tone,
    sourceName: "SEMAR",
    sourceUrl: pdfUrl,
    summary: ""
  };
}

async function fetchLiveSignals() {
  const [climate, fx, sargazo] = await Promise.allSettled([
    fetchLiveClimate(),
    fetchLiveUsdMxn(),
    fetchLiveSargazo()
  ]);

    const fallbackSargazo = {
      id: "sargazo-regional",
      value: "Medio",
      tone: "yellow",
      sourceName: "SEMAR",
      sourceUrl: SARGASSO_LIST_URL,
      summary: ""
    };

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    signals: [
      climate.status === "fulfilled"
        ? climate.value
        : {
            id: "clima-2026-06-19",
            value: "Sin lectura",
            tone: "green",
            sourceName: "Open-Meteo",
            sourceUrl: "https://open-meteo.com/",
            summary: ""
          },
      fx.status === "fulfilled"
        ? fx.value
        : {
            id: "usd-mxn-2026-06-18",
            value: "Sin lectura",
            tone: "green",
            sourceName: "Frankfurter",
            sourceUrl: "https://www.frankfurter.app/",
            summary: ""
        },
      sargazo.status === "fulfilled" ? sargazo.value : fallbackSargazo
    ]
  };
}

function cacheEntry(payload) {
  cache = {
    data: payload,
    at: nowMs()
  };
}

export default async function handler(req, res) {
  if (req.method && req.method.toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (cache.data && (nowMs() - cache.at) < SIGNAL_TTL_MS) {
    return res.status(200).json(cache.data);
  }

  try {
    const payload = await fetchLiveSignals();
    cacheEntry(payload);
    return res.status(200).json(payload);
  } catch {
    return res.status(200).json({
      ok: false,
        updatedAt: new Date().toISOString(),
        signals: [
        {
          id: "clima-2026-06-19",
          value: "Sin lectura",
            tone: "green",
            sourceName: "Open-Meteo",
            sourceUrl: "https://open-meteo.com/",
            summary: ""
        },
        {
          id: "usd-mxn-2026-06-18",
          value: "Sin lectura",
          tone: "green",
          sourceName: "Frankfurter",
          sourceUrl: "https://www.frankfurter.app/",
          summary: ""
        },
        {
          id: "sargazo-regional",
          value: "Medio",
          tone: "yellow",
          sourceName: "SEMAR",
          sourceUrl: SARGASSO_LIST_URL,
          summary: ""
        }
      ]
    });
  }
}
