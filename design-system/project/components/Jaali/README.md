# Jaali

A lattice drawn from the guest's name: the same name always draws the same pattern, and a different name draws a different one.

Call `Qubool.jaaliSVG(name, { width, height, cell })` and put the returned svg inside a box that sets the shape: `.q-card-arch` for the card, `.q-seal` for a 96px disc, `.q-seal q-seal-small` for 40px. The box supplies the `emerald` field; lines are `gilt`.

- **You provide** the guest's full name as written in the guest list, and a box with a size. `cell` is the repeat distance: 56–64 for the card, 44 on a seal, 26 on a small seal.
- **How it varies** the name is hashed; the hash picks one of four tilings (4.4.4.4, 4.8.8, 6.6.6, 3.6.3.6), a contact angle, an optional split, and whether lines are drawn as hollow strapwork. `Qubool.jaaliParams(name)` returns those values for display.
- **Do** use one lattice per guest, the same one everywhere that guest appears (card, link row, host table).
- **Don't** recolour it, animate it, or place text over it. It is ornament and is hidden from screen readers.
- On a ground other than `emerald`, set `--q-jaali-ground` on the box so strapwork cuts to the right colour.
