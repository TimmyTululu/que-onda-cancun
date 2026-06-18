#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { homedir } from 'node:os';

const SPREADSHEET_ID = '1mQQt712MOdGHZzRLLwGGEX7a5deOegOb0nOoc2rL9So';
const EMAIL_SHEET = 'Email Subscribers';
const SEND_LOG_SHEET = 'Send Log';
const DEFAULT_HTML_PATH = 'email.html';
const DEFAULT_SUBJECT = 'Qué Onda Cancún: esta semana';
const DEFAULT_ISSUE = 'esta-semana';
const DEFAULT_SENDER_NAME = 'Qué Onda Cancún';
const DEFAULT_SENDER_EMAIL = 'hola@queondacancun.com';
const REQUIRED_GMAIL_ACCOUNT = 'hola@queondacancun.com';
const SITE_ORIGIN = 'https://queondacancun.com';
const UNSUBSCRIBE_BASE = 'https://queondacancun.com/api/unsubscribe?token=';
const SEND_LOG_HEADERS = [
  'sent_at',
  'issue',
  'recipient',
  'status',
  'message_id',
  'error',
  'provider',
  'subject',
  'unsubscribe_token',
  'batch_id',
  'operator',
  'notes',
];
const REQUIRED_EMAIL_COLUMNS = [
  'channel',
  'email',
  'status',
  'unsubscribe_token',
  'unsubscribed_at',
  'last_send_at',
  'last_send_issue',
  'last_send_status',
  'last_send_message_id',
  'last_send_error',
  'send_count',
  'bounce_status',
];

function usage() {
  console.log(`Usage:
  node scripts/send-newsletter.mjs [options]

Default mode is dry-run. No email is sent and no sheet is written unless --send
or QOC_SEND_NEWSLETTER=1 is present.

Options:
  --send                    Actually send and write logs
  --limit <n>               Limit eligible recipients
  --test-recipient <email>  Send to this address using one eligible subscriber token
  --issue <key>             Issue key for logs (default: ${DEFAULT_ISSUE})
  --subject <text>          Email subject (default: ${DEFAULT_SUBJECT})
  --html <path>             HTML source (default: ${DEFAULT_HTML_PATH})
  --operator <name>         Operator label for Send Log
  --notes <text>            Notes for Send Log
  --batch-id <id>           Batch id (default: generated)
  --pause-min <seconds>     Minimum pause between real sends (default: 5)
  --pause-max <seconds>     Maximum pause between real sends (default: 10)
`);
}

