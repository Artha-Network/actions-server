-- Frontend Analytics Events Table
-- This table stores user interaction events from the frontend for analytics

CREATE TABLE IF NOT EXISTS frontend_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_id TEXT,
    deal_id TEXT,
    case_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_frontend_events_user_id ON frontend_events(user_id);
CREATE INDEX IF NOT EXISTS idx_frontend_events_deal_id ON frontend_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_frontend_events_timestamp ON frontend_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_frontend_events_event_type ON frontend_events(event_type);

-- RLS (Row Level Security) - Optional, can be enabled if needed
-- ALTER TABLE frontend_events ENABLE ROW LEVEL SECURITY;

-- Sample policy (commented out - enable if you need user isolation)
-- CREATE POLICY "Users can read their own events" ON frontend_events
--     FOR SELECT USING (user_id = auth.jwt() ->> 'sub');

-- Grant access to service role
-- GRANT ALL ON frontend_events TO service_role;