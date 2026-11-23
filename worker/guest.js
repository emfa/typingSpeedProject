// What a guest gets: the invite page (with their data and link preview baked in), a plain-text
// invite for curl, and a calendar file.
import inviteHtml from '../dist/invite.html';
import missingHtml from '../dist/missing.html';
import { Q, SENDERS, MAX_SEATS } from './qubool.js';
import { html, text, escapeHtml, scriptJson, now } from './util.js';
import { publicReply, repliesOpen } from './rsvp.js';

export const CODE = /^[kj]-[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{6}$/;
export const DEFAULT_EVENT = { date: '2026-12-26', nikah: null, reception: null, lunch: null, venue: null, maps: 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7' };

const PREVIEW_BOTS = /whatsapp|facebookexternalhit|facebot|slackbot|slack-imgproxy|telegrambot|twitterbot|linkedinbot|discordbot|skypeuripreview|teams|googlebot|bingbot|applebot|redditbot|pinterest|embedly|iframely|vkshare|preview/i;
export const isPreviewBot = (ua) => PREVIEW_BOTS.test(ua || '');
export const isTerminal = (ua) => /^(curl|wget|httpie|xh|aria2|libfetch)\b/i.test(ua || '');

export async function getEvent(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'event'").first();
  return { ...DEFAULT_EVENT, ...(row ? JSON.parse(row.value) : {}) };
}
export const getGuest = (env, code) => env.DB.prepare('SELECT * FROM guests WHERE code = ?').bind(code).first();

/* ---------- dates, as the page shows them ---------- */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (d) => { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd }; };
export function prettyDate(date, long) {
  if (!date) return '';
  const p = parts(date), wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return long ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][wd] + ' ' + p.d + ' ' + LONG_MONTHS[p.m - 1] + ' ' + p.y
    : DAYS[wd] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
}
export function prettyTime(t) {
  const [h, m] = t.split(':').map(Number);
  return ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
}

/* ---------- the page ---------- */
function head({ title, description, image, url }) {
  const t = escapeHtml(title), d = escapeHtml(description);
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Kaif &amp; Jabeen">',
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    '<meta property="og:image:type" content="image/jpeg">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="An arch-topped invitation card with a geometric lattice, for Kaif and Jabeen&#39;s reception">',
    '<meta name="twitter:card" content="summary_large_image">',
  ].join('\n');
}
const fill = (data, headTags) => inviteHtml
  .replace('<!--HEAD-->', () => headTags)
  .replace('/*DATA*/null', () => scriptJson(data));

function describe(event) {
  const when = prettyDate(event.date, true);
  return 'A reception and lunch for Kaif & Jabeen’s wedding' + (when ? ', ' + when : '') + '. This invitation was made for you alone.';
}

export async function guestPage(env, url, guest, { status = 200 } = {}) {
  const [event, open, replyRow, preview] = await Promise.all([
    getEvent(env), repliesOpen(env),
    env.DB.prepare('SELECT * FROM rsvps WHERE id = ?').bind(guest.code).first(),
    env.DB.prepare('SELECT updated_at FROM previews WHERE code = ?').bind(guest.code).first(),
  ]);
  const data = {
    mode: 'guest', code: guest.code, name: guest.name, from: guest.sender, note: guest.note, line: guest.line,
    rsvp: publicReply(replyRow), event, repliesOpen: open, maxSeats: MAX_SEATS, host: url.host,
  };
  const image = preview ? `${url.origin}/og/${guest.code}.jpg?v=${encodeURIComponent(preview.updated_at)}` : `${url.origin}/og.jpg`;
  return html(fill(data, head({ title: `${Q.first(guest.name)}, you’re invited · Kaif & Jabeen`, description: describe(event), image, url: `${url.origin}/${guest.code}` })), status);
}

