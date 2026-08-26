/**
 * UPI Guardian - Scan & Pay page logic.
 * Three ways to get a QR payload in: live camera (jsQR decoding video
 * frames), an uploaded screenshot, or a sample QR for demoing without
 * a camera. Whatever comes in gets parsed by RiskEngine.parseUpiQr and
 * risk-assessed exactly like Send Money, then can be confirmed into a
 * real Supabase transaction.
 */
(function () {
  let history = [];
  let currentUser = null;
  let stream = null;
  let scanning = false;
  let videoEl, canvasCtx, canvasEl;

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("upi-guardian:ready", async (e) => {
    currentUser = e.detail && e.detail.user;
    history = await fetchHistory();
  });

  function init() {
    document.querySelectorAll(".tabbar button[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.getElementById("startCameraBtn").addEventListener("click", startCamera);
    document.getElementById("stopCameraBtn").addEventListener("click", stopCamera);
    document.getElementById("qrFileInput").addEventListener("change", handleFileUpload);
    document.querySelectorAll("#sampleTab [data-sample]").forEach((btn) => {
      btn.addEventListener("click", () => handleDecodedText(btn.dataset.sample));
    });

    videoEl = document.getElementById("qrVideo");
    canvasEl = document.getElementById("qrCanvas");
    canvasCtx = canvasEl.getContext("2d", { willReadFrequently: true });

    maybeRunDemoFromUrl();
  }

  // Coming from a dashboard "Try Demo" link (e.g. scan-pay.html?demo=fake-qr):
  // show the banner, land on the Upload tab (where a real screenshot would
  // go), and run the sample fake QR straight through the real scan/analyze
  // pipeline so the person immediately sees a live, non-canned result.
  function maybeRunDemoFromUrl() {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo !== "fake-qr") return;
    document.getElementById("demoBanner").style.display = "block";
    switchTab("upload");
    handleDecodedText("upi://collect?pa=scanner-scam@upi&pn=Refund%20Desk&am=2500&tn=Refund%20verification", { isDemo: true });
  }

  function switchTab(tab) {
    document.querySelectorAll(".tabbar button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.getElementById("cameraTab").style.display = tab === "camera" ? "block" : "none";
    document.getElementById("uploadTab").style.display = tab === "upload" ? "block" : "none";
    document.getElementById("sampleTab").style.display = tab === "sample" ? "block" : "none";
    if (tab !== "camera") stopCamera();
  }

  async function fetchHistory() {
    if (!window.supabaseClient) return [];
    try {
      const { data, error } = await window.supabaseClient.from("transactions").select("*");
      if (error) throw error;
      return data || [];
    } catch (_) { return []; }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.UIKit.toast("Camera access isn't supported in this browser.", "error");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoEl.srcObject = stream;
      videoEl.style.display = "block";
      document.getElementById("qrPlaceholder").style.display = "none";
      document.getElementById("qrFrame").style.display = "block";
      document.getElementById("qrHint").style.display = "block";
      document.getElementById("startCameraBtn").style.display = "none";
      document.getElementById("stopCameraBtn").style.display = "inline-flex";
      await videoEl.play();
      scanning = true;
      requestAnimationFrame(scanFrame);
    } catch (err) {
      console.error(err);
      window.UIKit.toast("Couldn't access the camera: " + (err.message || "permission denied") + ". Try the Upload or Sample QR tabs instead.", "error");
    }
  }

  function stopCamera() {
    scanning = false;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    videoEl.style.display = "none";
    document.getElementById("qrPlaceholder").style.display = "flex";
    document.getElementById("qrFrame").style.display = "none";
    document.getElementById("qrHint").style.display = "none";
    document.getElementById("startCameraBtn").style.display = "inline-flex";
    document.getElementById("stopCameraBtn").style.display = "none";
  }

  function scanFrame() {
    if (!scanning) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA && window.jsQR) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      canvasCtx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const imageData = canvasCtx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        stopCamera();
        handleDecodedText(code.data);
        return;
      }
    }
    requestAnimationFrame(scanFrame);
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      window.UIKit.toast("Please upload an image file (PNG or JPG).", "error");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        canvasEl.width = img.width;
        canvasEl.height = img.height;
        canvasCtx.drawImage(img, 0, 0);
        const imageData = canvasCtx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        const code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height) : null;
        if (code && code.data) {
          handleDecodedText(code.data);
        } else {
          window.UIKit.toast("Couldn't detect a QR code in that image. Try a clearer, uncropped screenshot.", "error");
        }
      } catch (err) {
        console.error(err);
        window.UIKit.toast("Couldn't process that image: " + (err.message || "unknown error"), "error");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      window.UIKit.toast("Couldn't read that image file.", "error");
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  }

  function handleDecodedText(text, opts) {
    const parsed = window.RiskEngine.parseUpiQr(text);
    if (!parsed.valid) {
      renderInvalid(text);
      return;
    }
    const amount = Number(parsed.am) || 0;
    const result = window.RiskEngine.assessTransactionRisk({
      payeeName: parsed.pn || parsed.pa, upiId: parsed.pa, amount, note: parsed.tn, history, isCollectRequest: parsed.isCollect,
    });
    renderResult(parsed, result, amount, (opts && opts.isDemo) || false);
  }

  function renderInvalid(raw) {
    document.getElementById("scanResultArea").innerHTML = `
      <div class="state-block">
        <i class="fa-solid fa-triangle-exclamation" style="color:#c62828;"></i>
        <p>This doesn't look like a valid UPI QR code.</p>
        <p style="font-size:12px;word-break:break-all;color:#9aa0c4;">${escapeHtml(raw).slice(0, 140)}</p>
      </div>`;
  }

  function renderResult(parsed, result, amount, isDemo) {
    const fmt = window.TxUtils.formatINR;
    const area = document.getElementById("scanResultArea");
    const claimedAction = parsed.isCollect
      ? (parsed.tn ? escapeHtml(parsed.tn) : "Get money back / verify your account")
      : `Pay ${escapeHtml(parsed.pn || parsed.pa)}`;
    const actualAction = parsed.isCollect
      ? `${amount ? fmt(amount) : "Money"} will be pulled OUT of your account and sent to ${escapeHtml(parsed.pn || parsed.pa)}`
      : `${amount ? fmt(amount) : "The amount you enter"} will be sent TO ${escapeHtml(parsed.pn || parsed.pa)}`;

    const collectWarning = parsed.isCollect
      ? `<div class="pill high" style="margin-bottom:12px;"><i class="fa-solid fa-hand"></i> This is a COLLECT request - confirming will send money OUT of your account</div>`
      : `<div class="pill low" style="margin-bottom:12px;"><i class="fa-solid fa-arrow-right"></i> Standard "Pay" QR - money goes to the receiver below</div>`;

    area.innerHTML = `
      ${isDemo ? `<div class="pill info" style="margin-bottom:12px;"><i class="fa-solid fa-wand-magic-sparkles"></i> Live demo scan - decoded and analyzed just now</div>` : ""}

      <strong style="font-size:12.5px;color:#8a93a6;text-transform:uppercase;letter-spacing:.03em;">1. Extracted from QR</strong>
      <div class="app-card" style="padding:14px;margin:8px 0 16px;background:#f9fafc;border:1px solid #eef0f6;">
        <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>Receiver</span><strong>${escapeHtml(parsed.pn || "Unknown")}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>UPI ID</span><strong>${escapeHtml(parsed.pa)}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;"><span>Amount</span><strong>${amount ? fmt(amount) : "Not specified"}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span>Request type</span><strong>${parsed.isCollect ? "Collect (pulls money from you)" : "Pay (sends money to receiver)"}</strong></div>
      </div>

      <strong style="font-size:12.5px;color:#8a93a6;text-transform:uppercase;letter-spacing:.03em;">2. Risk analysis</strong>
      <div style="display:flex;align-items:center;gap:14px;margin:8px 0 14px;">
        <div class="risk-score-ring ${result.level}" style="--pct:${result.score}%"><span>${result.score}%</span></div>
        ${window.UIKit.riskBadge(result.level)}
      </div>
      ${collectWarning}
      <strong style="font-size:13px;">Why UPI Guardian flagged this</strong>
      <ul class="uikit-reason-list">${result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>

      <strong style="font-size:12.5px;color:#8a93a6;text-transform:uppercase;letter-spacing:.03em;display:block;margin-top:18px;">3. What it claims vs. what it actually does</strong>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;">
        <div class="app-card" style="padding:12px;background:#fff;border:1.5px solid #eef0f6;">
          <small style="color:#8a93a6;font-size:11px;text-transform:uppercase;">What it claims</small>
          <p style="font-size:13.5px;color:#111827;margin-top:4px;">${claimedAction}</p>
        </div>
        <div class="app-card" style="padding:12px;background:${parsed.isCollect ? "#fdeaea" : "#f6f3ff"};border:1.5px solid ${parsed.isCollect ? "#f5c2c2" : "#e3d9fb"};">
          <small style="color:${parsed.isCollect ? "#c62828" : "#6737e9"};font-size:11px;text-transform:uppercase;">What actually happens</small>
          <p style="font-size:13.5px;color:#111827;margin-top:4px;">${actualAction}</p>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn-primary" id="proceedScanBtn" ${parsed.isCollect ? "disabled" : ""}>
          ${parsed.isCollect ? "Blocked - Collect request" : "Proceed to Pay"}
        </button>
        <button class="btn btn-ghost" id="dismissScanBtn">Dismiss</button>
      </div>
      ${parsed.isCollect ? `<p style="font-size:12px;color:#c62828;margin-top:8px;">UPI Guardian doesn't let you approve collect requests from Scan &amp; Pay. Review it from <a href="payment-requests.html" style="color:#c62828;">Payment Requests</a> instead.</p>` : ""}
    `;

    const proceedBtn = document.getElementById("proceedScanBtn");
    if (proceedBtn && !parsed.isCollect) {
      proceedBtn.addEventListener("click", () => confirmPayment(parsed, result, amount));
    }
    document.getElementById("dismissScanBtn").addEventListener("click", () => {
      area.innerHTML = `<div class="state-block"><i class="fa-solid fa-qrcode"></i><p>Scan, upload, or try a sample QR to see the risk analysis here.</p></div>`;
    });
  }

  function confirmPayment(parsed, result, amount) {
    if (!amount) {
      window.UIKit.toast("This QR didn't include an amount. Use Send Money to pay this UPI ID manually.", "info");
      return;
    }
    const needsAck = result.level === "high";
    const modalRef = window.UIKit.modal({
      title: "Confirm Payment",
      bodyHtml: `
        <p style="margin-bottom:10px;">Pay <strong>${window.TxUtils.formatINR(amount)}</strong> to <strong>${escapeHtml(parsed.pn || parsed.pa)}</strong>?</p>
        ${window.UIKit.riskBadge(result.level)}
        ${needsAck ? `<div class="uikit-check-row"><input type="checkbox" id="scanAck"><label for="scanAck" style="font-size:13px;color:#7a1f1f;">I understand the risk and want to proceed anyway.</label></div>` : ""}
      `,
      actions: [
        {
          label: needsAck ? "Pay Anyway" : "Confirm Payment", variant: needsAck ? "danger" : "primary", disabled: needsAck,
          closeOnClick: false,
          onClick: async ({ close }) => { await savePayment(parsed, result, amount, false); close(); },
        },
        {
          label: "Cancel", variant: "ghost", closeOnClick: false,
          onClick: async ({ close }) => { if (needsAck) await savePayment(parsed, result, amount, true); close(); },
        },
      ],
    });
    if (needsAck) {
      const ack = modalRef.body.querySelector("#scanAck");
      const confirmBtn = modalRef.el.querySelectorAll(".uikit-modal-actions .uikit-btn")[0];
      ack.addEventListener("change", () => { confirmBtn.disabled = !ack.checked; });
    }
  }

  async function savePayment(parsed, result, amount, blocked) {
    if (!window.supabaseClient || !currentUser) { window.UIKit.toast("Supabase isn't connected.", "error"); return; }
    try {
      const { error } = await window.supabaseClient.from("transactions").insert({
        user_id: currentUser.id,
        payee_name: parsed.pn || parsed.pa,
        upi_id: parsed.pa,
        amount,
        direction: "sent",
        category: "other",
        risk_level: result.level,
        status: blocked ? "blocked" : "success",
        note: parsed.tn || "Paid via Scan & Pay",
      });
      if (error) throw error;
      window.UIKit.toast(blocked ? "Payment cancelled - logged as a prevented risk." : "Payment sent successfully!", blocked ? "info" : "success");
      if (!blocked) setTimeout(() => { window.location.href = "transactions.html"; }, 900);
    } catch (err) {
      window.UIKit.toast("Couldn't save this transaction: " + (err.message || "unknown error"), "error");
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
