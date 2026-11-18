# Schedule

The day in order, with each part marked as family-only or open to the guest.

An ordered list, `.q-schedule`, one `li` per part: a `time`, a heading with one line under it, and a `.q-tag`.

- **You provide** the time, the name of the part, one sentence, and whether the guest is invited to it. Show times in 12-hour form ("12:30 PM"), the same as the card's When line, with `datetime` set; "Morning" or "TBA" until a time is fixed. The time column is 72px, wide enough for "12:30 PM".
- **Do** list the nikah even though guests are not attending it: mark the row `data-private` and tag it "Family only". It tells colleagues why the invite starts at lunch, and asks for their duas.
- **Do** tag the parts they are invited to with `.q-tag q-tag-on`.
- **Don't** add rows beyond the three parts of the day.
