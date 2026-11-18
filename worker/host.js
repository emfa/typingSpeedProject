// The host console's sign-in and API. Only the people in the HOST_LOGINS secret get in.
import hostHtml from '../dist/host.html';
import { Q, SENDERS } from './qubool.js';
import { json, html, fail, now, randomId, b64url, b64urlDecode, sha256, sha256hex, hmac, sameBytes, readJson, cleanLine, throttled, ipBucket } from './util.js';
import { CODE, DEFAULT_EVENT, getEvent } from './guest.js';
import { publicReply } from './rsvp.js';

const COOKIE = '__Host-qubool';
// A session ends after this long without the host doing anything (clicks, typing, saves).
// The console's automatic refresh does not count, so an open tab left alone signs out too.
const IDLE_SECONDS = 300;
const idleSeconds = (env) => { const n = Number(env.HOST_IDLE_SECONDS); return Number.isFinite(n) && n >= 1 ? n : IDLE_SECONDS; };
const MIN_PASSPHRASE = 12;

/* ---------- who may sign in ---------- */

// HOST_LOGINS is a JSON object of display name to passphrase: {"Your name": "…", "Kaif": "…"}.
function logins(env) {
  let list = {};
  try { list = JSON.parse(env.HOST_LOGINS || '{}'); } catch { console.error('HOST_LOGINS is not valid JSON'); }
  return Object.entries(list).filter(([name, pass]) => {
    const ok = typeof pass === 'string' && pass.length >= MIN_PASSPHRASE && name.trim();
    if (!ok) console.error(`HOST_LOGINS entry "${name}" ignored: passphrases need ${MIN_PASSPHRASE} or more characters`);
    return ok;
  });
}
const configured = (env) => (env.SESSION_SECRET || '').length >= 32 && logins(env).length > 0;

// A session is "<payload>.<signature>". The signature covers the user's current passphrase,
// so changing someone's passphrase signs them out everywhere. "v2" retired the old 30-day sessions.
async function sign(env, user, pass, exp) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ v: 2, u: user, exp })));
  const sig = b64url(await hmac(env.SESSION_SECRET, 'v2|' + payload + '|' + (await sha256hex(pass))));
  return payload + '.' + sig;
}
export async function hostUser(env, request) {
  if (!configured(env)) return null;
  const cookie = (request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!cookie) return null;
  const [payload, sig] = cookie.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))); } catch { return null; }
  if (!data || data.v !== 2 || typeof data.u !== 'string' || !(data.exp > Date.now())) return null;
  const entry = logins(env).find(([name]) => name === data.u);
  if (!entry) return null;
  const expected = await sign(env, entry[0], entry[1], data.exp);
  const enc = new TextEncoder();
  return sameBytes(enc.encode(expected), enc.encode(payload + '.' + sig)) ? entry : null;
}
// No Max-Age: the cookie also ends when the browser closes. The expiry inside it ends it sooner.
const cookieHeader = (value, clear) => `${COOKIE}=${value}; Path=/;${clear ? ' Max-Age=0;' : ''} HttpOnly; Secure; SameSite=Strict`;
const freshCookie = async (env, [name, pass]) => cookieHeader(await sign(env, name, pass, Date.now() + idleSeconds(env) * 1000));

async function login(env, request) {
  if (!configured(env)) return fail(503, 'not_configured');
  const bucket = await ipBucket(env, request, 'login');
  if (await throttled(env, bucket, 10, 15 * 60000, false)) return fail(429, 'locked');
  const body = await readJson(request);
  if (body.error) return fail(400, body.error);
  const given = await sha256(String(body.value.passphrase || ''));
  let match = null;
  for (const [name, pass] of logins(env)) if (sameBytes(given, await sha256(pass)) && !match) match = [name, pass];
  if (!match) {
    await throttled(env, bucket, 10, 15 * 60000, true);
    return fail(401, 'wrong_passphrase');
  }
  return json({ user: match[0], idleSeconds: idleSeconds(env) }, 200, { 'set-cookie': await freshCookie(env, match) });
}

/* ---------- the console's data ---------- */

const guestRow = (g, reply) => ({
  code: g.code, name: g.name, from: g.sender, note: g.note, line: g.line, position: g.position,
  sentAt: g.sent_at, firstOpenedAt: g.first_opened_at, lastOpenedAt: g.last_opened_at, opens: g.opens,
  createdBy: g.created_by, previewAt: g.preview_at || null, rsvp: publicReply(reply),
});

