/**
 * UPI Guardian - tiny UI kit shared across pages.
 * Provides a modal (UIKit.modal) and toast (UIKit.toast) system so
 * every "Try Demo" / confirmation / warning button has somewhere to
 * render its content without each page reinventing one.
 */
(function (window) {
  function ensureRoot() {
    let root = document.getElementById("uikitRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "uikitRoot";
      document.body.appendChild(root);
    }
    return root;
  }

  function injectStylesOnce() {
    if (document.getElementById("uikitStyles")) return;
    const style = document.createElement("style");
    style.id = "uikitStyles";
    style.textContent = `
      .uikit-overlay { position: fixed; inset: 0; background: rgba(5, 8, 25, 0.6); backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; animation: uikitFade .15s ease; }
      @keyframes uikitFade { from { opacity: 0; } to { opacity: 1; } }
      .uikit-modal { background: #ffffff; color: #111827; width: 100%; max-width: 480px; border-radius: 16px;
        padding: 26px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); max-height: 88vh; overflow-y: auto; }
      .uikit-modal.wide { max-width: 620px; }
      .uikit-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      .uikit-modal-header h3 { font-size: 19px; margin: 0; color: #0f172a; }
      .uikit-modal-close { border: none; background: #f1f2f7; color: #4b5563; width: 30px; height: 30px; border-radius: 50%;
        cursor: pointer; font-size: 14px; flex-shrink: 0; }
      .uikit-modal-close:hover { background: #e5e7eb; }
      .uikit-modal-body { font-size: 14.5px; line-height: 1.6; color: #374151; }
      .uikit-modal-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
      .uikit-btn { border: none; border-radius: 9px; padding: 11px 18px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .uikit-btn.primary { background: linear-gradient(90deg,#6737e9,#7135d8); color: #fff; }
      .uikit-btn.primary:hover { opacity: .92; }
      .uikit-btn.danger { background: linear-gradient(90deg,#e13a3a,#c62828); color: #fff; }
      .uikit-btn.ghost { background: #f1f2f7; color: #374151; }
      .uikit-btn:disabled { opacity: .5; cursor: not-allowed; }
      .uikit-risk-badge { display:inline-flex; align-items:center; gap:6px; padding: 4px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 700; }
      .uikit-risk-badge.low { background:#e6f9ee; color:#0a8f4a; }
      .uikit-risk-badge.medium { background:#fff4e0; color:#b4720a; }
      .uikit-risk-badge.high { background:#fdeaea; color:#c62828; }
      .uikit-reason-list { margin: 10px 0 0; padding-left: 18px; }
      .uikit-reason-list li { margin-bottom: 6px; }
      .uikit-toast-wrap { position: fixed; top: 18px; right: 18px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; }
      .uikit-toast { background: #0f172a; color: #fff; padding: 12px 16px; border-radius: 10px; font-size: 13.5px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25); display: flex; align-items: center; gap: 10px; min-width: 240px; animation: uikitSlide .18s ease; }
      .uikit-toast.success { border-left: 4px solid #22c55e; }
      .uikit-toast.error { border-left: 4px solid #ef4444; }
      .uikit-toast.info { border-left: 4px solid #3b82f6; }
      @keyframes uikitSlide { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      .uikit-check-row { display:flex; align-items:flex-start; gap: 10px; margin-top: 16px; background:#fdeaea; padding: 12px; border-radius: 10px; }
      .uikit-check-row input { margin-top: 3px; }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show a modal.
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.bodyHtml
   * @param {Array<{label:string, variant?:string, onClick?:Function, closeOnClick?:boolean, disabled?:boolean}>} [opts.actions]
   * @param {boolean} [opts.wide]
   * @returns {{close:Function, el:HTMLElement}}
   */
  function modal(opts) {
    injectStylesOnce();
    const root = ensureRoot();
    const overlay = document.createElement("div");
    overlay.className = "uikit-overlay";
    const box = document.createElement("div");
    box.className = "uikit-modal" + (opts.wide ? " wide" : "");

    const header = document.createElement("div");
    header.className = "uikit-modal-header";
    header.innerHTML = `<h3>${opts.title || ""}</h3>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "uikit-modal-close";
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "uikit-modal-body";
    body.innerHTML = opts.bodyHtml || "";

    box.appendChild(header);
    box.appendChild(body);

    if (opts.actions && opts.actions.length) {
      const actions = document.createElement("div");
      actions.className = "uikit-modal-actions";
      opts.actions.forEach((a) => {
        const btn = document.createElement("button");
        btn.className = "uikit-btn " + (a.variant || "ghost");
        btn.textContent = a.label;
        btn.disabled = !!a.disabled;
        btn.addEventListener("click", () => {
          if (a.onClick) a.onClick({ close });
          if (a.closeOnClick !== false) close();
        });
        actions.appendChild(btn);
      });
      box.appendChild(actions);
    }

    overlay.appendChild(box);
    root.appendChild(overlay);

    function close() {
      overlay.remove();
    }
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", esc);
      }
    });

    return { close, el: box, body };
  }

  function toast(message, type = "info", ms = 3800) {
    injectStylesOnce();
    let wrap = document.getElementById("uikitToastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "uikitToastWrap";
      wrap.className = "uikit-toast-wrap";
      document.body.appendChild(wrap);
    }
    const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
    const el = document.createElement("div");
    el.className = `uikit-toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s ease";
      setTimeout(() => el.remove(), 250);
    }, ms);
  }

  function riskBadge(level) {
    const label = level.charAt(0).toUpperCase() + level.slice(1) + " Risk";
    return `<span class="uikit-risk-badge ${level}"><i class="fa-solid fa-shield-halved"></i>${label}</span>`;
  }

  window.UIKit = { modal, toast, riskBadge };
})(window);
