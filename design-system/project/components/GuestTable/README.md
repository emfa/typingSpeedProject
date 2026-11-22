# GuestTable

The host's view: totals for the caterer on top, then every guest with their answer, seats, plates and note.

- **You provide** the RSVP records: `{ name, from, answer, seats, veg, at, message }`, where `from` is `k` or `j` and `answer` is `yes`, `no` or not yet given.
- **Used on the live host console** (`/host`), where each row also carries the guest's link with Copy link and Copy message, a sent tick, a note and Remove. From 1280px the two copy buttons sit side by side; below that they stack and the table scrolls inside its frame.
- **Totals, in this order** seats to set · veg plates · non-veg plates · said yes out of invited · yet to reply · opened, no reply. The first three are what the caterer asks for; the last is who to nudge.
- **Do** keep "Export CSV" in the header; the file has one row per guest and a column for each of the above.
- **Do** show people who have not replied; that list is who to nudge.
- **Do** make each guest's name the header of their row (`<th scope="row">`) and name each row's buttons with the guest ("Remove Arjun Mehta"), so a screen reader always knows whose row it is in.
- **Don't** put this view behind a guest link. It is for the host only.
