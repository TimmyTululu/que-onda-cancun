const NAV_ITEMS = [
  { label: "Hoy", href: "/", key: "hoy" },
  { label: "Esta semana", href: "/esta-semana/", key: "esta-semana" },
  { label: "Promos", href: "/promos/", key: "promos" },
  { label: "Eventos", href: "/eventos/", key: "eventos" },
  { label: "Restaurantes", href: "/restaurantes/", key: "restaurantes" },
  { label: "Beach clubs", href: "/beach-clubs/", key: "beach-clubs" },
  { label: "Boletín", href: "/boletin/", key: "boletin" }
];

const PAGE_CONFIG = {
  hoy: {
    eyebrow: "Hoy en Cancún",
    title: "Qué hacer hoy en Cancún.",
    deck: "Planes, promos, eventos y señales locales para moverte con mejores decisiones y cero ruido.",
    primary: "Ver promos",
    primaryHref: "/promos/",
    secondary: "Leer esta semana",
    secondaryHref: "/esta-semana/",
    collection: "today",
    lead: "Radar de hoy",
    intro: "Planes, señales y oportunidades seleccionadas para abrir el día con contexto.",
    filters: ["Todo", "Plan rápido", "Promo", "Agenda", "Inteligencia"]
  },
  promos: {
    eyebrow: "Promos",
    title: "Promos que sí valen la vuelta.",
    deck: "Descuentos, paquetes, noches especiales y beneficios publicados por los lugares. Todo con fuente y fecha de verificación.",
    primary: "Enviar una promo",
    primaryHref: "https://wa.me/529981528814?text=Hola%2C%20quiero%20promocionar%20mi%20marca%20en%20Qu%C3%A9%20Onda%20Canc%C3%BAn.",
    secondary: "Ver eventos",
    secondaryHref: "/eventos/",
    collection: "promos",
    lead: "Promos activas",
    intro: "La capa diaria de descuentos y planes con acción clara.",
    filters: ["Todo", "Experiencia", "Servicio destacado", "Noche", "Grupos", "Premium"]
  },
  eventos: {
    eyebrow: "Eventos",
    title: "Qué pasa hoy y este fin.",
    deck: "Agenda limpia para elegir rápido: partidos, música, shows, experiencias, familia y noche.",
    primary: "Ver calendario semanal",
    primaryHref: "/esta-semana/",
    secondary: "Ver promos",
    secondaryHref: "/promos/",
    collection: "events",
    lead: "Agenda curada",
    intro: "Eventos y momentos que cambian dónde conviene estar.",
    filters: ["Todo", "Mundial", "Noche", "Fútbol", "México", "Grupos"]
  },
  restaurantes: {
    eyebrow: "Restaurantes",
    title: "Dónde comer sin perder tiempo.",
    deck: "Una guía editorial que mezcla clásicos locales, mesas para visitantes y lugares útiles para residentes.",
    primary: "Ver promos",
    primaryHref: "/promos/",
    secondary: "Ver hoy",
    secondaryHref: "/",
    collection: "restaurants",
    lead: "Mesas para guardar",
    intro: "No es directorio infinito. Es selección con criterio y uso real.",
    filters: ["Todo", "Clásico local", "Mariscos", "Zona Hotelera", "Centro", "Cena"]
  },
  "beach-clubs": {
    eyebrow: "Beach clubs",
    title: "Playa, alberca y day pass.",
    deck: "Clubs y planes de día ordenados por vibra, zona y tipo de experiencia.",
    primary: "Ver promos",
    primaryHref: "/promos/",
    secondary: "Ver hoy",
    secondaryHref: "/",
    collection: "beachClubs",
    lead: "Clubs para considerar",
    intro: "La decisión rápida: fiesta, alberca, familia, reserva o plan tranquilo.",
    filters: ["Todo", "Party beach", "Daylight club", "Pool", "Zona Hotelera", "Grupos"]
  },
  boletin: {
    eyebrow: "Boletín",
    title: "El boletín local de la semana.",
    deck: "Recibe lo importante: qué hacer, dónde ir, promos, eventos, política local y señales útiles para Cancún.",
    primary: "Suscribirme",
    primaryHref: "#boletin",
    secondary: "Leer esta semana",
    secondaryHref: "/esta-semana/",
    collection: "today",
    lead: "Qué recibes",
    intro: "El boletín es el motor de confianza. La plataforma es el mapa vivo.",
    filters: ["Todo", "Plan rápido", "Promo", "Agenda", "Inteligencia"]
  }
};

const state = {
  page: document.body.dataset.page || "hoy",
  data: null,
  filter: "Todo",
  channel: "email"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isExternal(url) {
  return /^https?:\/\//i.test(url || "");
}

function linkAttrs(url) {
  return isExternal(url) ? ' target="_blank" rel="noopener noreferrer"' : "";
}

function renderNav() {
  const nav = $(".site-nav");
  if (!nav) return;
  nav.innerHTML = NAV_ITEMS.map((item) => `
    <a href="${item.href}"${item.key === state.page ? ' aria-current="page"' : ""}>${item.label}</a>
  `).join("");
}

function metricCards(data) {
  const signals = data.signals || [];
  return `
    <section class="signal-strip" aria-label="Senales rapidas">
      ${signals.map((item) => `
        <a class="signal-card" href="${item.url}"${linkAttrs(item.url)}>
          <span class="signal-label">${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.summary)}</span>
        </a>
      `).join("")}
    </section>
  `;
}

