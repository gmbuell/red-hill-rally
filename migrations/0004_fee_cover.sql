-- Optional donor-paid fee cover, recorded separately from the gift.
-- amount_cents stays the intended gift (what the board, campaign
-- totals, and circle tiers count); fee_cents is the extra the donor
-- chose to add so the PTA nets the full gift after card processing.
ALTER TABLE donations ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0;
