/**
 * UPI Guardian - Dashboard page logic.
 * Wires the "Try Demo" buttons, the "Check Receiver" quick action,
 * and pulls real numbers (safety score, transactions analyzed, money
 * saved, recent transactions) from Supabase.
 */
(function () {
  document.addEventListener("DOMContentLoaded", () => {
    wireDemoButtons();
    wireCheckReceiver();
  });

  // Wait for page-chrome to finish the auth guard before hitting the DB.
  document.addEventListener("upi-guardian:ready", (e) => {
    if (e.detail && e.detail.user) {
      loadDashboardData();
    } else {
      renderNoData();
    }
  });

  function wireDemoButtons() {
    document.querySelectorAll(".demo-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (window.UPIGuardianDemos) window.UPIGuardianDemos.runDemo(btn.dataset.demo);
      });
    });
  }

  function wireCheckReceiver() {
    const action = document.getElementById("checkReceiverAction");
    if (!action) return;
    action.addEventListener("click", async () => {
      const modalRef = window.UIKit.modal({
        title: "Check Receiver",
        bodyHtml: `
          <p style="margin-bottom:14px;">Enter a UPI ID to see if you've paid it before and whether it looks safe.</p>
          <div class="form-field">
            <label for="checkUpiInput">UPI ID</label>
            <input id="checkUpiInput" type="text" placeholder="e.g. name@bank" autocomplete="off">
          </div>
          <div id="checkReceiverResult" style="margin-top:14px;"></div>
        `,
        actions: [
          { label: "Check", variant: "primary", closeOnClick: false, onClick: async () => {
              const val = document.getElementById("checkUpiInput").value.trim();
              const out = document.getElementById("checkReceiverResult");
              if (!val) { out.innerHTML = `<p style="color:#c62828;font-size:13px;">Enter a UPI ID first.</p>`; return; }
              out.innerHTML = `<p style="font-size:13px;color:#8a93a6;"><i class="fa-solid fa-circle-notch fa-spin"></i> Checking…</p>`;
              const history = await fetchHistory();
              const result = window.RiskEngine.assessTransactionRisk({ payeeName: val, upiId: val, amount: 0, history });
              const matches = history.filter((t) => (t.upi_id || "").toLowerCase() === val.toLowerCase());
              out.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">${window.UIKit.riskBadge(result.isNewReceiver ? "medium" : "low")}
                  <span style="font-size:13px;color:#4b5563;">${matches.length ? `You've paid this UPI ID ${matches.length} time(s) before.` : "No past payments found to this UPI ID."}</span>
                </div>`;
            } },
          { label: "Close", variant: "ghost" },
        ],
      });
      setTimeout(() => { const el = document.getElementById("checkUpiInput"); if (el) el.focus(); }, 50);
    });
  }

  async function fetchHistory() {
    if (!window.supabaseClient) return [];
    try {
      const { data, error } = await window.supabaseClient.from("transactions").select("*").eq("status", "success");
      if (error) throw error;
      return data || [];
    } catch (_) {
      return [];
    }
  }

  async function loadDashboardData() {
    if (!window.supabaseClient) { renderNoData(); return; }
    try {
      const { data, error } = await window.supabaseClient
        .from("transactions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      renderStats(rows);
      renderRecent(rows.filter((t) => t.status !== "blocked").slice(0, 5));
    } catch (err) {
      console.error(err);
      renderNoData();
    }
  }

  function renderStats(rows) {
    const completed = rows.filter((t) => t.status === "success");
    const blocked = rows.filter((t) => t.status === "blocked");
    const highCompleted = completed.filter((t) => t.risk_level === "high").length;
    const mediumCompleted = completed.filter((t) => t.risk_level === "medium").length;
    const moneySaved = blocked.reduce((s, t) => s + Number(t.amount || 0), 0);

    let score = 100 - highCompleted * 8 - mediumCompleted * 3 + Math.min(blocked.length * 2, 10);
    score = Math.max(35, Math.min(100, Math.round(score)));

    const label = score >= 80 ? "Very Safe" : score >= 55 ? "Good, stay alert" : "Needs attention";
    const note = score >= 80
      ? "Great! You're making<br>safe payment decisions."
      : score >= 55
      ? "A few risky payments went<br>through - review your history."
      : "Several high-risk payments<br>detected. Please review them.";

    setHtml("statSafetyScore", `${score} <small>/100</small>`);
    setText("statSafetyLabel", label);
    setHtml("statSafetyNote", note);
    setText("statAnalyzed", String(rows.length));
    setHtml("statMoneySaved", window.TxUtils.formatINR(moneySaved));
  }

  function renderRecent(rows) {
    const el = document.getElementById("recentTxList");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = `<div class="state-block" style="padding:26px 10px;">
        <i class="fa-solid fa-receipt"></i>
        <p>No transactions yet.</p>
        <a class="btn btn-primary btn-sm" href="sendMoney.html">Send your first payment</a>
      </div>`;
      return;
    }
    el.innerHTML = rows.map(window.TxUtils.transactionRowHtml).join("");
  }

  function renderNoData() {
    const el = document.getElementById("recentTxList");
    if (el) el.innerHTML = `<div class="state-block" style="padding:26px 10px;"><i class="fa-solid fa-plug-circle-xmark"></i><p>Couldn't load live data right now.</p></div>`;
  }

  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function setHtml(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
})();
