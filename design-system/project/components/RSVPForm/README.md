# RSVPForm

The reply: yes or no, how many seats, and how many of those plates are vegetarian.

- **You provide** the guest's first name for the question, the most seats one reply may ask for (four on the live invite), and a handler for the submitted record `{ slug, name, from, coming, seats, veg, nonveg, message }`.
- **One seat** asks "Your lunch" as a Veg / Non-veg choice. **More than one seat** asks how many are vegetarian and shows the split, so the caterer gets plate counts, not preferences.
- The `.q-echo` line under the form writes the reply as a command (`rsvp --qubool --seats 2 --veg 1 --nonveg 1`) as the guest fills it in. It repeats what the controls say; it is never the only place a value appears.
- **Do** keep "Send RSVP" disabled until the answer is complete, and after sending show what was recorded with "Change my answer".
- **Do** let a guest change their answer from the same link until the host closes replies. Where replies go to a form, each send is a new row and the newest one per code counts.
- **When the reply opens in another tab** (a form), the page cannot see whether it was recorded. Ask "Did the new tab say your response was recorded?" with "Yes, it was recorded" and "No, take me back"; only "Yes" marks the reply as sent.
- **Don't** ask for a phone or email. On a personal link don't ask for a name either: the link already says who they are. On an open link, ask for their name and, unless the link says, who invited them.
- "Qubool hai" is the yes. If the family would rather not use the phrase here, the label becomes "Yes, I'm in" and nothing else changes.
