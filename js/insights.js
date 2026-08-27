async function loadInsights() {
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*');

    if (error || !transactions.length) {
        document.getElementById('insightsEmpty').style.display = 'block';
        document.getElementById('insightsContent').style.display = 'none';
        return;
    }

    // --- DATA AGGREGATION ---

    // 1. Category Breakdown
    const categories = {};
    transactions.forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + parseFloat(t.amount);
    });

    // 2. Risk Breakdown
    const risks = { Low: 0, Medium: 0, High: 0 };
    transactions.forEach(t => {
        risks[t.risk_level] = (risks[t.risk_level] || 0) + 1;
    });

    // --- CHART GENERATION ---

    // Category Doughnut Chart
    new Chart(document.getElementById('categoryChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: ['#6737e9', '#2188ed', '#18ad68', '#e99124']
            }]
        }
    });

    // Risk Level Bar Chart
    new Chart(document.getElementById('riskChart'), {
        type: 'bar',
        data: {
            labels: ['Low', 'Medium', 'High'],
            datasets: [{
                label: 'Transactions',
                data: [risks.Low, risks.Medium, risks.High],
                backgroundColor: ['#18ad68', '#e99124', '#ef4444']
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    renderScamTimeline(transactions);
}

function renderScamTimeline(txs) {
    const list = document.getElementById('timelineList');
    const filtered = txs.filter(t => t.risk_level !== 'Low'); // Only show suspicious stuff
    
    if (filtered.length === 0) {
        list.innerHTML = `<p class="state-block">No suspicious activity detected in your history.</p>`;
        return;
    }

    list.innerHTML = filtered.map(t => `
        <div class="timeline-item">
            <div class="time">${new Date(t.created_at).toLocaleDateString()}</div>
            <div class="content">
                <strong>Suspicious ${t.risk_level} Risk Payment</strong>
                <p>To: ${t.receiver_name} | Amount: ₹${t.amount}</p>
                <small>${t.ai_explanation}</small>
            </div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', loadInsights);
