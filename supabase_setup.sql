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

-- Table to store all generated license keys (run this if not already created)
CREATE TABLE IF NOT EXISTS license_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select keys" ON license_keys FOR SELECT USING (true);
CREATE POLICY "Allow insert keys" ON license_keys FOR INSERT WITH CHECK (true);
