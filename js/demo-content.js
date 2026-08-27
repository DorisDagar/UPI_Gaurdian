/**
 * UPI Guardian - "Try Demo" content for the dashboard protection cards.
 * Each demo runs a realistic sample scenario through the real
 * RiskEngine so the numbers shown aren't hard-coded - they're the
 * same output you'd get from Send Money / Scan & Pay / Message Analyzer.
 */
(function (window) {
  function runDemo(key) {
    if (!window.UIKit || !window.RiskEngine) return;
    const demo = DEMOS[key];
    if (!demo) return;
    demo();
  }

  const DEMOS = {
    "large-amount": function () {
      const history = [
        { direction: "sent", amount: 450, upi_id: "chai@ok" },
        { direction: "sent", amount: 800, upi_id: "grocery@ok" },
        { direction: "sent", amount: 1200, upi_id: "friend@ok" },
      ];
      const result = window.RiskEngine.assessTransactionRisk({
        payeeName: "New Furniture Store", upiId: "furniture99@okhdfc", amount: 45000, note: "Sofa set", history,
      });
      showResult({
        title: "Demo: Unusually Large Transaction",
        intro: "Your last 3 payments averaged around ₹800. Here's what happens if a ₹45,000 payment comes in:",
        result,
        payee: "New Furniture Store", amount: 45000,
      });
    },
    "unknown-receiver": function () {
      const history = [
        { direction: "sent", amount: 500, upi_id: "sister@upi" },
        { direction: "sent", amount: 950, upi_id: "amazon@apl" },
      ];
      const result = window.RiskEngine.assessTransactionRisk({
        payeeName: "Unknown Receiver", upiId: "xyz123random@upi", amount: 3000, note: "", history,
      });
      showResult({
        title: "Demo: New / Unknown Receiver",
        intro: "This UPI ID has never appeared in your payment history before:",
        result,
        payee: "xyz123random@upi", amount: 3000,
      });
    },
    "fake-request": function () {
      runFakeRequestDemo();
    },
    "trusted-person": function () {
      runTrustedPersonDemo();
    },
    "message-analyzer": function () {
      const sample = "Dear Customer, your KYC is BLOCKED. Update immediately or your account will be suspended within 24 hours. Click http://bit.ly/kyc-verify-now and share the OTP to continue. Congratulations you are also eligible for a cash prize!";
      const result = window.RiskEngine.analyzeMessage(sample);
      const factorsHtml = result.factors.map((f) => `<li><span class="pill ${f.level}" style="margin-right:6px;">${f.level}</span>${f.label}</li>`).join("");
      window.UIKit.modal({
        title: "Demo: Scam Message Analyzer",
        wide: true,
        bodyHtml: `
          <p style="margin-bottom:10px;">Here's a sample scam SMS run through the analyzer:</p>
          <div style="background:#f7f8fc;border-radius:10px;padding:12px 14px;font-size:13px;color:#4b5563;margin-bottom:14px;">${sample}</div>
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
            <div class="risk-score-ring ${result.level}" style="--pct:${result.score}%"><span>${result.score}%</span></div>
            <div>${window.UIKit.riskBadge(result.level)}<p style="margin-top:6px;font-size:13px;color:#4b5563;">${result.level === "high" ? "This message shows strong signs of a scam." : "Some risk signals detected."}</p></div>
          </div>
          <strong style="font-size:13px;">Risk factors detected</strong>
          <ul class="uikit-reason-list">${factorsHtml}</ul>
        `,
        actions: [
          { label: "Try it on a real message", variant: "primary", onClick: () => { window.location.href = "message-analyzer.html"; } },
          { label: "Close", variant: "ghost" },
        ],
      });
    },
  };

  /**
   * Demo: Fake Payment Request.
   * Simulates the real Payment Requests flow end-to-end (instead of
   * redirecting anywhere): an incoming collect request with
   * Approve/Decline, and - only on Approve - the full "you're about to
   * PAY, not receive" breakdown from the real RiskEngine.
   */
  function runFakeRequestDemo() {
    const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
    const req = {
      requester_name: "\"KYC Update - SBI\"",
      requester_upi: "kyc-update@fraud",
      amount: 1,
      note: "Pay ₹1 to verify KYC, urgent",
    };
    const result = window.RiskEngine.assessTransactionRisk({
      payeeName: req.requester_name, upiId: req.requester_upi, amount: req.amount, note: req.note,
      history: [], isCollectRequest: true,
    });
    const declineToast = () => window.UIKit.toast("Good call - declining a collect request keeps your money safe.", "success");

    window.UIKit.modal({
      title: "New Payment Request Received",
      wide: true,
      bodyHtml: `
        <p style="margin-bottom:12px;color:#555;">This simulates a request landing on your Payment Requests page:</p>
        <div class="app-card" style="padding:14px;background:#f9fafc;border:1px solid #eef0f6;">
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>From</span><strong>${req.requester_name}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>UPI ID</span><strong>${req.requester_upi}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>Amount</span><strong>${fmt(req.amount)}</strong></div>
          <div style="font-size:13px;color:#666;margin-top:6px;">"${req.note}"</div>
        </div>
      `,
      actions: [
        { label: "Approve", variant: "danger", onClick: () => showFakeRequestApproval(req) },
        { label: "Cancel", variant: "ghost", onClick: declineToast },
        { label: "Trusted Person Confirmation", variant: "primary", onClick: () => {
            if (!window.TrustedPerson) return;
            window.TrustedPerson.open({
              payeeName: req.requester_name,
              upiId: req.requester_upi,
              amount: req.amount,
              result,
              onProceed: () => showFakeRequestApproval(req),
              onCancel: declineToast,
            });
          } },
      ],
    });
  }

  function showFakeRequestApproval(req) {
    const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
    const result = window.RiskEngine.assessTransactionRisk({
      payeeName: req.requester_name, upiId: req.requester_upi, amount: req.amount, note: req.note,
      history: [], isCollectRequest: true,
    });

    const modalRef = window.UIKit.modal({
      title: "Fake Payment Request Detection",
      wide: true,
      bodyHtml: `
        <div style="display:flex;gap:10px;align-items:flex-start;background:#fff1f0;border:1px solid #ffccc7;color:#a8071a;padding:12px 14px;border-radius:8px;margin-bottom:16px;font-size:14px;font-weight:600;">
          <i class="fa-solid fa-triangle-exclamation" style="margin-top:2px;font-size:16px;"></i>
          <span>You are about to <u>PAY</u> ${fmt(req.amount)} to ${req.requester_name} - you will NOT receive money from this.</span>
        </div>
        <div class="app-card" style="padding:14px;margin-bottom:14px;background:#f9fafc;border:1px solid #eef0f6;">
          <strong style="display:block;font-size:13px;margin-bottom:8px;">What this request actually means</strong>
          <p style="font-size:13.5px;color:#333;margin:0;line-height:1.5;">
            <strong>${req.requester_name}</strong> (${req.requester_upi}) sent a <strong>COLLECT request</strong> with the note "${req.note}".
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
          <span class="pill high"><i class="fa-solid fa-triangle-exclamation"></i> Flagged as suspicious</span>
        </div>
        <strong style="font-size:13px;">Risk level &amp; suspicious indicators</strong>
        <ul class="uikit-reason-list">${result.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
        <div class="uikit-check-row">
          <input type="checkbox" id="demoReqAck">
          <label for="demoReqAck" style="font-size:13px;color:#7a1f1f;">I understand this will PAY ${fmt(req.amount)} out of my account, and I want to approve it.</label>
        </div>
      `,
      actions: [
        { label: "Approve & Pay", variant: "danger", disabled: true, closeOnClick: false,
          onClick: ({ close }) => {
            window.UIKit.toast("This was a demo - no real transaction was created. In real life, that first ₹1 is just the scammer's foot in the door.", "info");
            close();
          } },
        { label: "Cancel", variant: "ghost" },
        {
          label: "Trusted Person Confirmation",
          variant: "primary",
          onClick: () => {
            if (!window.TrustedPerson) return;
            window.TrustedPerson.open({
              payeeName: req.requester_name, upiId: req.requester_upi, amount: req.amount, result,
              skipDetection: true,
              onProceed: () => {
                window.UIKit.toast("This was a demo - no real transaction was created. In real life, that first ₹1 is just the scammer's foot in the door.", "info");
              },
              onCancel: () => {},
            });
          },
        },
      ],
    });
    const ack = modalRef.body.querySelector("#demoReqAck");
    const confirmBtn = modalRef.el.querySelectorAll(".uikit-modal-actions .uikit-btn")[0];
    ack.addEventListener("change", () => { confirmBtn.disabled = !ack.checked; });
  }

  function showResult({ title, intro, result, payee, amount }) {
    const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
    const reasonsHtml = result.reasons.map((r) => `<li>${r}</li>`).join("");
    window.UIKit.modal({
      title,
      wide: true,
      bodyHtml: `
        <p style="margin-bottom:12px;">${intro}</p>
        <div class="app-card" style="padding:14px;margin-bottom:14px;background:#f9fafc;border:1px solid #eef0f6;">
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>To</span><strong>${payee}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span>Amount</span><strong>${fmt(amount)}</strong></div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div class="risk-score-ring ${result.level}" style="--pct:${result.score}%"><span>${result.score}%</span></div>
          ${window.UIKit.riskBadge(result.level)}
        </div>
        <strong style="font-size:13px;">Why UPI Guardian flagged this</strong>
        <ul class="uikit-reason-list">${reasonsHtml}</ul>
      `,
      actions: [
        { label: "Try Send Money for real", variant: "primary", onClick: () => { window.location.href = "sendMoney.html"; } },
        { label: "Close", variant: "ghost" },
      ],
    });
  }

  /**
   * Demo: Trusted Person Confirmation.
   * Walks through the exact flow described on the Help page:
   *   Suspicious Payment Detected -> User selects Trusted Person ->
   *   Transaction details are shared for review -> Trusted Person
   *   confirms or advises caution -> User makes the final decision.
   * Real trusted contacts are pulled from Supabase when available;
   * otherwise sample contacts are used so the demo works for anyone.
   */
  function runTrustedPersonDemo() {
    const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
    const payee = "Rohit Sharma";
    const upiId = "rohit.sharma99@okaxis";
    const amount = 28000;
    const note = "Investment scheme return - urgent, claim now";
    const result = window.RiskEngine.assessTransactionRisk({
      payeeName: payee, upiId, amount, note, history: [],
    });

    const state = { step: 1, contacts: [], selected: null, advice: null };

    const modalRef = window.UIKit.modal({
      title: "Trusted Person Confirmation",
      wide: true,
      bodyHtml: `<div id="tpcStep"></div>`,
    });

    render();

    function stepLabel(n, text) {
      return `<p style="font-size:12px;font-weight:700;letter-spacing:.4px;color:#7135d8;text-transform:uppercase;margin-bottom:12px;">Step ${n} of 4 &middot; ${text}</p>`;
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

    function box() { return document.getElementById("tpcStep"); }

    async function render() {
      const el = box();
      if (!el) return;

      if (state.step === 1) {
        el.innerHTML = `
          ${stepLabel(1, "Suspicious Payment Detected")}
          <div class="app-card" style="padding:14px;margin-bottom:14px;background:#f9fafc;border:1px solid #eef0f6;">
            <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>To</span><strong>${payee}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>UPI ID</span><strong>${upiId}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>Amount</span><strong>${fmt(amount)}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span>Note</span><strong>${note}</strong></div>
          </div>
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
            <div class="risk-score-ring ${result.level}" style="--pct:${result.score}%"><span>${result.score}%</span></div>
            ${window.UIKit.riskBadge(result.level)}
          </div>
          <strong style="font-size:13px;">Why UPI Guardian flagged this</strong>
          <ul class="uikit-reason-list">${result.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
          <p style="margin-top:14px;font-size:13.5px;color:#4b5563;">Before this payment goes through, you can bring in someone you trust to review it with you.</p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn primary" data-action="involve">Involve a Trusted Person</button>
            <button class="uikit-btn ghost" data-action="close">Close</button>
          </div>
        `;
        wire();
        return;
      }

      if (state.step === 2) {
        el.innerHTML = `${stepLabel(2, "Select a Trusted Person")}<p style="font-size:13px;color:#8a93a6;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading your trusted contacts…</p>`;
        const contacts = await loadContacts();
        if (state.step !== 2) return; // user navigated away while loading
        el.innerHTML = `
          ${stepLabel(2, "Select a Trusted Person")}
          <p style="margin-bottom:12px;font-size:13.5px;color:#4b5563;">Choose who should review this payment with you.</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
            ${contacts.map((c, i) => `
              <div class="app-card tpc-contact" data-idx="${i}" style="padding:12px 14px;cursor:pointer;display:flex;align-items:center;gap:12px;border:1px solid #eef0f6;">
                <i class="fa-solid fa-user-shield" style="color:#7135d8;"></i>
                <div><strong style="font-size:13.5px;">${c.name}</strong><div style="font-size:12px;color:#8a93a6;">${c.handle}</div></div>
              </div>`).join("")}
          </div>
          <div class="uikit-modal-actions">
            <button class="uikit-btn primary" data-action="share" disabled>Share Transaction Details</button>
            <button class="uikit-btn ghost" data-action="back">Back</button>
          </div>
        `;
        wire();
        return;
      }

      if (state.step === 3) {
        const c = state.selected;
        el.innerHTML = `
          ${stepLabel(3, "Shared for Review")}
          <div class="app-card" style="padding:14px;margin-bottom:16px;background:#f9fafc;border:1px solid #eef0f6;">
            <p style="font-size:13.5px;margin-bottom:8px;"><i class="fa-solid fa-paper-plane" style="color:#7135d8;margin-right:6px;"></i>Transaction details sent to <strong>${c.name}</strong></p>
            <div style="font-size:13px;color:#4b5563;">${fmt(amount)} to ${payee} (${upiId}) — flagged ${result.level} risk</div>
          </div>
          <p style="font-size:13px;color:#8a93a6;margin-bottom:18px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Waiting for ${c.name} to respond…</p>
          <p style="font-size:12.5px;color:#8a93a6;margin-bottom:10px;">This is a simulated demo — pick a reply below to see what happens next.</p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn ghost" data-action="advice-safe">They confirm it's safe</button>
            <button class="uikit-btn primary" data-action="advice-caution">They advise caution</button>
          </div>
        `;
        wire();
        return;
      }

      if (state.step === 4) {
        const c = state.selected;
        const isCaution = state.advice === "caution";
        el.innerHTML = `
          ${stepLabel(4, "Your Final Decision")}
          <div style="background:${isCaution ? "#fdeaea" : "#e6f9ee"};border-radius:10px;padding:14px;margin-bottom:16px;">
            <p style="font-size:13.5px;line-height:1.6;"><strong>${c.name}:</strong> ${isCaution
              ? "This looks risky to me — I don't recognise this UPI ID, and the urgent wording is a common scam sign. I'd hold off and verify first."
              : "I've reviewed this and it looks fine to me — go ahead if you're confident."}</p>
          </div>
          <p style="font-size:13.5px;color:#4b5563;margin-bottom:16px;">The final call is always yours to make.</p>
          <div class="uikit-modal-actions">
            <button class="uikit-btn primary" data-action="${isCaution ? "cancel-pay" : "proceed-pay"}">${isCaution ? "Cancel Payment" : "Proceed with Payment"}</button>
            <button class="uikit-btn ${isCaution ? "danger" : "ghost"}" data-action="${isCaution ? "proceed-pay" : "cancel-pay"}">${isCaution ? "Proceed Anyway" : "Cancel Payment"}</button>
          </div>
        `;
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
      if (action === "back") { state.step = 1; render(); return; }
      if (action === "share") {
        if (!state.selected) return;
        state.step = 3; render(); return;
      }
      if (action === "advice-caution") { state.advice = "caution"; state.step = 4; render(); return; }
      if (action === "advice-safe") { state.advice = "safe"; state.step = 4; render(); return; }
      if (action === "cancel-pay") {
        modalRef.close();
        window.UIKit.toast(
          state.advice === "caution" ? "Good call — payment cancelled. That's exactly what this feature is for." : "Payment cancelled.",
          "success"
        );
        return;
      }
      if (action === "proceed-pay") {
        modalRef.close();
        window.UIKit.toast(
          state.advice === "caution" ? "Payment sent anyway — in real life, weigh a caution warning carefully." : "Payment sent.",
          state.advice === "caution" ? "error" : "success"
        );
        return;
      }
    }
  }

  window.UPIGuardianDemos = { runDemo };
})(window);
