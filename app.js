const NAV_ITEMS = [
  { label: "Hoy", href: "/", key: "hoy" },
  { label: "Esta semana", href: "/esta-semana/", key: "esta-semana" },
  { label: "Promos", href: "/promos/", key: "promos" },
  { label: "Eventos", href: "/eventos/", key: "eventos" },
  { label: "Party", href: "/party/", key: "party" },
  { label: "Newsletter", href: "/newsletter/", key: "newsletter" },
  { label: "Contacto", href: "#contacto", key: "contacto", type: "button" }
];

const CONTACTO = {
  copy: "¿Quieres anunciarte en Qué Onda Cancún?",
  email: "hola@queondacancun.com",
  whatsapp: {
    number: "9981966876",
    message: "Hola, quiero anunciar mi marca en Qué Onda Cancún."
  }
};

const PAGE_CONFIG = {
  hoy: { label: "Hoy" },
  "esta-semana": {
    label: "Esta semana",
    title: "Qué hacer esta semana",
    collection: "week"
  },
  promos: {
    label: "Promos",
    title: "Promos activas",
    collection: "promos"
  },
  eventos: {
    label: "Eventos",
    title: "Eventos y planes",
    collection: "events"
  },
  party: {
    label: "Party",
    title: "Party en Cancún",
    collection: "party"
  }
};

const state = {
  page: document.body.dataset.page || "hoy",
  data: null,
  lastSignals: {},
  searchQuery: "",
  trackedSearchKeys: new Set()
};

const LIVE_SIGNALS_REFRESH_MS = 10 * 60 * 1000;
const SEARCH_TRACK_DELAY_MS = 900;
let signalRefreshTimer = null;
let searchTrackTimer = null;

function resolvePlatformVersion() {
  const script = document.currentScript;
  if (script?.src) {
    const fromSelf = new URL(script.src).searchParams.get("v");
    if (fromSelf) return fromSelf;
  }

  const bootConfig = window.__qocPlatform;
  if (bootConfig?.version) return bootConfig.version;

  const bootScript = document.querySelector('script[src*="/platform-route-boot.js"]');
  if (bootScript?.src) {
    const fromBoot = new URL(bootScript.src).searchParams.get("v");
    if (fromBoot) return fromBoot;
  }

  return bootConfig?.version || "";
}

const DATA_VERSION = resolvePlatformVersion();
const DATA_VERSION_QUERY = DATA_VERSION ? `?v=${encodeURIComponent(DATA_VERSION)}` : "";

const $ = (selector, root = document) => root.querySelector(selector);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesSearch(item, query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  const haystack = [
    item.title,
    item.category,
    item.description,
    item.location,
    item.neighborhood,
    item.time,
    item.date,
    item.dateTime,
    item.sourceName,
    item.ctaLabel
  ];
  const subject = normalizeSearchText(haystack.join(" "));
  return subject.includes(normalized);
}

function filterBySearch(items, query) {
  if (!Array.isArray(items)) return [];
  if (!query) return items;
  return items.filter((item) => matchesSearch(item, query));
}

function restoreSearchFocus(selectionStart, selectionEnd) {
  const input = $("#platform-search");
  if (!input) return;
  input.focus({ preventScroll: true });
  if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) {
    const valueLength = input.value.length;
    input.setSelectionRange(Math.min(selectionStart, valueLength), Math.min(selectionEnd, valueLength));
  }
}

function renderSearchBar() {
  const query = escapeHtml(state.searchQuery || "");
  return `
    <section class="content-search reveal">
      <label class="search-shell" aria-label="Buscar en esta sección">
        <span class="search-icon" aria-hidden="true"></span>
        <input
          class="platform-search-input"
          id="platform-search"
          type="search"
          placeholder="Buscar restaurantes, tours, eventos..."
          value="${query}"
          autocomplete="off"
          inputmode="search"
        >
      </label>
      ${query ? `<button class="search-clear" type="button" data-clear-search>Limpiar</button>` : ""}
    </section>
  `;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url || "");
}

function linkAttrs(url) {
  return isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
}

const IMAGE_FITS = new Set(["cover", "contain"]);
const IMAGE_KINDS = new Set(["photo", "poster", "flyer", "logo", "banner", "text_art", "fallback", "unknown"]);
const IMAGE_QUALITIES = new Set(["good", "acceptable", "poor", "missing", "unknown"]);

function safeToken(value, allowed, fallback) {
  const token = String(value || "").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return allowed.has(token) ? token : fallback;
}

function cssString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/[\n\r\f]/g, "");
}

function safeObjectPosition(value) {
  const position = String(value || "").trim();
  if (!position) return "";
  return /^[a-z0-9.%\s-]+$/i.test(position) ? position : "";
}

function inferImageKind(item) {
  const subject = normalizeSearchText([item.id, item.title, item.image, item.imageAlt, item.sourceName].join(" "));
  if (/harrys-prime-steak-house-and-raw-bar|harry/.test(subject)) return "logo";
  if (/vivoen|bazar|britney|pop tour|tributo/.test(subject)) return "flyer";
  if (/xoximilco|2x1|platinum|gimmeall|extreme-canopy|offroad|zipline|frogs-pass/.test(subject)) return "text_art";
  if (/aquaworld cancun|1920x514|cocobongo|mandala|selvatica-live-the-adrenaline/.test(subject)) return "banner";
  return "photo";
}