function parseArgs(argv) {
  const options = {
    send: process.env.QOC_SEND_NEWSLETTER === '1',
    limit: null,
    testRecipient: '',
    issue: process.env.QOC_NEWSLETTER_ISSUE || DEFAULT_ISSUE,
    issueProvided: Boolean(process.env.QOC_NEWSLETTER_ISSUE),
    subject: process.env.QOC_NEWSLETTER_SUBJECT || DEFAULT_SUBJECT,
    htmlPath: process.env.QOC_NEWSLETTER_HTML || DEFAULT_HTML_PATH,
    operator: process.env.USER || 'timmy',
    notes: '',
    batchId: `qoc_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().slice(0, 8)}`,
    pauseMin: 5,
    pauseMax: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg === '--send') {
      options.send = true;
    } else if (arg === '--limit') {
      options.limit = Number.parseInt(argv[++index] || '', 10);
    } else if (arg === '--test-recipient') {
      options.testRecipient = String(argv[++index] || '').trim().toLowerCase();
    } else if (arg === '--issue') {
      options.issue = String(argv[++index] || '').trim();
      options.issueProvided = true;
    } else if (arg === '--subject') {
      options.subject = String(argv[++index] || '').trim();
    } else if (arg === '--html') {
      options.htmlPath = String(argv[++index] || '').trim();
    } else if (arg === '--operator') {
      options.operator = String(argv[++index] || '').trim();
    } else if (arg === '--notes') {
      options.notes = String(argv[++index] || '').trim();
    } else if (arg === '--batch-id') {
      options.batchId = String(argv[++index] || '').trim();
    } else if (arg === '--pause-min') {
      options.pauseMin = Number.parseFloat(argv[++index] || '');
    } else if (arg === '--pause-max') {
      options.pauseMax = Number.parseFloat(argv[++index] || '');
    } else {
      throw new Error(`unknown_arg:${arg}`);
    }
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('invalid_limit');
  }
  if (options.testRecipient && !isValidEmail(options.testRecipient)) {
    throw new Error('invalid_test_recipient');
  }
  if (options.testRecipient && options.limit === null) {
    options.limit = 1;
  }
  if (!Number.isFinite(options.pauseMin) || !Number.isFinite(options.pauseMax) || options.pauseMin < 0 || options.pauseMax < options.pauseMin) {
    throw new Error('invalid_pause_range');
  }
  if (!options.issue || !options.subject || !options.operator || !options.batchId) {
    throw new Error('missing_required_option');
  }
  if (options.send && !options.issueProvided) {
    throw new Error('missing_issue_for_send');
  }
  return options;
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rest] = trimmed.split('=');
    const key = rawKey.trim();
    if (process.env[key]) continue;
    let value = rest.join('=').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadGoogleOauthFallback() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) return;
  const tokenPath = resolve(homedir(), '.openclaw/credentials/google-oauth.json');
  if (!existsSync(tokenPath)) return;
  const token = JSON.parse(readFileSync(tokenPath, 'utf8'));
  process.env.GOOGLE_CLIENT_ID ||= token.client_id;
  process.env.GOOGLE_CLIENT_SECRET ||= token.client_secret;
  process.env.GOOGLE_REFRESH_TOKEN ||= token.refresh_token;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function getColumnMap(headers, requiredColumns = []) {
  const columns = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const missing = requiredColumns.filter((name) => !columns.has(name));
  if (missing.length) throw new Error(`missing_columns:${missing.join(',')}`);
  return columns;
}

function getCell(row, columns, name) {
  return String(row[columns.get(name)] || '').trim();
}

function toHtmlFooter(unsubscribeUrl) {
  return `
    <div style="margin:32px auto 0;max-width:640px;padding:20px 18px;border-top:1px solid #d9e6e0;text-align:center;color:#526a73;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:1.55;">
      Recibiste este correo porque te registraste en Qué Onda Cancún.
      Para dejar de recibirlo,
      <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0f8f98;font-weight:800;text-decoration:underline;">cancela tu suscripción aquí</a>.
    </div>`;
}

function toTextFooter(unsubscribeUrl) {
  return `\n\nRecibiste este correo porque te registraste en Qué Onda Cancún. Para dejar de recibirlo, cancela tu suscripción aquí:\n${unsubscribeUrl}\n`;
}

function injectFooter(html, unsubscribeToken) {
  const unsubscribeUrl = `${UNSUBSCRIBE_BASE}${encodeURIComponent(unsubscribeToken)}`;
  const footer = toHtmlFooter(unsubscribeUrl);
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}\n</body>`);
  }
  return `${html}\n${footer}`;
}

function prepareEmailHtml(html) {
  return String(html)
    .replace(/<nav\b[^>]*class="[^"]*\bsite-nav\b[^"]*"[^>]*>[\s\S]*?<\/nav>/i, '')
    .replace(/\s(src|href)="\/(?!\/)([^"#?]+)([^"]*)"/g, (_match, attr, path, suffix) => ` ${attr}="${SITE_ORIGIN}/${path}${suffix}"`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeHeader(value) {
  const text = String(value);
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function buildMime({ to, subject, html, text, batchId, unsubscribeUrl }) {
  const boundary = `qoc_${randomUUID().replace(/-/g, '')}`;
  const headers = [
    `From: ${encodeHeader(DEFAULT_SENDER_NAME)} <${DEFAULT_SENDER_EMAIL}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `X-QOC-Batch-ID: ${batchId}`,
    `List-Unsubscribe: <${unsubscribeUrl}>`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
    '',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${body.join('\r\n')}`;
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

async function googleRequest(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(path, {
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
    throw new Error(`google_error:${response.status}:${data.error?.message || 'unknown'}`);
  }
  return data;
}

async function sheetsRequest(path, options = {}) {
  return googleRequest(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`, options);
}

