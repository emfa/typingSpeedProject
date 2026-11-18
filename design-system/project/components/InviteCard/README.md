# InviteCard

The invitation itself: an arch-topped card that carries the guest's lattice, the couple's names, the words of whoever invited them, and the facts.

- **You provide** a guest (`Qubool.guest({ name, from, line, note })`, where `from` is `k` or `j` and `line` is their one-liner's number) and the event: the couple's names, date, time, venue.
- **Order, top to bottom** the lattice in the arch · the Bismillah · the label with the invite hash · the names · the invitation, addressed by first name · the personal note, when there is one · When / Where · the sender's signature · the P.S. one-liner
- **Do** write the invitation in the sender's first person ("I am getting married") and sign it with their name, and keep the personal note to three lines.
- **Until the sender is known** (an open link where the guest has not yet said who invited them) the invitation says "We are getting married" and is signed "Kaif & Jabeen".
- **Do** set the Bismillah with `lang="ar" dir="rtl"`.
- **Don't** widen the card past 380px: `radius-arch` is half that width, and a wider card stops being an arch. On a phone it fills the width up to 380px.
- **Don't** add a second accent. `brass` marks the Bismillah, the ampersand, the hash and the signature, and nothing else.
