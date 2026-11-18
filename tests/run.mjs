// npm test: builds the pages, starts the Worker on a fresh local database, and runs every suite.
// Needs Node 20+, Playwright with Chromium, and access to Google Fonts. Screenshots land in tests/out/.
import { execFileSync } from 'node:child_process';
import { startServer, ROOT } from './server.mjs';
import * as invite from './invite.mjs';
import * as host from './host.mjs';
import * as api from './api.mjs';
import * as session from './session.mjs';

execFileSync('node', ['scripts/build.mjs'], { cwd: ROOT, stdio: 'inherit' });
const server = await startServer();
let failed = 0;
try {
  // The API suite runs last: it ends by locking out sign-in from this address.
  for (const suite of [invite, host, api]) failed += await suite.run(server.base);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  server.stop();
}
// Sessions need a short idle limit, so they get a Worker of their own.
const short = await startServer({ port: 8791, vars: { HOST_IDLE_SECONDS: session.IDLE } });
try {
  failed += await session.run(short.base);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  short.stop();
}
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
