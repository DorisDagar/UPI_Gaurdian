/**
 * UPI Guardian - Shared Authentication Helper
 * -----------------------------------------------------------------
 * Wraps Supabase Auth so every page (login, sign up, dashboard,
 * send money, transactions, message analyzer) shares one consistent
 * way to sign up, sign in, sign out, and guard protected pages.
 *
 * IMPORTANT - about the "mobile number" login:
 * Supabase Auth needs an email (or real OTP-verified phone number) to
 * create an account. Since this app's UI only collects a 10-digit
 * mobile number + password, we deterministically turn that mobile
 * number into a synthetic email address:
 *
 *     9876543210  ->  91-9876543210@upiguardian.local
 *
 * This keeps the existing "Mobile Number" UI unchanged while still
 * using Supabase's real, secure email/password auth under the hood.
 * The user's real name + mobile number are stored in the account's
 * user_metadata (and mirrored to a `profiles` row - see
 * supabase/schema.sql) so pages can greet the user by name.
 *
 * ONE-TIME SUPABASE PROJECT SETTING:
 * Because the email above isn't a real inbox, go to
 * Supabase Dashboard -> Authentication -> Providers -> Email and turn
 * OFF "Confirm email". Otherwise new accounts will be stuck waiting
 * on a confirmation email that can never arrive.
 * -----------------------------------------------------------------
 */
(function (window) {
  const EMAIL_DOMAIN = "upiguardian.local";

  function client() {
    return window.supabaseClient || null;
  }

  function isConfigured() {
    return !!client();
  }

  /** Turn a 10-digit mobile number into the synthetic email Supabase Auth uses internally. */
  function mobileToEmail(mobile) {
    const digits = String(mobile || "").replace(/\D/g, "");
    return `91-${digits}@${EMAIL_DOMAIN}`;
  }

  function friendlyError(error) {
    if (!error) return "Something went wrong. Please try again.";
    const msg = error.message || String(error);
    if (/already registered|already exists/i.test(msg)) {
      return "An account with this mobile number already exists. Try logging in instead.";
    }
    if (/invalid login credentials/i.test(msg)) {
      return "Incorrect mobile number or password.";
    }
    if (/password.*at least|should be at least/i.test(msg)) {
      return "Password must be at least 6 characters.";
    }
    if (/network/i.test(msg)) {
      return "Network error. Check your connection and try again.";
    }
    return msg;
  }

  /** Create a new account. Returns { ok, session, error } */
  async function signUp({ fullName, mobile, password }) {
    if (!isConfigured()) {
      return { ok: false, error: "Supabase isn't configured yet. Add your project URL and anon key to js/supabase-config.js." };
    }
    const email = mobileToEmail(mobile);
    const { data, error } = await client().auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          mobile: mobile,
        },
      },
    });

    if (error) return { ok: false, error: friendlyError(error) };

    // Best-effort mirror into the profiles table (safe to ignore failures -
    // a DB trigger can also do this server-side, see supabase/schema.sql).
    if (data.user) {
      try {
        await client().from("profiles").upsert({
          id: data.user.id,
          full_name: fullName,
          mobile: mobile,
        });
      } catch (_) {
        /* profiles table is optional - ignore if it doesn't exist yet */
      }
    }

    return { ok: true, session: data.session, needsConfirmation: !data.session };
  }

  /** Log in with mobile number + password. Returns { ok, session, error } */
  async function signIn({ mobile, password }) {
    if (!isConfigured()) {
      return { ok: false, error: "Supabase isn't configured yet. Add your project URL and anon key to js/supabase-config.js." };
    }
    const email = mobileToEmail(mobile);
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, session: data.session };
  }

  async function signOut() {
    if (!isConfigured()) return;
    await client().auth.signOut();
  }

  async function getSession() {
    if (!isConfigured()) return null;
    const { data } = await client().auth.getSession();
    return data.session || null;
  }

  async function getCurrentUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  /**
   * Call at the top of any protected page (dashboard, send money,
   * transactions, message analyzer). Redirects to login.html if
   * there's no active session, and returns the user when there is.
   */
  async function requireAuth() {
    if (!isConfigured()) {
      console.warn("[UPI Guardian] Supabase isn't configured - skipping auth guard.");
      return null;
    }
    const session = await getSession();
    if (!session) {
      const here = window.location.pathname.split("/").pop();
      window.location.href = `login.html${here ? `?redirect=${encodeURIComponent(here)}` : ""}`;
      return null;
    }
    return session.user;
  }

  /** Call on login/signup pages: if already logged in, skip straight to the dashboard. */
  async function redirectIfAuthed(target) {
    if (!isConfigured()) return;
    const session = await getSession();
    if (session) {
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("redirect") || target || "dashboard.html";
    }
  }

  window.UPIGuardianAuth = {
    mobileToEmail,
    signUp,
    signIn,
    signOut,
    getSession,
    getCurrentUser,
    requireAuth,
    redirectIfAuthed,
    isConfigured,
  };
})(window);
