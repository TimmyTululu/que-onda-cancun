const SHEET_RANGE = 'Sheet1!A:L';
const HEADER_OFFSET = 1;

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+52${digits}`;
  return digits.startsWith('52') ? `+${digits}` : digits;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
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

async function sheetsRequest(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${requiredEnv('QUE_ONDA_SUBSCRIBERS_SHEET_ID')}${path}`, {
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

async function readRows() {
  const data = await sheetsRequest(`/values/${encodeURIComponent(SHEET_RANGE)}`);
  return Array.isArray(data.values) ? data.values : [];
}

async function appendRow(row) {
  return sheetsRequest(`/values/${encodeURIComponent('Sheet1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}

async function updateDuplicate(rowNumber, duplicateCount, seenAt) {
  return sheetsRequest(`/values/${encodeURIComponent(`Sheet1!J${rowNumber}:L${rowNumber}`)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [['active', String(duplicateCount), seenAt]] }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const channel = String(body.channel || 'email').trim().toLowerCase() === 'whatsapp' ? 'whatsapp' : 'email';
    const email = normalizeEmail(body.email);
    const whatsapp = normalizePhone(body.whatsapp);
    const contactKey = channel === 'whatsapp' ? whatsapp : email;

    if (channel === 'email' && !isValidEmail(email)) {
      return json(res, 400, { ok: false, error: 'invalid_email' });
    }
    if (channel === 'whatsapp' && !isValidPhone(whatsapp)) {
      return json(res, 400, { ok: false, error: 'invalid_whatsapp' });
    }

    const now = new Date().toISOString();
    const rows = await readRows();
    const existingIndex = rows.findIndex((row, index) => index >= HEADER_OFFSET && String(row[4] || '').trim().toLowerCase() === contactKey.toLowerCase());

    if (existingIndex >= HEADER_OFFSET) {
      const rowNumber = existingIndex + 1;
      const currentCount = Number.parseInt(rows[existingIndex][10] || '0', 10) || 0;
      await updateDuplicate(rowNumber, currentCount + 1, now);
      return json(res, 200, { ok: true, duplicate: true, message: 'already_subscribed' });
    }

    await appendRow([
      now,
      channel,
      email,
      whatsapp,
      contactKey,
      String(body.source || 'queondacancun.com').slice(0, 120),
      String(body.landingUrl || '').slice(0, 500),
      String(body.referrer || '').slice(0, 500),
      String(req.headers['user-agent'] || '').slice(0, 500),
      'active',
      '0',
      now,
    ]);

    return json(res, 200, { ok: true, duplicate: false, message: 'subscribed' });
  } catch (error) {
    console.error('[subscribe]', error);
    return json(res, 500, { ok: false, error: 'subscribe_failed' });
  }
}
