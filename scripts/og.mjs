// Renders static/og.jpg, the link preview for open links and for guests whose own preview is not drawn yet.
// It uses the same drawing code as the host console (window.QuboolPreview in src/host.js).
// Run after a design change: node scripts/build.mjs && node scripts/og.mjs   (needs Playwright and Google Fonts)
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const page = readFileSync(join(ROOT, 'dist', 'host.html'), 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
// The page's own script tries to load the guest list; with no server it just shows the sign-in form.
await p.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"signed_out"}' }));
await p.route('http://og.local/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: page }));
await p.goto('http://og.local/');
const dataUrl = await p.evaluate(async () => {
  await window.QuboolPreview.fonts();
  const c = document.createElement('canvas');
  window.QuboolPreview.draw(c, { name: null, from: null, sha: null, date: 'Sat 26 Dec 2026' });
  return c.toDataURL('image/jpeg', 0.88);
});
writeFileSync(join(ROOT, 'static', 'og.jpg'), Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('static/og.jpg written');
await b.close();