function resolveImagePresentation(item) {
  const kind = item.imageKind
    ? safeToken(item.imageKind, IMAGE_KINDS, "unknown")
    : inferImageKind(item);
  const fit = item.imageFit
    ? safeToken(item.imageFit, IMAGE_FITS, "cover")
    : ["flyer", "logo", "poster", "text_art"].includes(kind) ? "contain" : "cover";
  const quality = safeToken(item.imageQuality, IMAGE_QUALITIES, "unknown");
  const position = safeObjectPosition(item.imagePosition);
  return {
    kind,
    fit,
    quality,
    position,
    mediaClass: [
      "feature-media",
      `feature-media--fit-${fit}`,
      `feature-media--kind-${kind}`,
      `feature-media--quality-${quality}`
    ].join(" "),
    mediaStyle: fit === "contain" ? ` style="--media-bg: url('${escapeHtml(cssString(item.image))}')"` : "",
    imageStyle: position ? ` style="object-position:${escapeHtml(position)}"` : ""
  };
}

function dataAttr(name, value) {
  const text = String(value || "").trim();
  return text ? ` ${name}="${escapeHtml(text)}"` : "";
}

function trackAttrs({ action, item, section, label, targetUrl, campaignId, business } = {}) {
  return [
    dataAttr("data-track-action", action),
    dataAttr("data-track-item-id", item?.id),
    dataAttr("data-track-business", business || item?.sourceName || item?.location),
    dataAttr("data-track-label", label || item?.ctaLabel || item?.title),
    dataAttr("data-track-target-url", targetUrl || item?.ctaUrl),
    dataAttr("data-track-section", section),
    dataAttr("data-track-campaign-id", campaignId)
  ].join("");
}

function signalSelector(id) {
  return `[data-signal="${String(id).replace(/"/g, "\\\"")}"]`;
}

function buildDataUrl() {
  return `/data/platform.json${DATA_VERSION_QUERY}`;
}

function isReadableSignalValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "sin lectura") return false;
  return true;
}

function getSignalSeedById(signalId) {
  if (!state.data?.hoy?.signals) return null;
  return state.data.hoy.signals.find((item) => item.id === signalId) || null;
}

function getSessionId() {
  const key = "qoc_session_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `qoc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return `qoc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function analyticsPayload(type, payload = {}) {
  return {
    type,
    page: state.page,
    sessionId: getSessionId(),
    landingUrl: window.location.href,
    referrer: document.referrer,
    ...payload
  };
}

function sendAnalytics(type, payload = {}) {
  if (!shouldUseServerlessEndpoint()) return;
  const body = JSON.stringify(analyticsPayload(type, payload));
  const endpoint = "/api/track-interaction";
  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    if (sent) return;
  }
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
}

function trackClick(payload) {
  sendAnalytics("click", payload);
}

function trackElementClick(element) {
  trackClick({
    action: element.dataset.trackAction,
    itemId: element.dataset.trackItemId,
    business: element.dataset.trackBusiness,
    label: element.dataset.trackLabel || element.textContent,
    targetUrl: element.dataset.trackTargetUrl || element.getAttribute("href"),
    section: element.dataset.trackSection,
    campaignId: element.dataset.trackCampaignId,
    source: "website"
  });
}

function currentSearchItems() {
  if (!state.data) return [];
  if (state.page === "hoy") {
    const hoy = state.data.hoy || {};
    return [...(hoy.today || []), ...(hoy.week || []), ...(hoy.events || [])];
  }
  const config = PAGE_CONFIG[state.page] || PAGE_CONFIG.hoy;
  return state.data[config.collection] || [];
}

function scheduleSearchTracking(query) {
  const normalized = normalizeSearchText(query).trim();
  if (searchTrackTimer) clearTimeout(searchTrackTimer);
  if (normalized.length < 3) return;

  const page = state.page;
  const resultsCount = filterBySearch(currentSearchItems(), query).length;
  searchTrackTimer = setTimeout(() => {
    const key = `${page}:${normalized}`;
    if (state.trackedSearchKeys.has(key)) return;
    state.trackedSearchKeys.add(key);
    sendAnalytics("search", {
      page,
      query,
      resultsCount,
      source: "website-search"
    });
  }, SEARCH_TRACK_DELAY_MS);
}

function renderNav() {
  const nav = $(".site-nav");
  if (!nav) return;
  const links = NAV_ITEMS.map((item) => {
    const isCurrent = item.key === state.page;
    if (item.type === "button") {
      return `<button type="button" class="nav-action" data-action="contacto">${item.label}</button>`;
    }
    return `<a href="${item.href}"${isCurrent ? ' aria-current="page"' : ""}>${item.label}</a>`;
  }).join("");
  nav.innerHTML = `
    <div class="nav-links">${links}</div>
  `;
}

