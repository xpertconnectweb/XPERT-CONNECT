import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A paused/deleted Supabase project stops resolving in DNS, so fetch throws
// "fetch failed" (ENOTFOUND). Surface that explicitly — the keep-alive cannot
// wake a paused project; it must be restored manually from the dashboard.
function isUnreachable(message: string): boolean {
  return /fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|network/i.test(message);
}

async function keepAlive() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { count, error } = await supabase
      .from("clinics")
      .select("*", { count: "exact", head: true });

    if (!error) {
      console.log(
        `Keep-alive OK — ${count} clinics — ${new Date().toISOString()}`
      );
      return;
    }

    const transient = isUnreachable(error.message);
    console.error(
      `Keep-alive attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}`
    );

    if (attempt < MAX_ATTEMPTS && transient) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (transient) {
      console.error(
        "Host unreachable after retries. The Supabase project is likely PAUSED " +
          "or deleted (its subdomain no longer resolves). Restore it from " +
          "https://supabase.com/dashboard — the keep-alive cannot wake a paused project."
      );
    }
    process.exit(1);
  }
}

keepAlive();
