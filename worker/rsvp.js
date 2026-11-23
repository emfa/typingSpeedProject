// Replies: validation and saving, with the full history in rsvp_log. Only guests on the list can reply.
import { MAX_SEATS } from './qubool.js';
import { now, cleanLine } from './util.js';

// Turns what a guest sent (JSON from the page, or form fields from curl) into a clean answer, or an error code.
export function parseAnswer(input) {
  const raw = input.coming;
  const coming = raw === true || raw === 'yes' || raw === 'y' || raw === 'qubool' ? 1
    : raw === false || raw === 'no' || raw === 'n' || raw === 'regrets' ? 0 : null;
  if (coming === null) return { error: 'coming_required' };
  const message = cleanLine(input.message ?? '', 140);
  if (message === null) return { error: 'message_too_long' };
  if (!coming) return { value: { coming: 0, seats: 0, veg: 0, nonveg: 0, message } };
  const seats = toInt(input.seats ?? 1), veg = toInt(input.veg);
  if (seats === null || seats < 1 || seats > MAX_SEATS) return { error: 'seats_out_of_range' };
  if (veg === null || veg < 0 || veg > seats) return { error: 'veg_out_of_range' };
  return { value: { coming: 1, seats, veg, nonveg: seats - veg, message } };
}
function toInt(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export const publicReply = (r) => r && {
  coming: r.coming ? 'yes' : 'no', seats: r.seats, veg: r.veg, nonveg: r.nonveg, message: r.message,
  name: r.name, from: r.sender, updatedAt: r.updated_at, changes: r.changes,
};

export async function repliesOpen(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'replies_open'").first();
  return row ? JSON.parse(row.value) !== false : true;
}

// Saves the current reply and appends it to the log, in one transaction.
export async function saveReply(env, { id, guestCode, name, sender, answer, via }) {
  const at = now(), a = answer;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO rsvps (id, guest_code, name, sender, coming, seats, veg, nonveg, message, via, created_at, updated_at, changes)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, 0)
       ON CONFLICT (id) DO UPDATE SET name = ?3, sender = ?4, coming = ?5, seats = ?6, veg = ?7, nonveg = ?8,
         message = ?9, via = ?10, updated_at = ?11, changes = changes + 1`
    ).bind(id, guestCode, name, sender, a.coming, a.seats, a.veg, a.nonveg, a.message, via, at),
    env.DB.prepare('INSERT INTO rsvp_log (rsvp_id, name, coming, seats, veg, nonveg, message, via, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, a.coming, a.seats, a.veg, a.nonveg, a.message, via, at),
  ]);
  return env.DB.prepare('SELECT * FROM rsvps WHERE id = ?').bind(id).first();
}

const VIA = new Set(['web', 'terminal', 'curl']);
const viaOf = (v) => (VIA.has(v) ? v : 'web');

// A reply for a guest on the list. Returns { reply } or { status, error }.
export async function replyForGuest(env, guest, input, via) {
  if (!(await repliesOpen(env))) return { status: 403, error: 'closed' };
  const parsed = parseAnswer(input);
  if (parsed.error) return { status: 400, error: parsed.error };
  // At most 5 saved replies a minute per guest link (Cloudflare's rate limiter, no database writes), so a forwarded link cannot exhaust the write quota.
  if (env.RSVP_LIMIT && !(await env.RSVP_LIMIT.limit({ key: guest.code })).success) return { status: 429, error: 'rate_limited' };
  const reply = await saveReply(env, { id: guest.code, guestCode: guest.code, name: guest.name, sender: guest.sender, answer: parsed.value, via: viaOf(via) });
  return { reply };
}
