# Handoff: where things stand

Last updated 22 November 2026, when work moved from a Claude Code cloud session to the owner's own machine. Read `README.md` for how the system works; this file is the current state and what is left.

The owner is the groom's sibling. They and Kaif are the two hosts.

## Live now

| What | State |
| --- | --- |
| Site | **https://kaifwedsjabeen.in**, served by the Cloudflare Worker `kaif-jabeen` (custom domain attached by deploy; `www` redirects to the bare domain) |
| Deploys | Cloudflare Workers Builds, connected to this GitHub repo. **Production branch: `claude/review-analysis-mx2n3q`**. A push to it builds and deploys in about a minute (`npm run build`, then `npm run deploy`, which applies D1 migrations, then deploys) |
| Database | D1 `kaif-jabeen` (id in `wrangler.jsonc`). Migration `0001_init.sql` is applied |
| Secrets | `HOST_LOGINS` (the owner and Kaif, a passphrase each) and `SESSION_SECRET` are set on the Worker in the Cloudflare dashboard. They are not in this repo and must never be |
| Guests | 39 of Kaif's guests imported on 18 November with their P.S. line numbers kept. None from Jabeen yet |
| Guide for Kaif | A Claude doc, "kaifwedsjabeen.in: how the invite works", in the owner's claude.ai account. Update it when behaviour changes |

## Decisions made along the way

- **Cloudflare Worker + D1**, not Claude artifacts: an artifact that stores data cannot be shared publicly, so it could not save RSVPs.
- **Invite only.** No open links. `/` redirects to `/host`; any address that is not a guest's code is the 404 "Invite not found" page (`src/missing.*`).
- **Random link codes** (`k-name-xxxxxx`), minted by the Worker. The old signed codes from the artifact version were never sent and are not used.
- **Host sessions end after 5 idle minutes** (`HOST_IDLE_SECONDS`, default 300) **and when the browser closes**. The console's 30-second refresh does not count as activity.
- **Up to 4 seats per reply**, veg / non-veg as plate counts.
- **"Qubool hai, I'm in"** is the yes. The agreed fallback, if the family prefers, is "Yes, I'm in".

## Open items

1. **A test reply sits on a real guest.** The owner tested a real guest's link before launch, so one guest has a reply they never sent. Either that guest switches it from their link, or clear it (see "The live database" below), or add a "Clear reply" button to the console's rows (suggested, not built).
2. **Times and venue name** are not set yet. The hosts enter them in the console (The day). The invite shows "TBA" and "See it on the map" until then.
3. **Personal notes** for guests: none yet. Entered in the console per guest.
4. **Jabeen's guest list** has not arrived.
5. **Optional tidy-ups:**
   - Merge this branch into `main`, then set the production branch back to `main` in Cloudflare (Worker, Settings, Build). `main` still holds the old Angular app.
   - Make the GitHub repo private. Nothing secret is in it, but guests' colleagues are engineers.
   - Delete the retired claude.ai invite and host-console artifacts (ids in `CLAUDE.md`) once the owner agrees.

## Working on your own machine

```bash
git clone https://github.com/emfa/typingSpeedProject.git
cd typingSpeedProject
git checkout claude/review-analysis-mx2n3q
npm install
npm run test:setup        # downloads Chromium and WebKit for the tests, once
npm test                  # about 280 checks against a local Worker; nothing touches Cloudflare
npm run test:browsers     # every page at every screen size in Google Chrome and WebKit
```

To click around locally, create `.dev.vars` (git-ignored) with test values, then:

```bash
npm run db:migrate:local
npx wrangler dev          # http://localhost:8787/host
```

```
HOST_LOGINS={"Me":"a local passphrase"}
SESSION_SECRET=any-local-string-of-at-least-32-characters
```

To ship: commit, `npm test`, push the branch. Cloudflare deploys it. Check https://kaifwedsjabeen.in afterwards.

## The live database

Read or change it from your machine with Wrangler, after `npx wrangler login` (opens a browser to your Cloudflare account):

```bash
npx wrangler d1 execute DB --remote --command "SELECT name, sender, sent_at, opens FROM guests ORDER BY position"
npx wrangler d1 execute DB --remote --command "SELECT name, coming, seats, veg, nonveg, updated_at FROM rsvps"
```

Writes are live and immediate; guests see them at once. Prefer the console for anything it can do. To remove one reply (open item 1), find the guest's code first, then `DELETE FROM rsvps WHERE id = '<code>'` (the history stays in `rsvp_log`). Never paste query results with guest names into this repository.
