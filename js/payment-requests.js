/**
 * UPI Guardian - Payment Requests page logic.
 * Since there's no real UPI network to receive collect requests from,
 * "Simulate Incoming Request" generates a realistic one (sometimes
 * legit, sometimes a scam) so the approve/decline flow - and the
 * fraud warnings on suspicious ones - are fully exercised.
 */
(function () {
  let currentUser = null;
  let requests = [];

  const SAMPLE_REQUESTS = [
    { requester_name: "Rahul Kumar", requester_upi: "rahul123@upi", amount: 300, note: "Splitting dinner bill", is_suspicious: false },
    { requester_name: "Flipkart Merchant", requester_upi: "flipkart.merchant@apl", amount: 899, note: "Cash on delivery adjustment", is_suspicious: false },
    { requester_name: "\"Refund Desk\"", requester_upi: "refund-verify@fraud", amount: 1, note: "Pay ₹1 to receive your ₹5,000 refund instantly", is_suspicious: true },
    { requester_name: "\"KYC Support\"", requester_upi: "kyc-update-sbi@upi", amount: 10, note: "KYC re-verification fee - account will be blocked otherwise", is_suspicious: true },
    { requester_name: "\"Lucky Winner Cell\"", requester_upi: "claim-prize@upi", amount: 499, note: "Processing fee to claim your lottery prize", is_suspicious: true },
    { requester_name: "Landlord", requester_upi: "landlord.rent@okhdfc", amount: 15000, note: "Monthly rent", is_suspicious: false },
  ];

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("newRequestBtn").addEventListener("click", simulateRequest);
  });

  document.addEventListener("upi-guardian:ready", (e) => {
    currentUser = e.detail && e.detail.user;
    if (currentUser) loadRequests();
    else renderError("Supabase isn't connected - Payment Requests need a live database.");
  });

  async function loadRequests() {
    try {
      const { data, error } = await window.supabaseClient
        .from("payment_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      requests = data || [];
      render();
    } catch (err) {
      renderError("Couldn't load payment requests (" + (err.message || "unknown error") + "). Run the latest schema.sql in Supabase if this table doesn't exist yet.");
    }
  }

  async function simulateRequest() {
    if (!currentUser) return;
    const sample = SAMPLE_REQUESTS[Math.floor(Math.random() * SAMPLE_REQUESTS.length)];
    try {
      const { error } = await window.supabaseClient.from("payment_requests").insert({
        user_id: currentUser.id, ...sample, status: "pending",
      });
      if (error) throw error;
      window.UIKit.toast("New payment request received.", "info");
      loadRequests();
    } catch (err) {
      window.UIKit.toast("Couldn't create a sample request: " + (err.message || "unknown error"), "error");
    }
  }

  function render() {
    const list = document.getElementById("requestsList");
    const count = document.getElementById("reqCount");
    count.textContent = requests.length + (requests.length === 1 ? " request" : " requests");

    if (!requests.length) {
      list.innerHTML = `<div class="state-block"><i class="fa-solid fa-clipboard-list"></i><p>No payment requests yet.</p></div>`;
      return;
    }

    list.innerHTML = requests.map((r) => {
      const statusPill = r.status === "pending" ? "" : `<span class="pill ${r.status === "approved" ? "neutral" : "success"}">${r.status}</span>`;
      const suspiciousPill = r.is_suspicious ? `<span class="pill high"><i class="fa-solid fa-triangle-exclamation"></i> Looks suspicious</span>` : `<span class="pill low">Looks legitimate</span>`;
      return `
      <div class="data-row" data-id="${r.id}">
        <div class="who">
          <strong>${escapeHtml(r.requester_name)}</strong>
          <small>${escapeHtml(r.requester_upi)}${r.note ? " &middot; " + escapeHtml(r.note) : ""}</small>
        </div>
        <div>${suspiciousPill}</div>
        <div class="amt">${window.TxUtils.formatINR(r.amount)}</div>
        <div style="display:flex;gap:8px;">
          ${r.status === "pending"
            ? `<button class="btn btn-primary btn-sm approve-btn">Approve</button><button class="btn btn-ghost btn-sm decline-btn">Decline</button>`
            : statusPill}
        </div>
      </div>`;
    }).join("");

    list.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => openApprove(rowId(e)));
    });
    list.querySelectorAll(".decline-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => decline(rowId(e)));
    });
  }

  function rowId(e) {
    return e.target.closest(".data-row").dataset.id;
  }

  function openApprove(id) {
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    const result = window.RiskEngine.assessTransactionRisk({
      payeeName: req.requester_name, upiId: req.requester_upi, amount: req.amount, note: req.note,
      history: [], isCollectRequest: true,
    });
    const fmt = window.TxUtils.formatINR;

    const modalRef = window.UIKit.modal({
      title: "Fake Payment Request Detection",
      wide: true,
      bodyHtml: `
        <div style="display:flex;gap:10px;align-items:flex-start;background:#fff1f0;border:1px solid #ffccc7;color:#a8071a;padding:12px 14px;border-radius:8px;margin-bottom:16px;font-size:14px;font-weight:600;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-top:2px;font-size:16px;"></i>
          <span>You are about to <u>PAY</u> ${fmt(req.amount)} to ${escapeHtml(req.requester_name)} - you will NOT receive money from this.</span>
        </div>

        <div class="app-card" style="padding:14px;margin-bottom:14px;background:#f9fafc;border:1px solid #eef0f6;">
          <strong style="display:block;font-size:13px;margin-bottom:8px;">What this request actually means</strong>
          <p style="font-size:13.5px;color:#333;margin:0;line-height:1.5;">
            <strong>${escapeHtml(req.requester_name)}</strong> (${escapeHtml(req.requester_upi)}) sent you a <strong>COLLECT request</strong>${req.note ? ` with the note "${escapeHtml(req.note)}"` : ""}.
            A collect request looks like a normal notification, but it actually asks UPI to pull money <strong>out of your account</strong> - approving it authorizes a payment, it does not deposit anything into your account.
          </p>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:150px;background:#f9fafc;border:1px solid #eef0f6;border-radius:8px;padding:10px 12px;">
            <span style="font-size:11px;color:#8a8fa3;text-transform:uppercase;letter-spacing:.03em;">Direction</span>
            <div style="font-weight:700;color:#a8071a;font-size:14px;margin-top:2px;"><i class="fa-solid fa-arrow-up"></i> You PAY (money leaves your account)</div>
          </div>
          <div style="flex:1;min-width:150px;background:#f9fafc;border:1px solid #eef0f6;border-radius:8px;padding:10px 12px;">
            <span style="font-size:11px;color:#8a8fa3;text-transform:uppercase;letter-spacing:.03em;">Amount involved</span>
            <div style="font-weight:700;font-size:14px;margin-top:2px;">${fmt(req.amount)}</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <div class="risk-score-ring ${result.level}" style="--pct:${result.score}%"><span>${result.score}%</span></div>
          ${window.UIKit.riskBadge(result.level)}
          ${req.is_suspicious ? `<span class="pill high"><i class="fa-solid fa-triangle-exclamation"></i> Flagged as suspicious</span>` : ""}
        </div>

        <strong style="font-size:13px;">Risk level &amp; suspicious indicators</strong>
        <ul class="uikit-reason-list">${result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>

        <div class="uikit-check-row">
          <input type="checkbox" id="reqAck">
          <label for="reqAck" style="font-size:13px;color:#7a1f1f;">I understand this will PAY ${fmt(req.amount)} out of my account, and I want to approve it.</label>
        </div>
      `,
      actions: [
        { label: "Approve & Pay", variant: "danger", disabled: true, closeOnClick: false,
          onClick: async ({ close }) => { await approve(req, result); close(); } },
        { label: "Cancel", variant: "ghost" },
        {
          label: "Trusted Person Confirmation",
          variant: "primary",
          onClick: () => {
            window.TrustedPerson.open({
              payeeName: req.requester_name, upiId: req.requester_upi, amount: req.amount, result,
              skipDetection: true,
              onProceed: async () => { await approve(req, result); },
              onCancel: () => {},
            });
          },
        },
      ],
    });
    const ack = modalRef.body.querySelector("#reqAck");
    const confirmBtn = modalRef.el.querySelectorAll(".uikit-modal-actions .uikit-btn")[0];
    ack.addEventListener("change", () => { confirmBtn.disabled = !ack.checked; });
  }

  async function approve(req, result) {
    try {
      const { error: e1 } = await window.supabaseClient.from("payment_requests").update({ status: "approved" }).eq("id", req.id);
      if (e1) throw e1;
      const { error: e2 } = await window.supabaseClient.from("transactions").insert({
        user_id: currentUser.id, payee_name: req.requester_name, upi_id: req.requester_upi, amount: req.amount,
        direction: "sent", category: "other", risk_level: result.level, status: "success",
        note: "Approved collect request" + (req.note ? ": " + req.note : ""),
      });
      if (e2) throw e2;
      window.UIKit.toast("Request approved and payment sent.", "success");
      loadRequests();
    } catch (err) {
      window.UIKit.toast("Couldn't approve: " + (err.message || "unknown error"), "error");
    }
  }

  async function decline(id) {
    try {
      const { error } = await window.supabaseClient.from("payment_requests").update({ status: "declined" }).eq("id", id);
      if (error) throw error;
      window.UIKit.toast("Request declined.", "info");
      loadRequests();
    } catch (err) {
      window.UIKit.toast("Couldn't decline: " + (err.message || "unknown error"), "error");
    }
  }

  function renderError(msg) {
    document.getElementById("requestsList").innerHTML = `<div class="state-block"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(msg)}</p></div>`;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
