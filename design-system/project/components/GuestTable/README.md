# GuestTable

The host's view: totals for the caterer on top, then every guest with their answer, seats, plates and note.

- **You provide** the RSVP records: `{ name, from, answer, seats, veg, at, message }`, where `from` is `k` or `j` and `answer` is `yes`, `no` or not yet given.
- **Not yet on the live host console**, which tracks links sent, not replies; it is the target for when replies are stored somewhere it can read.
- **Totals, in this order** seats to set · veg plates · non-veg plates · said yes out of invited · yet to reply. The first three are what the caterer asks for.
- **Do** keep "Export CSV" in the header; the file has one row per guest and a column for each of the above.
- **Do** show people who have not replied; that list is who to nudge.
- **Don't** put this view behind a guest link. It is for the host only.
