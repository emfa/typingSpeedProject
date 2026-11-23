// Kaif & Jabeen reception: one Worker for the guest pages, the host console and the API.
// Files in static/ are served before this runs; everything else arrives here.
import { json, text, fail, readJson, clientIp } from './util.js';
import {
  CODE, getGuest, getEvent, guestPage, notFoundPage, countOpen, isTerminal, terminalInvite, terminalReceipt, curlError, calendarFile,
} from './guest.js';
import { replyForGuest, publicReply, repliesOpen } from './rsvp.js';
import { hostRoute } from './host.js';
import scriptHashes from '../dist/script-hashes.json';

const CSP = [
  "default-src 'self'",
  "script-src 'self' " + scriptHashes.join(' '),   // only the pages' own inline scripts, by hash
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
  h.set('strict-transport-security', 'max-age=31536000');   // browsers use HTTPS only for the next year
  if ((h.get('content-type') || '').startsWith('text/html')) h.set('content-security-policy', CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function route(request, env, ctx) {
  // HEAD is answered as GET (the runtime drops the body); some link-preview robots only send HEAD.
  const url = new URL(request.url), path = url.pathname, method = request.method === 'HEAD' ? 'GET' : request.method;

  // Plain HTTP goes to HTTPS, so a passphrase never travels unencrypted. Local development (a loopback client;
  // Cloudflare sets this header to the visitor's real address, and visitors cannot override it) stays on http.
  if (url.protocol === 'http:' && !/^(127\.|::1$)/.test(clientIp(request))) {
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
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

  // The home page is the hosts' console. Guests only ever arrive on their own link.
  if (path === '/' && method === 'GET') return Response.redirect(url.origin + '/host', 302);

  /* ---------- guest API: only a guest on the list can reply, with their own code ---------- */
  let m = /^\/api\/rsvp\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const guest = CODE.test(m[1]) && method === 'PUT' ? await getGuest(env, m[1]) : null;
    if (!guest) return fail(404, 'not_found');
    const body = await readJson(request);
    if (body.error) return fail(400, body.error);
    const r = await replyForGuest(env, guest, body.value, body.value.via);
    return r.error ? fail(r.status, r.error) : json({ rsvp: publicReply(r.reply) });
  }

  /* ---------- preview images ---------- */
  m = /^\/og\/([a-z0-9-]+)\.jpg$/.exec(path);
  if (m && method === 'GET') {
    const row = CODE.test(m[1]) && await env.DB.prepare('SELECT image FROM previews WHERE code = ?').bind(m[1]).first();
    if (!row) return Response.redirect(url.origin + '/og.jpg', 302);
    return new Response(new Uint8Array(row.image), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' } });
  }

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

  // Anything else, including a mistyped or altered code: no invite here.
  if (method !== 'GET') return fail(404, 'not_found');
  if (isTerminal(request.headers.get('user-agent'))) return text('Invite not found. Please check the link you were sent.\n', 404);
  return notFoundPage(url);
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
