# Baseline screenshots

Taken on 23 November 2026 by `npm test` (the files land in `tests/out/`). Compare a fresh run against these after any change. They are 1x renders in headless Chromium with Google Fonts loaded, against the local Worker and a fresh test database.

| File | What it shows |
| --- | --- |
| `invite-personal-phone-light.png` | A personal link at 390px, light theme, with a personal note, before replying |
| `invite-personal-desktop-dark.png` | The same guest at 1100px, dark theme, after replying from the terminal and then changing to regrets |
| `invite-not-found-phone.png` | Any address that is not a guest's link (here an altered code) at 390px: “Invite not found” |
| `invite-timed-phone-light.png` | A personal link at 390px with sample times and venue set, the calendar menu open, and a saved reply |
| `host-desktop-dark.png`, `host-phone-dark.png` | The host console with the test database's guests and replies |
| `design-system/ds-<Component>-<theme>.png` | Every design-system preview in the night and day themes, 900px wide at each preview's card height, with `tokens.json`, `bundle.css` and `bundle.js` injected (23 November) |

All names, notes, times and the venue in these images are samples, except the couple's names, the date and the map link.
