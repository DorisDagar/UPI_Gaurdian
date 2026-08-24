/**
 * UPI Guardian - Risk Engine
 * -----------------------------------------------------------------
 * Pure, dependency-free heuristics used across the app (Send Money,
 * Scan & Pay, Payment Requests, Message Analyzer, Dashboard demos).
 * Nothing here talks to the network or the DOM - it just takes data
 * in and returns a verdict, so every page can share one definition
 * of "risky".
 * -----------------------------------------------------------------
 */
(function (window) {
  const LARGE_AMOUNT_ABS = 20000; // flat threshold, in rupees
  const LARGE_AMOUNT_MULTIPLIER = 4; // vs. the user's average sent amount

  const SUSPICIOUS_NOTE_WORDS = [
    "urgent", "gift card", "lottery", "prize", "refund", "kyc", "blocked",
    "verify now", "otp", "winner", "claim", "reward", "loan approved",
    "double your money", "investment scheme",
  ];

  /** Clamp a number between two bounds. */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * Assess the risk of an outgoing (or QR-initiated) payment.
   * @param {Object} params
   * @param {string} params.payeeName
   * @param {string} params.upiId
   * @param {number} params.amount
   * @param {string} [params.note]
   * @param {Array}  [params.history] - prior transactions for this user (from Supabase)
   * @param {boolean} [params.isCollectRequest] - true if this is money being pulled FROM the user
   * @returns {{score:number, level:'low'|'medium'|'high', reasons:string[]}}
   */
  function assessTransactionRisk({ payeeName, upiId, amount, note, history = [], isCollectRequest = false }) {
    let score = 5; // baseline
    const reasons = [];
    const cleanUpi = String(upiId || "").trim().toLowerCase();
    const amt = Number(amount) || 0;

    const sentHistory = history.filter((t) => t.direction === "sent");
    const knownPayees = new Set(sentHistory.map((t) => String(t.upi_id || "").trim().toLowerCase()));
    const isNewReceiver = cleanUpi && !knownPayees.has(cleanUpi);

    if (isNewReceiver && sentHistory.length > 0) {
      score += 30;
      reasons.push("This is the first time you're paying this UPI ID.");
    } else if (sentHistory.length === 0) {
      score += 8;
      reasons.push("No payment history yet, so this receiver can't be cross-checked.");
    }

    const avg = sentHistory.length
      ? sentHistory.reduce((s, t) => s + Number(t.amount || 0), 0) / sentHistory.length
      : 0;

    if (amt >= LARGE_AMOUNT_ABS) {
      score += 25;
      reasons.push(`₹${amt.toLocaleString("en-IN")} is a large transfer - double-check the amount before paying.`);
    } else if (avg > 0 && amt > avg * LARGE_AMOUNT_MULTIPLIER) {
      score += 20;
      reasons.push(`This is about ${Math.round(amt / avg)}x your usual payment size.`);
    }

    if (!payeeName || String(payeeName).trim().length < 2) {
      score += 10;
      reasons.push("No payee name could be verified for this UPI ID.");
    }

    if (/^[a-z0-9]{4,}@(ok\w+|paytm|ybl|apl)$/i.test(cleanUpi) === false && cleanUpi && !cleanUpi.includes("@")) {
      score += 15;
      reasons.push("This doesn't look like a valid UPI ID format.");
    }

    const noteText = String(note || "").toLowerCase();
    const hitWords = SUSPICIOUS_NOTE_WORDS.filter((w) => noteText.includes(w));
    if (hitWords.length) {
      score += 15 + hitWords.length * 3;
      reasons.push(`The note mentions "${hitWords[0]}" - a common scam trigger word.`);
    }

    if (isCollectRequest) {
      score += 20;
      reasons.push("This is a COLLECT request - approving it will send money OUT of your account, not in.");
    }

    score = clamp(Math.round(score), 2, 98);
    const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

    if (!reasons.length) {
      reasons.push("Receiver matches your past payment history and the amount looks typical for you.");
    }

    return { score, level, reasons, isNewReceiver };
  }

  const MESSAGE_PATTERNS = [
    { key: "urgency", label: "Urgent action / time-pressure language", weight: 18,
      test: /\b(urgent|immediately|act now|within \d+ ?(hours?|minutes?|hrs?)|last chance|expire[sd]? (today|soon))\b/i },
    { key: "otp_pin", label: "Asks for OTP / PIN / password", weight: 30,
      test: /\b(otp|upi pin|cvv|password|share.*pin|pin.*share)\b/i },
    { key: "prize", label: "Lottery / prize / cashback lure", weight: 22,
      test: /\b(lottery|lucky draw|prize|jackpot|cash ?back|reward|winner|congratulations you)\b/i },
    { key: "kyc", label: "Fake KYC / account block threat", weight: 22,
      test: /\b(kyc|account (will be |is )?(blocked|suspended|deactivated)|verify your account|update.*(aadhaar|pan))\b/i },
    { key: "link", label: "Shortened or suspicious link", weight: 20,
      test: /\b(bit\.ly|tinyurl|t\.co|shorturl|cutt\.ly|is\.gd)\/\S+/i },
    { key: "generic_link", label: "Contains a clickable link", weight: 8,
      test: /https?:\/\/\S+/i },
    { key: "refund", label: "Unexpected refund / payment failed claim", weight: 16,
      test: /\b(refund (initiated|pending|failed)|payment (failed|pending)|excess amount (debited|credited))\b/i },
    { key: "impersonation", label: "Claims to be a bank / official body", weight: 14,
      test: /\b(rbi|bank of india|sbi|hdfc|icici|npci|income tax dept?)\b/i },
    { key: "loan", label: "Instant loan / investment scheme", weight: 18,
      test: /\b(instant loan|pre-?approved loan|guaranteed returns|double your money|investment scheme)\b/i },
    { key: "callback", label: "Asks you to call an unknown number", weight: 12,
      test: /\bcall (immediately|now|us) (at|on)?\s*[\d\-+ ]{8,}/i },
  ];

  /**
   * Heuristically analyze a pasted / OCR'd message for scam signals.
   * @param {string} text
   * @returns {{score:number, level:string, factors:Array, links:string[], keywords:string[]}}
   */
  function analyzeMessage(text) {
    const t = String(text || "");
    let score = 4;
    const factors = [];

    MESSAGE_PATTERNS.forEach((p) => {
      if (p.test.test(t)) {
        score += p.weight;
        factors.push({ label: p.label, level: p.weight >= 20 ? "high" : p.weight >= 12 ? "medium" : "low" });
      }
    });

    // Unknown / no personalised sender name heuristic: generic greeting + payment ask
    if (/\b(dear (customer|user|sir\/madam))\b/i.test(t)) {
      score += 10;
      factors.push({ label: "Generic greeting instead of your name", level: "medium" });
    }

    // Shouting / excessive punctuation
    const exclCount = (t.match(/!/g) || []).length;
    if (exclCount >= 3) {
      score += 8;
      factors.push({ label: "Excessive urgency punctuation ( !!! )", level: "low" });
    }
    const upperWords = t.split(/\s+/).filter((w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
    if (upperWords.length >= 3) {
      score += 6;
      factors.push({ label: "Unusual amount of ALL CAPS text", level: "low" });
    }

    const links = (t.match(/https?:\/\/\S+|www\.\S+/gi) || []).map((l) => l.replace(/[.,)]+$/, ""));
    const keywordHits = [];
    ["lottery", "prize", "reward", "cash prize", "otp", "kyc", "refund", "urgent", "winner"].forEach((kw) => {
      if (t.toLowerCase().includes(kw)) keywordHits.push(kw);
    });

    score = clamp(Math.round(score), 2, 98);
    const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

    if (!factors.length) {
      factors.push({ label: "No common scam patterns detected in this text", level: "low" });
    }

    return { score, level, factors, links, keywords: keywordHits };
  }

  /**
   * Parse a UPI deep link (from a QR code) into its components.
   * Handles both real "upi://pay" links and "upi://collect" (which
   * request money FROM the scanning user - a classic QR scam vector).
   * @param {string} raw
   */
  function parseUpiQr(raw) {
    const text = String(raw || "").trim();
    const result = { valid: false, raw: text, isCollect: false, pa: "", pn: "", am: "", tn: "", cu: "INR" };
    if (!text) return result;

    try {
      // upi://pay?pa=...&pn=...&am=...&tn=...   or upi://collect?...
      const match = text.match(/^upi:\/\/(pay|collect)\??(.*)$/i);
      if (match) {
        result.isCollect = /collect/i.test(match[1]);
        const params = new URLSearchParams(match[2]);
        result.pa = params.get("pa") || "";
        result.pn = params.get("pn") || "";
        result.am = params.get("am") || "";
        result.tn = params.get("tn") || params.get("tr") || "";
        result.cu = params.get("cu") || "INR";
        result.valid = !!result.pa;
        return result;
      }
      // Fallback: bare UPI ID typed/scanned directly
      if (/^[\w.\-]{2,}@[a-z][a-z0-9.\-]{1,}$/i.test(text)) {
        result.pa = text;
        result.valid = true;
        return result;
      }
    } catch (_) {
      /* fall through to invalid */
    }
    return result;
  }

  window.RiskEngine = {
    assessTransactionRisk,
    analyzeMessage,
    parseUpiQr,
    LARGE_AMOUNT_ABS,
  };
})(window);
