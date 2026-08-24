/**
 * UPI Guardian - Supabase connection
 * -----------------------------------------------------------------
 * 1. Go to your Supabase project -> Project Settings -> API.
 * 2. Copy the "Project URL" and the "anon public" key (NOT the
 *    service_role key - that one must never be used in frontend code).
 * 3. Paste them below.
 * 4. Run schema.sql once in the Supabase SQL Editor to create the
 *    `transactions` and `profiles` tables (profiles powers the
 *    login/sign up screens in js/auth.js).
 * -----------------------------------------------------------------
 */
const SUPABASE_URL = "https://mdfjruikqgjobracoirr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MjQPiKliUC6h39BoaX0GCQ_EfvCi3ME";

// Shared client used across every page (loaded after the Supabase CDN script).
window.supabaseClient = (SUPABASE_URL.includes("YOUR-PROJECT-REF") || SUPABASE_ANON_KEY.includes("YOUR-ANON"))
  ? null
  : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (!window.supabaseClient) {
  console.warn(
    "[UPI Guardian] Supabase isn't configured yet. Add your Project URL " +
    "and anon key to js/supabase-config.js to enable live data."
  );
}
