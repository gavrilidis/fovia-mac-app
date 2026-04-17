import { createClient } from "npm:@supabase/supabase-js@2";

interface ActivationRequest {
  serial_key: string;
  machine_id: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json(200, { ok: true });
  }
  if (req.method !== "POST") {
    return json(405, { valid: false, error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { valid: false, error: "Supabase service role is not configured" });
  }

  const body = (await req.json().catch(() => null)) as ActivationRequest | null;
  const serialKey = body?.serial_key?.trim();
  const machineId = body?.machine_id?.trim();
  if (!serialKey || !machineId) {
    return json(400, { valid: false, error: "serial_key and machine_id are required" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: keyRow, error: keyError } = await admin
    .from("license_keys")
    .select("serial_key")
    .eq("serial_key", serialKey)
    .maybeSingle();
  if (keyError) {
    return json(500, { valid: false, error: keyError.message });
  }
  if (!keyRow) {
    return json(200, { valid: false });
  }

  const { data: activationRow, error: activationReadError } = await admin
    .from("activations")
    .select("machine_id, activated_at")
    .eq("serial_key", serialKey)
    .maybeSingle();
  if (activationReadError) {
    return json(500, { valid: false, error: activationReadError.message });
  }
  if (activationRow && activationRow.machine_id !== machineId) {
    return json(200, { valid: false });
  }

  const now = new Date().toISOString();
  // Keep first activation timestamp stable across re-activations on the same machine.
  const activatedAt = activationRow?.activated_at ?? now;
  const { error: upsertError } = await admin.from("activations").upsert(
    {
      serial_key: serialKey,
      machine_id: machineId,
      activated_at: activatedAt,
      last_check: now,
    },
    { onConflict: "serial_key" },
  );
  if (upsertError) {
    return json(500, { valid: false, error: upsertError.message });
  }

  return json(200, {
    valid: true,
    activated_at: activatedAt,
    expires_check: now,
  });
});
