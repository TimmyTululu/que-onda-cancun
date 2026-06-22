# Que Onda Cancun

Standalone landing page for `queondacancun.com`.

For weekly newsletter editorial, design, and send rules, read `NEWSLETTER_RULES.md` before changing the template or sender.

For platform/product rules, read `PLATFORM_RULES.md` before changing the homepage, section routes, shared renderer, shared CSS, or platform data.

## Domain

- Canonical: `https://queondacancun.com`
- Redirect: `https://www.queondacancun.com` -> `https://queondacancun.com`
- Sitemap: `https://queondacancun.com/sitemap.xml`
- Robots: `https://queondacancun.com/robots.txt`
- SEO guardrail: `node scripts/check-platform.mjs` must pass before deploy; it verifies canonical tags, social metadata, structured data, `robots.txt`, and `sitemap.xml`.

## DNS

Website records expected at the registrar:

```txt
A @ 76.76.21.21
CNAME www cname.vercel-dns.com
```

Email/security records are intentionally untouched.

## Subscriber Capture

- Endpoint: `POST /api/subscribe`
- Sheet: `Que Onda Cancun Subscribers`
- Sheet ID: `1mQQt712MOdGHZzRLLwGGEX7a5deOegOb0nOoc2rL9So`
- Sheet URL: `https://docs.google.com/spreadsheets/d/1mQQt712MOdGHZzRLLwGGEX7a5deOegOb0nOoc2rL9So/edit`
- Drive folder: `https://drive.google.com/drive/folders/1BTdMAA66dhGzedAHACJpCYNXruVwn6uT`
- Actual parent folder: `REGISTRO` inside `QUE ONDA CANCUN`
- Legacy mixed tab: `Sheet1` retained as backup
- Email registry: `Email Subscribers!A:W`
- WhatsApp registry: `WhatsApp Subscribers!A:O`
- Email send log: `Send Log`
- Coupon claim log: `Coupon Claims`
- Click intent log: `Interaction Clicks`
- Search intent log: `Search Queries`
- Vercel env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `QUE_ONDA_SUBSCRIBERS_SHEET_ID`
- Email columns: `created_at`, `channel`, `email`, `contact_key`, `source`, `landing_url`, `referrer`, `user_agent`, `status`, `duplicate_count`, `last_seen_at`, `unsubscribe_token`, `unsubscribed_at`, `unsubscribe_reason`, `last_send_at`, `last_send_issue`, `last_send_status`, `last_send_message_id`, `last_send_error`, `send_count`, `bounce_status`, `bounced_at`, `last_clicked_at`
- WhatsApp columns: `created_at`, `channel`, `whatsapp`, `contact_key`, `source`, `landing_url`, `referrer`, `user_agent`, `status`, `duplicate_count`, `last_seen_at`, `opt_out_at`, `opt_out_reason`, `last_sent_at`, `notes`
- Duplicate behavior: same normalized email or WhatsApp preserves the existing `status`, updates `duplicate_count` and `last_seen_at`, and never silently reactivates unsubscribed, suppressed, or bounced contacts.
- Unsubscribe endpoint: `GET /api/unsubscribe?token=...`
  - Looks up `unsubscribe_token` in `Email Subscribers`
  - Updates `status=unsubscribed`, `unsubscribed_at`, and `unsubscribe_reason=one-click`
  - Returns a branded confirmation page without exposing contact data
- Coupon claim endpoint: `POST /api/claim-coupon`
  - Validates the campaign against `data/platform.json`
  - Ensures `Coupon Claims` exists with deterministic headers
  - Appends every claim with `campaign_id`, `business`, `email`, `contact_key`, `code`, `landing_url`, `referrer`, `user_agent`, and `status`
  - Returns the server-side coupon code only after the claim is logged
- Interaction endpoint: `POST /api/track-interaction`
  - Keeps analytics organized in two separate tabs: `Interaction Clicks` and `Search Queries`
  - Logs high-intent clicks such as coupon opens, hero CTAs, Maps clicks, card CTAs, and contact actions
  - Logs search queries only after the user pauses and only for searches with 3+ characters
  - Does not write emails or WhatsApp numbers to analytics tabs; subscriber and coupon identity data stay in their own tabs
- Migration: existing `Sheet1` rows were backfilled into channel-specific tabs. `Sheet1` remains untouched as legacy backup.

## Platform Automation Tools

These tools are non-visual. They harden the data pipeline without changing `platform.css`, card layout, or page structure.

- Platform refresh workflow:
  - GitHub Actions file: `.github/workflows/daily-platform-refresh.yml`
  - Standby status: the GitHub workflow is disabled and scheduled daily runs are removed.
  - Manual refresh requires re-enabling the workflow first, then GitHub Actions -> `Manual Platform Refresh` -> `Run workflow`.
  - Requires repository secret `FIRECRAWL_API_KEY` while the World Cup module is active.
  - Runs `node scripts/refresh-platform-data.mjs`, `node --check app.js`, `node scripts/check-platform.mjs`, and `node scripts/check-newsletter.mjs`.
  - Commits only `data/platform.json`, `data/platform-candidates.json`, and `data/platform-refresh-report.json` when those files change.
