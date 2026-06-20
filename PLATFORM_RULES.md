# Qué Onda Cancún Platform Rules

This file is the production memory for the discovery platform. Read it before changing `index.html`, `app.js`, `platform.css`, `data/platform.json`, or any section route.

## Current Design Lock (Committed Behavior)

As of 2026-06-19, this is the baseline UI design and behavior that is considered locked unless a user explicitly asks for a redesign:

- Shared layout/components are authoritative for Hoy and discovery pages:
  - `platform.css`
  - `app.js`
  - `data/platform.json`
- One reusable card system for:
  - Hoy
  - Eventos
  - Promos
  - Esta semana
- One reusable signal chip system for:
  - Clima
  - USD/MXN
  - Sargazo
  - plus any other homepage utility signals
- Do not rework structure for new content updates; only update data and assets.
- Daily updates (Hoy, promos, events, "El plan de hoy") must keep structure, typography scale, card/chip patterns, and CTA treatments unchanged unless explicitly approved.
- New content must follow existing component contracts and constraints already present in `platform.css`/`app.js`.
- Do not add alternate media modes (`contain`, padded logo mode, letterbox mode) to shared homepage or card components.
- Do not mutate the homepage hero into a multi-column sponsorship layout. Monetization modules must be isolated components, not edits to the locked hero/card structure.
- Never "template-cleanup" with unrelated UX redesign while updating data.
- If design is accidentally altered, first restore from repository baseline and then rerun checks.
- Newsletter and web edition can diverge by transport constraints, but both should preserve brand look, section order logic, and premium tone.

For any daily content pipeline automation:
- Prefer editing data + approved sources.
- Keep rendering logic stable.
- Verify output with:
  - `/`
  - `/esta-semana/`
  - `/promos/`
  - `/eventos/`
  - `/newsletter/`

Do not change this lock in code changes unless explicitly requested by user.

## Mission

The newsletter is the trust engine. The website is the live city portal.

Qué Onda Cancún should immediately help someone decide what to do in Cancún today: plans, promos, events, restaurants, nightlife, beach/weather context, local news signals, and weekly opportunities.

Do not publish generic filler. Every card needs a practical reason to exist: a current offer, a specific date, a useful place, a live signal, a reservation/action path, or a clear local implication.

## Navigation

Public nav:

- Hoy
- Esta semana
- Promos
- Eventos
- Newsletter

Do not add `Inicio`; it is redundant because the home page is `Hoy`.

`Restaurantes` and `Beach clubs` are not top-level nav pages until those datasets are deep and current enough. Their useful items should appear inside Hoy, Esta semana, Promos, and Eventos.

`Newsletter` shows the approved weekly newsletter issue and PDF. The old `/boletin/` route may redirect to `/newsletter/`, but it must not show a separate intake page.

## Homepage

Homepage is `Hoy`; it is not a landing manifesto.

Hero hard rules:

- Main title maximum is 3 lines, at all breakpoints.
- Short brand/place names must stay on one line when they fit. Do not create avoidable line breaks in hero titles.
- Lead the hero with an eyebrow like `El plan de hoy`; do not repeat the day label inside the lead line.
- If the eyebrow already says `Recomendación de la semana`, the title must be the brand/place name or offer only. Do not repeat `de la semana` in the title.
- Do not render a secondary source line inside the hero footer.
- Hero CTAs must be premium-sized and obvious; avoid tiny template pills.
- Hero CTA rows must remain fully visible inside the locked container. Shorten title/copy before changing the container.
- Keep hero metadata compact and scannable (no oversized, orphan labels).
- Homepage hero image is full-bleed only. Do not use `contain`, internal padding, logo framing, or dark bars inside the hero media area.
- Sponsored/recommended hero copy must use specific sourced brand language, not generic phrases like `mesa recomendada`, `plan completo`, or `restaurante premium para una comida cuidada`.

Required order:

1. Centered transparent logo.
2. One real, useful current feature with accurate image, date/time, location, source, and specific CTA.
3. Compact live-style utility widgets: clima, USD/MXN, sargazo.
4. Hoy en Cancún.
5. Esta semana.
6. Eventos.
7. Small newsletter signup module.

Newsletter module lock:

- Bottom homepage newsletter banner must stay compact and premium: short single-line title (`Suscribete al Newsletter`) and compact subcopy (`Newsletter local. Cada lunes. Cero spam.`), no extra lines that waste vertical space.

Do not add redundant hero CTAs such as "Ver eventos" or "Leer newsletter"; those actions already exist in nav unless the hero itself needs a specific CTA.

Utility signals are not content cards. They must sit near the top of the page, directly under the logo and before the hero, as small translucent widgets with label + value only. Do not add explanatory subcopy inside the widgets. Weather and USD/MXN should hydrate from live public APIs when possible; sargazo remains editorial until a reliable public API is wired.

High-ROI recurring utilities are standalone product modules, not cards. Example: during the World Cup, the schedule belongs on the homepage as a compact expandable calendar in Cancún time. It must not appear as a generic card that links back to the newsletter. The mental model is: if the user would open Qué Onda Cancún specifically to answer it, build the answer into the site.

Newsletter content can inform the portal, but it must not leak into portal sections as filler. Do not use newsletter images, newsletter-only links, or analysis/news items as generic platform cards. Discovery pages should send users to the business, event, reservation, ticket, map, or useful primary source.

World Cup calendar lock:

