// npm test: builds the pages, starts the Worker on a fresh local database, and runs every suite in Chromium.
// npm run test:browsers: the every-screen-size suite in Google Chrome and WebKit (Safari's engine), each on its own Worker.
// Needs Node 20+, Playwright's browsers (npm run test:setup), and access to Google Fonts. Screenshots land in tests/out/.
import { execFileSync } from 'node:child_process';
import { startServer, ROOT } from './server.mjs';
import * as invite from './invite.mjs';
import * as host from './host.mjs';
import * as matrix from './matrix.mjs';
import * as api from './api.mjs';
import * as session from './session.mjs';

execFileSync('node', ['scripts/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
const i = process.argv.indexOf('--browsers');
const engines = i < 0 ? null : process.argv[i + 1].split(',');
let failed = 0;

async function onServer(opts, fn) {
  const server = await startServer(opts);
  try {
    failed += await fn(server.base);
  } catch (err) {
    console.error(err);
    failed++;
  } finally {
    server.stop();
  }
}

if (engines) {
  for (const engine of engines) await onServer({ https: true }, (base) => matrix.run(base, { engine }));
} else {
  // The API suite runs last: it ends by locking out sign-in from this address.
  await onServer({}, async (base) => {
    let n = 0;
    for (const run of [invite.run, host.run, (b) => matrix.run(b, { engine: 'chromium' }), api.run]) n += await run(base);
    return n;
  });
  // Sessions need a short idle limit, so they get a Worker of their own.
  await onServer({ port: 8791, vars: { HOST_IDLE_SECONDS: session.IDLE } }, session.run);
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
