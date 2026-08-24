/**
 * UPI Guardian - Settings page logic.
 * Profile + password live on Supabase Auth / profiles table.
 * Notification prefs and the trusted-person threshold live in
 * profiles.settings (jsonb). Trusted contacts are their own table.
 */
(function () {
  let currentUser = null;
  let settings = {};

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("profileForm").addEventListener("submit", saveProfile);
    document.getElementById("passwordForm").addEventListener("submit", savePassword);
    document.getElementById("contactForm").addEventListener("submit", addContact);
    ["prefLargeAlerts", "prefNewReceiver", "prefWeeklySummary", "prefTrustedRequired"].forEach((id) => {
      document.getElementById(id).addEventListener("change", savePrefs);
    });
    document.getElementById("trustedThreshold").addEventListener("change", savePrefs);
  });

  document.addEventListener("upi-guardian:ready", async (e) => {
    currentUser = e.detail && e.detail.user;
    if (!currentUser) return;
    document.getElementById("settingsMobile").value = (currentUser.user_metadata && currentUser.user_metadata.mobile) || "";
    await loadProfile();
    await loadContacts();
  });

  async function loadProfile() {
    try {
      const { data, error } = await window.supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
      if (error) throw error;
      const fullName = (data && data.full_name) || (currentUser.user_metadata && currentUser.user_metadata.full_name) || "";
      document.getElementById("settingsFullName").value = fullName;
      settings = (data && data.settings) || {};
      document.getElementById("prefLargeAlerts").checked = settings.largeAlerts !== false;
      document.getElementById("prefNewReceiver").checked = settings.newReceiverAlerts !== false;
      document.getElementById("prefWeeklySummary").checked = !!settings.weeklySummary;
      document.getElementById("prefTrustedRequired").checked = !!settings.trustedRequired;
      document.getElementById("trustedThreshold").value = settings.trustedThreshold || 20000;
    } catch (err) {
      console.warn("[Settings] couldn't load profile:", err.message || err);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const fullName = document.getElementById("settingsFullName").value.trim();
    if (!fullName) { window.UIKit.toast("Enter your name.", "error"); return; }
    try {
      const { error } = await window.supabaseClient.from("profiles").upsert({ id: currentUser.id, full_name: fullName });
      if (error) throw error;
      await window.supabaseClient.auth.updateUser({ data: { full_name: fullName } });
      window.UIKit.toast("Profile updated.", "success");
    } catch (err) {
      window.UIKit.toast("Couldn't save profile: " + (err.message || "unknown error"), "error");
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    const pw = document.getElementById("newPassword").value;
    const cpw = document.getElementById("confirmNewPassword").value;
    if (pw.length < 6) { window.UIKit.toast("Password must be at least 6 characters.", "error"); return; }
    if (pw !== cpw) { window.UIKit.toast("Passwords don't match.", "error"); return; }
    try {
      const { error } = await window.supabaseClient.auth.updateUser({ password: pw });
      if (error) throw error;
      window.UIKit.toast("Password updated.", "success");
      document.getElementById("passwordForm").reset();
    } catch (err) {
      window.UIKit.toast("Couldn't update password: " + (err.message || "unknown error"), "error");
    }
  }

  async function savePrefs() {
    settings = {
      largeAlerts: document.getElementById("prefLargeAlerts").checked,
      newReceiverAlerts: document.getElementById("prefNewReceiver").checked,
      weeklySummary: document.getElementById("prefWeeklySummary").checked,
      trustedRequired: document.getElementById("prefTrustedRequired").checked,
      trustedThreshold: Number(document.getElementById("trustedThreshold").value) || 0,
    };
    try {
      const { error } = await window.supabaseClient.from("profiles").upsert({ id: currentUser.id, settings });
      if (error) throw error;
      window.UIKit.toast("Preferences saved.", "success", 1800);
    } catch (err) {
      window.UIKit.toast("Couldn't save preferences: " + (err.message || "unknown error"), "error");
    }
  }

  async function loadContacts() {
    const list = document.getElementById("contactsList");
    try {
      const { data, error } = await window.supabaseClient.from("trusted_contacts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      renderContacts(data || []);
    } catch (err) {
      list.innerHTML = `<div class="state-block"><i class="fa-solid fa-triangle-exclamation"></i><p>Couldn't load trusted contacts (${escapeHtml(err.message || "unknown error")}). Run the latest schema.sql if this table doesn't exist yet.</p></div>`;
    }
  }

  function renderContacts(contacts) {
    const list = document.getElementById("contactsList");
    if (!contacts.length) {
      list.innerHTML = `<div class="state-block" style="padding:20px;"><i class="fa-solid fa-user-shield"></i><p>No trusted contacts yet.</p></div>`;
      return;
    }
    list.innerHTML = contacts.map((c) => `
      <div class="data-row" data-id="${c.id}" style="grid-template-columns:1fr auto;">
        <div class="who"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.upi_id || c.mobile || "")}</small></div>
        <button class="btn btn-ghost btn-sm remove-contact-btn"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    list.querySelectorAll(".remove-contact-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => removeContact(e.target.closest(".data-row").dataset.id));
    });
  }

  async function addContact(e) {
    e.preventDefault();
    const name = document.getElementById("contactName").value.trim();
    const handle = document.getElementById("contactHandle").value.trim();
    if (!name || !handle) return;
    const isUpi = handle.includes("@");
    try {
      const { error } = await window.supabaseClient.from("trusted_contacts").insert({
        user_id: currentUser.id, name, upi_id: isUpi ? handle : null, mobile: isUpi ? null : handle,
      });
      if (error) throw error;
      document.getElementById("contactForm").reset();
      window.UIKit.toast("Trusted contact added.", "success");
      loadContacts();
    } catch (err) {
      window.UIKit.toast("Couldn't add contact: " + (err.message || "unknown error"), "error");
    }
  }

  async function removeContact(id) {
    try {
      const { error } = await window.supabaseClient.from("trusted_contacts").delete().eq("id", id);
      if (error) throw error;
      loadContacts();
    } catch (err) {
      window.UIKit.toast("Couldn't remove contact: " + (err.message || "unknown error"), "error");
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();