function card(item, index = 0) {
  const tags = item.tags || [];
  return `
    <article class="platform-card reveal" style="--delay:${Math.min(index, 8) * 55}ms">
      <a class="card-media" href="${item.url}"${linkAttrs(item.url)} aria-label="${escapeHtml(item.title)}">
        <img src="${item.image}" alt="${escapeHtml(item.title)}">
      </a>
      <div class="card-body">
        <div class="card-meta">
          <span>${escapeHtml(item.category || item.venue || "Cancún")}</span>
          <span>${escapeHtml(item.verified || "Verificado")}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        ${item.why ? `<p class="card-why">${escapeHtml(item.why)}</p>` : ""}
        <div class="tag-row">
          ${tags.slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
        <a class="card-link" href="${item.url}"${linkAttrs(item.url)}>${escapeHtml(item.cta || "Ver más")}</a>
      </div>
    </article>
  `;
}

function filterItems(items) {
  if (state.filter === "Todo") return items;
  return items.filter((item) => {
    const values = [item.category, item.area, item.venue, ...(item.tags || [])].map((value) => String(value || "").toLowerCase());
    return values.some((value) => value.includes(state.filter.toLowerCase()));
  });
}

function renderFilters(config) {
  return `
    <div class="filter-row" role="list" aria-label="Filtros">
      ${config.filters.map((filter) => `
        <button class="filter-chip${filter === state.filter ? " active" : ""}" type="button" data-filter="${escapeHtml(filter)}">${escapeHtml(filter)}</button>
      `).join("")}
    </div>
  `;
}

function renderHero(config) {
  return `
    <section class="platform-hero">
      <div class="hero-copy reveal">
        <span class="eyebrow">${escapeHtml(config.eyebrow)}</span>
        <h1>${escapeHtml(config.title)}</h1>
        <p>${escapeHtml(config.deck)}</p>
        <div class="hero-actions">
          <a class="action primary" href="${config.primaryHref}"${linkAttrs(config.primaryHref)}>${escapeHtml(config.primary)}</a>
          <a class="action secondary" href="${config.secondaryHref}"${linkAttrs(config.secondaryHref)}>${escapeHtml(config.secondary)}</a>
        </div>
      </div>
      <div class="hero-panel reveal" style="--delay:80ms">
        <img src="/assets/que-onda-cancun-logo.png" alt="Qué Onda Cancún">
        <div>
          <strong>Si está pasando en Cancún, está aquí.</strong>
          <span>Planes, promos, eventos y señales locales en una sola superficie.</span>
        </div>
      </div>
    </section>
  `;
}

function renderHomeExtras(data) {
  return `
    <section class="today-grid">
      <div class="daily-brief reveal">
        <span class="eyebrow">Pulso local</span>
        <h2>Abre Cancún con contexto.</h2>
        <p>Clima, sargazo, dólar, partidos, planes con techo y oportunidades para elegir mejor sin brincar entre diez fuentes.</p>
      </div>
      <a class="daily-brief accent reveal" href="/esta-semana/">
        <span class="eyebrow">Edición semanal</span>
        <h2>Semana 22-28 junio</h2>
        <p>Política local, calendario mundialista, radar, lugar de la semana, conectividad y oferta local.</p>
      </a>
    </section>
    ${metricCards(data)}
  `;
}

function renderCollection(config, data) {
  const items = filterItems(data[config.collection] || []);
  return `
    <section class="section-head">
      <div>
        <span class="eyebrow">${escapeHtml(config.lead)}</span>
        <h2>${escapeHtml(config.intro)}</h2>
      </div>
      ${renderFilters(config)}
    </section>
    <section class="card-grid" aria-live="polite">
      ${items.map(card).join("") || `<p class="empty-state">No hay resultados para este filtro.</p>`}
    </section>
  `;
}

function renderBoletinPanel() {
  return `
    <section class="boletin-panel" id="boletin">
      <div>
        <span class="eyebrow">Boletín</span>
        <h2>Una lectura útil. Una vez por semana. Cero spam.</h2>
        <p>Elige email o WhatsApp y recibe la edición local con lo que importa para Cancún.</p>
      </div>
      ${subscribeForm("page")}
    </section>
  `;
}

