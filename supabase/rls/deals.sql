SET search_path TO artha, public;

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_select_own_wallet" ON deals;
CREATE POLICY "deals_select_own_wallet" ON deals
FOR SELECT
TO authenticated, anon
USING (
  COALESCE(auth.jwt() ->> 'wallet_address', '') <> ''
  AND (
    buyer_wallet = auth.jwt() ->> 'wallet_address'
    OR seller_wallet = auth.jwt() ->> 'wallet_address'
  )
);

DROP POLICY IF EXISTS "deals_service_write" ON deals;
CREATE POLICY "deals_service_write" ON deals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
