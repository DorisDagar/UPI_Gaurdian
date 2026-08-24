/**
 * UPI Guardian - Sign Up page logic
 * Validates the form and creates an account through js/auth.js.
 */
(function () {
  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.form = document.getElementById("signupForm");
    els.fullName = document.getElementById("fullName");
    els.mobile = document.getElementById("mobile");
    els.password = document.getElementById("password");
    els.confirmPassword = document.getElementById("confirmPassword");
    els.terms = document.getElementById("terms");
    els.button = document.getElementById("createAccountButton");
    els.message = document.getElementById("authMessage");
    els.googleButton = document.getElementById("googleButton");
    els.loginLink = document.getElementById("loginLink");

    els.mobile.addEventListener("input", () => {
      els.mobile.value = els.mobile.value.replace(/\D/g, "").slice(0, 10);
    });

    document.querySelectorAll(".eye[data-target]").forEach((icon) => {
      icon.addEventListener("click", () => {
        const input = document.getElementById(icon.dataset.target);
        togglePasswordVisibility(input, icon);
      });
    });

    els.googleButton.addEventListener("click", () => {
      showMessage("Google sign-up is coming soon. Please use the form for now.", "info");
    });

    els.loginLink.addEventListener("click", () => {
      window.location.href = "login.html";
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
      ? '<span>Creating account…</span> <i class="fa-solid fa-circle-notch fa-spin"></i>'
      : '<span>Create Secure Account</span> <i class="fa-solid fa-arrow-right"></i>';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearMessage();

    const fullName = els.fullName.value.trim();
    const mobile = els.mobile.value.trim();
    const password = els.password.value;
    const confirmPassword = els.confirmPassword.value;

    if (fullName.length < 2) {
      showMessage("Enter your full name.", "error");
      return;
    }
    if (mobile.length !== 10) {
      showMessage("Enter a valid 10-digit mobile number.", "error");
      return;
    }
    if (password.length < 6) {
      showMessage("Password must be at least 6 characters.", "error");
      return;
    }
    if (password !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }
    if (!els.terms.checked) {
      showMessage("Please accept the Terms & Conditions and Privacy Policy.", "error");
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
    const result = await window.UPIGuardianAuth.signUp({ fullName, mobile, password });
    setLoading(false);

    if (!result.ok) {
      showMessage(result.error, "error");
      return;
    }

    if (result.session) {
      showMessage("Account created! Redirecting…", "success");
      window.location.href = "dashboard.html";
    } else {
      // Only happens if "Confirm email" is still ON in Supabase - see js/auth.js.
      showMessage(
        "Account created, but email confirmation is still required on your Supabase project. " +
          "Turn off \"Confirm email\" under Authentication > Providers > Email, then log in.",
        "info"
      );
    }
  }
})();