async function state(env, user, url) {
  const [guests, replies, event, open] = await Promise.all([
    env.DB.prepare('SELECT g.*, p.updated_at AS preview_at FROM guests g LEFT JOIN previews p ON p.code = g.code ORDER BY g.position').all(),
    env.DB.prepare('SELECT * FROM rsvps WHERE guest_code IS NOT NULL').all(),
    getEvent(env),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'replies_open'").first(),
  ]);
  const byId = new Map(replies.results.map((r) => [r.id, r]));
  return {
    user, idleSeconds: idleSeconds(env), origin: url.origin, event, repliesOpen: open ? JSON.parse(open.value) !== false : true,
    guests: guests.results.map((g) => guestRow(g, byId.get(g.code))),
  };
}

const slugOf = (name) => Q.nameSlug(name.normalize('NFKD').replace(/[̀-ͯ]/g, '')).slice(0, 24).replace(/-+$/, '') || 'guest';

// entries: [{ name, from, line? }]. Names already on that sender's list are skipped, not doubled.
async function addGuests(env, user, entries) {
  if (!Array.isArray(entries) || !entries.length) return fail(400, 'no_names');
  if (entries.length > 300) return fail(400, 'too_many');
  const existing = (await env.DB.prepare('SELECT name, sender, line, position FROM guests').all()).results;
  const taken = new Set(existing.map((g) => g.sender + '|' + g.name.toLowerCase()));
  const lines = { k: [], j: [] };
  existing.forEach((g) => lines[g.sender].push(g.line));
  let position = existing.reduce((m, g) => Math.max(m, g.position), 0);
  const added = [], skipped = [], writes = [], at = now();
  for (const e of entries) {
    const name = cleanLine(e?.name, 60), from = e?.from;
    if (!name || !/[\p{L}\p{N}]/u.test(name)) { skipped.push({ name: String(e?.name ?? ''), reason: 'not_a_name' }); continue; }
    if (from !== 'k' && from !== 'j') { skipped.push({ name, reason: 'no_sender' }); continue; }
    if (taken.has(from + '|' + name.toLowerCase())) { skipped.push({ name, reason: 'duplicate' }); continue; }
    const pool = Q.lines[from];
    const line = Number.isInteger(e.line) && e.line >= 0 && e.line < pool.length ? e.line : Q.nextLine(from, lines[from]);
    const code = `${from}-${slugOf(name)}-${randomId(6)}`;
    taken.add(from + '|' + name.toLowerCase()); lines[from].push(line);
    writes.push(env.DB.prepare('INSERT INTO guests (code, name, sender, line, position, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(code, name, from, line, ++position, at, user));
    added.push({ code, name, from, line });
  }
  if (writes.length) await env.DB.batch(writes);
  return json({ added, skipped });
}

async function patchGuest(env, code, body) {
  const g = await env.DB.prepare('SELECT code FROM guests WHERE code = ?').bind(code).first();
  if (!g) return fail(404, 'not_found');
  const writes = [];
  if ('sent' in body) writes.push(env.DB.prepare('UPDATE guests SET sent_at = ? WHERE code = ?').bind(body.sent ? now() : null, code));
  if ('note' in body) {
    const note = cleanLine(body.note ?? '', 280);
    if (note === null) return fail(400, 'note_too_long');
    writes.push(env.DB.prepare('UPDATE guests SET note = ? WHERE code = ?').bind(note, code));
  }
  if (!writes.length) return fail(400, 'nothing_to_change');
  await env.DB.batch(writes);
  return json({ ok: true });
}

async function removeGuest(env, code) {
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM guests WHERE code = ?').bind(code),
    env.DB.prepare('DELETE FROM rsvps WHERE id = ?').bind(code),
    env.DB.prepare('DELETE FROM previews WHERE code = ?').bind(code),
  ]);
  return res[0].meta.changes ? json({ ok: true }) : fail(404, 'not_found');
}

