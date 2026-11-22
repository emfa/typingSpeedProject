// Starts the Worker locally on a fresh, empty database, for the tests. Nothing here touches Cloudflare.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'tests', 'out');
mkdirSync(OUT, { recursive: true });

// Test passphrases only; the real ones are Cloudflare secrets.
export const LOGINS = { Tester: 'correct horse battery', Kaif: 'kaif local passphrase' };
const WRANGLER = join(ROOT, 'node_modules', '.bin', 'wrangler');

// https: serve over HTTPS with wrangler's own certificate, as the live site does. WebKit keeps the console's
// Secure session cookie only on https. The test process then trusts that local certificate.
export async function startServer({ port = 8790, vars: extra = {}, https = false } = {}) {
  if (https) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';   // local test server only
  const state = mkdtempSync(join(tmpdir(), 'qubool-test-'));
  const vars = join(state, 'test.vars');
  writeFileSync(vars, `HOST_LOGINS='${JSON.stringify(LOGINS)}'\nSESSION_SECRET=test-secret-0123456789abcdef0123456789abcdef\n` +
    Object.entries(extra).map(([k, v]) => `${k}=${v}\n`).join(''));
  execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state], { cwd: ROOT, stdio: 'pipe' });
  const child = spawn(WRANGLER, ['dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', state, '--env-file', vars, '--show-interactive-dev-session=false', ...(https ? ['--local-protocol', 'https'] : [])], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `${https ? 'https' : 'http'}://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;
  for (;;) {
    if (child.exitCode !== null) throw new Error('wrangler dev exited:\n' + log);
    try {
      const r = await fetch(base + '/robots.txt', { signal: AbortSignal.timeout(2000) });
      if (r.ok) break;
    } catch {}
    if (Date.now() > deadline) { child.kill(); throw new Error('wrangler dev did not start:\n' + log); }
    await new Promise((r) => setTimeout(r, 400));
  }
  return {
    base, log: () => log,
    stop() { child.kill('SIGTERM'); try { rmSync(state, { recursive: true, force: true }); } catch {} },
  };
}

// A tiny check list: every check prints, failures are counted, and the process exits non-zero on any failure.
export function checker(title) {
  let failed = 0, passed = 0;
  console.log(`\n${title}`);
  return {
    ok(cond, label, detail) {
      if (cond) { passed++; console.log(`  ok    ${label}`); }
      else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        got: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
    },
    done() { console.log(`  ${passed} passed, ${failed} failed`); return failed; },
  };
}

// fetch with the page's own Origin, a cookie jar, and JSON helpers.
export function client(base) {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const h = { origin: base, ...headers };
    if (cookie) h.cookie = cookie;
    let payload = body;
    if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { payload = JSON.stringify(body); h['content-type'] ??= 'application/json'; }
    const res = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : type.startsWith('image/') ? new Uint8Array(await res.arrayBuffer()) : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (p, h) => call('GET', p, undefined, h), post: (p, b, h) => call('POST', p, b, h), put: (p, b, h) => call('PUT', p, b, h),
    patch: (p, b, h) => call('PATCH', p, b, h), del: (p, h) => call('DELETE', p, undefined, h),
    get cookie() { return cookie; }, set cookie(v) { cookie = v; },
  };
}
