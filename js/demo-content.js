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
      const result = window.RiskEngine.assessTransactionRisk({
        payeeName: "\"KYC Update - SBI\"", upiId: "kyc-update@fraud", amount: 1, note: "Pay ₹1 to verify KYC, urgent",
        history: [], isCollectRequest: true,
      });
      showResult({
        title: "Demo: Fake Payment Request",
        intro: "A \"collect\" request claiming to be a ₹1 KYC verification. Collect requests pull money OUT of your account - they never send you anything, no matter what the note says:",
        result,
        payee: "KYC Update - SBI", amount: 1,
      });
    },
    "trusted-person": function () {
      // Same sample scenario as the other cards, run through the real
      // RiskEngine, then handed to the shared Trusted Person flow that
      // also powers Send Money / Scan & Pay / Payment Requests.
      const payee = "Rohit Sharma";
      const upiId = "rohit.sharma99@okaxis";
      const amount = 28000;
      const note = "Investment scheme return - urgent, claim now";
      const result = window.RiskEngine.assessTransactionRisk({
        payeeName: payee, upiId, amount, note, history: [],
      });
      window.TrustedPerson.open({
        payeeName: payee,
        upiId,
        amount,
        note,
        result,
        onProceed: () => window.UIKit.toast("Payment sent (demo) - in real life, weigh a caution warning carefully.", "info"),
        onCancel: () => window.UIKit.toast("Payment cancelled (demo) - that's exactly what this feature is for.", "success"),
      });
    },
    "scam-timeline": function () {
      runScamTimelineDemo();
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
   * Demo: Scam Timeline.
   * Runs a realistic sequence of signals - a scam SMS, a QR-based
   * collect request, a brand-new receiver, an urgent note, and the
   * final payment - through the real RiskEngine, exactly as if they'd
   * happened one after another. Mirrors the example chain from the
   * Help page: Suspicious message received -> Unknown link/QR detected
   * -> New receiver identified -> Urgent payment request -> High-risk
   * payment alert.
   */
  function runScamTimelineDemo() {
    const RE = window.RiskEngine;

    // 1. Suspicious message received
    const smsText = "Dear Customer, your parcel could not be delivered due to unpaid customs duty. Pay Rs 49 now at http://bit.ly/parcel-fee49 to release your parcel today, refund pending if not paid, offer expires within 1 hour!";
    const msgResult = RE.analyzeMessage(smsText);

    // 2. Unknown link/QR detected (the link above turns out to be a collect request)
    const qrText = "upi://collect?pa=parcel-fee49@upi&pn=Courier%20Customs%20Desk&am=49&tn=Customs%20clearance%20fee%20-%20urgent%2C%20pay%20now";
    const parsedQr = RE.parseUpiQr(qrText);
    const qrResult = RE.assessTransactionRisk({
      payeeName: parsedQr.pn, upiId: parsedQr.pa, amount: Number(parsedQr.am),
      note: parsedQr.tn, history: [], isCollectRequest: parsedQr.isCollect,
    });

    // 3. New receiver identified ("customer service" now asks for a manual transfer)
    const newReceiverName = "Refund Agent - Priya";
    const newReceiverUpi = "refund-agent77@okhdfc";
    const newReceiverResult = RE.assessTransactionRisk({
      payeeName: newReceiverName, upiId: newReceiverUpi, amount: 0, note: "", history: [],
    });

    // 4 & 5. Urgent payment request -> High-risk payment alert (same payment,
    // shown as two beats: the request's wording, then UPI Guardian's verdict).
    const finalAmount = 25000;
    const finalNote = "Refund processing fee - urgent, claim your refund within 10 minutes or it will be blocked";
    const finalResult = RE.assessTransactionRisk({
      payeeName: newReceiverName, upiId: newReceiverUpi, amount: finalAmount, note: finalNote, history: [],
    });

    const steps = [
      {
        time: "9:14 AM", icon: "fa-comment-dots", risk: msgResult.level,
        title: "Suspicious message received",
        detail: `"${smsText}"`,
        tag: `${window.UIKit.riskBadge(msgResult.level)} <span style="font-size:12px;color:#8a93a6;margin-left:6px;">${msgResult.score}% risk - ${msgResult.factors[0].label.toLowerCase()}</span>`,
      },
      {
        time: "9:19 AM", icon: "fa-qrcode", risk: qrResult.level,
        title: "Unknown link/QR detected",
        detail: `The link led to a QR/collect request for ${window.TxUtils ? window.TxUtils.formatINR(Number(parsedQr.am)) : "₹" + parsedQr.am} to "${parsedQr.pn}" (${parsedQr.pa}) - a UPI ID never seen before.`,
        tag: `${window.UIKit.riskBadge(qrResult.level)} <span style="font-size:12px;color:#8a93a6;margin-left:6px;">${qrResult.score}% risk - collect request</span>`,
      },
      {
        time: "9:24 AM", icon: "fa-user", risk: newReceiverResult.level,
        title: "New receiver identified",
        detail: `"Customer service" now asks for a manual transfer to a different, brand-new UPI ID: ${newReceiverUpi}.`,
        tag: `<span class="pill low" style="margin-left:0;">first-time receiver</span>`,
      },
      {
        time: "9:27 AM", icon: "fa-triangle-exclamation", risk: "medium",
        title: "Urgent payment request",
        detail: `"${finalNote}"`,
        tag: `<span class="pill medium">urgent wording detected</span>`,
      },
      {
        time: "9:28 AM", icon: "fa-shield-halved", risk: finalResult.level,
        title: "High-risk payment alert",
        detail: `Before the ${window.TxUtils ? window.TxUtils.formatINR(finalAmount) : "₹" + finalAmount} payment goes through, UPI Guardian connects everything above and blocks it with a full warning: ${finalResult.reasons.join(" ")}`,
        tag: `${window.UIKit.riskBadge(finalResult.level)} <span style="font-size:12px;color:#8a93a6;margin-left:6px;">${finalResult.score}% risk</span>`,
      },
    ];

    const timelineHtml = `<div class="timeline">` + steps.map((s) => `
      <div class="timeline-item ${s.risk}">
        <div class="t-head">
          <i class="fa-solid ${s.icon}" style="color:#8a93a6;"></i>
          <strong>${s.title}</strong>
          <span class="t-when">${s.time}</span>
        </div>
        <p style="margin-bottom:4px;">${s.detail}</p>
        <div>${s.tag}</div>
      </div>`).join("") + `</div>`;

    window.UIKit.modal({
      title: "Demo: Scam Timeline",
      wide: true,
      bodyHtml: `
        <p style="margin-bottom:16px;font-size:13.5px;color:#4b5563;">Five isolated alerts don't tell a story. Here's the same scam as a connected chronological timeline:</p>
        ${timelineHtml}
        <div style="background:#f4efff;border-left:3px solid #7135d8;border-radius:8px;padding:12px 14px;margin-top:6px;">
          <p style="font-size:13.5px;color:#3d2a6b;line-height:1.6;">Instead of simply saying <strong>"Scam detected,"</strong> UPI Guardian explains the story behind the risk - connecting the message, the QR, the new receiver and the urgent request into one warning before you pay.</p>
        </div>
      `,
      actions: [
        { label: "View my real Scam Timeline", variant: "primary", onClick: () => { window.location.href = "insights.html#timeline"; } },
        { label: "Close", variant: "ghost" },
      ],
    });
  }

  window.UPIGuardianDemos = { runDemo };
})(window);
