/**
 * UPI Guardian - Transaction History page logic
 * Reads/writes the `transactions` table in Supabase (see supabase/schema.sql).
 */
(function () {
  const PAGE_SIZE = 8;

  const CATEGORY_ICON = {
    shopping: "fa-solid fa-bag-shopping",
    person: "fa-solid fa-user",
    bill: "fa-solid fa-file-invoice-dollar",
    food: "fa-solid fa-utensils",
    transfer: "fa-solid fa-paper-plane",
    other: "fa-solid fa-circle-notch",
  };

  const SAMPLE_TRANSACTIONS = [
    { payee_name: "Amazon India", upi_id: "amazon@apl", amount: 950, direction: "sent", category: "shopping", risk_level: "low", note: "Order #12345" },
    { payee_name: "Rahul Kumar", upi_id: "rahul123@upi", amount: 500, direction: "sent", category: "person", risk_level: "low", note: null },
    { payee_name: "Unknown Receiver", upi_id: "xyz123@upi", amount: 50000, direction: "sent", category: "other", risk_level: "high", note: "First-time receiver, unusually large amount" },
    { payee_name: "Flipkart", upi_id: "flipkart@apl", amount: 1299, direction: "sent", category: "shopping", risk_level: "low", note: null },
    { payee_name: "Sister", upi_id: "sister@upi", amount: 2000, direction: "sent", category: "person", risk_level: "low", note: null },
    { payee_name: "Electricity Board", upi_id: "bescom@upi", amount: 1840, direction: "sent", category: "bill", risk_level: "medium", note: "Slightly higher than usual bill" },
  ];

  const els = {};
  let allTransactions = [];
  let currentPage = 1;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheEls();
    bindEvents();

    if (!window.supabaseClient) {
      showConfigWarning();
      return;
    }

    loadTransactions();
    subscribeToChanges();
  }

  function cacheEls() {
    els.list = document.getElementById("txList");
    els.loading = document.getElementById("txLoading");
    els.empty = document.getElementById("txEmpty");
    els.error = document.getElementById("txError");
    els.errorText = document.getElementById("txErrorText");
    els.pagination = document.getElementById("txPagination");
    els.resultCount = document.getElementById("resultCount");
    els.search = document.getElementById("searchInput");
    els.riskFilter = document.getElementById("riskFilter");
    els.directionFilter = document.getElementById("directionFilter");
    els.sortFilter = document.getElementById("sortFilter");
    els.refreshBtn = document.getElementById("refreshBtn");
    els.seedBtn = document.getElementById("seedBtn");
    els.statTotal = document.getElementById("statTotal");
    els.statAmount = document.getElementById("statAmount");
    els.statHigh = document.getElementById("statHigh");
    els.statLow = document.getElementById("statLow");
  }

  function bindEvents() {
    els.search.addEventListener("input", debounce(() => { currentPage = 1; render(); }, 200));
    els.riskFilter.addEventListener("change", () => { currentPage = 1; render(); });
    els.directionFilter.addEventListener("change", () => { currentPage = 1; render(); });
    els.sortFilter.addEventListener("change", () => { currentPage = 1; render(); });
    els.refreshBtn.addEventListener("click", loadTransactions);
    if (els.seedBtn) els.seedBtn.addEventListener("click", seedSampleData);
  }

  function showConfigWarning() {
    setState("error");
    els.errorText.innerHTML =
      "Supabase isn't connected yet. Open <code>js/supabase-config.js</code> " +
      "and add your project URL + anon key, then run " +
      "<code>supabase/schema.sql</code> in the Supabase SQL editor.";
  }

  async function loadTransactions() {
    setState("loading");
    try {
      const { data, error } = await window.supabaseClient
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      allTransactions = data || [];
      render();
    } catch (err) {
      console.error(err);
      setState("error");
      els.errorText.textContent =
        "Couldn't load transactions (" + (err.message || "unknown error") + "). " +
        "Check your Supabase URL/key and that the transactions table exists.";
    }
  }

  async function seedSampleData() {
    if (!window.supabaseClient) return;
    els.seedBtn.disabled = true;
    els.seedBtn.textContent = "Adding sample data...";
    try {
      const { data: userData } = await window.supabaseClient.auth.getUser();
      const uid = userData && userData.user && userData.user.id;
      const rows = SAMPLE_TRANSACTIONS.map((t) => ({ ...t, user_id: uid, status: "success" }));
      const { error } = await window.supabaseClient.from("transactions").insert(rows);
      if (error) throw error;
      await loadTransactions();
    } catch (err) {
      console.error(err);
      alert(
        "Couldn't insert sample data: " + (err.message || "unknown error") +
        "\n\nIf RLS is on, either sign in first or temporarily enable the " +
        "demo policy commented in supabase/schema.sql."
      );
    } finally {
      els.seedBtn.disabled = false;
      els.seedBtn.textContent = "Load Sample Data";
    }
  }

  function subscribeToChanges() {
    window.supabaseClient
      .channel("transactions-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, loadTransactions)
      .subscribe();
  }

  function getFiltered() {
    const q = els.search.value.trim().toLowerCase();
    const risk = els.riskFilter.value;
    const direction = els.directionFilter.value;
    const sort = els.sortFilter.value;

    let rows = allTransactions.filter((tx) => {
      const matchesQuery =
        !q ||
        (tx.payee_name || "").toLowerCase().includes(q) ||
        (tx.upi_id || "").toLowerCase().includes(q);
      const matchesRisk = risk === "all" || tx.risk_level === risk;
      const matchesDirection = direction === "all" || tx.direction === direction;
      return matchesQuery && matchesRisk && matchesDirection;
    });

    rows = rows.slice().sort((a, b) => {
      if (sort === "amount_desc") return b.amount - a.amount;
      if (sort === "amount_asc") return a.amount - b.amount;
      if (sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      return new Date(b.created_at) - new Date(a.created_at); // newest (default)
    });

    return rows;
  }

  function render() {
    const filtered = getFiltered();
    renderStats(allTransactions);
    els.resultCount.textContent = filtered.length + (filtered.length === 1 ? " transaction" : " transactions");

    if (allTransactions.length === 0) {
      setState("empty");
      return;
    }
    if (filtered.length === 0) {
      setState("no-results");
      return;
    }
    setState("list");

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    els.list.innerHTML = pageRows.map(rowHtml).join("");
    renderPagination(totalPages);
  }

  function renderStats(rows) {
    const total = rows.length;
    const totalAmount = rows.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const high = rows.filter((t) => t.risk_level === "high").length;
    const low = rows.filter((t) => t.risk_level === "low").length;

    els.statTotal.textContent = total;
    els.statAmount.textContent = formatINR(totalAmount);
    els.statHigh.textContent = high;
    els.statLow.textContent = total ? Math.round((low / total) * 100) + "%" : "0%";
  }

  function rowHtml(tx) {
    return window.TxUtils.transactionRowHtml(tx);
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      els.pagination.innerHTML = "";
      return;
    }
    let html = `<button class="page-btn" data-page="prev" ${currentPage === 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i></button>`;
    html += `<span class="page-info">Page ${currentPage} of ${totalPages}</span>`;
    html += `<button class="page-btn" data-page="next" ${currentPage === totalPages ? "disabled" : ""}><i class="fa-solid fa-chevron-right"></i></button>`;
    els.pagination.innerHTML = html;

    els.pagination.querySelectorAll(".page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.page === "prev") currentPage--;
        else currentPage++;
        render();
      });
    });
  }

  function setState(state) {
    els.loading.hidden = state !== "loading";
    els.error.hidden = state !== "error";
    els.empty.hidden = state !== "empty";
    els.list.hidden = !(state === "list" || state === "no-results");
    els.pagination.hidden = state !== "list";

    if (state === "no-results") {
      els.list.innerHTML = `<div class="state-msg"><i class="fa-solid fa-magnifying-glass"></i><p>No transactions match your filters.</p></div>`;
    }
  }

  function formatINR(amount) {
    return window.TxUtils.formatINR(amount);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
})();
