-- "Email me my Rocket link" asks the site to send a donor the thank-you
-- links for gifts they already made. The endpoint is public and it
-- sends mail, so it keeps a cooldown per address.
--
-- The address is stored hashed. The donations table already holds the
-- real thing; there is no reason for a second copy of the donor list to
-- exist, and a hash is all a cooldown needs.
CREATE TABLE IF NOT EXISTS link_requests (
  email_hash TEXT PRIMARY KEY,
  sent       INTEGER NOT NULL
);
