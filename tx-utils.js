/**
 * UPI Guardian - shared transaction formatting helpers.
 * Used by dashboard.js, transactions.js and insights.js so every
 * page renders amounts, dates and risk badges the same way.
 */
(function (window) {
  const CATEGORY_ICON = {
    shopping: "fa-solid fa-bag-shopping",
    person: "fa-solid fa-user",
    bill: "fa-solid fa-file-invoice-dollar",
    food: "fa-solid fa-utensils",
    transfer: "fa-solid fa-paper-plane",
    other: "fa-solid fa-circle-notch",
  };

  function formatINR(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return "Today, " + time;
    if (isYesterday) return "Yesterday, " + time;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + ", " + time;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function categoryIcon(category) {
    return CATEGORY_ICON[category] || CATEGORY_ICON.other;
  }

  function riskBadgeHtml(riskLevel) {
    const cls = riskLevel === "high" ? "high" : riskLevel === "medium" ? "medium" : "low";
    const label = cls.charAt(0).toUpperCase() + cls.slice(1) + " Risk";
    return `<span class="risk ${cls}">${label}</span>`;
  }

  function transactionRowHtml(tx) {
    const icon = tx.status === "blocked" ? "fa-solid fa-shield-halved" : categoryIcon(tx.category);
    const riskClass = tx.risk_level === "high" ? "high" : tx.risk_level === "medium" ? "medium" : "low";
    const isBlocked = tx.status === "blocked";
    const amountClass = isBlocked ? "" : riskClass === "high" ? "danger-text" : "";
    const sign = tx.direction === "received" ? "+" : "-";
    const iconBg = isBlocked ? "sister" : riskClass === "high" ? "danger" : tx.direction === "received" ? "sister" : "person";
    const amountHtml = isBlocked
      ? `<strong style="text-decoration:line-through;color:#8a93a6;">${sign}${formatINR(tx.amount)}</strong>`
      : `<strong class="${amountClass}">${sign}${formatINR(tx.amount)}</strong>`;

    return `
      <div class="transaction" data-id="${escapeHtml(tx.id || "")}">
        <div class="transaction-icon ${iconBg}"><i class="${icon}"></i></div>
        <div class="transaction-name">
          <strong>${escapeHtml(tx.payee_name)}${isBlocked ? " (cancelled)" : ""}</strong>
          <small>${escapeHtml(tx.upi_id)}${tx.note ? " &middot; " + escapeHtml(tx.note) : ""}</small>
        </div>
        <div class="transaction-details">
          ${amountHtml}
          <small>${formatDate(tx.created_at)}</small>
        </div>
        ${isBlocked ? '<span class="pill neutral">Blocked by Guardian</span>' : riskBadgeHtml(tx.risk_level)}
        <span class="arrow"><i class="fa-solid fa-chevron-right"></i></span>
      </div>`;
  }

  window.TxUtils = { formatINR, formatDate, escapeHtml, categoryIcon, riskBadgeHtml, transactionRowHtml, CATEGORY_ICON };
})(window);