function renderBrand() {
  return `
    <a class="brand-mark" href="/" aria-label="Qué Onda Cancún">
      <img src="/assets/social/que-onda-logo-trimmed.png" alt="Qué Onda Cancún" draggable="false">
    </a>
    <p class="brand-subcopy">Todo lo que quieres saber de Cancún en un solo lugar</p>
  `;
}

function renderMetaLine(item, { includeDateTime = true } = {}) {
  const pieces = [includeDateTime ? item.dateTime : null, item.location, item.neighborhood].filter(Boolean);
  return pieces.length ? `<p class="meta-line">${pieces.map(escapeHtml).join(" · ")}</p>` : "";
}

function renderHeroLeadLine(item) {
  const dateTime = String(item.dateTime || "").trim();
  const pieces = [dateTime, item.location, item.neighborhood].filter(Boolean);
  return pieces.length ? `<p class="hero-leadline">${pieces.map(escapeHtml).join(" · ")}</p>` : "";
}

function renderHeroMetaChips(item) {
  const dateTime = String(item.dateTime || "").trim();
  const chips = Array.isArray(item.metaChips) && item.metaChips.length
    ? item.metaChips
    : [dateTime, item.neighborhood].filter(Boolean);
  if (!chips.length) return "";

  return `
    <div class="hero-meta-pills">
      ${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}
    </div>
  `;
}

function renderHeroTitle(item) {
  const lines = Array.isArray(item.titleLines) && item.titleLines.length ? item.titleLines : null;
  if (!lines) return `<h1 class="hero-title">${escapeHtml(item.title)}</h1>`;

  return `
    <h1 class="hero-title">
      ${lines.map((line) => `<span class="hero-title-line">${escapeHtml(line)}</span>`).join("")}
    </h1>
  `;
}

function isCampaignActive(campaign, now = new Date()) {
  if (!campaign || campaign.status !== "active") return false;
  const startTs = Date.parse(campaign.activeFrom || "") || null;
  const untilTs = Date.parse(campaign.activeUntil || "") || null;
  const nowTs = now.getTime();
  if (Number.isFinite(startTs) && nowTs < startTs) return false;
  if (Number.isFinite(untilTs) && nowTs > untilTs) return false;
  return true;
}

function renderHeroCampaign(item) {
  const campaign = item.campaign;
  if (!isCampaignActive(campaign)) return "";

  return `
    <button class="hero-coupon" type="button" data-action="coupon" data-campaign-id="${escapeHtml(campaign.id)}" aria-label="${escapeHtml(campaign.label)}">
      <span>${escapeHtml(campaign.badgeKicker || "Cupón")}</span>
      <strong>${escapeHtml(campaign.badgeText || campaign.label)}</strong>
    </button>
  `;
}

function renderHeroMedia(item) {
  const gallery = Array.isArray(item.gallery) && item.gallery.length > 1 ? item.gallery : null;
  if (!gallery) {
    return `<img src="${item.image}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="eager">`;
  }

  const slideDuration = Math.max(gallery.length * 4, 8);
  return `
    <span class="hero-gallery" style="--hero-slide-duration:${slideDuration}s">
      ${gallery.map((slide, index) => `
        <img
          class="hero-gallery-image"
          src="${escapeHtml(slide.image || item.image)}"
          alt="${escapeHtml(slide.imageAlt || item.imageAlt || item.title)}"
          loading="${index === 0 ? "eager" : "lazy"}"
          style="--slide-delay:${index * 4}s; object-position:${escapeHtml(slide.objectPosition || "center center")};"
        >
      `).join("")}
    </span>
  `;
}

function renderSource(item) {
  if (!item.sourceName || !item.sourceUrl) return "";
  return `<a class="source-link" href="${item.sourceUrl}"${linkAttrs(item.sourceUrl)}>${escapeHtml(item.sourceName)}</a>`;
}

function sourceBadge(item) {
  if (!item.sourceUrl) return "";
  if (/sitio oficial|oficial/i.test(item.freshness || "")) return "Sitio oficial";
  return "Sitio oficial";
}

function compactDescription(value, limit = 120) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit - 1).trimEnd();
  const end = clipped.lastIndexOf(" ");
  return `${(end > 0 ? clipped.slice(0, end) : clipped)}.`;
}

function isTemporalFeatureActive(module = {}, now = new Date()) {
  const startTs = Date.parse(module.activeFrom || "") || null;
  const untilTs = Date.parse(module.activeUntil || "") || null;
  const nowTs = now.getTime();

  if (Number.isFinite(startTs) && nowTs < startTs) return false;
  if (Number.isFinite(untilTs) && nowTs > untilTs) return false;

  const candidateMatches = [
    ...((module.today && module.today.matches) || []),
    ...((module.days && module.days.flatMap((day) => day.matches || [])) || [])
  ];

  const hasFreshKickoff = candidateMatches.some((match) => {
    const kickoffTs = Date.parse(match.kickoff || "");
    if (!Number.isFinite(kickoffTs)) return false;
    const margin = 90 * 60 * 1000;
    return kickoffTs > nowTs - margin;
  });

  if (hasFreshKickoff) return true;
  if (Number.isFinite(untilTs)) return true;
  return candidateMatches.length > 0;
}

