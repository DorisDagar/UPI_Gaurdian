/**
 * UPI Guardian - Trusted Person Confirmation (shared flow).
 * -----------------------------------------------------------------
 * Any payment surface (Send Money, Scan & Pay, Payment Requests, and
 * the dashboard "Try Demo" card) can call window.TrustedPerson.open()
 * to let the user bring a trusted contact into the decision before a
 * payment goes through:
 *
 *   Suspicious Payment Detected -> User selects Trusted Person ->
 *   Transaction details are shared for review -> Trusted Person
 *   confirms or advises caution -> User makes the final decision.
 *
 * Real payment pages already show their own risk analysis in their
 * confirm modal, so they pass skipDetection:true to jump straight to
 * picking a contact. The dashboard demo shows the full flow from the
 * top. Trusted contacts are pulled from Supabase when available,
 * falling back to sample contacts so the flow always works.
 * -----------------------------------------------------------------
 */
(function (window) {
  function fmtINR(n) {
    if (window.TxUtils && window.TxUtils.formatINR) return window.TxUtils.formatINR(n);
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /**
   * @param {Object} opts
   * @param {string} opts.payeeName
   * @param {string} [opts.upiId]
   * @param {number} opts.amount
   * @param {string} [opts.note]
   * @param {{score:number, level:'low'|'medium'|'high', reasons:string[]}} opts.result
   * @param {boolean} [opts.skipDetection] - start at contact selection (step 2)
   *   instead of the "Suspicious Payment Detected" recap (step 1).
   * @param {Function} [opts.onProceed] - called after modal closes if the
   *   user's final decision is to go ahead with the payment.
   * @param {Function} [opts.onCancel] - called after modal closes if the
   *   user's final decision is to cancel the payment.
   */
  function open(opts) {
    const payeeName = opts.payeeName || "this receiver";
    const upiId = opts.upiId || "";
    const amount = opts.amount || 0;
    const result = opts.result || { score: 0, level: "low", reasons: [] };
    const onProceed = typeof opts.onProceed === "function" ? opts.onProceed : function () {};
    const onCancel = typeof opts.onCancel === "function" ? opts.onCancel : function () {};

    const state = { step: opts.skipDetection ? 2 : 1, contacts: [], selected: null, advice: null };

    const modalRef = window.UIKit.modal({
      title: "Trusted Person Confirmation",
      wide: true,
      bodyHtml: `<div id="tpcFlowStep"></div>`,
    });

    render();

    function stepLabel(n, text) {
      return `<p style="font-size:12px;font-weight:700;letter-spacing:.4px;color:#7135d8;text-transform:uppercase;margin-bottom:12px;">Step ${n} of 4 &middot; ${text}</p>`;
    }

    function recapCard() {
      return `
        <div class="app-card" style="padding:12px 14px;margin-bottom:16px;background:#f9fafc;border:1px solid #eef0f6;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>To</span><strong>${escapeHtml(payeeName)}</strong></div>
          ${upiId ? `<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>UPI ID</span><strong>${escapeHtml(upiId)}</strong></div>` : ""}
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>Amount</span><strong>${fmtINR(amount)}</strong></div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;"><span>Risk</span>${window.UIKit.riskBadge(result.level)}</div>
        </div>`;
    }

    async function loadContacts() {
      if (state.contacts.length) return state.contacts;
      let contacts = [];
      if (window.supabaseClient) {
        try {
          const { data } = await window.supabaseClient.from("trusted_contacts").select("*").limit(5);
          if (data && data.length) {
            contacts = data.map((c) => ({ name: c.name, handle: c.handle || c.upi_id || c.mobile || "" }));
          }
        } catch (e) { /* fall back to sample contacts below */ }
      }
      if (!contacts.length) {
        contacts = [
          { name: "Meena (Mom)", handle: "meena.k@okicici" },
          { name: "Arjun (Dad)", handle: "98765xxxxx" },
          { name: "Priya (Best Friend)", handle: "priya.sh@okhdfc" },
        ];
      }
      state.contacts = contacts;
      return contacts;
    }

    function box() { return document.getElementById("tpcFlowStep"); }

    async function render() {
      const el = box();
      if (!el) return;

      if (state.step === 1) {
        el.innerHTML = `
          ${stepLabel(1, "Suspicious Payment Detected")}
          ${recapCard()}
          <strong style="font-size:13px;">Why UPI Guardian flagged this</strong>
          <ul class="uikit-reason-list">${result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
          <p style="margin-top:14px;font-size:13.5px;color:#4b5563;">Before this payment goes through, you can bring in someone you trust to review it with you.</p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn primary" data-action="involve">Involve a Trusted Person</button>
            <button class="uikit-btn ghost" data-action="close">Close</button>
          </div>`;
        wire();
        return;
      }

      if (state.step === 2) {
        el.innerHTML = `${stepLabel(2, "Select a Trusted Person")}${recapCard()}<p style="font-size:13px;color:#8a93a6;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading your trusted contacts…</p>`;
        const contacts = await loadContacts();
        if (state.step !== 2) return; // user navigated away while loading
        el.innerHTML = `
          ${stepLabel(2, "Select a Trusted Person")}
          ${recapCard()}
          <p style="margin-bottom:12px;font-size:13.5px;color:#4b5563;">Choose who should review this payment with you.</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
            ${contacts.map((c, i) => `
              <div class="app-card tpc-contact" data-idx="${i}" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;border:1px solid #eef0f6;">
                <i class="fa-solid fa-user-shield" style="color:#7135d8;"></i>
                <div><strong style="font-size:13.5px;">${escapeHtml(c.name)}</strong><div style="font-size:12px;color:#8a93a6;">${escapeHtml(c.handle)}</div></div>
              </div>`).join("")}
          </div>
          <p style="margin-bottom:14px;"><a href="settings.html#trusted-contacts" style="font-size:12.5px;color:#4d72d8;font-weight:600;">Manage trusted contacts <i class="fa-solid fa-arrow-right" style="margin-left:2px;"></i></a></p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn primary" data-action="share" disabled>Share Transaction Details</button>
            <button class="uikit-btn ghost" data-action="close">Close</button>
          </div>`;
        wire();
        return;
      }

      if (state.step === 3) {
        const c = state.selected;
        el.innerHTML = `
          ${stepLabel(3, "Shared for Review")}
          ${recapCard()}
          <div class="app-card" style="padding:14px;margin-bottom:16px;background:#f9fafc;border:1px solid #eef0f6;">
            <p style="font-size:13.5px;"><i class="fa-solid fa-paper-plane" style="color:#7135d8;margin-right:6px;"></i>Transaction details sent to <strong>${escapeHtml(c.name)}</strong></p>
          </div>
          <p style="font-size:13px;color:#8a93a6;margin-bottom:18px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Waiting for ${escapeHtml(c.name)} to respond…</p>
          <p style="font-size:12.5px;color:#8a93a6;margin-bottom:10px;">In a live rollout this would be a real notification sent to your contact. For now, pick a reply to continue:</p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn ghost" data-action="advice-safe">They confirm it's safe</button>
            <button class="uikit-btn primary" data-action="advice-caution">They advise caution</button>
          </div>`;
        wire();
        return;
      }

      if (state.step === 4) {
        const c = state.selected;
        const isCaution = state.advice === "caution";
        el.innerHTML = `
          ${stepLabel(4, "Your Final Decision")}
          <div style="background:${isCaution ? "#fdeaea" : "#e6f9ee"};border-radius:10px;padding:14px;margin-bottom:16px;">
            <p style="font-size:13.5px;line-height:1.6;"><strong>${escapeHtml(c.name)}:</strong> ${isCaution
              ? "This looks risky to me — I'd hold off and verify first before sending anything."
              : "I've reviewed this and it looks fine to me — go ahead if you're confident."}</p>
          </div>
          <p style="font-size:13.5px;color:#4b5563;margin-bottom:16px;">The final call is always yours to make.</p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn primary" data-action="${isCaution ? "final-cancel" : "final-proceed"}">${isCaution ? "Cancel Payment" : "Proceed with Payment"}</button>
            <button class="uikit-btn ${isCaution ? "danger" : "ghost"}" data-action="${isCaution ? "final-proceed" : "final-cancel"}">${isCaution ? "Proceed Anyway" : "Cancel Payment"}</button>
          </div>`;
        wire();
        return;
      }
    }

    function wire() {
      const el = box();
      el.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => onAction(btn.dataset.action));
      });
      el.querySelectorAll(".tpc-contact").forEach((card) => {
        card.addEventListener("click", () => {
          el.querySelectorAll(".tpc-contact").forEach((x) => {
            x.style.borderColor = "#eef0f6";
            x.style.background = "";
          });
          card.style.borderColor = "#7135d8";
          card.style.background = "#f5f2ff";
          state.selected = state.contacts[Number(card.dataset.idx)];
          const shareBtn = el.querySelector('[data-action="share"]');
          if (shareBtn) shareBtn.disabled = false;
        });
      });
    }

    function onAction(action) {
      if (action === "close") { modalRef.close(); return; }
      if (action === "involve") { state.step = 2; render(); return; }
      if (action === "share") {
        if (!state.selected) return;
        state.step = 3; render(); return;
      }
      if (action === "advice-caution") { state.advice = "caution"; state.step = 4; render(); return; }
      if (action === "advice-safe") { state.advice = "safe"; state.step = 4; render(); return; }
      if (action === "final-cancel") { modalRef.close(); onCancel(); return; }
      if (action === "final-proceed") { modalRef.close(); onProceed(); return; }
    }
  }

  window.TrustedPerson = { open };
})(window);
