import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
    const { type, payload } = await req.json();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt = "";
    if (type === "message") {
      prompt = `Analyze this message for UPI/Banking scam signals: "${payload.text}". 
      Check for: fake rewards, urgent KYC, or "collect" request traps.
      Return ONLY a JSON object: {"riskScore": 0-100, "level": "Low|Medium|High", "explanation": "string", "flags": ["string"]}`;
    } else {
      prompt = `Analyze this UPI transaction: To ${payload.receiver}, Amount ₹${payload.amount}. 
      Context: ${payload.note || 'No note provided'}. 
      Compare against common fraud patterns like "overpayment scams" or "advance fee fraud".
      Return ONLY a JSON object: {"riskScore": 0-100, "level": "Low|Medium|High", "explanation": "string"}`;
    }

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "");
    
    return new Response(text, { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
})