function renderCardMeta(item) {
  const badges = [
    item.category || "Descubrir",
    item.time || "Hoy",
    item.neighborhood || item.location || ""
  ].filter(Boolean);
  return `
    <div class="card-meta-row">
      ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
    </div>
  `;
}

function renderUtilityStrip(signals) {
  const normalizedSignals = Array.isArray(signals) ? signals : [];
  return `
    <section class="utility-strip reveal" aria-label="Datos útiles de hoy">
      ${normalizedSignals.map((item, index) => `
        ${
          item.id === "clima-2026-06-19" || item.id === "usd-mxn-2026-06-18" || item.id === "sargazo-regional"
            ? `<article class="utility-card ${escapeHtml(item.tone || "")}" style="--delay:${index * 45}ms" data-signal="${escapeHtml(item.id)}">`
            : `<a class="utility-card ${escapeHtml(item.tone || "")}" style="--delay:${index * 45}ms" href="${item.sourceUrl}"${linkAttrs(item.sourceUrl)} data-signal="${escapeHtml(item.id)}">`
        }
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <em>${escapeHtml(item.summary || "")}</em>
        ${
          item.id === "clima-2026-06-19" || item.id === "usd-mxn-2026-06-18" || item.id === "sargazo-regional"
            ? "</article>"
            : "</a>"
        }
      `).join("")}
    </section>
  `;
}

