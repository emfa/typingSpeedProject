Qubool is the invitation to Kaif and Jabeen's wedding reception on Saturday 26 December 2026. Each of them sends it to their own friends and colleagues, and every guest gets a link of their own; the page behind it greets them by name, shows a lattice drawn from that name, speaks in the voice of whoever invited them, and takes their RSVP. The guests, notes and replies shown in the previews are samples.

## Voice

Whoever sent the link is speaking, Kaif or Jabeen, in the first person, to people they like. The card is signed by that person.

- Write "I", never "we cordially invite". "I am getting married, and I want you there."
- Greet with "Assalamu alaikum, {first name}." Close with "insha'Allah" where a plan is stated: "See you on the 26th, insha'Allah."
- One joke per screen, at most, and it is always about the food or the day, never about the faith or the other half. Kaif's guests are mostly engineers and get engineering jokes; Jabeen's get plain warm ones. "I promise the biryani scales horizontally." The lines are `Qubool.lines.k` and `Qubool.lines.j`; add new ones at the end.
- The nikah is named and explained in one line: it is a small family gathering in the morning; guests are invited to the reception and lunch that follow.
- Sentence case everywhere. Labels in `label` are uppercase by style, not by typing.
- No emoji. No exclamation marks in the invitation itself.
- Say "Reception", "Lunch", "Seats", "Veg", "Non-veg". The yes on the RSVP is "Qubool hai, I'm in".
- Times are 12-hour everywhere: "12:30 PM", never "12:30" or "13:00". Dates read "Sat 26 Dec 2026".
- Until an open-link guest says who invited them, the page speaks as both: "We are getting married", signed "Kaif & Jabeen".

## Colour

- The page is `ground`; the card and fields are `ground-raised`. Night is the default theme, because the invite opens as a terminal. Day is the same system on ivory.
- `emerald` is a field, never text: the arch of the card and the disc behind a seal. Lattice lines on it are `gilt`; any words on it are `on-emerald`.
- `brass` is the only accent. It marks the Bismillah, the ampersand between the names, times, the invite hash, the signature, and the one primary button. Text on a brass fill is `on-brass`.
- The terminal (`term-bg`, `term-ink`, `term-green`, `term-dim`) stays dark in both themes. `term-green` is the prompt, the caret and "ok" only.
- `veg` and `nonveg` belong to the meal marks alone.
- `line` is for hairlines; any control's border is `line-strong`.
- Focus is a solid 2px `focus` ring, 2px off the control. On a brass fill the ring is `on-brass`.

## Type

Two voices, never mixed inside a sentence.

- **Fraunces** (`--font-display`) for everything said from the heart: the names in `names`, section headings in `title` (`.q-title`), schedule entries in `entry`, the invitation in `prose`, the personal line in `note` (italic).
- **JetBrains Mono** (`--font-mono`) for everything the system says: commands and table cells in `code`, facts in `data`, field labels and tags in `label`, button labels.
- **Amiri** (`--font-arabic`) for the Bismillah in `bismillah`, and nothing else.
- All three are loaded from Google Fonts; there are no font files in this system.

## Shape and space

- Controls are nearly square: `radius-sm`. The terminal, tables and the foot of the card take `radius-md`. `radius-arch` is used once, on the two top corners of the card.
- The arch is the one silhouette. Do not round anything else into a pill or a circle except the seal.
- Space comes from the scale: `space-6` inside cards and between fields, `space-12` between sections of the page, `space-16` at its top and bottom.
- Only the card and the terminal cast `shadow-card`.
- The guest's page is a single column, at most 560px wide, centred. The card is 380px.

## The lattice

Each guest's lattice is drawn by `Qubool.jaaliSVG(name)`: the name is hashed, and the hash chooses a tiling, a contact angle and a line style. It is the same construction craftsmen use for jaali screens, run on a name. Use the guest's lattice wherever that guest appears and never swap one guest's for another's. The invite hash printed on the card (`Qubool.sha(name)`) comes from the same name.

## Motion

- The terminal types; the caret blinks. Nothing else moves on its own.
- When the terminal finishes, the card appears. With reduced motion on, the terminal prints at once and the card is simply there.

## Marks

There is no icon set. The only drawn marks are the two meal marks from `Qubool.mealMark`, and each is always beside its word. Use words on buttons, not glyphs.

## The guest's page, in order

1. `Terminal` — logs the guest in and prints their note. Skippable.
2. `InviteCard` — the invitation, with their lattice.
3. `Schedule` — nikah (family only), reception, lunch.
4. Two quiet `Button`s — "Add to calendar", "Open in Maps".
5. `RSVPForm` — the one primary button on the page.

The host's page is `GuestTable`, with a `GuestLink` row per guest for sending the links. Styles are in `components/bundle.css`; the lattice, hash, typing and meal marks are in `components/bundle.js` as `window.Qubool`, a plain script with no dependencies.
