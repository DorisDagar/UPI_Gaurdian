async function calculateLiveSafetyScore() {
    const { data: txs } = await supabase
        .from('transactions')
        .select('risk_score')
        .limit(20); // Look at last 20 payments

    if (!txs || txs.length === 0) return 100; // New users start at 100

    const totalRisk = txs.reduce((sum, t) => sum + t.risk_score, 0);
    const avgRisk = totalRisk / txs.length;
    
    // Safety Score = 100 - average risk
    const dynamicScore = Math.round(100 - avgRisk);
    
    const scoreElement = document.getElementById('statSafetyScore');
    if (scoreElement) {
        scoreElement.innerHTML = `${dynamicScore} <small>/100</small>`;
        
        // Change color based on score
        const label = document.getElementById('statSafetyLabel');
        if (dynamicScore > 80) label.innerText = "Very Safe";
        else if (dynamicScore > 50) label.innerText = "Monitor Activity";
        else label.innerText = "High Risk Account";
    }
}