function renderHero(item) {
  const tone = item.heroTone ? ` live-hero--${escapeHtml(item.heroTone)}` : "";
  return `
    <section class="live-hero reveal${tone}" id="hoy">
      <a class="live-hero-media" href="${item.ctaUrl}"${linkAttrs(item.ctaUrl)} aria-label="${escapeHtml(item.title)}"${trackAttrs({ action: "hero_media_click", item, section: "hoy.hero", targetUrl: item.ctaUrl })}>
        ${renderHeroMedia(item)}
      </a>
      ${renderHeroCampaign(item)}
      <div class="live-hero-copy">
        ${item.kicker ? `<span class="eyebrow hero-eyebrow">${escapeHtml(item.kicker)}</span>` : ""}
        ${renderHeroTitle(item)}
        ${renderHeroMetaChips(item)}
        <p class="hero-summary">${escapeHtml(item.description)}</p>
        <div class="hero-divider" aria-hidden="true"></div>
        <div class="action-row">
          <a class="action primary hero-action" href="${item.ctaUrl}"${linkAttrs(item.ctaUrl)}${trackAttrs({ action: "hero_cta_click", item, section: "hoy.hero", targetUrl: item.ctaUrl })}>${escapeHtml(item.ctaLabel || "Ver detalles")}</a>
          ${item.mapUrl ? `<a class="action hero-map-link" href="${item.mapUrl}" target="_blank" rel="noopener noreferrer"${trackAttrs({ action: "hero_map_click", item, section: "hoy.hero", label: "Ver en Google Maps", targetUrl: item.mapUrl })}>Ver en Google Maps</a>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderWorldCupPanel(worldCup) {
  if (!worldCup?.days?.length) return "";
  const todayMatches = worldCup.today?.matches || [];
  const todayLabel = worldCup.today?.label ? `Hoy, ${worldCup.today.label.toLowerCase()}` : "";
  return `
    <section class="worldcup-panel reveal" aria-label="Calendario mundialista">
      <div class="worldcup-shell">
        <div class="worldcup-heading">
          <h2>${escapeHtml(worldCup.title)}</h2>
          ${todayLabel ? `<p class="worldcup-today-labelline">${escapeHtml(todayLabel)}</p>` : ""}
        </div>
        <div class="worldcup-today">
          ${todayMatches.map((match) => `
            <article class="worldcup-match" data-kickoff="${escapeHtml(match.kickoff || "")}" data-teams="${escapeHtml(match.teams)}">
              <strong>${escapeHtml(match.time)}</strong>
              <span>${escapeHtml(match.teams)}</span>
              <em>${escapeHtml(match.channel || "")}</em>
            </article>
          `).join("")}
        </div>
        <details class="worldcup-details">
          <summary>Ver calendario completo</summary>
          <div class="worldcup-full">
            ${worldCup.days.map((day) => `
              <div class="worldcup-day">
                <b>${escapeHtml(day.label)}</b>
                ${day.matches.map((match) => `
                  <p><strong>${escapeHtml(match.time)}</strong> ${escapeHtml(match.teams)}</p>
                `).join("")}
              </div>
            `).join("")}
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderFeatureCard(item, index = 0) {
  const variant = item.cardVariant || "standard";
  const placeLine = [item.dateTime, item.location, item.neighborhood].filter(Boolean).join(" · ");
  const cardClass = `feature-card reveal feature-card--${variant === "compact" ? "compact" : variant === "featured" ? "featured" : "standard"}`;
  const image = resolveImagePresentation(item);
  return `
    <article class="${cardClass}" style="--delay:${Math.min(index, 8) * 55}ms">
      <a class="${image.mediaClass}"${image.mediaStyle} href="${item.ctaUrl}"${linkAttrs(item.ctaUrl)} aria-label="${escapeHtml(item.title)}" data-image-kind="${escapeHtml(image.kind)}" data-image-fit="${escapeHtml(image.fit)}"${trackAttrs({ action: "card_media_click", item, section: item.category, targetUrl: item.ctaUrl })}>
        <img src="${item.image}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="lazy"${image.imageStyle}>
      </a>
      <div class="feature-body">
        ${renderCardMeta(item)}
        <h3>${escapeHtml(item.title)}</h3>
        ${placeLine ? `<p class="card-place">${escapeHtml(placeLine)}</p>` : ""}
        <p>${escapeHtml(compactDescription(item.description))}</p>
        <div class="feature-footer">
          <a class="card-link" href="${item.ctaUrl}"${linkAttrs(item.ctaUrl)}${trackAttrs({ action: "card_cta_click", item, section: item.category, targetUrl: item.ctaUrl })}>${escapeHtml(item.ctaLabel || "Ver más")}</a>
          ${item.mapUrl ? `<a class="card-link card-link--map" href="${item.mapUrl}" target="_blank" rel="noopener noreferrer"${trackAttrs({ action: "card_map_click", item, section: item.category, label: "Ver en Google Maps", targetUrl: item.mapUrl })}>Ver en Google Maps</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderSection(title, deck, items, className = "") {
  if (!items || !items.length) return "";
  return `
    <section class="content-section ${className}">
      <div class="section-title">
        <h2>${escapeHtml(title)}</h2>
        ${deck ? `<p>${escapeHtml(deck)}</p>` : ""}
      </div>
      <div class="portal-grid">
        ${items.map(renderFeatureCard).join("")}
      </div>
    </section>
  `;
}

function renderNewsletterPanel() {
  return `
    <section class="newsletter-panel compact-panel">
      <div>
        <span class="eyebrow">Newsletter</span>
        <h2>Suscribete al Newsletter</h2>
        <p>Newsletter local. Cada lunes. Cero spam.</p>
      </div>
      ${subscribeForm("homepage")}
    </section>
  `;
}

function renderHomePage(data) {
  const hoy = data.hoy;
  const searchQuery = (state.searchQuery || "").trim();
  const worldCupPanel = isTemporalFeatureActive(hoy.worldCup)
    ? renderWorldCupPanel(hoy.worldCup)
    : "";
  if (searchQuery) {
    const allCards = [...(hoy.today || []), ...(hoy.week || []), ...(hoy.events || [])];
    const results = filterBySearch(allCards, searchQuery);
    return `
      ${renderBrand()}
      ${renderUtilityStrip(hoy.signals || [])}
      ${renderSearchBar()}
      <section class="content-section">
        <div class="section-title">
          <h2>Resultados</h2>
          <p>Mostrando ${results.length} resultados para "${escapeHtml(searchQuery)}".</p>
        </div>
        <div class="portal-grid listing-grid">
          ${results.map(renderFeatureCard).join("") || `<p class="empty-state">No encontramos resultados para esta búsqueda.</p>`}
        </div>
      </section>
    `;
  }
  return `
    ${renderBrand()}
    ${renderUtilityStrip(hoy.signals || [])}
    ${renderSearchBar()}
    ${renderHero(hoy.hero)}
    ${worldCupPanel}
    ${renderSection("Hoy en Cancún", "", hoy.today || [])}
    ${renderSection("Esta semana", "", hoy.week || [])}
    ${renderSection("Eventos y noche", "", hoy.events || [])}
    ${renderNewsletterPanel()}
  `;
}

function renderListingPage(config, data) {
  const items = data[config.collection] || [];
  const query = (state.searchQuery || "").trim();
  const filtered = filterBySearch(items, query);
  return `
    ${renderBrand()}
    <section class="listing-head reveal">
      <h1>${escapeHtml(config.title)}</h1>
    </section>
    ${renderSearchBar()}
    <section class="listing-content-wrap" aria-live="polite">
      ${query ? `<p class="search-summary">Mostrando ${filtered.length} de ${items.length} resultados para "${escapeHtml(query)}".</p>` : ""}
      <div class="portal-grid listing-grid">
        ${filtered.map(renderFeatureCard).join("") || `<p class="empty-state">No hay señales cargadas para esta sección.</p>`}
      </div>
    </section>
  `;
}

function subscribeForm(source) {
  return `
    <form class="subscribe platform-subscribe" data-source="${source}" aria-label="Suscripción al newsletter">
      <div class="subscribe-row">
        <label class="signup-field">
          <input type="email" name="email" placeholder="tu@email.com" autocomplete="email" required>
        </label>
        <button class="subscribe-button" type="submit">Suscribirme</button>
      </div>
      <p class="subscribe-status" role="status" aria-live="polite"></p>
    </form>
  `;
}

function renderModal() {
  const root = $("#modal-root");
  if (!root) return;
  root.innerHTML = "";
}

function findCampaignById(campaignId) {
  const heroCampaign = state.data?.hoy?.hero?.campaign;
  if (heroCampaign?.id === campaignId) return heroCampaign;
  return null;
}

function renderContactModal() {
  const root = $("#modal-root");
  if (!root) return;
  const encodedMessage = encodeURIComponent(CONTACTO.whatsapp.message);
  const whatsappUrl = `https://wa.me/52${CONTACTO.whatsapp.number}?text=${encodedMessage}`;

  root.innerHTML = `
    <div class="modal-backdrop" role="presentation" data-close-contact aria-label="Cerrar contacto">
      <div class="contact-modal" role="dialog" aria-modal="true" aria-label="Contacto comercial">
        <button class="modal-close" type="button" data-close-contact aria-label="Cerrar">✕</button>
        <p class="contact-title">${escapeHtml(CONTACTO.copy)}</p>
        <div class="contact-actions" role="list">
          <a class="contact-action contact-action--primary" href="mailto:${CONTACTO.email}" target="_blank" rel="noopener noreferrer"${trackAttrs({ action: "contact_email_click", business: "Qué Onda Cancún", label: CONTACTO.email, targetUrl: `mailto:${CONTACTO.email}`, section: "contacto" })}>Email: ${escapeHtml(CONTACTO.email)}</a>
          <a class="contact-action contact-action--secondary" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"${trackAttrs({ action: "contact_whatsapp_click", business: "Qué Onda Cancún", label: CONTACTO.whatsapp.number, targetUrl: whatsappUrl, section: "contacto" })}>WhatsApp: ${escapeHtml(CONTACTO.whatsapp.number)}</a>
        </div>
      </div>
    </div>
  `;
}

function renderCouponModal(campaign) {
  const root = $("#modal-root");
  if (!root || !campaign) return;

  root.innerHTML = `
    <div class="modal-backdrop coupon-backdrop" role="presentation" data-close-modal aria-label="Cerrar cupón">
      <div class="coupon-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(campaign.modalTitle)}">
        <button class="modal-close" type="button" data-close-modal aria-label="Cerrar">✕</button>
        <span class="coupon-modal-kicker">${escapeHtml(campaign.business || "Qué Onda Cancún")}</span>
        <h2>${escapeHtml(campaign.modalTitle)}</h2>
        <p>${escapeHtml(campaign.modalCopy)}</p>
        <form class="coupon-form" data-campaign-id="${escapeHtml(campaign.id)}" aria-label="Reclamar cupón">
          <div class="coupon-form-row">
            <label class="coupon-field">
              <input type="email" name="email" placeholder="tu@email.com" autocomplete="email" required>
            </label>
            <button class="coupon-submit" type="submit">${escapeHtml(campaign.submitLabel || "Reclamar cupón")}</button>
          </div>
          <p class="coupon-status" role="status" aria-live="polite"></p>
        </form>
      </div>
    </div>
  `;
}

function renderCouponResult(form, campaign, claim, message) {
  const modal = form.closest(".coupon-modal");
  if (!modal) return;
  const code = claim?.code || campaign.code;
  const terms = claim?.terms || campaign.terms || "";
  modal.innerHTML = `
    <button class="modal-close" type="button" data-close-modal aria-label="Cerrar">✕</button>
    <span class="coupon-modal-kicker">${escapeHtml(campaign.business || "Qué Onda Cancún")}</span>
    <h2>${escapeHtml(campaign.successTitle || "Cupón listo")}</h2>
    <p>${escapeHtml(message)}</p>
    <div class="coupon-code-box" aria-label="Código de cupón">
      <span>Código</span>
      <strong>${escapeHtml(code)}</strong>
    </div>
    <p class="coupon-terms">${escapeHtml(terms)}</p>
  `;
}

function closeModal() {
  const root = $("#modal-root");
  if (!root) return;
  root.innerHTML = "";
}

function closeContactModal() {
  closeModal();
}

async function handleSubscribe(event) {
  const form = event.target.closest(".subscribe");
  if (!form) return;
  event.preventDefault();
  const input = $("input", form);
  const button = $(".subscribe-button", form);
  const status = $(".subscribe-status", form);
  const value = input.value.trim();
  const messages = {
    subscribed: "Listo. Te sumamos a Qué Onda Cancún.",
    already_subscribed: "Ya estabas en la lista. Te mantenemos activo.",
    invalid_email: "Escribe un email válido.",
    subscribe_failed: "No entró. Inténtalo otra vez en unos segundos."
  };

  status.textContent = "Guardando...";
  status.dataset.state = "loading";
  button.disabled = true;

  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "email",
        email: value,
        whatsapp: "",
        source: form.dataset.source || "platform",
        landingUrl: window.location.href,
        referrer: document.referrer
      })
    });
    const result = await response.json().catch(() => ({}));
    const message = messages[result.message] || messages[result.error] || messages.subscribe_failed;
    if (!response.ok || !result.ok) {
      status.textContent = message;
      status.dataset.state = "error";
      return;
    }
    status.textContent = message;
    status.dataset.state = "success";
    form.reset();
  } catch {
    status.textContent = messages.subscribe_failed;
    status.dataset.state = "error";
  } finally {
    button.disabled = false;
  }
}

