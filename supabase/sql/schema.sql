-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  receiver_name TEXT NOT NULL,
  receiver_upi TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  category TEXT DEFAULT 'General',
  risk_score INT,
  risk_level TEXT,
  ai_explanation TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message Analysis Table
CREATE TABLE IF NOT EXISTS analyzed_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  risk_score INT,
  verdict TEXT,
  flags JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE analyzed_messages;
