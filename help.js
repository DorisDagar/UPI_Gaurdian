/**
 * UPI Guardian - Help & Support page logic.
 * Recovery checklist (persisted in localStorage - it's a personal
 * to-do list, not sensitive data), safety tips, and a searchable FAQ
 * accordion.
 */
(function () {
  const RECOVERY_STEPS = [
    { title: "Stop - don't send anything else", body: "If a payment is in progress or was just requested, do not approve any further transactions or share any OTP/PIN." },
    { title: "Call your bank's helpline immediately", body: "Ask them to block your UPI ID or freeze the account if fraud is confirmed. Most banks can act within minutes if you call right away." },
    { title: "Raise a dispute in your UPI app", body: "Open the transaction in your UPI app (or here in Transactions) and use \"Raise Dispute\" / \"Report Fraud\" if available." },
    { title: "File a complaint on the Cybercrime portal", body: "Go to cybercrime.gov.in or call 1930 (India's National Cybercrime Helpline) - do this within 24 hours for the best chance of a reversal." },
    { title: "Change your UPI PIN and app password", body: "Especially if you shared an OTP, PIN, or clicked a suspicious link recently." },
    { title: "Warn your trusted contacts", body: "If the scammer had access to your contacts or messages, let people close to you know they may be targeted next." },
  ];

  const TIPS = [
    { icon: "fa-lock", color: "#6737e9", title: "Protect your account", body: "Never share your UPI PIN, OTP, CVV or password with anyone - not even someone claiming to be your bank." },
    { icon: "fa-link-slash", color: "#2188ed", title: "Check every link", body: "Avoid clicking shortened or unfamiliar links sent over SMS/WhatsApp claiming refunds, prizes or KYC updates." },
    { icon: "fa-user-shield", color: "#18ad68", title: "Verify the sender", body: "Confirm payment requests and \"urgent\" messages through the bank's official app or helpline - not the number that texted you." },
    { icon: "fa-qrcode", color: "#e99124", title: "Scan smart", body: "A QR code only needs to be scanned to receive money via a \"pay\" link - scanning to \"claim\" a refund is a common scam pattern." },
    { icon: "fa-hourglass-half", color: "#df4c8e", title: "Slow down under pressure", body: "Scammers create urgency (\"account will be blocked in 1 hour\"). Real banks give you time - pause and verify instead." },
    { icon: "fa-people-group", color: "#a3a8c2", title: "Use Trust Person Confirmation", body: "Turn on a trusted-contact check for large payments in Settings, so someone else can help you sanity-check big transfers." },
  ];

  const FAQS = [
    { q: "How does UPI Guardian decide if a payment is risky?", a: "It checks whether the receiver is new to you, compares the amount against your usual payment size, scans the note for common scam keywords, and checks whether it's a \"collect\" request. Each factor adds to a risk score shown as Low, Medium or High." },
    { q: "What's the difference between \"Pay\" and \"Collect\" requests?", a: "A Pay QR or link sends money TO someone. A Collect request asks the other party to approve money being pulled FROM their account. Scammers disguise Collect requests as refunds or cashback to trick people into approving an outgoing payment." },
    { q: "Is my money actually moving through this app?", a: "UPI Guardian is a safety-education and risk-analysis demo - it records transactions you log so it can analyze your patterns, but it does not connect to a real bank or move real money." },
    { q: "What happens when I cancel a high-risk payment?", a: "It's logged as a \"blocked\" transaction instead of a completed one. This is what powers the \"Money Saved\" figure on your dashboard - it's money you chose not to send after a warning." },
    { q: "How do I add a Trusted Contact?", a: "Go to Settings → Trust Person Confirmation, add their name and UPI ID or mobile number, and optionally set a rupee threshold above which UPI Guardian will remind you to check with them first." },
    { q: "Can I delete my account or data?", a: "Since this app runs on your own Supabase project, you can delete rows directly from the Table Editor in your Supabase dashboard, or drop the tables entirely using the SQL editor." },
    { q: "I got a message analyzed as \"High Risk\" - what should I do?", a: "Don't click any links in it, don't share OTP/PIN, and verify the claim independently through the official app or phone number of whoever it claims to be from. If you've already acted on it, follow the Recovery Method steps above." },
  ];

  document.addEventListener("DOMContentLoaded", () => {
    renderRecovery();
    renderTips();
    renderFaqs(FAQS);
    document.getElementById("faqSearch").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      renderFaqs(FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)));
    });

    if (window.location.hash) {
      setTimeout(() => {
        const el = document.querySelector(window.location.hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  });

  function renderRecovery() {
    const done = JSON.parse(localStorage.getItem("upiGuardianRecoveryDone") || "[]");
    const el = document.getElementById("recoveryStepper");
    el.innerHTML = RECOVERY_STEPS.map((s, i) => `
      <div class="step-row ${done.includes(i) ? "done" : ""}" data-idx="${i}">
        <div class="step-num">${done.includes(i) ? '<i class="fa-solid fa-check"></i>' : i + 1}</div>
        <div>
          <h4>${escapeHtml(s.title)}</h4>
          <p>${escapeHtml(s.body)}</p>
          <label><input type="checkbox" class="recovery-check" ${done.includes(i) ? "checked" : ""}> Mark step complete</label>
        </div>
      </div>`).join("");

    el.querySelectorAll(".recovery-check").forEach((box) => {
      box.addEventListener("change", (e) => {
        const idx = Number(e.target.closest(".step-row").dataset.idx);
        let done = JSON.parse(localStorage.getItem("upiGuardianRecoveryDone") || "[]");
        if (e.target.checked) { if (!done.includes(idx)) done.push(idx); }
        else { done = done.filter((d) => d !== idx); }
        localStorage.setItem("upiGuardianRecoveryDone", JSON.stringify(done));
        renderRecovery();
      });
    });
  }

  function renderTips() {
    document.getElementById("tipsList").innerHTML = TIPS.map((t) => `
      <div style="display:flex;gap:14px;align-items:flex-start;">
        <i class="fa-solid ${t.icon}" style="font-size:20px;color:${t.color};width:30px;text-align:center;margin-top:2px;"></i>
        <div><strong style="display:block;font-size:14px;color:#111827;margin-bottom:2px;">${escapeHtml(t.title)}</strong>
        <span style="font-size:13px;color:#6b7280;">${escapeHtml(t.body)}</span></div>
      </div>`).join("");
  }

  function renderFaqs(items) {
    const el = document.getElementById("faqList");
    if (!items.length) {
      el.innerHTML = `<p style="font-size:13px;color:#8a93a6;">No FAQs match your search.</p>`;
      return;
    }
    el.innerHTML = items.map((f, i) => `
      <div class="accordion-item" data-idx="${i}">
        <div class="accordion-q"><span>${escapeHtml(f.q)}</span><i class="fa-solid fa-chevron-down"></i></div>
        <div class="accordion-a"><p>${escapeHtml(f.a)}</p></div>
      </div>`).join("");
    el.querySelectorAll(".accordion-q").forEach((q) => {
      q.addEventListener("click", () => {
        const item = q.parentElement;
        const answer = item.querySelector(".accordion-a");
        const willOpen = !item.classList.contains("open");
        item.classList.toggle("open", willOpen);
        answer.style.maxHeight = willOpen ? answer.scrollHeight + "px" : "0";
      });
    });
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
