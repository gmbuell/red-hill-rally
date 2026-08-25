-- Billing contact details from Stripe's checkout page (the webhook
-- session's customer_details). Address is complete because checkout
-- runs with billing_address_collection=required. Same privacy rule as
-- student_name and email: PTA-backend-only, never selected into public
-- campaign stats, exported only through the admin CSV.
ALTER TABLE donations ADD COLUMN billing_name TEXT NOT NULL DEFAULT '';
ALTER TABLE donations ADD COLUMN address_line1 TEXT NOT NULL DEFAULT '';
ALTER TABLE donations ADD COLUMN address_line2 TEXT NOT NULL DEFAULT '';
ALTER TABLE donations ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE donations ADD COLUMN state TEXT NOT NULL DEFAULT '';
ALTER TABLE donations ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE donations ADD COLUMN country TEXT NOT NULL DEFAULT '';
