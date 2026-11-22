// Every page at every screen size, in a given browser engine: the guest's invite (fresh and replied),
// "Invite not found", and the signed-in console. Run through tests/run.mjs (npm test: chromium;
// npm run test:browsers: Google Chrome and WebKit). Screenshots land in tests/out/matrix/.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { client, checker, LOGINS, OUT } from './server.mjs';
const pw = createRequire(import.meta.url)('playwright');

export const ENGINES = {
  chromium: { type: 'chromium', launch: {} },
  chrome: { type: 'chromium', launch: { channel: 'chrome' } },   // the Google Chrome installed on this machine
  webkit: { type: 'webkit', launch: {} },                         // Safari's engine, as on iPhones
};
// [width, height, phone]: phones get touch and mobile emulation, so (pointer: coarse) applies.
const SIZES = [[1440, 900], [1280, 800], [1024, 768], [820, 1180], [768, 1024], [390, 844, true], [360, 800, true], [320, 640, true]];
const LIGHT_TOO = new Set([1440, 390]);

// In the page: true when a 44px-tall band through the element's middle lands on it (its own box or a ::before hit area).
function tapsAt44(sel) {
  const el = document.querySelector(sel);
  if (!el) return 'missing';
  el.scrollIntoView({ block: 'center', inline: 'end', behavior: 'instant' });   // the page scrolls smoothly; measure where it lands
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  return [-21, 0, 21].every((dy) => { const h = document.elementFromPoint(x, y + dy); return h && (h === el || el.contains(h)); });
}
function noSideScroll() { return document.documentElement.scrollWidth <= innerWidth; }

