import { readFileSync } from 'node:fs';
import path from 'node:path';

const CLAIMS_SHEET = 'Coupon Claims';
const CLAIM_HEADERS = [
  'claimed_at',
  'campaign_id',
  'business',
  'email',
  'contact_key',
  'code',
  'source',
  'landing_url',
  'referrer',
  'user_agent',
  'status',
  'notes',
];

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function columnName(index) {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function findCampaignById(data, campaignId) {
  const heroCampaign = data?.hoy?.hero?.campaign;
  if (heroCampaign?.id === campaignId) return heroCampaign;
  return null;
}

function isCampaignActive(campaign, now = new Date()) {
  if (!campaign || campaign.status !== 'active') return false;
  const startTs = Date.parse(campaign.activeFrom || '') || null;
  const untilTs = Date.parse(campaign.activeUntil || '') || null;
  const nowTs = now.getTime();
  if (Number.isFinite(startTs) && nowTs < startTs) return false;
  if (Number.isFinite(untilTs) && nowTs > untilTs) return false;
  return true;
}

function loadPlatformData() {
  const file = path.join(process.cwd(), 'data/platform.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
    refresh_token: requiredEnv('GOOGLE_REFRESH_TOKEN'),
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`google_token_error:${response.status}`);
  }
  return data.access_token;
}

async function sheetsRequest(pathname, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${requiredEnv('QUE_ONDA_SUBSCRIBERS_SHEET_ID')}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`sheets_error:${response.status}:${data.error?.message || 'unknown'}`);
  }
  return data;
}

async function ensureClaimsSheet() {
  const metadata = await sheetsRequest('?fields=sheets.properties');
  const sheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
  const exists = sheets.some((sheet) => sheet.properties?.title === CLAIMS_SHEET);

  if (!exists) {
    await sheetsRequest(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: CLAIMS_SHEET,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: CLAIM_HEADERS.length,
                },
              },
            },
          },
        ],
      }),
    });
  }

  const headerEnd = columnName(CLAIM_HEADERS.length - 1);
  const headerRange = `${CLAIMS_SHEET}!A1:${headerEnd}1`;
  const headerData = await sheetsRequest(`/values/${encodeURIComponent(headerRange)}`);
  const existingHeaders = headerData.values?.[0] || [];
  const hasHeaders = CLAIM_HEADERS.every((header, index) => existingHeaders[index] === header);

  if (!hasHeaders) {
    await sheetsRequest(`/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [CLAIM_HEADERS] }),
    });
  }
}

async function appendClaim(row) {
  const end = columnName(CLAIM_HEADERS.length - 1);

  return sheetsRequest(`/values/${encodeURIComponent(`${CLAIMS_SHEET}!A:${end}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const email = normalizeEmail(body.email);
    const campaignId = String(body.campaignId || '').trim();

    if (!isValidEmail(email)) {
      return json(res, 400, { ok: false, error: 'invalid_email' });
    }
    if (!campaignId) {
      return json(res, 400, { ok: false, error: 'missing_campaign' });
    }

    const platform = loadPlatformData();
    const campaign = findCampaignById(platform, campaignId);
    if (!campaign || !isCampaignActive(campaign)) {
      return json(res, 404, { ok: false, error: 'campaign_inactive' });
    }

    await ensureClaimsSheet();

    const now = new Date().toISOString();
    const row = [
      now,
      campaign.id,
      campaign.business,
      email,
      `${campaign.id}:${email}`,
      campaign.code,
      String(body.source || `coupon:${campaign.id}`).slice(0, 120),
      String(body.landingUrl || '').slice(0, 500),
      String(body.referrer || '').slice(0, 500),
      String(req.headers['user-agent'] || '').slice(0, 500),
      'claimed',
      '',
    ];

    await appendClaim(row);

    return json(res, 200, {
      ok: true,
      message: 'coupon_claimed',
      campaignId: campaign.id,
      business: campaign.business,
      code: campaign.code,
      terms: campaign.terms,
    });
  } catch (error) {
    console.error('[claim-coupon]', error);
    return json(res, 500, { ok: false, error: 'claim_failed' });
  }
}
