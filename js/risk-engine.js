const RiskEngine = {
    async analyze(type, payload) {
        const { data, error } = await supabase.functions.invoke('analyze-risk', {
            body: { type, payload }
        });
        if (error) throw error;
        return data;
    },

    async processTransaction(details) {
        const result = await this.analyze('transaction', details);
        
        // Log to database for real-time dashboard
        await supabase.from('transactions').insert([{
            receiver_name: details.receiver,
            receiver_upi: details.upi,
            amount: details.amount,
            risk_score: result.riskScore,
            risk_level: result.level,
            ai_explanation: result.explanation
        }]);

        return result;
    }
};