// Any address that is not a guest's own link. Nothing about any guest is on this page.
export function notFoundPage(url) {
  const tags = head({ title: 'Invite not found · Kaif & Jabeen', description: 'This link does not match an invitation. Please check the link you were sent.', image: `${url.origin}/og.jpg`, url: url.origin + url.pathname });
  return html(missingHtml.replace('<!--HEAD-->', () => tags).replace('/*DATA*/null', () => scriptJson({ host: url.host })), 404);
}

// Counts a visit, unless it is a link-preview robot.
export function countOpen(env, ctx, request, code) {
  if (isPreviewBot(request.headers.get('user-agent'))) return;
  const at = now();
  // At most one counted visit a minute per guest: repeated loads write nothing.
  const recent = new Date(Date.now() - 60000).toISOString();
  ctx.waitUntil(env.DB.prepare('UPDATE guests SET opens = opens + 1, last_opened_at = ?1, first_opened_at = COALESCE(first_opened_at, ?1) WHERE code = ?2 AND (last_opened_at IS NULL OR last_opened_at < ?3)').bind(at, code, recent).run());
}

/* ---------- curl: the invite as terminal text ---------- */
const ESC = '\x1b[';
const paint = (on) => (code, s) => (on ? `${ESC}${code}m${s}${ESC}0m` : s);

// Draws the guest's lattice into a character grid: each segment of the Hankin construction
// becomes slashes, bars and dashes by its angle; crossings become + or x.
export function asciiLattice(name, cols = 48, rows = 12) {
  const cw = 8, ch = 16, grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  const d = Q.jaaliPath(name, cols * cw, rows * ch, 170); // a large repeat, so each tile spans many characters
  const pts = [...d.matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ cmd: m[1], x: +m[2], y: +m[3] }));
  const put = (c, r, glyph) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const old = grid[r][c];
    if (old === ' ' || old === glyph) grid[r][c] = glyph;
    else grid[r][c] = (old === '/' || old === '\\') && (glyph === '/' || glyph === '\\') ? 'x' : '+';
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.cmd !== 'L') continue;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (!len) continue;
    const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 180) % 180;
    const glyph = ang < 22.5 || ang >= 157.5 ? '-' : ang < 67.5 ? '\\' : ang < 112.5 ? '|' : '/';
    const steps = Math.ceil(len / 2);
    for (let s = 0; s <= steps; s++) put(Math.floor((a.x + (dx * s) / steps) / cw), Math.floor((a.y + (dy * s) / steps) / ch), glyph);
  }
  return grid.map((r) => r.join(''));
}

export function terminalInvite({ url, guest, event, reply, color, open }) {
  const c = paint(color), gilt = (s) => c('38;5;222', s), brass = (s) => c('38;5;179', s), dim = (s) => c('38;5;245', s), green = (s) => c('38;5;114', s), bold = (s) => c('1', s);
  const first = Q.first(guest.name), sender = SENDERS[guest.sender];
  const when = prettyDate(event.date) + (event.reception ? ' · ' + prettyTime(event.reception) : '');
  const where = event.venue ? event.venue + (event.maps ? ' (map: ' + event.maps + ')' : '') : event.maps ? 'See it on the map: ' + event.maps : 'To be announced';
  const rsvpUrl = `${url.origin}/${guest.code}/rsvp`;
  const lines = [
    '',
    dim(`  $ ssh ${first.toLowerCase().replace(/[^a-z0-9]/g, '') || 'guest'}@${url.host}`),
    dim(`  verifying invite ${Q.sha(guest.name)} … `) + green('ok'),
    '',
    ...asciiLattice(guest.name).map((r) => '  ' + gilt(r)),
    '',
    brass('  Bismillah ir-Rahman ir-Rahim'),
    '',
    bold('  KAIF & JABEEN'),
    '',
    `  Hey ${first},`,
    '  Before we officially close out 2026, I’m spinning up one last P1 bridge',
    '  call—I’m getting married! Don’t worry, there’s no outage to fix, no logs',
    '  to dig through, and zero RCAs to write. Just mute your notifications, come',
    '  hungry, and help us end the year on a high note.',
    ...(guest.note ? ['', `  “${guest.note}”`] : []),
    '',
    `  ${dim('WHEN ')}  ${when || 'To be announced'}`,
    `  ${dim('WHERE')}  ${where}`,
    '',
    brass(`  — ${sender}`),
    dim(`  P.S. ${Q.lineFor(guest.name, guest.sender, guest.line)}`),
    '',
    `  ${dim('YOUR REPLY')}  ${reply ? (reply.coming ? `coming, ${reply.seats} ${reply.seats === 1 ? 'seat' : 'seats'} (${reply.veg} veg, ${reply.nonveg} non-veg)` : 'can’t make it') : 'not yet'}`,
    '',
    ...(open ? [
      dim('  Reply from right here:'),
      `    curl -d coming=yes -d seats=2 -d veg=1 ${rsvpUrl}`,
      `    curl -d coming=no ${rsvpUrl}`,
      dim('  seats is 1 to ' + MAX_SEATS + ', veg is how many of those are vegetarian. Add -d message="..." for a line to ' + sender + '.'),
    ] : [dim('  Replies are closed.')]),
    dim(`  Or open ${url.origin}/${guest.code} in a browser.`),
    '',
  ];
  return lines.join('\n');
}

