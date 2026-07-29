(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let workflow = { configured: false, tasks: [], summary: { total: 0, done: 0, progress: 0 }, journeyStart: { required: false, satisfied: true } };
  let activeTask = null;
  let conversationId = sessionStorage.getItem("bcGuideConversation") || "";

  function escapeHtml(value = "") {
    return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function formatDate(value) {
    if (!value) return "No due date";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function statusLabel(value = "") {
    return String(value).replaceAll("_", " ");
  }

  function toast(message) {
    const element = $("[data-toast]");
    if (!element) return;
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.href = "/onboarding_portal/";
      throw new Error("Your candidate session expired.");
    }
    if (!response.ok) throw new Error(data.message || "The request could not be completed.");
    return data;
  }

  function counts() {
    const result = { assigned: 0, submitted: 0, approved: 0, corrections: 0 };
    for (const task of workflow.tasks || []) {
      if (["approved", "completed", "waived"].includes(task.status)) result.approved += 1;
      else if (task.status === "submitted") result.submitted += 1;
      else if (task.status === "correction_required") result.corrections += 1;
      else result.assigned += 1;
    }
    return result;
  }

  function renderWorkflow() {
    const container = $("[data-workflow-tasks]");
    if (!container) return;
    const summary = counts();
    Object.entries(summary).forEach(([key, value]) => {
      const target = $(`[data-workflow-count="${key}"]`);
      if (target) target.textContent = value;
    });

    if (!workflow.configured) {
      container.innerHTML = `<div class="workflow-empty"><span>⚙</span><h2>Task workflow awaiting activation</h2><p>An administrator must apply the workforce workflow migration before assigned submissions can be synchronized.</p></div>`;
      return;
    }
    if (!workflow.tasks.length) {
      container.innerHTML = `<div class="workflow-empty"><span>✓</span><h2>No assigned requirements</h2><p>Your administrator has not assigned any additional submission tasks yet.</p></div>`;
      return;
    }

    const journeyBanner = workflow.journeyStart?.required && !workflow.journeyStart?.satisfied
      ? `<div class="application-first-banner"><span>01</span><div><strong>Your journey begins with the confidential application</strong><p>Complete and submit the application before the remaining onboarding tasks unlock.</p></div><button type="button" data-open-journey-start>Begin application</button></div>`
      : "";

    container.innerHTML = journeyBanner + workflow.tasks.map((task) => {
      const complete = ["approved", "completed", "waived"].includes(task.status);
      const pending = task.status === "submitted";
      const correction = task.status === "correction_required";
      const locked = Boolean(task.locked);
      const action = locked ? "Application required" : complete ? "Review" : pending ? "Awaiting review" : correction ? "Update submission" : task.status === "in_progress" ? "Continue" : "Start";
      const requirements = [
        task.requires_submission ? "Form" : null,
        task.requires_signature ? "Signature" : null,
        task.requires_admin_review ? "Admin review" : "Auto-complete",
      ].filter(Boolean);
      return `<article class="workflow-task-card ${escapeHtml(task.status)}${locked ? " locked" : ""}">
        <div class="workflow-task-check">${complete ? "✓" : pending ? "…" : correction ? "!" : ""}</div>
        <div class="workflow-task-copy">
          <div class="workflow-task-meta"><span>${escapeHtml(task.category || "Onboarding")}</span><b>${escapeHtml(statusLabel(task.status))}</b></div>
          <h2>${escapeHtml(task.title)}</h2>
          <p>${escapeHtml(task.description)}</p>
          <div class="workflow-requirements">${requirements.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}<span>Due ${escapeHtml(formatDate(task.due_at))}</span></div>
          ${task.admin_feedback ? `<div class="workflow-feedback"><strong>Administrator feedback</strong><p>${escapeHtml(task.admin_feedback)}</p></div>` : ""}
          ${task.submission?.reviewer_feedback ? `<div class="workflow-feedback"><strong>Review note</strong><p>${escapeHtml(task.submission.reviewer_feedback)}</p></div>` : ""}
          ${locked ? `<div class="workflow-lock-note">${escapeHtml(task.lock_reason || "Complete the confidential application first.")}</div>` : ""}
        </div>
        <button class="${pending || locked ? "workflow-pending-button" : "primary-action"}" type="button" data-workflow-open="${escapeHtml(task.candidate_task_id)}" ${pending || locked ? "disabled" : ""}>${escapeHtml(action)}</button>
      </article>`;
    }).join("");

    $$('[data-workflow-open]').forEach((button) => button.addEventListener("click", () => openTask(button.dataset.workflowOpen)));
    $("[data-open-journey-start]")?.addEventListener("click", () => openJourneyStart());
  }

  function openJourneyStart({ automatic = false } = {}) {
    const start = workflow.journeyStart;
    if (!start?.candidateTaskId || start.satisfied) return;
    const submissionsButton = $('[data-view-target="submissions"]');
    submissionsButton?.click();
    const storageKey = `bcApplicationStart:${start.candidateTaskId}`;
    if (automatic && sessionStorage.getItem(storageKey) === "opened") return;
    if (automatic) sessionStorage.setItem(storageKey, "opened");
    window.setTimeout(() => openTask(start.candidateTaskId), automatic ? 250 : 40);
  }

  async function loadWorkflow({ quiet = false } = {}) {
    try {
      workflow = await request("/api/portal/workflow");
      renderWorkflow();
      const requestedView = location.hash.replace("#", "");
      if (workflow.journeyStart?.required && !workflow.journeyStart?.satisfied && (!requestedView || ["dashboard", "submissions"].includes(requestedView))) {
        openJourneyStart({ automatic: true });
      }
      if (!quiet) toast("Task status refreshed.");
    } catch (error) {
      if (!quiet) toast(error.message);
      const container = $("[data-workflow-tasks]");
      if (container) container.innerHTML = `<div class="workflow-empty error"><span>!</span><h2>Workflow unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function fieldMarkup(field) {
    const required = field.required ? "required" : "";
    if (field.type === "checkbox") {
      return `<label class="workflow-checkbox"><input type="checkbox" name="${escapeHtml(field.name)}" ${required}><span>${escapeHtml(field.label)}</span></label>`;
    }
    if (field.type === "select") {
      return `<label>${escapeHtml(field.label)}<select name="${escapeHtml(field.name)}" ${required}>${(field.options || []).map((option) => `<option>${escapeHtml(option)}</option>`).join("")}</select></label>`;
    }
    if (field.type === "textarea") {
      return `<label>${escapeHtml(field.label)}<textarea name="${escapeHtml(field.name)}" rows="5" ${required}></textarea></label>`;
    }
    if (field.type === "file") {
      const accept = field.accept ? ` accept="${escapeHtml(field.accept)}"` : "";
      const help = field.help ? `<small>${escapeHtml(field.help)}</small>` : "";
      return `<label class="workflow-file-field">${escapeHtml(field.label)}<input name="${escapeHtml(field.name)}" type="file"${accept} ${required}>${help}</label>`;
    }
    const inputType = ["date", "email", "tel", "number"].includes(field.type) ? field.type : "text";
    return `<label>${escapeHtml(field.label)}<input name="${escapeHtml(field.name)}" type="${inputType}" ${required}></label>`;
  }

  async function openTask(id) {
    activeTask = workflow.tasks.find((task) => task.candidate_task_id === id);
    if (!activeTask) return;
    if (activeTask.locked) {
      toast(activeTask.lock_reason || "Complete the confidential candidate application first.");
      return;
    }
    if (!["in_progress", "correction_required"].includes(activeTask.status)) {
      try {
        await request("/api/portal/workflow", { method: "POST", body: JSON.stringify({ action: "start", candidateTaskId: id }) });
        activeTask.status = "in_progress";
      } catch {}
    }
    const modal = $("#workflowSubmissionModal");
    $("[data-workflow-title]").textContent = activeTask.title;
    $("[data-workflow-category]").textContent = activeTask.category || "Onboarding task";
    $("[data-workflow-instructions]").textContent = activeTask.instructions || activeTask.description;
    const schema = activeTask.formSchema || { fields: [] };
    $("[data-workflow-fields]").innerHTML = (schema.fields || []).map(fieldMarkup).join("") || `<label>Submission notes<textarea name="notes" rows="5" placeholder="Provide the requested information."></textarea></label>`;
    $("[data-workflow-attestation]").textContent = schema.attestation || "I confirm that this submission is accurate.";
    $("[data-workflow-attestation-wrap]").hidden = !schema.attestation && !activeTask.requires_signature;
    $("[data-workflow-signature-wrap]").hidden = !activeTask.requires_signature;
    const result = $("[data-workflow-result]");
    result.textContent = "";
    result.className = "workflow-form-result";
    modal.showModal();
  }

  async function submitWorkflow(event) {
    event.preventDefault();
    if (!activeTask) return;
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const result = $("[data-workflow-result]");
    const formData = new FormData(form);
    const responses = {};
    const fileFields = [];
    for (const field of activeTask.formSchema?.fields || []) {
      if (field.type === "file") {
        fileFields.push(field);
        continue;
      }
      responses[field.name] = field.type === "checkbox" ? formData.get(field.name) === "on" : String(formData.get(field.name) || "").trim();
    }
    if (!Object.keys(responses).length && !fileFields.length) responses.notes = String(formData.get("notes") || "").trim();
    submit.disabled = true;
    result.textContent = fileFields.length ? "Encrypting the submission and transferring files to private storage…" : "Submitting to the Brownstone workforce review queue…";
    try {
      let body;
      if (fileFields.length) {
        body = new FormData();
        body.set("action", "submit");
        body.set("candidateTaskId", activeTask.candidate_task_id);
        body.set("responses", JSON.stringify(responses));
        body.set("signed", formData.get("signed") === "yes" ? "yes" : "no");
        body.set("signatureName", String(formData.get("signatureName") || "").trim());
        for (const field of fileFields) {
          const file = formData.get(field.name);
          if (file && typeof file === "object" && Number(file.size) > 0) body.set(field.name, file);
        }
      } else {
        body = JSON.stringify({
          action: "submit",
          candidateTaskId: activeTask.candidate_task_id,
          responses,
          signed: formData.get("signed") === "yes",
          signatureName: String(formData.get("signatureName") || "").trim(),
        });
      }
      const data = await request("/api/portal/workflow", { method: "POST", body });
      result.className = "workflow-form-result success";
      result.textContent = data.status === "completed" ? "Submission completed and recorded." : "Submission received and sent to an administrator for review.";
      setTimeout(() => {
        $("#workflowSubmissionModal").close();
        form.reset();
        loadWorkflow({ quiet: true });
      }, 900);
    } catch (error) {
      result.className = "workflow-form-result error";
      result.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  function addGuideMessage(text, type = "bot", options = {}) {
    const messages = $("[data-guide-messages]");
    if (!messages) return null;
    const wrapper = document.createElement("div");
    wrapper.className = `guide-message ${type}${options.typing ? " typing" : ""}`;
    if (options.typing) wrapper.innerHTML = "<i></i><i></i><i></i>";
    else wrapper.textContent = text;
    messages.append(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function containsSensitive(text) {
    return /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/.test(text) || /\b(?:password|passcode|pin)\s*[:=]/i.test(text) || /\b(?:\d[ -]*?){13,19}\b/.test(text);
  }

  async function askGuide(text, forceEscalation = false) {
    const value = String(text || "").trim();
    if (!value) return;
    addGuideMessage(value, "user");
    const status = $("[data-guide-status]");
    status.textContent = "Thinking…";
    const typing = addGuideMessage("", "bot", { typing: true });
    try {
      const message = forceEscalation ? `I need human support. ${value}` : value;
      if (containsSensitive(message)) {
        typing.remove();
        addGuideMessage("For your protection, please remove sensitive identity or financial information. Use the Secure Identity Center only when authorized.");
        status.textContent = "Sensitive input blocked";
        return;
      }
      const data = await request("/api/portal/assistant", {
        method: "POST",
        body: JSON.stringify({ message, conversationId, view: location.hash.replace("#", "") || "dashboard" }),
      });
      typing.remove();
      conversationId = data.conversationId || conversationId;
      if (conversationId) sessionStorage.setItem("bcGuideConversation", conversationId);
      const bot = addGuideMessage(data.reply || "Your question has been recorded for support.");
      if (data.escalated) {
        const badge = document.createElement("small");
        badge.className = "guide-escalated";
        badge.textContent = "Human follow-up requested";
        bot.append(badge);
      }
      status.textContent = data.escalated ? "Escalated to support" : data.aiConfigured ? "AI response · Ready" : "Guided support · Ready";
    } catch (error) {
      typing.remove();
      addGuideMessage(`I couldn’t complete that request just now. ${error.message} You can request human follow-up below.`);
      status.textContent = "Support connection interrupted";
    }
  }

  function setupGuideAutomation() {
    const form = $("[data-guide-form]");
    if (!form) return;
    form.onsubmit = (event) => {
      event.preventDefault();
      const input = $("#guideInput");
      askGuide(input.value);
      input.value = "";
    };
    $$('[data-guide-question]').forEach((button) => {
      button.onclick = () => askGuide(button.textContent, button.dataset.guideQuestion === "support");
    });
    $("[data-guide-escalate]")?.addEventListener("click", () => askGuide("Please have a Brownstone representative review my current question and portal status.", true));
  }

  function setupWorkflow() {
    $("[data-workflow-refresh]")?.addEventListener("click", () => loadWorkflow());
    $$('[data-workflow-close]').forEach((button) => button.addEventListener("click", () => $("#workflowSubmissionModal").close()));
    $("[data-workflow-form]")?.addEventListener("submit", submitWorkflow);
    loadWorkflow({ quiet: true });
    setInterval(() => loadWorkflow({ quiet: true }), 45000);
  }

  window.addEventListener("DOMContentLoaded", () => {
    setupWorkflow();
    setupGuideAutomation();
  });
})();
