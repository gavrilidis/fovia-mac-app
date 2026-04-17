-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE activations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_key text NOT NULL UNIQUE,
  machine_id text NOT NULL,
  activated_at timestamptz DEFAULT now(),
  last_check timestamptz DEFAULT now()
);

ALTER TABLE activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny anon insert" ON activations FOR INSERT WITH CHECK (false);
CREATE POLICY "Deny anon select" ON activations FOR SELECT USING (false);
CREATE POLICY "Deny anon update" ON activations FOR UPDATE USING (false);

-- Table to store all generated license keys (run this if not already created)
CREATE TABLE IF NOT EXISTS license_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_key text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny anon select keys" ON license_keys FOR SELECT USING (false);
CREATE POLICY "Deny anon insert keys" ON license_keys FOR INSERT WITH CHECK (false);