async function handleCouponClaim(event) {
  const form = event.target.closest(".coupon-form");
  if (!form) return;
  event.preventDefault();

  const campaign = findCampaignById(form.dataset.campaignId);
  const input = $("input", form);
  const button = $(".coupon-submit", form);
  const status = $(".coupon-status", form);
  if (!campaign || !input || !button || !status) return;

  const value = input.value.trim();
  const messages = {
    subscribed: "Listo. Ya estás en el newsletter. Tu cupón queda activo.",
    already_subscribed: "Ya estabas en el newsletter. Tu cupón queda activo.",
    invalid_email: "Escribe un email válido.",
    subscribe_failed: "No entró. Inténtalo otra vez en unos segundos."
  };

  status.textContent = "Generando cupón...";
  status.dataset.state = "loading";
  button.disabled = true;

  try {
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "email",
        email: value,
        whatsapp: "",
        source: `coupon:${campaign.id}`,
        landingUrl: window.location.href,
        referrer: document.referrer
      })
    });
    const result = await response.json().catch(() => ({}));
    const message = messages[result.message] || messages[result.error] || messages.subscribe_failed;
    if (!response.ok || !result.ok) {
      status.textContent = message;
      status.dataset.state = "error";
      return;
    }

    const claimResponse = await fetch("/api/claim-coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: value,
        campaignId: campaign.id,
        source: `coupon:${campaign.id}`,
        landingUrl: window.location.href,
        referrer: document.referrer
      })
    });
    const claim = await claimResponse.json().catch(() => ({}));
    if (!claimResponse.ok || !claim.ok) {
      status.textContent = "No pudimos generar el cupón. Inténtalo otra vez en unos segundos.";
      status.dataset.state = "error";
      return;
    }

    renderCouponResult(form, campaign, claim, message);
  } catch {
    status.textContent = messages.subscribe_failed;
    status.dataset.state = "error";
  } finally {
    button.disabled = false;
  }
}

