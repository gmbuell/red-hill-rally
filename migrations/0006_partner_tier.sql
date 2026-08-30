-- Business partnerships bought online: the PARTNER_TIERS id ('friend',
-- 'supporter', 'champion', 'mvp'), or '' for family gifts. Partner rows
-- count in campaign dollars but not the family-gift tally, and carry no
-- classroom credit.
ALTER TABLE donations ADD COLUMN partner_tier TEXT NOT NULL DEFAULT '';