export async function run(base, { engine = 'chromium' } = {}) {
  const t = checker(`Every screen size, ${engine}`);
  const E = ENGINES[engine];
  mkdirSync(OUT + '/matrix', { recursive: true });

  // Sample guests: a fresh invite with a note, a replied one, and long names and lines that stress the console's table.
  const api = client(base);
  await api.post('/api/host/login', { passphrase: LOGINS.Tester });
  const tag = engine.slice(0, 3);
  const { added } = (await api.post('/api/host/guests', { entries: [
    { name: `Arjun ${tag}`, from: 'k' }, { name: `Sneha ${tag}`, from: 'j' },
    { name: `Venkata Subramaniam ${tag}`, from: 'k' }, { name: `Fatima Khan ${tag}`, from: 'j' }] })).data;
  const [fresh, replied, longName] = added;
  await api.patch('/api/host/guests/' + fresh.code, { note: 'You reviewed my worst pull requests without judgment.' });
  await api.patch('/api/host/guests/' + longName.code, { note: 'Thank you for every late-night deploy, and for never once saying I told you so.', sent: true });
  await api.put('/api/rsvp/' + replied.code, { coming: 'yes', seats: 3, veg: 1, message: 'Saving room for seconds' });
  await api.put('/api/rsvp/' + longName.code, { coming: 'yes', seats: 4, veg: 2, message: 'Bringing the whole family. Saving room for seconds and thirds.' });

  const browser = await pw[E.type].launch(E.launch);
  const errors = [];
  try {
    for (const [w, h, phone] of SIZES) {
      for (const scheme of LIGHT_TOO.has(w) ? ['dark', 'light'] : ['dark']) {
        const at = `${w}x${h} ${scheme}`;
        const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: h }, colorScheme: scheme, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(`${at}: ${e.message || JSON.stringify(e)}`));
        const shot = (name) => page.screenshot({ path: `${OUT}/matrix/${engine}-${name}-${w}-${scheme}.png`, fullPage: true });

        /* 1. A fresh invite, terminal typing */
        await page.goto(base + '/' + fresh.code);
        if (phone) t.ok(await page.evaluate(tapsAt44, '#skip'), `${at} invite: Skip is a 44px tap target while the terminal types`);
        if (await page.locator('#skip').isVisible()) await page.click('#skip');
        await page.waitForSelector('#shell:not([hidden])');
        await page.evaluate(() => document.fonts.ready);
        const inv = await page.evaluate(() => {
          const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
          const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
          const lum = (c) => { const v = rgb(c).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
          const dim = getComputedStyle(document.querySelector('#out .q-out')).color, bg = getComputedStyle(document.querySelector('.q-term')).backgroundColor;
          const [a, b] = [lum(dim), lum(bg)].sort((x, y) => y - x);
          return { h2: px('#h-day'), h3: px('.q-schedule h3'), contrast: (a + 0.05) / (b + 0.05),
            amiri: [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Amiri' && f.status === 'loaded'),
            sendDisabled: document.getElementById('send').disabled, hint: document.getElementById('send-hint').textContent };
        });
        t.ok(await page.evaluate(noSideScroll), `${at} invite: no sideways scroll`);
        t.ok(inv.h2 > inv.h3, `${at} invite: section headings (${inv.h2}px) are larger than schedule entries (${inv.h3}px)`);
        t.ok(inv.contrast >= 7, `${at} invite: terminal grey text at ${inv.contrast.toFixed(2)}:1 (7:1 or more)`);
        t.ok(inv.amiri, `${at} invite: the Bismillah's font (Amiri subset) loaded`);
        t.ok(inv.sendDisabled && inv.hint === 'Say whether you can come, then send your reply.', `${at} invite: Send is disabled and says why`, inv.hint);
        await page.locator('label:has(#coming-yes)').click();
        t.ok((await page.textContent('#send-hint')) === 'Choose veg or non-veg for your lunch.', `${at} invite: one seat and no lunch: the hint asks for it`);
        if (phone) {
          const targets = ['a.maplink', '#cmd', '#cal summary', '#maps', 'label:has(#coming-no)', 'label:has(#meal-veg)', '#seats-more', '#msg', '#send'];
          const small = [];
          for (const sel of targets) if ((await page.evaluate(tapsAt44, sel)) !== true) small.push(sel);
          t.ok(!small.length, `${at} invite: every control is a 44px tap target`, small);
          await page.click('#cal summary');
          const cal = [];
          for (const sel of ['#cal-google', '#cal-ics']) if ((await page.evaluate(tapsAt44, sel)) !== true) cal.push(sel);
          t.ok(!cal.length, `${at} invite: the calendar choices are 44px tap targets`, cal);
          await page.click('#cal summary');
        }
        await page.locator('label:has(#coming-no)').click();
        await shot('invite');

        /* 2. A replied invite: the receipt keeps each flag on one line */
        await page.goto(base + '/' + replied.code);
        await page.waitForSelector('#done:not([hidden])');
        const rec = await page.evaluate(() => {
          const r = document.getElementById('receipt');
          return { whole: [...r.querySelectorAll('.nw')].every((s) => s.getClientRects().length === 1), fits: r.scrollWidth <= r.clientWidth + 1, text: r.textContent };
        });
        t.ok(rec.whole && rec.fits && rec.text.includes('--seats 3 --veg 1 --nonveg 2'), `${at} replied: the saved reply's flags never break across lines`, rec);
        t.ok(await page.evaluate(noSideScroll), `${at} replied: no sideways scroll`);
        await shot('replied');

        /* 3. Invite not found */
        const res = await page.goto(base + '/k-nobody-zzzzzz');
        const nf = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, og: !!document.querySelector('meta[property="og:description"]'), desc: !!document.querySelector('meta[name=description]') }));
        t.ok(res.status() === 404 && nf.h1 === 'Invite not found' && nf.og && nf.desc, `${at} not found: 404 page with share tags`, nf);
        t.ok(await page.evaluate(noSideScroll), `${at} not found: no sideways scroll`);
        await shot('missing');

        /* 4. The console, signed in */
        await page.goto(base + '/host');
        await page.fill('#pass', LOGINS.Kaif);
        await page.click('#login-btn');
        const signedIn = await page.waitForSelector('tr[data-code]', { timeout: 8000 }).then(() => true, () => false);
        t.ok(signedIn, `${at} console: signs in`);
        if (signedIn) {
          const tbl = await page.evaluate(() => {
            const wrap = document.querySelector('.q-table-wrap'), fits = wrap.scrollWidth <= wrap.clientWidth + 1;
            wrap.scrollLeft = wrap.scrollWidth;
            const name = document.querySelector('tr[data-code] > :first-child').getBoundingClientRect(), box = wrap.getBoundingClientRect();
            const pinned = name.left >= box.left - 1 && name.right <= box.right + 1;
            wrap.scrollLeft = 0;
            return { fits, pinned };
          });
          if (w >= 1280) t.ok(tbl.fits, `${at} console: the whole guest table fits, notes and Remove included`);
          else t.ok(tbl.pinned, `${at} console: scrolling the table keeps the guest's name in view`);
          t.ok(await page.evaluate(noSideScroll), `${at} console: no sideways page scroll`);
          if (phone) {
            const row = `tr[data-code="${fresh.code}"]`, small = [];
            for (const sel of [`${row} [data-act=link]`, `${row} [data-act=msg]`, `${row} label.sent`, `${row} [data-act=note]`, `${row} [data-act=remove]`]) if ((await page.evaluate(tapsAt44, sel)) !== true) small.push(sel);
            t.ok(!small.length, `${at} console: row buttons and the sent tick are 44px tap targets`, small);
          }
          await page.evaluate(() => scrollTo(0, 0));
          await shot('console');
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  t.ok(errors.length === 0, `${engine}: no page errors`, errors);
  return t.done();
}
