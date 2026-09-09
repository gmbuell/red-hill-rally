-- Rally shirts bought with a gift, one size code per shirt, comma-joined
-- ('YM,AL'), on the Rocket the shirts are for. Their fundraising share
-- is already inside donations.amount_cents; this column feeds the
-- printer's report and the per-Rocket split of the student sheet.
ALTER TABLE donation_students ADD COLUMN shirts TEXT NOT NULL DEFAULT '';
