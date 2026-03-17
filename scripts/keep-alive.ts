import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function keepAlive() {
  const { count, error } = await supabase
    .from("clinics")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Keep-alive failed:", error.message);
    process.exit(1);
  }

  console.log(`Keep-alive OK — ${count} clinics — ${new Date().toISOString()}`);
}

keepAlive();
