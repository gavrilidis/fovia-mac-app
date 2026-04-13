-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE activations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_key text NOT NULL UNIQUE,
  machine_id text NOT NULL,
  activated_at timestamptz DEFAULT now(),
  last_check timestamptz DEFAULT now()
);

ALTER TABLE activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert" ON activations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow select" ON activations FOR SELECT USING (true);
CREATE POLICY "Allow update" ON activations FOR UPDATE USING (true);
