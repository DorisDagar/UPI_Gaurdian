/**
 * UPI Guardian - Message Analyzer page logic.
 * Real heuristic scoring via RiskEngine.analyzeMessage. Screenshots
 * are read client-side with Tesseract.js OCR (no server needed) and
 * the extracted text is fed into the same analyzer used for pasted
 * text, so both paths produce a genuine result.
 */
(function () {
  let currentUser = null;
  const els = {};

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("upi-guardian:ready", (e) => { currentUser = e.detail && e.detail.user; });

  function init() {
    els.textarea = document.getElementById("messageInput");
    els.charCount = document.getElementById("charCount");
    els.uploadBox = document.getElementById("uploadBox");
    els.uploadStatus = document.getElementById("uploadStatus");
    els.fileInput = document.getElementById("screenshotInput");
    els.analyzeBtn = document.getElementById("analyzeBtn");
    els.resultBody = document.getElementById("resultBody");

    els.textarea.addEventListener("input", () => {
      els.charCount.textContent = els.textarea.value.length;
      updateButtonState();
    });

    els.uploadBox.addEventListener("click", () => els.fileInput.click());
    els.uploadBox.addEventListener("dragover", (e) => { e.preventDefault(); els.uploadBox.style.borderColor = "#6737e9"; });
    els.uploadBox.addEventListener("dragleave", () => { els.uploadBox.style.borderColor = ""; });
    els.uploadBox.addEventListener("drop", (e) => {
      e.preventDefault();
      els.uploadBox.style.borderColor = "";
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    els.fileInput.addEventListener("change", () => { if (els.fileInput.files[0]) handleFile(els.fileInput.files[0]); });

    els.analyzeBtn.addEventListener("click", runAnalysis);
    updateButtonState();
  }

  function updateButtonState() {
    els.analyzeBtn.disabled = els.textarea.value.trim().length === 0;
  }

  async function handleFile(file) {
    if (!/image\/(png|jpeg|jpg)/.test(file.type)) {
      window.UIKit.toast("Please upload a PNG or JPG image.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      window.UIKit.toast("Image is larger than 5MB.", "error");
      return;
    }
    els.uploadStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Reading text from image…`;
    els.analyzeBtn.disabled = true;
    try {
      if (!window.Tesseract) throw new Error("OCR engine failed to load");
      const { data } = await window.Tesseract.recognize(file, "eng");
      const text = (data && data.text || "").trim();
      if (!text) {
        els.uploadStatus.textContent = "Couldn't find readable text in that image - try pasting the message instead.";
        window.UIKit.toast("No text detected in the image.", "error");
        return;
      }
      els.textarea.value = text;
      els.charCount.textContent = text.length;
      els.uploadStatus.textContent = "Text extracted from image ✓ - click Analyze";
      updateButtonState();
    } catch (err) {
      console.error(err);
      els.uploadStatus.textContent = "Click to upload or drag and drop";
      window.UIKit.toast("Couldn't read the image: " + (err.message || "unknown error"), "error");
    }
  }

  async function runAnalysis() {
    const text = els.textarea.value.trim();
    if (!text) return;
    els.analyzeBtn.disabled = true;
    els.analyzeBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing…';

    const result = window.RiskEngine.analyzeMessage(text);
    renderResult(result);

    // Best-effort: log to message_analyses so Insights' Scam Timeline can show it.
    if (window.supabaseClient && currentUser) {
      try {
        await window.supabaseClient.from("message_analyses").insert({
          user_id: currentUser.id,
          excerpt: text.slice(0, 240),
          risk_score: result.score,
          risk_level: result.level,
          factors: result.factors,
        });
      } catch (_) { /* non-critical */ }
    }

    els.analyzeBtn.disabled = false;
    els.analyzeBtn.innerHTML = '<i class="fa-solid fa-shield"></i>Analyze Message';
  }

  function renderResult(result) {
    const levelLabel = result.level === "high" ? "High Risk" : result.level === "medium" ? "Medium Risk" : "Low Risk";
    const desc = result.level === "high"
      ? "This message is likely a scam."
      : result.level === "medium"
      ? "This message has some risk signals - proceed carefully."
      : "This message doesn't show common scam patterns.";

    const factorsHtml = result.factors.map((f) => `
      <div class="risk-item">
        <span class="risk-dot"></span>
        <span class="risk-name">${escapeHtml(f.label)}</span>
        <span class="level ${f.level}">${f.level.charAt(0).toUpperCase() + f.level.slice(1)}</span>
      </div>`).join("");

    const detectedHtml = [
      ...result.links.map((l) => `<div class="detected-item"><div class="detected-icon"><i class="fa-solid fa-link"></i></div><p class="detected-text">${escapeHtml(l)}</p><span class="detected-tag">Link</span></div>`),
      ...result.keywords.map((k) => `<div class="detected-item"><div class="detected-icon"><i class="fa-solid fa-tag"></i></div><p class="detected-text">${escapeHtml(k)}</p><span class="detected-tag">Scam Keyword</span></div>`),
    ].join("") || `<p style="font-size:13px;color:#8a93a6;">No links or scam keywords detected.</p>`;

    els.resultBody.innerHTML = `
      <div class="risk-summary">
        <div class="risk-circle">${result.score}%</div>
        <div class="risk-text">
          <h3>${levelLabel}</h3>
          <p>${desc}</p>
          ${result.level !== "low" ? `<span class="caution"><i class="fa-solid fa-circle-exclamation"></i>Be cautious!</span>` : ""}
        </div>
      </div>
      <div class="result-box">
        <h3>Risk Factors</h3>
        ${factorsHtml || `<p style="font-size:13px;color:#8a93a6;">No risk factors detected.</p>`}
      </div>
      <div class="result-box">
        <h3>Detected Elements</h3>
        ${detectedHtml}
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