- Local manual refresh:
  - `node scripts/refresh-platform-data.mjs`
  - Optional local fixture mode for reviewed Firecrawl markdown: `node scripts/refresh-platform-data.mjs --worldcup-markdown .firecrawl/espn-worldcup-schedule.md`
- Static platform snapshots:
  - `node scripts/generate-platform-snapshots.mjs`
  - Generates crawler-friendly `<noscript>` summaries and conservative `ItemList` JSON-LD for the platform routes.
  - Exists so crawlers can understand current route content without depending only on client-side rendering.
  - Event JSON-LD is allowed only for complete, active, trusted event records. Promo `Offer` JSON-LD is intentionally not generated until promo terms and explicit expirations are source-backed.
  - Check mode: `node scripts/generate-platform-snapshots.mjs --check`.
- Data audit:
  - `node scripts/audit-platform-data.mjs`
  - Surfaces remote images, missing local assets, stale dates, promo/event expiry gaps, repeated locations, and generic CTA labels.
- Lifecycle dry run:
  - `node scripts/apply-platform-lifecycle.mjs`
  - Reports expired items to remove and unknown-expiry items that need review.
- Lifecycle write mode:
  - `node scripts/apply-platform-lifecycle.mjs --write`
  - Removes only items with safe expiry evidence: explicit `validUntil`/`endsAt`/`activeUntil`, or passed event date cleanup window.
  - Unknown promo expiry is flagged for review, not deleted blindly.
- Image cache dry run:
  - `node scripts/cache-platform-images.mjs`
  - Lists remote images from `data/platform-candidates.json` without writing files.
- Image cache write mode:
  - `node scripts/cache-platform-images.mjs --write`
  - Downloads approved remote images into `assets/platform-cache/` and rewrites candidate data to local image paths.
  - Review before building `data/platform.json`.
- Sponsor report from exported Sheets data:
  - `node scripts/generate-sponsor-report.mjs --business "Casa Palma" --clicks clicks.csv --searches searches.csv --claims claims.csv --out report.md`
  - Reads exported `Interaction Clicks`, `Search Queries`, and `Coupon Claims` data.
  - Does not write back to Sheets or change the website.

### Promo lifecycle metadata

- `validUntil`: the promo expires after this ISO date/time and should not remain active.
- `reviewAfter`: the promo can stay visible, but needs manual/source review after this ISO date/time.
- `alwaysOn: true`: only for manually verified evergreen promos from `manual`, `partner`, or `official` sources.
- `needs_review` is an internal status; it does not add a visible badge yet.
- Expired promos should be filtered from active visible promo data.

## Newsletter Send Utility

- Script: `node scripts/send-newsletter.mjs`
- Default mode is dry-run. It reads eligible recipients and prints each row, email, send count, and a redacted unsubscribe token preview without sending or writing to Sheets.
- Real sends require `--send` or `QOC_SEND_NEWSLETTER=1`, plus an explicit `--issue` or `QOC_NEWSLETTER_ISSUE`.
- Real sends also require the configured Gmail OAuth profile to be `hola@queondacancun.com`; the script refuses to send from any other account.
- Recipient filter: `channel=email`, `status=active`, valid email, `unsubscribe_token` present, `unsubscribed_at` blank, `bounce_status` not `hard`, and no prior successful `Send Log` row for the same issue/recipient.
- The script sends one Gmail API message per recipient from `Qué Onda Cancún <hola@queondacancun.com>`, never BCC.
- It sends the table-based `email.html` template by default, not the web edition. It injects the visible unsubscribe footer and `List-Unsubscribe` header before sending.
- It writes each attempt to `Send Log` with `sent_at`, `issue`, `recipient`, `status`, `message_id`, `error`, `provider`, `subject`, `unsubscribe_token`, `batch_id`, `operator`, and `notes`.
- It updates `Email Subscribers` with `last_send_at`, `last_send_issue`, `last_send_status`, `last_send_message_id`, `last_send_error`, and `send_count`.

Safe commands:

```bash
node scripts/send-newsletter.mjs --limit 5
node scripts/send-newsletter.mjs --send --test-recipient hola@queondacancun.com --limit 1 --issue 2026-06-22 --notes "controlled test"
```

First Monday send runbook:

```bash
# 1. Preflight: confirm sender, eligible count, issue key, and recipients.
node scripts/send-newsletter.mjs --issue 2026-06-22 --subject "Qué Onda Cancún: semana 22-28 junio"

# 2. Controlled test: one email only; writes Send Log as test_sent and does not update subscriber send_count.
node scripts/send-newsletter.mjs --send --test-recipient miguelflatow@gmail.com --issue 2026-06-22 --subject "Qué Onda Cancún: semana 22-28 junio" --notes "controlled Monday preflight"

# 3. Real send: run only after explicit approval.
node scripts/send-newsletter.mjs --send --issue 2026-06-22 --subject "Qué Onda Cancún: semana 22-28 junio" --operator codex --notes "first Monday send"
```
