# Que Onda Cancun

Standalone landing page for `queondacancun.com`.

## Domain

- Canonical: `https://queondacancun.com`
- Redirect: `https://www.queondacancun.com` -> `https://queondacancun.com`

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
- Vercel env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `QUE_ONDA_SUBSCRIBERS_SHEET_ID`
- Email columns: `created_at`, `channel`, `email`, `contact_key`, `source`, `landing_url`, `referrer`, `user_agent`, `status`, `duplicate_count`, `last_seen_at`, `unsubscribe_token`, `unsubscribed_at`, `unsubscribe_reason`, `last_send_at`, `last_send_issue`, `last_send_status`, `last_send_message_id`, `last_send_error`, `send_count`, `bounce_status`, `bounced_at`, `last_clicked_at`
- WhatsApp columns: `created_at`, `channel`, `whatsapp`, `contact_key`, `source`, `landing_url`, `referrer`, `user_agent`, `status`, `duplicate_count`, `last_seen_at`, `opt_out_at`, `opt_out_reason`, `last_sent_at`, `notes`
- Duplicate behavior: same normalized email or WhatsApp updates `status=active`, `duplicate_count`, and `last_seen_at` on the existing row in the channel-specific tab.
- Unsubscribe endpoint: `GET /api/unsubscribe?token=...`
  - Looks up `unsubscribe_token` in `Email Subscribers`
  - Updates `status=unsubscribed`, `unsubscribed_at`, and `unsubscribe_reason=one-click`
  - Returns a branded confirmation page without exposing contact data
- Migration: existing `Sheet1` rows were backfilled into channel-specific tabs. `Sheet1` remains untouched as legacy backup.

## Newsletter Send Utility

- Script: `node scripts/send-newsletter.mjs`
- Default mode is dry-run. It reads eligible recipients and prints each row, email, send count, and a redacted unsubscribe token preview without sending or writing to Sheets.
- Real sends require `--send` or `QOC_SEND_NEWSLETTER=1`.
- Real sends also require the configured Gmail OAuth profile to be `hola@queondacancun.com`; the script refuses to send from any other account.
- Recipient filter: `channel=email`, `status=active`, valid email, `unsubscribe_token` present, `unsubscribed_at` blank, and `bounce_status` not `hard`.
- The script sends one Gmail API message per recipient from `Qué Onda Cancún <hola@queondacancun.com>`, never BCC.
- It injects the visible unsubscribe footer into the current HTML source before sending.
- It writes each attempt to `Send Log` with `sent_at`, `issue`, `recipient`, `status`, `message_id`, `error`, `provider`, `subject`, `unsubscribe_token`, `batch_id`, `operator`, and `notes`.
- It updates `Email Subscribers` with `last_send_at`, `last_send_issue`, `last_send_status`, `last_send_message_id`, `last_send_error`, and `send_count`.

Safe commands:

```bash
node scripts/send-newsletter.mjs --limit 5
node scripts/send-newsletter.mjs --send --test-recipient hola@queondacancun.com --limit 1 --notes "controlled test"
```
