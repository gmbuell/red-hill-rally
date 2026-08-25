-- Donation records. One row per Stripe checkout session; id is the
-- session id so webhook retries insert-or-ignore. student_name and
-- email are PTA-backend-only: they must never be selected into any
-- public API response (only /api/export.csv reads them).
CREATE TABLE donations (
  id TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT '',
  classroom TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  donor_name TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  email TEXT NOT NULL DEFAULT '',
  employer_match INTEGER NOT NULL DEFAULT 0,
  via_link INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

CREATE INDEX idx_donations_priority ON donations(priority);
CREATE INDEX idx_donations_classroom ON donations(classroom);
CREATE INDEX idx_donations_created ON donations(created);
