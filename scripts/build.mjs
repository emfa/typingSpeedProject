// Builds dist/invite.html and dist/host.html from the Qubool design system and the page sources in src/.
// The Worker imports both files as text and fills in two placeholders per request:
//   <!--HEAD-->        page title and link-preview tags for this guest
//   /*DATA*/null       the guest, their reply and the event, as JSON
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DS = join(ROOT, 'design-system', 'project');
const read = (...p) => readFileSync(join(...p), 'utf8');

const T = JSON.parse(read(DS, 'tokens.json'));
const themes = T.color.themes.map((t) => t.id);
const val = (t, th) => {
  const v = typeof t.value === 'string' ? t.value : (t.value[th] ?? t.value[themes[0]]);
  return v.startsWith('{') ? `var(--${v.slice(1, -1)})` : v;
};
const block = (th, scheme) =>
  [...T.color.tokens, ...(T.shadow?.tokens ?? [])].map((t) => `--${t.name}: ${val(t, th)};`).join(' ') + ` color-scheme: ${scheme};`;
const fixed = [
  ...['spacing', 'radius'].flatMap((f) => T[f].tokens.map((t) => `--${t.name}: ${t.value};`)),
  ...Object.entries(T.type.families).map(([k, v]) => `--font-${k}: ${v};`),
].join(' ');
// Night is the default; Day follows the device's light setting.
const tokens =
  `:root { ${block('night', 'dark')} ${fixed} }\n` +
  `@media (prefers-color-scheme: light) { :root { ${block('day', 'light')} } }\n`;

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri&family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=JetBrains+Mono:wght@400;500&display=swap">';

const bundleCss = read(DS, 'components', 'bundle.css');
const bundleJs = read(DS, 'components', 'bundle.js');

function page(name) {
  const [css, html, js] = ['css', 'html', 'js'].map((ext) => read(ROOT, 'src', `${name}.${ext}`));
  const scripts = [bundleJs, js];
  for (const s of scripts) if (/<\/script/i.test(s)) throw new Error(`a script for ${name} contains a closing script tag`);
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b1512">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<!--HEAD-->
${FONTS}
<style>
${tokens}
[hidden] { display: none !important; }
${bundleCss}
${css}</style>
</head>
<body>
${html}
<script>window.__DATA__ = /*DATA*/null;</script>
${scripts.map((s) => `<script>\n${s}\n</script>`).join('\n')}
</body>
</html>
`;
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist', `${name}.html`), doc);
  console.log(`dist/${name}.html`, doc.length, 'bytes');
}

page('invite');
page('host');