async function putPreview(env, code, request) {
  if (!(await env.DB.prepare('SELECT code FROM guests WHERE code = ?').bind(code).first())) return fail(404, 'not_found');
  if (!(request.headers.get('content-type') || '').startsWith('image/jpeg')) return fail(415, 'expected_jpeg');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > 400 * 1024) return fail(413, 'too_large');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail(400, 'not_a_jpeg');
  await env.DB.prepare('INSERT INTO previews (code, image, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (code) DO UPDATE SET image = ?2, updated_at = ?3')
    .bind(code, bytes, now()).run();
  return json({ ok: true });
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
async function putSettings(env, body) {
  const writes = [];
  if (body.event) {
    const e = body.event, out = { ...DEFAULT_EVENT };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '') || isNaN(Date.parse(e.date))) return fail(400, 'bad_date');
    out.date = e.date;
    for (const k of ['nikah', 'reception', 'lunch']) {
      if (e[k] === null || e[k] === '' || e[k] === undefined) out[k] = null;
      else if (TIME.test(e[k])) out[k] = e[k];
      else return fail(400, 'bad_time', { field: k });
    }
    const venue = cleanLine(e.venue ?? '', 120);
    if (venue === null) return fail(400, 'venue_too_long');
    out.venue = venue || null;
    const maps = String(e.maps ?? '').trim();
    if (maps && (!/^https:\/\/[^\s"<>]+$/.test(maps) || maps.length > 400)) return fail(400, 'bad_map_link');
    out.maps = maps || null;
    writes.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES ('event', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1").bind(JSON.stringify(out)));
  }
  if ('repliesOpen' in body) writes.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES ('replies_open', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1").bind(JSON.stringify(!!body.repliesOpen)));
  if (!writes.length) return fail(400, 'nothing_to_change');
  await env.DB.batch(writes);
  return json({ ok: true });
}

// One row per guest. Cells starting with = + - @ are quoted
// with a leading apostrophe so a spreadsheet never runs them as formulas.
async function exportCsv(env, url) {
  const s = await state(env, null, url);
  const cell = (v) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const head = ['name', 'invited_by', 'answer', 'seats', 'veg', 'nonveg', 'message', 'replied_at', 'link', 'sent_at', 'opened', 'note'];
  const rows = s.guests.map((g) => [g.name, SENDERS[g.from], g.rsvp ? g.rsvp.coming : 'no reply', g.rsvp?.seats ?? '', g.rsvp?.veg ?? '', g.rsvp?.nonveg ?? '',
    g.rsvp?.message ?? '', g.rsvp?.updatedAt ?? '', `${url.origin}/${g.code}`, g.sentAt ?? '', g.opens, g.note]);
  const body = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="reception-replies-${now().slice(0, 10)}.csv"`, 'cache-control': 'no-store' } });
}

/* ---------- routing ---------- */

export async function hostRoute(env, request, url) {
  const path = url.pathname, method = request.method;
  if (path === '/host' || path === '/host/') return method === 'GET' ? html(hostHtml.replace('<!--HEAD-->', '<title>Guests · Kaif &amp; Jabeen</title>').replace('/*DATA*/null', 'null')) : fail(405, 'method');
  if (path === '/api/host/login' && method === 'POST') return login(env, request);
  if (path === '/api/host/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', true) });

  const entry = await hostUser(env, request);
  if (!entry) return fail(401, configured(env) ? 'signed_out' : 'not_configured');
  const res = await hostApi(env, request, url, entry[0]);
  // Something the host did (not the automatic refresh): the five minutes start again.
  if (request.headers.get('x-qubool-activity') !== '1' || res.status === 401) return res;
  const out = new Response(res.body, res);
  out.headers.append('set-cookie', await freshCookie(env, entry));
  return out;
}

async function hostApi(env, request, url, user) {
  const path = url.pathname, method = request.method;
  if (path === '/api/host/ping' && method === 'POST') return json({ ok: true });
  if (path === '/api/host/state' && method === 'GET') return json(await state(env, user, url));
  if (path === '/api/host/export.csv' && method === 'GET') return exportCsv(env, url);
  if (path === '/api/host/guests' && method === 'POST') {
    const body = await readJson(request, 64 * 1024);
    return body.error ? fail(400, body.error) : addGuests(env, user, body.value.entries);
  }
  if (path === '/api/host/settings' && method === 'PUT') {
    const body = await readJson(request);
    return body.error ? fail(400, body.error) : putSettings(env, body.value);
  }
  const m = /^\/api\/host\/guests\/([a-z0-9-]+)(\/preview)?$/.exec(path);
  if (m && CODE.test(m[1])) {
    if (m[2] && method === 'PUT') return putPreview(env, m[1], request);
    if (!m[2] && method === 'PATCH') {
      const body = await readJson(request);
      return body.error ? fail(400, body.error) : patchGuest(env, m[1], body.value);
    }
    if (!m[2] && method === 'DELETE') return removeGuest(env, m[1]);
  }
  return fail(404, 'not_found');
}
