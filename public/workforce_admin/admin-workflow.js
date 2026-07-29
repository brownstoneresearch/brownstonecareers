(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let submissions = [];
  let catalog = [];
  let candidates = [];
  let selectedSubmission = null;
  let selectedConversation = null;

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
  function statusLabel(value = "") { return String(value).replaceAll("_", " "); }
  function formatDate(value) {
    if (!value) return "Not available";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }
  function toast(message) {
    const element = $("[data-admin-toast]");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 3000);
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) location.href = "/workforce_admin/";
    if (!response.ok) throw new Error(data.message || "The workforce request failed.");
    return data;
  }

  async function loadWorkflowSummary() {
    try {
      const data = await api("/api/admin/workflow?mode=summary");
      const metrics = {
        pendingSubmissions: data.pendingSubmissions,
        openSupport: data.openSupport,
      };
      Object.entries(metrics).forEach(([key, value]) => {
        const target = $(`[data-metric="${key}"]`);
        if (target) target.textContent = value;
      });
      const mapped = { pending: data.pendingSubmissions, corrections: data.correctionsRequired, overdue: data.overdueTasks };
      Object.entries(mapped).forEach(([key, value]) => {
        const target = $(`[data-workflow-admin-count="${key}"]`);
        if (target) target.textContent = value;
      });
    } catch (error) {
      toast(error.message);
    }
  }

  async function loadSubmissions() {
    const filter = $("[data-submission-filter]")?.value || "all";
    const container = $("[data-submission-list]");
    try {
      const data = await api(`/api/admin/workflow?mode=submissions&status=${encodeURIComponent(filter)}`);
      submissions = data.submissions || [];
      if (!submissions.length) {
        container.innerHTML = '<div class="empty-state">No submissions match this review queue.</div>';
        return;
      }
      container.innerHTML = submissions.map((item) => {
        const name = `${item.first_name || ""} ${item.last_name || ""}`.trim() || "Candidate";
        return `<article class="submission-review-row ${escapeHtml(item.status)}">
          <div><span>${escapeHtml(statusLabel(item.category))}</span><h3>${escapeHtml(item.task_title)}</h3><p>${escapeHtml(name)} · ${escapeHtml(item.role || "Role pending")}</p><small>${escapeHtml(formatDate(item.submitted_at))}${item.signature_name ? ` · Signed by ${escapeHtml(item.signature_name)}` : ""}</small></div>
          <span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
          <button class="secondary-button" type="button" data-review-submission="${escapeHtml(item.id)}">Review</button>
        </article>`;
      }).join("");
      $$('[data-review-submission]').forEach((button) => button.addEventListener("click", () => openReview(button.dataset.reviewSubmission)));
    } catch (error) {
      container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  function responseRows(response = {}) {
    const rows = Object.entries(response);
    if (!rows.length) return '<div class="empty-state">No written responses were included.</div>';
    return rows.map(([key, value]) => {
      if (value && typeof value === "object" && value.documentId) {
        return `<div class="review-answer"><span>${escapeHtml(statusLabel(key))}</span><p><a class="secure-document-link" href="/api/admin/document?id=${encodeURIComponent(value.documentId)}" target="_blank" rel="noopener">Download ${escapeHtml(value.filename || "private document")}</a><br><small>${escapeHtml(statusLabel(value.status || "submitted"))} · Private storage</small></p></div>`;
      }
      const displayed = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
      return `<div class="review-answer"><span>${escapeHtml(statusLabel(key))}</span><p>${escapeHtml(displayed)}</p></div>`;
    }).join("");
  }

  function openReview(id) {
    selectedSubmission = submissions.find((item) => item.id === id);
    if (!selectedSubmission) return;
    $("[data-review-title]").textContent = selectedSubmission.task_title;
    $("[data-review-detail]").innerHTML = `<div class="review-candidate"><strong>${escapeHtml(`${selectedSubmission.first_name} ${selectedSubmission.last_name}`)}</strong><span>${escapeHtml(selectedSubmission.email)} · ${escapeHtml(selectedSubmission.role || "Role pending")}</span><small>Submitted ${escapeHtml(formatDate(selectedSubmission.submitted_at))}</small></div>${responseRows(selectedSubmission.response)}${selectedSubmission.signature_name ? `<div class="review-signature"><span>Electronic signature</span><strong>${escapeHtml(selectedSubmission.signature_name)}</strong><small>${escapeHtml(formatDate(selectedSubmission.signature_at))}</small></div>` : ""}`;
    $("[data-submission-review-form]").elements.feedback.value = selectedSubmission.reviewer_feedback || "";
    $("[data-review-result]").textContent = "";
    $("#submissionReviewModal").showModal();
  }

  async function review(decision) {
    if (!selectedSubmission) return;
    const feedback = $("[data-submission-review-form]").elements.feedback.value.trim();
    const result = $("[data-review-result]");
    result.textContent = "Saving administrator decision…";
    try {
      await api("/api/admin/workflow", { method: "POST", body: JSON.stringify({ action: "review", submissionId: selectedSubmission.id, decision, feedback }) });
      result.textContent = `Submission marked ${statusLabel(decision)}.`;
      setTimeout(() => $("#submissionReviewModal").close(), 600);
      await Promise.all([loadSubmissions(), loadWorkflowSummary()]);
    } catch (error) {
      result.textContent = error.message;
    }
  }

  async function loadAssignmentData() {
    const [candidateData, taskData] = await Promise.all([
      api("/api/admin/candidates?status=all&limit=250"),
      api("/api/admin/workflow?mode=catalog"),
    ]);
    candidates = candidateData.candidates || [];
    catalog = taskData.tasks || [];
    $("[data-task-candidate-select]").innerHTML = '<option value="">Select candidate</option>' + candidates.map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(`${candidate.first_name} ${candidate.last_name}`)} — ${escapeHtml(candidate.role || candidate.email)}</option>`).join("");
    $("[data-task-catalog-select]").innerHTML = '<option value="">Select task</option>' + catalog.map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`).join("");
  }

  async function openAssignment(candidateId = "") {
    try {
      await loadAssignmentData();
      const date = new Date(Date.now() + 14 * 86400000);
      $("[data-task-assignment-form]").elements.dueAt.value = date.toISOString().slice(0, 10);
      if (candidateId) $("[data-task-assignment-form]").elements.candidateId.value = candidateId;
      $("[data-task-assignment-result]").textContent = "";
      $("#taskAssignmentModal").showModal();
    } catch (error) { toast(error.message); }
  }

  async function assignTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const result = $("[data-task-assignment-result]");
    result.textContent = "Assigning task and notifying candidate…";
    try {
      await api("/api/admin/workflow", { method: "POST", body: JSON.stringify({ action: "assign", ...values, dueAt: new Date(`${values.dueAt}T23:59:59Z`).toISOString() }) });
      result.textContent = "Task assigned successfully.";
      setTimeout(() => $("#taskAssignmentModal").close(), 600);
      await loadWorkflowSummary();
    } catch (error) { result.textContent = error.message; }
  }

  async function loadSupport() {
    const list = $("[data-support-list]");
    try {
      const data = await api("/api/admin/support");
      const conversations = data.conversations || [];
      if (!conversations.length) {
        list.innerHTML = '<div class="empty-state">No AI escalations or human support conversations yet.</div>';
        return;
      }
      list.innerHTML = conversations.map((item) => `<button type="button" class="support-conversation ${escapeHtml(item.status)}" data-support-id="${escapeHtml(item.id)}"><span>${escapeHtml(`${item.first_name} ${item.last_name}`)}</span><strong>${escapeHtml(statusLabel(item.topic || "general support"))}</strong><p>${escapeHtml((item.last_message || "No messages").slice(0, 150))}</p><small>${escapeHtml(statusLabel(item.status))} · ${escapeHtml(formatDate(item.last_message_at || item.updated_at))}</small></button>`).join("");
      $$('[data-support-id]').forEach((button) => button.addEventListener("click", () => openSupport(button.dataset.supportId)));
    } catch (error) { list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }

  async function openSupport(id) {
    const panel = $("[data-support-transcript]");
    panel.innerHTML = '<div class="empty-state">Loading conversation…</div>';
    try {
      const data = await api(`/api/admin/support?id=${encodeURIComponent(id)}`);
      selectedConversation = data.conversation;
      const messages = data.messages || [];
      panel.innerHTML = `<div class="support-header"><div><span>${escapeHtml(statusLabel(selectedConversation.status))}</span><h2>${escapeHtml(`${selectedConversation.first_name} ${selectedConversation.last_name}`)}</h2><p>${escapeHtml(selectedConversation.email)} · ${escapeHtml(selectedConversation.role || "Role pending")}</p></div><button class="secondary-button" type="button" data-support-resolve>${selectedConversation.status === "resolved" ? "Reopen" : "Resolve"}</button></div><div class="support-messages">${messages.map((message) => `<div class="support-message ${escapeHtml(message.sender_type)}"><strong>${escapeHtml(message.sender_type === "assistant" ? "Brownstone Guide (AI)" : message.sender_type === "admin" ? "Brownstone administrator" : "Candidate")}</strong><p>${escapeHtml(message.message)}</p><small>${escapeHtml(formatDate(message.created_at))}</small></div>`).join("")}</div><form class="support-reply" data-support-reply><textarea name="message" rows="4" placeholder="Send a human support response…" required></textarea><button class="primary-button" type="submit">Reply to candidate</button></form>`;
      $("[data-support-resolve]").onclick = async () => {
        const action = selectedConversation.status === "resolved" ? "reopen" : "resolve";
        await api("/api/admin/support", { method: "POST", body: JSON.stringify({ action, conversationId: id }) });
        await Promise.all([openSupport(id), loadSupport(), loadWorkflowSummary()]);
      };
      $("[data-support-reply]").onsubmit = async (event) => {
        event.preventDefault();
        const message = event.currentTarget.elements.message.value.trim();
        if (!message) return;
        await api("/api/admin/support", { method: "POST", body: JSON.stringify({ action: "reply", conversationId: id, message }) });
        await openSupport(id);
        await loadSupport();
      };
    } catch (error) { panel.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; }
  }

  function setup() {
    $$('[data-admin-view]').forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.adminView === "submissions") loadSubmissions();
      if (button.dataset.adminView === "support") loadSupport();
    }));
    $("[data-refresh-submissions]")?.addEventListener("click", loadSubmissions);
    $("[data-submission-filter]")?.addEventListener("change", loadSubmissions);
    $("[data-open-task-assignment]")?.addEventListener("click", () => openAssignment());
    window.addEventListener("brownstone:assign-task", (event) => openAssignment(event.detail?.candidateId || ""));
    $$('[data-close-task-modal]').forEach((button) => button.addEventListener("click", () => $("#taskAssignmentModal").close()));
    $("[data-task-assignment-form]")?.addEventListener("submit", assignTask);
    $$('[data-close-review-modal]').forEach((button) => button.addEventListener("click", () => $("#submissionReviewModal").close()));
    $$('[data-review-decision]').forEach((button) => button.addEventListener("click", () => review(button.dataset.reviewDecision)));
    loadWorkflowSummary();
    setInterval(loadWorkflowSummary, 45000);
  }

  window.addEventListener("DOMContentLoaded", setup);
})();
