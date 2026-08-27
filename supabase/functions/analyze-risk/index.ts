import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS for browser calls
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const { type, payload } = await req.json();

  const prompt = type === "message" 
    ? `Analyze this SMS for UPI fraud: "${payload.text}". Return JSON: {"riskScore": number, "level": "High|Medium|Low", "explanation": "text", "flags": []}`
    : `Analyze UPI Payment to ${payload.receiver} for ₹${payload.amount}. Return JSON: {"riskScore": number, "level": "High|Medium|Low", "explanation": "text"}`;

  const result = await model.generateContent(prompt);
  const jsonResponse = result.response.text().replace(/```json|```/g, "");

  return new Response(jsonResponse, { 
    headers: { ...corsHeaders, "Content-Type": "application/json" } 
  });
})