async function gmailRequest(path, options = {}) {
  return googleRequest(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, options);
}

async function getGmailProfile() {
  return gmailRequest('/profile');
}

async function readRows(sheet, range = 'A:Z') {
  const data = await sheetsRequest(`/values/${encodeURIComponent(`${sheet}!${range}`)}`);
  return Array.isArray(data.values) ? data.values : [];
}

function sentRecipientsForIssue(rows, issue) {
  const headers = rows[0] || [];
  const columns = getColumnMap(headers);
  const issueColumn = columns.get('issue');
  const recipientColumn = columns.get('recipient');
  const statusColumn = columns.get('status');
  if (issueColumn === undefined || recipientColumn === undefined || statusColumn === undefined) {
    return new Set();
  }

  return new Set(rows.slice(1)
    .filter((row) => (
      getCell(row, columns, 'issue') === issue
      && getCell(row, columns, 'status').toLowerCase() === 'sent'
      && isValidEmail(normalizeEmail(getCell(row, columns, 'recipient')))
    ))
    .map((row) => normalizeEmail(getCell(row, columns, 'recipient'))));
}

function eligibleRecipients(rows, options, alreadySent = new Set()) {
  const headers = rows[0] || [];
  const columns = getColumnMap(headers, REQUIRED_EMAIL_COLUMNS);
  let recipients = rows.slice(1).map((row, index) => ({
    row,
    rowNumber: index + 2,
    email: normalizeEmail(getCell(row, columns, 'email')),
    token: getCell(row, columns, 'unsubscribe_token'),
    status: getCell(row, columns, 'status').toLowerCase(),
    channel: getCell(row, columns, 'channel').toLowerCase(),
    unsubscribedAt: getCell(row, columns, 'unsubscribed_at'),
    bounceStatus: getCell(row, columns, 'bounce_status').toLowerCase(),
    sendCount: Number.parseInt(getCell(row, columns, 'send_count') || '0', 10) || 0,
  })).filter((recipient) => (
    recipient.channel === 'email'
    && recipient.status === 'active'
    && isValidEmail(recipient.email)
    && recipient.token
    && !recipient.unsubscribedAt
    && recipient.bounceStatus !== 'hard'
    && (options.testRecipient || !alreadySent.has(recipient.email))
  ));

  if (options.testRecipient) {
    const testRecipientSource = recipients.find((recipient) => recipient.email === options.testRecipient);
    if (testRecipientSource) {
      recipients = [testRecipientSource];
    }
  }

  return {
    headers,
    columns,
    recipients: options.limit ? recipients.slice(0, options.limit) : recipients,
    totalEligible: recipients.length,
  };
}

async function ensureSendLogHeaders() {
  const rows = await readRows(SEND_LOG_SHEET, 'A:L');
  if (rows.length && SEND_LOG_HEADERS.every((header, index) => normalizeHeader(rows[0][index]) === header)) {
    return;
  }
  await sheetsRequest(`/values/${encodeURIComponent(`${SEND_LOG_SHEET}!A1:L1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [SEND_LOG_HEADERS] }),
  });
}