function bindInteractions() {
  document.addEventListener("submit", handleSubscribe);
  document.addEventListener("submit", handleCouponClaim);
  document.addEventListener("input", (event) => {
    if (event.target.matches(".platform-search-input")) {
      const { value, selectionStart, selectionEnd } = event.target;
      state.searchQuery = value;
      renderApp();
      restoreSearchFocus(selectionStart, selectionEnd);
      scheduleSearchTracking(state.searchQuery);
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.matches("[data-clear-search]")) return;
    state.searchQuery = "";
    renderApp();
    restoreSearchFocus(0, 0);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const contactTrigger = target.closest("[data-action='contacto']");
    if (contactTrigger) {
      event.preventDefault();
      trackClick({
        action: "contact_modal_open",
        business: "Qué Onda Cancún",
        label: "Contacto",
        section: "contacto",
        source: "nav"
      });
      renderContactModal();
      return;
    }

    const couponTrigger = target.closest("[data-action='coupon']");
    if (couponTrigger) {
      event.preventDefault();
      const campaign = findCampaignById(couponTrigger.dataset.campaignId);
      trackClick({
        action: "coupon_modal_open",
        itemId: state.data?.hoy?.hero?.id,
        business: campaign?.business,
        label: campaign?.label,
        section: "hoy.hero",
        campaignId: campaign?.id,
        source: "hero"
      });
      renderCouponModal(campaign);
      return;
    }

    const tracked = target.closest("[data-track-action]");
    if (tracked) {
      trackElementClick(tracked);
    }

    if (target.matches("[data-close-modal]") || target.closest("[data-close-modal]")) {
      closeModal();
      return;
    }

    if (target.matches("[data-close-contact]") || target.closest("[data-close-contact]")) {
      closeContactModal();
    }

    if (target.matches(".modal-backdrop")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });
}

async function fetchFallbackSignals() {
  const climaSeed = getSignalSeedById("clima-2026-06-19");
  const usdSeed = getSignalSeedById("usd-mxn-2026-06-18");
  const sargazoSeed = getSignalSeedById("sargazo-regional");
  const values = {
    clima: {
      value: climaSeed?.value || "Sin lectura",
      tone: climaSeed?.tone || "green",
      summary: climaSeed?.summary || "",
      sourceUrl: climaSeed?.sourceUrl || "https://open-meteo.com/",
      label: climaSeed?.label || "Clima"
    },
    usd: {
      value: usdSeed?.value || "Sin lectura",
      tone: usdSeed?.tone || "green",
      sourceUrl: usdSeed?.sourceUrl || "https://www.frankfurter.app/",
      label: usdSeed?.label || "USD/MXN"
    },
    sargazo: {
      value: sargazoSeed?.value || "Medio",
      tone: sargazoSeed?.tone || "yellow",
      sourceUrl: sargazoSeed?.sourceUrl || "https://diredimoat.semar.gob.mx/OpSargazo/SargazoBoletinDiario.html",
      summary: "",
      label: sargazoSeed?.label || "Sargazo"
    }
  };

  try {
    const climaRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=21.1619&longitude=-86.8515&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FCancun&forecast_days=1");
    if (climaRes.ok) {
      const data = await climaRes.json();
      const min = data?.daily?.temperature_2m_min?.[0];
      const max = data?.daily?.temperature_2m_max?.[0];
      const rain = data?.daily?.precipitation_probability_max?.[0];
      if (Number.isFinite(min) && Number.isFinite(max)) {
        values.clima.value = `${Math.round(min)}-${Math.round(max)} C`;
        const details = [];
        if (Number.isFinite(rain)) details.push(`Lluvia ${Math.round(rain)}%`);
        if (details.length) values.clima.summary = details.join(" · ");
      }
    }
  } catch {
    values.clima.value = climaSeed?.value || "Sin lectura";
    values.clima.summary = "";
  }

  try {
    const usdRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=MXN");
    if (usdRes.ok) {
      const data = await usdRes.json();
      const rate = Number(data?.rates?.MXN);
      if (Number.isFinite(rate)) values.usd.value = rate.toFixed(4);
    }
  } catch {
    values.usd.value = usdSeed?.value || "Sin lectura";
  }

  return {
    ok: true,
    signals: [
      {
        id: "clima-2026-06-19",
        label: values.clima.label,
        value: values.clima.value,
        tone: "green",
        summary: values.clima.summary || "",
        sourceUrl: values.clima.sourceUrl
      },
      {
        id: "usd-mxn-2026-06-18",
        label: values.usd.label,
        value: values.usd.value,
        tone: values.usd.tone,
        summary: "",
        sourceUrl: values.usd.sourceUrl
      },
      {
        id: "sargazo-regional",
        label: values.sargazo.label,
        value: values.sargazo.value,
        tone: values.sargazo.tone,
        summary: "",
        sourceUrl: values.sargazo.sourceUrl
      },
    ]
  };
}

function shouldUseServerlessEndpoint() {
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!localHosts.has(window.location.hostname)) return true;
  return window.location.port === "3000" || window.location.port === "3001";
}

