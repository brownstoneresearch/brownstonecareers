(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed with status ${response.status}`);
    return data;
  }

  function render(data) {
    const health = data.health || {};
    ["enabled", "queued", "failed", "stalled"].forEach((key) => {
      const node = $(`[data-auto-metric="${key}"]`);
      if (!node) return;
      if (key === "enabled") node.textContent = String(health.rules?.enabled || 0);
      if (key === "queued") node.textContent = String(health.runs?.queued || 0);
      if (key === "failed") node.textContent = String(health.runs?.failed || 0);
      if (key === "stalled") node.textContent = String(health.stalledCandidates || 0);
    });

    const rules = $("[data-autopilot-rules]");
    if (rules) {
      rules.innerHTML = (data.rules || []).map((rule) => `
        <article class="automation-rule">
          <div>
            <span>${escapeHtml(rule.trigger_type)}</span>
            <strong>${escapeHtml(rule.name)}</strong>
            <p>${escapeHtml(rule.description || "")}</p>
          </div>
          <label class="switch-row">
            <input type="checkbox" data-rule-toggle="${escapeHtml(rule.id)}" ${rule.enabled ? "checked" : ""}>
            <span>${rule.enabled ? "Active" : "Paused"}</span>
          </label>
        </article>`).join("") || '<div class="empty-state">No automation rules configured.</div>';
    }

    const runs = $("[data-autopilot-runs]");
    if (runs) {
      runs.innerHTML = (data.runs || []).slice(0, 20).map((run) => `
        <tr>
          <td>${escapeHtml(run.rule_name || "Automation")}</td>
          <td>${escapeHtml(`${run.first_name || ""} ${run.last_name || ""}`.trim() || "System")}</td>
          <td><span class="status-pill ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></td>
          <td>${new Date(run.created_at).toLocaleString()}</td>
        </tr>`).join("") || '<tr><td colspan="4"><div class="empty-state">No automation runs yet.</div></td></tr>';
    }

    $$('[data-rule-toggle]').forEach((input) => {
      input.onchange = async () => {
        input.disabled = true;
        try {
          await api("/api/admin/autopilot", {
            method: "POST",
            body: JSON.stringify({ action: "toggle", ruleId: input.dataset.ruleToggle, enabled: input.checked }),
          });
          await load();
        } catch (error) {
          input.checked = !input.checked;
          const status = $("[data-autopilot-status]");
          if (status) status.textContent = error.message;
        } finally {
          input.disabled = false;
        }
      };
    });
  }

  async function load() {
    const status = $("[data-autopilot-status]");
    try {
      const data = await api("/api/admin/autopilot");
      render(data);
      if (status) status.textContent = `Operational health checked ${new Date(data.health.checkedAt).toLocaleTimeString()}.`;
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const runButton = $("[data-run-autopilot]");
    runButton?.addEventListener("click", async () => {
      const status = $("[data-autopilot-status]");
      runButton.disabled = true;
      if (status) status.textContent = "Running workflow discovery, reminders, alerts, and ranking refresh…";
      try {
        const data = await api("/api/admin/autopilot", {
          method: "POST",
          body: JSON.stringify({ action: "run" }),
        });
        if (status) status.textContent = `Completed ${data.completed} automation actions; ${data.failed} need attention.`;
        await load();
      } catch (error) {
        if (status) status.textContent = error.message;
      } finally {
        runButton.disabled = false;
      }
    });

    load();
    window.setInterval(load, 60000);
  });
})();
