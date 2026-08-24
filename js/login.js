/**
 * UPI Guardian - Login page logic
 * Validates the form and signs the user in through js/auth.js.
 */
(function () {
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.form = document.getElementById("loginForm");
    els.mobile = document.getElementById("mobile");
    els.password = document.getElementById("password");
    els.button = document.getElementById("loginButton");
    els.message = document.getElementById("authMessage");
    els.togglePassword = document.getElementById("togglePassword");
    els.forgotPassword = document.getElementById("forgotPassword");
    els.googleButton = document.getElementById("googleButton");

    // Only digits, capped at 10, in the mobile field.
    els.mobile.addEventListener("input", () => {
      els.mobile.value = els.mobile.value.replace(/\D/g, "").slice(0, 10);
    });

    els.togglePassword.addEventListener("click", () => togglePasswordVisibility(els.password, els.togglePassword));

    els.forgotPassword.addEventListener("click", (e) => {
      e.preventDefault();
      showMessage("Password reset isn't available yet - please contact support.", "info");
    });

    els.googleButton.addEventListener("click", () => {
      showMessage("Google sign-in is coming soon. Please use your mobile number for now.", "info");
    });

    els.form.addEventListener("submit", handleSubmit);

    if (!window.UPIGuardianAuth || !window.UPIGuardianAuth.isConfigured()) {
      showMessage(
        "Supabase isn't connected yet. Add your project URL and anon key to js/supabase-config.js.",
        "error"
      );
    } else {
      window.UPIGuardianAuth.redirectIfAuthed("dashboard.html");
    }
  }

  function togglePasswordVisibility(input, icon) {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    icon.classList.toggle("fa-eye", !isHidden);
    icon.classList.toggle("fa-eye-slash", isHidden);
  }

  function showMessage(text, type) {
    els.message.textContent = text;
    els.message.className = `auth-message ${type}`;
    els.message.hidden = false;
  }

  function clearMessage() {
    els.message.hidden = true;
    els.message.textContent = "";
  }

  function setLoading(isLoading) {
    els.button.disabled = isLoading;
    els.button.innerHTML = isLoading
      ? 'Logging in… <i class="fa-solid fa-circle-notch fa-spin"></i>'
      : 'Login <i class="fa-solid fa-arrow-right"></i>';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessage();

    const mobile = els.mobile.value.trim();
    const password = els.password.value;

    if (mobile.length !== 10) {
      showMessage("Enter a valid 10-digit mobile number.", "error");
      return;
    }
    if (!password) {
      showMessage("Enter your password.", "error");
      return;
    }
    if (!window.UPIGuardianAuth || !window.UPIGuardianAuth.isConfigured()) {
      showMessage(
        "Supabase isn't connected yet. Add your project URL and anon key to js/supabase-config.js.",
        "error"
      );
      return;
    }

    setLoading(true);
    const result = await window.UPIGuardianAuth.signIn({ mobile, password });
    setLoading(false);

    if (!result.ok) {
      showMessage(result.error, "error");
      return;
    }

    showMessage("Login successful! Redirecting…", "success");
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("redirect") || "dashboard.html";
  }
})();
