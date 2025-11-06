SET search_path TO artha, public;

ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence_select_own_rows" ON evidence;
CREATE POLICY "evidence_select_own_rows" ON evidence
FOR SELECT
TO authenticated, anon
USING (
  EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = evidence.submitted_by
      AND u.wallet_address = auth.jwt() ->> 'wallet_address'
  )
  OR EXISTS (
    SELECT 1
    FROM deals
    WHERE deals.id = evidence.deal_id
      AND (
        deals.buyer_wallet = auth.jwt() ->> 'wallet_address'
        OR deals.seller_wallet = auth.jwt() ->> 'wallet_address'
      )
  )
);

DROP POLICY IF EXISTS "evidence_service_write" ON evidence;
CREATE POLICY "evidence_service_write" ON evidence
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
