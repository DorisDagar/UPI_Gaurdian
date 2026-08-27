const RiskEngine = {
    // This calls your Supabase Edge Function (The Brain)
    async analyze(type, payload) {
        try {
            const { data, error } = await supabase.functions.invoke('analyze-risk', {
                body: { type, payload }
            });
            if (error) throw error;
            return data; 
        } catch (err) {
            console.error("AI Analysis failed, using safety fallback.", err);
            return { riskScore: 50, level: "Medium", explanation: "Security server busy. Proceed with caution." };
        }
    },

    // Every time a user "Sends Money", this is triggered
    async processTransaction(details) {
        const aiResult = await this.analyze('transaction', details);
        
        // CRITICAL: This saves the transaction to your Supabase DB for the "Insights" page
        const { error } = await supabase.from('transactions').insert([{
            receiver_name: details.receiver,
            receiver_upi: details.upi,
            amount: parseFloat(details.amount),
            risk_score: aiResult.riskScore,
            risk_level: aiResult.level,
            ai_explanation: aiResult.explanation,
            user_id: (await supabase.auth.getUser()).data.user.id
        }]);

        return aiResult;
    }
};
