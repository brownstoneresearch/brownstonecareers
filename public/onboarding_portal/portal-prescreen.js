(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  let detail = null;

  function formatDate(value) {
    if (!value) return "No deadline recorded";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  async function api(options = {}) {
    const response = await fetch("/api/portal/prescreen", {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed with status ${response.status}.`);
    return data;
  }

  function resultCard(assignment) {
    const result = assignment.result;
    const status = String(result?.status || "pending").replaceAll("_", " ");
    return `<div class="prescreen-reviewed-result ${escapeHtml(result?.status || "pending")}">
      <span>HUMAN-REVIEWED RESULT</span>
      <div class="prescreen-score-ring"><strong>${Number(result?.score || 0).toFixed(1)}</strong><small>/ 100</small></div>
      <h2>${escapeHtml(status)}</h2>
      <p>${escapeHtml(result?.feedback || "Your administrator has released the result.")}</p>
      <small>Reviewed ${escapeHtml(formatDate(assignment.reviewedAt))}</small>
    </div>`;
  }

  function questionField(question, index) {
    const name = `question-${question.id}`;
    const required = question.required ? " required" : "";
    const value = typeof question.answer === "string" ? question.answer : "";
    const label = `<span>${index + 1}. ${escapeHtml(question.prompt)}${question.required ? " *" : ""}</span><small>Up to ${Number(question.max_points || 0)} points</small>`;
    if (["select", "yes_no", "single_choice"].includes(question.question_type)) {
      const options = question.question_type === "yes_no" ? ["Yes", "No"] : question.options || [];
      return `<label class="prescreen-question">${label}<select name="${escapeHtml(name)}" data-question-id="${escapeHtml(question.id)}"${required}><option value="">Select an answer</option>${options.map((option) => `<option value="${escapeHtml(option)}"${value === option ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
    }
    if (["text", "short_text"].includes(question.question_type)) {
      return `<label class="prescreen-question">${label}<input name="${escapeHtml(name)}" data-question-id="${escapeHtml(question.id)}" value="${escapeHtml(value)}" maxlength="1000"${required}></label>`;
    }
    return `<label class="prescreen-question">${label}<textarea name="${escapeHtml(name)}" data-question-id="${escapeHtml(question.id)}" rows="6" maxlength="8000"${required}>${escapeHtml(value)}</textarea></label>`;
  }

  function collectAnswers() {
    const answers = {};
    document.querySelectorAll("[data-prescreen-form] [data-question-id]").forEach((field) => { answers[field.dataset.questionId] = field.value.trim(); });
    return answers;
  }

  async function load() {
    const status = $("[data-prescreen-status]");
    const form = $("[data-prescreen-form]");
    if (!status || !form) return;
    status.innerHTML = '<div class="workflow-loading">Checking for an assigned pre-screening…</div>';
    form.hidden = true;
    try {
      detail = await api();
      if (!detail.assigned) {
        status.innerHTML = `<div class="empty-state"><strong>No pre-screening assigned</strong><p>${escapeHtml(detail.message || "Your administrator will notify you when questions are ready.")}</p></div>`;
        return;
      }
      const assignment = detail.assignment;
      if (assignment.status === "reviewed") {
        status.innerHTML = resultCard(assignment);
        return;
      }
      if (["submitted", "ai_scored"].includes(assignment.status)) {
        status.innerHTML = `<div class="prescreen-waiting"><span>AWAITING HUMAN REVIEW</span><h2>Your answers were submitted successfully.</h2><p>An administrator may use AI to prepare an advisory rubric-based draft, but only the administrator can finalize and release your result.</p><small>Submitted ${escapeHtml(formatDate(assignment.submittedAt))}</small></div>`;
        return;
      }
      status.innerHTML = `<div class="prescreen-assigned"><span>${escapeHtml(String(assignment.status).replaceAll("_", " "))}</span><h2>${escapeHtml(assignment.title)}</h2><p>${escapeHtml(assignment.description || "Complete every required question.")}</p></div>`;
      $("[data-prescreen-title]").textContent = assignment.title;
      $("[data-prescreen-instructions]").textContent = assignment.instructions || "Answer each question clearly and truthfully.";
      $("[data-prescreen-deadline]").textContent = `Due ${formatDate(assignment.dueAt)}`;
      $("[data-prescreen-questions]").innerHTML = (detail.questions || []).map(questionField).join("");
      form.hidden = false;
      if (assignment.status === "assigned") await api({ method: "POST", body: JSON.stringify({ action: "start" }) });
    } catch (error) {
      status.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function save(action) {
    const result = $("[data-prescreen-result]");
    result.textContent = action === "submit" ? "Submitting your answers for administrator review…" : "Saving progress…";
    try {
      const response = await api({ method: "POST", body: JSON.stringify({ action, answers: collectAnswers() }) });
      result.textContent = response.message || (action === "submit" ? "Submitted successfully." : "Progress saved.");
      if (action === "submit") await load();
    } catch (error) { result.textContent = error.message; }
  }

  function setup() {
    $("[data-prescreen-form]")?.addEventListener("submit", (event) => { event.preventDefault(); save("submit"); });
    $("[data-prescreen-save]")?.addEventListener("click", () => save("save"));
    document.querySelector('[data-view-target="pre-screening"]')?.addEventListener("click", load);
    if (location.hash === "#pre-screening") load(); else load();
  }
  window.addEventListener("DOMContentLoaded", setup);
})();
