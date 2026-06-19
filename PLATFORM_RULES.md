# Qué Onda Cancún Platform Rules

This file is the production memory for the discovery platform. Read it before changing `index.html`, `app.js`, `platform.css`, `data/platform.json`, or any section route.

## Mission

The newsletter is the trust engine. The website is the platform.

The platform should become the place people open to understand what is happening in Cancún today: plans, promos, events, restaurants, beach clubs, local signals, and the weekly edition.

Move fast, but do not publish generic filler. Every card needs a practical reason to exist: a current offer, a specific date, a useful place, a live signal, a reservation/action path, or a clear local implication.

## Navigation

Permanent public nav:

- Hoy
- Esta semana
- Promos
- Eventos
- Restaurantes
- Beach clubs
- Newsletter

`Hoy` is the homepage. Do not call it Inicio in the public nav.

`Esta semana` is the weekly platform view: agenda, signals, politics, mobility, tourism, and business implications for the coming week.

`Newsletter` shows the approved weekly newsletter issue and PDF. The old `/boletin/` route may redirect to `/newsletter/`, but it must not show a separate intake page.

## Data Model

Current MVP data lives in `data/platform.json`.

Every displayed platform item should include:

- `title`
- `summary`
- `image`
- `url`
- `cta`
- `tags`
- `verified`

Use real, topic-relevant images. Do not use filler images when the item references a specific place, sponsor, offer, or venue.

Local image paths must point to existing files under `assets/`. External links need `target="_blank"` and `rel="noopener noreferrer"`.

## Editorial Standards

- No placeholders.
- No "no publicar".
- No generic claims such as "restaurants will be full" unless paired with a specific reason and action.
- No repeated topics across cards when one stronger card would do.
- No unrequested meta pills, badges, or explanatory labels.
- No "Promociónate" as a nav item in the platform.
- Prefer concise headlines that fit well on mobile.
- Spanish copy can use accents. Do not keep awkward ASCII-only Spanish in public copy.
- Be a little fun and salesy, but still premium and useful.

## Design Standards

- Keep the visual system related to the newsletter: deep green, aqua/teal, sun yellow, coral accents, warm paper surfaces.
- Premium means useful density, restrained motion, clean hierarchy, and clickable cards.
- Use soft reveal/loading animation, but respect `prefers-reduced-motion`.
- Cards must be clickable through their image and CTA.
- Avoid huge homepage copy blocks. The homepage is a discovery product, not a landing-page essay.
- Mobile must have no horizontal overflow.
- Do not let nav or H1 copy dominate the first viewport unnecessarily.

## Signup Rules

- Do not auto-open a blocking signup modal on page load.
- Newsletter signup is email-only on the website.
- Signup forms must use `/api/subscribe`.
- Do not show WhatsApp as a newsletter intake channel.
- Do not break unsubscribe, suppression, or send-log behavior.

## QA Before Deploy

Run:

```bash
node scripts/check-platform.mjs
node scripts/check-newsletter.mjs
```

Then browser-check:

- `/`
- `/esta-semana/`
- `/newsletter/`
- `/promos/`
- `/eventos/`
- `/restaurantes/`
- `/beach-clubs/`

For each route:

- seven nav items render,
- images load,
- no horizontal overflow on desktop or mobile,
- links are clickable,
- `/newsletter/` keeps PDF button and uncropped hero,
- no forbidden labels reappear.

## Current Platform Files

- `index.html`: Hoy homepage shell.
- `app.js`: shared renderer, filters, modal, subscribe integration.
- `platform.css`: platform UI system.
- `data/platform.json`: seed content and data model.
- `promos/index.html`: Promos route.
- `eventos/index.html`: Eventos route.
- `restaurantes/index.html`: Restaurantes route.
- `beach-clubs/index.html`: Beach clubs route.
- `newsletter/index.html`: approved weekly newsletter web edition.
- `boletin/index.html`: compatibility redirect to `/newsletter/`.
- `scripts/check-platform.mjs`: platform guardrail check.
