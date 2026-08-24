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
    "fake-qr": function () {
      const parsed = window.RiskEngine.parseUpiQr("upi://collect?pa=scanner-scam@upi&pn=Refund%20Desk&am=2500&tn=Refund");
      const result = window.RiskEngine.assessTransactionRisk({
        payeeName: parsed.pn || "Refund Desk", upiId: parsed.pa, amount: Number(parsed.am) || 0,
        note: parsed.tn, history: [], isCollectRequest: parsed.isCollect,
      });
      showResult({
        title: "Demo: Fake QR Code Scam",
        intro: "A scanned QR decodes to a <code>upi://collect</code> link disguised as a refund. Scanning it would REQUEST ₹2,500 from you, not give you a refund:",
        result,
        payee: parsed.pn, amount: Number(parsed.am) || 0,
      });
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

  window.UPIGuardianDemos = { runDemo };
})(window);
