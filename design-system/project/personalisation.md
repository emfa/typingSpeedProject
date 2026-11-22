# Personalisation

What changes from one guest's link to the next, and the records behind it.

## The guest record

The host writes one record per guest before sending anything.

| field | example | used for |
| --- | --- | --- |
| `name` | Priya Nair | the greeting, the lattice, the invite hash, the link |
| `from` | k | who invited them: `k` for Kaif, `j` for Jabeen |
| `line` | 3 | which of the sender's one-liners closes the card. Assigned once, when the guest is added, by `Qubool.nextLine` so lines spread evenly |
| `note` | You reviewed my worst pull requests without judgment. | optional; a personal line in the host's own words. The card leaves the space out when there is none |

`Qubool.guest(record)` returns everything derived from it: `first`, `sender`, `sha`, `quip`, and the lattice settings. Its `slug` is the guest's code, passed through from the record: the Worker mints codes, the design system never does.

## What each guest sees that nobody else does

- **Their name** in the terminal login and the card's greeting.
- **Their lattice** in the arch of the card, drawn from their name.
- **Their invite hash**, seven characters, on the card under When and Where.
- **Their note**, when the host has written one. This is the part people remember; even one sentence is worth it.
- **Their P.S.**, one line from the sender's set: 16 engineering lines for Kaif's guests (`Qubool.lines.k`), 10 plain warm ones for Jabeen's (`Qubool.lines.j`). The host console hands out the least-used line, so with 38 guests each of Kaif's lines goes to two or three people. A link without a line number falls back to a pick from the name's hash, which clumps. Add lines at the end of a list, never in the middle: a guest's line number points into it.
- **The signature**: Kaif's or Jabeen's.

## The link

The site's address, then the guest's code: `kaifwedsjabeen.in/k-naresh-x7q2pa`. The code is made when the host adds the guest, and it never changes once the link is sent. It has three parts:

- `k` or `j`: who invited them, Kaif or Jabeen. It sets the voice, the sign-off and which set of one-liners is used.
- the name in lower case with hyphens.
- six random characters, so nobody can guess a link from a name.

The guest list lives with the site, not in the page. Only a code on that list opens an invite or takes a reply; any other address shows "Invite not found". There are no open links: someone not on the list is added by a host and sent their own link. If two guests of the same host share a name, add a surname or initial to one so their greetings and lattices differ.

## The RSVP record

One per guest, replaced each time they change their answer.

| field | values |
| --- | --- |
| `slug` | the guest's code |
| `from` | Kaif or Jabeen |
| `coming` | `yes` or `no` |
| `seats` | 1 to 4; 0 when not coming |
| `veg`, `nonveg` | plate counts that add up to `seats` |
| `message` | optional, up to 140 characters |
| `at` | when it was last sent |

## Rules

- A guest's page never lists other guests or their answers.
- The host's table is not reachable from any guest link.
- Do not put phone numbers or email addresses in a guest record; the invite does not need them.
