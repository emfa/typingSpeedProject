// Kaif & Jabeen reception: one Worker for the guest pages, the host console and the API.
// Files in static/ are served before this runs; everything else arrives here.
import { json, text, fail, readJson } from './util.js';
import {
  CODE, getGuest, getEvent, guestPage, openPage, countOpen, isTerminal, terminalInvite, terminalReceipt, curlError, calendarFile,
} from './guest.js';
import { OPEN_ID, replyForGuest, createOpenReply, updateOpenReply, publicReply, repliesOpen } from './rsvp.js';
import { hostRoute } from './host.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function secure(res) {
  const h = new Headers(res.headers);
  h.set('referrer-policy', 'no-referrer');   // guest codes never leak to Maps or Calendar
  h.set('x-robots-tag', 'noindex, nofollow');
  h.set('x-content-type-options', 'nosniff');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if ((h.get('content-type') || '').startsWith('text/html')) h.set('content-security-policy', CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const PRESETS = { '/k': 'k', '/kaif': 'k', '/j': 'j', '/jabeen': 'j' };

async function route(request, env, ctx) {
  // HEAD is answered as GET (the runtime drops the body); some link-preview robots only send HEAD.
  const url = new URL(request.url), path = url.pathname, method = request.method === 'HEAD' ? 'GET' : request.method;

  // www and any other host name go to the one canonical address, so links look the same everywhere.
  if (env.CANONICAL_HOST && url.hostname === 'www.' + env.CANONICAL_HOST) {
    url.hostname = env.CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }
  // Browsers always send Origin on writes; a different one means another site is trying to post here.
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'cross_origin');
    if (path.startsWith('/api/host/') && !origin) return fail(403, 'cross_origin');
  }

  if (path === '/host' || path === '/host/' || path.startsWith('/api/host/')) return hostRoute(env, request, url);

  /* ---------- guest API ---------- */
  if (path === '/api/rsvp/open' && method === 'POST') {
    const body = await readJson(request);
    if (body.error) return fail(400, body.error);
    const r = await createOpenReply(env, request, body.value);
    return r.error ? fail(r.status, r.error) : json({ id: r.id, rsvp: publicReply(r.reply) });
  }
  let m = /^\/api\/rsvp\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const id = m[1];
    if (OPEN_ID.test(id)) {
      if (method === 'GET') {
        const row = await env.DB.prepare('SELECT * FROM rsvps WHERE id = ? AND guest_code IS NULL').bind(id).first();
        return row ? json({ rsvp: publicReply(row), repliesOpen: await repliesOpen(env) }) : fail(404, 'not_found');
      }
      if (method === 'PUT') {
        const body = await readJson(request);
        if (body.error) return fail(400, body.error);
        const r = await updateOpenReply(env, id, body.value);
        return r.error ? fail(r.status, r.error) : json({ rsvp: publicReply(r.reply) });
      }
    } else if (CODE.test(id) && method === 'PUT') {
      const guest = await getGuest(env, id);
      if (!guest) return fail(404, 'not_found');
      const body = await readJson(request);
      if (body.error) return fail(400, body.error);
      const r = await replyForGuest(env, guest, body.value, body.value.via);
      return r.error ? fail(r.status, r.error) : json({ rsvp: publicReply(r.reply) });
    }
    return fail(404, 'not_found');
  }

  /* ---------- preview images ---------- */
  m = /^\/og\/([a-z0-9-]+)\.jpg$/.exec(path);
  if (m && method === 'GET') {
    const row = CODE.test(m[1]) && await env.DB.prepare('SELECT image FROM previews WHERE code = ?').bind(m[1]).first();
    if (!row) return Response.redirect(url.origin + '/og.jpg', 302);
    return new Response(new Uint8Array(row.image), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' } });
  }

  /* ---------- calendar ---------- */
  if (path === '/invite.ics' && method === 'GET') return ics(await getEvent(env), null);

  /* ---------- open links ---------- */
  if (method === 'GET' && (path === '/' || PRESETS[path])) return openPage(env, url, PRESETS[path] || null);

  /* ---------- a guest's own link ---------- */
  m = /^\/([a-z0-9-]+)(\/rsvp|\/invite\.ics)?\/?$/.exec(path);
  const guest = m && CODE.test(m[1]) ? await getGuest(env, m[1]) : null;
  if (guest) {
    if (m[2] === '/invite.ics' && method === 'GET') return ics(await getEvent(env), `${url.origin}/${guest.code}`);
    if (m[2] === '/rsvp' && method === 'POST') return curlRsvp(env, request, url, guest);
    if (!m[2] && method === 'GET') {
      countOpen(env, ctx, request, guest.code);
      const ua = request.headers.get('user-agent');
      if (isTerminal(ua)) {
        const [event, reply, open] = await Promise.all([getEvent(env), env.DB.prepare('SELECT * FROM rsvps WHERE id = ?').bind(guest.code).first(), repliesOpen(env)]);
        return text(terminalInvite({ url, guest, event, reply, open, color: !url.searchParams.has('plain') }));
      }
      return guestPage(env, url, guest);
    }
    return fail(405, 'method');
  }

  if (method !== 'GET') return fail(404, 'not_found');
  if (isTerminal(request.headers.get('user-agent'))) return text('No invite at this address. Check the link you were sent.\n', 404);
  return openPage(env, url, null, { status: 404, notFound: true });
}

function ics(event, link) {
  return new Response(calendarFile(event, link), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="kaif-jabeen-reception.ics"', 'cache-control': 'no-store' },
  });
}

// curl -d coming=yes -d seats=2 -d veg=1 https://…/<code>/rsvp
async function curlRsvp(env, request, url, guest) {
  const type = request.headers.get('content-type') || '';
  let input = {};
  if (type.includes('application/x-www-form-urlencoded')) input = Object.fromEntries(new URLSearchParams(await request.text()));
  else if (type.includes('application/json')) { const b = await readJson(request); if (b.error) return curlError(b.error); input = b.value; }
  else return curlError('send form fields, e.g. curl -d coming=yes -d seats=1 -d veg=0');
  if (input.coming === 'yes' && input.seats === undefined) input.seats = '1';
  if (input.coming === 'yes' && input.veg === undefined) return curlError('veg_out_of_range');
  const r = await replyForGuest(env, guest, input, 'curl');
  if (r.error) return curlError(r.error);
  return text(terminalReceipt({ reply: r.reply, guest, url, event: await getEvent(env) }));
}

export default {
  async fetch(request, env, ctx) {
    try {
      return secure(await route(request, env, ctx));
    } catch (err) {
      console.error(err && err.stack || err);
      return secure(fail(500, 'server_error'));
    }
  },
};
