# GuestLink

One row per guest on the host's side: their seal, their name, their private link, and a button to copy it.

- **You provide** a guest's name, who invited them, and their one-liner's number. Their code is `k` or `j`, the name in lower case, and four signing characters (`k-naresh-0d90`); the link is the invite page's address, `#`, the code, and `-<line>` (`#k-naresh-0d90-3`). `Qubool.linkFor(code, line)` builds the part after `#`.
- **Assign the line** with `Qubool.nextLine(from, linesAlreadyGiven)` when the guest is added, so each of that sender's lines goes to as few people as possible. Store it with the guest; never change it once the link is sent.
- **Do** show the four characters in `brass`: they are what makes the link hard to guess from a name alone.
- **Do** send each person only their own link. A link opens that guest's card and their RSVP, nothing else.
- **Don't** print the full guest list on any page a guest can open.
