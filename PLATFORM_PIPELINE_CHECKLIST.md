# Qué Onda Cancún Platform Pipeline Checklist

## Mandatory flow (must run before publication)

1. Ingest raw data
   - Add source rows to `data/source-research.json`.
   - Every row must include: `id`, `kind`, `section`, `sourceUrl`, and source `raw` fields.

2. Generate candidates
   - Build/update `data/platform-candidates.json` from source rows.
   - Keep section shape:
     - `hoy.hero`
     - `hoy.signals` (exactly 3)
     - `hoy.worldCup` with active window
     - `hoy.today`
     - `week`, `promos`, `events`

3. Validate candidates
   - Run: `node scripts/validate-platform-content.mjs --source data/source-research.json --candidates data/platform-candidates.json`
   - Hard stops:
     - missing required fields
     - generic copy patterns
     - title > 58 chars
     - description > 120 chars
     - missing/invalid CTA
     - imageFit `contain`
     - fake/placeholder time formats
     - repeated/weak link quality
     - invalid URLs
     - malformed world cup schedule (`vs` required in team rows)

4. Audit data quality before publishing
   - Run: `node scripts/audit-platform-data.mjs`
   - Review:
     - remote image count
     - missing local images
     - promo/event expiry gaps
     - repeated locations
     - generic CTA labels
   - This is a quality audit, not a UI change.

5. Apply lifecycle cleanup before publishing
   - Dry run first: `node scripts/apply-platform-lifecycle.mjs`
   - Write only after review: `node scripts/apply-platform-lifecycle.mjs --write`
   - Delete automatically only when:
     - explicit `validUntil`, `endsAt`, or `activeUntil` passed, or
     - event date has passed its cleanup window.
   - Unknown promo expiry is not deleted blindly; it is flagged for review with `reviewAfter`/review status.

6. Cache approved remote images when needed
   - Dry run first: `node scripts/cache-platform-images.mjs`
   - Write only after review: `node scripts/cache-platform-images.mjs --write`
   - Re-run validation after caching.

7. Build publishable data
   - Run: `node scripts/build-platform-data.mjs`
   - Optional output file: `--approved-output` and `--out`.
   - Result writes to `data/platform.json`.

8. Platform checks and preview
   - Run `node scripts/check-platform.mjs`.
   - This also verifies SEO basics: canonical tags, Open Graph/Twitter metadata, JSON-LD structured data, `robots.txt`, and `sitemap.xml`.
   - Verify routes:
     - `/`
     - `/esta-semana/`
     - `/promos/`
     - `/eventos/`
     - `/newsletter/`
   - Validate no fallback regressions and no UI redesign drift.

## Non-negotiables for each published cycle

1. No UI redesign while only updating data.
2. No `contain` anywhere in card/hero image mode.
3. No WhatsApp intake channel on newsletter/site forms.
4. No repeated/duplicate labels or repeated topic coverage across cards.
5. No template copy; each card must include specific action and reason to open now.
6. Hero image/structure stays locked; no layout changes for editorial updates.
7. SEO files and structured data are non-visual production requirements; do not remove them during UI or data updates.
