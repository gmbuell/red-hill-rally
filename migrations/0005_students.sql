-- A gift credits up to four Rockets: one row per student, replacing the
-- single classroom/student_name pair on donations. Links likewise hold a
-- list of students (JSON, entered order) plus an order/case-insensitive
-- signature so the same kids always get the same code.

CREATE TABLE donation_students (
  donation_id  TEXT NOT NULL,
  position     INTEGER NOT NULL,
  classroom    TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (donation_id, position)
);
CREATE INDEX idx_donation_students_classroom ON donation_students(classroom);

INSERT INTO donation_students (donation_id, position, classroom, student_name)
  SELECT id, 0, classroom, student_name FROM donations WHERE classroom != '';

DROP INDEX idx_donations_classroom;
ALTER TABLE donations DROP COLUMN classroom;
ALTER TABLE donations DROP COLUMN student_name;

ALTER TABLE links ADD COLUMN students  TEXT NOT NULL DEFAULT '[]';
ALTER TABLE links ADD COLUMN signature TEXT NOT NULL DEFAULT '';
UPDATE links SET
  students  = json_array(json_object('c', classroom, 'n', student_name)),
  signature = lower(json_array(json_object('c', classroom, 'n', student_name)));

DROP INDEX idx_links_student;
ALTER TABLE links DROP COLUMN student_name;
ALTER TABLE links DROP COLUMN classroom;
CREATE UNIQUE INDEX idx_links_signature ON links(signature);
