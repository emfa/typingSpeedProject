-- Kaif & Jabeen reception: guests, replies and the event.
-- Times are ISO 8601 UTC strings. Guest names, notes and replies live only here, never in git.

CREATE TABLE guests (
  code            TEXT PRIMARY KEY,                 -- k-arjun-7hq2xm: sender, name slug, 6 random characters
  name            TEXT NOT NULL,                    -- as they should be greeted
  sender          TEXT NOT NULL CHECK (sender IN ('k', 'j')),
  note            TEXT NOT NULL DEFAULT '',         -- personal line from the sender, shown only to this guest
  line            INTEGER NOT NULL DEFAULT 0,       -- their P.S.: index into Qubool.lines[sender]
  position        INTEGER NOT NULL,                 -- order in the host's list
  sent_at         TEXT,                             -- when the host ticked the link as sent
  first_opened_at TEXT,
  last_opened_at  TEXT,
  opens           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  created_by      TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX guests_sender_name ON guests (sender, lower(name));

-- One current reply per guest (id = their code) or per open-link guest (id = o-<16 random>).
CREATE TABLE rsvps (
  id          TEXT PRIMARY KEY,
  guest_code  TEXT,                                 -- null for open-link replies
  name        TEXT NOT NULL,
  sender      TEXT NOT NULL CHECK (sender IN ('k', 'j')),
  coming      INTEGER NOT NULL CHECK (coming IN (0, 1)),
  seats       INTEGER NOT NULL,
  veg         INTEGER NOT NULL,
  nonveg      INTEGER NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  via         TEXT NOT NULL,                        -- web, terminal or curl
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  changes     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX rsvps_guest ON rsvps (guest_code);

-- Every version of every reply, never updated.
CREATE TABLE rsvp_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  rsvp_id  TEXT NOT NULL,
  name     TEXT NOT NULL,
  coming   INTEGER NOT NULL,
  seats    INTEGER NOT NULL,
  veg      INTEGER NOT NULL,
  nonveg   INTEGER NOT NULL,
  message  TEXT NOT NULL,
  via      TEXT NOT NULL,
  at       TEXT NOT NULL
);
CREATE INDEX rsvp_log_rsvp ON rsvp_log (rsvp_id);

-- Link-preview images, drawn by the host console in the browser.
CREATE TABLE previews (
  code        TEXT PRIMARY KEY,
  image       BLOB NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL                              -- JSON
);
INSERT INTO settings (key, value) VALUES
  ('event', '{"date":"2026-12-26","nikah":null,"reception":null,"lunch":null,"venue":null,"maps":"https://maps.app.goo.gl/9h6yuat4DQtRhneK7"}'),
  ('replies_open', 'true');

-- Rate limiting: one row per attempt, old rows pruned as new ones arrive.
CREATE TABLE throttle (
  bucket  TEXT NOT NULL,                            -- e.g. login:<hashed ip>
  at      INTEGER NOT NULL                          -- epoch milliseconds
);
CREATE INDEX throttle_bucket ON throttle (bucket, at);
