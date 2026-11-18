// The Worker's API, exercised with fetch. Run through tests/run.mjs.
import { client, checker, LOGINS } from './server.mjs';

export async function run(base) {
  const t = checker('API');
  const host = client(base), anon = client(base);

  // Host sign-in and guards
  t.ok((await anon.get('/api/host/state')).status === 401, 'host state needs a session');
  let r = await host.post('/api/host/login', { passphrase: 'not the passphrase' });
  t.ok(r.status === 401 && r.data.error === 'wrong_passphrase', 'wrong passphrase refused', r);
  r = await host.post('/api/host/login', { passphrase: LOGINS.Kaif });
  t.ok(r.status === 200 && r.data.user === 'Kaif', 'Kaif signs in with his own passphrase', r.data);
  const setCookie = r.headers.get('set-cookie') || '';
  t.ok(/HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Strict/.test(setCookie), 'session cookie is HttpOnly, Secure, SameSite=Strict', setCookie);
  r = await host.post('/api/host/login', { passphrase: LOGINS.Tester });
  t.ok(r.data.user === 'Tester', 'the second host signs in as themselves');
  const forged = client(base); forged.cookie = host.cookie.replace(/\.[^.]+$/, '.AAAA');
  t.ok((await forged.get('/api/host/state')).status === 401, 'a tampered session cookie is refused');
  r = await fetch(base + '/api/host/guests', { method: 'POST', headers: { 'content-type': 'application/json', cookie: host.cookie, origin: 'https://evil.example' }, body: '{"entries":[{"name":"X","from":"k"}]}' });
  t.ok(r.status === 403, 'a host write from another site is refused', r.status);
  r = await fetch(base + '/api/host/guests', { method: 'POST', headers: { 'content-type': 'application/json', cookie: host.cookie }, body: '{"entries":[{"name":"X","from":"k"}]}' });
  t.ok(r.status === 403, 'a host write with no Origin is refused', r.status);

  // Adding guests
  r = await host.post('/api/host/guests', { entries: [{ name: 'Priya Nair', from: 'k' }, { name: 'priya nair', from: 'k' }, { name: 'Priya Nair', from: 'j' }, { name: '  ', from: 'k' }, { name: 'Imran', from: 'x' }, { name: 'Ayesha Khan', from: 'k', line: 12 }] });
  const added = r.data.added || [];
  t.ok(added.length === 3, 'three guests added', r.data);
  t.ok(r.data.skipped?.map((s) => s.reason).join() === 'duplicate,not_a_name,no_sender', 'duplicate, blank and senderless names skipped', r.data.skipped);
  t.ok(added.every((g) => /^[kj]-[a-z0-9-]+-[a-z0-9]{6}$/.test(g.code)), 'codes are sender, name and six random characters', added.map((g) => g.code));
  t.ok(added[2].line === 12, 'an imported line number is kept', added[2]);
  const [priya, priyaJ] = added;

  // The guest page and the preview tags
  r = await anon.get('/' + priya.code);
  t.ok(r.status === 200 && r.data.includes('<title>Priya, you’re invited · Kaif &amp; Jabeen</title>'), 'page title names the guest');
  t.ok(/og:image" content="[^"]+\/og\.jpg"/.test(r.data), 'until a preview is drawn, the generic image is used');
  t.ok(r.headers.get('referrer-policy') === 'no-referrer' && /frame-ancestors 'none'/.test(r.headers.get('content-security-policy') || ''), 'no-referrer and a CSP on the page');
  t.ok(r.headers.get('x-robots-tag') === 'noindex, nofollow', 'pages ask not to be indexed');
  t.ok(!r.data.includes('Ayesha'), 'the page holds no other guest');
  r = await fetch(base + '/' + priya.code, { method: 'HEAD' });
  t.ok(r.status === 200 && r.headers.get('content-type').startsWith('text/html'), 'HEAD gets the page headers too (some preview robots use it)', r.status);
  r = await anon.get('/' + priya.code.slice(0, -6) + 'zzzzzz');
  t.ok(r.status === 404, 'a code not on the list is a 404', r.status);

  // Replies from the page
  r = await anon.put('/api/rsvp/' + priya.code, { coming: 'yes', seats: 2, veg: 1, message: 'Mubarak' });
  t.ok(r.status === 200 && r.data.rsvp.nonveg === 1 && r.data.rsvp.changes === 0, 'a reply saves with the plate split', r.data);
  r = await anon.put('/api/rsvp/' + priya.code, { coming: 'no', message: 'Travelling, sorry' });
  t.ok(r.data.rsvp?.coming === 'no' && r.data.rsvp.seats === 0 && r.data.rsvp.changes === 1, 'changing the answer replaces it and counts the change', r.data);
  for (const [body, error, label] of [
    [{ coming: 'yes', seats: 0, veg: 0 }, 'seats_out_of_range', 'zero seats'],
    [{ coming: 'yes', seats: 5, veg: 0 }, 'seats_out_of_range', 'five seats'],
    [{ coming: 'yes', seats: 2, veg: 3 }, 'veg_out_of_range', 'more veg than seats'],
    [{ coming: 'yes', seats: 2 }, 'veg_out_of_range', 'no veg count'],
    [{ coming: 'maybe' }, 'coming_required', 'no yes or no'],
    [{ coming: 'no', message: 'x'.repeat(141) }, 'message_too_long', 'a 141-character message'],
  ]) { r = await anon.put('/api/rsvp/' + priya.code, body); t.ok(r.status === 400 && r.data.error === error, 'refused: ' + label, r.data); }
  r = await anon.put('/api/rsvp/k-nobody-abcdef', { coming: 'no' });
  t.ok(r.status === 404, 'a reply for a code not on the list is refused');

  // No open links: only a guest's own code opens an invite or takes a reply
  t.ok((await anon.post('/api/rsvp/open', { name: 'Rahul Mehta', from: 'j', coming: 'yes', seats: 4, veg: 4 })).status === 404, 'there is no open-link reply endpoint');
  t.ok((await anon.put('/api/rsvp/o-aaaaaaaaaaaaaaaa', { coming: 'no' })).status === 404, 'an open-link style id is refused');
  for (const path of ['/k', '/j', '/jabeen', '/invite.ics', '/' + priya.code + 'x']) {
    r = await anon.get(path);
    t.ok(r.status === 404 && r.data.includes('Invite not found') && !r.data.includes('Priya'), `${path} is “Invite not found”`, r.status);
  }
  r = await fetch(base + '/', { redirect: 'manual' });
  t.ok(r.status === 302 && r.headers.get('location').endsWith('/host'), 'the home page redirects to /host', r.headers.get('location'));

  // curl
  r = await fetch(base + '/' + priyaJ.code + '?plain', { headers: { 'user-agent': 'curl/8.5.0' } });
  let body = await r.text();
  t.ok(r.headers.get('content-type').startsWith('text/plain') && body.includes('Assalamu alaikum, Priya.') && body.includes('— Jabeen'), 'curl gets the invite as text, in the sender’s voice');
  t.ok(/[\/\\|+x-]{6,}/.test(body) && !body.includes('\x1b['), 'with an ASCII lattice, and no colour codes when ?plain');
  r = await fetch(base + '/' + priyaJ.code + '/rsvp', { method: 'POST', headers: { 'user-agent': 'curl/8.5.0', 'content-type': 'application/x-www-form-urlencoded' }, body: 'coming=yes&seats=2&veg=2&message=See+you' });
  body = await r.text();
  t.ok(r.status === 200 && /^\[main [0-9a-f]{7}\] rsvp: qubool hai, 2 seats \(2 veg, 0 non-veg\)/.test(body), 'curl can RSVP and gets a commit-style receipt', body);
  r = await fetch(base + '/' + priyaJ.code + '/rsvp', { method: 'POST', headers: { 'user-agent': 'curl/8.5.0', 'content-type': 'application/x-www-form-urlencoded' }, body: 'coming=yes&seats=9&veg=0' });
  t.ok(r.status === 400 && (await r.text()).includes('seats must be 1 to 4'), 'curl gets a readable error');

  // Calendar
  r = await anon.get('/' + priya.code + '/invite.ics');
  t.ok(r.headers.get('content-type').startsWith('text/calendar') && r.data.includes('DTSTART;VALUE=DATE:20261226') && r.data.includes('\r\n'), 'the calendar file is an all-day event until a time is set');
  t.ok(r.data.includes('Your invite: ') && r.data.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'it links back to the invite, with lines folded at 75 bytes');

  // Settings
  r = await host.put('/api/host/settings', { event: { date: '2026-12-26', nikah: '10:00', reception: '12:30', lunch: '13:00', venue: 'Sample Hall', maps: 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7' } });
  t.ok(r.status === 200, 'the day can be saved', r.data);
  r = await anon.get('/' + priya.code + '/invite.ics');
  t.ok(r.data.includes('DTSTART:20261226T070000Z') && r.data.includes('DTEND:20261226T100000Z'), 'with a reception time, the calendar event is 12:30 to 3:30 PM IST', r.data.split('\r\n').filter((l) => l.startsWith('DT')));
  t.ok((await host.put('/api/host/settings', { event: { date: '2026-12-26', reception: '25:00' } })).data.error === 'bad_time', 'a bad time is refused');
  t.ok((await host.put('/api/host/settings', { event: { date: '2026-12-26', maps: 'javascript:alert(1)' } })).data.error === 'bad_map_link', 'a map link must be https');
  await host.put('/api/host/settings', { repliesOpen: false });
  r = await anon.put('/api/rsvp/' + priya.code, { coming: 'no' });
  t.ok(r.status === 403 && r.data.error === 'closed', 'with replies closed, a reply is refused');
  await host.put('/api/host/settings', { repliesOpen: true, event: { date: '2026-12-26', maps: 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7' } });

  // Notes, sent, previews, removal
  r = await host.patch('/api/host/guests/' + priya.code, { note: 'You reviewed my worst pull requests without judgment.', sent: true });
  t.ok(r.status === 200, 'a note and the sent tick save');
  t.ok((await anon.get('/' + priya.code)).data.includes('worst pull requests'), 'the note reaches that guest’s page');
  t.ok(!(await anon.get('/' + priyaJ.code)).data.includes('worst pull requests'), 'and no other guest’s');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  r = await host.put('/api/host/guests/' + priya.code + '/preview', jpeg, { 'content-type': 'image/jpeg' });
  t.ok(r.status === 200, 'a preview image uploads');
  r = await anon.get('/og/' + priya.code + '.jpg');
  t.ok(r.status === 200 && r.data[0] === 0xff && r.data.length === jpeg.length, 'and is served back');
  t.ok((await anon.get('/' + priya.code)).data.includes('/og/' + priya.code + '.jpg?v='), 'the page now points its preview at it');
  t.ok((await host.put('/api/host/guests/' + priya.code + '/preview', new Uint8Array([1, 2, 3]), { 'content-type': 'image/jpeg' })).status === 400, 'something that is not a JPEG is refused');

  r = await host.get('/api/host/state');
  const p = r.data.guests.find((g) => g.code === priya.code);
  t.ok(p && p.sentAt && p.opens >= 1 && p.rsvp?.coming === 'no' && p.previewAt, 'host state shows sent, opened, reply and preview', p);
  t.ok(!('open' in r.data), 'host state has no open-link replies');
  r = await host.get('/api/host/export.csv');
  t.ok(r.headers.get('content-type').startsWith('text/csv') && r.data.includes('Priya Nair,Kaif,no,') && r.data.includes('Priya Nair,Jabeen,yes,2,2,0'), 'the CSV has every guest’s reply', r.data.slice(0, 300));
  await host.post('/api/host/guests', { entries: [{ name: '=HYPERLINK("x")', from: 'j' }] });
  t.ok((await host.get('/api/host/export.csv')).data.includes(`"'=HYPERLINK(""x"")"`), 'a name that looks like a formula is defused in the CSV');
  t.ok((await host.del('/api/host/guests/' + priya.code)).status === 200, 'a guest can be removed');
  t.ok((await anon.get('/api/rsvp/' + priya.code)).status === 404 && (await host.get('/api/host/state')).data.guests.every((g) => g.code !== priya.code), 'and their reply goes with them');

  // Signing out, then the lockout (last, since it locks this address)
  await host.post('/api/host/logout');
  t.ok((await host.get('/api/host/state')).status === 401, 'signing out ends the session');
  for (let i = 0; i < 10; i++) await anon.post('/api/host/login', { passphrase: 'guess ' + i });
  r = await anon.post('/api/host/login', { passphrase: LOGINS.Tester });
  t.ok(r.status === 429 && r.data.error === 'locked', 'after 10 wrong tries, even the right passphrase waits', r.data);
  return t.done();
}
