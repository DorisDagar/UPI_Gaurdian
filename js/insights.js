/**
 * UPI Guardian - Insights page logic.
 * Pulls transactions + message_analyses from Supabase and renders
 * three Chart.js charts plus a merged "Scam Timeline" feed.
 */
(function () {
  document.addEventListener("upi-guardian:ready", (e) => {
    if (e.detail && e.detail.user) load();
    else showEmpty("Supabase isn't connected - Insights need a live database.");
  });

  async function load() {
    try {
      const [txRes, msgRes] = await Promise.all([
        window.supabaseClient.from("transactions").select("*").order("created_at", { ascending: false }),
        window.supabaseClient.from("message_analyses").select("*").order("created_at", { ascending: false }).limit(20)
          .then((r) => r).catch(() => ({ data: [] })),
      ]);
      if (txRes.error) throw txRes.error;
      const transactions = txRes.data || [];
      const messages = (msgRes && msgRes.data) || [];

      if (!transactions.length && !messages.length) {
        showEmpty();
        return;
      }

      renderCategoryChart(transactions);
      renderRiskChart(transactions);
      renderTrendChart(transactions);
      renderTimeline(transactions, messages);
    } catch (err) {
      console.error(err);
      showEmpty("Couldn't load insights (" + (err.message || "unknown error") + ").");
    }
  }

  function showEmpty(msg) {
    document.getElementById("insightsContent").style.display = "none";
    const empty = document.getElementById("insightsEmpty");
    empty.style.display = "block";
    if (msg) empty.querySelector("p").textContent = msg;
  }

  function renderCategoryChart(rows) {
    const sums = {};
    rows.filter((t) => t.status === "success").forEach((t) => {
      sums[t.category || "other"] = (sums[t.category || "other"] || 0) + Number(t.amount || 0);
    });
    const labels = Object.keys(sums);
    if (!labels.length) { document.getElementById("categoryChart").parentElement.innerHTML += emptyNote(); return; }
    new Chart(document.getElementById("categoryChart"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data: labels.map((l) => sums[l]), backgroundColor: ["#6737e9", "#2188ed", "#e99124", "#18ad68", "#df4c8e", "#a3a8c2"] }],
      },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } } },
    });
  }

  function renderRiskChart(rows) {
    const counts = { low: 0, medium: 0, high: 0 };
    rows.forEach((t) => { counts[t.risk_level] = (counts[t.risk_level] || 0) + 1; });
    new Chart(document.getElementById("riskChart"), {
      type: "bar",
      data: {
        labels: ["Low", "Medium", "High"],
        datasets: [{ data: [counts.low, counts.medium, counts.high], backgroundColor: ["#18ad68", "#e99124", "#e13a3a"], borderRadius: 6 }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  function renderTrendChart(rows) {
    const byMonth = {};
    rows.filter((t) => t.status === "success" && t.direction === "sent").forEach((t) => {
      const d = new Date(t.created_at);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      byMonth[key] = (byMonth[key] || 0) + Number(t.amount || 0);
    });
    const labels = Object.keys(byMonth);
    if (!labels.length) { document.getElementById("trendChart").parentElement.innerHTML += emptyNote(); return; }
    new Chart(document.getElementById("trendChart"), {
      type: "line",
      data: { labels, datasets: [{ data: labels.map((l) => byMonth[l]), borderColor: "#6737e9", backgroundColor: "rgba(103,55,233,0.12)", fill: true, tension: 0.35 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  function emptyNote() {
    return `<p style="font-size:12px;color:#8a93a6;margin-top:8px;">Not enough data yet.</p>`;
  }

  const NOTE_TRIGGER_WORDS = [
    "urgent", "gift card", "lottery", "prize", "refund", "kyc", "blocked",
    "verify now", "otp", "winner", "claim", "reward", "loan approved",
    "double your money", "investment scheme",
  ];

  function noteTriggerWord(note) {
    const t = String(note || "").toLowerCase();
    return NOTE_TRIGGER_WORDS.find((w) => t.includes(w));
  }

  /**
   * Classify each transaction/message into the same signal categories
   * described on the Help page (Suspicious message received, Unknown
   * link/QR detected, New receiver identified, Urgent payment request,
   * High-risk payment alert) so the timeline reads as a connected story
   * instead of a flat "Paid X to Y" feed. Falls back to a plain
   * description when nothing specific stands out.
   */
  function classifyTransaction(t, isFirstTimeReceiver) {
    const paidOrReceived = t.direction === "sent" ? "Paid" : "Received";
    const verb = t.status === "blocked" ? "Blocked" : paidOrReceived;
    const base = `${verb} ${window.TxUtils.formatINR(t.amount)} ${t.direction === "sent" ? "to" : "from"} ${t.payee_name}`;
    const trigger = noteTriggerWord(t.note);

    if (t.risk_level === "high") {
      return { icon: "fa-shield-halved", title: `High-risk payment alert - ${base}` };
    }
    if (trigger) {
      return { icon: "fa-triangle-exclamation", title: `Urgent payment request - ${base}` };
    }
    if (t.category === "qr" || /scan\s*&?\s*pay/i.test(t.note || "")) {
      return { icon: "fa-qrcode", title: `Unknown link/QR detected - ${base}` };
    }
    if (t.direction === "sent" && isFirstTimeReceiver) {
      return { icon: "fa-user", title: `New receiver identified - ${base}` };
    }
    return { icon: "fa-paper-plane", title: base };
  }

  function classifyMessage(m) {
    if (m.risk_level === "medium" || m.risk_level === "high") {
      return { icon: "fa-comment-dots", title: `Suspicious message received - ${m.risk_level} risk (${m.risk_score}%)` };
    }
    return { icon: "fa-comment-dots", title: `Analyzed a message - ${m.risk_level} risk (${m.risk_score}%)` };
  }

  function renderTimeline(transactions, messages) {
    // Work out which sent transactions are to a brand-new UPI ID, based
    // on their real chronological order (earliest first).
    const byTimeAsc = [...transactions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const seenUpi = new Set();
    const firstTimeMap = new Map(); // transaction id -> boolean
    byTimeAsc.forEach((t) => {
      if (t.direction === "sent") {
        const key = (t.upi_id || "").toLowerCase();
        firstTimeMap.set(t.id, key && !seenUpi.has(key));
        if (key) seenUpi.add(key);
      }
    });

    const items = [
      ...transactions.map((t) => {
        const c = classifyTransaction(t, firstTimeMap.get(t.id));
        return {
          type: "transaction", when: t.created_at, risk: t.risk_level,
          title: c.title, icon: c.icon,
          detail: t.upi_id + (t.note ? " · " + t.note : ""),
        };
      }),
      ...messages.map((m) => {
        const c = classifyMessage(m);
        return { type: "message", when: m.created_at, risk: m.risk_level, title: c.title, icon: c.icon, detail: m.excerpt };
      }),
    ].sort((a, b) => new Date(b.when) - new Date(a.when)).slice(0, 25);

    const list = document.getElementById("timelineList");
    if (!items.length) {
      list.innerHTML = `<div class="state-block"><i class="fa-solid fa-clock-rotate-left"></i><p>Nothing to show yet.</p></div>`;
      return;
    }
    list.innerHTML = `<div class="timeline">` + items.map((it) => `
      <div class="timeline-item ${it.risk || "low"}">
        <div class="t-head">
          <i class="fa-solid ${it.icon}" style="color:#8a93a6;"></i>
          <strong>${escapeHtml(it.title)}</strong>
          <span class="pill ${it.risk || "low"}">${(it.risk || "low")}</span>
          <span class="t-when">${window.TxUtils.formatDate(it.when)}</span>
        </div>
        <p>${escapeHtml(it.detail || "")}</p>
      </div>
    `).join("") + `</div>`;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
