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
- Subscriber capture range: `Sheet1!A:L`
- Production sheet range: `Sheet1!A:X`
- Vercel env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `QUE_ONDA_SUBSCRIBERS_SHEET_ID`
- Columns: `created_at`, `channel`, `email`, `whatsapp`, `contact_key`, `source`, `landing_url`, `referrer`, `user_agent`, `status`, `duplicate_count`, `last_seen_at`, `unsubscribe_token`, `unsubscribed_at`, `unsubscribe_reason`, `last_send_at`, `last_send_issue`, `last_send_status`, `last_send_message_id`, `last_send_error`, `send_count`, `bounce_status`, `bounced_at`, `last_clicked_at`
- Duplicate behavior: same normalized email or WhatsApp updates `duplicate_count` and `last_seen_at` on the existing row.
- Unsubscribe endpoint: `GET /api/unsubscribe?token=...`
  - Looks up `unsubscribe_token` in `Sheet1`
  - Updates `status=unsubscribed`, `unsubscribed_at`, and `unsubscribe_reason=one-click`
  - Returns a branded confirmation page without exposing contact data