- Keep one centered in-panel date line under the section title (example: `Hoy, viernes 19 de junio`).
- Remove the old "Próximo partido" pill.
- Keep team rows as readable compact cards and keep the expanded schedule CTA visually prominent.
- Do not surface source text inside the card module.

Seasonal module hygiene:

- Any temporary feature module (World Cup, holidays, sports windows, etc.) must define a bounded window in `data/platform.json` using `activeFrom` and `activeUntil`.
- The renderer should never hardcode seasonal fallbacks; it must gate rendering on `isTemporalFeatureActive`.
- When the window expires, the module should disappear automatically, not by manual edits in `app.js`.
- Keep campaign module data in data files, not CSS/JS branches, so cleanup is editorial, not technical.

## Data Model

Current MVP data lives in `data/platform.json`.

Every displayed platform item must include:

- `id`
- `title`
- `category`
- `date`
- `time`
- `dateTime`
- `location`
- `neighborhood`
- `image`
- `sourceUrl`
- `sourceName`
- `freshness`
- `ctaLabel`
- `ctaUrl`
- `description`
- `priority`

Descriptions must be 120 characters or less. Cards are for scanning, not reading.

Use real, topic-relevant images. Do not use filler images when the item references a specific place, sponsor, offer, or venue. If an accurate image is unavailable, use a tasteful generic card only as a clearly marked temporary editorial fallback.

Local image paths must point to existing files under `assets/`. External links need `target="_blank"` and `rel="noopener noreferrer"`.

## Source Strategy

Use this order:

1. Official venue/business/event pages.
2. Public posts from the business when accessible.
3. Event/ticket pages such as Eventbrite, venue ticketing, Songkick/Bandsintown.
4. Local news and official public sources for politics, utility, mobility, and alerts.
5. Utility APIs for weather and USD/MXN.
6. Manual editorial fallback in `data/platform.json` when scraping is not ready.

Do not fake automation. If a source cannot be verified quickly, mark the card as a manual gap and do not overclaim freshness.

## Editorial Standards

- No placeholders.
- No "no publicar".
- No generic claims unless paired with a specific reason and action.
- No repeated topics across cards when one stronger card would do.
- No unrequested meta pills, badges, or explanatory labels.
- No "Promociónate" as a nav item.
- No orphan words in prominent headlines or hero copy.
- Reduce explanatory copy. Let cards explain the product.
- Spanish copy can use accents. Do not keep awkward ASCII-only Spanish in public copy.
- Be fun and a bit salesy, but still premium, specific, and useful.

## Design Standards

- Keep the visual system related to the newsletter: deep green, aqua/teal, sun yellow, coral accents, warm paper surfaces.
- Premium means useful density, restrained motion, clean hierarchy, sourceable cards, and clickable images/CTAs.
- Use soft reveal/loading animation, but respect `prefers-reduced-motion`.
- All discovery cards in Hoy, Esta semana, Promos, and Eventos use one reusable editorial card component: image on top, consistent metadata row, strong title, time/location line, one short description, and CTA glued to the bottom.
- Card images must fill their image area with `object-fit: cover`; no `contain`, no letterboxing, no dark bars, no empty bands, and no distortion.
- Standard discovery cards cannot use logo-only assets. If the asset is not a full-bleed editorial image, it does not belong in the shared card template.
- Card CTAs align to the bottom through flex-column layout. Rows should feel even when copy length differs.
- Do not show visible `Fuente:` text inside cards. The CTA links to the source; source trust can appear as a subtle metadata badge such as `Sitio oficial` or `Fuente verificada`.
- Cards must be clickable through their image and CTA.
- Avoid huge homepage copy blocks.
- Mobile first screen must show logo/nav, one current useful item with image, and compact utility cards.
- Mobile must have no horizontal overflow.
- No broken or badly cropped images.

## Signup Rules

- Do not auto-open a blocking signup modal on page load.
- Newsletter signup is email-only on the website.
- Signup forms must use `/api/subscribe`.
- Do not show WhatsApp as a newsletter intake channel.
- Do not break unsubscribe, suppression, send-log, or email template behavior.

## QA Before Deploy

Run:

```bash
node --check app.js
node scripts/check-platform.mjs
node scripts/check-newsletter.mjs
```

Then browser-check:

- `/`
- `/esta-semana/`
- `/promos/`
- `/eventos/`
- `/newsletter/`
- `/restaurantes/` redirects
- `/beach-clubs/` redirects

For the active routes:

- five nav items render,
- images load,
- no horizontal overflow on desktop or mobile,
- links are clickable,
- homepage first screen is useful immediately,
- utility cards are compact,
- Promos shows actual promos immediately,
- Eventos shows actual events immediately,
- `/newsletter/` keeps PDF button and uncropped hero,
- forbidden labels or WhatsApp intake do not reappear.

## Current Platform Files

- `index.html`: Hoy homepage shell.
- `app.js`: shared renderer, page-specific layouts, filters, subscribe integration.
- `platform.css`: platform UI system.
- `data/platform.json`: seed content, source metadata, and manual fallback schema.
- `promos/index.html`: Promos route.
- `eventos/index.html`: Eventos route.
- `esta-semana/index.html`: weekly platform route.
- `newsletter/index.html`: approved weekly newsletter web edition.
- `boletin/index.html`: compatibility redirect to `/newsletter/`.
- `restaurantes/index.html`: compatibility redirect to `/`.
- `beach-clubs/index.html`: compatibility redirect to `/`.
- `scripts/check-platform.mjs`: platform guardrail check.
