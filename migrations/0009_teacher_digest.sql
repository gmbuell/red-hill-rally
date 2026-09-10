-- The Thursday classroom digest: who it goes to, and what has already
-- gone out.
--
-- Addresses are typed into Mission Control rather than committed to the
-- repo: they are staff email, and this repository is public.
CREATE TABLE IF NOT EXISTS teacher_emails (
  classroom TEXT PRIMARY KEY,
  email     TEXT NOT NULL,
  updated   INTEGER NOT NULL
);

-- One row per classroom per send. The (classroom, week) key is what
-- makes the cron safe to run twice: Cloudflare can retry a scheduled
-- event, and a retry must not mail every teacher a second time.
-- `week` is the UTC date of the send's Monday, so a week has one row.
CREATE TABLE IF NOT EXISTS digest_log (
  classroom TEXT NOT NULL,
  week      TEXT NOT NULL,
  sent      INTEGER NOT NULL,
  status    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (classroom, week)
);
