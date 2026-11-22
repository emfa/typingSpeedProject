# GuestLink

One row per guest on the host's side: their seal, their name, their private link, and a button to copy it.

- **You provide** a guest's name, who invited them, and their one-liner's number. Their code is made when they are added: `k` or `j`, the name in lower case, and six random characters (`k-naresh-x7q2pa`); the link is the site's address and the code (`kaifwedsjabeen.in/k-naresh-x7q2pa`).
- **Assign the line** with `Qubool.nextLine(from, linesAlreadyGiven)` when the guest is added, so each of that sender's lines goes to as few people as possible. Store it with the guest; never change it once the link is sent.
- **Do** show the six random characters in `brass`: they are what makes the link impossible to guess from a name.
- **Do** send each person only their own link. A link opens that guest's card and their RSVP, nothing else.
- **Don't** print the full guest list on any page a guest can open.
