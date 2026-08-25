-- Short student links: memorable adjective-animal codes (e.g.
-- sunny-otter) stored server-side, replacing the long signed tokens.
-- One code per student+classroom — re-creating returns the same code.
-- Student names here follow the site privacy model: shown only to
-- people who have the link (or guess a code); never listed publicly.
CREATE TABLE links (
  code TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  classroom TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_links_student ON links (classroom, lower(student_name));
