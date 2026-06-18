const SHEET_NAME = 'Email Subscribers';
const REQUIRED_COLUMNS = ['status', 'unsubscribe_token', 'unsubscribed_at', 'unsubscribe_reason'];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function html(res, status, title, message) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(`<!doctype html>
<html lang="es-MX">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} | Qué Onda Cancún</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #fffdf5;
        --ink: #10212a;
        --muted: #526a73;
        --aqua: #0f8f98;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 28px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: var(--paper);
      }

      main {
        width: min(100%, 520px);
        text-align: center;
      }

      img {
        width: min(260px, 78vw);
        height: auto;
        margin: 0 auto 30px;
        display: block;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 8vw, 3.5rem);
        line-height: 0.95;
        letter-spacing: 0;
      }

      p {
        margin: 18px auto 0;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.55;
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        margin-top: 28px;
        padding: 0 18px;
        border: 1px solid rgba(15, 143, 152, 0.35);
        border-radius: 999px;
        color: var(--aqua);
        font-weight: 850;
        text-decoration: none;
      }

      a:hover {
        border-color: var(--aqua);
      }
    </style>
  </head>
  <body>
    <main>
      <img src="/assets/que-onda-cancun-logo.png" alt="Qué Onda Cancún">
      <h1>${message}</h1>
      <p>Newsletter local independiente de Cancún.</p>
      <a href="https://queondacancun.com/">Volver a Qué Onda Cancún</a>
    </main>
  </body>
</html>`);
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
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
  const data = await sheetsRequest(`/values/${encodeURIComponent(SHEET_NAME)}`);
  return Array.isArray(data.values) ? data.values : [];
}

function getColumnMap(headers) {
  const map = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const missing = REQUIRED_COLUMNS.filter((name) => !map.has(name));
  if (missing.length) {
    throw new Error(`missing_columns:${missing.join(',')}`);
  }
  return map;
}

async function markUnsubscribed(rowNumber, columns, now) {
  const updates = [
    ['status', 'unsubscribed'],
    ['unsubscribed_at', now],
    ['unsubscribe_reason', 'one-click'],
  ].map(([column, value]) => {
    const letter = columnName(columns.get(column));
    return {
      range: `${SHEET_NAME}!${letter}${rowNumber}`,
      values: [[value]],
    };
  });

  return sheetsRequest('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates,
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return html(res, 405, 'Método no permitido', 'Link inválido.');
  }

  const token = String(req.query?.token || '').trim();
  if (!token) {
    return html(res, 400, 'Link inválido', 'Link inválido.');
  }

  try {
    const rows = await readRows();
    const headers = rows[0] || [];
    const columns = getColumnMap(headers);
    const tokenColumn = columns.get('unsubscribe_token');
    const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[tokenColumn] || '').trim() === token);

    if (rowIndex < 1) {
      return html(res, 404, 'Link no válido', 'Este link no existe o ya no es válido.');
    }

    await markUnsubscribed(rowIndex + 1, columns, new Date().toISOString());
    return html(res, 200, 'Listo', 'Listo. Ya no recibirás correos de Qué Onda Cancún.');
  } catch (error) {
    console.error('[unsubscribe]', error);
    return html(res, 500, 'Error', 'No pudimos procesar este link.');
  }
}
