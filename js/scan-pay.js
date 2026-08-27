// This function is called after jsQR decodes the image
async function handleScanResult(decodedData) {
    const scanResultArea = document.getElementById('scanResultArea');
    
    // 1. Check if it's a valid UPI link
    if (!decodedData.startsWith('upi://')) {
        ui.showError(scanResultArea, "Invalid QR Code. Not a UPI payment link.");
        return;
    }

    // 2. Parse the UPI URI components
    const url = new URL(decodedData.replace('upi://', 'http://upi/'));
    const params = new URLSearchParams(url.search);
    
    const paymentData = {
        upiId: params.get('pa'), // address
        name: params.get('pn'),  // name
        amount: params.get('am'), // amount
        note: params.get('tn')    // transaction note
    };

    ui.showLoading(scanResultArea, "AI is verifying receiver reputation...");

    try {
        // 3. CALL THE AI RISK ENGINE
        const aiResponse = await RiskEngine.analyze('transaction', {
            receiver: paymentData.name || paymentData.upiId,
            upi: paymentData.upiId,
            amount: paymentData.amount || 0,
            note: paymentData.note || "QR Scan"
        });

        // 4. Update UI with AI Analysis
        scanResultArea.innerHTML = `
            <div class="result-card ${aiResponse.level.toLowerCase()}">
                <div class="risk-header">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>${aiResponse.level} Risk Transaction</span>
                </div>
                <div class="payment-summary">
                    <strong>Paying: ${paymentData.name || 'Unknown'}</strong>
                    <p>${paymentData.upiId}</p>
                    <h2>₹${paymentData.amount || '0'}</h2>
                </div>
                <div class="ai-logic">
                    <p><strong>AI Verdict:</strong> ${aiResponse.explanation}</p>
                </div>
                <div class="actions">
                    <button class="btn btn-primary" onclick="confirmPayment()">Proceed Safely</button>
                    <button class="btn btn-outline" onclick="location.reload()">Cancel</button>
                </div>
            </div>
        `;
    } catch (error) {
        ui.showError(scanResultArea, "Security check failed. Try again.");
    }
}
