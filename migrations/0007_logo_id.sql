-- The opaque public id of a partner's auto-published logo (served at
-- /logo/<id>), or '' when none is published. Clearing it un-publishes
-- the logo without touching the stored file.
ALTER TABLE donations ADD COLUMN logo_id TEXT NOT NULL DEFAULT '';