function subscribeForm(source) {
  return `
    <form class="subscribe platform-subscribe" data-source="${source}" aria-label="Suscripción al boletín">
      <div class="channel-toggle" aria-label="Elige cómo recibirlo">
        <button type="button" class="channel active" data-channel="email">Email</button>
        <button type="button" class="channel" data-channel="whatsapp">WhatsApp</button>
      </div>
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
  root.innerHTML = `
    <div class="modal-backdrop" data-modal hidden>
      <section class="signup-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button class="modal-close" type="button" aria-label="Cerrar">×</button>
        <span class="eyebrow">Boletín local</span>
        <h2 id="modal-title">Recibe Qué Onda Cancún</h2>
        <p>La guía local para saber qué hacer, dónde ir y qué está pasando.</p>
        ${subscribeForm("modal")}
        <button class="modal-later" type="button">Ahora no</button>
      </section>
    </div>
  `;
}

async function handleSubscribe(event) {
  const form = event.target.closest(".subscribe");
  if (!form) return;
  event.preventDefault();
  const active = $(".channel.active", form);
  const channel = active?.dataset.channel || "email";
  const input = $("input", form);
  const button = $(".subscribe-button", form);
  const status = $(".subscribe-status", form);
  const value = input.value.trim();
  const messages = {
    subscribed: "Listo. Te sumamos a Qué Onda Cancún.",
    already_subscribed: "Ya estabas en la lista. Te mantenemos activo.",
    invalid_email: "Escribe un email válido.",
    invalid_whatsapp: "Escribe un WhatsApp con lada.",
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
        channel,
        email: channel === "email" ? value : "",
        whatsapp: channel === "whatsapp" ? value : "",
        source: form.dataset.source || "platform",
        landingUrl: window.location.href,
        referrer: document.referrer
      })
    });
    const data = await response.json().catch(() => ({}));
    const message = messages[data.message] || messages[data.error] || messages.subscribe_failed;
    if (!response.ok || !data.ok) {
      status.textContent = message;
      status.dataset.state = "error";
      return;
    }
    status.textContent = message;
    status.dataset.state = "success";
    form.reset();
    window.localStorage.setItem("qoc_boletin_seen", "1");
  } catch {
    status.textContent = messages.subscribe_failed;
    status.dataset.state = "error";
  } finally {
    button.disabled = false;
  }
}

function bindInteractions(config) {
  document.addEventListener("click", (event) => {
    const filter = event.target.closest(".filter-chip");
    if (filter) {
      state.filter = filter.dataset.filter || "Todo";
      renderApp();
      return;
    }

    const channel = event.target.closest(".channel");
    if (channel) {
      const form = channel.closest(".subscribe");
      $$(".channel", form).forEach((item) => item.classList.remove("active"));
      channel.classList.add("active");
      const input = $("input", form);
      const isWhatsApp = channel.dataset.channel === "whatsapp";
      input.type = isWhatsApp ? "tel" : "email";
      input.name = isWhatsApp ? "whatsapp" : "email";
      input.placeholder = isWhatsApp ? "+52 998 000 0000" : "tu@email.com";
      input.autocomplete = isWhatsApp ? "tel" : "email";
      input.value = "";
      const status = $(".subscribe-status", form);
      status.textContent = "";
      status.dataset.state = "";
      return;
    }

    if (event.target.closest(".modal-close") || event.target.closest(".modal-later")) {
      closeModal();
      return;
    }

    const backdrop = event.target.closest("[data-modal]");
    if (backdrop && event.target === backdrop) closeModal();
  });

  document.addEventListener("submit", handleSubscribe);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  if (config.primaryHref === "#boletin") {
    $(".action.primary")?.addEventListener("click", (event) => {
      event.preventDefault();
      $("#boletin")?.scrollIntoView({ behavior: "smooth" });
    });
  }
}

function openModal() {
  const modal = $("[data-modal]");
  if (!modal || window.localStorage.getItem("qoc_boletin_seen")) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("visible"));
}

function closeModal() {
  const modal = $("[data-modal]");
  if (!modal) return;
  modal.classList.remove("visible");
  window.localStorage.setItem("qoc_boletin_seen", "1");
  setTimeout(() => {
    modal.hidden = true;
  }, 180);
}

function renderApp() {
  const app = $("#app");
  if (!app || !state.data) return;
  const config = PAGE_CONFIG[state.page] || PAGE_CONFIG.hoy;
  document.title = state.page === "hoy" ? "Hoy | Qué Onda Cancún" : `${config.eyebrow} | Qué Onda Cancún`;
  app.innerHTML = `
    ${renderHero(config)}
    ${state.page === "hoy" ? renderHomeExtras(state.data) : ""}
    ${renderCollection(config, state.data)}
    ${state.page === "boletin" ? renderBoletinPanel() : ""}
  `;
}

async function init() {
  renderNav();
  renderModal();
  const app = $("#app");
  if (app) {
    app.innerHTML = `
      <section class="loading-card" aria-label="Cargando guía">
        <span class="eyebrow">Qué Onda Cancún</span>
        <h1>Armando el pulso de hoy.</h1>
        <p>Promos, eventos, restaurantes y señales locales en camino.</p>
      </section>
    `;
  }
  const response = await fetch("/data/platform.json");
  state.data = await response.json();
  renderApp();
  bindInteractions(PAGE_CONFIG[state.page] || PAGE_CONFIG.hoy);
  if (state.page !== "boletin") {
    setTimeout(openModal, 900);
  }
}

init().catch((error) => {
  console.error(error);
  const app = $("#app");
  if (app) app.innerHTML = `<p class="empty-state">No pudimos cargar la guía. Intenta de nuevo en unos segundos.</p>`;
});
