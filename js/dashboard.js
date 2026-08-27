async function initDashboard() {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    // Fetch transactions
    const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

    // 1. Update Safety Score (Dynamic Average)
    const avgRisk = txs.length > 0 
        ? txs.reduce((sum, t) => sum + t.risk_score, 0) / txs.length 
        : 0;
    const safetyScore = Math.max(10, 100 - avgRisk);
    document.getElementById('statSafetyScore').innerHTML = `${Math.round(safetyScore)} <small>/100</small>`;

    // 2. Update Transactions Count
    document.getElementById('statAnalyzed').innerText = txs.length;

    // 3. Update Money Saved (Flagged high risk transactions)
    const saved = txs
        .filter(t => t.risk_level === 'High')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    document.getElementById('statMoneySaved').innerText = `₹${saved.toLocaleString()}`;
}

// Subscribe to real-time updates
supabase.channel('dashboard-updates')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, initDashboard)
  .subscribe();

document.addEventListener('DOMContentLoaded', initDashboard);