export function terminalReceipt({ reply, guest, url, event }) {
  const short = Q.sha(reply.updated_at + guest.code);
  return [
    `[main ${short}] rsvp: ${reply.coming ? `qubool hai, ${reply.seats} ${reply.seats === 1 ? 'seat' : 'seats'} (${reply.veg} veg, ${reply.nonveg} non-veg)` : 'regrets'}`,
    reply.coming ? (event.date ? `See you on the ${ordinal(parts(event.date).d)}, insha’Allah.` : 'See you there, insha’Allah.') : 'You will be missed. Thank you for telling me.',
    `Change it any time: run the command again, or open ${url.origin}/${guest.code}`,
    '',
  ].join('\n');
}
export const curlError = (error) => text(`rsvp: ${{
  coming_required: 'say coming=yes or coming=no',
  seats_out_of_range: `seats must be 1 to ${MAX_SEATS}`,
  veg_out_of_range: 'veg must be between 0 and seats',
  message_too_long: 'message is longer than 140 characters',
  closed: 'replies are closed. Message the person who invited you.',
  rate_limited: 'too many replies in a minute. Wait a moment, then send it again.',
}[error] || error}\n`, error === 'closed' ? 403 : error === 'rate_limited' ? 429 : 400);

function ordinal(n) { const t = n % 100; return n + (t > 10 && t < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }

/* ---------- calendar file ---------- */
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Lines longer than 75 octets are folded, as the format requires.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = []; let cur = '', size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function calendarFile(event, link) {
  const p = parts(event.date);
  let start, end;
  if (event.reception) {
    // India has no daylight saving: IST is UTC+5:30 all year. A three-hour block covers reception and lunch.
    const [h, m] = event.reception.split(':').map(Number);
    const t = Date.UTC(p.y, p.m - 1, p.d, h, m) - 330 * 60000;
    start = `DTSTART:${stamp(t)}`; end = `DTEND:${stamp(t + 3 * 3600000)}`;
  } else {
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    start = `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`;
    end = `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`;
  }
  const description = ['Reception and lunch. The nikah in the morning is family only.', event.maps ? 'Map: ' + event.maps : '', link ? 'Your invite: ' + link : ''].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Qubool//Kaif and Jabeen reception//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:reception-${event.date}@kaifwedsjabeen.in`,
    `DTSTAMP:${stamp(Date.now())}`,
    start, end,
    `SUMMARY:${icsText('Kaif & Jabeen: wedding reception')}`,
    `LOCATION:${icsText(event.venue || event.maps || '')}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(link ? [`URL:${link}`] : []),
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(fold).join('\r\n');
}
