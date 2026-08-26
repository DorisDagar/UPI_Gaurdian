/**
 * UPI Guardian - Recovery Mode wizard.
 * Implements the 7-step "what to do after you've already paid" flow:
 *   1. Identify the suspicious transaction
 *   2. Immediate Action
 *   3. Trusted Person Assistance
 *   4. Evidence Locker
 *   5. Scam Timeline
 *   6. Fraud Incident Report
 *   7. Recovery Progress Tracker
 *
 * For this prototype the active case is persisted to localStorage
 * (per-browser), same pattern as the existing recovery checklist in
 * js/help.js. The transaction picker and trusted-contact picker read
 * live data from Supabase when it's configured, and fall back to a
 * small local sample so the flow is still fully usable in demo mode.
 */
(function () {
  const CASE_KEY = "upiGuardianRecoveryCase_v1";
  const STEPS = [
    { n: 1, label: "Transaction" },
    { n: 2, label: "Immediate Action" },
    { n: 3, label: "Trusted Person" },
    { n: 4, label: "Evidence" },
    { n: 5, label: "Timeline" },
    { n: 6, label: "Report" },
    { n: 7, label: "Progress" },
  ];

  const IMMEDIATE_STEPS = [
    { title: "Stop - don't send anything else", body: "If a payment is in progress or was just requested, do not approve any further transactions or share any OTP/PIN." },
    { title: "Call your bank's helpline immediately", body: "Ask them to block your UPI ID or freeze the account if fraud is confirmed. Most banks can act within minutes if you call right away." },
    { title: "Mark this transaction as suspicious", body: "Flag it here and in your real UPI app (\"Raise Dispute\" / \"Report Fraud\") so there's a formal record." },
    { title: "File a complaint on the Cybercrime portal", body: "Go to cybercrime.gov.in or call 1930 (India's National Cybercrime Helpline) - do this within 24 hours for the best chance of a reversal." },
    { title: "Change your UPI PIN and app password", body: "Especially if you shared an OTP, PIN, or clicked a suspicious link recently." },
    { title: "Avoid further contact with the scammer", body: "Don't reply, call back, or make any 'verification' payment they ask for to 'reverse' the transaction - that's a common follow-up scam." },
  ];

  const TP_TASKS = [
    "Understand what happened",
    "Review the suspicious transaction",
    "Check the actions already taken",
    "Assist during the recovery process",
  ];

  const SAMPLE_TRANSACTIONS = [
    { id: "sample-1", payee_name: "Unknown Receiver", upi_id: "xyz123@upi", amount: 50000, direction: "sent", category: "other", risk_level: "high", note: "First-time receiver, unusually large amount", created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
    { id: "sample-2", payee_name: "Electricity Board", upi_id: "bescom@upi", amount: 1840, direction: "sent", category: "bill", risk_level: "medium", note: "Slightly higher than usual bill", created_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString() },
    { id: "sample-3", payee_name: "Amazon India", upi_id: "amazon@apl", amount: 950, direction: "sent", category: "shopping", risk_level: "low", note: "Order #12345", created_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString() },
  ];

  let currentUser = null;
  let allTransactions = [];
  let allContacts = [];
  let allMessages = [];
  let currentStep = 1;
  let kase = loadCase();

  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("upi-guardian:ready", (e) => {
    currentUser = e.detail && e.detail.user;
    loadRemoteData();
  });

  function init() {
    renderWizardNav();
    bindStaticEvents();
    goToStep(1);
    renderAll();
  }

  // ---------------------------------------------------------------- case
  function loadCase() {
    try {
      const raw = localStorage.getItem(CASE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore corrupt data */ }
    return freshCase();
  }

  function freshCase() {
    return {
      createdAt: new Date().toISOString(),
      transaction: null,
      immediateDone: [],
      trustedPerson: null,
      evidence: [],
      timelineExtra: [],
      reportDescription: "",
      reportGeneratedAt: null,
      status: "in_progress",
    };
  }

  function saveCase() {
    try {
      localStorage.setItem(CASE_KEY, JSON.stringify(kase));
    } catch (err) {
      window.UIKit.toast("Couldn't save locally - evidence with large images may be too big for this browser.", "error");
    }
  }

  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  // ---------------------------------------------------------- remote data
  async function loadRemoteData() {
    if (!window.supabaseClient || !currentUser) {
      allTransactions = SAMPLE_TRANSACTIONS.slice();
      renderTxPicker();
      renderSavedContacts();
      return;
    }
    try {
      const { data, error } = await window.supabaseClient.from("transactions").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      allTransactions = (data && data.length) ? data : SAMPLE_TRANSACTIONS.slice();
    } catch (_) {
      allTransactions = SAMPLE_TRANSACTIONS.slice();
    }
    renderTxPicker();

    try {
      const { data, error } = await window.supabaseClient.from("trusted_contacts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      allContacts = data || [];
    } catch (_) { allContacts = []; }
    renderSavedContacts();

    try {
      const { data, error } = await window.supabaseClient.from("message_analyses").select("*").in("risk_level", ["high", "medium"]).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      allMessages = data || [];
    } catch (_) { allMessages = []; }
    renderTimeline();
  }

  // -------------------------------------------------------------- wizard
  function renderWizardNav() {
    const el = $("wizardNav");
    el.innerHTML = STEPS.map((s) => `
      <button type="button" class="wizard-step-btn ${stepDone(s.n) ? "done" : ""} ${currentStep === s.n ? "active" : ""}" data-step="${s.n}">
        <span class="num">${stepDone(s.n) ? '<i class="fa-solid fa-check"></i>' : s.n}</span>${s.label}
      </button>`).join("");
    el.querySelectorAll(".wizard-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => goToStep(Number(btn.dataset.step)));
    });
  }

  function stepDone(n) {
    if (n === 1) return !!kase.transaction;
    if (n === 2) return kase.immediateDone.length > 0;
    if (n === 3) return !!(kase.trustedPerson && kase.trustedPerson.informedAt);
    if (n === 4) return kase.evidence.length > 0;
    if (n === 5) return kase.timelineExtra.length > 0;
    if (n === 6) return !!kase.reportGeneratedAt;
    return false;
  }

  function goToStep(n) {
    currentStep = Math.min(Math.max(n, 1), STEPS.length);
    document.querySelectorAll(".wizard-panel").forEach((p) => p.classList.toggle("active", Number(p.dataset.step) === currentStep));
    renderWizardNav();
    $("prevStepBtn").disabled = currentStep === 1;
    $("nextStepBtn").innerHTML = currentStep === STEPS.length
      ? 'Done <i class="fa-solid fa-check"></i>'
      : 'Next <i class="fa-solid fa-arrow-right"></i>';
    if (currentStep === 5) renderTimeline();
    if (currentStep === 7) renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindStaticEvents() {
    $("prevStepBtn").addEventListener("click", () => goToStep(currentStep - 1));
    $("nextStepBtn").addEventListener("click", () => {
      if (currentStep === STEPS.length) { window.UIKit.toast("Case progress saved on this device.", "success"); return; }
      goToStep(currentStep + 1);
    });

    $("newCaseBtn").addEventListener("click", () => {
      window.UIKit.modal({
        title: "Start a new case?",
        bodyHtml: "This clears the current recovery case from this device (transaction, evidence, timeline and report). This can't be undone.",
        actions: [
          { label: "Cancel", variant: "ghost" },
          { label: "Start New Case", variant: "danger", onClick: () => { kase = freshCase(); saveCase(); goToStep(1); renderAll(); window.UIKit.toast("Started a new case.", "success"); } },
        ],
      });
    });

    // Step 1
    $("txSearch").addEventListener("input", renderTxPicker);
    $("changeTxBtn").addEventListener("click", () => { kase.transaction = null; saveCase(); renderStep1(); renderWizardNav(); });
    $("useManualTxBtn").addEventListener("click", useManualTransaction);

    // Step 3
    $("involveTpBtn").addEventListener("click", involveTrustedPerson);
    $("removeTpBtn").addEventListener("click", () => {
      kase.trustedPerson = null; saveCase(); renderStep3(); renderWizardNav();
    });

    // Step 4
    $("addEvidenceBtn").addEventListener("click", addEvidence);

    // Step 5
    $("addTimelineBtn").addEventListener("click", addTimelineEvent);

    // Step 6
    $("generateReportBtn").addEventListener("click", generateReport);
    $("downloadReportBtn").addEventListener("click", downloadReport);
    $("printReportBtn").addEventListener("click", () => {
      if (!kase.reportGeneratedAt) generateReport();
      window.print();
    });

    // Step 7
    $("overallStatus").addEventListener("change", (e) => {
      kase.status = e.target.value; saveCase(); renderProgress();
    });
  }

  function renderAll() {
    renderStep1();
    renderStep2();
    renderStep3();
    renderStep4();
    renderTimeline();
    renderStep6();
    renderProgress();
    renderWizardNav();
  }

  // ---------------------------------------------------------------- step 1
  function renderTxPicker() {
    const q = ($("txSearch").value || "").toLowerCase();
    const list = $("txPickerList");
    const rows = allTransactions.filter((t) =>
      !q || (t.payee_name || "").toLowerCase().includes(q) || (t.upi_id || "").toLowerCase().includes(q));
    if (!rows.length) {
      list.innerHTML = `<p style="font-size:13px;color:#8a93a6;">No transactions match. Use the manual entry below instead.</p>`;
      return;
    }
    list.innerHTML = rows.slice(0, 12).map((t) => `
      <div class="tx-pick-row" data-id="${t.id}">
        <div class="tx-ic"><i class="fa-solid fa-${t.risk_level === "high" ? "triangle-exclamation" : "receipt"}"></i></div>
        <div class="tx-info"><strong>${esc(t.payee_name)}</strong><small>${esc(t.upi_id)} &middot; ${window.TxUtils.formatDate(t.created_at)}</small></div>
        <div class="tx-amt">${window.TxUtils.formatINR(t.amount)}<br>${window.TxUtils.riskBadgeHtml(t.risk_level)}</div>
      </div>`).join("");
    list.querySelectorAll(".tx-pick-row").forEach((row) => {
      row.addEventListener("click", () => {
        const tx = allTransactions.find((t) => String(t.id) === row.dataset.id);
        if (tx) selectTransaction({ source: "history", ...tx });
      });
    });
  }

  function useManualTransaction() {
    const payee = $("manualPayee").value.trim();
    const upi = $("manualUpi").value.trim();
    const amount = Number($("manualAmount").value) || 0;
    if (!payee || !upi || !amount) {
      window.UIKit.toast("Enter at least the receiver name, UPI ID and amount.", "error");
      return;
    }
    selectTransaction({
      source: "manual",
      id: "manual-" + uid(),
      payee_name: payee,
      upi_id: upi,
      amount,
      created_at: $("manualDate").value ? new Date($("manualDate").value).toISOString() : new Date().toISOString(),
      note: $("manualRef").value.trim() || null,
      risk_level: $("manualRisk").value,
    });
  }

  function selectTransaction(tx) {
    kase.transaction = tx;
    saveCase();
    renderStep1();
    renderStep2();
    renderWizardNav();
    window.UIKit.toast("Transaction selected for this case.", "success");
  }

  function renderStep1() {
    const has = !!kase.transaction;
    $("selectedTxWrap").hidden = !has;
    $("txPickerWrap").hidden = has;
    if (!has) return;
    const t = kase.transaction;
    $("selectedTxCard").innerHTML = `
      <div class="row"><span>Receiver</span><span>${esc(t.payee_name)}</span></div>
      <div class="row"><span>UPI ID</span><span>${esc(t.upi_id)}</span></div>
      <div class="row"><span>Amount</span><span>${window.TxUtils.formatINR(t.amount)}</span></div>
      <div class="row"><span>Reference / note</span><span>${esc(t.note || t.id || "—")}</span></div>
      <div class="row"><span>Date &amp; time</span><span>${window.TxUtils.formatDate(t.created_at)}</span></div>
      <div class="row"><span>Risk level</span><span>${window.TxUtils.riskBadgeHtml(t.risk_level)}</span></div>`;
  }

  // ---------------------------------------------------------------- step 2
  function renderStep2() {
    const el = $("immediateStepper");
    el.innerHTML = IMMEDIATE_STEPS.map((s, i) => `
      <div class="step-row ${kase.immediateDone.includes(i) ? "done" : ""}" data-idx="${i}">
        <div class="step-num">${kase.immediateDone.includes(i) ? '<i class="fa-solid fa-check"></i>' : i + 1}</div>
        <div>
          <h4>${esc(s.title)}</h4>
          <p>${esc(s.body)}</p>
          <label><input type="checkbox" class="im-check" ${kase.immediateDone.includes(i) ? "checked" : ""}> Mark step complete</label>
        </div>
      </div>`).join("");
    el.querySelectorAll(".im-check").forEach((box) => {
      box.addEventListener("change", (e) => {
        const idx = Number(e.target.closest(".step-row").dataset.idx);
        if (e.target.checked) { if (!kase.immediateDone.includes(idx)) kase.immediateDone.push(idx); }
        else { kase.immediateDone = kase.immediateDone.filter((d) => d !== idx); }
        saveCase();
        renderStep2();
        renderWizardNav();
      });
    });
  }

  // ---------------------------------------------------------------- step 3
  function renderSavedContacts() {
    const sel = $("savedContactSelect");
    if (!allContacts.length) {
      sel.innerHTML = `<option value="">No saved trusted contacts yet</option>`;
      return;
    }
    sel.innerHTML = `<option value="">Select a saved contact…</option>` +
      allContacts.map((c) => `<option value="${c.id}">${esc(c.name)} (${esc(c.upi_id || c.mobile || "")})</option>`).join("");
  }

  function involveTrustedPerson() {
    const savedId = $("savedContactSelect").value;
    let name, contact;
    if (savedId) {
      const c = allContacts.find((x) => String(x.id) === savedId);
      if (!c) return;
      name = c.name; contact = c.upi_id || c.mobile || "";
    } else {
      name = $("tpName").value.trim();
      contact = $("tpContact").value.trim();
    }
    if (!name) { window.UIKit.toast("Choose or enter a trusted person's name.", "error"); return; }
    kase.trustedPerson = { name, contact, informedAt: new Date().toISOString(), tasksDone: [] };
    saveCase();
    renderStep3();
    renderWizardNav();
    window.UIKit.toast(name + " has been involved in this case.", "success");
  }

  function renderStep3() {
    const has = !!kase.trustedPerson;
    $("trustedContactPicker").hidden = has;
    $("trustedPersonCard").hidden = !has;
    if (!has) return;
    const tp = kase.trustedPerson;
    $("tpCardBody").innerHTML = `
      <div class="row"><span>Name</span><span>${esc(tp.name)}</span></div>
      <div class="row"><span>Contact</span><span>${esc(tp.contact || "—")}</span></div>
      <div class="row"><span>Involved since</span><span>${window.TxUtils.formatDate(tp.informedAt)}</span></div>`;
    $("tpTaskStepper").innerHTML = TP_TASKS.map((task, i) => `
      <div class="step-row ${tp.tasksDone.includes(i) ? "done" : ""}" data-idx="${i}">
        <div class="step-num">${tp.tasksDone.includes(i) ? '<i class="fa-solid fa-check"></i>' : i + 1}</div>
        <div><h4>${esc(task)}</h4><label><input type="checkbox" class="tp-check" ${tp.tasksDone.includes(i) ? "checked" : ""}> Mark complete</label></div>
      </div>`).join("");
    $("tpTaskStepper").querySelectorAll(".tp-check").forEach((box) => {
      box.addEventListener("change", (e) => {
        const idx = Number(e.target.closest(".step-row").dataset.idx);
        if (e.target.checked) { if (!tp.tasksDone.includes(idx)) tp.tasksDone.push(idx); }
        else { tp.tasksDone = tp.tasksDone.filter((d) => d !== idx); }
        saveCase();
        renderStep3();
      });
    });
  }

  // ---------------------------------------------------------------- step 4
  function addEvidence() {
    const type = $("evType").value;
    const title = $("evTitle").value.trim();
    const detail = $("evDetail").value.trim();
    const file = $("evFile").files[0];
    if (!title && !detail && !file) {
      window.UIKit.toast("Add a title, some detail, or a screenshot.", "error");
      return;
    }
    const item = { id: uid(), type, title: title || defaultTitle(type), detail, addedAt: new Date().toISOString(), imageDataUrl: null };

    const finish = () => {
      kase.evidence.push(item);
      saveCase();
      $("evTitle").value = ""; $("evDetail").value = ""; $("evFile").value = "";
      renderStep4();
      renderWizardNav();
      window.UIKit.toast("Added to Evidence Locker.", "success");
    };

    if (file && file.size <= 2 * 1024 * 1024 && /image\/(png|jpeg)/.test(file.type)) {
      const reader = new FileReader();
      reader.onload = () => { item.imageDataUrl = reader.result; finish(); };
      reader.onerror = finish;
      reader.readAsDataURL(file);
    } else {
      if (file) window.UIKit.toast("Screenshot skipped (must be PNG/JPG under 2MB) - saved the rest.", "info");
      finish();
    }
  }

  function defaultTitle(type) {
    return { screenshot: "Screenshot", message: "Scam message", link: "Suspicious link", qr: "QR code details", other: "Evidence" }[type] || "Evidence";
  }

  function evidenceIcon(type) {
    return { screenshot: "fa-image", message: "fa-comment-dots", link: "fa-link", qr: "fa-qrcode", other: "fa-file" }[type] || "fa-file";
  }

  function renderStep4() {
    const list = $("evidenceList");
    if (!kase.evidence.length) {
      list.innerHTML = `<p style="font-size:13px;color:#8a93a6;">No evidence added yet.</p>`;
      return;
    }
    list.innerHTML = kase.evidence.slice().reverse().map((ev) => `
      <div class="evidence-card" data-id="${ev.id}">
        ${ev.imageDataUrl ? `<img src="${ev.imageDataUrl}" alt="">` : `<div class="ic"><i class="fa-solid ${evidenceIcon(ev.type)}"></i></div>`}
        <div class="body">
          <strong>${esc(ev.title)}</strong>
          ${ev.detail ? `<p>${esc(ev.detail)}</p>` : ""}
          <small>${window.TxUtils.formatDate(ev.addedAt)}</small>
        </div>
        <button type="button" class="btn btn-ghost btn-sm remove-ev-btn"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    list.querySelectorAll(".remove-ev-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest(".evidence-card").dataset.id;
        kase.evidence = kase.evidence.filter((e) => e.id !== id);
        saveCase();
        renderStep4();
        renderWizardNav();
      });
    });
  }

  // ---------------------------------------------------------------- step 5
  function addTimelineEvent() {
    const label = $("tlLabel").value.trim();
    if (!label) { window.UIKit.toast("Describe what happened at this step.", "error"); return; }
    const when = $("tlWhen").value ? new Date($("tlWhen").value).toISOString() : new Date().toISOString();
    kase.timelineExtra.push({ id: uid(), label, when });
    saveCase();
    $("tlLabel").value = ""; $("tlWhen").value = "";
    renderTimeline();
    renderWizardNav();
  }

  function buildTimelineItems() {
    const items = [];
    allMessages.forEach((m) => items.push({
      when: m.created_at, risk: m.risk_level,
      title: `Received / analyzed a suspicious message (${m.risk_level} risk)`,
      detail: m.excerpt, icon: "fa-comment-dots",
    }));
    kase.evidence.forEach((ev) => items.push({
      when: ev.addedAt, risk: "low",
      title: `Saved evidence: ${ev.title}`, detail: ev.detail || "", icon: evidenceIcon(ev.type),
    }));
    if (kase.transaction) items.push({
      when: kase.transaction.created_at, risk: kase.transaction.risk_level,
      title: `Made payment of ${window.TxUtils.formatINR(kase.transaction.amount)} to ${kase.transaction.payee_name}`,
      detail: kase.transaction.upi_id, icon: "fa-paper-plane",
    });
    if (kase.trustedPerson) items.push({
      when: kase.trustedPerson.informedAt, risk: "low",
      title: `Informed trusted person: ${kase.trustedPerson.name}`, detail: "", icon: "fa-user-group",
    });
    items.push({ when: kase.createdAt, risk: "high", title: "Fraud detected - recovery case started", detail: "", icon: "fa-shield-halved" });
    kase.timelineExtra.forEach((t) => items.push({ when: t.when, risk: "medium", title: t.label, detail: "", icon: "fa-pen" }));
    return items.sort((a, b) => new Date(a.when) - new Date(b.when));
  }

  function renderTimeline() {
    const wrap = $("timelineWrap");
    if (!wrap) return;
    const items = buildTimelineItems();
    if (!items.length) {
      wrap.innerHTML = `<p style="font-size:13px;color:#8a93a6;">Nothing to show yet.</p>`;
      return;
    }
    wrap.innerHTML = `<div class="timeline">` + items.map((it) => `
      <div class="timeline-item ${it.risk || "low"}">
        <div class="t-head">
          <i class="fa-solid ${it.icon}" style="color:#8a93a6;"></i>
          <strong>${esc(it.title)}</strong>
          <span class="t-when">${window.TxUtils.formatDate(it.when)}</span>
        </div>
        ${it.detail ? `<p>${esc(it.detail)}</p>` : ""}
      </div>`).join("") + `</div>`;
  }

  // ---------------------------------------------------------------- step 6
  function renderStep6() {
    $("reportDescription").value = kase.reportDescription || "";
    if (kase.reportGeneratedAt) renderReportPreview();
  }

  function generateReport() {
    kase.reportDescription = $("reportDescription").value.trim();
    kase.reportGeneratedAt = new Date().toISOString();
    saveCase();
    renderReportPreview();
    renderWizardNav();
    window.UIKit.toast("Report generated.", "success");
  }

  function reportText() {
    const t = kase.transaction;
    const name = (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) || "—";
    const mobile = (currentUser && currentUser.user_metadata && currentUser.user_metadata.mobile) || "—";
    const items = buildTimelineItems();

    let out = "";
    out += "UPI GUARDIAN - FRAUD INCIDENT REPORT\n";
    out += "Generated: " + new Date().toLocaleString("en-IN") + "\n";
    out += "=".repeat(50) + "\n\n";
    out += "VICTIM / USER DETAILS\n" + "-".repeat(22) + "\n";
    out += "Name: " + name + "\nMobile: " + mobile + "\n\n";
    out += "TRANSACTION INFORMATION\n" + "-".repeat(24) + "\n";
    if (t) {
      out += "Receiver: " + t.payee_name + "\nUPI ID: " + t.upi_id + "\nAmount: " + window.TxUtils.formatINR(t.amount) +
        "\nReference: " + (t.note || t.id || "—") + "\nDate & time: " + window.TxUtils.formatDate(t.created_at) +
        "\nRisk level: " + t.risk_level + "\n\n";
    } else {
      out += "No transaction selected.\n\n";
    }
    out += "DESCRIPTION OF INCIDENT\n" + "-".repeat(24) + "\n";
    out += (kase.reportDescription || "Not provided.") + "\n\n";
    out += "SCAM TIMELINE\n" + "-".repeat(14) + "\n";
    out += items.map((it) => "- " + window.TxUtils.formatDate(it.when) + ": " + it.title).join("\n") + "\n\n";
    out += "AVAILABLE EVIDENCE (" + kase.evidence.length + ")\n" + "-".repeat(24) + "\n";
    out += kase.evidence.length
      ? kase.evidence.map((ev) => "- [" + ev.type + "] " + ev.title + (ev.detail ? ": " + ev.detail : "")).join("\n") + "\n\n"
      : "None recorded.\n\n";
    out += "TRUSTED PERSON INVOLVED\n" + "-".repeat(24) + "\n";
    out += kase.trustedPerson ? (kase.trustedPerson.name + " (" + (kase.trustedPerson.contact || "—") + ")\n\n") : "None.\n\n";
    out += "IMMEDIATE ACTIONS COMPLETED: " + kase.immediateDone.length + " / " + IMMEDIATE_STEPS.length + "\n";
    out += "CASE STATUS: " + kase.status + "\n";
    return out;
  }

  function renderReportPreview() {
    $("reportPreview").textContent = reportText();
  }

  function downloadReport() {
    if (!kase.reportGeneratedAt) generateReport();
    const blob = new Blob([reportText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "upi-guardian-fraud-report-" + Date.now() + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------- step 7
  function renderProgress() {
    $("overallStatus").value = kase.status || "in_progress";
    const stages = [
      { label: "Incident Detected", desc: "Recovery case started.", done: true },
      { label: "Transaction Identified", desc: kase.transaction ? "Selected: " + kase.transaction.payee_name : "Not yet selected.", done: !!kase.transaction },
      { label: "Evidence Collected", desc: kase.evidence.length ? kase.evidence.length + " item(s) saved." : "No evidence yet.", done: kase.evidence.length > 0 },
      { label: "Trusted Person Informed", desc: kase.trustedPerson ? kase.trustedPerson.name + " is helping." : "No one involved yet.", done: !!(kase.trustedPerson && kase.trustedPerson.informedAt) },
      { label: "Report Prepared", desc: kase.reportGeneratedAt ? "Generated " + window.TxUtils.formatDate(kase.reportGeneratedAt) : "Not generated yet.", done: !!kase.reportGeneratedAt },
      { label: "Recovery Actions in Progress", desc: statusLabel(kase.status), done: kase.status !== "in_progress" },
    ];
    let currentSet = false;
    $("progressTrack").innerHTML = stages.map((s) => {
      let cls = s.done ? "done" : "";
      if (!s.done && !currentSet) { cls += " current"; currentSet = true; }
      return `<div class="p-row ${cls.trim()}">
        <div class="p-dot"><i class="fa-solid ${s.done ? "fa-check" : "fa-ellipsis"}"></i></div>
        <div><strong>${esc(s.label)}</strong><p>${esc(s.desc)}</p></div>
      </div>`;
    }).join("");
  }

  function statusLabel(status) {
    return status === "resolved" ? "Resolved / money recovered." : status === "closed_no_recovery" ? "Closed - not recovered." : "Still in progress.";
  }

  function esc(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
