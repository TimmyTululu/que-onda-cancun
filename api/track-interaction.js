const CLICK_SHEET = 'Interaction Clicks';
const SEARCH_SHEET = 'Search Queries';

const CLICK_HEADERS = [
  'clicked_at',
  'session_id',
  'page',
  'action',
  'item_id',
  'business',
  'label',
  'target_url',
  'section',
  'campaign_id',
  'source',
  'landing_url',
  'referrer',
  'user_agent',
];

const SEARCH_HEADERS = [
  'searched_at',
  'session_id',
  'page',
  'query',
  'results_count',
  'source',
  'landing_url',
  'referrer',
  'user_agent',
];

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function clean(value, limit = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
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

async function ensureSheet(sheetName, headers) {
  const metadata = await sheetsRequest('?fields=sheets.properties');
  const sheets = Array.isArray(metadata.sheets) ? metadata.sheets : [];
  const exists = sheets.some((sheet) => sheet.properties?.title === sheetName);

  if (!exists) {
    await sheetsRequest(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetName,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: headers.length,
                },
              },
            },
          },
        ],
      }),
    });
  }

  const headerEnd = columnName(headers.length - 1);
  const headerRange = `${sheetName}!A1:${headerEnd}1`;
  const headerData = await sheetsRequest(`/values/${encodeURIComponent(headerRange)}`);
  const existingHeaders = headerData.values?.[0] || [];
  const hasHeaders = headers.every((header, index) => existingHeaders[index] === header);

  if (!hasHeaders) {
    await sheetsRequest(`/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [headers] }),
    });
  }
}

async function appendRow(sheetName, headers, row) {
  const end = columnName(headers.length - 1);
  return sheetsRequest(`/values/${encodeURIComponent(`${sheetName}!A:${end}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}

function clickRow(body, req) {
  return [
    new Date().toISOString(),
    clean(body.sessionId, 80),
    clean(body.page, 80),
    clean(body.action, 80),
    clean(body.itemId, 120),
    clean(body.business, 120),
    clean(body.label, 160),
    clean(body.targetUrl, 500),
    clean(body.section, 100),
    clean(body.campaignId, 120),
    clean(body.source, 120),
    clean(body.landingUrl, 500),
    clean(body.referrer, 500),
    clean(req.headers['user-agent'], 500),
  ];
}

function searchRow(body, req) {
  return [
    new Date().toISOString(),
    clean(body.sessionId, 80),
    clean(body.page, 80),
    clean(body.query, 180),
    Number.isFinite(Number(body.resultsCount)) ? String(Number(body.resultsCount)) : '',
    clean(body.source, 120),
    clean(body.landingUrl, 500),
    clean(body.referrer, 500),
    clean(req.headers['user-agent'], 500),
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const type = clean(body.type, 40);

    if (type === 'search') {
      if (clean(body.query, 180).length < 3) {
        return json(res, 400, { ok: false, error: 'query_too_short' });
      }
      await ensureSheet(SEARCH_SHEET, SEARCH_HEADERS);
      await appendRow(SEARCH_SHEET, SEARCH_HEADERS, searchRow(body, req));
      return json(res, 200, { ok: true, message: 'search_logged' });
    }

    if (type === 'click') {
      if (!clean(body.action, 80)) {
        return json(res, 400, { ok: false, error: 'missing_action' });
      }
      await ensureSheet(CLICK_SHEET, CLICK_HEADERS);
      await appendRow(CLICK_SHEET, CLICK_HEADERS, clickRow(body, req));
      return json(res, 200, { ok: true, message: 'click_logged' });
    }

    return json(res, 400, { ok: false, error: 'invalid_type' });
  } catch (error) {
    console.error('[track-interaction]', error);
    return json(res, 500, { ok: false, error: 'track_failed' });
  }
}
