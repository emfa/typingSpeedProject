# Kaif & Jabeen reception invite

Read `README.md` first: it describes the Worker, the database, the console and the Cloudflare setup. Then read `HANDOFF.md`: what is live, how it deploys, decisions made, and the open items.

- **The repository is public.** Never commit guest names, notes, replies, passphrases, or exports. They live in D1 and in Worker secrets. `data/` and `.dev.vars` are git-ignored for this.
- **Design system:** `design-system/project/` is the source for look and voice. Read its `README.md` before writing copy or styles, and use its tokens and components.
  - It is also published as the "Qubool" design-system artifact (https://claude.ai/artifact/CgKJn3DNgiLfmCqsXJfT1s). If you change it, republish that too.
- **One-liners** are `LINES` in `bundle.js`. Only append; never reorder, edit or remove a line. Each guest's `line` column points at a line by position.
- **Invite only:** no open links. Only a code in the `guests` table opens an invite or takes a reply; `/` redirects to `/host`; every other address is the not-found page (`src/missing.*`). The design system's docs still describe the old `#k` / `#j` open links.
- **Guest codes** are minted by the Worker (`<k|j>-<name-slug>-<6 random>`), never by hand. Once a link is sent, its code must never change.
- **Builds:** `dist/` is build output. Edit `src/`, then run `node scripts/build.mjs`; `wrangler dev` and deploy run it too.
- **Tests:** run `npm test` (and `npm run test:browsers` after any visual change) before pushing, and compare `tests/out/` with `tests/baseline/`.
- **Schema changes** go in a new numbered file in `migrations/`. Never edit an applied migration.
- **Voice:** first person from whoever sent the link, warm, no emoji, at most one joke per screen, and never about the faith or the other half.
- **Retired:** the old claude.ai invite (LMFP1MqTr5VzP3FXZ8WD3K) and host console (Y4nMPwz1Yr3mpcFps7m9P8) artifacts, which were never shared. Delete them only if the owner asks.
