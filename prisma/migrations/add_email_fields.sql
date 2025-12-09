-- Migration: Add email fields to deals table
-- Run this migration to add buyer_email and seller_email columns to the deals table

-- Add buyer_email column
ALTER TABLE artha.deals 
ADD COLUMN IF NOT EXISTS buyer_email TEXT;

-- Add seller_email column
ALTER TABLE artha.deals 
ADD COLUMN IF NOT EXISTS seller_email TEXT;

-- Add indexes for email fields (optional, for faster queries)
CREATE INDEX IF NOT EXISTS deals_buyer_email_idx ON artha.deals(buyer_email) WHERE buyer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_seller_email_idx ON artha.deals(seller_email) WHERE seller_email IS NOT NULL;