async function appendSendLog(row) {
  await sheetsRequest(`/values/${encodeURIComponent(`${SEND_LOG_SHEET}!A:L`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [row] }),
  });
}

async function updateSubscriber(rowNumber, columns, values) {
  const data = Object.entries(values).map(([column, value]) => {
    const letter = columnName(columns.get(column));
    return {
      range: `${EMAIL_SHEET}!${letter}${rowNumber}`,
      values: [[value]],
    };
  });
  await sheetsRequest('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data,
    }),
  });
}

async function sendEmail({ to, subject, html, text, batchId, unsubscribeUrl }) {
  const raw = base64Url(buildMime({ to, subject, html, text, batchId, unsubscribeUrl }));
  return gmailRequest('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function pauseMs(options) {
  const span = options.pauseMax - options.pauseMin;
  return Math.round((options.pauseMin + Math.random() * span) * 1000);
}

function tokenPreview(token) {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

async function main() {
  loadDotEnv(resolve('.vercel/.env.production.local'));
  loadGoogleOauthFallback();
  const options = parseArgs(process.argv.slice(2));
  const htmlPath = resolve(options.htmlPath);
  const sourceHtml = prepareEmailHtml(readFileSync(htmlPath, 'utf8'));
  const rows = await readRows(EMAIL_SHEET, 'A:W');
  const sendLogRows = await readRows(SEND_LOG_SHEET, 'A:L');
  const alreadySent = sentRecipientsForIssue(sendLogRows, options.issue);
  const { columns, recipients, totalEligible } = eligibleRecipients(rows, options, alreadySent);
  const gmailProfile = await getGmailProfile();
  const gmailAccount = String(gmailProfile.emailAddress || '').toLowerCase();

  if (options.send && gmailAccount !== REQUIRED_GMAIL_ACCOUNT) {
    throw new Error(`wrong_gmail_account:${gmailAccount}:expected:${REQUIRED_GMAIL_ACCOUNT}`);
  }

  console.log(JSON.stringify({
    mode: options.send ? 'send' : 'dry-run',
    gmail_account: gmailProfile.emailAddress,
    source: basename(htmlPath),
    issue: options.issue,
    subject: options.subject,
    batch_id: options.batchId,
    total_eligible: totalEligible,
    already_sent_for_issue: alreadySent.size,
    selected: recipients.length,
    test_recipient: options.testRecipient || null,
    recipients: recipients.map((recipient) => ({
      row: recipient.rowNumber,
      email: options.testRecipient || recipient.email,
      source_email: options.testRecipient ? recipient.email : undefined,
      unsubscribe_token_preview: tokenPreview(recipient.token),
      unsubscribe_url_base: UNSUBSCRIBE_BASE,
      send_count: recipient.sendCount,
    })),
  }, null, 2));

  if (!options.send) return;
  if (!recipients.length) throw new Error('no_eligible_recipients');

  await ensureSendLogHeaders();

  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index];
    const targetEmail = options.testRecipient || recipient.email;
    const now = new Date().toISOString();
    let status = 'sent';
    let messageId = '';
    let errorMessage = '';

    try {
      const unsubscribeUrl = `${UNSUBSCRIBE_BASE}${recipient.token}`;
      const html = injectFooter(sourceHtml, recipient.token);
      const text = `${stripHtml(sourceHtml)}${toTextFooter(unsubscribeUrl)}`;
      const message = await sendEmail({
        to: targetEmail,
        subject: options.subject,
        html,
        text,
        batchId: options.batchId,
        unsubscribeUrl,
      });
      messageId = message.id || '';
    } catch (error) {
      status = 'error';
      errorMessage = error.message || String(error);
    }
    const logStatus = options.testRecipient && status === 'sent' ? 'test_sent' : status;

    await appendSendLog([
      now,
      options.issue,
      targetEmail,
      logStatus,
      messageId,
      errorMessage,
      'gmail',
      options.subject,
      recipient.token,
      options.batchId,
      options.operator,
      options.testRecipient ? `test-recipient; source=${recipient.email}; ${options.notes}`.trim() : options.notes,
    ]);

    if (!options.testRecipient) {
      await updateSubscriber(recipient.rowNumber, columns, {
        last_send_at: now,
        last_send_issue: options.issue,
        last_send_status: status,
        last_send_message_id: messageId,
        last_send_error: errorMessage,
        send_count: status === 'sent' ? String(recipient.sendCount + 1) : String(recipient.sendCount),
      });
    }

    console.log(JSON.stringify({
      row: recipient.rowNumber,
      recipient: targetEmail,
      status: logStatus,
      message_id: messageId || null,
      error: errorMessage || null,
    }));

    if (index < recipients.length - 1) {
      await sleep(pauseMs(options));
    }
  }
}

main().catch((error) => {
  console.error(`[send-newsletter] ${error.message || error}`);
  process.exit(1);
});
