// The guest's page in Chromium, against the local Worker. Run through tests/run.mjs.
import { createRequire } from 'node:module';
import { client, checker, LOGINS, OUT } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

export async function run(base) {
  const t = checker('Guest page');
  const host = client(base);
  await host.post('/api/host/login', { passphrase: LOGINS.Tester });
  const add = (await host.post('/api/host/guests', { entries: [{ name: 'Arjun', from: 'k', line: 9 }, { name: 'Sneha', from: 'k' }, { name: 'Zainab Ali', from: 'j' }] })).data.added;
  const [arjun, sneha, zainab] = add;
  await host.patch('/api/host/guests/' + arjun.code, { note: 'You reviewed my worst pull requests without judgment.' });

  const b = await chromium.launch();
  const errors = [];
  const open = async (path, opts = {}) => {
    const ctx = await b.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1100, height: 900 }, colorScheme: opts.light ? 'light' : 'dark', reducedMotion: opts.motion ? 'no-preference' : 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(path + ': ' + e.message));
    p.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(path + ': ' + m.text()));
    const res = await p.goto(base + path);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForSelector('#shell:not([hidden])', { timeout: 20000 });
    return { p, ctx, status: res.status() };
  };
  const term = async (p, ...cmds) => { for (const c of cmds) { await p.fill('#cmd', c); await p.press('#cmd', 'Enter'); await p.waitForTimeout(150); } };
  const lastLines = async (p, n) => (await p.locator('#out').innerText()).trim().split('\n').slice(-n).join('\n');
  const noSideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

  try {
    /* 1. A personal link, phone, light, with motion */
    const typing = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    const tp = await typing.newPage();
    await tp.goto(base + '/' + arjun.code);
    const topWhileTyping = await tp.evaluate(() => document.getElementById('card').getBoundingClientRect().top + scrollY);
    await tp.waitForSelector('#shell:not([hidden])', { timeout: 20000 });
    const topAfter = await tp.evaluate(() => document.getElementById('card').getBoundingClientRect().top + scrollY);
    t.ok(Math.abs(topAfter - topWhileTyping) < 1, 'the card stays put while the terminal types and when its command line appears', [topWhileTyping, topAfter]);
    await typing.close();
    let { p, ctx } = await open('/' + arjun.code, { phone: true, light: true, motion: true });
    const lineText = await p.evaluate((n) => Qubool.lineFor('Arjun', 'k', n), 9);
    t.ok((await p.locator('#greet').innerText()) === 'Hey Arjun,', 'the card greets the guest by name');
    t.ok((await p.locator('#sign').innerText()) === '— Kaif' && (await p.locator('#invite-text').innerText()).startsWith('Before we officially close out 2026'), 'signed by Kaif, in the first person');
    t.ok((await p.locator('#ps').innerText()) === 'P.S. ' + lineText, 'their assigned P.S. line (9) is shown', await p.locator('#ps').innerText());
    t.ok((await p.locator('#note').innerText()).includes('worst pull requests'), 'their personal note is on the card');
    t.ok((await p.locator('#hash').textContent()) === (await p.evaluate(() => Qubool.sha('Arjun'))), 'the invite hash comes from their name');
    t.ok((await p.locator('#out').innerText()).includes('ssh arjun@kaifwedsjabeen.in'), 'the terminal logs in at the real host name');
    t.ok(!(await p.locator('#who').count()) && !(await p.locator('[name=from]').count()), 'the invite asks neither name nor sender: the link says who they are');
    t.ok(await noSideScroll(p), 'no sideways scroll at 390px');
    await p.screenshot({ path: OUT + '/invite-personal-phone-light.png', fullPage: true });

    /* 2. Terminal commands, and an RSVP that commits */
    await term(p, 'whoami', 'cat schedule.txt', 'date', 'git log', 'sudo make lunch', 'nope');
    const out = await p.locator('#out').innerText();
    t.ok(out.includes('Arjun · invite') && out.includes('nikah       family only') && /days to go|Tomorrow|Today/.test(out), 'whoami, cat and date answer');
    t.ok(out.includes('reported to Jabeen') && out.includes('command not found: nope'), 'sudo and unknown commands answer');
    const said = (await p.locator('#said').textContent()).trim();
    t.ok(said === 'command not found: nope. Try help.', 'screen readers hear the last command’s answer, not the boot script', said);
    await term(p, 'rsvp --qubool --seats 1');
    t.ok((await lastLines(p, 1)).includes('which lunch?'), 'one seat with no meal: the terminal asks instead of guessing', await lastLines(p, 1));
    await term(p, 'rsvp --qubool --seats 3');
    t.ok((await lastLines(p, 1)).includes('how many of the 3 are vegetarian'), 'three seats with no veg count: it asks', await lastLines(p, 1));
    await term(p, 'rsvp --qubool --seats 3 --veg 1');
    await p.waitForFunction(() => /\[main [0-9a-f]{7}\] rsvp: qubool hai, 3 seats \(1 veg, 2 non-veg\)/.test(document.getElementById('out').innerText), null, { timeout: 8000 }).catch(() => {});
    t.ok(/\[main [0-9a-f]{7}\] rsvp: qubool hai, 3 seats \(1 veg, 2 non-veg\)/.test(await p.locator('#out').innerText()), 'a complete rsvp commits and prints a receipt', await lastLines(p, 3));
    t.ok(/^rsvp: sending… \[main [0-9a-f]{7}\] rsvp: qubool hai/.test(await p.locator('#said').textContent()), 'screen readers hear the receipt that arrives after saving', await p.locator('#said').textContent());
    t.ok(await p.locator('#done').isVisible() && (await p.locator('#thanks').innerText()) === 'See you on the 26th, insha’Allah.', 'the page shows the thank-you');
    await term(p, 'rsvp --status');
    t.ok((await lastLines(p, 2)).includes('saved: qubool hai, 3 seats'), 'rsvp --status reads it back');
    await ctx.close();
    let state = (await host.get('/api/host/state')).data.guests.find((g) => g.code === arjun.code);
    t.ok(state.rsvp?.seats === 3 && state.rsvp.veg === 1, 'the host sees the reply', state.rsvp);

    /* 3. The saved reply follows the guest to another device */
    ({ p, ctx } = await open('/' + arjun.code));
    t.ok(await p.locator('#done').isVisible() && (await p.locator('#receipt').innerText()).includes('--seats 3 --veg 1 --nonveg 2'), 'a fresh browser shows the saved reply');
    await p.click('#edit');
    t.ok(await p.locator('#form').isVisible() && await p.locator('#coming-yes').isChecked() && (await p.locator('#seats').innerText()) === '3', 'Change my answer opens the form filled in');
    await p.locator('label:has(#coming-no)').click();
    t.ok((await p.locator('#send').innerText()) === 'Save my new answer', 'the button says it will save a new answer');
    await p.click('#send'); await p.waitForSelector('#done:not([hidden])');
    t.ok((await p.locator('#thanks').innerText()).startsWith('You will be missed'), 'regrets are thanked');
    state = (await host.get('/api/host/state')).data.guests.find((g) => g.code === arjun.code);
    t.ok(state.rsvp?.coming === 'no' && state.rsvp.changes === 1, 'the change replaced the reply', state.rsvp);
    await p.screenshot({ path: OUT + '/invite-personal-desktop-dark.png', fullPage: true });
    await ctx.close();

    /* 4. The form, for plates */
    ({ p, ctx } = await open('/' + sneha.code, { phone: true }));
    t.ok(await p.locator('#send').isDisabled(), 'Send is disabled until the answer is complete');
    await p.locator('label:has(#coming-yes)').click();
    t.ok(await p.locator('#send').isDisabled() && await p.locator('#one').isVisible(), 'one seat asks for the lunch choice');
    await p.click('#seats-more'); await p.click('#seats-more'); await p.click('#veg-more');
    t.ok((await p.locator('#plates').innerText()).replace(/\s+/g, ' ').includes('1 veg 2 non-veg') && await p.locator('#send').isEnabled(), 'three seats with one veg shows the plate split', await p.locator('#plates').innerText());
    await p.fill('#msg', 'Saving room for seconds');
    await p.click('#send'); await p.waitForSelector('#done:not([hidden])');
    state = (await host.get('/api/host/state')).data.guests.find((g) => g.code === sneha.code);
    t.ok(state.rsvp?.seats === 3 && state.rsvp.veg === 1 && state.rsvp.message === 'Saving room for seconds', 'the form reply saved', state.rsvp);
    await ctx.close();

    /* 5. Jabeen's guest, desktop dark */
    ({ p, ctx } = await open('/' + zainab.code));
    t.ok((await p.locator('#sign').innerText()) === '— Jabeen' && (await p.evaluate(() => Qubool.lines.j)).includes((await p.locator('#ps').innerText()).slice(5)), 'Jabeen’s guest gets her voice and her lines');
    await p.emulateMedia({ forcedColors: 'active' });
    await p.locator('label:has(#coming-yes)').click();
    const hc = await p.evaluate(() => ['coming-yes', 'coming-no'].map((id) => getComputedStyle(document.getElementById(id).nextElementSibling).backgroundColor));
    t.ok(hc[0] !== hc[1], 'High Contrast mode: the chosen answer looks different from the other', hc);
    await ctx.close();

    /* 5b. Hard inputs: a long link in a note, a very long first name, a connection that never answers */
    const [hard] = (await host.post('/api/host/guests', { entries: [{ name: 'Wolfeschlegelsteinhausenbergerdorffvoralternwaren Long', from: 'k' }] })).data.added;
    await host.patch('/api/host/guests/' + hard.code, { note: 'The hotel: https://example.com/' + 'a'.repeat(120) });
    ({ p, ctx } = await open('/' + hard.code, { phone: true }));
    await p.setViewportSize({ width: 320, height: 700 });
    const fits = await p.evaluate(() => {
      const card = document.querySelector('.q-card').getBoundingClientRect(), note = document.getElementById('note').getBoundingClientRect();
      return note.left >= card.left - 1 && note.right <= card.right + 1 && document.documentElement.scrollWidth <= innerWidth;
    });
    t.ok(fits, 'at 320px a long link in the note stays inside the card, and a long name never widens the page');
    await p.route('**/api/rsvp/**', () => {});   // the request goes out and nothing ever comes back
    await p.check('#coming-no'); await p.click('#send');
    const gaveUp = await p.waitForFunction(() => /Could not reach/.test(document.getElementById('send-hint').textContent), null, { timeout: 25000 }).then(() => true, () => false);
    t.ok(gaveUp && (await p.locator('#send').innerText()) === 'Send RSVP' && await p.locator('#copy').isVisible(), 'a reply that gets no answer gives up after 15 seconds, says so, and offers to copy it');
    await ctx.close();
    await host.del('/api/host/guests/' + hard.code);   // keeps the console's screenshots as they were

    /* 6. Only a guest's own link opens an invite */
    const lost = async (path, setup) => {
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      const pg = await c.newPage();
      pg.on('pageerror', (e) => errors.push(path + ': ' + e.message));
      if (setup) await pg.addInitScript(setup);
      const res = await pg.goto(base + path);
      return { pg, c, status: res.status(), html: await pg.content() };
    };
    const altered = arjun.code.slice(0, -1) + (arjun.code.endsWith('a') ? 'b' : 'a');
    for (const path of ['/k', '/j', '/kaif', '/' + altered, '/some-random-page', '/k-nobody-zzzzzz']) {
      const r = await lost(path);
      const ok = r.status === 404 && (await r.pg.locator('h1').innerText()) === 'Invite not found' && (await r.pg.locator('#out').innerText()).includes('not found');
      t.ok(ok && !r.html.includes('Arjun') && !r.html.includes('worst pull requests'), `${path === '/' + altered ? 'an altered code' : path}: “Invite not found”, with no guest’s details`, r.status);
      await r.c.close();
    }
    // The bug this replaces: a device that had used an open link was greeted as that old reply on any wrong link.
    const r6 = await lost('/' + altered, () => localStorage.setItem('qubool:open', JSON.stringify({ id: 'o-aaaaaaaaaaaaaaaa', name: 'Old Test', from: 'k' })));
    t.ok(!r6.html.includes('Old Test') && (await r6.pg.evaluate(() => localStorage.getItem('qubool:open'))) === null, 'a remembered open-link reply is ignored and forgotten');
    await r6.pg.screenshot({ path: OUT + '/invite-not-found-phone.png', fullPage: true });
    await r6.c.close();
    const home = await fetch(base + '/', { redirect: 'manual' });
    t.ok(home.status === 302 && new URL(home.headers.get('location'), base).pathname === '/host', 'the home page goes to the host console', home.status);

    /* 9. Times, set in the console, in 12-hour form */
    await host.put('/api/host/settings', { event: { date: '2026-12-26', nikah: '10:00', reception: '12:30', lunch: '13:00', venue: 'Sample Hall', maps: 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7' } });
    ({ p, ctx } = await open('/' + sneha.code, { phone: true, light: true }));
    t.ok((await p.locator('#when').innerText()) === 'Sat 26 Dec 2026 · 12:30 PM' && (await p.locator('#where').innerText()) === 'Sample Hall (tap to open maps)', 'the card shows the time and venue');
    t.ok((await p.getAttribute('#where a', 'href')) === 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7', 'with a venue name set, the venue itself opens the map');
    t.ok([await p.locator('#t-nikah').innerText(), await p.locator('#t-reception').innerText(), await p.locator('#t-lunch').innerText()].join() === '10:00 AM,12:30 PM,1:00 PM', 'the schedule is in 12-hour form');
    const oneLine = await p.evaluate(() => [...document.querySelectorAll('.q-schedule time')].every((e) => e.getClientRects().length === 1 && e.offsetHeight < 30));
    t.ok(oneLine, 'each time fits on one line at 390px');
    await p.click('#cal summary');
    t.ok((await p.getAttribute('#cal-google', 'href')).includes('dates=20261226T070000Z/20261226T100000Z') && (await p.getAttribute('#cal-ics', 'href')) === '/' + sneha.code + '/invite.ics', 'calendar choices: a timed Google event and the .ics file');
    await p.screenshot({ path: OUT + '/invite-timed-phone-light.png', fullPage: true });
    await ctx.close();

    /* 10. Replies closed */
    await host.put('/api/host/settings', { repliesOpen: false });
    ({ p, ctx } = await open('/' + zainab.code));
    await p.locator('label:has(#coming-no)').click();
    t.ok(await p.locator('#send').isDisabled() && (await p.locator('#send-hint').innerText()).startsWith('Replies are closed'), 'with replies closed, the form says so');
    await term(p, 'rsvp --regrets');
    t.ok((await lastLines(p, 1)).includes('replies are closed'), 'and so does the terminal');
    await ctx.close();
    await host.put('/api/host/settings', { repliesOpen: true, event: { date: '2026-12-26', maps: 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7' } });

    t.ok(errors.length === 0, 'no page errors', errors);
  } finally {
    await b.close();
  }
  return t.done();
}
