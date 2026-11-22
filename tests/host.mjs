// The host console in Chromium, against the local Worker. Run through tests/run.mjs.
import { createRequire } from 'node:module';
import { client, checker, LOGINS, OUT } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

export async function run(base) {
  const t = checker('Host console');
  const b = await chromium.launch();
  const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && errors.push(m.text()));
    await p.goto(base + '/host');
    await p.waitForSelector('#login:not([hidden])');
    t.ok(await p.locator('#app').isHidden(), 'signed out, only the sign-in form shows');
    await p.fill('#pass', 'not it at all'); await p.click('#login-btn');
    await p.waitForFunction(() => /not right/.test(document.getElementById('login-hint').textContent));
    t.ok(true, 'a wrong passphrase is refused');
    await p.fill('#pass', LOGINS.Kaif); await p.click('#login-btn');
    await p.waitForSelector('#app:not([hidden])');
    t.ok((await p.locator('#who-am-i').innerText()).startsWith('Signed in as Kaif.'), 'signed in, it says who');

    // Add by name, then import JSON with line numbers kept
    await p.fill('#names', 'Vikram\nAnanya\n\nvikram');
    await p.click('#add-btn');
    await p.waitForFunction(() => /added/.test(document.getElementById('add-hint').textContent));
    t.ok(/2 guests added\. Skipped: vikram \(already on the list\)/.test(await p.locator('#add-hint').innerText()), 'names added one per line; a duplicate is skipped', await p.locator('#add-hint').innerText());
    await p.fill('#names', JSON.stringify([{ name: 'Imran Shaikh', from: 'k', line: 13 }, { name: 'Ayesha', from: 'j', line: 3 }]));
    await p.click('#add-btn');
    await p.waitForFunction(() => /2 guests added/.test(document.getElementById('add-hint').textContent));
    const api = client(base);
    await api.post('/api/host/login', { passphrase: LOGINS.Tester });
    let s = (await api.get('/api/host/state')).data;
    const imran = s.guests.find((g) => g.name === 'Imran Shaikh'), ayesha = s.guests.find((g) => g.name === 'Ayesha');
    t.ok(imran?.line === 13 && ayesha?.from === 'j' && ayesha.line === 3, 'a JSON import keeps sender and line', [imran, ayesha]);
    const vikram = s.guests.find((g) => g.name === 'Vikram');

    // Copy message
    await p.locator(`tr[data-code="${vikram.code}"] [data-act=msg]`).click();
    const msg = await p.evaluate(() => navigator.clipboard.readText());
    t.ok(msg.startsWith('Hi Vikram, Kaif here. I am getting married on 26 December') && msg.endsWith('/' + vikram.code), 'Copy message gives the ready-made message with their link', msg);
    t.ok(await p.getByRole('button', { name: 'Copied Vikram', exact: true }).count() === 1, 'the button shows “Copied”, and its name still says whose row it is in');

    // Screen readers: the guest's name heads the row, and each row button says whose row it is in
    t.ok(await p.locator(`tr[data-code="${vikram.code}"] > th[scope=row]:first-child`).count() === 1, 'each guest’s name is the header of their row');
    t.ok(await p.getByRole('button', { name: 'Remove Vikram', exact: true }).count() === 1 && await p.getByRole('button', { name: 'Copy link Vikram', exact: true }).count() === 1, 'row buttons are named with the guest: “Remove Vikram”, “Copy link Vikram”');

    // Note
    await p.locator(`tr[data-code="${vikram.code}"] [data-act=note]`).click();
    await p.fill('#note-input', 'Thank you for every late-night deploy.');
    await p.click('[data-act=note-save]');
    await p.waitForFunction((c) => document.querySelector(`tr[data-code="${c}"] .note-text`)?.textContent.includes('late-night'), vikram.code);
    t.ok((await api.get('/' + vikram.code)).data.includes('late-night deploy'), 'a note saved in the console reaches the guest’s page');

    // Sent tick, a reply arriving, totals
    await p.locator(`tr[data-code="${vikram.code}"] [data-act=sent]`).check();
    await api.put('/api/rsvp/' + vikram.code, { coming: 'yes', seats: 2, veg: 1 });
    await p.reload(); await p.waitForSelector('#app:not([hidden])');
    // Other suites share this database, so the expected totals come from the API's own numbers.
    s = (await api.get('/api/host/state')).data;
    const yes = s.guests.map((g) => g.rsvp).filter((r) => r && r.coming === 'yes');
    const sum = (k) => yes.reduce((n, r) => n + r[k], 0);
    const stats = (await p.locator('#stats').innerText()).replace(/\s+/g, ' ');
    t.ok(stats.toUpperCase().startsWith(`${sum('seats')} SEATS TO SET ${sum('veg')} VEG PLATES ${sum('nonveg')} NON-VEG PLATES ${yes.length} / ${s.guests.length} SAID YES`), 'totals add up seats, plates and yeses', stats);
    t.ok((await p.locator(`tr[data-code="${vikram.code}"] .sent span`).innerText()) === 'sent' && (await p.locator(`tr[data-code="${vikram.code}"]`).innerText()).includes('COMING'), 'the row shows sent and the reply');
    await p.locator('label:has(input[value=waiting])').click();
    t.ok((await p.locator('tr[data-code]').count()) === s.guests.filter((g) => !g.rsvp).length && !(await p.locator(`tr[data-code="${vikram.code}"]`).count()), 'No reply shows only guests without a reply');
    await p.locator('label:has(input[value=all])').click();

    // Link previews are drawn and uploaded for every guest
    await p.waitForFunction(() => /Every guest has/.test(document.getElementById('preview-hint').textContent), null, { timeout: 40000 });
    const img = await api.get('/og/' + vikram.code + '.jpg');
    t.ok(img.status === 200 && img.headers.get('content-type') === 'image/jpeg' && img.data.length > 20000 && img.data.length < 400 * 1024, 'each guest gets their own preview image', img.data.length);

    // The day
    await p.fill('#ev-reception', '12:30'); await p.fill('#ev-venue', 'Sample Hall');
    await p.click('#ev-save');
    await p.waitForFunction(() => /Saved/.test(document.getElementById('ev-hint').textContent));
    t.ok((await api.get('/' + vikram.code)).data.includes('"reception":"12:30"'), 'the day saved in the console reaches the invites');
    await api.put('/api/host/settings', { event: { date: '2026-12-26', maps: 'https://maps.app.goo.gl/9h6yuat4DQtRhneK7' } });

    // CSV
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
    t.ok(csv.includes('name,invited_by,answer') && csv.includes('Vikram,Kaif,yes,2,1,1'), 'Export CSV downloads the replies', csv.slice(0, 200));

    await p.screenshot({ path: OUT + '/host-desktop-dark.png', fullPage: true });

    // Remove takes two presses; from the keyboard, the second press is right where the first one was
    await p.focus(`tr[data-code="${imran.code}"] [data-act=remove]`); await p.keyboard.press('Enter');
    t.ok((await p.locator(`tr[data-code="${imran.code}"] [data-act=remove]`).innerText()) === 'Confirm remove', 'Remove asks for a second press');
    t.ok(await p.evaluate(() => document.activeElement.textContent) === 'Confirm remove', 'keyboard focus stays on the button while the rows are redrawn');
    await p.locator(`tr[data-code="${imran.code}"] [data-act=remove]`).click();
    await p.waitForFunction((c) => !document.querySelector(`tr[data-code="${c}"]`), imran.code);
    t.ok(true, 'the second press removes the guest');

    // A long one-word name still fits the whole table at 1280, shown in full (added after the screenshot, then removed)
    const [longName] = (await api.post('/api/host/guests', { entries: [{ name: 'Venkatasubramaniam Iyer', from: 'k' }] })).data.added;
    await p.reload(); await p.waitForSelector(`tr[data-code="${longName.code}"]`);
    const fit = await p.evaluate((c) => { const w = document.querySelector('.q-table-wrap'), n = document.querySelector(`tr[data-code="${c}"] .n`); return { over: w.scrollWidth - w.clientWidth, cut: n.scrollWidth > n.clientWidth, cols: [...document.querySelectorAll('.q-table thead th')].map((t) => Math.round(t.getBoundingClientRect().width)).join(' ') }; }, longName.code);
    t.ok(fit.over <= 0 && !fit.cut, 'with “Venkatasubramaniam Iyer” on the list the table still fits at 1280 and the name is whole', fit);
    await api.del('/api/host/guests/' + longName.code);
    await p.reload(); await p.waitForSelector('#rows tr');

    // A first load that cannot reach the server says so and tries again, instead of a blank page
    const p2 = await ctx.newPage();
    await p2.route('**/api/host/state', (r) => r.abort());
    await p2.goto(base + '/host');
    await p2.waitForFunction(() => /Could not reach the server/.test(document.getElementById('who-am-i').textContent)).then(() => t.ok(true, 'an unreachable server on first load is explained, not a blank page'), () => t.ok(false, 'an unreachable server on first load is explained, not a blank page'));
    await p2.close();

    // Screen readers: the totals speak only when a number changes; connection problems are announced
    const churn = await p.evaluate(async () => {
      let n = 0; new MutationObserver(() => n++).observe(document.getElementById('stats'), { childList: true, subtree: true, characterData: true });
      for (const v of ['k', 'all']) { document.querySelector(`.filters input[value="${v}"]`).click(); await new Promise((r) => setTimeout(r, 100)); }
      return n;
    });
    t.ok(churn === 0, 'pressing filters does not rewrite the totals, so screen readers do not hear them again', churn);
    t.ok(await p.evaluate(() => ['who-am-i', 'state'].every((id) => document.getElementById(id).getAttribute('aria-live') === 'polite')), 'the sign-in line and the list status are announced when they change');

    // The 30-second refresh leaves the rows alone when nothing changed (a redraw of a long list holds up the page)
    const p3 = await ctx.newPage();
    await p3.clock.install();
    await p3.goto(base + '/host'); await p3.waitForSelector('#rows tr');
    await p3.evaluate(() => { document.querySelector('#rows tr').__kept = true; });
    await p3.clock.fastForward(31000); await p3.waitForTimeout(800);
    t.ok(await p3.evaluate(() => document.querySelector('#rows tr').__kept === true), 'a refresh with no changes does not redraw the list');
    await p3.close();

    // The link preview picture: a long first name still fits its greeting line
    const edge = await p.evaluate(async () => {
      await QuboolPreview.fonts();
      const c = document.createElement('canvas');
      QuboolPreview.draw(c, { name: 'Venkatasubramaniam Iyer', from: 'k', sha: '0000000', date: 'Sat 26 Dec 2026' });
      const d = c.getContext('2d').getImageData(560, 190, 640, 50).data;
      let right = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) right = Math.max(right, 560 + (i / 4) % 640);
      return right;
    });
    t.ok(edge > 900 && edge <= 1136, 'a long first name fits the link preview’s greeting line', edge);

    // Phone
    await p.setViewportSize({ width: 390, height: 844 });
    t.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll at 390px (the table scrolls inside its frame)');
    await p.screenshot({ path: OUT + '/host-phone-dark.png', fullPage: true });

    await p.click('#logout');
    await p.waitForSelector('#login:not([hidden])');
    t.ok((await api.get('/api/host/state')).status === 200 && (await p.evaluate(() => fetch('/api/host/state').then((r) => r.status))) === 401, 'Sign out ends this browser’s session only');
    t.ok(errors.length === 0, 'no page errors', errors);
    await ctx.close();
  } finally {
    await b.close();
  }
  return t.done();
}
