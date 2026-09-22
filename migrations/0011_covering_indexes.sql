-- D1 bills one row read per index entry and one more per table row an
-- index sends it to. The board and the home page walk both tables on
-- every view, so each read gets an index that carries every column the
-- query selects: one row read per row instead of two. The wide one on
-- donations serves the honor roll, the campaign totals, the partner
-- wall, and the donation side of the credits join.
CREATE INDEX idx_donation_students_credit
  ON donation_students(donation_id, position, classroom, student_name, shirts);
CREATE INDEX idx_donations_roll
  ON donations(created, id, donor_name, priority, partner_tier, amount_cents, visibility, logo_id);
CREATE INDEX idx_donations_priority_amount ON donations(priority, amount_cents);
DROP INDEX idx_donations_priority;
