# Terminal

The opening of the invite: a terminal that logs the guest in by first name, prints the note from whoever invited them, and opens the card.

Mark up `.q-term` with a `.q-term-bar` and a `.q-term-body`, then call `Qubool.type(body, lines, { onDone })`.

- **You provide** the lines. A line is `{ text, typed, cls, pause }`: `typed: true` is a command (it gets the `$` prompt and appears a key at a time); other lines print whole. `cls` is `q-out` for program output, `q-say` for the greeting, nothing for the note.
- **The script, in order** `ssh <first>@reception.<couple>` → `verifying invite <hash> … ok` → the salaam → `cat note.txt` → the note, or the one-liner when there is no note → the one-liner, only when there was a note → `./open-invite` → `invite open, signed <sender>`. It must finish in under ten seconds.
- **On an open link** the terminal asks `name:`, then `invited by:` (kaif or jabeen) unless the link already says (`#k`, `#j`), then runs the script above.
- **After the script** it is a working shell: `help`, `whoami`, `ls`, `cat`, `date`, `maps`, `git log`, `sudo`, `exit`, `clear`, and `rsvp`, which fills in the real form.
- **Do** give guests a way past it: `onDone` reveals the card, and a "Skip" button does the same at any time.
- **Don't** put any fact the guest needs (date, venue) only in the terminal. It is the overture, and readers using assistive technology get the same words from the card.
- Stays dark in both themes. With reduced motion on, every line prints at once.
