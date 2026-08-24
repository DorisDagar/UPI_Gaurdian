/**
 * UPI Guardian - shared page chrome for every protected page
 * (dashboard, send money, scan & pay, payment requests, transactions,
 * message analyzer, insights, settings, help).
 *
 * Responsibilities:
 *  - Guard the page (redirect to login.html if not signed in)
 *  - Fill in #welcomeHeading / #userName / #userInitial from the
 *    signed-in user's profile
 *  - Wire the account dropdown + logout button
 *  - Wire the notification bell with a live, computed alert list
 *  - Auto-highlight the current page in the sidebar nav
 *
 * Include after js/auth.js on every protected page:
 *   <script src="js/page-chrome.js"></script>
 */
(function (window) {
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    highlightActiveNav();

    if (!window.UPIGuardianAuth || !window.UPIGuardianAuth.isConfigured()) {
      // Supabase not configured - let the page render in a read-only/demo state
      // rather than trap the user on a redirect loop.
      console.warn("[UPI Guardian] Supabase isn't configured - skipping auth guard.");
      window.UPIGuardianCurrentUser = null;
      document.dispatchEvent(new CustomEvent("upi-guardian:ready", { detail: { user: null } }));
      return;
    }

    const user = await window.UPIGuardianAuth.requireAuth();
    if (!user) return; // already redirected to login.html

    window.UPIGuardianCurrentUser = user;

    const fullName = (user.user_metadata && user.user_metadata.full_name) || "there";
    const firstName = fullName.split(" ")[0];

    const heading = document.getElementById("welcomeHeading");
    const userName = document.getElementById("userName");
    const userInitial = document.getElementById("userInitial");
    if (heading) heading.textContent = `${greeting()}, ${firstName}! 👋`;
    if (userName) userName.textContent = firstName;
    if (userInitial) userInitial.textContent = firstName.charAt(0).toUpperCase();

    wireDropdown("userMenu", "userDropdown");
    wireDropdown("notifBell", "notifDropdown");

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
      logoutButton.addEventListener("click", async (e) => {
        e.stopPropagation();
        await window.UPIGuardianAuth.signOut();
        window.location.href = "login.html";
      });
    }

    loadNotifications(user);

    document.dispatchEvent(new CustomEvent("upi-guardian:ready", { detail: { user } }));
  }

  function wireDropdown(triggerId, panelId) {
    const trigger = document.getElementById(triggerId);
    const panel = document.getElementById(panelId);
    if (!trigger || !panel) return;
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = panel.hidden;
      document.querySelectorAll(".user-dropdown, .notif-dropdown").forEach((p) => (p.hidden = true));
      panel.hidden = !willOpen;
    });
    document.addEventListener("click", () => {
      panel.hidden = true;
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
  }

  async function loadNotifications(user) {
    const badge = document.getElementById("notifBadge");
    const list = document.getElementById("notifList");
    if (!window.supabaseClient || !list) return;
    try {
      const { data, error } = await window.supabaseClient
        .from("transactions")
        .select("*")
        .in("risk_level", ["high", "medium"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      const rows = data || [];
      if (badge) {
        badge.textContent = rows.length;
        badge.hidden = rows.length === 0;
      }
      list.innerHTML = rows.length
        ? rows.map((tx) => {
            const fmt = window.TxUtils ? window.TxUtils.formatINR : (n) => "₹" + n;
            const when = window.TxUtils ? window.TxUtils.formatDate(tx.created_at) : "";
            return `<div class="notif-item ${tx.risk_level}">
              <i class="fa-solid ${tx.risk_level === "high" ? "fa-triangle-exclamation" : "fa-circle-exclamation"}"></i>
              <div><strong>${tx.risk_level === "high" ? "High risk" : "Flagged"} payment to ${escapeHtml(tx.payee_name)}</strong>
              <small>${fmt(tx.amount)} &middot; ${when}</small></div>
            </div>`;
          }).join("")
        : `<div class="notif-empty">You're all caught up - no risky activity flagged.</div>`;
    } catch (err) {
      console.warn("[UPI Guardian] Couldn't load notifications:", err.message || err);
      list.innerHTML = `<div class="notif-empty">Couldn't load notifications right now.</div>`;
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }

  function highlightActiveNav() {
    const here = window.location.pathname.split("/").pop() || "dashboard.html";
    document.querySelectorAll(".navigation a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (href === here) {
        a.classList.add("active");
      } else if (href !== "#") {
        a.classList.remove("active");
      }
    });
  }
})(window);
