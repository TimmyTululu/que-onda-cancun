# Que Onda Cancun Newsletter Rules

This file is the production memory for the weekly newsletter. Read it before changing `email.html`, `esta-semana/index.html`, or `scripts/send-newsletter.mjs`.

## Mission

Que Onda Cancun is a Monday weekly local intelligence newsletter. It should help a Cancun reader understand the coming week in five minutes.

The value is specific, timely, useful information. Do not fill space with generic advice, broad trends, empty opinion, or obvious claims.

Every issue should feel like a premium local read: practical for business owners, useful for residents, and interesting enough for casual readers.

## Weekly Cadence

- Draft every Thursday so there is time to iterate before Monday send.
- Use news from the previous few days only when it carries into the upcoming week.
- Prioritize items with a date, operational consequence, local power signal, business implication, or immediate reader utility.
- Do not build issues around past events unless they change decisions this week.

## Required Content Model

- Header: logo, `Edicion semanal local - Semana [date range]`, and `Todo lo que necesitas saber de Cancun en cinco minutos.`
- Hero banner: always include one horizontal Cancun-relevant image below the header.
- `A primera vista`: exactly three clear cards.
  - USD/MXN
  - Clima
  - Sargazo
- `La marea politica`: one or two high-signal political items.
  - Use concrete actors, power moves, dates, who benefits, and what to watch next.
  - Keep it objective and juicy, never partisan filler.
  - Do not add decorative badges like `Poder local`; the section title is enough.
  - Political item wrappers use premium cards with a teal top rule.
- `Edicion Mundial`: include only when the upcoming week has enough World Cup relevance.
  - Place it after `A primera vista` and before `La marea politica`.
  - Use compact match cards by day, `vs` between teams, and label the section with `Calendario en hora Cancun`.
  - Keep it clean and scannable; no commentary filler above the schedule.
- Sponsor/partner banner when sold.
  - Do not call it an ad inside the newsletter.
  - If an image is clicked, link to the sponsor's chosen destination.
- `Radar`: concise news items with real implications.
  - Avoid repeating topics already covered in politics, weather, sargazo, offer, or place sections.
  - Use premium story cards with teal top rule and concise category labels only when useful.
  - Do not add unrequested bubbles or meta pills such as `Lectura rapida`.
- `Lugar de la semana`: one place with a real image of that place and a practical reason it fits the week.
- One mobility, tourism, aviation, city, or infrastructure insight when useful.
  - For `La señal aerea`, use the dedicated aviation visual and a card treatment matching `Lugar de la semana`.
  - Route boxes inside the aviation visual should feel glassy/premium, not plain white overlays.
  - Avoid noisy dotted lines behind route cards; route lines must be subtle enough not to fight the text.
- `Oferta local`: one real offer with source, relevant image, and why it is useful now.
- Closing quote: real attributed quote, motivating or reflective, never invented generic filler.
- Footer: subscription/contact/unsubscribe only.

## Editorial Rules

- No "mockup", "no publicar", placeholder offers, or fake examples in production.
- No section should tell the reader to go check another source instead of giving useful information.
- No repeated topics across sections.
- No generic opportunity language like "restaurants will be full"; find a specific angle.
- No "ROI local" wording. The audience is business owners and regular people.
- No language like "ultima referencia disponible"; present current facts cleanly.
- Sources can be linked, but do not clutter section copy with dates unless the date matters.
- Use images for the actual place, offer, sponsor, or topic being discussed.
- Image links should match the image:
  - Acier banner -> Instagram.
  - Lugar de la semana image -> place website/reservation page.
  - Oferta local image -> offer or venue website.
- Logo and generic hero banner must not be wrapped in links. Add best-effort non-interactive image attributes/styles (`draggable="false"`, `pointer-events:none`, `user-select:none`, `-webkit-user-drag:none`) so they do not behave like CTAs where clients honor it. Gmail and other clients may still expose their own image download/open controls for any remote image; the template cannot disable client-level controls.

## Design Rules

- Keep the email layout premium, stable, and table-based.
- The permanent email send source is `email.html`.
- Do not send from `esta-semana/index.html`; that is the web edition.
- Keep the email outer background warm beige and the inner container at 640px.
- Use the full Que Onda Cancun logo at the top.
- Keep the hero image directly under the headline.
- `A primera vista` cards must stay visually aligned and stable.
- Use soft distinct card fills:
  - USD/MXN: soft green
  - Clima: soft yellow
  - Sargazo: soft purple
- Feature sections such as `Lugar de la semana` and `La señal aerea` use a single polished card:
  - image inside the card,
  - body copy directly below,
  - subtle detail boxes for practical reads,
  - no extra badges unless the user explicitly asks for one.
- Avoid orphaned words in prominent lines.
- Do not add web navigation to the email.
- When improving UI, preserve locked copy and content order unless the user explicitly asks for content changes.
- Never reintroduce removed labels, placeholder copy, or old image text after a section has been approved.

## Technical Send Rules

- Sender script: `node scripts/send-newsletter.mjs`
- Default source must remain `email.html`.
- Web edition remains `/esta-semana/`.
- Email images must use absolute URLs like `https://queondacancun.com/assets/...`.
- Do not attach images for the standard newsletter send.
- Every real send requires explicit `--issue`.
- Never mass-send without explicit user approval.
- Test sends must use `--test-recipient`; they log as `test_sent` and must not increment subscriber `send_count`.
- Real sends must come from `hola@queondacancun.com`.
- Never BCC the public list.
- Every recipient gets one individual email with their own unsubscribe token.
- Every email must include visible unsubscribe footer and `List-Unsubscribe` header.
- Do not reactivate `unsubscribed`, `suppressed`, or bounced contacts via duplicate signup.
- Before a real Monday send, run:

```bash
node scripts/send-newsletter.mjs --issue YYYY-MM-DD --subject "Que Onda Cancun: semana DD-DD mes"
```

Then send one controlled test:

```bash
node scripts/send-newsletter.mjs --send --test-recipient hola@queondacancun.com --issue YYYY-MM-DD --subject "Que Onda Cancun: semana DD-DD mes" --notes "controlled preflight"
```

Only after approval, run the real send:

```bash
node scripts/send-newsletter.mjs --send --issue YYYY-MM-DD --subject "Que Onda Cancun: semana DD-DD mes" --operator codex --notes "weekly send"
```

## Current Permanent Template Files

- `email.html`: production email template and source of truth for sending.
- `esta-semana/index.html`: public web edition.
- `scripts/send-newsletter.mjs`: Gmail send utility.
- `README.md`: operational subscriber and send-system documentation.

Keep `email.html` and `esta-semana/index.html` aligned in content, but do not collapse them into one file. Email and web have different layout constraints.
