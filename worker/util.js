// Small helpers shared by the Worker's modules.

const enc = new TextEncoder();

export const now = () => new Date().toISOString();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export const fail = (status, error, extra = {}) => json({ error, ...extra }, status);

// Lower-case letters and digits without look-alikes (no 0/o, 1/l/i).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]; // 256 % 31 bias is negligible here
  return out;
}

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function sha256(input) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}
export async function sha256hex(input) {
  return [...(await sha256(input))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}
// Constant-time comparison of two equal-length byte arrays.
export function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  if (crypto.subtle.timingSafeEqual) return crypto.subtle.timingSafeEqual(a, b);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// JSON that is safe to place inside a <script> element.
export function scriptJson(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export const clientIp = (request) => request.headers.get('cf-connecting-ip') || '0.0.0.0';

// Rate limit: true when the bucket has had `limit` hits within `windowMs`. Records a hit when `record`.
export async function throttled(env, bucket, limit, windowMs, record) {
  const since = Date.now() - windowMs;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM throttle WHERE bucket = ? AND at > ?').bind(bucket, since).first();
  const over = (row?.n ?? 0) >= limit;
  if (record && !over) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO throttle (bucket, at) VALUES (?, ?)').bind(bucket, Date.now()),
      env.DB.prepare('DELETE FROM throttle WHERE at < ?').bind(Date.now() - 86400000),
    ]);
  }
  return over;
}
// The IP, salted and hashed, so the throttle table never stores an address.
export async function ipBucket(env, request, kind) {
  return kind + ':' + (await sha256hex((env.SESSION_SECRET || 'qubool') + '|' + clientIp(request))).slice(0, 24);
}

export async function readJson(request, maxBytes = 16384) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return { error: 'expected_json' };
  const body = await request.text();
  if (body.length > maxBytes) return { error: 'too_large' };
  try { return { value: JSON.parse(body) }; } catch { return { error: 'bad_json' }; }
}

// Characters as people count them, so a 140-character limit allows 140 emoji-free letters in any script.
export const charCount = (s) => [...String(s)].length;
export const cleanLine = (s, max) => {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return charCount(t) > max ? null : t;
};