function shouldUseLiveSignalsEndpoint() {
  return shouldUseServerlessEndpoint();
}

async function hydrateLiveSignals() {
  const payload = await fetchLiveSignals();
  if (!payload || !Array.isArray(payload.signals)) return;
  const cards = payload.signals;

  cards.forEach((signal) => {
    const card = document.querySelector(signalSelector(signal.id));
    if (!card) return;

    const label = card.querySelector("strong");
    const summary = card.querySelector("em");

    if (label && isReadableSignalValue(signal.value)) {
      label.textContent = String(signal.value);
      state.lastSignals[signal.id] = String(signal.value);
    } else if (state.lastSignals[signal.id] && label) {
      label.textContent = state.lastSignals[signal.id];
    }

    if (signal.tone && isReadableSignalValue(signal.value)) {
      const allowed = ["sun", "green", "purple", "yellow", "red"];
      card.classList.remove(...allowed);
      card.classList.add(signal.tone);
    }

    if (summary) {
      const text = String(signal.summary || "").trim();
      if (isReadableSignalValue(signal.value) && text) {
        summary.textContent = text;
        summary.style.display = "block";
      } else {
        summary.textContent = "";
        summary.style.display = "none";
      }
    }

    if (signal.summary) {
      card.title = signal.summary;
    }
  });
}

async function fetchLiveSignals() {
  try {
    if (!shouldUseLiveSignalsEndpoint()) {
      return fetchFallbackSignals();
    }

    const response = await fetch("/api/live-signals", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

function renderApp() {
  const app = $("#app");
  if (!app || !state.data) return;
  const config = PAGE_CONFIG[state.page] || PAGE_CONFIG.hoy;
  document.title = state.page === "hoy" ? "Hoy | Qué Onda Cancún" : `${config.label} | Qué Onda Cancún`;
  if (state.page === "hoy") {
    app.innerHTML = renderHomePage(state.data);
    hydrateLiveSignals();
    if (signalRefreshTimer) clearInterval(signalRefreshTimer);
    signalRefreshTimer = setInterval(hydrateLiveSignals, LIVE_SIGNALS_REFRESH_MS);
    return;
  }
  if (signalRefreshTimer) {
    clearInterval(signalRefreshTimer);
    signalRefreshTimer = null;
  }
  app.innerHTML = renderListingPage(config, state.data);
}

function releaseBootShield() {
  if (typeof window.qocReleaseBootShield === "function") {
    window.qocReleaseBootShield();
    return;
  }
  document.documentElement.classList.remove("qoc-booting", "qoc-route-transition");
}

async function init() {
  renderNav();
  renderModal();
  const response = await fetch(buildDataUrl(), { cache: "no-store" });
  state.data = await response.json();
  renderApp();
  releaseBootShield();
  bindInteractions();
}

init().catch((error) => {
  console.error(error);
  releaseBootShield();
  const app = $("#app");
  if (app) app.innerHTML = `<p class="empty-state">No pudimos cargar la guía. Intenta de nuevo en unos segundos.</p>`;
});
