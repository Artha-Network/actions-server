SET search_path TO artha, public;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_wallet" ON users;
CREATE POLICY "users_select_own_wallet" ON users
FOR SELECT
TO authenticated, anon
USING (
  wallet_address IS NOT NULL
  AND wallet_address = COALESCE(auth.jwt() ->> 'wallet_address', '')
);

DROP POLICY IF EXISTS "users_service_write" ON users;
CREATE POLICY "users_service_write" ON users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
