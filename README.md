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
- Tab/range: `Sheet1!A:L`
- Vercel env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REFRESH_TOKEN`
  - `QUE_ONDA_SUBSCRIBERS_SHEET_ID`
- Columns: `created_at`, `channel`, `email`, `whatsapp`, `contact_key`, `source`, `landing_url`, `referrer`, `user_agent`, `status`, `duplicate_count`, `last_seen_at`
- Duplicate behavior: same normalized email or WhatsApp updates `duplicate_count` and `last_seen_at` on the existing row.
- Unsubscribe: not implemented yet.
