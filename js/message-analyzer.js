const analyzeBtn = document.getElementById('analyzeBtn');
const messageInput = document.getElementById('messageInput');
const resultBody = document.getElementById('resultBody');

analyzeBtn.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (!text) return;

    analyzeBtn.disabled = true;
    resultBody.innerHTML = `<div class="state-block"><i class="fa-solid fa-brain fa-spin"></i><p>AI is scanning message for fraud signals...</p></div>`;

    try {
        const result = await RiskEngine.analyze('message', { text });
        
        resultBody.innerHTML = `
            <div class="app-card" style="border-left: 5px solid ${getColor(result.level)}">
                <h3 style="color: ${getColor(result.level)}">${result.level} Risk Found</h3>
                <p><strong>Score:</strong> ${result.riskScore}/100</p>
                <p>${result.explanation}</p>
                <div style="margin-top:10px;">
                    ${result.flags.map(f => `<span class="pill red" style="margin-right:5px;">${f}</span>`).join('')}
                </div>
            </div>`;

        // Save result for User Insights
        await supabase.from('analyzed_messages').insert([{
            content: text,
            risk_score: result.riskScore,
            verdict: result.level,
            flags: result.flags
        }]);

    } catch (err) {
        resultBody.innerHTML = `<p style="color:red">Error: Could not connect to AI Engine.</p>`;
    } finally {
        analyzeBtn.disabled = false;
    }
});

function getColor(level) {
    if (level === 'High') return '#ef4444';
    if (level === 'Medium') return '#f59e0b';
    return '#10b981';
}
