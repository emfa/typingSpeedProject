# Kaif & Jabeen: reception invite

Personal invitations to Kaif and Jabeen's wedding reception, Saturday 26 December 2026, at **kaifwedsjabeen.in**.

Every guest gets a link of their own, such as `kaifwedsjabeen.in/k-arjun-7hq2xm`. Their page:
- opens as a terminal that logs them in by name;
- shows a card with a geometric lattice (a *jaali*) drawn from their name, a personal note, and the date and venue;
- takes their RSVP, with seats and veg / non-veg plates.

Replies are saved straight away. The hosts see who is coming, and the plate counts for the caterer, in a private console at `/host`.

Part of the fun, for an audience of engineers:
- **Link previews:** each guest's link shows their own lattice when pasted into WhatsApp or Slack.
- **Terminal RSVP:** `rsvp --qubool --seats 2 --veg 1` in the page's terminal really does RSVP.
- **curl:** `curl kaifwedsjabeen.in/<their code>` prints the invite as text with an ASCII lattice, and a second `curl` replies.

## How it is built

```
browser ── Cloudflare Worker (worker/) ── D1 database (migrations/)
             ├─ /<code>             a guest's invite, their data and preview baked in
             ├─ /, /k, /j           open links: asks the name (and who invited them)
             ├─ /api/rsvp/…         save or change a reply
             ├─ /<code>/rsvp        the same, for curl
             ├─ /<code>/invite.ics  calendar file
             ├─ /og/<code>.jpg      the guest's link-preview image
             └─ /host, /api/host/…  the hosts' console, behind a passphrase
```

- **`design-system/project/`** is the Qubool design system: tokens, components, the lattice, the one-liners, and the voice.
  - Read its `README.md` before changing words or looks.
  - The same `bundle.js` runs in the browser and in the Worker, so the lattice, invite hash and P.S. line always match.
- **`src/`** has the two pages (`invite.*`, `host.*`) as plain HTML, CSS and JavaScript.
  - `scripts/build.mjs` inlines everything into `dist/invite.html` and `dist/host.html`.
  - The Worker imports those as text.
- **`worker/`** is the server:
  - `index.js` routes requests and adds security headers.
  - `guest.js` serves the guest pages, the curl text and the calendar file.
  - `rsvp.js` validates and stores replies.
  - `host.js` handles sign-in and the console's API.
- **`migrations/0001_init.sql`** is the database:
  - `guests` and their notes;
  - `rsvps`, the current reply per guest, and `rsvp_log`, every change;
  - `previews`, the link-preview images;
  - `settings`, the event's times and venue, and whether replies are open;
  - `throttle`, for rate limits.
- **`static/`** holds plain files: the generic preview image, favicon and robots.txt.

**This repository is public.** Guest names, notes and replies live only in the database, and passphrases only in Cloudflare secrets. Nothing personal belongs in git, and `data/` is ignored for that reason.

## Setting it up on Cloudflare (once)

1. **Create the database.**
   - In the Cloudflare dashboard go to **Storage & databases → D1 → Create database**, and name it `kaif-jabeen`.
   - Copy its **Database ID** into `wrangler.jsonc` in place of `00000000-0000-0000-0000-000000000000`, and commit. The ID is not a secret.
2. **Connect this repository.**
   - Go to **Workers & Pages → Create → Import a repository**, and pick this repository.
   - Project name: `kaif-jabeen`, which must match `name` in `wrangler.jsonc`.
   - Build command: `npm run build`.
   - Deploy command: `npm run deploy`. This applies database migrations, then deploys.
   - Production branch: the branch holding this code.
   - If the deploy fails at the migration step with a permissions error, open the D1 database's **Console** tab, paste the contents of `migrations/0001_init.sql`, run it once, and change the deploy command to `npx wrangler deploy`.
3. **Add the two secrets.** In the Worker, open **Settings → Variables and Secrets → Add**, type **Secret**:
   - `HOST_LOGINS`: who may open `/host`, as JSON, each person with their own passphrase of 12 or more characters. For example, `{"Your name": "a long passphrase of your own", "Kaif": "another long passphrase"}`.
   - `SESSION_SECRET`: any random string of 32 or more characters. One way to make one is `openssl rand -hex 32`.
   - Changing someone's passphrase signs them out everywhere; changing `SESSION_SECRET` signs out everyone.
4. **Domain.** `kaifwedsjabeen.in` and `www.kaifwedsjabeen.in` are in `wrangler.jsonc` under `routes`, so the first deploy attaches them. The domain must be on the same Cloudflare account. `www` redirects to the bare domain.
5. **First visit.**
   - Open `kaifwedsjabeen.in/host` and sign in.
   - Paste the guest list into **Add guests**: names one per line, or the JSON list exported from the old console.
   - Fill in **The day** once times and the venue are known.
   - Each guest's link-preview picture is drawn automatically while the console is open.

Before sending links, open one in a private window, and paste one into a WhatsApp chat to see the preview.

## Day to day, in the console

- **Add a guest:** type their name, choose Kaif or Jabeen, then **Add**. Copy their link or the ready-made message, send it, and tick **Sent**.
- **Personal note:** use **Add note** on their row. It shows on their card and in their terminal, and nowhere else. This is the part people remember.
- **Replies:** they appear as they arrive, and the page refreshes every 30 seconds. The totals at the top are what the caterer needs.
- **Export CSV:** downloads every guest and reply.
- **Close replies:** untick **Replies are open** when the caterer needs final numbers.
- **Open links:** `/k` and `/j` are for someone not on the list. They sign the card as Kaif or Jabeen, and the page asks the person's name. Replies land under **From open links**.

## Working on it

```bash
npm install
npm test
```

`npm test` builds the pages, starts the Worker locally on a fresh, empty database, and runs about 120 checks in Chromium and over HTTP. It needs Playwright with Chromium and access to Google Fonts. Screenshots land in `tests/out/`; compare them with `tests/baseline/` after a change.

To click around locally:

```bash
npm run db:migrate:local
npx wrangler dev
```

For local sign-in, put test values in `.dev.vars`, which git ignores:

```
HOST_LOGINS={"Me":"a local passphrase"}
SESSION_SECRET=any-local-string-of-at-least-32-characters
```

After changing the look of the preview card in `src/host.js`, regenerate the generic image with `node scripts/build.mjs && node scripts/og.mjs`.

Rules that keep sent links working are in `CLAUDE.md`.
