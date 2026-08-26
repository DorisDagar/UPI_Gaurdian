/**
 * UPI Guardian - Send Money page logic.
 * Live summary, quick amounts, recent-payee suggestions, risk
 * assessment via RiskEngine, and a confirm step that actually writes
 * to Supabase (a real 'sent' row, or a 'blocked' row if the user
 * backs out of a high-risk payment).
 */
(function () {
  const els = {};
  let mode = "upi";
  let history = [];
  let currentUser = null;
  // Guards against double-submission (double-click / double-tap on
  // Continue or on the review modal's Confirm button), which used to
  // insert two identical transaction rows for a single payment.
  let isReviewOpen = false;
  let isFinalizing = false;

  const DUPLICATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const HOUR_MS = 60 * 60 * 1000;

  document.addEventListener("DOMContentLoaded", cacheAndBind);
  document.addEventListener("upi-guardian:ready", async (e) => {
    currentUser = e.detail && e.detail.user;
    history = await fetchHistory();
    renderRecentPayees();
    renderPaymentActivity();
  });

  function cacheAndBind() {
    els.form = document.getElementById("sendMoneyForm");
    els.payeeInput = document.getElementById("payeeInput");
    els.payeeLabel = document.getElementById("payeeInputLabel");
    els.verifiedIcon = document.getElementById("verifiedIcon");
    els.amountInput = document.getElementById("amountInput");
    els.noteInput = document.getElementById("noteInput");
    els.noteGroup = document.getElementById("noteGroup");
    els.noteCount = document.getElementById("noteCount");
    els.addNoteToggle = document.getElementById("addNoteToggle");
    els.recentToggle = document.getElementById("recentUpiToggle");
    els.recentList = document.getElementById("recentUpiList");
    els.summaryTo = document.getElementById("summaryTo");
    els.summaryUpi = document.getElementById("summaryUpi");
    els.summaryAmount = document.getElementById("summaryAmount");
    els.summaryNote = document.getElementById("summaryNote");
    els.continueBtn = document.getElementById("continueBtn");
    els.paymentActivityBox = document.getElementById("paymentActivityBox");

    document.querySelectorAll(".tab[data-mode]").forEach((tab) => {
      tab.addEventListener("click", () => setMode(tab.dataset.mode));
    });

    els.payeeInput.addEventListener("input", updateSummary);
    els.amountInput.addEventListener("input", updateSummary);
    els.noteInput.addEventListener("input", () => {
      els.noteCount.textContent = els.noteInput.value.length;
      updateSummary();
    });

    document.querySelectorAll(".quick-amounts button[data-amt]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = Number(els.amountInput.value) || 0;
        els.amountInput.value = current + Number(btn.dataset.amt);
        updateSummary();
      });
    });

    els.addNoteToggle.addEventListener("click", (e) => {
      e.preventDefault();
      els.noteGroup.style.display = els.noteGroup.style.display === "none" ? "block" : "none";
    });

    els.recentToggle.addEventListener("click", () => {
      els.recentList.style.display = els.recentList.style.display === "none" ? "block" : "none";
    });

    els.form.addEventListener("submit", handleSubmit);
    updateSummary();
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll(".tab[data-mode]").forEach((t) => t.classList.toggle("active-tab", t.dataset.mode === m));
    els.payeeLabel.textContent = m === "upi" ? "UPI ID" : "Mobile Number";
    els.payeeInput.placeholder = m === "upi" ? "Enter UPI ID (e.g. name@upi)" : "Enter 10-digit mobile number";
    els.payeeInput.value = "";
    updateSummary();
  }

  async function fetchHistory() {
    if (!window.supabaseClient) return [];
    try {
      const { data, error } = await window.supabaseClient.from("transactions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (_) {
      return [];
    }
  }

  function renderRecentPayees() {
    const sent = history.filter((t) => t.direction === "sent" && t.status === "success");
    const seen = new Map();
    sent.forEach((t) => { if (!seen.has(t.upi_id)) seen.set(t.upi_id, t.payee_name); });
    const entries = Array.from(seen.entries()).slice(0, 5);
    if (!entries.length) {
      els.recentList.innerHTML = `<p style="color:#8a93a6;font-size:13px;padding:6px 0 16px;">No saved UPI IDs yet.</p>`;
      return;
    }
    els.recentList.innerHTML = entries.map(([upi, name]) => `
      <button type="button" class="recent-chip" data-upi="${escapeHtml(upi)}" data-name="${escapeHtml(name)}"
        style="display:flex;justify-content:space-between;width:100%;padding:10px 12px;border:1px solid #e6e8f2;border-radius:8px;background:#fafafe;margin-bottom:8px;cursor:pointer;font-size:13px;">
        <span>${escapeHtml(name)}</span><span style="color:#8a93a6;">${escapeHtml(upi)}</span>
      </button>`).join("");
    els.recentList.querySelectorAll(".recent-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        els.payeeInput.value = chip.dataset.upi;
        els.recentList.style.display = "none";
        updateSummary();
      });
    });
  }

  function updateSummary() {
    const payee = els.payeeInput.value.trim();
    const amount = Number(els.amountInput.value) || 0;
    const note = els.noteInput.value.trim();

    els.summaryTo.textContent = payee || "Not Entered";
    els.summaryTo.classList.toggle("summary-light", !payee);
    els.summaryUpi.textContent = mode === "upi" ? (payee || "-") : (payee ? `+91 ${payee}` : "-");
    els.summaryAmount.textContent = window.TxUtils ? window.TxUtils.formatINR(amount) : "₹" + amount;
    els.summaryNote.textContent = note || "-";

    const looksValid = mode === "upi" ? payee.includes("@") : /^\d{10}$/.test(payee);
    els.verifiedIcon.style.display = looksValid ? "inline-block" : "none";
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Stop a fast double-click on Continue from opening two review
    // modals (and, from there, letting a payment go through twice).
    if (isReviewOpen || isFinalizing) return;

    const payeeRaw = els.payeeInput.value.trim();
    const amount = Number(els.amountInput.value) || 0;
    const note = els.noteInput.value.trim();

    if (!payeeRaw) { window.UIKit.toast(mode === "upi" ? "Enter a UPI ID." : "Enter a mobile number.", "error"); return; }
    if (mode === "mobile" && !/^\d{10}$/.test(payeeRaw)) { window.UIKit.toast("Enter a valid 10-digit mobile number.", "error"); return; }
    if (mode === "upi" && !payeeRaw.includes("@")) { window.UIKit.toast("Enter a valid UPI ID (e.g. name@bank).", "error"); return; }
    if (amount < 1) { window.UIKit.toast("Enter an amount greater than ₹0.", "error"); return; }

    const upiId = mode === "upi" ? payeeRaw : `${payeeRaw}@upi`;
    const payeeName = mode === "upi" ? guessNameFromHistory(upiId) || upiId.split("@")[0] : payeeRaw;

    const result = window.RiskEngine.assessTransactionRisk({ payeeName, upiId, amount, note, history });
    showReview({ payeeName, upiId, amount, note, result });
  }

  function guessNameFromHistory(upiId) {
    const match = history.find((t) => (t.upi_id || "").toLowerCase() === upiId.toLowerCase());
    return match ? match.payee_name : null;
  }

  function findRecentDuplicate(upiId, amount) {
    const now = Date.now();
    return history.find((t) => {
      if (t.direction !== "sent" || t.status !== "success") return false;
      if ((t.upi_id || "").toLowerCase() !== upiId.toLowerCase()) return false;
      if (Number(t.amount) !== Number(amount)) return false;
      const ts = new Date(t.created_at).getTime();
      if (!ts) return false;
      return now - ts <= DUPLICATE_WINDOW_MS && now - ts >= 0;
    });
  }

  function showReview({ payeeName, upiId, amount, note, result }) {
    const fmt = window.TxUtils.formatINR;
    const reasonsHtml = result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    const needsAck = result.level === "high";

    const duplicate = findRecentDuplicate(upiId, amount);
    const minsAgo = duplicate ? Math.max(1, Math.round((Date.now() - new Date(duplicate.created_at).getTime()) / 60000)) : null;
    const duplicateHtml = duplicate ? `
        <div style="display:flex;gap:10px;align-items:flex-start;background:#fff7e6;border:1px solid #ffd591;color:#874d00;padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:13px;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-top:2px;"></i>
          <span>You already sent <strong>${fmt(amount)}</strong> to <strong>${escapeHtml(payeeName)}</strong> (${escapeHtml(upiId)}) about ${minsAgo} minute${minsAgo === 1 ? "" : "s"} ago. Make sure this isn't an accidental repeat payment.</span>
        </div>` : "";

    isReviewOpen = true;

    const modalRef = window.UIKit.modal({
      title: "Review & Confirm Payment",
      wide: true,
      bodyHtml: `
        ${duplicateHtml}
        <div class="app-card" style="padding:14px;margin-bottom:14px;background:#f9fafc;border:1px solid #eef0f6;">
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>To</span><strong>${escapeHtml(payeeName)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>UPI ID</span><strong>${escapeHtml(upiId)}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span>Amount</span><strong>${fmt(amount)}</strong></div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div class="risk-score-ring ${result.level}" style="--pct:${result.score}%"><span>${result.score}%</span></div>
          ${window.UIKit.riskBadge(result.level)}
        </div>
        <strong style="font-size:13px;">What UPI Guardian found</strong>
        <ul class="uikit-reason-list">${reasonsHtml}</ul>
        ${needsAck ? `<div class="uikit-check-row">
            <input type="checkbox" id="riskAckBox">
            <label for="riskAckBox" style="font-size:13px;color:#7a1f1f;">I understand the risk and want to proceed anyway.</label>
          </div>` : ""}
      `,
      actions: [
        {
          label: needsAck ? "Confirm & Pay Anyway" : "Confirm & Pay",
          variant: needsAck ? "danger" : "primary",
          disabled: needsAck,
          closeOnClick: false,
          onClick: async ({ close }) => {
            // A second click while the first payment is still being
            // written to Supabase must be ignored - not queued.
            if (isFinalizing) return;
            disableModalActions(modalRef);
            await finalizePayment({ payeeName, upiId, amount, note, result, blocked: false });
            isReviewOpen = false;
            close();
          },
        },
        {
          label: "Cancel Payment",
          variant: "ghost",
          closeOnClick: false,
          onClick: async ({ close }) => {
            if (isFinalizing) return;
            if (needsAck) {
              disableModalActions(modalRef);
              await finalizePayment({ payeeName, upiId, amount, note, result, blocked: true });
            }
            isReviewOpen = false;
            close();
          },
        },
      ],
    });

    // If the user dismisses the review via the X button, backdrop
    // click, or Escape (none of which run the actions above), the
    // guard still needs to be released so Continue works again.
    modalRef.el.closest(".uikit-overlay").addEventListener("click", (e) => {
      if (e.target.closest(".uikit-modal-close") || e.target === e.currentTarget) isReviewOpen = false;
    });
    document.addEventListener("keydown", function releaseOnEsc(ev) {
      if (ev.key === "Escape") { isReviewOpen = false; document.removeEventListener("keydown", releaseOnEsc); }
    });

    if (needsAck) {
      const ack = modalRef.body.querySelector("#riskAckBox");
      const confirmBtn = modalRef.el.querySelectorAll(".uikit-modal-actions .uikit-btn")[0];
      ack.addEventListener("change", () => { confirmBtn.disabled = !ack.checked; });
    }
  }

  function disableModalActions(modalRef) {
    modalRef.el.querySelectorAll(".uikit-modal-actions .uikit-btn").forEach((btn) => { btn.disabled = true; });
  }

  async function finalizePayment({ payeeName, upiId, amount, note, result, blocked }) {
    // Last line of defense: even if two clicks somehow both reach
    // here, only the first is allowed to write a transaction row.
    if (isFinalizing) return;
    isFinalizing = true;

    if (!window.supabaseClient || !currentUser) {
      window.UIKit.toast("Supabase isn't connected - can't save this transaction.", "error");
      isFinalizing = false;
      return;
    }
    els.continueBtn.disabled = true;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await window.supabaseClient.from("transactions").insert({
        user_id: currentUser.id,
        payee_name: payeeName,
        upi_id: upiId,
        amount,
        direction: "sent",
        category: mode === "mobile" ? "person" : "other",
        risk_level: result.level,
        status: blocked ? "blocked" : "success",
        note: note || null,
      });
      if (error) throw error;

      // Reflect the new transaction locally right away so the
      // duplicate check and the activity counter are accurate even
      // before a fresh fetch from Supabase happens.
      history.unshift({
        payee_name: payeeName,
        upi_id: upiId,
        amount,
        direction: "sent",
        status: blocked ? "blocked" : "success",
        created_at: nowIso,
      });
      renderPaymentActivity();

      if (blocked) {
        window.UIKit.toast("Payment cancelled. UPI Guardian logged this as a prevented risk.", "info");
        els.form.reset();
        updateSummary();
      } else {
        window.UIKit.toast("Payment sent successfully!", "success");
        setTimeout(() => { window.location.href = "transactions.html"; }, 900);
      }
    } catch (err) {
      console.error(err);
      window.UIKit.toast("Couldn't save this transaction: " + (err.message || "unknown error"), "error");
    } finally {
      els.continueBtn.disabled = false;
      isFinalizing = false;
    }
  }

  function renderPaymentActivity() {
    if (!els.paymentActivityBox) return;
    const now = Date.now();
    const relevant = history.filter((t) => t.direction === "sent" && (t.status === "success" || t.status === "blocked"));
    const lastHour = relevant.filter((t) => now - new Date(t.created_at).getTime() <= HOUR_MS).length;
    const today = relevant.filter((t) => new Date(t.created_at).toDateString() === new Date(now).toDateString()).length;

    if (!lastHour && !today) {
      els.paymentActivityBox.innerHTML = "";
      els.paymentActivityBox.style.display = "none";
      return;
    }
    els.paymentActivityBox.style.display = "flex";
    els.paymentActivityBox.innerHTML = `
      <i class="fa-regular fa-clock"></i>
      <span><strong>${lastHour}</strong> payment${lastHour === 1 ? "" : "s"} in the last hour &middot; <strong>${today}</strong> today</span>
    `;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
