SET search_path TO artha, public;

ALTER TABLE onchain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onchain_events_select_own_deals" ON onchain_events;
CREATE POLICY "onchain_events_select_own_deals" ON onchain_events
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM deals
    WHERE deals.id = onchain_events.deal_id
      AND (
        deals.buyer_wallet = auth.jwt() ->> 'wallet_address'
        OR deals.seller_wallet = auth.jwt() ->> 'wallet_address'
      )
  )
);

DROP POLICY IF EXISTS "onchain_events_service_write" ON onchain_events;
CREATE POLICY "onchain_events_service_write" ON onchain_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
