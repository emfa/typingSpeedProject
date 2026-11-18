// Host sessions: they end after a short idle time and when the browser closes, and the automatic
// refresh does not keep them alive. Runs on its own Worker with HOST_IDLE_SECONDS=4 instead of 300.
import { createRequire } from 'node:module';
import { client, checker, LOGINS } from './server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const IDLE = 4;

export async function run(base) {
  const t = checker(`Host sessions (idle limit ${IDLE}s for the test; 5 minutes live)`);

  // The cookie
  const a = client(base);
  let r = await a.post('/api/host/login', { passphrase: LOGINS.Tester });
  const cookie = r.headers.get('set-cookie') || '';
  t.ok(r.data.idleSeconds === IDLE, 'sign-in reports the idle limit', r.data);
  t.ok(!/Max-Age|Expires/i.test(cookie) && /HttpOnly/.test(cookie), 'the cookie has no lifetime of its own, so closing the browser ends it', cookie);

  // Idle: no activity, the session ends
  await wait((IDLE + 1) * 1000);
  t.ok((await a.get('/api/host/state')).status === 401, `after ${IDLE + 1}s with nothing done, the session has ended`);

  // The automatic refresh does not count as activity
  await a.post('/api/host/login', { passphrase: LOGINS.Tester });
  for (let i = 0; i < 3; i++) { await wait(1500); await a.get('/api/host/state'); }
  t.ok((await a.get('/api/host/state')).status === 401, 'automatic refreshes alone do not keep it alive');

  // Activity does
  await a.post('/api/host/login', { passphrase: LOGINS.Tester });
  for (let i = 0; i < 3; i++) { await wait(2000); r = await a.get('/api/host/state', { 'x-qubool-activity': '1' }); }
  t.ok(r.status === 200, 'each thing the host does starts the idle time again', r.status);

  // An old-style (version 1) session cookie no longer works
  const old = client(base);
  const payload = Buffer.from(JSON.stringify({ u: 'Tester', exp: Date.now() + 30 * 86400000 })).toString('base64url');
  old.cookie = '__Host-qubool=' + payload + '.AAAA';
  t.ok((await old.get('/api/host/state')).status === 401, 'an old 30-day session cookie is refused');

  // The console in a browser signs itself out and clears the screen
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext()).newPage();
    await p.goto(base + '/host');
    await p.waitForSelector('#login:not([hidden])');
    t.ok((await p.locator('#login-hint').innerText()).includes('5 minutes without activity'), 'the sign-in form explains the rule');
    await p.fill('#pass', LOGINS.Kaif); await p.click('#login-btn');
    await p.waitForSelector('#app:not([hidden])');
    await a.post('/api/host/guests', { entries: [{ name: 'Session Test', from: 'k' }] }, { 'x-qubool-activity': '1' });
    await p.reload(); await p.waitForSelector('#app:not([hidden])');
    t.ok((await p.locator('tr[data-code]').count()) > 0, 'signed in, the list shows');
    await p.waitForSelector('#login:not([hidden])', { timeout: (IDLE + 6) * 1000 });
    t.ok((await p.locator('#login-hint').innerText()).startsWith('Signed out after'), 'left alone, the console signs itself out', await p.locator('#login-hint').innerText());
    t.ok((await p.locator('tr[data-code]').count()) === 0 && (await p.locator('#stats').innerText()) === '', 'and nothing about the guests stays on screen');
    t.ok((await p.evaluate(() => fetch('/api/host/state').then((x) => x.status))) === 401, 'the server agrees the session is over');
  } finally {
    await b.close();
  }
  return t.done();
}
